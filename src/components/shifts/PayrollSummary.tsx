import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ChevronDown, Trash2, Pencil, Loader2, CreditCard, FileDown, DollarSign, Check, X, ExternalLink } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import type { Shift } from '@/hooks/useShifts';
import type { Tables } from '@/integrations/supabase/types';

type WorkerPayoutProfile = Tables<'worker_payout_profiles'>;
type WorkerTaxProfile = Tables<'worker_tax_profiles'>;
type PayoutRunRecord = Tables<'payout_runs'>;
type WorkerPaymentRecord = Tables<'worker_payments'>;
type WorkerPaymentShiftLink = Tables<'worker_payment_shifts'>;
type ProfileRow = Tables<'profiles'>;

interface PayrollSummaryProps {
  onEditShift: (shift: Pick<Shift, 'id'>) => void;
}

interface ContractorSummary {
  user_id: string;
  full_name: string;
  total_hours: number;
  total_unpaid_hours: number;
  rate: number | null;
  total_pay_all: number;
  total_unpaid_pay: number;
  total_paid_pay: number;
  tax_classification: WorkerTaxProfile['tax_classification'] | null;
  payout_profile: WorkerPayoutProfile | null;
  shifts: ShiftDetail[];
}

interface ShiftDetail {
  id: string;
  user_id: string;
  project_name: string;
  project_id: string;
  shift_date: string;
  total_hours: number;
  hourly_rate_used: number;
  calculated_amount: number;
  payment_status: 'paid' | 'unpaid';
  paid_date: string | null;
  worker_payment_id: string | null;
  payment_source: WorkerPaymentRecord['payment_source'] | null;
  admin_edited_at: string | null;
  allocations: { task_name: string; hours: number }[];
}

interface ManualPaymentFormState {
  worker_user_id: string;
  paid_date: string;
  amount: string;
  payment_source: WorkerPaymentRecord['payment_source'];
  pay_period_start: string;
  pay_period_end: string;
  external_reference: string;
  memo: string;
}

