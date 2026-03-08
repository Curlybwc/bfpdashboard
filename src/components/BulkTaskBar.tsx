import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { TASK_STAGES, TASK_PRIORITIES, type TaskStage, type TaskPriority } from '@/lib/supabase-types';
import { X, Loader2 } from 'lucide-react';

interface BulkTaskBarProps {
  selectedIds: Set<string>;
  members: { user_id: string; profiles?: { full_name: string | null } | null }[];
  onClear: () => void;
  onDone: () => void;
}

const BulkTaskBar = ({ selectedIds, members, onClear, onDone }: BulkTaskBarProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const count = selectedIds.size;
  if (count === 0) return null;

  const ids = [...selectedIds];

  const applyUpdate = async (updates: Record<string, any>, label: string) => {
    setLoading(true);
    const { error } = await supabase
      .from('tasks')
      .update(updates)
      .in('id', ids);
    setLoading(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `${label} updated on ${count} task${count !== 1 ? 's' : ''}` });
      onDone();
    }
  };

  return (
    <div className="sticky top-0 z-30 bg-card border-b shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium text-foreground">{count} selected</span>

      <Select onValueChange={(v) => applyUpdate({ stage: v }, 'Stage')} disabled={loading}>
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue placeholder="Set Stage" />
        </SelectTrigger>
        <SelectContent>
          {TASK_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select onValueChange={(v) => applyUpdate({ priority: v }, 'Priority')} disabled={loading}>
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder="Set Priority" />
        </SelectTrigger>
        <SelectContent>
          {TASK_PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select onValueChange={(v) => {
        const assignee = v === '__unassign' ? null : v;
        applyUpdate({ assigned_to_user_id: assignee }, 'Assignee');
      }} disabled={loading}>
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder="Set Assignee" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__unassign">Unassign</SelectItem>
          {members.map(m => (
            <SelectItem key={m.user_id} value={m.user_id}>
              {m.profiles?.full_name || 'Unnamed'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

      <Button size="sm" variant="ghost" onClick={onClear} className="ml-auto">
        <X className="h-4 w-4 mr-1" />Cancel
      </Button>
    </div>
  );
};

export default BulkTaskBar;
