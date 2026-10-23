import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, AlertTriangle } from 'lucide-react';
import { REIMBURSEMENT_STATUS_LABEL, REIMBURSEMENT_STATUS_VARIANT, type ReimbursementStatus } from '@/lib/reimbursementStatus';

export interface ReimbursementRow {
  id: string;
  status: ReimbursementStatus;
  submitter_user_id: string;
  on_behalf_of_user_id: string | null;
  project_id: string | null;
  company_id: string | null;
  description: string;
  vendor_paid: string;
  expense_date: string;
  requested_amount: number;
  approved_amount: number | null;
  qb_bill_id: string | null;
}

export const reimbursedUserId = (r: Pick<ReimbursementRow, 'submitter_user_id' | 'on_behalf_of_user_id'>) =>
  r.on_behalf_of_user_id || r.submitter_user_id;

export const reimbursableAmount = (r: Pick<ReimbursementRow, 'requested_amount' | 'approved_amount' | 'status'>) =>
  r.status === 'approved' || r.status === 'exported' || r.status === 'paid'
    ? Number(r.approved_amount ?? r.requested_amount)
    : Number(r.requested_amount);

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  fromDate: string;
  toDate: string;
  workerFilter?: string;
}

/** Reimbursement requests whose expense date falls inside the selected pay period. */
const PayrollReimbursements = ({ fromDate, toDate, workerFilter }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<ReimbursementRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    const [rRes, pRes, projRes] = await Promise.all([
      supabase.from('reimbursement_requests').select('*')
        .gte('expense_date', fromDate).lte('expense_date', toDate)
        .order('expense_date', { ascending: true }),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('projects').select('id, name'),
    ]);
    if (rRes.error) {
      toast({ title: 'Could not load reimbursements', description: rRes.error.message, variant: 'destructive' });
    }
    setRows((rRes.data || []) as unknown as ReimbursementRow[]);
    const pMap: Record<string, string> = {};
    (pRes.data || []).forEach((p: any) => { pMap[p.id] = p.full_name || 'Unknown'; });
    setNames(pMap);
    const projMap: Record<string, string> = {};
    (projRes.data || []).forEach((p: any) => { projMap[p.id] = p.name; });
    setProjects(projMap);
    setLoading(false);
  }, [fromDate, toDate, toast]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const list = workerFilter ? rows.filter((r) => reimbursedUserId(r) === workerFilter) : rows;
    return [...list].sort((a, b) =>
      (names[reimbursedUserId(a)] || '').localeCompare(names[reimbursedUserId(b)] || '') ||
      a.expense_date.localeCompare(b.expense_date));
  }, [rows, workerFilter, names]);

  const approve = async (r: ReimbursementRow, amount: number) => {
    if (!user?.id) return;
    if (amount <= 0 || amount > Number(r.requested_amount)) {
      toast({ title: 'Invalid amount', description: 'Approved amount must be > 0 and ≤ requested.', variant: 'destructive' });
      return;
    }
    setBusyId(r.id);
    const { error } = await supabase.from('reimbursement_requests')
      .update({ status: 'approved', approved_amount: amount, approved_at: new Date().toISOString(), approved_by: user.id })
      .eq('id', r.id);
    setBusyId(null);
    if (error) { toast({ title: 'Approval failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Approved', description: `${names[reimbursedUserId(r)] || 'Worker'} · ${money(amount)}` });
    await load();
  };

  const includeInRun = async (r: ReimbursementRow) => {
    setBusyId(r.id);
    const { data, error } = await supabase.functions.invoke('quickbooks_create_reimbursement_bill', { body: { reimbursement_id: r.id } });
    setBusyId(null);
    if (error || data?.error) {
      toast({ title: 'QuickBooks export failed', description: data?.message || error?.message || 'Unknown error', variant: 'destructive' });
      await load();
      return;
    }
    toast({ title: 'Reimbursement bill created in QuickBooks', description: `Bill ${data.qb_bill_doc_number || data.qb_bill_id} · expense date kept as ${r.expense_date}` });
    await load();
  };

  if (loading) {
    return <div className="py-4 flex justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  }
  if (visible.length === 0) {
    return <p className="text-xs text-muted-foreground">No reimbursement requests with an expense date in this pay period.</p>;
  }

  const total = visible.reduce((s, r) => s + reimbursableAmount(r), 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between bg-muted/50 rounded px-3 py-2">
        <p className="text-sm font-medium">Total Reimbursements (this period)</p>
        <p className="text-lg font-bold text-primary">{money(total)}</p>
      </div>
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Worker</TableHead>
              <TableHead>Vendor Paid</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Expense Date</TableHead>
              <TableHead>Project</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => {
              const needsApproval = r.status === 'submitted' || r.status === 'needs_info';
              const canInclude = r.status === 'approved' && !r.qb_bill_id;
              return (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{names[reimbursedUserId(r)] || 'Unknown'}</TableCell>
                  <TableCell className="text-xs">{r.vendor_paid}</TableCell>
                  <TableCell className="text-xs max-w-[220px] truncate" title={r.description}>{r.description}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{r.expense_date}</TableCell>
                  <TableCell className="text-xs">{r.project_id ? projects[r.project_id] || '—' : '—'}</TableCell>
                  <TableCell className="text-xs text-right">{money(reimbursableAmount(r))}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge variant={REIMBURSEMENT_STATUS_VARIANT[r.status]} className="text-[10px]">{REIMBURSEMENT_STATUS_LABEL[r.status]}</Badge>
                      {needsApproval && (
                        <Badge variant="destructive" className="text-[10px] gap-1"><AlertTriangle className="h-3 w-3" />Needs approval</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {needsApproval && (
                        <>
                          <Button size="sm" className="h-7 text-xs" disabled={busyId === r.id}
                            onClick={() => approve(r, Number(r.requested_amount))}>
                            {busyId === r.id && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                            Approve Full
                          </Button>
                          <ApprovePartialDialog r={r} busy={busyId === r.id} onApprove={(amt) => approve(r, amt)} />
                        </>
                      )}
                      {canInclude && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busyId === r.id}
                          onClick={() => includeInRun(r)}
                          title="Creates a QuickBooks bill on the company's reimbursement expense account. The expense date stays as entered.">
                          {busyId === r.id && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                          Include in this run
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

const ApprovePartialDialog = ({ r, busy, onApprove }: { r: ReimbursementRow; busy: boolean; onApprove: (amount: number) => void }) => {
  const [amt, setAmt] = useState(String(r.requested_amount));
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="h-7 text-xs">Approve Partial</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Approve Partial Amount</DialogTitle></DialogHeader>
        <Label className="text-xs">Approved amount (≤ {money(Number(r.requested_amount))})</Label>
        <Input type="number" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)} />
        <DialogFooter>
          <Button disabled={busy} onClick={() => { onApprove(Number(amt)); setOpen(false); }}>Approve</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PayrollReimbursements;
