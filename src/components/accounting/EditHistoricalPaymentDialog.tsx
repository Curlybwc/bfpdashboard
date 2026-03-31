import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { AccountingPayment } from '@/hooks/useAccountingPayments';

interface EditHistoricalPaymentDialogProps {
  payment: AccountingPayment | null;
  profiles: { id: string; name: string }[];
  companies: { id: string; name: string; short_name: string | null }[];
  projects: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}

const EditHistoricalPaymentDialog = ({ payment, profiles, companies, projects, onClose, onSaved }: EditHistoricalPaymentDialogProps) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [workerId, setWorkerId] = useState('');
  const [amount, setAmount] = useState('');
  const [paidDate, setPaidDate] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [memo, setMemo] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  useEffect(() => {
    if (payment) {
      setWorkerId(payment.worker_user_id);
      setAmount(String(payment.amount));
      setPaidDate(payment.paid_date);
      setCompanyId(payment.company_id ?? 'none');
      setProjectId(payment.project_id ?? 'none');
      setMemo(payment.memo ?? '');
      setPeriodStart(payment.pay_period_start ?? '');
      setPeriodEnd(payment.pay_period_end ?? '');
      setConfirmDelete(false);
    }
  }, [payment]);

  const handleSave = async () => {
    if (!payment || !workerId || !amount || !paidDate) return;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('worker_payments')
        .update({
          worker_user_id: workerId,
          amount: parsedAmount,
          paid_date: paidDate,
          company_id: companyId === 'none' ? null : companyId,
          project_id: projectId === 'none' ? null : projectId,
          memo: memo || null,
          pay_period_start: periodStart || null,
          pay_period_end: periodEnd || null,
        })
        .eq('id', payment.id);

      if (error) throw error;

      toast({ title: 'Payment updated' });
      onClose();
      onSaved();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!payment) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setDeleting(true);
    try {
      const { error } = await supabase
        .from('worker_payments')
        .delete()
        .eq('id', payment.id);

      if (error) throw error;

      toast({ title: 'Payment deleted' });
      onClose();
      onSaved();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={!!payment} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Edit Historical Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1">
            <Label className="text-xs">Contractor *</Label>
            <Select value={workerId} onValueChange={setWorkerId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select contractor" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Amount *</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                className="h-8 text-xs"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Paid Date *</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Company</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.short_name ?? c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Period Start</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Period End</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Memo</Label>
            <Textarea
              className="text-xs min-h-[60px]"
              placeholder="e.g. Check #1234, Venmo transfer, etc."
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={handleDelete}
              disabled={saving || deleting}
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {confirmDelete ? 'Confirm Delete' : 'Delete'}
            </Button>
            <div className="flex-1" />
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={handleSave}
              disabled={saving || deleting || !workerId || !amount || !paidDate}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditHistoricalPaymentDialog;
