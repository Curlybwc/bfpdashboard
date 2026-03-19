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
import { Loader2, ChevronDown, Pencil, ExternalLink, AlertTriangle, CheckCircle, Link2, X, Trash2, DollarSign, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Shift } from '@/hooks/useShifts';
import QBSettingsCard from './QBSettingsCard';
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

type QBConnectionStatus = {
  connected: boolean;
  company_name?: string;
  realm_id?: string;
  connected_at?: string;
  token_healthy?: boolean;
};

interface PayrollSummaryProps {
  onEditShift: (shift: Pick<Shift, 'id'>) => void;
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

const PayrollSummary = ({ onEditShift }: PayrollSummaryProps) => {
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

  const handleConnectQB = async () => {
    setQbConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('quickbooks_connect_begin');
      if (error || !data?.auth_url) {
        toast({ title: 'Failed to start QuickBooks connection', description: error?.message || 'No auth URL returned', variant: 'destructive' });
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

    const [{ data: shifts, error: shiftsError }, { data: profiles, error: profilesError }, { data: projects, error: projectsError }] = await Promise.all([
      supabase
        .from('shifts')
        .select('*')
        .gte('shift_date', fromDate)
        .lte('shift_date', toDate)
        .order('shift_date', { ascending: false }),
      supabase.from('profiles').select('id, full_name, hourly_rate'),
      supabase.from('projects').select('id, name'),
    ]);

    if (shiftsError || profilesError || projectsError) {
      setLoading(false);
      throw new Error(shiftsError?.message || profilesError?.message || projectsError?.message || 'Failed to load payroll data');
    }

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
      const key = `${row.shift.user_id}::${row.shift.project_id}::${fromDate}::${toDate}`;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          key,
          worker_user_id: row.shift.user_id,
          project_id: row.shift.project_id,
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

  const totals = useMemo(() => {
    const candidateDollars = candidateGroups.reduce((sum, row) => sum + row.totalDollars, 0);
    const exportedDollars = exportedGroups.reduce((sum, row) => sum + Number(row.batch.total_amount || row.totalDollars), 0);
    const paidDollars = paidGroups.reduce((sum, row) => sum + Number(row.batch.total_amount || row.totalDollars), 0);
    return { candidateDollars, exportedDollars, paidDollars };
  }, [candidateGroups, exportedGroups, paidGroups]);

  return (
    <div className="space-y-4">
      {/* QuickBooks Connection Banner */}
      <Card className="p-3">
        {qbStatusLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Checking QuickBooks connection…
          </div>
        ) : qbStatus?.connected ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">QuickBooks: {qbStatus.company_name || 'Connected'}</p>
                {!qbStatus.token_healthy && (
                  <p className="text-xs text-destructive">Token expired — reconnect required</p>
                )}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={handleConnectQB} disabled={qbConnecting}>
              {qbConnecting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Link2 className="h-3 w-3 mr-1" />}
              Reconnect
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">QuickBooks not connected</p>
            <Button size="sm" onClick={handleConnectQB} disabled={qbConnecting}>
              {qbConnecting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Link2 className="h-3 w-3 mr-1" />}
              Connect QuickBooks
            </Button>
          </div>
        )}
      </Card>

      {/* QuickBooks Settings (admin-only, visible when connected) */}
      {qbStatus?.connected && <QBSettingsCard />}

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

      {/* Unpaid Eligible Groups */}
      <Card className="p-3 space-y-2">
        <div>
          <p className="text-sm font-medium">Ready to Pay</p>
          <p className="text-xs text-muted-foreground">These contractor/project groups have unpaid shifts that can be prepared as a payment now.</p>
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground flex items-center"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Loading…</p>
        ) : candidateGroups.length === 0 ? (
          <p className="text-xs text-muted-foreground">No unpaid shifts available to prepare in this date range.</p>
        ) : (
          <div className="space-y-2">
            {candidateGroups.map((group) => (
              <Collapsible key={group.key} open={expandedCandidates.has(group.key)} onOpenChange={() => toggleCandidate(group.key)}>
                <CollapsibleTrigger asChild>
                  <div className="rounded border border-border px-3 py-2 cursor-pointer hover:bg-muted/30">
                    <div className="flex items-center gap-2">
                      <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${expandedCandidates.has(group.key) ? 'rotate-180' : ''}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{group.contractorName} · {group.projectName}</p>
                        <p className="text-xs text-muted-foreground">{group.periodStart} → {group.periodEnd} · {group.shifts.length} shifts</p>
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
      </Card>

      {/* Exported / Draft Payables */}
      <Card className="p-3 space-y-2">
        <div>
          <p className="text-sm font-medium">Prepared Payments</p>
          <p className="text-xs text-muted-foreground">These payments have been prepared. Their shifts won't appear in Ready to Pay.</p>
        </div>
        {exportedGroups.length === 0 ? (
          <p className="text-xs text-muted-foreground">No prepared payments for this date range.</p>
        ) : (
          <div className="space-y-2">
            {exportedGroups.map((group) => {
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
                          <p className="text-xs text-muted-foreground">{group.batch.period_start} → {group.batch.period_end}</p>
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
                    {/* Export error display */}
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
                      {/* Export to QuickBooks — only for draft batches with active QB connection */}
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

                      {/* Open in QuickBooks — for exported batches with a QB reference */}
                      {isExported && qbBillUrl && (
                        <Button
                          size="sm"
                          variant="outline"
                          asChild
                        >
                          <a href={qbBillUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Open in QuickBooks
                          </a>
                        </Button>
                      )}

                      {/* Mark Paid (Local Only) — does NOT create a QuickBooks BillPayment */}
                      <Button
                        size="sm"
                        disabled={updatingBatchId === group.batch.id}
                        onClick={() => handleMarkPaid(group.batch.id)}
                      >
                        {updatingBatchId === group.batch.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                        Mark Paid (Local Only)
                      </Button>
                      {/* Void entire group */}
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
      </Card>

      {/* Paid Payables */}
      <Card className="p-3 space-y-2">
        <div>
          <p className="text-sm font-medium">Already Paid</p>
          <p className="text-xs text-muted-foreground">These payments were already recorded as paid.</p>
        </div>
        {paidGroups.length === 0 ? (
          <p className="text-xs text-muted-foreground">No paid records for this date range.</p>
        ) : (
          <div className="space-y-1">
            {paidGroups.map((group) => {
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
                    <p className="text-muted-foreground">{group.batch.period_start} → {group.batch.period_end} · Paid on {group.batch.paid_at ? new Date(group.batch.paid_at).toLocaleDateString() : '—'}</p>
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
      </Card>

      {/* Excluded Shifts */}
      <Card className="p-3 space-y-2">
        <div>
          <p className="text-sm font-medium">Already Included Elsewhere</p>
          <p className="text-xs text-muted-foreground">These shifts are already part of another payment group, so they can't be included again.</p>
        </div>
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
      </Card>
    </div>
  );
};

export default PayrollSummary;
