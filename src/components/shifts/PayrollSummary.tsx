import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ChevronDown, Pencil, ExternalLink, AlertTriangle, CheckCircle, Link2, X, Trash2, DollarSign, Building2, Search, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Shift } from '@/hooks/useShifts';
import QBSettingsCard from './QBSettingsCard';
import QBCombobox from './QBCombobox';
import type { Tables } from '@/integrations/supabase/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
type ShiftRow = Tables<'shifts'>;
type ProfileRow = Tables<'profiles'>;
type ProjectRow = Tables<'projects'>;
type ShiftAllocationRow = Tables<'shift_task_allocations'>;
type TaskRow = Tables<'tasks'>;
type PayableBatchRow = Tables<'worker_payable_batches'>;
type PayableBatchShiftRow = Tables<'worker_payable_batch_shifts'>;

type ShiftWithComputed = {
  shift: ShiftRow;
  projectName: string;
  workerName: string;
  rateUsed: number;
  dollars: number;
  allocations: { task_name: string; hours: number }[];
};

type CandidateGroup = {
  key: string;
  worker_user_id: string;
  project_id: string;
  company_id: string | null;
  companyName: string;
  contractorName: string;
  projectName: string;
  periodStart: string;
  periodEnd: string;
  shifts: ShiftWithComputed[];
  totalHours: number;
  totalDollars: number;
};

type BillGroupPreview = {
  key: string;
  company_id: string;
  companyName: string;
  qb_vendor_id: string;
  qb_vendor_name: string;
  periodStart: string;
  periodEnd: string;
  lines: { contractorName: string; projectName: string; projectId: string; qbClassName: string | null; dollars: number }[];
  totalDollars: number;
};

type ExistingPayableGroup = {
  batch: PayableBatchRow;
  contractorName: string;
  projectName: string;
  shifts: ShiftWithComputed[];
  totalHours: number;
  totalDollars: number;
};

type ExcludedShift = {
  shift: ShiftWithComputed;
  reason: string;
  linkedBatchId?: string;
};

type QBConnectionDetail = {
  id: string;
  company_name?: string;
  realm_id?: string;
  connected_at?: string;
  token_healthy?: boolean;
  company_id?: string | null;
};

type QBConnectionStatus = {
  connected: boolean;
  company_name?: string;
  realm_id?: string;
  connected_at?: string;
  token_healthy?: boolean;
  connections?: QBConnectionDetail[];
};

interface PayrollSummaryProps {
  onEditShift: (shift: Pick<Shift, 'id'>) => void;
  billFirstMode?: boolean;
  workerFilter?: string;
}

// Generate biweekly pay periods (Monday → second Sunday)
// Anchor: a known Monday. We'll generate periods going back ~6 months and forward ~1 month.
function generatePayPeriods(): { label: string; from: string; to: string }[] {
  // Use 2026-01-05 as anchor Monday (adjust if needed — it's a Monday)
  const anchor = new Date('2026-01-05T00:00:00');
  const periods: { label: string; from: string; to: string }[] = [];
  const now = new Date();

  // Start 6 months back, go up to 1 month ahead
  const rangeStart = new Date(now);
  rangeStart.setMonth(rangeStart.getMonth() - 6);
  const rangeEnd = new Date(now);
  rangeEnd.setMonth(rangeEnd.getMonth() + 1);

  // Find first period start on or before rangeStart
  const anchorMs = anchor.getTime();
  const periodMs = 14 * 86400000;
  const diffMs = rangeStart.getTime() - anchorMs;
  const periodsBack = Math.floor(diffMs / periodMs);
  let cursor = new Date(anchorMs + periodsBack * periodMs);

  while (cursor.getTime() <= rangeEnd.getTime()) {
    const periodStart = new Date(cursor);
    const periodEnd = new Date(cursor.getTime() + 13 * 86400000); // 14 days inclusive
    const from = periodStart.toISOString().slice(0, 10);
    const to = periodEnd.toISOString().slice(0, 10);
    const fmtDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
    const label = `${fmtDate(periodStart)} – ${fmtDate(periodEnd)}`;
    periods.push({ label, from, to });
    cursor = new Date(cursor.getTime() + periodMs);
  }

  return periods.reverse(); // Most recent first
}

const PAY_PERIODS = generatePayPeriods();

function getCurrentPeriodKey(): string {
  const now = new Date();
  const nowStr = now.toISOString().slice(0, 10);
  // Find the period containing today, or the most recent past one
  for (const p of PAY_PERIODS) {
    if (p.from <= nowStr && p.to >= nowStr) return `${p.from}::${p.to}`;
  }
  // Fallback: most recent past period
  for (const p of PAY_PERIODS) {
    if (p.to < nowStr) return `${p.from}::${p.to}`;
  }
  return PAY_PERIODS.length > 0 ? `${PAY_PERIODS[0].from}::${PAY_PERIODS[0].to}` : '';
}

