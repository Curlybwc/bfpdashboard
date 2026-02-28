import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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
import { TASK_STAGES, TASK_PRIORITIES, type TaskStage, type TaskPriority } from '@/lib/supabase-types';
import { Package } from 'lucide-react';
import TaskMaterialsSheet from '@/components/TaskMaterialsSheet';

const TaskDetail = () => {
  const { projectId, taskId } = useParams<{ projectId: string; taskId: string }>();
  const { toast } = useToast();
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const [task, setTask] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [dibsConfirmOpen, setDibsConfirmOpen] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);

  // Editable fields
  const [taskText, setTaskText] = useState('');
  const [stage, setStage] = useState<TaskStage>('Ready');
  const [priority, setPriority] = useState<TaskPriority>('2 – This Week');
  // materials_on_site is now derived, not manually editable
  const [roomArea, setRoomArea] = useState('');
  const [trade, setTrade] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [actualCost, setActualCost] = useState('');

  useEffect(() => { fetchTask(); }, [taskId]);

  const handleSave = async () => {
    if (!taskId) return;
    setSaving(true);
    const { error } = await supabase.from('tasks').update({
      task: taskText,
      stage,
      priority,
      // materials_on_site is derived from task_materials, not saved here
      room_area: roomArea || null,
      trade: trade || null,
      notes: notes || null,
      due_date: dueDate || null,
      actual_total_cost: actualCost ? parseFloat(actualCost) : null,
    }).eq('id', taskId);
    setSaving(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
    else { toast({ title: 'Saved' }); }
  };

  const fetchTask = () => {
    if (!taskId) return;
    supabase.from('tasks').select('*').eq('id', taskId).single().then(({ data }) => {
      if (data) {
        setTask(data);
        setTaskText(data.task);
        setStage(data.stage);
        setPriority(data.priority);
        // materials_on_site is derived, no state needed
        setRoomArea(data.room_area || '');
        setTrade(data.trade || '');
        setNotes(data.notes || '');
        setDueDate(data.due_date || '');
        setActualCost(data.actual_total_cost?.toString() || '');
      }
    });
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
    setActionLoading(false);
    fetchTask();
  };

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
            <Button onClick={handleComplete} disabled={actionLoading}>Complete</Button>
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
          <Label>Actual Total Cost</Label>
          <Input type="number" value={actualCost} onChange={(e) => setActualCost(e.target.value)} placeholder="$" />
        </div>
        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
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
    </div>
  );
};

export default TaskDetail;
