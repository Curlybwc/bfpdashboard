import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface AddHistoricalPaymentDialogProps {
  profiles: { id: string; name: string }[];
  companies: { id: string; name: string; short_name: string | null }[];
  projects: { id: string; name: string }[];
  onSaved: () => void;
}

const AddHistoricalPaymentDialog = ({ profiles, companies, projects, onSaved }: AddHistoricalPaymentDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [workerId, setWorkerId] = useState('');
  const [amount, setAmount] = useState('');
  const [paidDate, setPaidDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [companyId, setCompanyId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [memo, setMemo] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  const resetForm = () => {
    setWorkerId('');
    setAmount('');
    setPaidDate(format(new Date(), 'yyyy-MM-dd'));
    setCompanyId('');
    setProjectId('');
    setMemo('');
    setPeriodStart('');
    setPeriodEnd('');
  };

  const handleSave = async () => {
    if (!user?.id || !workerId || !amount || !paidDate) return;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('save_local_historical_payment', {
        p_caller_id: user.id,
        p_worker_user_id: workerId,
        p_amount: parsedAmount,
        p_paid_date: paidDate,
        p_company_id: companyId || null,
        p_project_id: projectId || null,
        p_memo: memo || null,
        p_pay_period_start: periodStart || null,
        p_pay_period_end: periodEnd || null,
      });

      if (error) throw error;

      toast({ title: 'Payment recorded', description: `$${parsedAmount.toFixed(2)} added to ledger.` });
      resetForm();
      setOpen(false);
      onSaved();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1">
          <Plus className="h-3.5 w-3.5" />
          Add Historical Payment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Add Historical Payment</DialogTitle>
          <p className="text-xs text-muted-foreground">Record a payment made outside the app for 1099 tracking.</p>
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

          <Button
            className="w-full h-8 text-xs"
            onClick={handleSave}
            disabled={saving || !workerId || !amount || !paidDate}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Save Payment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddHistoricalPaymentDialog;
