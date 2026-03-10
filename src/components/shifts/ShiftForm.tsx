import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAdmin } from '@/hooks/useAdmin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Loader2, Clock, Hash, AlertCircle, ArrowRight } from 'lucide-react';
import type { Shift, ShiftAllocation } from '@/hooks/useShifts';

const NoEligibleTasksCard = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <Card className="p-4 border-dashed border-warning">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium">No eligible tasks found</p>
            <p className="text-xs text-muted-foreground">
              You need to be assigned to or actively working on tasks before you can log hours against them.
            </p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
                What do I need to do?
              </Button>
              <Button size="sm" variant="default" onClick={() => navigate('/today')}>
                <ArrowRight className="h-3 w-3 mr-1" />Go to Today
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>How to get eligible tasks</DialogTitle>
            <DialogDescription>
              Tasks must be assigned to you or you must join them before you can log shift hours.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="space-y-1">
              <p className="font-medium">For solo tasks:</p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                <li>Go to the <strong>Today</strong> page and look for available tasks</li>
                <li>Tap <strong>"Dibs"</strong> on a task to claim it</li>
                <li>Or ask your manager to assign a task directly to you</li>
              </ul>
            </div>
            <div className="space-y-1">
              <p className="font-medium">For crew tasks:</p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                <li>Go to the <strong>Today</strong> page and find crew tasks you're eligible for</li>
                <li>Tap <strong>"Join"</strong> to become an active worker on the task</li>
              </ul>
            </div>
            <div className="space-y-1">
              <p className="font-medium">Already working on tasks?</p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                <li>Make sure you've tapped <strong>"Start"</strong> on at least one task</li>
                <li>Tasks in <strong>"Not Ready"</strong> status won't appear here</li>
                <li>Tasks completed today will still show up for logging</li>
              </ul>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <DialogClose asChild>
              <Button variant="outline" className="flex-1">Close</Button>
            </DialogClose>
            <Button className="flex-1" onClick={() => navigate('/today')}>
              <ArrowRight className="h-3 w-3 mr-1" />Go to Today
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};


interface ShiftFormProps {
  editShift?: Shift | null;
  editAllocations?: ShiftAllocation[];
  onSaved: () => void;
  onCancel?: () => void;
}

interface TaskRow {
  id: string;
  task: string;
  stage: string;
  assignment_mode: string;
}