const PayrollSummary = ({ onEditShift, billFirstMode = false, workerFilter }: PayrollSummaryProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedPeriod, setSelectedPeriod] = useState(getCurrentPeriodKey);
  const fromDate = selectedPeriod.split('::')[0] || '';
  const toDate = selectedPeriod.split('::')[1] || '';
  const [loading, setLoading] = useState(false);
  const [creatingGroupKey, setCreatingGroupKey] = useState<string | null>(null);
  const [payingGroupKey, setPayingGroupKey] = useState<string | null>(null);
  const [updatingBatchId, setUpdatingBatchId] = useState<string | null>(null);
  const [voidingBatchId, setVoidingBatchId] = useState<string | null>(null);
  const [removingShiftId, setRemovingShiftId] = useState<string | null>(null);
  const [expandedCandidates, setExpandedCandidates] = useState<Set<string>>(new Set());
  const [expandedExisting, setExpandedExisting] = useState<Set<string>>(new Set());

  const [candidateGroups, setCandidateGroups] = useState<CandidateGroup[]>([]);
  const [exportedGroups, setExportedGroups] = useState<ExistingPayableGroup[]>([]);
  const [paidGroups, setPaidGroups] = useState<ExistingPayableGroup[]>([]);
  const [excludedShifts, setExcludedShifts] = useState<ExcludedShift[]>([]);
  const [billGroupPreviews, setBillGroupPreviews] = useState<BillGroupPreview[]>([]);

  // Company & vendor data for grouping preview and historical payments
  const [companies, setCompanies] = useState<{ id: string; name: string; short_name: string | null }[]>([]);
  const [projectCompanyMap, setProjectCompanyMap] = useState<Map<string, string>>(new Map());
  const [vendorMappings, setVendorMappings] = useState<Map<string, Map<string, { qb_vendor_id: string; qb_vendor_name: string }>>>(new Map());
  const [classMappings, setClassMappings] = useState<Map<string, string>>(new Map());

  // Historical payment section state
  const [histOpen, setHistOpen] = useState(false);
  // Search & Link mode
  const [searchCompanyId, setSearchCompanyId] = useState('');
  const [searchVendorId, setSearchVendorId] = useState('');
  const [searchFromDate, setSearchFromDate] = useState('');
  const [searchToDate, setSearchToDate] = useState('');
  const [searchMinAmount, setSearchMinAmount] = useState('');
  const [searchMaxAmount, setSearchMaxAmount] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ id: string; type: string; txn_date: string; amount: number; vendor_name: string | null; memo: string | null; doc_number: string | null }>>([]);
  const [selectedTxn, setSelectedTxn] = useState<{ id: string; type: string; txn_date: string; amount: number; vendor_name: string | null; memo: string | null; doc_number: string | null } | null>(null);
  const [allocations, setAllocations] = useState<Array<{ worker_user_id: string; amount: string; memo: string; project_id: string }>>([]);
  const [existingAllocations, setExistingAllocations] = useState<Array<{ worker_user_id: string; amount: number; memo: string | null; project_id: string | null }>>([]);
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkResult, setLinkResult] = useState<{ success: boolean; message: string } | null>(null);
  // Local-only mode
  const [localWorkerId, setLocalWorkerId] = useState('');
  const [localCompanyId, setLocalCompanyId] = useState('');
  const [localProjectId, setLocalProjectId] = useState('');
  const [localAmount, setLocalAmount] = useState('');
  const [localDate, setLocalDate] = useState('');
  const [localMemo, setLocalMemo] = useState('');
  const [localSaving, setLocalSaving] = useState(false);
  const [localResult, setLocalResult] = useState<{ success: boolean; message: string } | null>(null);
  // Profile list for worker pickers
  const [allProfiles, setAllProfiles] = useState<Array<{ id: string; full_name: string | null }>>([]);
  // Project list for project pickers
  const [allProjects, setAllProjects] = useState<Array<{ id: string; name: string }>>([]);

  // QuickBooks connection state
  const [qbStatus, setQbStatus] = useState<QBConnectionStatus | null>(null);
  const [qbStatusLoading, setQbStatusLoading] = useState(true);
  const [qbConnecting, setQbConnecting] = useState(false);
  const [exportingBatchIds, setExportingBatchIds] = useState<Set<string>>(new Set());

  // Handle QB callback URL params
  useEffect(() => {
    const qbParam = searchParams.get('qb');
    if (qbParam === 'connected') {
      toast({ title: 'QuickBooks connected', description: 'Your QuickBooks account has been linked.' });
      searchParams.delete('qb');
      setSearchParams(searchParams, { replace: true });
      fetchQBStatus();
    } else if (qbParam === 'error') {
      const msg = searchParams.get('msg') || 'Unknown error';
      toast({ title: 'QuickBooks connection failed', description: msg, variant: 'destructive' });
      searchParams.delete('qb');
      searchParams.delete('msg');
      setSearchParams(searchParams, { replace: true });
    }
  }, []); // Run once on mount

  const fetchQBStatus = useCallback(async () => {
    setQbStatusLoading(true);
    try {
      console.log('[PayrollSummary] Fetching QB connection status...');
      const { data, error } = await supabase.functions.invoke('quickbooks_connection_status');
      if (error) {
        console.error('[PayrollSummary] QB status fetch error:', error);
        setQbStatus(null);
      } else {
        console.log('[PayrollSummary] QB status response:', data);
        setQbStatus(data as QBConnectionStatus);
      }
    } catch (e) {
      console.error('[PayrollSummary] QB status exception:', e);
      setQbStatus(null);
    }
    setQbStatusLoading(false);
  }, []);

  useEffect(() => {
    fetchQBStatus();
  }, [fetchQBStatus]);

  const handleConnectQB = async (targetCompanyId?: string) => {
    // Use provided company ID, or fall back to first available
    const companyId = targetCompanyId || (companies.length > 0 ? companies[0].id : null);
    if (!companyId) {
      toast({ title: 'No company available', description: 'Add a company before connecting QuickBooks.', variant: 'destructive' });
      return;
    }
    setQbConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('quickbooks_connect_begin', {
        body: { company_id: companyId, return_to: '/payroll' },
      });
      if (error || !data?.auth_url) {
        toast({ title: 'Failed to start QuickBooks connection', description: error?.message || data?.message || 'No auth URL returned', variant: 'destructive' });
        setQbConnecting(false);
        return;
      }
      // Open Intuit OAuth in a new tab (iframe can't load accounts.intuit.com)
      window.open(data.auth_url, '_blank', 'noopener');
    } catch {
      toast({ title: 'Failed to start QuickBooks connection', variant: 'destructive' });
      setQbConnecting(false);
    }
  };

  const handleExportToQB = async (batchId: string) => {
    setExportingBatchIds((prev) => new Set(prev).add(batchId));
    try {
      const { data, error } = await supabase.functions.invoke('quickbooks_export_payables', {
        body: { batch_ids: [batchId] },
      });

      if (error) {
        toast({ title: 'Export failed', description: error.message, variant: 'destructive' });
      } else {
        const results = data?.results || [];
        for (const r of results) {
          if (r.success) {
            toast({ title: 'Exported to QuickBooks', description: `Bill created (ID: ${r.qb_bill_id})` });
          } else {
            toast({ title: 'Export failed', description: r.error || 'Unknown error', variant: 'destructive' });
          }
        }
        await loadPayroll();
      }
    } catch {
      toast({ title: 'Export failed', variant: 'destructive' });
    }
    setExportingBatchIds((prev) => {
      const next = new Set(prev);
      next.delete(batchId);
      return next;
    });
  };

  const getQBBillUrl = (batch: PayableBatchRow) => {
    const billId = batch.qb_bill_id;
    if (!billId || !qbStatus?.realm_id) return null;
    return `https://app.qbo.intuit.com/app/bill?txnId=${billId}`;
  };

  const toggleCandidate = (key: string) => {
    setExpandedCandidates((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleExisting = (key: string) => {
    setExpandedExisting((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const loadPayroll = useCallback(async () => {
    setLoading(true);

    const [{ data: shifts, error: shiftsError }, { data: profiles, error: profilesError }, { data: projects, error: projectsError }, { data: companiesData }, { data: vendorData }, { data: classData }] = await Promise.all([
      supabase
        .from('shifts')
        .select('*')
        .gte('shift_date', fromDate)
        .lte('shift_date', toDate)
        .order('shift_date', { ascending: false }),
      supabase.from('profiles').select('id, full_name, hourly_rate'),
      supabase.from('projects').select('id, name, company_id'),
      supabase.from('companies').select('id, name, short_name').order('name'),
      supabase.from('quickbooks_vendor_mappings').select('user_id, company_id, qb_vendor_id, qb_vendor_name'),
      supabase.from('quickbooks_class_mappings').select('project_id, qb_class_name'),
    ]);

    if (shiftsError || profilesError || projectsError) {
      setLoading(false);
      throw new Error(shiftsError?.message || profilesError?.message || projectsError?.message || 'Failed to load payroll data');
    }

    const comps = (companiesData || []) as { id: string; name: string; short_name: string | null }[];
    setCompanies(comps);
    const companyMap = new Map(comps.map(c => [c.id, c]));

    const projCompanyMap = new Map<string, string>();
    ((projects || []) as { id: string; name: string; company_id: string | null }[]).forEach(p => {
      if (p.company_id) projCompanyMap.set(p.id, p.company_id);
    });
    setProjectCompanyMap(projCompanyMap);

    // Build vendor mappings: company_id -> user_id -> mapping
    const vmMap = new Map<string, Map<string, { qb_vendor_id: string; qb_vendor_name: string }>>();
    ((vendorData || []) as { user_id: string; company_id: string | null; qb_vendor_id: string; qb_vendor_name: string | null }[]).forEach(v => {
      if (!v.company_id) return;
      if (!vmMap.has(v.company_id)) vmMap.set(v.company_id, new Map());
      vmMap.get(v.company_id)!.set(v.user_id, { qb_vendor_id: v.qb_vendor_id, qb_vendor_name: v.qb_vendor_name || '' });
    });
    setVendorMappings(vmMap);

    // Class mappings: project_id -> class_name
    const cmMap = new Map<string, string>();
    ((classData || []) as { project_id: string; qb_class_name: string | null }[]).forEach(c => {
      if (c.qb_class_name) cmMap.set(c.project_id, c.qb_class_name);
    });
    setClassMappings(cmMap);

    const shiftRows = shifts || [];
    const profileMap = new Map<string, Pick<ProfileRow, 'id' | 'full_name' | 'hourly_rate'>>((profiles || []).map((row) => [row.id, row]));
    const projectMap = new Map<string, string>((projects || []).map((row: Pick<ProjectRow, 'id' | 'name'>) => [row.id, row.name]));

    const shiftIds = shiftRows.map((row) => row.id);
    const [{ data: allocations }, { data: payableLinks }] = await Promise.all([
      shiftIds.length > 0
        ? supabase.from('shift_task_allocations').select('*').in('shift_id', shiftIds)
        : Promise.resolve({ data: [] as ShiftAllocationRow[], error: null }),
      shiftIds.length > 0
        ? supabase
            .from('worker_payable_batch_shifts')
            .select('id, shift_id, payable_batch_id, voided_at, worker_payable_batches!inner(id, status, period_start, period_end)')
            .in('shift_id', shiftIds)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);

    const taskIds = [...new Set(((allocations || []) as ShiftAllocationRow[]).map((row) => row.task_id))];
    const { data: tasks } = taskIds.length > 0
      ? await supabase.from('tasks').select('id, task').in('id', taskIds)
      : { data: [] as Pick<TaskRow, 'id' | 'task'>[] };

    const taskMap = new Map<string, string>((tasks || []).map((row: Pick<TaskRow, 'id' | 'task'>) => [row.id, row.task]));

    const allocationsByShift = new Map<string, { task_name: string; hours: number }[]>();
    ((allocations || []) as ShiftAllocationRow[]).forEach((row) => {
      if (!allocationsByShift.has(row.shift_id)) allocationsByShift.set(row.shift_id, []);
      allocationsByShift.get(row.shift_id)!.push({ task_name: taskMap.get(row.task_id) || 'Unknown task', hours: Number(row.hours) });
    });

    const computedShifts: ShiftWithComputed[] = shiftRows.map((row) => {
      const profile = profileMap.get(row.user_id);
      const rate = Number(row.hourly_rate_snapshot ?? profile?.hourly_rate ?? 0);
      const dollars = Number((Number(row.total_hours) * rate).toFixed(2));
      return {
        shift: row,
        projectName: projectMap.get(row.project_id) || 'Unknown project',
        workerName: profile?.full_name || 'Unknown worker',
        rateUsed: rate,
        dollars,
        allocations: allocationsByShift.get(row.id) || [],
      };
    });

    const activeLinkByShiftId = new Map<string, { batchId: string; status: PayableBatchRow['status']; periodStart: string; periodEnd: string }>();
    ((payableLinks || []) as Array<PayableBatchShiftRow & { worker_payable_batches: Pick<PayableBatchRow, 'id' | 'status' | 'period_start' | 'period_end'> }>).forEach((row) => {
      const batch = row.worker_payable_batches;
      if (!row.voided_at && batch && batch.status !== 'voided') {
        activeLinkByShiftId.set(row.shift_id, { batchId: batch.id, status: batch.status, periodStart: batch.period_start, periodEnd: batch.period_end });
      }
    });

    const excluded: ExcludedShift[] = [];
    const eligible: ShiftWithComputed[] = [];
    for (const shift of computedShifts) {
      const linked = activeLinkByShiftId.get(shift.shift.id);
      if (linked) {
        const statusLabel = linked.status === 'paid' ? 'paid' : linked.status === 'exported' ? 'sent to QuickBooks' : 'prepared';
        excluded.push({
          shift,
          reason: `Part of a ${statusLabel} payment (${linked.periodStart} → ${linked.periodEnd})`,
          linkedBatchId: linked.batchId,
        });
      } else {
        eligible.push(shift);
      }
    }

    const groupsMap = new Map<string, CandidateGroup>();
    for (const row of eligible) {
      const cid = projCompanyMap.get(row.shift.project_id) || null;
      const co = cid ? companyMap.get(cid) : null;
      const key = `${row.shift.user_id}::${row.shift.project_id}::${fromDate}::${toDate}`;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          key,
          worker_user_id: row.shift.user_id,
          project_id: row.shift.project_id,
          company_id: cid,
          companyName: co ? (co.short_name || co.name) : 'No company',
          contractorName: row.workerName,
          projectName: row.projectName,
          periodStart: fromDate,
          periodEnd: toDate,
          shifts: [],
          totalHours: 0,
          totalDollars: 0,
        });
      }
      const group = groupsMap.get(key)!;
      group.shifts.push(row);
      group.totalHours += Number(row.shift.total_hours);
      group.totalDollars += row.dollars;
    }

    // Build bill group previews (grouped by company + vendor + PROJECT + period)
    const billPreviews = new Map<string, BillGroupPreview>();
    for (const group of groupsMap.values()) {
      if (!group.company_id) continue;
      const vm = vmMap.get(group.company_id)?.get(group.worker_user_id);
      if (!vm) continue;
      const bKey = `${group.company_id}::${vm.qb_vendor_id}::${group.project_id}::${fromDate}::${toDate}`;
      if (!billPreviews.has(bKey)) {
        const co = companyMap.get(group.company_id);
        billPreviews.set(bKey, {
          key: bKey,
          company_id: group.company_id,
          companyName: co ? (co.short_name || co.name) : 'Unknown',
          qb_vendor_id: vm.qb_vendor_id,
          qb_vendor_name: vm.qb_vendor_name,
          periodStart: fromDate,
          periodEnd: toDate,
          lines: [],
          totalDollars: 0,
        });
      }
      const preview = billPreviews.get(bKey)!;
      preview.lines.push({
        contractorName: group.contractorName,
        projectName: group.projectName,
        projectId: group.project_id,
        qbClassName: cmMap.get(group.project_id) || null,
        dollars: group.totalDollars,
      });
      preview.totalDollars += group.totalDollars;
    }
    setBillGroupPreviews([...billPreviews.values()].sort((a, b) => a.companyName.localeCompare(b.companyName) || a.qb_vendor_name.localeCompare(b.qb_vendor_name)));

    const { data: batches, error: batchesError } = await supabase
      .from('worker_payable_batches')
      .select('*')
      .eq('period_start', fromDate)
      .eq('period_end', toDate)
      .in('status', ['draft', 'exported', 'paid'])
      .order('created_at', { ascending: false });

    if (batchesError) {
      setLoading(false);
      throw new Error(batchesError.message);
    }

    const batchRows = (batches || []) as PayableBatchRow[];
    const batchIds = batchRows.map((row) => row.id);

    const { data: batchLinks, error: batchLinksError } = await (batchIds.length > 0
      ? supabase
          .from('worker_payable_batch_shifts')
          .select('id, payable_batch_id, shift_id, voided_at')
          .in('payable_batch_id', batchIds)
      : Promise.resolve({ data: [] as Pick<PayableBatchShiftRow, 'id' | 'payable_batch_id' | 'shift_id' | 'voided_at'>[], error: null }));

    if (batchLinksError) {
      setLoading(false);
      throw new Error(batchLinksError.message);
    }

    const computedByShiftId = new Map(computedShifts.map((row) => [row.shift.id, row]));
    const linksByBatch = new Map<string, Pick<PayableBatchShiftRow, 'id' | 'payable_batch_id' | 'shift_id' | 'voided_at'>[]>();
    ((batchLinks || []) as Pick<PayableBatchShiftRow, 'id' | 'payable_batch_id' | 'shift_id' | 'voided_at'>[]).forEach((row) => {
      if (!linksByBatch.has(row.payable_batch_id)) linksByBatch.set(row.payable_batch_id, []);
      linksByBatch.get(row.payable_batch_id)!.push(row);
    });

    const existingGroups: ExistingPayableGroup[] = batchRows.map((batch) => {
      const links = (linksByBatch.get(batch.id) || []).filter((row) => !row.voided_at);
      const groupShifts = links
        .map((row) => computedByShiftId.get(row.shift_id))
        .filter(Boolean) as ShiftWithComputed[];
      const contractorName = profileMap.get(batch.worker_user_id)?.full_name || 'Unknown worker';
      const projectName = batch.project_id ? projectMap.get(batch.project_id) || 'Unknown project' : 'Mixed / Unset project';
      return {
        batch,
        contractorName,
        projectName,
        shifts: groupShifts,
        totalHours: groupShifts.reduce((sum, row) => sum + Number(row.shift.total_hours), 0),
        totalDollars: groupShifts.reduce((sum, row) => sum + row.dollars, 0),
      };
    });

    // Filter out excluded shifts whose batch is already shown in Prepared/Paid sections
    const displayedBatchIds = new Set(batchRows.map((b) => b.id));
    const filteredExcluded = excluded.filter((ex) => !ex.linkedBatchId || !displayedBatchIds.has(ex.linkedBatchId));

    setCandidateGroups([...groupsMap.values()].sort((a, b) => a.contractorName.localeCompare(b.contractorName) || a.projectName.localeCompare(b.projectName)));
    setExportedGroups(existingGroups.filter((row) => row.batch.status === 'exported' || row.batch.status === 'draft'));
    setPaidGroups(existingGroups.filter((row) => row.batch.status === 'paid'));
    setExcludedShifts(filteredExcluded.sort((a, b) => a.shift.workerName.localeCompare(b.shift.workerName) || a.shift.projectName.localeCompare(b.shift.projectName)));
    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => {
    loadPayroll().catch((error) => {
      setLoading(false);
      toast({ title: 'Load failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    });
  }, [loadPayroll, toast]);

  const handleCreatePayable = async (group: CandidateGroup) => {
    if (!user?.id) {
      toast({ title: 'Auth required', description: 'Please sign in again.', variant: 'destructive' });
      return;
    }

    setCreatingGroupKey(group.key);
    const { data: batch, error: batchError } = await supabase
      .from('worker_payable_batches')
      .insert({
        worker_user_id: group.worker_user_id,
        project_id: group.project_id,
        company_id: group.company_id,
        period_start: group.periodStart,
        period_end: group.periodEnd,
        total_amount: Number(group.totalDollars.toFixed(2)),
        status: 'draft',
        settlement_method: 'off_platform_manual',
        created_by: user.id,
      })
      .select('*')
      .single();

    if (batchError || !batch) {
      setCreatingGroupKey(null);
      toast({ title: 'Failed to prepare payment', description: batchError?.message || 'Unknown error', variant: 'destructive' });
      return;
    }

    const linkRows = group.shifts.map((row) => ({ payable_batch_id: batch.id, shift_id: row.shift.id }));
    const { error: linksError } = await supabase.from('worker_payable_batch_shifts').insert(linkRows);

    if (linksError) {
      setCreatingGroupKey(null);
      toast({ title: 'Link shifts failed', description: linksError.message, variant: 'destructive' });
      return;
    }

    setCreatingGroupKey(null);
    toast({ title: 'Payment prepared', description: `${group.contractorName} · ${group.projectName}` });
    await loadPayroll();
  };

  const handleCreateAndMarkPaid = async (group: CandidateGroup) => {
    if (!user?.id) {
      toast({ title: 'Auth required', description: 'Please sign in again.', variant: 'destructive' });
      return;
    }

    setPayingGroupKey(group.key);

    // Step 1: Create the batch as draft
    const { data: batch, error: batchError } = await supabase
      .from('worker_payable_batches')
      .insert({
        worker_user_id: group.worker_user_id,
        project_id: group.project_id,
        company_id: group.company_id,
        period_start: group.periodStart,
        period_end: group.periodEnd,
        total_amount: Number(group.totalDollars.toFixed(2)),
        status: 'draft',
        settlement_method: 'off_platform_manual',
        created_by: user.id,
      })
      .select('*')
      .single();

    if (batchError || !batch) {
      setPayingGroupKey(null);
      toast({ title: 'Failed to record payment', description: batchError?.message || 'Unknown error', variant: 'destructive' });
      return;
    }

    // Step 2: Link shifts
    const linkRows = group.shifts.map((row) => ({ payable_batch_id: batch.id, shift_id: row.shift.id }));
    const { error: linksError } = await supabase.from('worker_payable_batch_shifts').insert(linkRows);

    if (linksError) {
      setPayingGroupKey(null);
      toast({ title: 'Link shifts failed', description: linksError.message, variant: 'destructive' });
      return;
    }

    // Step 3: Immediately mark as paid
    const { error: paidError } = await supabase
      .from('worker_payable_batches')
      .update({ status: 'paid', paid_at: new Date().toISOString(), marked_paid_by: user.id })
      .eq('id', batch.id);

    setPayingGroupKey(null);

    if (paidError) {
      toast({ title: 'Payment created but failed to mark paid', description: paidError.message, variant: 'destructive' });
    } else {
      toast({ title: 'Payment recorded', description: `${group.contractorName} · ${group.projectName} — marked as paid` });
    }
    await loadPayroll();
  };

  const handleMarkPaid = async (batchId: string) => {
    if (!user?.id) {
      toast({ title: 'Auth required', description: 'Please sign in again.', variant: 'destructive' });
      return;
    }

    setUpdatingBatchId(batchId);
    const { error } = await supabase
      .from('worker_payable_batches')
      .update({ status: 'paid', paid_at: new Date().toISOString(), marked_paid_by: user.id })
      .eq('id', batchId);
    setUpdatingBatchId(null);

    if (error) {
      toast({ title: 'Mark paid failed', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Payment recorded', description: 'Marked as paid' });
    await loadPayroll();
  };

  const handleVoidBatch = async (batchId: string) => {
    setVoidingBatchId(batchId);

    // Void all shift links
    const { error: voidLinksError } = await supabase
      .from('worker_payable_batch_shifts')
      .update({ voided_at: new Date().toISOString() })
      .eq('payable_batch_id', batchId);

    if (voidLinksError) {
      setVoidingBatchId(null);
      toast({ title: 'Failed to void links', description: voidLinksError.message, variant: 'destructive' });
      return;
    }

    // Set batch status to voided
    const { error: voidBatchError } = await supabase
      .from('worker_payable_batches')
      .update({ status: 'voided' })
      .eq('id', batchId);

    setVoidingBatchId(null);

    if (voidBatchError) {
      toast({ title: 'Failed to void group', description: voidBatchError.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Payment group voided', description: 'All shifts released back to Ready to Pay.' });
    await loadPayroll();
  };

  const handleRemoveShiftFromBatch = async (shiftId: string, batchId: string) => {
    setRemovingShiftId(shiftId);

    // Void just this one link
    const { error: voidError } = await supabase
      .from('worker_payable_batch_shifts')
      .update({ voided_at: new Date().toISOString() })
      .eq('payable_batch_id', batchId)
      .eq('shift_id', shiftId);

    if (voidError) {
      setRemovingShiftId(null);
      toast({ title: 'Failed to remove shift', description: voidError.message, variant: 'destructive' });
      return;
    }

    // Recalculate batch total: check remaining active links
    const { data: remainingLinks } = await supabase
      .from('worker_payable_batch_shifts')
      .select('shift_id')
      .eq('payable_batch_id', batchId)
      .is('voided_at', null);

    if (!remainingLinks || remainingLinks.length === 0) {
      // No shifts left — void the whole batch
      await supabase
        .from('worker_payable_batches')
        .update({ status: 'voided' })
        .eq('id', batchId);
      toast({ title: 'Shift removed', description: 'No shifts remain — group has been voided.' });
    } else {
      toast({ title: 'Shift removed', description: 'Shift released back to Ready to Pay.' });
    }

    setRemovingShiftId(null);
    await loadPayroll();
  };

  // Load profiles and projects for pickers
  useEffect(() => {
    const loadPickers = async () => {
      const [{ data: profiles }, { data: projects }] = await Promise.all([
        supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
        supabase.from('projects').select('id, name').eq('status', 'active').order('name'),
      ]);
      setAllProfiles((profiles || []) as Array<{ id: string; full_name: string | null }>);
      setAllProjects((projects || []) as Array<{ id: string; name: string }>);
    };
    loadPickers();
  }, []);

  const handleSearchQBTransactions = async () => {
    if (!searchCompanyId) {
      toast({ title: 'Missing company', description: 'Select a company to search.', variant: 'destructive' });
      return;
    }
    setSearchLoading(true);
    setSearchResults([]);
    setSelectedTxn(null);
    setAllocations([]);
    setExistingAllocations([]);
    setLinkResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('quickbooks_search_transactions', {
        body: {
          company_id: searchCompanyId,
          vendor_id: searchVendorId || undefined,
          from_date: searchFromDate || undefined,
          to_date: searchToDate || undefined,
          min_amount: searchMinAmount ? parseFloat(searchMinAmount) : undefined,
          max_amount: searchMaxAmount ? parseFloat(searchMaxAmount) : undefined,
        },
      });
      if (error) {
        toast({ title: 'Search failed', description: error.message, variant: 'destructive' });
      } else if (data?.error) {
        toast({ title: 'Search failed', description: data.message || data.error, variant: 'destructive' });
      } else {
        setSearchResults(data?.transactions || []);
      }
    } catch {
      toast({ title: 'Search failed', variant: 'destructive' });
    }
    setSearchLoading(false);
  };

  const handleSelectTxn = async (txn: typeof searchResults[0]) => {
    setSelectedTxn(txn);
    setAllocations([{ worker_user_id: '', amount: '', memo: '', project_id: '' }]);
    setLinkResult(null);
    // Load existing allocations for this txn
    const extRef = `${txn.type}:${txn.id}`;
    const { data } = await supabase
      .from('worker_payments')
      .select('worker_user_id, amount, memo, project_id')
      .eq('company_id', searchCompanyId)
      .eq('external_reference', extRef)
      .eq('payment_source', 'quickbooks_linked' as any);
    setExistingAllocations((data || []).map(r => ({
      worker_user_id: r.worker_user_id,
      amount: Number(r.amount),
      memo: r.memo,
      project_id: r.project_id,
    })));
  };

  const allocNewSum = useMemo(() => allocations.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0), [allocations]);
  const allocExistingSum = useMemo(() => existingAllocations.reduce((s, a) => s + a.amount, 0), [existingAllocations]);

  const handleSaveLinkedAllocations = async () => {
    if (!user?.id || !selectedTxn) return;
    const extRef = `${selectedTxn.type}:${selectedTxn.id}`;
    const valid = allocations.filter(a => a.worker_user_id && parseFloat(a.amount) > 0);
    if (valid.length === 0) {
      toast({ title: 'No valid allocations', variant: 'destructive' });
      return;
    }
    setLinkSaving(true);
    setLinkResult(null);
    try {
      const { data, error } = await supabase.rpc('save_linked_historical_payments', {
        p_caller_id: user.id,
        p_company_id: searchCompanyId,
        p_external_reference: extRef,
        p_qb_txn_type: selectedTxn.type,
        p_qb_txn_amount: selectedTxn.amount,
        p_allocations: valid.map(a => ({
          worker_user_id: a.worker_user_id,
          amount: parseFloat(a.amount),
          paid_date: selectedTxn.txn_date,
          memo: a.memo || null,
          project_id: a.project_id || null,
        })),
      });
      if (error) {
        setLinkResult({ success: false, message: error.message });
      } else {
        setLinkResult({ success: true, message: `${(data as any)?.inserted_count || valid.length} allocation(s) saved. Total allocated: $${(data as any)?.total_allocated || ''}` });
        // Refresh existing allocations
        handleSelectTxn(selectedTxn);
      }
    } catch (e) {
      setLinkResult({ success: false, message: e instanceof Error ? e.message : 'Unknown error' });
    }
    setLinkSaving(false);
  };

  const handleSaveLocalPayment = async () => {
    if (!user?.id || !localWorkerId || !localAmount || !localDate) {
      toast({ title: 'Missing fields', description: 'Worker, amount, and date are required.', variant: 'destructive' });
      return;
    }
    setLocalSaving(true);
    setLocalResult(null);
    try {
      const { data, error } = await supabase.rpc('save_local_historical_payment', {
        p_caller_id: user.id,
        p_worker_user_id: localWorkerId,
        p_amount: parseFloat(localAmount),
        p_paid_date: localDate,
        p_company_id: localCompanyId || null,
        p_project_id: localProjectId || null,
        p_memo: localMemo || null,
      });
      if (error) {
        setLocalResult({ success: false, message: error.message });
      } else {
        setLocalResult({ success: true, message: `Payment recorded (ID: ${(data as any)?.payment_id || 'created'})` });
      }
    } catch (e) {
      setLocalResult({ success: false, message: e instanceof Error ? e.message : 'Unknown error' });
    }
    setLocalSaving(false);
  };

  // Apply worker filter if provided
  const filteredCandidateGroups = useMemo(() =>
    workerFilter ? candidateGroups.filter(g => g.worker_user_id === workerFilter) : candidateGroups,
    [candidateGroups, workerFilter]
  );
  const filteredExportedGroups = useMemo(() =>
    workerFilter ? exportedGroups.filter(g => g.batch.worker_user_id === workerFilter) : exportedGroups,
    [exportedGroups, workerFilter]
  );
  const filteredPaidGroups = useMemo(() =>
    workerFilter ? paidGroups.filter(g => g.batch.worker_user_id === workerFilter) : paidGroups,
    [paidGroups, workerFilter]
  );

  const totals = useMemo(() => {
    const candidateDollars = filteredCandidateGroups.reduce((sum, row) => sum + row.totalDollars, 0);
    const exportedDollars = filteredExportedGroups.reduce((sum, row) => sum + Number(row.batch.total_amount || row.totalDollars), 0);
    const paidDollars = filteredPaidGroups.reduce((sum, row) => sum + Number(row.batch.total_amount || row.totalDollars), 0);
    return { candidateDollars, exportedDollars, paidDollars };
  }, [filteredCandidateGroups, filteredExportedGroups, filteredPaidGroups]);

  // Reusable bill preview JSX
  const billPreviewContent = billGroupPreviews.length > 0 ? (
    <Card className="p-3 space-y-2">
      <div>
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">QuickBooks Bill Preview</p>
        </div>
        <p className="text-xs text-muted-foreground">How eligible items will group into bills when exported (by company + QB vendor + project + period).</p>
      </div>
      <div className="space-y-2">
        {billGroupPreviews.map((bp) => {
          const firstProjectId = bp.lines[0]?.projectId;
          const workerUserIds = [...new Set(bp.lines.map(l => {
            const cg = candidateGroups.find(g =>
              g.contractorName === l.contractorName && g.project_id === l.projectId
            );
            return cg?.worker_user_id;
          }).filter(Boolean))];
          const drillDownParams = new URLSearchParams();
          if (firstProjectId) drillDownParams.set('project', firstProjectId);
          drillDownParams.set('from', bp.periodStart);
          drillDownParams.set('to', bp.periodEnd);
          if (workerUserIds.length === 1 && workerUserIds[0]) {
            drillDownParams.set('contractor', workerUserIds[0]);
          }
          const drillDownUrl = `/shifts?${drillDownParams.toString()}`;

          return (
            <div key={bp.key} className="border rounded p-3 space-y-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{bp.companyName} → {bp.qb_vendor_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {bp.lines[0]?.projectName && <span>{bp.lines[0].projectName} · </span>}
                    {bp.periodStart} → {bp.periodEnd}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">${bp.totalDollars.toFixed(2)}</p>
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2" asChild>
                    <a href={drillDownUrl}>View Shifts</a>
                  </Button>
                </div>
              </div>
              <div className="text-xs space-y-0.5 pl-2 border-l-2 border-muted">
                {bp.lines.map((line, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2">
                    <span>
                      {line.contractorName} · {line.projectName}
                      {line.qbClassName && <span className="text-muted-foreground ml-1">(Class: {line.qbClassName})</span>}
                    </span>
                    <span className="font-medium">${line.dollars.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  ) : null;

  // Ready to Pay content (shared between modes)
  const readyToPayContent = (
    <>
      {loading ? (
        <p className="text-xs text-muted-foreground flex items-center"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Loading…</p>
      ) : filteredCandidateGroups.length === 0 ? (
        <p className="text-xs text-muted-foreground">No unpaid shifts available to prepare in this date range.</p>
      ) : (
        <div className="space-y-2">
          {filteredCandidateGroups.map((group) => (
            <Collapsible key={group.key} open={expandedCandidates.has(group.key)} onOpenChange={() => toggleCandidate(group.key)}>
              <CollapsibleTrigger asChild>
                <div className="rounded border border-border px-3 py-2 cursor-pointer hover:bg-muted/30">
                  <div className="flex items-center gap-2">
                    <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${expandedCandidates.has(group.key) ? 'rotate-180' : ''}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">
                        <span className="text-muted-foreground">{group.companyName} →</span> {group.contractorName} · {group.projectName}
                      </p>
                      <p className="text-xs text-muted-foreground">{group.periodStart} → {group.periodEnd} · {group.shifts.length} shifts · {group.totalHours.toFixed(1)}h</p>
                    </div>
                    <p className="text-sm font-medium">${group.totalDollars.toFixed(2)}</p>
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-1 pl-4 space-y-1">
                {group.shifts.map((row) => (
                  <div key={row.shift.id} className="text-xs border rounded p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span>{row.shift.shift_date} · {Number(row.shift.total_hours)}h @ ${row.rateUsed.toFixed(2)}</span>
                      <span className="font-medium">${row.dollars.toFixed(2)}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-muted-foreground">
                      {row.allocations.map((a, idx) => <span key={`${row.shift.id}-${idx}`}>{a.task_name}: {a.hours}h</span>)}
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onEditShift({ id: row.shift.id })}>
                      <Pencil className="h-3 w-3 mr-1" />Edit Shift
                    </Button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={creatingGroupKey === group.key || payingGroupKey === group.key} onClick={() => handleCreatePayable(group)}>
                    {creatingGroupKey === group.key ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                    Prepare Payment
                  </Button>
                  <Button size="sm" disabled={payingGroupKey === group.key || creatingGroupKey === group.key} onClick={() => handleCreateAndMarkPaid(group)}>
                    {payingGroupKey === group.key ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                    Record as Paid (Local Only)
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}
    </>
  );

  // Prepared Payments content
  const preparedPaymentsContent = (
    <>
      {filteredExportedGroups.length === 0 ? (
        <p className="text-xs text-muted-foreground">No prepared payments for this date range.</p>
      ) : (
        <div className="space-y-2">
          {filteredExportedGroups.map((group) => {
            const key = `existing-${group.batch.id}`;
            const qbBillUrl = getQBBillUrl(group.batch);
            const isDraft = group.batch.status === 'draft';
            const isExported = group.batch.status === 'exported';
            const exportError = group.batch.qb_export_error;

            return (
              <Collapsible key={group.batch.id} open={expandedExisting.has(key)} onOpenChange={() => toggleExisting(key)}>
                <CollapsibleTrigger asChild>
                  <div className="rounded border border-border px-3 py-2 cursor-pointer hover:bg-muted/30">
                    <div className="flex items-center gap-2">
                      <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${expandedExisting.has(key) ? 'rotate-180' : ''}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm truncate">{group.contractorName} · {group.projectName}</p>
                          <Badge variant={isExported ? 'default' : 'secondary'} className="text-[10px] h-5">
                            {isExported ? 'Sent to QuickBooks' : 'Prepared'}
                          </Badge>
                          {group.batch.qb_bill_doc_number && (
                            <Badge variant="outline" className="text-[10px] h-5">
                              QB #{group.batch.qb_bill_doc_number}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{group.batch.period_start} → {group.batch.period_end} · {group.totalHours.toFixed(1)}h</p>
                      </div>
                      <p className="text-sm font-medium">${Number(group.batch.total_amount || group.totalDollars).toFixed(2)}</p>
                      {(isDraft || isExported) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-2 h-7 text-xs gap-1"
                          disabled={updatingBatchId === group.batch.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkPaid(group.batch.id);
                          }}
                        >
                          {updatingBatchId === group.batch.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                           Mark Paid (Local Only)
                        </Button>
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1 pl-4 space-y-1">
                  {exportError && (
                    <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded p-2">
                      <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                      <span>{exportError}</span>
                    </div>
                  )}

                  {group.shifts.map((row) => (
                    <div key={row.shift.id} className="text-xs border rounded p-2 flex items-center justify-between">
                      <span>{row.shift.shift_date} · {row.projectName} · {Number(row.shift.total_hours)}h · ${row.dollars.toFixed(2)}</span>
                      {isDraft && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          disabled={removingShiftId === row.shift.id}
                          onClick={() => handleRemoveShiftFromBatch(row.shift.id, group.batch.id)}
                          title="Remove this shift from group"
                        >
                          {removingShiftId === row.shift.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                        </Button>
                      )}
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    {isDraft && qbStatus?.connected && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={exportingBatchIds.has(group.batch.id)}
                        onClick={() => handleExportToQB(group.batch.id)}
                      >
                        {exportingBatchIds.has(group.batch.id) ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                        Export to QuickBooks
                      </Button>
                    )}
                    {isExported && qbBillUrl && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={qbBillUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Open in QuickBooks
                        </a>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      disabled={updatingBatchId === group.batch.id}
                      onClick={() => handleMarkPaid(group.batch.id)}
                    >
                      {updatingBatchId === group.batch.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                      Mark Paid (Local Only)
                    </Button>
                    {isDraft && (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={voidingBatchId === group.batch.id}
                        onClick={() => handleVoidBatch(group.batch.id)}
                      >
                        {voidingBatchId === group.batch.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                        Void Group
                      </Button>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}
    </>
  );

  // Already Paid content
  const alreadyPaidContent = (
    <>
      {filteredPaidGroups.length === 0 ? (
        <p className="text-xs text-muted-foreground">No paid records for this date range.</p>
      ) : (
        <div className="space-y-1">
          {filteredPaidGroups.map((group) => {
            const qbBillUrl = getQBBillUrl(group.batch);
            return (
              <div key={group.batch.id} className="text-xs border rounded p-2 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p>{group.contractorName} · {group.projectName}</p>
                    {group.batch.qb_bill_doc_number && (
                      <Badge variant="outline" className="text-[10px] h-5">
                        QB #{group.batch.qb_bill_doc_number}
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground">{group.batch.period_start} → {group.batch.period_end} · {group.totalHours.toFixed(1)}h · Paid on {group.batch.paid_at ? new Date(group.batch.paid_at).toLocaleDateString() : '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {qbBillUrl && (
                    <a href={qbBillUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <p className="font-medium">${Number(group.batch.total_amount || group.totalDollars).toFixed(2)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  // Excluded shifts content
  const excludedContent = (
    <>
      {excludedShifts.length === 0 ? (
        <p className="text-xs text-muted-foreground">All shifts in this range are available.</p>
      ) : (
        <div className="space-y-1">
          {excludedShifts.map((row) => (
            <div key={row.shift.shift.id} className="text-xs border rounded p-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p>{row.shift.workerName} · {row.shift.projectName} · {row.shift.shift.shift_date} · {Number(row.shift.shift.total_hours)}h</p>
                <p className="text-muted-foreground">{row.reason}</p>
              </div>
              {row.linkedBatchId && (
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs px-2"
                    disabled={removingShiftId === row.shift.shift.id}
                    onClick={() => handleRemoveShiftFromBatch(row.shift.shift.id, row.linkedBatchId!)}
                    title="Remove this shift from its group"
                  >
                    {removingShiftId === row.shift.shift.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3 mr-1" />}
                    Remove
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs px-2 text-destructive hover:text-destructive"
                    disabled={voidingBatchId === row.linkedBatchId}
                    onClick={() => handleVoidBatch(row.linkedBatchId!)}
                    title="Void the entire payment group"
                  >
                    {voidingBatchId === row.linkedBatchId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
                    Void Group
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );

  // Helper to wrap a section in a collapsible card for billFirstMode
  const collapsibleSection = (title: string, count: number, content: React.ReactNode) => (
    <Collapsible>
      <Card className="p-3 space-y-2">
        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left">
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
          <p className="text-sm font-medium">{title}</p>
          <Badge variant="secondary" className="text-[10px] ml-auto">{count}</Badge>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">{content}</CollapsibleContent>
      </Card>
    </Collapsible>
  );

  return (
    <div className="space-y-4">
      {/* QuickBooks Connection Banner */}
      <Card className="p-3">
        {qbStatusLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Checking QuickBooks connection…
          </div>
        ) : qbStatus?.connected && qbStatus.connections?.length ? (
          <div className="space-y-2">
            {qbStatus.connections.map((conn) => (
                <div key={conn.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle className={`h-4 w-4 shrink-0 ${conn.token_healthy ? 'text-green-600' : 'text-destructive'}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">QB: {conn.company_name || 'Connected'}</p>
                      {!conn.token_healthy && (
                        <p className="text-xs text-destructive">Token expired — reconnect required</p>
                      )}
                    </div>
                  </div>
                  {!conn.token_healthy && conn.company_id && (
                    <Button size="sm" variant="outline" onClick={() => handleConnectQB(conn.company_id!)} disabled={qbConnecting}>
                      {qbConnecting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Link2 className="h-3 w-3 mr-1" />}
                      Reconnect
                    </Button>
                  )}
                </div>
              ))}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">QuickBooks not connected</p>
            <Button size="sm" onClick={() => handleConnectQB()} disabled={qbConnecting}>
              {qbConnecting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Link2 className="h-3 w-3 mr-1" />}
              Connect QuickBooks
            </Button>
          </div>
        )}
      </Card>

      <QBSettingsCard />

      {/* Pay period selector */}
      <div className="space-y-1">
        <Label className="text-xs">Pay Period</Label>
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger>
            <SelectValue placeholder="Select a pay period" />
          </SelectTrigger>
          <SelectContent>
            {PAY_PERIODS.map((p) => (
              <SelectItem key={`${p.from}::${p.to}`} value={`${p.from}::${p.to}`}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">This page groups unpaid shifts by contractor and project so you can prepare payments without paying the same shift twice.</p>

      <Card className="p-3 text-xs text-muted-foreground">
        <p>Ready to prepare: <span className="text-foreground font-medium">${totals.candidateDollars.toFixed(2)}</span></p>
        <p>Prepared (not yet paid): <span className="text-foreground font-medium">${totals.exportedDollars.toFixed(2)}</span></p>
        <p>Already paid: <span className="text-foreground font-medium">${totals.paidDollars.toFixed(2)}</span></p>
      </Card>

      {billFirstMode ? (
        <>
          {/* Bill preview is primary in billFirstMode */}
          {billPreviewContent}

          {collapsibleSection('Ready to Pay', filteredCandidateGroups.length, readyToPayContent)}
          {collapsibleSection('Prepared Payments', filteredExportedGroups.length, preparedPaymentsContent)}
          {collapsibleSection('Already Paid', filteredPaidGroups.length, alreadyPaidContent)}
          {collapsibleSection('Already Included Elsewhere', excludedShifts.length, excludedContent)}
        </>
      ) : (
        <>
          {/* Standard mode: detail sections expanded, bill preview at bottom */}
          <Card className="p-3 space-y-2">
            <div>
              <p className="text-sm font-medium">Ready to Pay</p>
              <p className="text-xs text-muted-foreground">These contractor/project groups have unpaid shifts that can be prepared as a payment now.</p>
            </div>
            {readyToPayContent}
          </Card>

          <Card className="p-3 space-y-2">
            <div>
              <p className="text-sm font-medium">Prepared Payments</p>
              <p className="text-xs text-muted-foreground">These payments have been prepared. Their shifts won't appear in Ready to Pay.</p>
            </div>
            {preparedPaymentsContent}
          </Card>

          <Card className="p-3 space-y-2">
            <div>
              <p className="text-sm font-medium">Already Paid</p>
              <p className="text-xs text-muted-foreground">These payments were already recorded as paid.</p>
            </div>
            {alreadyPaidContent}
          </Card>

          <Card className="p-3 space-y-2">
            <div>
              <p className="text-sm font-medium">Already Included Elsewhere</p>
              <p className="text-xs text-muted-foreground">These shifts are already part of another payment group, so they can't be included again.</p>
            </div>
            {excludedContent}
          </Card>

          {billPreviewContent}
        </>
      )}

      {/* Match Existing QuickBooks Payment */}
      <Card className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium flex-1">Match Existing QuickBooks Payment</p>
          <Button size="sm" variant="outline" onClick={() => setHistOpen(!histOpen)}>
            {histOpen ? 'Close' : 'Open'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Link an existing QuickBooks transaction to local payment records, or record a local-only payment.</p>

        {histOpen && (
          <Tabs defaultValue="search-link" className="pt-2">
            <TabsList className="w-full">
              <TabsTrigger value="search-link" className="flex-1 text-xs">Search & Link</TabsTrigger>
              <TabsTrigger value="local-only" className="flex-1 text-xs">Save Local Only</TabsTrigger>
            </TabsList>

            {/* ─── Search & Link Tab ─── */}
            <TabsContent value="search-link" className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Company *</Label>
                  <Select value={searchCompanyId} onValueChange={setSearchCompanyId}>
                    <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.short_name || c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">QB Vendor ID (optional)</Label>
                  <Input className="h-8 text-xs" value={searchVendorId} onChange={(e) => setSearchVendorId(e.target.value)} placeholder="Filter by vendor" />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">From</Label>
                  <Input type="date" className="h-8 text-xs" value={searchFromDate} onChange={(e) => setSearchFromDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To</Label>
                  <Input type="date" className="h-8 text-xs" value={searchToDate} onChange={(e) => setSearchToDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Min $</Label>
                  <Input type="number" className="h-8 text-xs" value={searchMinAmount} onChange={(e) => setSearchMinAmount(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Max $</Label>
                  <Input type="number" className="h-8 text-xs" value={searchMaxAmount} onChange={(e) => setSearchMaxAmount(e.target.value)} placeholder="∞" />
                </div>
              </div>
              <Button size="sm" onClick={handleSearchQBTransactions} disabled={searchLoading || !searchCompanyId}>
                {searchLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
                Search QuickBooks
              </Button>

              {/* Search results */}
              {searchResults.length > 0 && !selectedTxn && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  <p className="text-xs text-muted-foreground">{searchResults.length} transaction(s) found</p>
                  {searchResults.map((txn) => (
                    <button
                      key={`${txn.type}:${txn.id}`}
                      className="w-full text-left border rounded p-2 text-xs hover:bg-accent transition-colors space-y-0.5"
                      onClick={() => handleSelectTxn(txn)}
                    >
                      <div className="flex justify-between">
                        <span className="font-medium">{txn.type} #{txn.doc_number || txn.id}</span>
                        <span className="font-semibold">${txn.amount.toFixed(2)}</span>
                      </div>
                      <div className="text-muted-foreground">
                        {txn.txn_date} · {txn.vendor_name || 'No vendor'}{txn.memo ? ` · ${txn.memo.slice(0, 50)}` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Selected transaction + allocation table */}
              {selectedTxn && (
                <div className="space-y-3 border rounded p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{selectedTxn.type} #{selectedTxn.id} — ${selectedTxn.amount.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">{selectedTxn.txn_date} · {selectedTxn.vendor_name || 'No vendor'}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => { setSelectedTxn(null); setAllocations([]); setExistingAllocations([]); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Existing allocations */}
                  {existingAllocations.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Already linked: ${allocExistingSum.toFixed(2)}</p>
                      {existingAllocations.map((ea, i) => {
                        const profile = allProfiles.find(p => p.id === ea.worker_user_id);
                        const project = ea.project_id ? allProjects.find(p => p.id === ea.project_id) : null;
                        return (
                          <div key={i} className="text-xs bg-muted/50 rounded px-2 py-1 flex justify-between">
                            <span>{profile?.full_name || 'Unknown'}{project ? ` · ${project.name}` : ''}</span>
                            <span className="font-medium">${ea.amount.toFixed(2)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* New allocations */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium">New Allocations</p>
                    {allocations.map((alloc, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-1 items-end">
                        <div className="col-span-3 space-y-0.5">
                          <Label className="text-[10px]">Worker *</Label>
                          <Select value={alloc.worker_user_id} onValueChange={(v) => {
                            const next = [...allocations];
                            next[idx] = { ...next[idx], worker_user_id: v };
                            setAllocations(next);
                          }}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Worker" /></SelectTrigger>
                            <SelectContent>
                              {allProfiles.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.full_name || 'Unnamed'}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-2 space-y-0.5">
                          <Label className="text-[10px]">Amount *</Label>
                          <Input className="h-7 text-xs" type="number" step="0.01" value={alloc.amount} onChange={(e) => {
                            const next = [...allocations];
                            next[idx] = { ...next[idx], amount: e.target.value };
                            setAllocations(next);
                          }} />
                        </div>
                        <div className="col-span-3 space-y-0.5">
                          <Label className="text-[10px]">Project</Label>
                          <Select value={alloc.project_id} onValueChange={(v) => {
                            const next = [...allocations];
                            next[idx] = { ...next[idx], project_id: v };
                            setAllocations(next);
                          }}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Optional" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">None</SelectItem>
                              {allProjects.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-3 space-y-0.5">
                          <Label className="text-[10px]">Memo</Label>
                          <Input className="h-7 text-xs" value={alloc.memo} onChange={(e) => {
                            const next = [...allocations];
                            next[idx] = { ...next[idx], memo: e.target.value };
                            setAllocations(next);
                          }} />
                        </div>
                        <div className="col-span-1 flex justify-center">
                          {allocations.length > 1 && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setAllocations(allocations.filter((_, i) => i !== idx))}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={() => setAllocations([...allocations, { worker_user_id: '', amount: '', memo: '', project_id: '' }])}>
                      <Plus className="h-3 w-3 mr-1" />Add Row
                    </Button>
                  </div>

                  {/* Running total */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Existing: ${allocExistingSum.toFixed(2)} + New: ${allocNewSum.toFixed(2)} = ${(allocExistingSum + allocNewSum).toFixed(2)} / ${selectedTxn.amount.toFixed(2)}
                    </span>
                    {allocExistingSum + allocNewSum > selectedTxn.amount && (
                      <Badge variant="destructive" className="text-[10px]">Over-allocated</Badge>
                    )}
                  </div>

                  {linkResult && (
                    <div className={`text-xs rounded p-2 ${linkResult.success ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>
                      {linkResult.success ? `✓ ${linkResult.message}` : `✗ ${linkResult.message}`}
                    </div>
                  )}

                  <Button onClick={handleSaveLinkedAllocations} disabled={linkSaving || allocNewSum <= 0 || allocExistingSum + allocNewSum > selectedTxn.amount} className="w-full">
                    {linkSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Link2 className="h-4 w-4 mr-1" />}
                    Save Allocations
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* ─── Save Local Only Tab ─── */}
            <TabsContent value="local-only" className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Worker *</Label>
                  <Select value={localWorkerId} onValueChange={setLocalWorkerId}>
                    <SelectTrigger><SelectValue placeholder="Select worker" /></SelectTrigger>
                    <SelectContent>
                      {allProfiles.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.full_name || 'Unnamed'}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Amount *</Label>
                  <Input type="number" step="0.01" min="0.01" value={localAmount} onChange={(e) => setLocalAmount(e.target.value)} placeholder="0.00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Payment Date *</Label>
                  <Input type="date" value={localDate} onChange={(e) => setLocalDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Company (optional)</Label>
                  <Select value={localCompanyId} onValueChange={setLocalCompanyId}>
                    <SelectTrigger><SelectValue placeholder="No company" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.short_name || c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Project (optional)</Label>
                  <Select value={localProjectId} onValueChange={setLocalProjectId}>
                    <SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {allProjects.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Memo (optional)</Label>
                  <Input value={localMemo} onChange={(e) => setLocalMemo(e.target.value)} placeholder="Notes" />
                </div>
              </div>

              {localResult && (
                <div className={`text-xs rounded p-2 ${localResult.success ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>
                  {localResult.success ? `✓ ${localResult.message}` : `✗ ${localResult.message}`}
                </div>
              )}

              <Button onClick={handleSaveLocalPayment} disabled={localSaving || !localWorkerId || !localAmount || !localDate} className="w-full">
                {localSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <DollarSign className="h-4 w-4 mr-1" />}
                Save Local Payment
              </Button>
            </TabsContent>
          </Tabs>
        )}
      </Card>
    </div>
  );
};

export default PayrollSummary;
