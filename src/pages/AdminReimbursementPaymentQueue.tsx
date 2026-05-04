import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { SETTLEMENT_METHODS, type SettlementMethod } from '@/lib/reimbursementStatus';

type Row = {
  id: string; submitter_user_id: string; on_behalf_of_user_id: string | null;
  project_id: string | null; vendor_paid: string; approved_amount: number;
  qb_bill_doc_number: string | null; qb_exported_at: string | null;
};

const AdminReimbursementPaymentQueue = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [rRes, pRes, projRes] = await Promise.all([
      supabase.from('reimbursement_requests').select('id, submitter_user_id, on_behalf_of_user_id, project_id, vendor_paid, approved_amount, qb_bill_doc_number, qb_exported_at').eq('status', 'exported').order('qb_exported_at'),
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

  return (
    <div className="container mx-auto p-4 pb-24 max-w-5xl">
      <PageHeader title="Reimbursement Payment Queue" />
      <p className="text-xs text-muted-foreground mb-4">After sending the payment, mark this reimbursement as paid. Bank feed matching and reconciliation will be handled separately in QuickBooks.</p>
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : rows.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">Nothing to pay.</Card>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <PayRow key={r.id} r={r} contractorName={profiles[r.on_behalf_of_user_id || r.submitter_user_id]} projectName={r.project_id ? projects[r.project_id] : undefined} onPaid={load} />
          ))}
        </div>
      )}
    </div>
  );
};

function PayRow({ r, contractorName, projectName, onPaid }: { r: Row; contractorName?: string; projectName?: string; onPaid: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<SettlementMethod>('Bank ACH');
  const [ref, setRef] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('admin_mark_reimbursement_paid', {
      body: { reimbursement_id: r.id, payment_date: paymentDate, settlement_method: method, external_reference: ref || null, confirmed },
    });
    setBusy(false);
    if (error || data?.error) {
      toast({ title: 'Failed', description: data?.message || error?.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Marked paid' });
    setOpen(false);
    onPaid();
  };

  return (
    <Card className="p-3 flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm">{contractorName || 'Unknown'} · ${Number(r.approved_amount).toFixed(2)}</p>
        <p className="text-xs text-muted-foreground">{r.vendor_paid}{projectName ? ` · ${projectName}` : ''}</p>
        {r.qb_bill_doc_number && <Badge variant="outline" className="mt-1">QB Bill {r.qb_bill_doc_number}</Badge>}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button size="sm">Mark Paid</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark Payment Sent</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Payment Date</Label><Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Settlement Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as SettlementMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SETTLEMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Reference (optional)</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Check #, transaction ID, etc." /></div>
            <label className="flex items-start gap-2 text-xs cursor-pointer">
              <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" />
              <span>I confirm that payment has been sent for this reimbursement. I understand that any bank feed matching or QuickBooks reconciliation will be handled separately in QuickBooks.</span>
            </label>
          </div>
          <DialogFooter>
            <Button onClick={submit} disabled={!confirmed || busy}>{busy && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Mark Paid</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default AdminReimbursementPaymentQueue;