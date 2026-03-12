import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StatusBadge from '@/components/StatusBadge';
import { Pencil, Check, X, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TASK_STAGES, TASK_PRIORITIES, type TaskStage, type TaskPriority } from '@/lib/supabase-types';

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

  const handleSave = async () => {
    setSaving(true);
    const isCrew = assignedTo === 'crew';
    const isVendor = assignedTo === 'outside_vendor';
    const newAssignedTo = assignedTo === 'unassigned' || isVendor || isCrew ? null : assignedTo;

    const updates: any = {
      task: taskText.trim(),
      stage,
      priority,
      assigned_to_user_id: newAssignedTo,
      is_outside_vendor: isVendor,
      assignment_mode: isCrew ? 'crew' : 'solo',
    };

    // Handle stage lifecycle timestamps
    if (stage === 'Done' && child.stage !== 'Done') {
      updates.completed_at = new Date().toISOString();
    } else if (stage !== 'Done' && child.completed_at) {
      updates.completed_at = null;
    }

    const { error } = await supabase.from('tasks').update(updates).eq('id', child.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Error saving subtask', description: error.message, variant: 'destructive' });
      return;
    }
    setEditing(false);
    onUpdated();
  };

  const handleCancel = () => {
    setTaskText(child.task);
    setStage(child.stage);
    setPriority(child.priority);
    setAssignedTo(child.assignment_mode === 'crew' ? 'crew' : child.is_outside_vendor ? 'outside_vendor' : (child.assigned_to_user_id || 'unassigned'));
    setEditing(false);
  };

  if (!editing) {
    return (
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
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusBadge status={child.stage} />
          {canEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => { e.stopPropagation(); setEditing(true); }}
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
    );
  }

  return (
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
        <Select value={assignedTo} onValueChange={setAssignedTo}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            <SelectItem value="outside_vendor">Outside Vendor</SelectItem>
            {projectMembers.map((m) => (
              <SelectItem key={m.user_id} value={m.user_id}>
                {m.profiles?.full_name || 'Unnamed'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={handleCancel} className="h-7 text-xs">
          <X className="h-3 w-3 mr-1" />Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving || !taskText.trim()} className="h-7 text-xs">
          <Check className="h-3 w-3 mr-1" />{saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
};

export default SubtaskRow;

