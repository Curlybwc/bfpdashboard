import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, ChevronDown, ChevronRight, X, Mic, Zap, Package, Trash2, Loader2, Pencil, AlertTriangle, CircleDot, Circle, UserX, Wrench } from 'lucide-react';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import ProjectMembers from '@/components/ProjectMembers';
import { TASK_STAGES, TASK_PRIORITIES, type TaskStage, type TaskPriority } from '@/lib/supabase-types';
import TaskCard from '@/components/TaskCard';
import { useAdmin } from '@/hooks/useAdmin';
import { useProjectDetail } from '@/hooks/useProjectDetail';
import { useCreateTask, useUpdateProject, useDeleteProject } from '@/hooks/useProjectMutations';
import { canCreateTask, canEditProject, getProjectRole } from '@/lib/permissions';
import { useQueryClient } from '@tanstack/react-query';

/** Compact collapsible group for the "What next?" section */
const WhatNextGroup = ({ label, count, tasks, projectId, open, onToggle }: { label: string; count: number; tasks: any[]; projectId: string; open?: boolean; onToggle?: () => void }) => (
  <Collapsible open={open} onOpenChange={onToggle}>
    <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full py-0.5">
      <ChevronRight className="h-3.5 w-3.5 transition-transform [[data-state=open]>&]:rotate-90" />
      {label} ({count})
    </CollapsibleTrigger>
    <CollapsibleContent className="pt-1 pl-5 space-y-0.5">
      {tasks.slice(0, 3).map((t: any) => (
        <Link
          key={t.id}
          to={`/projects/${projectId}/tasks/${t.id}`}
          className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted transition-colors"
        >
          <span className="truncate flex-1">{t.task}</span>
          <Badge variant="outline" className="text-[10px] shrink-0">{t.priority?.split(' – ')[0] || '?'}</Badge>
        </Link>
      ))}
      {count > 3 && (
        <p className="text-xs text-muted-foreground px-2">+{count - 3} more</p>
      )}
    </CollapsibleContent>
  </Collapsible>
);

