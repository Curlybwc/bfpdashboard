import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertTriangle, CreditCard } from 'lucide-react';
import { REIMBURSEMENT_STATUS_LABEL, REIMBURSEMENT_STATUS_VARIANT, type ReimbursementStatus } from '@/lib/reimbursementStatus';
import { ReceiptViewer } from '@/components/reimbursements/ReceiptViewer';

type Row = {
  id: string; org_id: string; status: ReimbursementStatus;
  submitter_user_id: string; on_behalf_of_user_id: string | null;
  project_id: string | null; company_id: string | null;
  description: string; vendor_paid: string; expense_date: string;
  requested_amount: number; approved_amount: number | null;
  receipt_paths: string[];
  qb_bill_id: string | null; qb_bill_doc_number: string | null;
  qb_exported_at: string | null; qb_export_error: string | null;
  info_request_note: string | null; rejection_reason: string | null;
  contractor_response: string | null; admin_notes: string | null;
  created_at: string;
};

const AdminReimbursements = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const load = async () => {
    setLoading(true);
    const [rRes, pRes, projRes] = await Promise.all([
      supabase.from('reimbursement_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('projects').select('id, name'),
    ]);
    setRows((rRes.data || []) as Row[]);
    const pMap: Record<string, string> = {};
    (pRes.data || []).forEach((p: any) => { pMap[p.id] = p.full_name || 'Unknown'; });
    setProfiles(pMap);
    const projMap: Record<string, string> = {};
    (projRes.data || []).forEach((p: any) => { projMap[p.id] = p.name; });
    setProjects(projMap);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => statusFilter === 'all' ? rows : rows.filter(r => r.status === statusFilter), [rows, statusFilter]);

  return (
    <div className="container mx-auto p-4 pb-24 max-w-5xl">
      <PageHeader title="Reimbursements" />
      <div className="flex items-center justify-between mb-4 gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(REIMBURSEMENT_STATUS_LABEL) as ReimbursementStatus[]).map(s => (
              <SelectItem key={s} value={s}>{REIMBURSEMENT_STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Link to="/admin/reimbursements/payment-queue">
          <Button variant="outline"><CreditCard className="h-4 w-4 mr-2" />Payment Queue</Button>
        </Link>
      </div>

      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <div className="space-y-3">
          {filtered.map(r => (
            <AdminReimbursementCard
              key={r.id} r={r} profiles={profiles} projects={projects}
              allRows={rows} onChanged={load}
            />
          ))}
          {filtered.length === 0 && <Card className="p-4 text-sm text-muted-foreground">No reimbursements.</Card>}
        </div>
      )}
    </div>
  );
};

