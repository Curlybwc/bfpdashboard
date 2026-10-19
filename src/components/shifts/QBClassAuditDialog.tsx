import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldCheck } from 'lucide-react';

const STATUS_LABEL: Record<string, string> = {
  ok: 'Class verified',
  corrected_in_qb: 'Pushed without class · corrected in QuickBooks',
  missing_class: 'Missing class in QuickBooks',
  missing_class_unmapped: 'Missing class · property not linked',
  classed_in_qb_but_unmapped: 'Classed in QuickBooks · property not linked',
  wrong_class: 'Different class than saved mapping',
  cannot_check: 'Could not check',
};
const NEEDS_ACTION = new Set(['missing_class', 'missing_class_unmapped', 'wrong_class', 'classed_in_qb_but_unmapped', 'cannot_check']);

export default function QBClassAuditDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ rows: any[]; summary: Record<string, { count: number; amount: number }> } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true); setErr(null);
    const { data, error } = await supabase.functions.invoke('quickbooks_audit_bill_classes', { body: {} });
    if (error || data?.error) setErr(error?.message || data?.message || data?.error);
    else setData(data);
    setLoading(false);
  };

  const flagged = (data?.rows || []).filter((r) => r.status !== 'ok');

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o && !data) run(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><ShieldCheck className="h-4 w-4 mr-1" />Audit bill classes</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Payroll bill class audit</DialogTitle>
          <DialogDescription>Read-only. Reads each pushed bill from QuickBooks; nothing is changed or re-pushed.</DialogDescription>
        </DialogHeader>
        {loading && <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Checking bills…</div>}
        {err && <p className="text-sm text-destructive">{err}</p>}
        {data && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1">
              {Object.entries(data.summary).map(([k, v]) => (
                <Badge key={k} variant={NEEDS_ACTION.has(k) ? 'destructive' : 'outline'} className="text-[10px]">
                  {STATUS_LABEL[k] || k}: {v.count} · ${v.amount.toFixed(2)}
                </Badge>
              ))}
            </div>
            <div className="max-h-96 overflow-y-auto text-xs">
              <table className="w-full">
                <thead className="text-muted-foreground text-left">
                  <tr><th className="py-1">Pushed</th><th>Property</th><th>Bill</th><th>Amount</th><th>Class in QB</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {flagged.map((r) => (
                    <tr key={r.batch_id} className="border-t">
                      <td className="py-1">{r.exported_at?.slice(0, 10)}</td>
                      <td>{r.project_name}</td>
                      <td>{r.qb_bill_id}</td>
                      <td>${r.amount.toFixed(2)}</td>
                      <td>{(r.qb_class_names || []).join(', ') || '—'}</td>
                      <td className={NEEDS_ACTION.has(r.status) ? 'text-destructive' : ''}>{STATUS_LABEL[r.status] || r.status}{r.note ? ` (${r.note})` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {flagged.length === 0 && <p className="text-muted-foreground">All pushed bills have verified classes.</p>}
            </div>
            <Button size="sm" variant="outline" onClick={run} disabled={loading}>Re-run</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