const ShiftForm = ({ editShift, editAllocations, onSaved, onCancel }: ShiftFormProps) => {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const { toast } = useToast();

  const [projects, setProjects] = useState<{ id: string; name: string; address: string | null }[]>([]);
  const [projectId, setProjectId] = useState(editShift?.project_id || '');
  const [shiftDate, setShiftDate] = useState(editShift?.shift_date || new Date().toISOString().slice(0, 10));
  const [useStartEnd, setUseStartEnd] = useState(!!(editShift?.start_time));
  const [startTime, setStartTime] = useState(editShift?.start_time?.slice(0, 5) || '08:00');
  const [endTime, setEndTime] = useState(editShift?.end_time?.slice(0, 5) || '16:00');
  const [manualHours, setManualHours] = useState(editShift ? String(editShift.total_hours) : '');
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);

  // For admin editing other users
  const [allUsers, setAllUsers] = useState<{ id: string; full_name: string | null }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState(editShift?.user_id || user?.id || '');

  // Fetch projects user is a member of
  useEffect(() => {
    if (!user) return;
    const fetchProjects = async () => {
      const targetUser = isAdmin && selectedUserId ? selectedUserId : user.id;
      const { data: memberships } = await supabase
        .from('project_members')
        .select('project_id')
        .eq('user_id', targetUser);
      const pids = (memberships || []).map(m => m.project_id);
      if (pids.length === 0) { setProjects([]); return; }
      const { data } = await supabase
        .from('projects')
        .select('id, name, address')
        .in('id', pids)
        .eq('status', 'active')
        .order('name');
      setProjects(data || []);
    };
    fetchProjects();
  }, [user, selectedUserId, isAdmin]);

  // Fetch users for admin
  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('profiles').select('id, full_name').order('full_name').then(({ data }) => {
      setAllUsers(data || []);
    });
  }, [isAdmin]);

  // Load tasks for selected project + user
  useEffect(() => {
    if (!projectId || !selectedUserId) { setTasks([]); return; }
    const fetchTasks = async () => {
      setTasksLoading(true);
      // Get solo tasks assigned to user + all crew tasks where user is candidate/worker
      const [soloRes, candidateRes, workerRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('id, task, stage, assignment_mode')
          .eq('project_id', projectId)
          .eq('assigned_to_user_id', selectedUserId)
          .neq('stage', 'Not Ready')
          .or('is_package.is.null,is_package.eq.false')
          .eq('needs_manager_review', false),
        supabase
          .from('task_candidates')
          .select('task_id')
          .eq('user_id', selectedUserId),
        supabase
          .from('task_workers')
          .select('task_id')
          .eq('user_id', selectedUserId)
          .eq('active', true),
      ]);

      const crewTaskIds = new Set([
        ...(candidateRes.data || []).map(c => c.task_id),
        ...(workerRes.data || []).map(w => w.task_id),
      ]);

      let crewTasks: TaskRow[] = [];
      if (crewTaskIds.size > 0) {
        const { data } = await supabase
          .from('tasks')
          .select('id, task, stage, assignment_mode')
          .eq('project_id', projectId)
          .eq('assignment_mode', 'crew')
          .neq('stage', 'Not Ready')
          .or('is_package.is.null,is_package.eq.false')
          .eq('needs_manager_review', false)
          .in('id', [...crewTaskIds]);
        crewTasks = (data as TaskRow[]) || [];
      }

      // Include same-day completed tasks
      const { data: completedToday } = await supabase
        .from('tasks')
        .select('id, task, stage, assignment_mode')
        .eq('project_id', projectId)
        .eq('stage', 'Done')
        .or('is_package.is.null,is_package.eq.false')
        .gte('completed_at', shiftDate + 'T00:00:00')
        .lte('completed_at', shiftDate + 'T23:59:59')
        .eq('needs_manager_review', false);

      // Merge and dedupe
      const all = new Map<string, TaskRow>();
      ((soloRes.data as TaskRow[]) || []).forEach(t => all.set(t.id, t));
      crewTasks.forEach(t => all.set(t.id, t));
      ((completedToday as TaskRow[]) || []).forEach(t => {
        // Only include if user was involved
        if (t.assignment_mode === 'solo') {
          // Only if it was solo assigned to them - we fetched all completed today for the project
          // Re-check would need another query, so we skip solo completed that aren't in soloRes
        }
        // Crew completed tasks are fine if user was candidate/worker
        if (crewTaskIds.has(t.id)) all.set(t.id, t);
      });
      // Also add solo completed today that were assigned to user
      const { data: soloCompletedToday } = await supabase
        .from('tasks')
        .select('id, task, stage, assignment_mode')
        .eq('project_id', projectId)
        .eq('assigned_to_user_id', selectedUserId)
        .eq('stage', 'Done')
        .or('is_package.is.null,is_package.eq.false')
        .gte('completed_at', shiftDate + 'T00:00:00')
        .lte('completed_at', shiftDate + 'T23:59:59')
        .eq('needs_manager_review', false);
      ((soloCompletedToday as TaskRow[]) || []).forEach(t => all.set(t.id, t));

      setTasks([...all.values()]);
      setTasksLoading(false);
    };
    fetchTasks();
  }, [projectId, selectedUserId, shiftDate]);

  // Initialize allocations from edit data
  useEffect(() => {
    if (editAllocations && editAllocations.length > 0) {
      const allocs: Record<string, string> = {};
      editAllocations.forEach(a => { allocs[a.task_id] = String(a.hours); });
      setAllocations(allocs);
    }
  }, [editAllocations]);

  const totalHours = useMemo(() => {
    if (useStartEnd) {
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      const diff = (eh * 60 + em) - (sh * 60 + sm);
      return diff > 0 ? Math.round((diff / 60) * 100) / 100 : 0;
    }
    return parseFloat(manualHours) || 0;
  }, [useStartEnd, startTime, endTime, manualHours]);

  const allocatedHours = useMemo(() => {
    return Object.values(allocations).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
  }, [allocations]);

  const remaining = Math.round((totalHours - allocatedHours) * 100) / 100;
  const canSave = totalHours > 0 && Math.abs(remaining) < 0.01 && projectId;

  const handleSave = async () => {
    if (!user || !canSave) return;
    setSaving(true);

    const allocArray = Object.entries(allocations)
      .filter(([, v]) => parseFloat(v) > 0)
      .map(([task_id, hours]) => ({ task_id, hours: parseFloat(hours) }));

    const isAdminEdit = isAdmin && selectedUserId !== user.id;

    const { data, error } = await supabase.rpc('upsert_shift_with_allocations', {
      p_shift_id: editShift?.id || null,
      p_user_id: selectedUserId,
      p_project_id: projectId,
      p_shift_date: shiftDate,
      p_start_time: useStartEnd ? startTime + ':00' : null,
      p_end_time: useStartEnd ? endTime + ':00' : null,
      p_total_hours: useStartEnd ? null : totalHours,
      p_allocations: allocArray,
      p_is_admin_edit: isAdminEdit,
    });

    setSaving(false);
    if (error) {
      toast({ title: 'Error saving shift', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: editShift ? 'Shift updated' : 'Shift logged' });
    onSaved();
  };

  const setAllocationHours = (taskId: string, value: string) => {
    setAllocations(prev => {
      const next = { ...prev };
      if (!value || value === '0') delete next[taskId];
      else next[taskId] = value;
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Admin: user selector */}
      {isAdmin && (
        <div className="space-y-1">
          <Label className="text-xs">Contractor</Label>
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger><SelectValue placeholder="Select contractor" /></SelectTrigger>
            <SelectContent>
              {allUsers.map(u => (
                <SelectItem key={u.id} value={u.id}>{u.full_name || 'Unnamed'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Project */}
      <div className="space-y-1">
        <Label className="text-xs">Project</Label>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
          <SelectContent>
            {projects.map(p => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}{p.address ? ` — ${p.address}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Date */}
      <div className="space-y-1">
        <Label className="text-xs">Shift Date</Label>
        <Input type="date" value={shiftDate} onChange={e => setShiftDate(e.target.value)} />
      </div>

      {/* Hour mode toggle */}
      <div className="flex items-center gap-3">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <Label className="text-xs flex-1">Use Start / End Time</Label>
        <Switch checked={useStartEnd} onCheckedChange={setUseStartEnd} />
      </div>

      {useStartEnd ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Start</Label>
            <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">End</Label>
            <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <Label className="text-xs">Total Hours</Label>
          <Input
            type="number"
            step="0.25"
            min="0.25"
            value={manualHours}
            onChange={e => setManualHours(e.target.value)}
            placeholder="e.g. 8"
          />
        </div>
      )}

      {/* Summary bar */}
      <Card className="p-3">
        <div className="flex justify-between text-sm">
          <span>Total: <strong>{totalHours}h</strong></span>
          <span>Allocated: <strong>{allocatedHours}h</strong></span>
          <span className={remaining !== 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}>
            Remaining: {remaining}h
          </span>
        </div>
      </Card>

      {/* Task allocation */}
      {projectId && totalHours > 0 && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Allocate Hours to Tasks
          </Label>
          {tasksLoading ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading tasks...
            </div>
          ) : tasks.length === 0 ? (
            <NoEligibleTasksCard />
          ) : (
            <div className="space-y-1.5">
              {tasks.map(t => (
                <div key={t.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{t.task}</p>
                    <p className="text-xs text-muted-foreground">{t.stage}{t.assignment_mode === 'crew' ? ' · Crew' : ''}</p>
                  </div>
                  <Input
                    type="number"
                    step="0.25"
                    min="0"
                    className="w-20 text-right"
                    value={allocations[t.id] || ''}
                    onChange={e => setAllocationHours(t.id, e.target.value)}
                    placeholder="0"
                  />
                  <span className="text-xs text-muted-foreground w-4">h</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        {onCancel && (
          <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
        )}
        <Button
          className="flex-1"
          disabled={!canSave || saving}
          onClick={handleSave}
        >
          {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Saving...</> : (editShift ? 'Update Shift' : 'Log Shift')}
        </Button>
      </div>
    </div>
  );
};

export default ShiftForm;
