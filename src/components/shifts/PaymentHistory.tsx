import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, DollarSign, Building2, Calendar, User, FolderOpen, X, Upload, CheckCircle } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

type PaymentRow = {
  id: string;
  worker_user_id: string;
  amount: number;
  paid_date: string;
  payment_source: string;
  status: string;
  memo: string | null;
  company_id: string | null;
  project_id: string | null;
  external_reference: string | null;
  qb_txn_type: string | null;
  pay_period_start: string | null;
  pay_period_end: string | null;
  created_at: string;
};

type BatchRow = {
  id: string;
  worker_user_id: string;
  total_amount: number;
  paid_at: string | null;
  status: string;
  company_id: string | null;
  project_id: string | null;
  period_start: string;
  period_end: string;
  qb_bill_id: string | null;
  qb_bill_doc_number: string | null;
  qb_exported_at: string | null;
  settlement_method: string | null;
  accounting_source: string | null;
  created_at: string;
};

type DraftCategory = 'qb_export' | 'manual';

type UnifiedPayment = {
  id: string;
  source: 'payment' | 'batch';
  batchStatus?: string;
  draftCategory?: DraftCategory;
  workerUserId: string;
  workerName: string;
  amount: number;
  paidDate: string;
  paymentMethod: string;
  projectId: string | null;
  projectName: string | null;
  companyId: string | null;
  companyName: string | null;
  memo: string | null;
  qbRef: string | null;
  qbBillId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
};

interface PaymentHistoryProps {
  workerFilter?: string;
}