function AdminReimbursementCard({ r, profiles, projects, allRows, onChanged }: { r: Row; profiles: Record<string, string>; projects: Record<string, string>; allRows: Row[]; onChanged: () => void }) {
  const { toast } = useToast();
  const reimbursedId = r.on_behalf_of_user_id || r.submitter_user_id;
  const reimbursedName = profiles[reimbursedId] || 'Unknown';
  const projectName = r.project_id ? projects[r.project_id] : null;

  const dup = allRows.find(o => o.id !== r.id
    && (o.on_behalf_of_user_id || o.submitter_user_id) === reimbursedId
    && o.vendor_paid === r.vendor_paid && o.expense_date === r.expense_date
    && Number(o.requested_amount) === Number(r.requested_amount));

  const [approveAmt, setApproveAmt] = useState(String(r.requested_amount));
  const [infoNote, setInfoNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);

  const update = async (patch: any, successMsg: string) => {
    setBusy(true);
    const { error } = await supabase.from('reimbursement_requests').update(patch).eq('id', r.id);
    setBusy(false);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return false; }
    toast({ title: successMsg });
    onChanged();
    return true;
  };

  const approve = async (amount: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (amount <= 0 || amount > Number(r.requested_amount)) {
      toast({ title: 'Invalid amount', description: 'Approved amount must be > 0 and ≤ requested.', variant: 'destructive' });
      return;
    }
    await update({ status: 'approved', approved_amount: amount, approved_at: new Date().toISOString(), approved_by: user?.id }, 'Approved');
  };

  const requestInfo = async () => {
    if (!infoNote.trim()) return;
    await update({ status: 'needs_info', info_request_note: infoNote.trim() }, 'Info requested');
  };

  const reject = async () => {
    if (!rejectReason.trim()) return;
    await update({ status: 'not_approved', rejection_reason: rejectReason.trim() }, 'Marked not approved');
  };

  const voidRequest = async () => {
    if (r.status === 'paid') { toast({ title: 'Cannot void paid reimbursement', variant: 'destructive' }); return; }
    if (r.status === 'exported') {
      if (!confirm(`A QuickBooks bill (${r.qb_bill_doc_number || r.qb_bill_id}) exists. Void it in QuickBooks first, then confirm here.`)) return;
    } else {
      if (!confirm('Void this reimbursement?')) return;
    }
    await update({ status: 'voided' }, 'Voided');
  };

  const createBill = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('quickbooks_create_reimbursement_bill', { body: { reimbursement_id: r.id } });
    setBusy(false);
    if (error || data?.error) {
      toast({ title: 'QuickBooks export failed', description: data?.message || error?.message || 'Unknown error', variant: 'destructive' });
      onChanged();
      return;
    }
    toast({ title: 'QuickBooks bill created', description: `Bill ${data.qb_bill_doc_number || data.qb_bill_id}` });
    onChanged();
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium">{reimbursedName}</p>
            <Badge variant={REIMBURSEMENT_STATUS_VARIANT[r.status]}>{REIMBURSEMENT_STATUS_LABEL[r.status]}</Badge>
            {dup && <Badge variant="outline" className="gap-1"><AlertTriangle className="h-3 w-3" />Possible duplicate</Badge>}
          </div>
          <p className="text-sm">{r.vendor_paid} · ${Number(r.requested_amount).toFixed(2)} · {r.expense_date}{projectName ? ` · ${projectName}` : ''}</p>
          <p className="text-xs text-muted-foreground mt-1">{r.description}</p>
          {r.contractor_response && <p className="text-xs mt-1 italic">Contractor reply: {r.contractor_response}</p>}
          {r.qb_export_error && <p className="text-xs text-destructive mt-1">QB error: {r.qb_export_error}</p>}
          {r.qb_bill_doc_number && <p className="text-xs text-muted-foreground mt-1">QB Bill: {r.qb_bill_doc_number}</p>}
        </div>
      </div>

      {dup && <p className="text-xs text-muted-foreground">This may be a duplicate receipt. Please review before approval.</p>}

      <ReceiptViewer reimbursementId={r.id} paths={r.receipt_paths} />

      <div className="flex flex-wrap gap-2">
        {(r.status === 'submitted' || r.status === 'needs_info') && (
          <>
            <Button size="sm" onClick={() => approve(Number(r.requested_amount))} disabled={busy}>Approve Full (${Number(r.requested_amount).toFixed(2)})</Button>
            <Dialog>
              <DialogTrigger asChild><Button size="sm" variant="outline">Approve Partial</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Approve Partial Amount</DialogTitle></DialogHeader>
                <Label className="text-xs">Approved amount (≤ ${Number(r.requested_amount).toFixed(2)})</Label>
                <Input type="number" step="0.01" value={approveAmt} onChange={(e) => setApproveAmt(e.target.value)} />
                <DialogFooter><Button onClick={() => approve(Number(approveAmt))}>Approve</Button></DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog>
              <DialogTrigger asChild><Button size="sm" variant="outline">Request More Info</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Request More Info</DialogTitle></DialogHeader>
                <Textarea value={infoNote} onChange={(e) => setInfoNote(e.target.value)} placeholder="What additional info do you need?" />
                <DialogFooter><Button onClick={requestInfo}>Send Request</Button></DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog>
              <DialogTrigger asChild><Button size="sm" variant="destructive">Not Approved</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Reject Reimbursement</DialogTitle></DialogHeader>
                <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection (visible to contractor)" />
                <DialogFooter><Button variant="destructive" onClick={reject}>Reject</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
        {r.status === 'approved' && (
          <Button size="sm" onClick={createBill} disabled={busy}>
            {busy && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {r.qb_export_error ? 'Retry QuickBooks Export' : 'Create QuickBooks Bill'}
          </Button>
        )}
        {r.status === 'exported' && (
          <Link to="/admin/reimbursements/payment-queue"><Button size="sm">Mark Paid in Queue</Button></Link>
        )}
        {r.status !== 'paid' && r.status !== 'voided' && (
          <Button size="sm" variant="ghost" onClick={voidRequest}>Void</Button>
        )}
      </div>
    </Card>
  );
}

export default AdminReimbursements;