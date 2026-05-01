import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { TASK_STAGES, TASK_PRIORITIES, type TaskStage, type TaskPriority } from '@/lib/supabase-types';
import { X, Loader2 } from 'lucide-react';

interface BulkTaskBarProps {
  selectedIds: Set<string>;
  allVisibleIds: string[];
  members: { user_id: string; profiles?: { full_name: string | null } | null }[];
  allProfiles?: { id: string; full_name: string | null }[];
  onClear: () => void;
  onDone: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

const BulkTaskBar = ({ selectedIds, allVisibleIds, members, allProfiles, onClear, onDone, onSelectAll, onDeselectAll }: BulkTaskBarProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const count = selectedIds.size;

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

  const addCandidate = async (userId: string) => {
    if (ids.length === 0) return;
    setLoading(true);
    const rows = ids.map((task_id) => ({ task_id, user_id: userId }));
    // upsert-like: ignore duplicates by selecting existing first
    const { data: existing } = await supabase
      .from('task_candidates')
      .select('task_id')
      .eq('user_id', userId)
      .in('task_id', ids);
    const existingSet = new Set((existing || []).map((r: any) => r.task_id));
    const toInsert = rows.filter((r) => !existingSet.has(r.task_id));
    if (toInsert.length === 0) {
      setLoading(false);
      toast({ title: 'Already a candidate on all selected tasks' });
      onDone();
      return;
    }
    const { error } = await supabase.from('task_candidates').insert(toInsert);
    setLoading(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Added as candidate on ${toInsert.length} task${toInsert.length !== 1 ? 's' : ''}` });
      onDone();
    }
  };

  const candidateOptions = (allProfiles && allProfiles.length > 0)
    ? allProfiles.map((p) => ({ user_id: p.id, name: p.full_name || 'Unnamed' }))
    : members.map((m) => ({ user_id: m.user_id, name: m.profiles?.full_name || 'Unnamed' }));

  return (
    <div className="sticky top-0 z-30 bg-card border-b shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium text-foreground">{count} selected</span>

      <Button
        size="sm"
        variant="outline"
        className="text-xs"
        onClick={count === allVisibleIds.length ? onDeselectAll : onSelectAll}
      >
        {count === allVisibleIds.length ? 'Deselect All' : `Select All (${allVisibleIds.length})`}
      </Button>

      {count > 0 && (
        <>
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
            if (v === '__crew') {
              applyUpdate({ assignment_mode: 'crew', assigned_to_user_id: null, is_outside_vendor: false }, 'Crew mode');
            } else if (v === '__outside_vendor') {
              applyUpdate({ is_outside_vendor: true, assigned_to_user_id: null }, 'Outside Vendor');
            } else if (v === '__unassign') {
              applyUpdate({ assigned_to_user_id: null, is_outside_vendor: false, assignment_mode: 'solo' }, 'Assignee');
            } else {
              applyUpdate({ assigned_to_user_id: v, is_outside_vendor: false, assignment_mode: 'solo' }, 'Assignee');
            }
          }} disabled={loading}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder="Set Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unassign">Unassign</SelectItem>
              <SelectItem value="__crew">Crew Task</SelectItem>
              <SelectItem value="__outside_vendor">Outside Vendor</SelectItem>
              {members.map(m => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.profiles?.full_name || 'Unnamed'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select onValueChange={(v) => addCandidate(v)} disabled={loading}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="Add as candidate" />
            </SelectTrigger>
            <SelectContent>
              {candidateOptions.map((p) => (
                <SelectItem key={p.user_id} value={p.user_id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}

      {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

      <Button size="sm" variant="ghost" onClick={onClear} className="ml-auto">
        <X className="h-4 w-4 mr-1" />Cancel
      </Button>
    </div>
  );
};

export default BulkTaskBar;
