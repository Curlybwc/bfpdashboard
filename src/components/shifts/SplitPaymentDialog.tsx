import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Split } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SplitPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string;
  totalAmount: number;
  workerName?: string;
  onSuccess?: () => void;
}

const SplitPaymentDialog = ({
  open,
  onOpenChange,
  batchId,
  totalAmount,
  workerName,
  onSuccess,
}: SplitPaymentDialogProps) => {
  const { toast } = useToast();
  const [firstAmount, setFirstAmount] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      // Default to $1700 (the user's bank daily limit) if it fits, otherwise half.
      const suggested = totalAmount > 1700 ? 1700 : Math.floor(totalAmount / 2);
      setFirstAmount(suggested > 0 ? suggested.toFixed(2) : '');
    }
  }, [open, totalAmount]);

  const parsed = Number(firstAmount);
  const valid = !Number.isNaN(parsed) && parsed > 0 && parsed < totalAmount;
  const remainder = valid ? Math.round((totalAmount - parsed) * 100) / 100 : 0;

  const handleSubmit = async () => {
    if (!valid) return;
    setSubmitting(true);
    const { error } = await supabase.rpc('split_payable_batch', {
      p_batch_id: batchId,
      p_first_amount: parsed,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: 'Split failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: 'Payment split',
      description: `Created two bills: $${parsed.toFixed(2)} and $${remainder.toFixed(2)}.`,
    });
    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Split className="h-4 w-4" />
            Split Payment
          </DialogTitle>
          <DialogDescription>
            {workerName ? `Split ${workerName}'s ` : 'Split this '}
            ${totalAmount.toFixed(2)} bill into two separate bills you can pay on different days.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="first-amount" className="text-xs">First bill amount</Label>
            <Input
              id="first-amount"
              type="number"
              step="0.01"
              min="0.01"
              max={totalAmount - 0.01}
              value={firstAmount}
              onChange={(e) => setFirstAmount(e.target.value)}
              autoFocus
            />
          </div>

          <div className="rounded border bg-muted/30 p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">First bill</span>
              <span className="font-mono">${valid ? parsed.toFixed(2) : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Second bill (remainder)</span>
              <span className="font-mono">${valid ? remainder.toFixed(2) : '—'}</span>
            </div>
            <div className="flex justify-between border-t pt-1 mt-1">
              <span className="text-muted-foreground">Original total</span>
              <span className="font-mono">${totalAmount.toFixed(2)}</span>
            </div>
          </div>

          {!valid && firstAmount !== '' && (
            <p className="text-xs text-destructive">
              Amount must be greater than $0 and less than ${totalAmount.toFixed(2)}.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Both bills will be created as drafts. Linked shifts stay on the original bill.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!valid || submitting}>
            {submitting && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Split into two bills
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SplitPaymentDialog;