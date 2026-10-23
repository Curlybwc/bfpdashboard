import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { buildUnpaidRows, groupForRun, type UnpaidRow } from '@/lib/unpaidBills';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentFrom: string;
  currentTo: string;
  onChanged: () => void;
}

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const AllUnpaidBillsDialog = ({ open, onOpenChange, currentFrom, currentTo, onChanged }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<UnpaidRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // The backend returns at most 1000 rows per request, so page through every list.
      const all = async (build: (from: number, to: number) => any) => {
        const out: any[] = [];
        for (let from = 0; ; from += 1000) {
          const res = await build(from, from + 999);
          if (res.error) return { data: null, error: res.error };
          out.push(...(res.data || []));
          if (!res.data || res.data.length < 1000) return { data: out, error: null };
        }
      };
      const [shiftsRes, profilesRes, projectsRes, payRes, batchLinksRes, paymentLinksRes, batchesRes, reimbRes] = await Promise.all([
        all((a, b) => supabase.from('shifts').select('*').or('total_hours.not.is.null,is_flat_rate.eq.true').order('id').range(a, b)),
        all((a, b) => supabase.from('profiles').select('id, full_name').order('id').range(a, b)),
        all((a, b) => supabase.from('projects').select('id, name, company_id').order('id').range(a, b)),
        supabase.rpc('admin_get_profile_pay' as any),
        all((a, b) => supabase.from('worker_payable_batch_shifts').select('shift_id, payable_batch_id, voided_at, worker_payable_batches!inner(status)').is('voided_at', null).order('shift_id').order('payable_batch_id').range(a, b)),
        all((a, b) => supabase.from('worker_payment_shifts').select('shift_id, worker_payments!inner(status)').order('id').range(a, b)),
        all((a, b) => supabase.from('worker_payable_batches').select('*').in('status', ['draft', 'exported']).order('id').range(a, b)),
        all((a, b) => supabase.from('reimbursement_requests').select('*').order('id').range(a, b)),
      ]);
      const err = shiftsRes.error || profilesRes.error || projectsRes.error || batchLinksRes.error || paymentLinksRes.error || batchesRes.error || reimbRes.error;
      if (err) throw err;
      const built = buildUnpaidRows({
        shifts: (shiftsRes.data || []) as any[],
        profiles: (profilesRes.data || []) as any[],
        projects: (projectsRes.data || []) as any[],
        payRates: ((payRes.data || []) as any[]),
        batchLinks: (batchLinksRes.data || []) as any[],
        paymentLinks: (paymentLinksRes.data || []) as any[],
        unpaidBatches: (batchesRes.data || []) as any[],
        reimbursements: (reimbRes.data || []) as any[],
      });
      setRows(built);
      setSelected(new Set());
    } catch (e) {
      toast({ title: 'Could not load unpaid items', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const grandTotal = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);
  const byWorker = useMemo(() => {
    const m = new Map<string, { name: string; rows: UnpaidRow[]; total: number }>();
    for (const r of rows) {
      const g = m.get(r.workerId) ?? { name: r.workerName, rows: [], total: 0 };
      g.rows.push(r); g.total += r.amount; m.set(r.workerId, g);
    }
    return [...m.values()];
  }, [rows]);

  const selectable = rows.filter((r) =>
    !(r.kind === 'bill' && r.periodStart === currentFrom && r.periodEnd === currentTo) &&
    !(r.kind === 'reimbursement' && r.rawStatus !== 'approved'));
  const toggle = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const approveReimbursement = async (r: UnpaidRow) => {
    if (!user?.id) return;
    setSaving(true);
    const { error } = await supabase.from('reimbursement_requests')
      .update({ status: 'approved', approved_amount: r.amount, approved_at: new Date().toISOString(), approved_by: user.id })
      .eq('id', r.id.replace('reimb:', ''));
    setSaving(false);
    if (error) {
      toast({ title: 'Approval failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Approved', description: `${r.workerName} · ${money(r.amount)} — now includable in the current run` });
    await load();
  };

  const pullIntoRun = async () => {
    if (!user?.id) return;
    setSaving(true);
    const picked = rows.filter((r) => selected.has(r.id));
    try {
      // Unbilled entries → new draft bills in the current run. Entry dates are untouched.
      for (const g of groupForRun(picked.filter((r) => r.kind === 'entry'))) {
        const { data: batch, error } = await supabase.from('worker_payable_batches').insert({
          worker_user_id: g.workerId, project_id: g.projectId, company_id: g.companyId,
          period_start: currentFrom, period_end: currentTo,
          total_amount: Number(g.total.toFixed(2)), status: 'draft', created_by: user.id,
        }).select('id').single();
        if (error || !batch) throw error ?? new Error('Bill not created');
        const { error: linkErr } = await supabase.from('worker_payable_batch_shifts')
          .insert(g.shiftIds.map((shift_id) => ({ payable_batch_id: batch.id, shift_id })));
        if (linkErr) throw linkErr;
      }
      // Existing unpaid bills → move into the current run. Their entries keep their dates.
      const billIds = picked.filter((r) => r.kind === 'bill').map((r) => r.id.replace('bill:', ''));
      if (billIds.length) {
        const { error } = await supabase.from('worker_payable_batches')
          .update({ period_start: currentFrom, period_end: currentTo }).in('id', billIds);
        if (error) throw error;
      }
      // Approved reimbursements → one QuickBooks bill each on the company's reimbursement
      // expense account. The expense date stays as entered; only the payment run is current.
      const reimbIds = picked.filter((r) => r.kind === 'reimbursement' && r.rawStatus === 'approved').map((r) => r.id.replace('reimb:', ''));
      for (const reimbursement_id of reimbIds) {
        const { data, error } = await supabase.functions.invoke('quickbooks_create_reimbursement_bill', { body: { reimbursement_id } });
        if (error || data?.error) throw new Error(data?.message || error?.message || 'Reimbursement export failed');
      }
      toast({ title: 'Added to current run', description: `${picked.length} item(s) moved to ${currentFrom} → ${currentTo}` });
      onChanged();
      await load();
    } catch (e) {
      toast({ title: 'Could not add to current run', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>All Unpaid Bills</DialogTitle>
          <DialogDescription>Every unpaid entry and bill, across all pay periods.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm">Total unpaid: <span className="font-bold">{money(grandTotal)}</span> · {rows.length} item(s)</p>
          <Button size="sm" disabled={selected.size === 0 || saving || !currentFrom} onClick={pullIntoRun}>
            {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Add {selected.size || ''} to current run ({currentFrom} → {currentTo})
          </Button>
        </div>
        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nothing unpaid.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Worker/Vendor</TableHead>
                <TableHead>Property/Project</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Pay Period</TableHead>
                <TableHead>Invoice # / Purpose</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byWorker.map((g) => (
                <Fragment key={g.rows[0].workerId}>
                  {g.rows.map((r) => {
                    const canPick = selectable.includes(r);
                    return (
                      <TableRow key={r.id}>
                        <TableCell>{canPick && <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label="Select" />}</TableCell>
                        <TableCell className="text-xs">{r.workerName}</TableCell>
                        <TableCell className="text-xs">{r.projectName}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.date}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.periodStart ? `${r.periodStart} → ${r.periodEnd}` : 'Not billed'}</TableCell>
                        <TableCell className="text-xs">{[r.invoiceNo, r.purpose].filter(Boolean).join(' · ') || '—'}</TableCell>
                        <TableCell className="text-xs text-right">{money(r.amount)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 flex-wrap">
                            <Badge variant="secondary" className="text-[10px]">{r.status}</Badge>
                            {r.kind === 'reimbursement' && (r.rawStatus === 'submitted' || r.rawStatus === 'needs_info') && (
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" disabled={saving}
                                onClick={() => approveReimbursement(r)}>
                                Approve Full
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow key={`sub-${g.name}`} className="bg-muted/50">
                    <TableCell />
                    <TableCell colSpan={5} className="text-xs font-medium">{g.name} subtotal</TableCell>
                    <TableCell className="text-xs text-right font-bold">{money(g.total)}</TableCell>
                    <TableCell />
                  </TableRow>
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AllUnpaidBillsDialog;
