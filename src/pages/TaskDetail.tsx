import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useAdmin } from '@/hooks/useAdmin';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { TASK_STAGES, TASK_PRIORITIES, type TaskStage, type TaskPriority } from '@/lib/supabase-types';
import { Package, Trash2, Zap, CheckCircle2 } from 'lucide-react';
import TaskMaterialsSheet from '@/components/TaskMaterialsSheet';
import { Card } from '@/components/ui/card';

const TaskDetail = () => {
  const { projectId, taskId } = useParams<{ projectId: string; taskId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const [task, setTask] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [dibsConfirmOpen, setDibsConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [projectRole, setProjectRole] = useState<string | null>(null);
  const [children, setChildren] = useState<any[]>([]);
  const [cascadeAssign, setCascadeAssign] = useState(false);
  const [projectMembers, setProjectMembers] = useState<{ user_id: string; role: string; profiles: { full_name: string | null } | null }[]>([]);
  const [fieldCapture, setFieldCapture] = useState<any>(null);
  const [markingReviewed, setMarkingReviewed] = useState(false);

  // Editable fields
  const [taskText, setTaskText] = useState('');
  const [stage, setStage] = useState<TaskStage>('Ready');
  const [priority, setPriority] = useState<TaskPriority>('2 – This Week');
  const [roomArea, setRoomArea] = useState('');
  const [trade, setTrade] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [actualCost, setActualCost] = useState('');
  const [assignedTo, setAssignedTo] = useState<string>('unassigned');

  useEffect(() => { fetchTask(); fetchProjectRole(); fetchChildren(); fetchMembers(); }, [taskId]);

  // Fetch field capture when task loads
  useEffect(() => {
    if (!task?.field_capture_id) { setFieldCapture(null); return; }
    supabase.from('field_captures').select('*').eq('id', task.field_capture_id).single().then(({ data }) => {
      setFieldCapture(data);
    });
  }, [task?.field_capture_id]);

  const handleMarkReviewed = async () => {
    if (!taskId) return;
    setMarkingReviewed(true);
    await supabase.from('tasks').update({ needs_manager_review: false }).eq('id', taskId);
    setMarkingReviewed(false);
    toast({ title: 'Marked as reviewed' });
    fetchTask();
  };

  const handleSave = async () => {
    if (!taskId || !task) return;
    setSaving(true);

    const oldStage = task.stage;
    const newAssignedTo = assignedTo === 'unassigned' ? null : assignedTo;

    const updatePayload: any = {
      task: taskText,
      stage,
      priority,
      room_area: roomArea || null,
      trade: trade || null,
      notes: notes || null,
      due_date: dueDate || null,
      assigned_to_user_id: newAssignedTo,
    };
    if (isAdmin) {
      updatePayload.actual_total_cost = actualCost ? parseFloat(actualCost) : null;
    }

    const { error } = await supabase.from('tasks').update(updatePayload).eq('id', taskId);

    // Stage sync: if moving FROM Done and has parent, revert parent
    if (!error && oldStage === 'Done' && stage !== 'Done' && task.parent_task_id) {
      const { data: parent } = await supabase.from('tasks').select('id, stage').eq('id', task.parent_task_id).single();
      if (parent && parent.stage === 'Done') {
        await supabase.from('tasks').update({ stage: 'In Progress' }).eq('id', task.parent_task_id);
      }
    }

    // Assignment cascade
    if (!error && cascadeAssign && children.length > 0) {
      await supabase.from('tasks').update({
        assigned_to_user_id: newAssignedTo,
      }).in('id', children.map(c => c.id));
    }

    setSaving(false);
    setCascadeAssign(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
    else { toast({ title: 'Saved' }); fetchTask(); fetchChildren(); }
  };

  const fetchTask = () => {
    if (!taskId) return;
    supabase.from('tasks').select('*').eq('id', taskId).single().then(({ data }) => {
      if (data) {
        setTask(data);
        setTaskText(data.task);
        setStage(data.stage);
        setPriority(data.priority);
        setRoomArea(data.room_area || '');
        setTrade(data.trade || '');
        setNotes(data.notes || '');
        setDueDate(data.due_date || '');
        setActualCost(data.actual_total_cost?.toString() || '');
        setAssignedTo(data.assigned_to_user_id || 'unassigned');
      }
    });
  };

  const fetchChildren = async () => {
    if (!taskId) return;
    const { data } = await supabase.from('tasks').select('id, task, stage, assigned_to_user_id').eq('parent_task_id', taskId);
    setChildren(data || []);
  };

  const fetchMembers = async () => {
    if (!projectId) return;
    const { data } = await supabase.from('project_members').select('user_id, role, profiles(full_name)').eq('project_id', projectId);
    if (data) setProjectMembers(data as any);
  };

  const fetchProjectRole = async () => {
    if (!user || !projectId) return;
    const { data } = await supabase.from('project_members').select('role').eq('project_id', projectId).eq('user_id', user.id).maybeSingle();
    setProjectRole(data?.role ?? null);
  };

  const canDelete = isAdmin || projectRole === 'manager';
  const hasChildren = children.length > 0;
  const allChildrenDone = hasChildren && children.every(c => c.stage === 'Done');

  const handleDelete = async () => {
    if (!taskId) return;
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Task deleted' });
    navigate(`/projects/${projectId}`, { replace: true });
  };

  const isAssignedToMe = user && task?.assigned_to_user_id === user.id;
  const isUnassigned = !task?.assigned_to_user_id;
  const materialsReady = task?.materials_on_site === 'Yes';

  const handleDibs = async (force = false) => {
    if (!user || !taskId) return;
    if (!force && !isAdmin) {
      const { count } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to_user_id', user.id)
        .eq('stage', 'Ready')
        .eq('materials_on_site', 'Yes');
      if ((count ?? 0) >= 5) { setDibsConfirmOpen(true); return; }
    }
    setActionLoading(true);
    await supabase.from('tasks').update({
      assigned_to_user_id: user.id,
      claimed_by_user_id: user.id,
      claimed_at: new Date().toISOString(),
    }).eq('id', taskId);
    setActionLoading(false);
    fetchTask();
  };

  const handleStart = async () => {
    if (!user || !taskId) return;
    setActionLoading(true);
    await supabase.from('tasks').update({
      stage: 'In Progress',
      started_at: new Date().toISOString(),
      started_by_user_id: user.id,
    }).eq('id', taskId);
    setActionLoading(false);
    fetchTask();
  };

  const handleComplete = async () => {
    if (!taskId) return;
    setActionLoading(true);
    await supabase.from('tasks').update({
      stage: 'Done',
      completed_at: new Date().toISOString(),
    }).eq('id', taskId);

    // If child task, check siblings for auto-completing parent
    if (task?.parent_task_id) {
      const { data: siblings } = await supabase
        .from('tasks')
        .select('id, stage')
        .eq('parent_task_id', task.parent_task_id)
        .neq('id', taskId);
      const allSiblingsDone = (siblings || []).every(s => s.stage === 'Done');
      if (allSiblingsDone) {
        await supabase.from('tasks').update({
          stage: 'Done',
          completed_at: new Date().toISOString(),
        }).eq('id', task.parent_task_id);
      }
    }

    setActionLoading(false);
    fetchTask();
  };

  const canComplete = hasChildren ? allChildrenDone : true;

  if (!task) return <div className="p-4 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="pb-20">
      <PageHeader title="Task Detail" backTo={`/projects/${projectId}`} />
      <div className="p-4 space-y-4">
        {/* Lifecycle action buttons */}
        <div className="flex gap-2">
          {isUnassigned && task.stage === 'Ready' && (
            <Button variant="outline" onClick={() => handleDibs()} disabled={actionLoading}>Dibs</Button>
          )}
          {isAssignedToMe && task.stage === 'Ready' && (
            materialsReady ? (
              <Button onClick={handleStart} disabled={actionLoading}>Start</Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span><Button disabled>Start</Button></span>
                </TooltipTrigger>
                <TooltipContent>Materials must be on site before starting.</TooltipContent>
              </Tooltip>
            )
          )}
          {isAssignedToMe && task.stage === 'In Progress' && (
            canComplete ? (
              <Button onClick={handleComplete} disabled={actionLoading}>Complete</Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span><Button disabled>Complete</Button></span>
                </TooltipTrigger>
                <TooltipContent>All subtasks must be completed first.</TooltipContent>
              </Tooltip>
            )
          )}
          <Button variant="outline" size="sm" onClick={() => setMaterialsOpen(true)}>
            <Package className="h-4 w-4" />
            Materials
          </Button>
        </div>
        <div className="space-y-2">
          <Label>Task</Label>
          <Input value={taskText} onChange={(e) => setTaskText(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Stage</Label>
            <Select value={stage} onValueChange={(v) => setStage(v as TaskStage)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Materials On Site</Label>
            <p className="text-sm text-muted-foreground border rounded-md px-3 py-2">{task.materials_on_site}</p>
          </div>
          <div className="space-y-2">
            <Label>Due Date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Trade</Label>
            <Input value={trade} onChange={(e) => setTrade(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Room / Area</Label>
            <Input value={roomArea} onChange={(e) => setRoomArea(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Assigned To</Label>
          <Select value={assignedTo} onValueChange={setAssignedTo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {projectMembers.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.profiles?.full_name || 'Unnamed'} ({m.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasChildren && (
            <div className="flex items-center gap-2 mt-1">
              <Checkbox
                id="cascade-assign"
                checked={cascadeAssign}
                onCheckedChange={(v) => setCascadeAssign(!!v)}
              />
              <label htmlFor="cascade-assign" className="text-sm text-muted-foreground">
                {assignedTo === 'unassigned' ? 'Also unassign subtasks' : 'Also assign subtasks to this user'}
              </label>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label>Actual Total Cost</Label>
          <Input type="number" value={actualCost} onChange={(e) => setActualCost(e.target.value)} placeholder="$" disabled={!isAdmin} />
          {!isAdmin && <p className="text-xs text-muted-foreground">Only admins can edit this field.</p>}
        </div>
        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>

        {/* Field Capture Panel */}
        {fieldCapture && (
          <Card className="p-3 space-y-2 border-dashed">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Zap className="h-4 w-4" />
              Created via Field Mode
            </div>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{fieldCapture.raw_text}</p>
          </Card>
        )}

        {task.needs_manager_review && (isAdmin || projectRole === 'manager') && (
          <Button variant="outline" className="w-full" onClick={handleMarkReviewed} disabled={markingReviewed}>
            <CheckCircle2 className="h-4 w-4 mr-1" />
            {markingReviewed ? 'Marking...' : 'Mark Reviewed'}
          </Button>
        )}

        {hasChildren && (
          <div className="space-y-1">
            <Label>Subtasks ({children.length})</Label>
            {children.map(c => (
              <div key={c.id} className="text-sm border rounded px-3 py-2 flex justify-between">
                <span className="truncate">{c.task}</span>
                <StatusBadge status={c.stage} />
              </div>
            ))}
          </div>
        )}

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
        {canDelete && (
          <Button variant="destructive" className="w-full" onClick={() => setDeleteConfirmOpen(true)}>
            <Trash2 className="h-4 w-4 mr-1" />Delete Task
          </Button>
        )}
      </div>

      <TaskMaterialsSheet
        taskId={taskId!}
        open={materialsOpen}
        onOpenChange={setMaterialsOpen}
        onMaterialsChange={fetchTask}
      />

      <AlertDialog open={dibsConfirmOpen} onOpenChange={setDibsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dibs Limit Reached</AlertDialogTitle>
            <AlertDialogDescription>
              You already have 5 active tasks ready to start. Are you sure you want to claim another?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setDibsConfirmOpen(false); handleDibs(true); }}>
              Claim Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TaskDetail;
