import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StatusBadge from '@/components/StatusBadge';
import { Pencil, Check, X, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TASK_STAGES, TASK_PRIORITIES, type TaskStage, type TaskPriority } from '@/lib/supabase-types';
import SyncToLibraryDialog from '@/components/SyncToLibraryDialog';

interface SubtaskRowProps {
  child: any;
  projectId: string;
  projectMembers: { user_id: string; role: string; profiles: { full_name: string | null } | null }[];
  canEdit: boolean;
  onNavigate: () => void;
  onUpdated: () => void;
}

const SubtaskRow = ({ child, projectId, projectMembers, canEdit, onNavigate, onUpdated }: SubtaskRowProps) => {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [taskText, setTaskText] = useState(child.task);
  const [stage, setStage] = useState<TaskStage>(child.stage);
  const [priority, setPriority] = useState<TaskPriority>(child.priority);
  const [assignedTo, setAssignedTo] = useState<string>(
    child.assignment_mode === 'crew' ? 'crew' : child.is_outside_vendor ? 'outside_vendor' : (child.assigned_to_user_id || 'unassigned')
  );
  const [crewCandidates, setCrewCandidates] = useState<string[]>([]);
  const [loadingCrewCandidates, setLoadingCrewCandidates] = useState(false);

  // Sync prompt state
  const [syncPromptOpen, setSyncPromptOpen] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [pendingSyncData, setPendingSyncData] = useState<{
    taskText: string; stage: TaskStage; priority: TaskPriority;
    assignedTo: string; crewCandidates: string[];
  } | null>(null);

  const loadCrewCandidates = async () => {
    setLoadingCrewCandidates(true);
    const { data, error } = await supabase
      .from('task_candidates')
      .select('user_id')
      .eq('task_id', child.id);

    if (error) {
      toast({ title: 'Error loading crew', description: error.message, variant: 'destructive' });
      setLoadingCrewCandidates(false);
      return;
    }

    const candidateIds = (data || []).map((c) => c.user_id);
    if (candidateIds.length === 0 && child.lead_user_id) {
      candidateIds.push(child.lead_user_id);
    }
    setCrewCandidates(Array.from(new Set(candidateIds)));
    setLoadingCrewCandidates(false);
  };

  const handleStartEdit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setTaskText(child.task);
    setStage(child.stage);
    setPriority(child.priority);
    const initialAssignedTo = child.assignment_mode === 'crew'
      ? 'crew'
      : child.is_outside_vendor
        ? 'outside_vendor'
        : (child.assigned_to_user_id || 'unassigned');
    setAssignedTo(initialAssignedTo);
    setCrewCandidates([]);
    setEditing(true);
    if (initialAssignedTo === 'crew') {
      await loadCrewCandidates();
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const isCrew = assignedTo === 'crew';
    const isVendor = assignedTo === 'outside_vendor';
    const newAssignedTo = assignedTo === 'unassigned' || isVendor || isCrew ? null : assignedTo;

    if (isCrew && crewCandidates.length === 0) {
      toast({ title: 'Add crew members', description: 'Select at least one crew member.', variant: 'destructive' });
      setSaving(false);
      return;
    }

    const updates: any = {
      task: taskText.trim(),
      stage,
      priority,
      assigned_to_user_id: newAssignedTo,
      is_outside_vendor: isVendor,
      assignment_mode: isCrew ? 'crew' : 'solo',
      lead_user_id: isCrew ? (crewCandidates[0] || null) : null,
    };

    // Handle stage lifecycle timestamps
    if (stage === 'Done' && child.stage !== 'Done') {
      updates.completed_at = new Date().toISOString();
    } else if (stage !== 'Done' && child.completed_at) {
      updates.completed_at = null;
    }

    const { error } = await supabase.from('tasks').update(updates).eq('id', child.id);
    if (error) {
      setSaving(false);
      toast({ title: 'Error saving subtask', description: error.message, variant: 'destructive' });
      return;
    }

    if (isCrew) {
      await supabase.from('task_candidates').delete().eq('task_id', child.id);
      const candidateRows = crewCandidates.map((user_id) => ({ task_id: child.id, user_id }));
      if (candidateRows.length > 0) {
        const { error: candidateError } = await supabase
          .from('task_candidates')
          .upsert(candidateRows, { onConflict: 'task_id,user_id' });
        if (candidateError) {
          setSaving(false);
          toast({ title: 'Error saving crew', description: candidateError.message, variant: 'destructive' });
          return;
        }
      }
    } else {
      await Promise.all([
        supabase.from('task_candidates').delete().eq('task_id', child.id),
        supabase.from('task_workers').delete().eq('task_id', child.id),
      ]);
    }

    setSaving(false);
    setEditing(false);
    onUpdated();

    // Check if this subtask is connected to a recipe step and prompt sync
    if (child.source_recipe_step_id || child.source_recipe_id || child.recipe_hint_id) {
      setPendingSyncData({
        taskText: taskText.trim(), stage, priority,
        assignedTo, crewCandidates: [...crewCandidates],
      });
      setSyncPromptOpen(true);
    }
  };

  const handleSyncConfirm = async () => {
    if (!pendingSyncData) return;
    setSyncLoading(true);

    // Sync to recipe step if source_recipe_step_id exists
    if (child.source_recipe_step_id) {
      const isCrew = pendingSyncData.assignedTo === 'crew';
      const stepUpdate: any = {
        title: pendingSyncData.taskText,
        assignment_mode: isCrew ? 'crew' : 'solo',
      };
      if (isCrew && pendingSyncData.crewCandidates.length > 0) {
        stepUpdate.default_candidate_user_ids = pendingSyncData.crewCandidates;
      }
      // Also sync trade from the child task
      if (child.trade) {
        stepUpdate.trade = child.trade;
      }

      const { error } = await supabase
        .from('task_recipe_steps')
        .update(stepUpdate)
        .eq('id', child.source_recipe_step_id);

      if (error) {
        toast({ title: 'Sync failed', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Recipe step updated' });
      }
    }

    // If it has a recipe_hint_id, sync metadata to the recipe
    if (child.recipe_hint_id) {
      const recipeUpdate: any = {};
      if (child.trade) recipeUpdate.trade = child.trade;
      if (Object.keys(recipeUpdate).length > 0) {
        await supabase.from('task_recipes').update(recipeUpdate).eq('id', child.recipe_hint_id);
      }
    }

    setSyncLoading(false);
    setSyncPromptOpen(false);
    setPendingSyncData(null);
  };

  const handleCancel = () => {
    setTaskText(child.task);
    setStage(child.stage);
    setPriority(child.priority);
    setAssignedTo(child.assignment_mode === 'crew' ? 'crew' : child.is_outside_vendor ? 'outside_vendor' : (child.assigned_to_user_id || 'unassigned'));
    setCrewCandidates([]);
    setEditing(false);
  };

  if (!editing) {
    return (
      <>
        <div className="text-sm border rounded px-3 py-2 flex items-center justify-between gap-2 hover:bg-muted/50 group">
          <div className="flex-1 min-w-0 cursor-pointer" onClick={onNavigate}>
            <span className="truncate block">{child.task}</span>
            {child.assigned_to_user_id && (
              <span className="text-[11px] text-muted-foreground">
                {projectMembers.find(m => m.user_id === child.assigned_to_user_id)?.profiles?.full_name || 'Assigned'}
              </span>
            )}
            {child.is_outside_vendor && (
              <span className="text-[11px] text-muted-foreground">Outside Vendor</span>
            )}
            {child.assignment_mode === 'crew' && (
              <span className="text-[11px] text-muted-foreground">Crew Task</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <StatusBadge status={child.stage} />
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={handleStartEdit}
              >
                <Pencil className="h-3 w-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={onNavigate}
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <SyncToLibraryDialog
          open={syncPromptOpen}
          onOpenChange={setSyncPromptOpen}
          title="Update Recipe Step?"
          description="This subtask originated from a recipe. Would you like to sync these changes (title, assignment) back to the recipe template?"
          loading={syncLoading}
          onConfirm={handleSyncConfirm}
        />
      </>
    );
  }

  return (
    <>
      <div className="border rounded p-3 space-y-2 bg-muted/30">
        <Input
          value={taskText}
          onChange={(e) => setTaskText(e.target.value)}
          className="text-sm h-8"
          autoFocus
        />
        <div className="grid grid-cols-3 gap-2">
          <Select value={stage} onValueChange={(v) => setStage(v as TaskStage)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select
            value={assignedTo}
            onValueChange={async (value) => {
              setAssignedTo(value);
              if (value === 'crew') {
                await loadCrewCandidates();
              }
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              <SelectItem value="crew">Crew Task</SelectItem>
              <SelectItem value="outside_vendor">Outside Vendor</SelectItem>
              {projectMembers.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.profiles?.full_name || 'Unnamed'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {assignedTo === 'crew' && (
          <div className="space-y-2 border rounded p-2 bg-background">
            <p className="text-xs font-medium">Crew candidates</p>
            {loadingCrewCandidates ? (
              <p className="text-xs text-muted-foreground">Loading crew members…</p>
            ) : projectMembers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No project members available.</p>
            ) : (
              <div className="max-h-36 overflow-y-auto space-y-1">
                {projectMembers.map((member) => {
                  const isChecked = crewCandidates.includes(member.user_id);
                  return (
                    <label key={member.user_id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          const enabled = checked === true;
                          setCrewCandidates((prev) => {
                            if (enabled) {
                              return prev.includes(member.user_id) ? prev : [...prev, member.user_id];
                            }
                            return prev.filter((id) => id !== member.user_id);
                          });
                        }}
                      />
                      <span>{member.profiles?.full_name || 'Unnamed'}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">Selected: {crewCandidates.length}</p>
          </div>
        )}

        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={handleCancel} className="h-7 text-xs">
            <X className="h-3 w-3 mr-1" />Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !taskText.trim()} className="h-7 text-xs">
            <Check className="h-3 w-3 mr-1" />{saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
      <SyncToLibraryDialog
        open={syncPromptOpen}
        onOpenChange={setSyncPromptOpen}
        title="Update Recipe Step?"
        description="This subtask originated from a recipe. Would you like to sync these changes (title, assignment) back to the recipe template?"
        loading={syncLoading}
        onConfirm={handleSyncConfirm}
      />
    </>
  );
};

export default SubtaskRow;
