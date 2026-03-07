import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import { Plus, ChevronDown, X, Mic, Zap, Package, Trash2, Loader2, Pencil } from 'lucide-react';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import ProjectMembers from '@/components/ProjectMembers';
import { TASK_STAGES, TASK_PRIORITIES, type TaskStage, type TaskPriority } from '@/lib/supabase-types';
import TaskCard from '@/components/TaskCard';
import { useAdmin } from '@/hooks/useAdmin';
import { useProjectDetail } from '@/hooks/useProjectDetail';
import { useCreateTask, useUpdateProject, useDeleteProject } from '@/hooks/useProjectMutations';
import { canCreateTask, canEditProject, getProjectRole } from '@/lib/permissions';
import { useQueryClient } from '@tanstack/react-query';

const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { isAdmin } = useAdmin();
  const queryClient = useQueryClient();

  // Server state via React Query
  const { data, isLoading } = useProjectDetail(id);
  const project = data?.project;
  const tasks = data?.tasks ?? [];
  const projectMembers = data?.members ?? [];

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

  // Build tree
  const rootTasks = useMemo(() => tasks.filter((t) => !t.parent_task_id), [tasks]);
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
