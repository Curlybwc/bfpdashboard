import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, CheckCircle } from 'lucide-react';

export interface PreSyncResult {
  batch_id: string;
  success: boolean;
  ready?: boolean;
  error?: string;
  project_name?: string;
  worker_name?: string;
  vendor_name?: string;
  class_name?: string | null;
  amount?: number;
}

export async function runPreSyncCheck(batchIds: string[]): Promise<PreSyncResult[]> {
  const { data, error } = await supabase.functions.invoke('quickbooks_export_payables', {
    body: { batch_ids: batchIds, dry_run: true },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.message || data.error);
  return data?.results || [];
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  results: PreSyncResult[] | null;
  labelFor?: (batchId: string) => string;
  onPush: (readyIds: string[]) => Promise<void>;
}

export default function QBPreSyncDialog({ open, onOpenChange, results, labelFor, onPush }: Props) {
  const [pushing, setPushing] = useState(false);
  const ready = (results || []).filter((r) => r.success && r.ready);
  const blocked = (results || []).filter((r) => !r.success);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>QuickBooks pre-sync check</DialogTitle>
          <DialogDescription>
            {ready.length} ready · {blocked.length} need attention. Entries that need attention will not be pushed.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto space-y-2">
          {blocked.map((r) => (
            <div key={r.batch_id} className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs">
              <div className="flex items-center gap-1 font-medium text-destructive">
                <AlertTriangle className="h-3 w-3" /> Needs attention{labelFor ? ` · ${labelFor(r.batch_id)}` : ''}
              </div>
              <p className="mt-1">{r.error}</p>
            </div>
          ))}
          {ready.map((r) => (
            <div key={r.batch_id} className="rounded border p-2 text-xs">
              <div className="flex items-center gap-1 font-medium">
                <CheckCircle className="h-3 w-3 text-primary" /> Ready · {r.worker_name} · {r.project_name}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge variant="outline" className="text-[10px]">Vendor: {r.vendor_name || '—'}</Badge>
                <Badge variant="outline" className="text-[10px]">Class: {r.class_name || '—'}</Badge>
                {r.amount != null && <Badge variant="outline" className="text-[10px]">${r.amount.toFixed(2)}</Badge>}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={ready.length === 0 || pushing}
            onClick={async () => {
              setPushing(true);
              try { await onPush(ready.map((r) => r.batch_id)); } finally { setPushing(false); }
              onOpenChange(false);
            }}
          >
            {pushing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Push {ready.length} ready
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