const PayrollSummary = ({ onEditShift }: PayrollSummaryProps) => {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const [fromDate, setFromDate] = useState(weekAgo);
  const [toDate, setToDate] = useState(today);
  const [reportYear, setReportYear] = useState(String(new Date().getFullYear()));
  const [summaries, setSummaries] = useState<ContractorSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [expandedShifts, setExpandedShifts] = useState<Set<string>>(new Set());
  const [expandedHistoryUsers, setExpandedHistoryUsers] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [creatingRun, setCreatingRun] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [markPaidTarget, setMarkPaidTarget] = useState<WorkerPaymentRecord | null>(null);
  const [markPaidNote, setMarkPaidNote] = useState('');
  const [markPaidSource, setMarkPaidSource] = useState<WorkerPaymentRecord['payment_source']>('manual_quickbooks');
  const [markingPaid, setMarkingPaid] = useState(false);
  const [venmoDraftByUser, setVenmoDraftByUser] = useState<Record<string, { handle: string; noteTemplate: string }>>({});
  const [savingVenmoUser, setSavingVenmoUser] = useState<string | null>(null);
  const [editingRateUserId, setEditingRateUserId] = useState<string | null>(null);
  const [editingRateValue, setEditingRateValue] = useState('');
  const [savingRate, setSavingRate] = useState(false);
  const [activeRun, setActiveRun] = useState<PayoutRunRecord | null>(null);
  const [runPayments, setRunPayments] = useState<WorkerPaymentRecord[]>([]);
  const [yearPayments, setYearPayments] = useState<WorkerPaymentRecord[]>([]);
  const [yearShiftDetails, setYearShiftDetails] = useState<ShiftDetail[]>([]);
  const [reportWorkerId, setReportWorkerId] = useState('');
  const [profileMap, setProfileMap] = useState<Record<string, Pick<ProfileRow, 'id' | 'full_name' | 'hourly_rate' | 'is_active'>>>({});
  const [taxMap, setTaxMap] = useState<Record<string, WorkerTaxProfile['tax_classification']>>({});
  const [manualForm, setManualForm] = useState<ManualPaymentFormState>({
    worker_user_id: '',
    paid_date: today,
    amount: '',
    payment_source: 'venmo_manual',
    pay_period_start: '',
    pay_period_end: '',
    external_reference: '',
    memo: '',
  });
  const [markingWorkerId, setMarkingWorkerId] = useState<string | null>(null);

  const fetchRunSnapshot = useCallback(async (runId: string) => {
    const [{ data: run, error: runError }, { data: payments, error: paymentsError }] = await Promise.all([
      supabase
        .from('payout_runs')
        .select('*')
        .eq('id', runId)
        .maybeSingle(),
      supabase
        .from('worker_payments')
        .select('*')
        .eq('payout_run_id', runId)
        .order('created_at', { ascending: true }),
    ]);

    if (runError || !run) throw new Error(runError?.message || 'Failed to load payout run');
    if (paymentsError) throw new Error(paymentsError.message);

    setActiveRun(run);
    setRunPayments(payments || []);
  }, []);

  const fetchYearLedger = useCallback(async (year: string) => {
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    const [{ data: payments, error: paymentsError }, { data: yearShifts, error: yearShiftsError }] = await Promise.all([
      supabase
        .from('worker_payments')
        .select('*')
        .gte('paid_date', start)
        .lte('paid_date', end)
        .order('paid_date', { ascending: false }),
      supabase
        .from('shifts')
        .select('*')
        .gte('shift_date', start)
        .lte('shift_date', end)
        .order('shift_date', { ascending: false }),
    ]);

    if (paymentsError) throw new Error(paymentsError.message);
    if (yearShiftsError) throw new Error(yearShiftsError.message);

    const yearlyShiftRows = yearShifts || [];
    const yearShiftIds = yearlyShiftRows.map((s) => s.id);

    const [{ data: yearProjects }, { data: yearAllocations }, { data: yearLinks }] = await Promise.all([
      supabase
        .from('projects')
        .select('id, name')
        .in('id', [...new Set(yearlyShiftRows.map((s) => s.project_id))]),
      yearShiftIds.length > 0
        ? supabase.from('shift_task_allocations').select('shift_id, task_id, hours').in('shift_id', yearShiftIds)
        : Promise.resolve({ data: [], error: null } as const),
      yearShiftIds.length > 0
        ? supabase
          .from('worker_payment_shifts')
          .select('shift_id, worker_payment_id, amount_paid, hourly_rate_used, hours_paid, worker_payments!inner(id, paid_date, payment_source)')
          .in('shift_id', yearShiftIds)
        : Promise.resolve({ data: [], error: null } as const),
    ]);

    const yearTaskIds = [...new Set((yearAllocations || []).map((a) => a.task_id))];
    const { data: yearTasks } = yearTaskIds.length > 0
      ? await supabase.from('tasks').select('id, task').in('id', yearTaskIds)
      : { data: [] };

    const yearProjectMap: Record<string, string> = {};
    (yearProjects || []).forEach((row) => { yearProjectMap[row.id] = row.name; });
    const yearTaskMap: Record<string, string> = {};
    (yearTasks || []).forEach((row) => { yearTaskMap[row.id] = row.task; });

    const yearAllocByShift: Record<string, { task_name: string; hours: number }[]> = {};
    (yearAllocations || []).forEach((a) => {
      if (!yearAllocByShift[a.shift_id]) yearAllocByShift[a.shift_id] = [];
      yearAllocByShift[a.shift_id].push({ task_name: yearTaskMap[a.task_id] || 'Unknown task', hours: a.hours });
    });

    const yearLinkMap: Record<string, WorkerPaymentShiftLink & { worker_payments?: Pick<WorkerPaymentRecord, 'id' | 'paid_date' | 'payment_source'> }> = {};
    ((yearLinks || []) as Array<WorkerPaymentShiftLink & { worker_payments?: Pick<WorkerPaymentRecord, 'id' | 'paid_date' | 'payment_source'> }>).forEach((link) => {
      yearLinkMap[link.shift_id] = link;
    });

    const yearDetails: ShiftDetail[] = yearlyShiftRows.map((s) => {
      const linked = yearLinkMap[s.id];
      const paidInfo = linked?.worker_payments;
      const hourlyRateUsed = linked?.hourly_rate_used ?? s.hourly_rate_snapshot ?? profileMap[s.user_id]?.hourly_rate ?? 0;
      const calcAmount = linked?.amount_paid ?? Number((s.total_hours * hourlyRateUsed).toFixed(2));
      return {
        id: s.id,
        user_id: s.user_id,
        project_name: yearProjectMap[s.project_id] || 'Unknown',
        project_id: s.project_id,
        shift_date: s.shift_date,
        total_hours: s.total_hours,
        hourly_rate_used: Number(hourlyRateUsed || 0),
        calculated_amount: Number(calcAmount || 0),
        payment_status: linked ? 'paid' : 'unpaid',
        paid_date: paidInfo?.paid_date || null,
        worker_payment_id: linked?.worker_payment_id || null,
        payment_source: paidInfo?.payment_source || null,
        admin_edited_at: s.admin_edited_at,
        allocations: yearAllocByShift[s.id] || [],
      };
    });

    setYearPayments(payments || []);
    setYearShiftDetails(yearDetails);
  }, [profileMap]);

  const fetchPayroll = useCallback(async () => {
    setLoading(true);

    const [{ data: profiles, error: profilesError }, { data: shifts, error: shiftsError }, { data: allTaxProfiles, error: taxError }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, hourly_rate, is_active'),
      supabase
        .from('shifts')
        .select('*')
        .gte('shift_date', fromDate)
        .lte('shift_date', toDate)
        .order('shift_date', { ascending: false }),
      supabase.from('worker_tax_profiles').select('user_id, tax_classification'),
    ]);

    if (profilesError) throw new Error(profilesError.message);
    if (shiftsError) throw new Error(shiftsError.message);
    if (taxError) throw new Error(taxError.message);

    const nextProfileMap: Record<string, Pick<ProfileRow, 'id' | 'full_name' | 'hourly_rate' | 'is_active'>> = {};
    (profiles || []).forEach((row) => { nextProfileMap[row.id] = row; });
    setProfileMap(nextProfileMap);

    const allTaxMap: Record<string, WorkerTaxProfile['tax_classification']> = {};
    (allTaxProfiles || []).forEach((tp) => { allTaxMap[tp.user_id] = tp.tax_classification; });
    setTaxMap(allTaxMap);

    const shiftRows = shifts || [];
    if (shiftRows.length === 0) {
      setSummaries([]);
      setActiveRun(null);
      setRunPayments([]);
      await fetchYearLedger(reportYear);
      setLoading(false);
      return;
    }

    const userIds = [...new Set(shiftRows.map((s) => s.user_id))];
    const { data: payoutProfiles } = await supabase
      .from('worker_payout_profiles')
      .select('*')
      .in('user_id', userIds);

    const payoutProfileMap: Record<string, WorkerPayoutProfile> = {};
    (payoutProfiles || []).forEach((pp) => { payoutProfileMap[pp.user_id] = pp; });

    const projectIds = [...new Set(shiftRows.map((s) => s.project_id))];
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name')
      .in('id', projectIds);
    const projectMap: Record<string, string> = {};
    (projects || []).forEach((row) => { projectMap[row.id] = row.name; });

    const shiftIds = shiftRows.map((s) => s.id);
    const [{ data: allAllocations }, { data: paidLinks }] = await Promise.all([
      supabase
        .from('shift_task_allocations')
        .select('shift_id, task_id, hours')
        .in('shift_id', shiftIds),
      supabase
        .from('worker_payment_shifts')
        .select('shift_id, worker_payment_id, amount_paid, hourly_rate_used, hours_paid, worker_payments!inner(id, paid_date, payment_source)')
        .in('shift_id', shiftIds),
    ]);

    const taskIds = [...new Set((allAllocations || []).map((a) => a.task_id))];
    const taskMap: Record<string, string> = {};
    if (taskIds.length > 0) {
      const { data: taskData } = await supabase
        .from('tasks')
        .select('id, task')
        .in('id', taskIds);
      (taskData || []).forEach((row) => { taskMap[row.id] = row.task; });
    }

    const allocByShift: Record<string, { task_name: string; hours: number }[]> = {};
    (allAllocations || []).forEach((a) => {
      if (!allocByShift[a.shift_id]) allocByShift[a.shift_id] = [];
      allocByShift[a.shift_id].push({ task_name: taskMap[a.task_id] || 'Unknown task', hours: a.hours });
    });

    const paidLinkMap: Record<string, WorkerPaymentShiftLink & { worker_payments?: Pick<WorkerPaymentRecord, 'id' | 'paid_date' | 'payment_source'> }> = {};
    ((paidLinks || []) as Array<WorkerPaymentShiftLink & { worker_payments?: Pick<WorkerPaymentRecord, 'id' | 'paid_date' | 'payment_source'> }>).forEach((link) => {
      paidLinkMap[link.shift_id] = link;
    });

    const byUser: Record<string, ContractorSummary> = {};
    shiftRows.forEach((s) => {
      if (!byUser[s.user_id]) {
        const profile = nextProfileMap[s.user_id];
        byUser[s.user_id] = {
          user_id: s.user_id,
          full_name: profile?.full_name || 'Unknown',
          total_hours: 0,
          total_unpaid_hours: 0,
          rate: profile?.hourly_rate ?? null,
          total_pay_all: 0,
          total_unpaid_pay: 0,
          total_paid_pay: 0,
          tax_classification: allTaxMap[s.user_id] || null,
          payout_profile: payoutProfileMap[s.user_id] || null,
          shifts: [],
        };
      }

      const linked = paidLinkMap[s.id];
      const paidInfo = linked?.worker_payments;
      const hourlyRateUsed = linked?.hourly_rate_used ?? s.hourly_rate_snapshot ?? byUser[s.user_id].rate ?? 0;
      const amount = linked?.amount_paid ?? Number((s.total_hours * (hourlyRateUsed || 0)).toFixed(2));
      const isPaid = !!linked;

      byUser[s.user_id].total_hours += s.total_hours;
      byUser[s.user_id].total_pay_all += amount;
      if (isPaid) {
        byUser[s.user_id].total_paid_pay += amount;
      } else {
        byUser[s.user_id].total_unpaid_hours += s.total_hours;
        byUser[s.user_id].total_unpaid_pay += amount;
      }

      byUser[s.user_id].shifts.push({
        id: s.id,
        user_id: s.user_id,
        project_name: projectMap[s.project_id] || 'Unknown',
        project_id: s.project_id,
        shift_date: s.shift_date,
        total_hours: s.total_hours,
        hourly_rate_used: Number(hourlyRateUsed || 0),
        calculated_amount: Number(amount || 0),
        payment_status: isPaid ? 'paid' : 'unpaid',
        paid_date: paidInfo?.paid_date || null,
        worker_payment_id: linked?.worker_payment_id || null,
        payment_source: paidInfo?.payment_source || null,
        admin_edited_at: s.admin_edited_at,
        allocations: allocByShift[s.id] || [],
      });
    });

    setSummaries(Object.values(byUser).sort((a, b) => a.full_name.localeCompare(b.full_name)));

    const { data: latestRun } = await supabase
      .from('payout_runs')
      .select('*')
      .eq('period_start', fromDate)
      .eq('period_end', toDate)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestRun) {
      await fetchRunSnapshot(latestRun.id);
    } else {
      setActiveRun(null);
      setRunPayments([]);
    }

    await fetchYearLedger(reportYear);
    setLoading(false);
  }, [fromDate, toDate, reportYear, fetchRunSnapshot, fetchYearLedger]);

  useEffect(() => {
    fetchPayroll().catch((error) => {
      setLoading(false);
      toast({ title: 'Load failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    });
  }, [fetchPayroll, toast]);

  useEffect(() => {
    setVenmoDraftByUser((prev) => {
      const next = { ...prev };
      for (const summary of summaries) {
        if (!next[summary.user_id]) {
          next[summary.user_id] = {
            handle: summary.payout_profile?.venmo_handle || '',
            noteTemplate: summary.payout_profile?.venmo_note_template || '',
          };
        }
      }
      return next;
    });
  }, [summaries]);


  const toggleUser = (uid: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  };

  const toggleShift = (sid: string) => {
    setExpandedShifts(prev => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid); else next.add(sid);
      return next;
    });
  };

  const toggleHistoryUser = (uid: string) => {
    setExpandedHistoryUsers(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('shifts').delete().eq('id', deleteTarget);
    setDeleting(false);
    setDeleteTarget(null);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Shift deleted' });
      fetchPayroll();
    }
  };

  const formatClassification = (classification: WorkerTaxProfile['tax_classification'] | null) => {
    if (classification === 'employee_w2') return 'W-2';
    if (classification === 'contractor_1099') return '1099';
    return 'Unspecified';
  };

  const handleCreatePayoutRun = async () => {
    if (summaries.length === 0) {
      toast({ title: 'No payroll data', description: 'Select a period with shifts first.', variant: 'destructive' });
      return;
    }

    const workers = summaries
      .filter((s) => s.total_unpaid_pay > 0)
      .map((s) => ({
        worker_user_id: s.user_id,
        amount: Number(s.total_unpaid_pay.toFixed(2)),
        memo: `Payroll ${fromDate} to ${toDate}`,
      }));

    if (workers.length === 0) {
      toast({ title: 'No payable workers', description: 'All calculated amounts are zero.', variant: 'destructive' });
      return;
    }

    setCreatingRun(true);
    const { data, error } = await supabase.functions.invoke('stripe_create_payout_run', {
      body: {
        period_start: fromDate,
        period_end: toDate,
        workers,
      },
    });
    setCreatingRun(false);

    if (error) {
      toast({ title: 'Create payout run failed', description: error.message, variant: 'destructive' });
      return;
    }

    const run = data?.payout_run as PayoutRunRecord | undefined;
    if (!run?.id) {
      toast({ title: 'Invalid payout run response', variant: 'destructive' });
      return;
    }

    toast({ title: 'Payout run created' });
    await fetchRunSnapshot(run.id);
  };

  const handleMarkVisibleUnpaidShiftsPaid = async (summary: ContractorSummary) => {
    const unpaidShiftIds = summary.shifts.filter((s) => s.payment_status === 'unpaid').map((s) => s.id);
    if (unpaidShiftIds.length === 0) {
      toast({ title: 'No unpaid shifts', description: 'All visible shifts for this worker are already paid.' });
      return;
    }

    setMarkingWorkerId(summary.user_id);
    const { data, error } = await supabase.rpc('admin_mark_visible_shifts_paid', {
      p_worker_user_id: summary.user_id,
      p_period_start: fromDate,
      p_period_end: toDate,
      p_shift_ids: unpaidShiftIds,
      p_payment_source: 'manual_quickbooks',
      p_memo: `Payroll ${fromDate} to ${toDate}`,
      p_confirmation_note: 'Marked paid from payroll summary',
    });
    setMarkingWorkerId(null);

    if (error) {
      toast({ title: 'Mark paid failed', description: error.message, variant: 'destructive' });
      return;
    }

    const linkedCount = (data as { linked_shift_count?: number } | null)?.linked_shift_count || unpaidShiftIds.length;
    toast({ title: 'Shifts marked paid', description: `${summary.full_name}: ${linkedCount} shift(s) linked to a payment record.` });
    await fetchPayroll();
  };

  const handleSaveVenmoProfile = async (userId: string) => {
    const draft = venmoDraftByUser[userId] || { handle: '', noteTemplate: '' };
    const sanitizedHandle = sanitizeVenmoHandle(draft.handle) || null;
    setSavingVenmoUser(userId);
    const { error } = await supabase
      .from('worker_payout_profiles')
      .upsert({
        user_id: userId,
        venmo_handle: sanitizedHandle,
        venmo_note_template: draft.noteTemplate.trim() || null,
        default_payment_source: 'venmo_manual',
      }, { onConflict: 'user_id' });
    setSavingVenmoUser(null);

    if (error) {
      toast({ title: 'Failed to save Venmo settings', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Venmo settings saved' });
    await fetchPayroll();
  };

  const formatMoney = (value: number) => `$${Number(value).toFixed(2)}`;

  const sanitizeVenmoHandle = (raw: string | null | undefined) => {
    const trimmed = (raw || '').trim().replace(/^@/, '');
    return trimmed.replace(/[^a-zA-Z0-9_-]/g, '');
  };

  const sanitizeNote = (raw: string) => raw.replace(/\s+/g, ' ').trim().slice(0, 120);

  const getPaymentSummary = (workerUserId: string) => {
    const summary = summaries.find((item) => item.user_id === workerUserId);
    const propertyLabel = summary?.shifts.length
      ? [...new Set(summary.shifts.map((shift) => shift.project_name))].join(', ')
      : '';
    return { summary, propertyLabel };
  };

  const getVenmoNote = (payment: WorkerPaymentRecord) => {
    const { summary, propertyLabel } = getPaymentSummary(payment.worker_user_id);
    const defaultPeriod = activeRun ? `${activeRun.period_start} to ${activeRun.period_end}` : `${fromDate} to ${toDate}`;
    const template = summary?.payout_profile?.venmo_note_template;
    const base = template && template.trim().length > 0
      ? template
      : `Payroll ${defaultPeriod}${propertyLabel ? ` · ${propertyLabel}` : ''}`;
    return sanitizeNote(base);
  };

  const openVenmoHelper = (payment: WorkerPaymentRecord) => {
    const { summary } = getPaymentSummary(payment.worker_user_id);
    const venmoHandle = sanitizeVenmoHandle(summary?.payout_profile?.venmo_handle);

    if (!venmoHandle) {
      toast({ title: 'Missing Venmo handle', description: 'Add a Venmo handle for this worker before using the helper.', variant: 'destructive' });
      return;
    }

    const amountNum = Number(payment.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast({ title: 'Invalid amount', description: 'Cannot open Venmo helper for a non-positive payment amount.', variant: 'destructive' });
      return;
    }

    const note = getVenmoNote(payment);
    const params = new URLSearchParams({
      recipients: venmoHandle,
      amount: amountNum.toFixed(2),
      note,
    });
    window.open(`https://account.venmo.com/pay?${params.toString()}`, '_blank', 'noopener,noreferrer');
    toast({ title: 'Venmo helper opened', description: 'Complete the payment manually in Venmo, then return to mark paid.' });
  };

  const handleOpenGusto = () => {
    window.open('https://app.gusto.com/payroll', '_blank', 'noopener,noreferrer');
    toast({ title: 'Gusto opened', description: 'Complete the batch payment in Gusto, then return here and mark each payment as paid.' });
  };

  const handleConfirmMarkPaid = async () => {
    if (!markPaidTarget) return;
    setMarkingPaid(true);
    const { error } = await supabase.functions.invoke('admin_mark_worker_payment_paid', {
      body: {
        payment_id: markPaidTarget.id,
        payment_source: markPaidSource,
        confirmation_note: markPaidNote || null,
      },
    });
    setMarkingPaid(false);

    if (error) {
      toast({ title: 'Mark paid failed', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Payment marked paid' });
    setMarkPaidTarget(null);
    setMarkPaidNote('');
    setMarkPaidSource('manual_quickbooks');
    if (activeRun?.id) await fetchRunSnapshot(activeRun.id);
    await fetchYearLedger(reportYear);
  };

  const handleSaveManualPayment = async () => {
    if (!manualForm.worker_user_id || !manualForm.paid_date || !manualForm.amount) {
      toast({ title: 'Missing fields', description: 'Worker, paid date, and amount are required.', variant: 'destructive' });
      return;
    }

    const amountNum = Number(manualForm.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast({ title: 'Invalid amount', description: 'Amount must be greater than 0.', variant: 'destructive' });
      return;
    }

    setSavingManual(true);
    const { error } = await supabase.functions.invoke('admin_add_manual_payment', {
      body: {
        worker_user_id: manualForm.worker_user_id,
        paid_date: manualForm.paid_date,
        amount: amountNum,
        payment_source: manualForm.payment_source,
        pay_period_start: manualForm.pay_period_start || null,
        pay_period_end: manualForm.pay_period_end || null,
        external_reference: manualForm.external_reference || null,
        memo: manualForm.memo || null,
      },
    });
    setSavingManual(false);

    if (error) {
      toast({ title: 'Manual payment save failed', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Manual payment added' });
    setManualForm((prev) => ({ ...prev, amount: '', external_reference: '', memo: '' }));
    await fetchYearLedger(reportYear);
  };

  const handleStartEditRate = (userId: string, currentRate: number | null) => {
    setEditingRateUserId(userId);
    setEditingRateValue(currentRate != null ? String(currentRate) : '');
  };

  const handleCancelEditRate = () => {
    setEditingRateUserId(null);
    setEditingRateValue('');
  };

  const handleSaveRate = async (userId: string) => {
    const numRate = Number(editingRateValue);
    if (!Number.isFinite(numRate) || numRate < 0) {
      toast({ title: 'Invalid rate', description: 'Enter a valid hourly rate (≥ 0).', variant: 'destructive' });
      return;
    }

    setSavingRate(true);
    const { error } = await supabase
      .from('profiles')
      .update({ hourly_rate: numRate })
      .eq('id', userId);
    setSavingRate(false);

    if (error) {
      toast({ title: 'Failed to save rate', description: error.message, variant: 'destructive' });
      return;
    }

    setEditingRateUserId(null);
    setEditingRateValue('');
    toast({ title: 'Hourly rate updated' });
    fetchPayroll();
  };

  const yearGroup = useMemo(() => {
    const grouped = new Map<string, WorkerPaymentRecord[]>();
    for (const row of yearPayments) {
      const list = grouped.get(row.worker_user_id) || [];
      list.push(row);
      grouped.set(row.worker_user_id, list);
    }
    return grouped;
  }, [yearPayments]);

  const ytdSummary = useMemo(() => {
    return [...yearGroup.entries()]
      .map(([workerId, payments]) => ({
        workerId,
        total: payments.reduce((sum, p) => sum + Number(p.amount || 0), 0),
        count: payments.length,
      }))
      .sort((a, b) => {
        const nameA = profileMap[a.workerId]?.full_name || 'Unknown';
        const nameB = profileMap[b.workerId]?.full_name || 'Unknown';
        return nameA.localeCompare(nameB);
      });
  }, [yearGroup, profileMap]);

  const ytd1099Summary = useMemo(() => (
    ytdSummary.filter((row) => taxMap[row.workerId] === 'contractor_1099')
  ), [ytdSummary, taxMap]);

  const annualWorkerDetails = useMemo(() => {
    if (!reportWorkerId) return [] as ShiftDetail[];
    return yearShiftDetails.filter((row) => row.user_id === reportWorkerId);
  }, [reportWorkerId, yearShiftDetails]);

  const exportYear1099SummaryCsv = () => {
    const rows = ytd1099Summary.map((row) => ({
      worker_name: profileMap[row.workerId]?.full_name || row.workerId,
      year: reportYear,
      total_paid: row.total.toFixed(2),
      payment_count: String(row.count),
    }));
    const headers = ['worker_name', 'year', 'total_paid', 'payment_count'];
    const csv = [
      headers.join(','),
      ...rows.map((row) => headers.map((h) => `"${String(row[h as keyof typeof row]).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `contractor-1099-summary-${reportYear}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportWorkerDetailCsv = () => {
    const rows = annualWorkerDetails.map((row) => ({
      shift_date: row.shift_date,
      project: row.project_name,
      hours: row.total_hours,
      hourly_rate_used: Number(row.hourly_rate_used).toFixed(2),
      calculated_amount: Number(row.calculated_amount).toFixed(2),
      payment_status: row.payment_status,
      paid_date: row.paid_date || '',
      payment_source: row.payment_source || '',
      worker_payment_id: row.worker_payment_id || '',
    }));
    const headers = ['shift_date', 'project', 'hours', 'hourly_rate_used', 'calculated_amount', 'payment_status', 'paid_date', 'payment_source', 'worker_payment_id'];
    const csv = [headers.join(','), ...rows.map((row) => headers.map((h) => `"${String(row[h as keyof typeof row]).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `contractor-detail-${reportWorkerId || 'worker'}-${reportYear}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printAnnualReport = () => {
    window.print();
  };

  const exportYearCsv = () => {
    const rows = yearPayments.map((p) => {
      const name = profileMap[p.worker_user_id]?.full_name || p.worker_user_id;
      const tax = formatClassification(taxMap[p.worker_user_id] || null);
      return {
        worker_name: name,
        worker_classification: tax,
        paid_date: p.paid_date,
        pay_period_start: p.pay_period_start || '',
        pay_period_end: p.pay_period_end || '',
        amount: Number(p.amount).toFixed(2),
        payment_source: p.payment_source,
        status: p.status,
        external_reference: p.external_reference || '',
        stripe_transfer_id: p.stripe_transfer_id || '',
        stripe_payout_id: p.stripe_payout_id || '',
        stripe_balance_transaction_id: p.stripe_balance_transaction_id || '',
        memo: p.memo || '',
      };
    });

    const headers = [
      'worker_name',
      'worker_classification',
      'paid_date',
      'pay_period_start',
      'pay_period_end',
      'amount',
      'payment_source',
      'status',
      'external_reference',
      'stripe_transfer_id',
      'stripe_payout_id',
      'stripe_balance_transaction_id',
      'memo',
    ];

    const csv = [
      headers.join(','),
      ...rows.map((row) => headers.map((h) => `"${String(row[h as keyof typeof row]).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `worker-payments-${reportYear}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const selectableWorkers = Object.values(profileMap)
    .filter((p) => p.is_active)
    .sort((a, b) => (a.full_name || 'Unknown').localeCompare(b.full_name || 'Unknown'));

  const annualWorkerOptions = useMemo(() => {
    const ids = [...new Set(yearShiftDetails.map((row) => row.user_id))];
    return ids
      .map((id) => ({ id, name: profileMap[id]?.full_name || id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [yearShiftDetails, profileMap]);

  const runWorkerNameMap = summaries.reduce<Record<string, string>>((acc, s) => {
    acc[s.user_id] = s.full_name;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>
      </div>

      <Card className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Payout Run</p>
            <p className="text-xs text-muted-foreground">Snapshot and submit payouts for selected period</p>
          </div>
          <Button size="sm" onClick={handleCreatePayoutRun} disabled={creatingRun || loading}>
            {creatingRun ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CreditCard className="h-4 w-4 mr-1" />}
            Create Payout Run
          </Button>
        </div>

        {activeRun ? (
          <div className="rounded border border-border p-2 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">Run #{activeRun.id.slice(0, 8)}</p>
              <Badge variant={activeRun.status === 'draft' ? 'outline' : activeRun.status === 'submitted' ? 'secondary' : 'destructive'} className="text-xs">
                {activeRun.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">Period: {activeRun.period_start} → {activeRun.period_end}</p>
            <p className="text-xs text-amber-700 dark:text-amber-400">Pay with Venmo or Pay in Gusto only opens helper pages. It does not mark anything paid.</p>
            <Button size="sm" variant="outline" onClick={handleOpenGusto}>
              <ExternalLink className="h-4 w-4 mr-1" />Pay in Gusto
            </Button>
            <div className="space-y-2">
              {runPayments.map((payment) => {
                const workerName = runWorkerNameMap[payment.worker_user_id] || profileMap[payment.worker_user_id]?.full_name || payment.worker_user_id;
                const { propertyLabel, summary } = getPaymentSummary(payment.worker_user_id);
                const venmoHandle = sanitizeVenmoHandle(summary?.payout_profile?.venmo_handle);
                const canOpenVenmo = !!venmoHandle && Number(payment.amount) > 0;
                const payPeriodLabel = payment.pay_period_start && payment.pay_period_end
                  ? `${payment.pay_period_start} → ${payment.pay_period_end}`
                  : `${fromDate} → ${toDate}`;

                return (
                  <div key={payment.id} className="text-xs rounded border border-border px-2 py-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate pr-2 font-medium">{workerName}</span>
                      <span className="shrink-0">{formatMoney(Number(payment.amount))} · {payment.status === 'pending' ? 'ready_to_pay' : payment.status}</span>
                    </div>
                    <div className="text-muted-foreground space-y-1">
                      {propertyLabel ? <p>Property: {propertyLabel}</p> : null}
                      <p>Pay period: {payPeriodLabel}</p>
                      <p>Venmo: {venmoHandle ? `@${venmoHandle}` : 'Not set on payout profile'}</p>
                      {payment.status === 'paid' ? (
                        <p>Paid: {payment.paid_at || payment.paid_date} by {payment.marked_paid_by ? (profileMap[payment.marked_paid_by]?.full_name || payment.marked_paid_by) : 'unknown'}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setMarkPaidSource('venmo_manual');
                          openVenmoHelper(payment);
                        }}
                        disabled={!canOpenVenmo}
                        title={!canOpenVenmo ? 'Cannot open Venmo helper without a valid Venmo handle and positive amount.' : undefined}
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />Pay with Venmo
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setMarkPaidTarget(payment);
                          setMarkPaidNote('');
                          setMarkPaidSource('manual_quickbooks');
                        }}
                        disabled={payment.status === 'paid' || markingPaid}
                      >
                        <Check className="h-4 w-4 mr-1" />Mark Paid
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No payout run exists for this date range yet.</p>
        )}
      </Card>

      <Card className="p-3 space-y-3">
        <div>
          <p className="text-sm font-medium">Add Manual Payment</p>
          <p className="text-xs text-muted-foreground">Record historical payments (QuickBooks, pre-app, or off-platform)</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Worker</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={manualForm.worker_user_id}
              onChange={(e) => setManualForm((prev) => ({ ...prev, worker_user_id: e.target.value }))}
            >
              <option value="">Select worker</option>
              {selectableWorkers.map((worker) => (
                <option key={worker.id} value={worker.id}>{worker.full_name || 'Unknown'}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Source</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={manualForm.payment_source}
              onChange={(e) => setManualForm((prev) => ({ ...prev, payment_source: e.target.value as WorkerPaymentRecord['payment_source'] }))}
            >
              <option value="manual_quickbooks">manual_quickbooks</option>
              <option value="venmo_manual">venmo_manual</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Paid Date</Label>
            <Input type="date" value={manualForm.paid_date} onChange={(e) => setManualForm((prev) => ({ ...prev, paid_date: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Amount</Label>
            <Input type="number" min="0" step="0.01" value={manualForm.amount} onChange={(e) => setManualForm((prev) => ({ ...prev, amount: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Pay Period Start (optional)</Label>
            <Input type="date" value={manualForm.pay_period_start} onChange={(e) => setManualForm((prev) => ({ ...prev, pay_period_start: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Pay Period End (optional)</Label>
            <Input type="date" value={manualForm.pay_period_end} onChange={(e) => setManualForm((prev) => ({ ...prev, pay_period_end: e.target.value }))} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">External Reference (optional)</Label>
            <Input value={manualForm.external_reference} onChange={(e) => setManualForm((prev) => ({ ...prev, external_reference: e.target.value }))} placeholder="QuickBooks check/txn id" />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Memo (optional)</Label>
            <Input value={manualForm.memo} onChange={(e) => setManualForm((prev) => ({ ...prev, memo: e.target.value }))} />
          </div>
        </div>
        <Button size="sm" onClick={handleSaveManualPayment} disabled={savingManual}>
          {savingManual ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
          Save Manual Payment
        </Button>
      </Card>

      <Card className="p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Annual Reports</p>
            <p className="text-xs text-muted-foreground">1099 summary + contractor detail from durable payment records</p>
          </div>
          <div className="flex items-center gap-2">
            <Input type="number" className="w-28" min="2000" max="2100" value={reportYear} onChange={(e) => setReportYear(e.target.value)} />
            <Button variant="outline" size="sm" onClick={exportYear1099SummaryCsv} disabled={ytd1099Summary.length === 0}>
              <FileDown className="h-4 w-4 mr-1" />Export 1099 Summary
            </Button>
            <Button variant="outline" size="sm" onClick={exportYearCsv} disabled={yearPayments.length === 0}>
              <FileDown className="h-4 w-4 mr-1" />Export Payments CSV
            </Button>
            <Button variant="outline" size="sm" onClick={printAnnualReport}>Print</Button>
          </div>
        </div>

        {ytd1099Summary.length === 0 ? (
          <p className="text-xs text-muted-foreground">No payments found for {reportYear}.</p>
        ) : (
          <div className="space-y-2">
            {ytd1099Summary.map((row) => {
              const workerPayments = yearGroup.get(row.workerId) || [];
              const workerName = profileMap[row.workerId]?.full_name || row.workerId;
              const workerClass = formatClassification(taxMap[row.workerId] || null);

              return (
                <Collapsible key={row.workerId} open={expandedHistoryUsers.has(row.workerId)} onOpenChange={() => toggleHistoryUser(row.workerId)}>
                  <CollapsibleTrigger asChild>
                    <div className="rounded border border-border px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-2">
                        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${expandedHistoryUsers.has(row.workerId) ? 'rotate-180' : ''}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{workerName}</p>
                          <p className="text-xs text-muted-foreground">{workerClass} · {row.count} payments</p>
                        </div>
                        <p className="text-sm font-medium">${row.total.toFixed(2)}</p>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-4 pt-1 space-y-1">
                    {workerPayments.map((payment) => (
                      <div key={payment.id} className="rounded border border-border p-2 text-xs space-y-1">
                        <div className="flex justify-between gap-2">
                          <span>{payment.paid_date}</span>
                          <span className="font-medium">${Number(payment.amount).toFixed(2)}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                          <span>Period: {payment.pay_period_start || '—'} → {payment.pay_period_end || '—'}</span>
                          <span>Source: {payment.payment_source}</span>
                          <span>Status: {payment.status}</span>
                          <span>Ref: {payment.external_reference || '—'}</span>
                          <span>Transfer: {payment.stripe_transfer_id || '—'}</span>
                          <span>Payout: {payment.stripe_payout_id || '—'}</span>
                        </div>
                        {payment.memo && <p className="text-muted-foreground">Memo: {payment.memo}</p>}
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}

        <div className="pt-2 border-t border-border space-y-2">
          <p className="text-sm font-medium">Contractor Annual Detail</p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={reportWorkerId}
              onChange={(e) => setReportWorkerId(e.target.value)}
            >
              <option value="">Select contractor</option>
                            {annualWorkerOptions.map((worker) => (
                <option key={worker.id} value={worker.id}>{worker.name}</option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={exportWorkerDetailCsv} disabled={!reportWorkerId || annualWorkerDetails.length === 0}>
              <FileDown className="h-4 w-4 mr-1" />Export Contractor Detail
            </Button>
          </div>
          {reportWorkerId && annualWorkerDetails.length > 0 ? (
            <div className="space-y-1 max-h-64 overflow-auto pr-1">
              {annualWorkerDetails.map((row) => (
                <div key={row.id} className="text-xs rounded border border-border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span>{row.shift_date} · {row.project_name}</span>
                    <Badge variant={row.payment_status === 'paid' ? 'secondary' : 'outline'}>{row.payment_status}</Badge>
                  </div>
                  <p className="text-muted-foreground">{row.total_hours}h @ ${row.hourly_rate_used.toFixed(2)} = ${row.calculated_amount.toFixed(2)}{row.paid_date ? ` · paid ${row.paid_date}` : ''}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Select a contractor to view annual shift-level paid/unpaid detail.</p>
          )}
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading payroll...
        </div>
      ) : summaries.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No shifts found in this date range.</p>
      ) : (
        <div className="space-y-2">
          {summaries.map(cs => {

            return (
              <Collapsible key={cs.user_id} open={expandedUsers.has(cs.user_id)} onOpenChange={() => toggleUser(cs.user_id)}>
                <CollapsibleTrigger asChild>
                  <Card className="p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedUsers.has(cs.user_id) ? 'rotate-180' : ''}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{cs.full_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">{formatClassification(cs.tax_classification)}</Badge>
                        </div>
                      </div>
                      <div className="text-right text-sm space-y-0.5">
                        <p>{cs.total_unpaid_hours}h unpaid / {cs.total_hours}h total</p>
                        <p className="text-xs text-muted-foreground">
                          {cs.rate != null ? `$${cs.rate}/hr · ` : <span className="text-destructive">No rate · </span>}
                          <span className="font-medium text-foreground">Ready ${cs.total_unpaid_pay.toFixed(2)}</span>
                        </p>
                      </div>
                    </div>
                  </Card>
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-4 pt-2 space-y-2">
                  <div className="rounded border border-border bg-card p-2 space-y-2">
                    <div>
                      <p className="text-xs font-medium mb-1">Hourly Rate</p>
                      {editingRateUserId === cs.user_id ? (
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3 text-muted-foreground shrink-0" />
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="h-7 w-24 text-xs"
                            value={editingRateValue}
                            onChange={(e) => setEditingRateValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRate(cs.user_id);
                              if (e.key === 'Escape') handleCancelEditRate();
                            }}
                            autoFocus
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            disabled={savingRate}
                            onClick={(e) => { e.stopPropagation(); handleSaveRate(cs.user_id); }}
                          >
                            {savingRate ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            disabled={savingRate}
                            onClick={(e) => { e.stopPropagation(); handleCancelEditRate(); }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <p className="text-xs text-muted-foreground">
                            {cs.rate != null ? `$${cs.rate}/hr` : <span className="text-destructive">Not set</span>}
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => { e.stopPropagation(); handleStartEditRate(cs.user_id, cs.rate); }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-medium mb-1">Payout setup</p>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <p>Manual helpers enabled: Venmo + Gusto</p>
                        <p>Use app actions to open external pay pages, then confirm paid here.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Venmo handle</Label>
                        <Input
                          className="h-8 text-xs"
                          placeholder="example_handle"
                          value={venmoDraftByUser[cs.user_id]?.handle || ''}
                          onChange={(e) => setVenmoDraftByUser((prev) => ({
                            ...prev,
                            [cs.user_id]: {
                              handle: e.target.value,
                              noteTemplate: prev[cs.user_id]?.noteTemplate || '',
                            },
                          }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Default Venmo note template (optional)</Label>
                        <Input
                          className="h-8 text-xs"
                          placeholder="Payroll {period} · {property}"
                          value={venmoDraftByUser[cs.user_id]?.noteTemplate || ''}
                          onChange={(e) => setVenmoDraftByUser((prev) => ({
                            ...prev,
                            [cs.user_id]: {
                              handle: prev[cs.user_id]?.handle || '',
                              noteTemplate: e.target.value,
                            },
                          }))}
                        />
                      </div>
                      <div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={savingVenmoUser === cs.user_id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveVenmoProfile(cs.user_id);
                          }}
                        >
                          {savingVenmoUser === cs.user_id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                          Save Venmo Settings
                        </Button>
                      </div>
                    </div>
                    <div className="pt-1">
                      <p className="text-[11px] text-muted-foreground">Stripe onboarding controls removed from active payroll workflow.</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded border border-border bg-muted/30 px-2 py-1">
                    <p className="text-xs text-muted-foreground">Paid: ${cs.total_paid_pay.toFixed(2)} · Total: ${cs.total_pay_all.toFixed(2)}</p>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      disabled={markingWorkerId === cs.user_id || cs.total_unpaid_pay <= 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkVisibleUnpaidShiftsPaid(cs);
                      }}
                    >
                      {markingWorkerId === cs.user_id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                      Mark Visible Unpaid Shifts Paid
                    </Button>
                  </div>

                  {cs.shifts.map(sd => (
                    <Collapsible key={sd.id} open={expandedShifts.has(sd.id)} onOpenChange={() => toggleShift(sd.id)}>
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center gap-2 rounded border border-border bg-card px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors">
                          <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${expandedShifts.has(sd.id) ? 'rotate-180' : ''}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{sd.project_name}</p>
                            <p className="text-xs text-muted-foreground">{sd.shift_date}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={sd.payment_status === 'paid' ? 'secondary' : 'outline'} className="text-xs">{sd.payment_status}</Badge>
                            {sd.admin_edited_at && (
                              <Badge variant="outline" className="text-xs">Admin edited</Badge>
                            )}
                            <span className="text-sm font-medium">{sd.total_hours}h · ${sd.calculated_amount.toFixed(2)}</span>
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pl-6 pt-1 space-y-1">
                        {sd.allocations.map((a, i) => (
                          <div key={i} className="flex justify-between text-xs text-muted-foreground py-0.5">
                            <span className="truncate">{a.task_name}</span>
                            <span className="shrink-0 ml-2">{a.hours}h</span>
                          </div>
                        ))}
                        {sd.payment_status === 'paid' ? (
                          <p className="text-[11px] text-muted-foreground">Paid {sd.paid_date || '—'} · {sd.payment_source || 'unknown source'} · payment {sd.worker_payment_id?.slice(0, 8)}</p>
                        ) : (
                          <p className="text-[11px] text-amber-700 dark:text-amber-400">Unpaid and included in ready-to-pay totals.</p>
                        )}
                        <div className="flex gap-1 pt-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditShift({ id: sd.id });
                            }}
                          >
                            <Pencil className="h-3 w-3 mr-1" />Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(sd.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />Delete
                          </Button>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!markPaidTarget} onOpenChange={(open) => { if (!open) { setMarkPaidTarget(null); setMarkPaidNote(''); setMarkPaidSource('manual_quickbooks'); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm payment was sent</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm only after payment is completed in Venmo or Gusto. This action marks the ledger row as paid in this app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label className="text-xs">Payment source</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={markPaidSource}
              onChange={(e) => setMarkPaidSource(e.target.value as WorkerPaymentRecord['payment_source'])}
              disabled={markingPaid}
            >
              <option value="manual_quickbooks">manual_quickbooks (Gusto/external batch)</option>
              <option value="venmo_manual">venmo_manual</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Confirmation note (optional)</Label>
            <Textarea
              value={markPaidNote}
              onChange={(e) => setMarkPaidNote(e.target.value)}
              placeholder="Example: Sent in Venmo app at 3:42 PM"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={markingPaid}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={markingPaid} onClick={handleConfirmMarkPaid}>
              {markingPaid ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Saving...</> : 'Mark Paid'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shift</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this shift and all its task allocations.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={handleDelete}>
              {deleting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Deleting...</> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PayrollSummary;
