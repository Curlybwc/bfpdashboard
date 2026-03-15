import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ChevronDown, Trash2, Pencil, Loader2, RefreshCw, Link as LinkIcon, CreditCard, Send, FileDown, DollarSign, Check, X } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import type { Shift } from '@/hooks/useShifts';
import type { Tables } from '@/integrations/supabase/types';

type WorkerPayoutProfile = Tables<'worker_payout_profiles'>;
type WorkerTaxProfile = Tables<'worker_tax_profiles'>;
type PayoutRunRecord = Tables<'payout_runs'>;
type WorkerPaymentRecord = Tables<'worker_payments'>;
type ProfileRow = Tables<'profiles'>;

type PayoutUiStatus = 'not_connected' | 'in_progress' | 'ready' | 'action_required';

interface PayrollSummaryProps {
  onEditShift: (shift: Pick<Shift, 'id'>) => void;
}

interface ContractorSummary {
  user_id: string;
  full_name: string;
  total_hours: number;
  rate: number | null;
  total_pay: number;
  tax_classification: WorkerTaxProfile['tax_classification'] | null;
  payout_profile: WorkerPayoutProfile | null;
  shifts: ShiftDetail[];
}

interface ShiftDetail {
  id: string;
  project_name: string;
  project_id: string;
  shift_date: string;
  total_hours: number;
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
  const [connectingUser, setConnectingUser] = useState<string | null>(null);
  const [syncingUser, setSyncingUser] = useState<string | null>(null);
  const [creatingRun, setCreatingRun] = useState(false);
  const [submittingRun, setSubmittingRun] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [editingRateUserId, setEditingRateUserId] = useState<string | null>(null);
  const [editingRateValue, setEditingRateValue] = useState('');
  const [savingRate, setSavingRate] = useState(false);
  const [activeRun, setActiveRun] = useState<PayoutRunRecord | null>(null);
  const [runPayments, setRunPayments] = useState<WorkerPaymentRecord[]>([]);
  const [yearPayments, setYearPayments] = useState<WorkerPaymentRecord[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, Pick<ProfileRow, 'id' | 'full_name' | 'hourly_rate' | 'is_active'>>>({});
  const [taxMap, setTaxMap] = useState<Record<string, WorkerTaxProfile['tax_classification']>>({});
  const [manualForm, setManualForm] = useState<ManualPaymentFormState>({
    worker_user_id: '',
    paid_date: today,
    amount: '',
    payment_source: 'manual_quickbooks',
    pay_period_start: '',
    pay_period_end: '',
    external_reference: '',
    memo: '',
  });

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
    const { data, error } = await supabase
      .from('worker_payments')
      .select('*')
      .gte('paid_date', start)
      .lte('paid_date', end)
      .order('paid_date', { ascending: false });

    if (error) throw new Error(error.message);
    setYearPayments(data || []);
  }, []);

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
    (profiles || []).forEach((p) => {
      nextProfileMap[p.id] = p;
    });
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

    const projectIds = [...new Set(shiftRows.map(s => s.project_id))];
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name')
      .in('id', projectIds);
    const projectMap: Record<string, string> = {};
    (projects || []).forEach(p => { projectMap[p.id] = p.name; });

    const shiftIds = shiftRows.map(s => s.id);
    const { data: allAllocations } = await supabase
      .from('shift_task_allocations')
      .select('shift_id, task_id, hours')
      .in('shift_id', shiftIds);

    const taskIds = [...new Set((allAllocations || []).map(a => a.task_id))];
    const taskMap: Record<string, string> = {};
    if (taskIds.length > 0) {
      const { data: taskData } = await supabase
        .from('tasks')
        .select('id, task')
        .in('id', taskIds);
      (taskData || []).forEach(t => { taskMap[t.id] = t.task; });
    }

    const allocByShift: Record<string, { task_name: string; hours: number }[]> = {};
    (allAllocations || []).forEach(a => {
      if (!allocByShift[a.shift_id]) allocByShift[a.shift_id] = [];
      allocByShift[a.shift_id].push({ task_name: taskMap[a.task_id] || 'Unknown task', hours: a.hours });
    });

    const byUser: Record<string, ContractorSummary> = {};
    shiftRows.forEach(s => {
      if (!byUser[s.user_id]) {
        const profile = nextProfileMap[s.user_id];
        byUser[s.user_id] = {
          user_id: s.user_id,
          full_name: profile?.full_name || 'Unknown',
          total_hours: 0,
          rate: profile?.hourly_rate ?? null,
          total_pay: 0,
          tax_classification: allTaxMap[s.user_id] || null,
          payout_profile: payoutProfileMap[s.user_id] || null,
          shifts: [],
        };
      }

      const rate = s.hourly_rate_snapshot ?? byUser[s.user_id].rate ?? 0;
      byUser[s.user_id].total_hours += s.total_hours;
      byUser[s.user_id].total_pay += s.total_hours * (rate || 0);
      byUser[s.user_id].shifts.push({
        id: s.id,
        project_name: projectMap[s.project_id] || 'Unknown',
        project_id: s.project_id,
        shift_date: s.shift_date,
        total_hours: s.total_hours,
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

  const getPayoutUiStatus = (profile: WorkerPayoutProfile | null): PayoutUiStatus => {
    if (!profile?.stripe_connected_account_id) return 'not_connected';
    if (profile.onboarding_status === 'restricted') return 'action_required';
    if (profile.onboarding_status === 'completed' && profile.payouts_enabled) return 'ready';
    return 'in_progress';
  };

  const renderPayoutBadge = (status: PayoutUiStatus) => {
    if (status === 'ready') return <Badge className="text-xs">Ready for payouts</Badge>;
    if (status === 'action_required') return <Badge variant="destructive" className="text-xs">Action required</Badge>;
    if (status === 'in_progress') return <Badge variant="secondary" className="text-xs">Onboarding in progress</Badge>;
    return <Badge variant="outline" className="text-xs">Not connected</Badge>;
  };

  const formatClassification = (classification: WorkerTaxProfile['tax_classification'] | null) => {
    if (classification === 'employee_w2') return 'W-2';
    if (classification === 'contractor_1099') return '1099';
    return 'Unspecified';
  };

  const handleConnectOrResume = async (userId: string, linkType: 'account_onboarding' | 'account_update') => {
    setConnectingUser(userId);
    const { data, error } = await supabase.functions.invoke('stripe_connect_account_link', {
      body: { worker_user_id: userId, link_type: linkType },
    });
    setConnectingUser(null);

    if (error) {
      toast({ title: 'Stripe onboarding failed', description: error.message, variant: 'destructive' });
      return;
    }

    const onboardingUrl = data?.onboarding_url;
    if (typeof onboardingUrl === 'string' && onboardingUrl.length > 0) {
      window.open(onboardingUrl, '_blank', 'noopener,noreferrer');
      toast({ title: 'Stripe onboarding link opened' });
    } else {
      toast({ title: 'No onboarding link returned', variant: 'destructive' });
    }

    fetchPayroll();
  };

  const handleRefreshStatus = async (userId: string) => {
    setSyncingUser(userId);
    const { error } = await supabase.functions.invoke('stripe_sync_payout_profile', {
      body: { worker_user_id: userId },
    });
    setSyncingUser(null);

    if (error) {
      toast({ title: 'Status refresh failed', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Payout status refreshed' });
    fetchPayroll();
  };

  const handleCreatePayoutRun = async () => {
    if (summaries.length === 0) {
      toast({ title: 'No payroll data', description: 'Select a period with shifts first.', variant: 'destructive' });
      return;
    }

    const workers = summaries
      .filter((s) => s.total_pay > 0)
      .map((s) => ({
        worker_user_id: s.user_id,
        amount: Number(s.total_pay.toFixed(2)),
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

  const handleSubmitPayoutRun = async () => {
    if (!activeRun?.id) return;
    if (activeRun.status !== 'draft') {
      toast({ title: 'Run already submitted', description: `Current status: ${activeRun.status}` });
      return;
    }

    setSubmittingRun(true);
    const { error } = await supabase.functions.invoke('stripe_submit_payout_run', {
      body: { payout_run_id: activeRun.id },
    });
    setSubmittingRun(false);

    if (error) {
      toast({ title: 'Payout submission failed', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Payout run processed' });
    await fetchRunSnapshot(activeRun.id);
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
            <div className="space-y-1">
              {runPayments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between text-xs rounded border border-border px-2 py-1">
                  <span className="truncate pr-2">{runWorkerNameMap[payment.worker_user_id] || profileMap[payment.worker_user_id]?.full_name || payment.worker_user_id}</span>
                  <span className="shrink-0">${Number(payment.amount).toFixed(2)} · {payment.status}</span>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              onClick={handleSubmitPayoutRun}
              disabled={submittingRun || activeRun.status !== 'draft' || runPayments.length === 0}
            >
              {submittingRun ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Pay Now
            </Button>
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
              <option value="stripe_connect">stripe_connect</option>
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
            <p className="text-sm font-medium">Yearly Payment History & Totals</p>
            <p className="text-xs text-muted-foreground">Source of truth: worker_payments ledger</p>
          </div>
          <div className="flex items-center gap-2">
            <Input type="number" className="w-28" min="2000" max="2100" value={reportYear} onChange={(e) => setReportYear(e.target.value)} />
            <Button variant="outline" size="sm" onClick={exportYearCsv} disabled={yearPayments.length === 0}>
              <FileDown className="h-4 w-4 mr-1" />Export CSV
            </Button>
          </div>
        </div>

        {ytdSummary.length === 0 ? (
          <p className="text-xs text-muted-foreground">No payments found for {reportYear}.</p>
        ) : (
          <div className="space-y-2">
            {ytdSummary.map((row) => {
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
            const payoutStatus = getPayoutUiStatus(cs.payout_profile);
            const isConnecting = connectingUser === cs.user_id;
            const isSyncing = syncingUser === cs.user_id;

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
                          {renderPayoutBadge(payoutStatus)}
                        </div>
                      </div>
                      <div className="text-right text-sm space-y-0.5">
                        <p>{cs.total_hours}h</p>
                        <p className="text-xs text-muted-foreground">
                          {cs.rate != null ? `$${cs.rate}/hr · ` : <span className="text-destructive">No rate · </span>}
                          <span className="font-medium text-foreground">${cs.total_pay.toFixed(2)}</span>
                        </p>
                      </div>
                    </div>
                  </Card>
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-4 pt-2 space-y-2">
                  <div className="rounded border border-border bg-card p-2">
                    <p className="text-xs font-medium mb-1">Payout setup</p>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>Connected account: {cs.payout_profile?.stripe_connected_account_id ? 'Connected' : 'Not connected'}</p>
                      <p>Details submitted: {cs.payout_profile?.details_submitted ? 'Yes' : 'No'}</p>
                      <p>Payouts enabled: {cs.payout_profile?.payouts_enabled ? 'Yes' : 'No'}</p>
                      <p>Charges enabled: {cs.payout_profile?.charges_enabled ? 'Yes' : 'No'}</p>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-2">
                      {!cs.payout_profile?.stripe_connected_account_id ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={isConnecting}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleConnectOrResume(cs.user_id, 'account_onboarding');
                          }}
                        >
                          {isConnecting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <LinkIcon className="h-3 w-3 mr-1" />}
                          Connect Stripe
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={isConnecting}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleConnectOrResume(cs.user_id, 'account_update');
                          }}
                        >
                          {isConnecting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <LinkIcon className="h-3 w-3 mr-1" />}
                          Resume Onboarding
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={isSyncing}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRefreshStatus(cs.user_id);
                        }}
                      >
                        {isSyncing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                        Refresh Status
                      </Button>
                    </div>
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
                            {sd.admin_edited_at && (
                              <Badge variant="outline" className="text-xs">Admin edited</Badge>
                            )}
                            <span className="text-sm font-medium">{sd.total_hours}h</span>
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