const PaymentHistory = ({ workerFilter }: PaymentHistoryProps) => {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<UnifiedPayment[]>([]);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  // Filters
  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [contractorFilter, setContractorFilter] = useState<string>(workerFilter || '');
  const [projectFilter, setProjectFilter] = useState<string>('');

  // Lookup maps
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [companies, setCompanies] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    setLoading(true);

    const [profilesRes, projectsRes, companiesRes, paymentsRes, batchesRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('is_active', true),
      supabase.from('projects').select('id, name'),
      supabase.from('companies').select('id, name, short_name'),
      supabase
        .from('worker_payments')
        .select('id, worker_user_id, amount, paid_date, payment_source, status, memo, company_id, project_id, external_reference, qb_txn_type, pay_period_start, pay_period_end, created_at')
        .eq('status', 'paid')
        .gte('paid_date', dateFrom)
        .lte('paid_date', dateTo)
        .order('paid_date', { ascending: false }),
      supabase
        .from('worker_payable_batches')
        .select('id, worker_user_id, total_amount, paid_at, status, company_id, project_id, period_start, period_end, qb_bill_id, qb_bill_doc_number, qb_exported_at, settlement_method, accounting_source, created_at')
        .in('status', ['draft', 'paid', 'exported'])
        .gte('period_start', dateFrom)
        .lte('period_end', dateTo)
        .order('created_at', { ascending: false }),
    ]);

    const profMap: Record<string, string> = {};
    (profilesRes.data || []).forEach((p: any) => { profMap[p.id] = p.full_name || 'Unknown'; });
    setProfiles(profMap);

    const projMap: Record<string, string> = {};
    (projectsRes.data || []).forEach((p: any) => { projMap[p.id] = p.name; });
    setProjects(projMap);

    const compMap: Record<string, string> = {};
    (companiesRes.data || []).forEach((c: any) => { compMap[c.id] = c.short_name || c.name; });
    setCompanies(compMap);

    const unified: UnifiedPayment[] = [];

    // Worker payments
    (paymentsRes.data || []).forEach((p: PaymentRow) => {
      unified.push({
        id: p.id,
        source: 'payment',
        workerUserId: p.worker_user_id,
        workerName: profMap[p.worker_user_id] || 'Unknown',
        amount: Number(p.amount),
        paidDate: p.paid_date,
        paymentMethod: formatPaymentSource(p.payment_source),
        projectId: p.project_id,
        projectName: p.project_id ? (projMap[p.project_id] || 'Unknown Project') : null,
        companyId: p.company_id,
        companyName: p.company_id ? (compMap[p.company_id] || 'Unknown') : null,
        memo: p.memo,
        qbRef: p.external_reference || null,
        qbBillId: null,
        periodStart: p.pay_period_start,
        periodEnd: p.pay_period_end,
      });
    });

    // Batches (draft, paid, exported) — deduplicate against worker_payments
    (batchesRes.data || []).forEach((b: BatchRow) => {
      const hasDuplicate = unified.some(
        (u) =>
          u.workerUserId === b.worker_user_id &&
          u.projectId === b.project_id &&
          u.periodStart === b.period_start &&
          u.periodEnd === b.period_end &&
          Math.abs(u.amount - Number(b.total_amount)) < 0.01
      );
      if (hasDuplicate) return;

      const isManual = b.settlement_method === 'off_platform_manual';
      const wasQbExport = !!b.qb_bill_id || b.accounting_source === 'quickbooks' || b.qb_exported_at;
      // Any batch without a QB bill is eligible for QB export
      const needsQbExport = !b.qb_bill_id && !b.qb_exported_at;
      const draftCat: DraftCategory = needsQbExport ? 'qb_export' : (isManual ? 'manual' : 'qb_export');

      const resolvePaymentMethod = (): string => {
        if (b.status === 'draft') return isManual ? 'Off-Platform' : 'QB Export';
        if (b.status === 'exported') return 'QB Bill';
        // status === 'paid': check if it originated from a QB export
        if (wasQbExport) return 'QB Bill';
        if (isManual) return 'Off-Platform';
        return b.settlement_method || 'Manual';
      };

      unified.push({
        id: b.id,
        source: 'batch',
        batchStatus: b.status,
        draftCategory: (b.status === 'draft' || (b.status === 'paid' && !b.qb_bill_id)) ? draftCat : undefined,
        workerUserId: b.worker_user_id,
        workerName: profMap[b.worker_user_id] || 'Unknown',
        amount: Number(b.total_amount),
        paidDate: b.paid_at ? b.paid_at.slice(0, 10) : b.period_end,
        paymentMethod: resolvePaymentMethod(),
        projectId: b.project_id,
        projectName: b.project_id ? (projMap[b.project_id] || 'Unknown Project') : null,
        companyId: b.company_id,
        companyName: b.company_id ? (compMap[b.company_id] || 'Unknown') : null,
        memo: b.qb_bill_doc_number ? `Bill #${b.qb_bill_doc_number}` : null,
        qbRef: b.qb_bill_id || null,
        qbBillId: b.qb_bill_id || null,
        periodStart: b.period_start,
        periodEnd: b.period_end,
      });
    });

    // Sort: drafts first, then by date descending
    unified.sort((a, b) => {
      const aDraft = a.batchStatus === 'draft' ? 0 : 1;
      const bDraft = b.batchStatus === 'draft' ? 0 : 1;
      if (aDraft !== bDraft) return aDraft - bDraft;
      return b.paidDate.localeCompare(a.paidDate);
    });

    setPayments(unified);
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => { loadData(); }, [loadData]);

  // Apply client-side filters
  const filtered = useMemo(() => {
    let result = payments;
    const wf = workerFilter || contractorFilter;
    if (wf) result = result.filter((p) => p.workerUserId === wf);
    if (projectFilter) result = result.filter((p) => p.projectId === projectFilter);
    return result;
  }, [payments, contractorFilter, projectFilter, workerFilter]);

  const totalAmount = useMemo(() => filtered.reduce((s, p) => s + p.amount, 0), [filtered]);
  const qbExportable = useMemo(() => filtered.filter((p) => {
    if (p.draftCategory !== 'qb_export') return false;
    // Draft batches or paid batches that haven't been exported to QB yet
    return p.batchStatus === 'draft' || (p.batchStatus === 'paid' && !p.qbBillId);
  }), [filtered]);
  const manualDrafts = useMemo(() => filtered.filter((p) => p.batchStatus === 'draft' && p.draftCategory === 'manual'), [filtered]);
  const qbExportableTotal = useMemo(() => qbExportable.reduce((s, p) => s + p.amount, 0), [qbExportable]);
  const manualDraftTotal = useMemo(() => manualDrafts.reduce((s, p) => s + p.amount, 0), [manualDrafts]);

  // Get unique contractors and projects for filter dropdowns
  const contractorOptions = useMemo(() => {
    const unique = new Map<string, string>();
    payments.forEach((p) => unique.set(p.workerUserId, p.workerName));
    return Array.from(unique.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [payments]);

  const projectOptions = useMemo(() => {
    const unique = new Map<string, string>();
    payments.forEach((p) => { if (p.projectId && p.projectName) unique.set(p.projectId, p.projectName); });
    return Array.from(unique.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [payments]);

  // Date presets
  const setPreset = (preset: string) => {
    const now = new Date();
    if (preset === 'this_month') {
      setDateFrom(format(startOfMonth(now), 'yyyy-MM-dd'));
      setDateTo(format(endOfMonth(now), 'yyyy-MM-dd'));
    } else if (preset === 'last_month') {
      const last = subMonths(now, 1);
      setDateFrom(format(startOfMonth(last), 'yyyy-MM-dd'));
      setDateTo(format(endOfMonth(last), 'yyyy-MM-dd'));
    } else if (preset === 'last_3_months') {
      setDateFrom(format(startOfMonth(subMonths(now, 2)), 'yyyy-MM-dd'));
      setDateTo(format(endOfMonth(now), 'yyyy-MM-dd'));
    } else if (preset === 'ytd') {
      setDateFrom(`${now.getFullYear()}-01-01`);
      setDateTo(format(now, 'yyyy-MM-dd'));
    }
  };

  const handleExportQBDrafts = async (batchIds?: string[]) => {
    const ids = batchIds || qbExportable.map((d) => d.id);
    if (ids.length === 0) return;
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('quickbooks_export_payables', {
        body: { batch_ids: ids },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: 'Export successful',
        description: `${data?.bills_created || ids.length} bill(s) exported to QuickBooks.`,
      });
      loadData();
    } catch (err: any) {
      toast({
        title: 'Export failed',
        description: err.message || 'Could not export to QuickBooks.',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  const handleMarkManualPaid = async () => {
    if (manualDrafts.length === 0) return;
    setExporting(true);
    try {
      const batchIds = manualDrafts.map((d) => d.id);
      for (const id of batchIds) {
        const { error } = await supabase
          .from('worker_payable_batches')
          .update({ status: 'paid', paid_at: new Date().toISOString(), settlement_method: 'off_platform_manual' })
          .eq('id', id);
        if (error) throw error;
      }
      toast({
        title: 'Marked as paid',
        description: `${batchIds.length} off-platform payment(s) marked as paid.`,
      });
      loadData();
    } catch (err: any) {
      toast({
        title: 'Update failed',
        description: err.message || 'Could not mark payments as paid.',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="flex items-center gap-1">
            <Input type="date" className="h-7 text-xs w-[130px]" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" className="h-7 text-xs w-[130px]" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="flex gap-1">
            {[
              { label: 'This Month', value: 'this_month' },
              { label: 'Last Month', value: 'last_month' },
              { label: '3 Months', value: 'last_3_months' },
              { label: 'YTD', value: 'ytd' },
            ].map((p) => (
              <Button key={p.value} size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setPreset(p.value)}>
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!workerFilter && (
            <div className="flex items-center gap-1">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <Select value={contractorFilter} onValueChange={setContractorFilter}>
                <SelectTrigger className="h-7 text-xs w-[160px]">
                  <SelectValue placeholder="All contractors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All contractors</SelectItem>
                  {contractorOptions.map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {contractorFilter && contractorFilter !== 'all' && (
                <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => setContractorFilter('')}>
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}

          <div className="flex items-center gap-1">
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="h-7 text-xs w-[160px]">
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projectOptions.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {projectFilter && projectFilter !== 'all' && (
              <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => setProjectFilter('')}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* QB Export drafts bar */}
      {qbExportable.length > 0 && (
        <Card className="p-3 flex items-center justify-between border-primary/20 bg-primary/5">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs border-primary/30 text-primary">
              {qbExportable.length} pending QB export{qbExportable.length !== 1 ? 's' : ''}
            </Badge>
            <span className="text-sm text-muted-foreground">
              ${qbExportableTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pending export
            </span>
          </div>
          <Button
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => handleExportQBDrafts()}
            disabled={exporting}
          >
            {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            Export to QB
          </Button>
        </Card>
      )}

      {/* Manual / off-platform drafts bar */}
      {manualDrafts.length > 0 && (
        <Card className="p-3 flex items-center justify-between border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs border-amber-300 text-amber-800 dark:text-amber-200">
              {manualDrafts.length} Off-Platform
            </Badge>
            <span className="text-sm text-muted-foreground">
              ${manualDraftTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pending
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={handleMarkManualPaid}
            disabled={exporting}
          >
            {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
            Mark All Paid
          </Button>
        </Card>
      )}

      {/* Summary */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filtered.length} payment{filtered.length !== 1 ? 's' : ''}
        </p>
        <Badge variant="outline" className="text-sm font-mono">
          <DollarSign className="h-3 w-3 mr-0.5" />
          {totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Badge>
      </div>

      {/* Payment List */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No payments found for the selected filters.
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <Card key={`${p.source}-${p.id}`} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{p.workerName}</p>
                    <Badge variant="secondary" className="text-[10px]">{p.paymentMethod}</Badge>
                    {p.batchStatus === 'draft' && (
                      <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-300">
                        Draft
                      </Badge>
                    )}
                    {p.companyName && (
                      <Badge variant="outline" className="text-[10px] gap-0.5">
                        <Building2 className="h-2.5 w-2.5" />{p.companyName}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <span>{format(new Date(p.paidDate + 'T00:00:00'), 'MMM d, yyyy')}</span>
                    {p.projectName && <span>· {p.projectName}</span>}
                    {p.periodStart && p.periodEnd && (
                      <span>· Period: {format(new Date(p.periodStart + 'T00:00:00'), 'M/d')}–{format(new Date(p.periodEnd + 'T00:00:00'), 'M/d')}</span>
                    )}
                  </div>
                  {p.memo && <p className="text-xs text-muted-foreground truncate">{p.memo}</p>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className="text-sm font-mono font-medium whitespace-nowrap">
                    ${p.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  {p.source === 'batch' && p.draftCategory === 'qb_export' && !p.qbBillId && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] gap-1"
                      onClick={() => handleExportQBDrafts([p.id])}
                      disabled={exporting}
                    >
                      {exporting ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Upload className="h-2.5 w-2.5" />}
                      Export to QB
                    </Button>
                  )}
                </div>
          ))}
        </div>
      )}
    </div>
  );
};

function formatPaymentSource(source: string): string {
  switch (source) {
    case 'stripe_connect': return 'Stripe';
    case 'manual_quickbooks': return 'Manual (QB)';
    case 'quickbooks_linked': return 'QB Linked';
    case 'venmo_manual': return 'Venmo';
    default: return source.replace(/_/g, ' ');
  }
}

export default PaymentHistory;