const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { isAdmin } = useAdmin();
  const queryClient = useQueryClient();

  // Server state via React Query
  const { data, isLoading } = useProjectDetail(id, user?.id);
  const project = data?.project;
  const allTasks = data?.tasks ?? [];
  const photoCountMap = data?.photoCountMap ?? {};
  const projectMembers = data?.members ?? [];
  const myActiveWorkerTaskIds = new Set(data?.myActiveWorkerTaskIds ?? []);
  const myCandidateTaskIds = new Set(data?.myCandidateTaskIds ?? []);

  // Mutations
  const createTaskMutation = useCreateTask(id);
  const updateProjectMutation = useUpdateProject(id);
  const deleteProjectMutation = useDeleteProject();

  // Local UI state
  const [open, setOpen] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [stage, setStage] = useState<TaskStage>('Ready');
  const [priority, setPriority] = useState<TaskPriority>('2 – This Week');
  const [roomArea, setRoomArea] = useState('');
  const [trade, setTrade] = useState('');
  const [notes, setNotes] = useState('');
  const [assignedTo, setAssignedTo] = useState('unassigned');
  const [pendingMaterials, setPendingMaterials] = useState<{ name: string; quantity: string; unit: string }[]>([]);
  const [matName, setMatName] = useState('');
  const [matQty, setMatQty] = useState('');
  const [matUnit, setMatUnit] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');

  // Derived
  const projectRole = useMemo(
    () => (user ? getProjectRole(projectMembers, user.id) : null),
    [projectMembers, user],
  );

  const assigneeMap = useMemo(() => {
    const map: Record<string, string> = {};
    projectMembers.forEach((m) => {
      map[m.user_id] = m.profiles?.full_name || 'Unnamed';
    });
    return map;
  }, [projectMembers]);

  const userCanCreateTask = canCreateTask(isAdmin, projectRole);
  const userCanEditProject = canEditProject(isAdmin, projectRole);
  const isContractor = !isAdmin && projectRole === 'contractor';

  // For contractors, filter tasks to only show relevant ones
  const tasks = useMemo(() => {
    if (!isContractor || !user) return allTasks;
    return allTasks.filter((t) => {
      // Assigned to me
      if (t.assigned_to_user_id === user.id) return true;
      // I'm an active crew worker
      if (myActiveWorkerTaskIds.has(t.id)) return true;
      // I'm a candidate for this crew task
      if (myCandidateTaskIds.has(t.id)) return true;
      // Unassigned solo tasks that are Ready (available to pick up)
      if (!t.assigned_to_user_id && t.assignment_mode === 'solo' && t.stage === 'Ready') return true;
      // Parent task whose children I should see
      if (t.parent_task_id) {
        // Show if parent is visible (handled by parent filter)
        return false;
      }
      return false;
    });
  }, [allTasks, isContractor, user, myActiveWorkerTaskIds, myCandidateTaskIds]);

  // For contractors, also include parent tasks if any of their children are visible
  const visibleTaskIds = useMemo(() => new Set(tasks.map(t => t.id)), [tasks]);
  const tasksWithParents = useMemo(() => {
    if (!isContractor) return tasks;
    const parentIds = new Set<string>();
    tasks.forEach(t => {
      if (t.parent_task_id && !visibleTaskIds.has(t.parent_task_id)) {
        parentIds.add(t.parent_task_id);
      }
    });
    if (parentIds.size === 0) return tasks;
    const parents = allTasks.filter(t => parentIds.has(t.id));
    return [...parents, ...tasks];
  }, [tasks, allTasks, isContractor, visibleTaskIds]);

  // Build tree
  const rootTasks = useMemo(() => tasksWithParents.filter((t) => !t.parent_task_id), [tasksWithParents]);
  const childrenMap = useMemo(() => {
    const map: Record<string, any[]> = {};
    tasks.forEach((t) => {
      if (t.parent_task_id) {
        if (!map[t.parent_task_id]) map[t.parent_task_id] = [];
        map[t.parent_task_id].push(t);
      }
    });
    return map;
  }, [tasks]);

  // "What next?" derivation — leaf tasks only (no double-counting parents)
  const whatNext = useMemo(() => {
    const leafTasks = tasks.filter((t) => !(childrenMap[t.id]?.length) && t.stage !== 'Done');
    const blocked = leafTasks.filter((t) => t.is_blocked);
    const inProgress = leafTasks.filter((t) => !t.is_blocked && t.stage === 'In Progress');
    const ready = leafTasks.filter((t) => !t.is_blocked && t.stage === 'Ready');
    const readyUnassigned = ready.filter((t) => !t.assigned_to_user_id && t.assignment_mode !== 'crew');
    const waitingMaterials = ready.filter((t) => t.materials_on_site === 'No');

    const sortByPriority = (a: any, b: any) => {
      const pa = a.priority || '5 – Later';
      const pb = b.priority || '5 – Later';
      if (pa !== pb) return pa.localeCompare(pb);
      const sa = a.sort_order ?? 999999;
      const sb = b.sort_order ?? 999999;
      if (sa !== sb) return sa - sb;
      return (a.created_at || '').localeCompare(b.created_at || '');
    };

    const sortedReady = [...ready].sort(sortByPriority);
    const sortedBlocked = [...blocked].sort(sortByPriority);
    const sortedUnassigned = [...readyUnassigned].sort(sortByPriority);

    // Recommendation — contractor filters to own tasks
    let recommendation = '';
    let recommendationType: 'blocked' | 'unassigned' | 'ready' | 'progress' | 'done' = 'done';

    if (isContractor) {
      const myBlocked = blocked.filter((t) => t.assigned_to_user_id === user?.id);
      const myInProgress = inProgress.filter((t) => t.assigned_to_user_id === user?.id);
      const myReady = sortedReady.filter((t) => t.assigned_to_user_id === user?.id);
      const available = sortedReady.filter((t) => !t.assigned_to_user_id);
      if (myBlocked.length > 0) {
        recommendation = `Needs action: ${myBlocked.length} blocked task${myBlocked.length !== 1 ? 's' : ''}`;
        recommendationType = 'blocked';
      } else if (myReady.length > 0) {
        recommendation = `Start next: ${myReady[0].task}`;
        recommendationType = 'ready';
      } else if (available.length > 0) {
        recommendation = `Available: ${available[0].task}`;
        recommendationType = 'ready';
      } else if (myInProgress.length > 0) {
        recommendation = `${myInProgress.length} task${myInProgress.length !== 1 ? 's' : ''} in progress`;
        recommendationType = 'progress';
      } else {
        recommendation = 'All caught up';
        recommendationType = 'done';
      }
    } else {
      if (blocked.length > 0) {
        recommendation = `Needs action: ${blocked.length} blocked task${blocked.length !== 1 ? 's' : ''}`;
        recommendationType = 'blocked';
      } else if (readyUnassigned.length > 0) {
        recommendation = `Assign next: ${readyUnassigned.length} ready task${readyUnassigned.length !== 1 ? 's' : ''} unassigned`;
        recommendationType = 'unassigned';
      } else if (sortedReady.length > 0) {
        recommendation = `Start next: ${sortedReady[0].task}`;
        recommendationType = 'ready';
      } else if (inProgress.length > 0) {
        recommendation = `${inProgress.length} task${inProgress.length !== 1 ? 's' : ''} in progress`;
        recommendationType = 'progress';
      } else {
        recommendation = 'All caught up';
        recommendationType = 'done';
      }
    }

    const sortedWaitingMaterials = [...waitingMaterials].sort(sortByPriority);

    return {
      blocked, inProgress, ready, readyUnassigned, waitingMaterials,
      sortedBlocked, sortedReady, sortedUnassigned, sortedWaitingMaterials,
      recommendation, recommendationType,
      hasAnyWork: leafTasks.length > 0,
      // Contractor-specific counts
      myBlocked: blocked.filter((t) => t.assigned_to_user_id === user?.id),
      myInProgress: inProgress.filter((t) => t.assigned_to_user_id === user?.id),
      available: ready.filter((t) => !t.assigned_to_user_id),
    };
  }, [tasks, childrenMap, isContractor, user?.id]);

  const getTaskActual = (t: any): number => {
    const children = childrenMap[t.id];
    if (children && children.length > 0) {
      return children.reduce((sum: number, c: any) => sum + (c.actual_total_cost ?? 0), 0);
    }
    return t.actual_total_cost ?? 0;
  };
  const projectTotalActual = rootTasks.reduce((sum, t) => sum + getTaskActual(t), 0);

  const toggleExpanded = (taskId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const openEditDialog = () => {
    setEditName(project?.name || '');
    setEditAddress(project?.address || '');
    setEditOpen(true);
  };

  const handleEditProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !editName.trim()) return;
    updateProjectMutation.mutate(
      { name: editName.trim(), address: editAddress.trim() || null },
      { onSuccess: () => setEditOpen(false) },
    );
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !id) return;
    createTaskMutation.mutate(
      {
        project_id: id,
        task: taskName,
        stage,
        priority,
        room_area: roomArea || null,
        trade: trade || null,
        notes: notes || null,
        created_by: user.id,
        assigned_to_user_id: assignedTo === 'unassigned' ? null : assignedTo,
        pendingMaterials,
      },
      {
        onSuccess: () => {
          setTaskName(''); setStage('Ready'); setPriority('2 – This Week');
          setRoomArea(''); setTrade(''); setNotes(''); setAssignedTo('unassigned');
          setPendingMaterials([]); setMatName(''); setMatQty(''); setMatUnit('');
          setOpen(false);
        },
      },
    );
  };

  const handleDeleteProject = async () => {
    if (!id) return;
    deleteProjectMutation.mutate(id, {
      onSettled: () => setDeleteDialogOpen(false),
    });
  };

  const invalidateProject = () => {
    queryClient.invalidateQueries({ queryKey: ['project-detail', id] });
  };

  if (isLoading || !project) return <div className="p-4 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="pb-20">
      <PageHeader
        title={project.name}
        backTo="/projects"
        actions={
          userCanCreateTask ? (
            <div className="flex gap-2">
              {userCanEditProject && (
                <Button size="sm" variant="outline" onClick={openEditDialog}>
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => navigate(`/projects/${id}/materials`)}>
                 <Package className="h-4 w-4 mr-1" />Materials
               </Button>
              <Button size="sm" variant="outline" onClick={() => navigate(`/projects/${id}/field-mode`)}>
                <Zap className="h-4 w-4 mr-1" />Field Mode
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate(`/projects/${id}/walkthrough`)}>
                <Mic className="h-4 w-4 mr-1" />Walkthrough
              </Button>
              <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />Task</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
              <form onSubmit={handleCreateTask} className="space-y-4">
                <div className="space-y-2">
                  <Label>Task Description</Label>
                  <Input value={taskName} onChange={(e) => setTaskName(e.target.value)} required />
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
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                </div>
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full py-1">
                    <ChevronDown className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-180" />
                    📦 Add Materials ({pendingMaterials.length})
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Name *"
                        value={matName}
                        onChange={(e) => setMatName(e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        placeholder="Qty"
                        type="number"
                        value={matQty}
                        onChange={(e) => setMatQty(e.target.value)}
                        className="w-16"
                      />
                      <Input
                        placeholder="Unit"
                        value={matUnit}
                        onChange={(e) => setMatUnit(e.target.value)}
                        className="w-16"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={!matName.trim()}
                      onClick={() => {
                        setPendingMaterials(prev => [...prev, { name: matName.trim(), quantity: matQty, unit: matUnit.trim() }]);
                        setMatName(''); setMatQty(''); setMatUnit('');
                      }}
                    >
                      Add Material
                    </Button>
                    {pendingMaterials.length > 0 && (
                      <div className="space-y-1">
                        {pendingMaterials.map((m, i) => (
                          <div key={i} className="flex items-center justify-between rounded border px-2 py-1 text-sm">
                            <span className="truncate">
                              {m.name}{m.quantity ? ` × ${m.quantity}` : ''}{m.unit ? ` ${m.unit}` : ''}
                            </span>
                            <button
                              type="button"
                              onClick={() => setPendingMaterials(prev => prev.filter((_, j) => j !== i))}
                              className="text-muted-foreground hover:text-destructive ml-2 shrink-0"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
                <Button type="submit" className="w-full" disabled={createTaskMutation.isPending}>Create Task</Button>
              </form>
            </DialogContent>
          </Dialog>
              {isAdmin && (
                <Button size="sm" variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ) : isAdmin ? (
            <Button size="sm" variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : undefined
        }
      />
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Project</DialogTitle></DialogHeader>
          <form onSubmit={handleEditProject} className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Address (optional)</Label>
              <Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="e.g. 123 Main St" />
            </div>
            <Button type="submit" className="w-full" disabled={updateProjectMutation.isPending || !editName.trim()}>
              {updateProjectMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Saving…</> : 'Save'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleteDialogOpen} onOpenChange={(nextOpen) => { if (deleteProjectMutation.isPending) return; setDeleteDialogOpen(nextOpen); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete <strong>{project.name}</strong>{project.address ? ` (${project.address})` : ''}? This removes all tasks, materials, members, and field captures. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProjectMutation.isPending}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={deleteProjectMutation.isPending} onClick={handleDeleteProject}>
              {deleteProjectMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Deleting…</> : 'Delete Project'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <StatusBadge status={project.status} />
          {project.address && <span className="text-sm text-muted-foreground">{project.address}</span>}
          {projectTotalActual > 0 && (
            <span className="ml-auto text-sm font-medium">Actual: ${projectTotalActual.toFixed(2)}</span>
          )}
        </div>

        {/* What next? section */}
        {whatNext.hasAnyWork && (
          <Card className="mb-4 border-primary/15">
            <CardContent className="p-3 space-y-3">
              <p className="text-sm font-semibold text-foreground">What next?</p>

              {/* Highlighted recommendation */}
              <div className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
                whatNext.recommendationType === 'blocked' && 'bg-destructive/10 text-destructive',
                whatNext.recommendationType === 'unassigned' && 'bg-accent text-accent-foreground',
                whatNext.recommendationType === 'ready' && 'bg-primary/10 text-primary',
                whatNext.recommendationType === 'progress' && 'bg-muted text-muted-foreground',
                whatNext.recommendationType === 'done' && 'bg-muted text-muted-foreground',
              )}>
                {whatNext.recommendationType === 'blocked' && <AlertTriangle className="h-4 w-4 shrink-0" />}
                {whatNext.recommendationType === 'unassigned' && <UserX className="h-4 w-4 shrink-0" />}
                {whatNext.recommendationType === 'ready' && <Circle className="h-4 w-4 shrink-0" />}
                {whatNext.recommendationType === 'progress' && <CircleDot className="h-4 w-4 shrink-0" />}
                <span className="truncate">{whatNext.recommendation}</span>
              </div>

              {/* Stat chips — role-specific */}
              <div className="flex flex-wrap gap-1.5">
                {isContractor ? (
                  <>
                    {whatNext.myBlocked.length > 0 && (
                      <Badge variant="destructive" className="text-xs font-normal cursor-pointer" onClick={() => setOpenGroup(openGroup === 'myblocked' ? null : 'myblocked')}>🔴 {whatNext.myBlocked.length} My Blocked</Badge>
                    )}
                    {whatNext.myInProgress.length > 0 && (
                      <Badge variant="secondary" className="text-xs font-normal cursor-pointer" onClick={() => setOpenGroup(openGroup === 'myprogress' ? null : 'myprogress')}>🔧 {whatNext.myInProgress.length} My In Progress</Badge>
                    )}
                    {whatNext.available.length > 0 && (
                      <Badge variant="outline" className="text-xs font-normal cursor-pointer" onClick={() => setOpenGroup(openGroup === 'available' ? null : 'available')}>👤 {whatNext.available.length} Available</Badge>
                    )}
                  </>
                ) : (
                  <>
                    {whatNext.blocked.length > 0 && (
                      <Badge variant="destructive" className="text-xs font-normal cursor-pointer" onClick={() => setOpenGroup(openGroup === 'blocked' ? null : 'blocked')}>🔴 {whatNext.blocked.length} Blocked</Badge>
                    )}
                    {whatNext.ready.length > 0 && (
                      <Badge variant="secondary" className="text-xs font-normal cursor-pointer" onClick={() => setOpenGroup(openGroup === 'ready' ? null : 'ready')}>🟢 {whatNext.ready.length} Ready</Badge>
                    )}
                    {whatNext.readyUnassigned.length > 0 && (
                      <Badge variant="outline" className="text-xs font-normal cursor-pointer" onClick={() => setOpenGroup(openGroup === 'unassigned' ? null : 'unassigned')}>👤 {whatNext.readyUnassigned.length} Unassigned</Badge>
                    )}
                    {whatNext.inProgress.length > 0 && (
                      <Badge variant="secondary" className="text-xs font-normal cursor-pointer" onClick={() => setOpenGroup(openGroup === 'progress' ? null : 'progress')}>🔧 {whatNext.inProgress.length} In Progress</Badge>
                    )}
                    {whatNext.waitingMaterials.length > 0 && (
                      <Badge variant="outline" className="text-xs font-normal cursor-pointer" onClick={() => setOpenGroup(openGroup === 'materials' ? null : 'materials')}><Wrench className="h-3 w-3 mr-1" />{whatNext.waitingMaterials.length} Needs Materials/Tools</Badge>
                    )}
                  </>
                )}
              </div>

              {/* Collapsible groups */}
              {whatNext.sortedBlocked.length > 0 && (
                <WhatNextGroup label="Blocked" count={whatNext.sortedBlocked.length} tasks={whatNext.sortedBlocked} projectId={id!} open={openGroup === 'blocked'} onToggle={() => setOpenGroup(openGroup === 'blocked' ? null : 'blocked')} />
              )}
              {whatNext.sortedReady.length > 0 && (
                <WhatNextGroup label="Ready to Start" count={whatNext.sortedReady.length} tasks={whatNext.sortedReady} projectId={id!} open={openGroup === 'ready'} onToggle={() => setOpenGroup(openGroup === 'ready' ? null : 'ready')} />
              )}
              {whatNext.sortedUnassigned.length > 0 && (
                <WhatNextGroup label="Unassigned" count={whatNext.sortedUnassigned.length} tasks={whatNext.sortedUnassigned} projectId={id!} open={openGroup === 'unassigned'} onToggle={() => setOpenGroup(openGroup === 'unassigned' ? null : 'unassigned')} />
              )}
              {whatNext.inProgress.length > 0 && (
                <WhatNextGroup label="In Progress" count={whatNext.inProgress.length} tasks={whatNext.inProgress} projectId={id!} open={openGroup === 'progress'} onToggle={() => setOpenGroup(openGroup === 'progress' ? null : 'progress')} />
              )}
              {whatNext.sortedWaitingMaterials.length > 0 && (
                <WhatNextGroup label="Needs Materials/Tools" count={whatNext.sortedWaitingMaterials.length} tasks={whatNext.sortedWaitingMaterials} projectId={id!} open={openGroup === 'materials'} onToggle={() => setOpenGroup(openGroup === 'materials' ? null : 'materials')} />
              )}
              {/* Contractor-specific groups */}
              {isContractor && whatNext.myBlocked.length > 0 && (
                <WhatNextGroup label="My Blocked" count={whatNext.myBlocked.length} tasks={whatNext.myBlocked} projectId={id!} open={openGroup === 'myblocked'} onToggle={() => setOpenGroup(openGroup === 'myblocked' ? null : 'myblocked')} />
              )}
              {isContractor && whatNext.myInProgress.length > 0 && (
                <WhatNextGroup label="My In Progress" count={whatNext.myInProgress.length} tasks={whatNext.myInProgress} projectId={id!} open={openGroup === 'myprogress'} onToggle={() => setOpenGroup(openGroup === 'myprogress' ? null : 'myprogress')} />
              )}
              {isContractor && whatNext.available.length > 0 && (
                <WhatNextGroup label="Available" count={whatNext.available.length} tasks={whatNext.available} projectId={id!} open={openGroup === 'available'} onToggle={() => setOpenGroup(openGroup === 'available' ? null : 'available')} />
              )}
            </CardContent>
          </Card>
        )}
        <div className="space-y-2">
           {rootTasks.length === 0 ? (
             <p className="text-center text-muted-foreground py-8">No tasks yet.</p>
           ) : (
             rootTasks.map((t) => {
               const children = childrenMap[t.id] || [];
               const isExpanded = expandedIds.has(t.id);
               const allChildrenDone = children.length === 0 || children.every((c: any) => c.stage === 'Done');
               return (
                 <div key={t.id}>
                     <TaskCard
                       task={t}
                       projectName={project.name}
                       userId={user?.id ?? ''}
                       isAdmin={isAdmin}
                       onUpdate={invalidateProject}
                       showProjectName={false}
                       childCount={children.length}
                       expanded={isExpanded}
                       onToggle={() => toggleExpanded(t.id)}
                       allChildrenDone={allChildrenDone}
                       assigneeName={t.assigned_to_user_id ? assigneeMap[t.assigned_to_user_id] : undefined}
                       photoCount={photoCountMap[t.id] || 0}
                     />
                   {isExpanded && children.map((child: any) => (
                       <TaskCard
                         key={child.id}
                         task={child}
                         projectName={project.name}
                         userId={user?.id ?? ''}
                         isAdmin={isAdmin}
                         onUpdate={invalidateProject}
                         showProjectName={false}
                         isChild
                         assigneeName={child.assigned_to_user_id ? assigneeMap[child.assigned_to_user_id] : undefined}
                         photoCount={photoCountMap[child.id] || 0}
                       />
                   ))}
                 </div>
               );
             })
           )}
        </div>
        <ProjectMembers projectId={id!} />
      </div>
    </div>
  );
};

export default ProjectDetail;
