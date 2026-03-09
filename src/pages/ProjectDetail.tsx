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
import { Plus, ChevronDown, X, Mic, Zap, Package, Trash2, Loader2, Pencil, CalendarDays, CheckSquare } from 'lucide-react';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import ProjectMembers from '@/components/ProjectMembers';
import { TASK_STAGES, TASK_PRIORITIES, RECURRENCE_FREQUENCIES, type TaskStage, type TaskPriority, type RecurrenceFrequency } from '@/lib/supabase-types';
import { Switch } from '@/components/ui/switch';
import TaskCard from '@/components/TaskCard';
import BulkTaskBar from '@/components/BulkTaskBar';
import { SortableTaskList, SortableTaskItem, persistTaskOrder } from '@/components/SortableTaskList';
import { Checkbox } from '@/components/ui/checkbox';
import { useAdmin } from '@/hooks/useAdmin';
import { useProjectDetail } from '@/hooks/useProjectDetail';
import { useCreateTask, useUpdateProject, useDeleteProject } from '@/hooks/useProjectMutations';
import { canCreateTask, canEditProject, getProjectRole } from '@/lib/permissions';
import { useQueryClient } from '@tanstack/react-query';
import WhatNextCard from '@/components/WhatNextCard';
import { computeWhatNext, computeProjectTotalActual } from '@/lib/projectSummary';
import { filterContractorTasks, includeParentTasks, buildChildrenMap, buildAssigneeMap } from '@/lib/projectTaskFiltering';

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
  const materialCountMap = data?.materialCountMap ?? {};
  const projectMembers = data?.members ?? [];
  const myActiveWorkerTaskIds = useMemo(() => new Set(data?.myActiveWorkerTaskIds ?? []), [data?.myActiveWorkerTaskIds]);
  const myCandidateTaskIds = useMemo(() => new Set(data?.myCandidateTaskIds ?? []), [data?.myCandidateTaskIds]);

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
  const [newDueDate, setNewDueDate] = useState('');
  const [newIsRecurring, setNewIsRecurring] = useState(false);
  const [newRecurrenceFrequency, setNewRecurrenceFrequency] = useState<RecurrenceFrequency>('weekly');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');

  // Derived role & permissions
  const projectRole = useMemo(
    () => (user ? getProjectRole(projectMembers, user.id) : null),
    [projectMembers, user],
  );
  const assigneeMap = useMemo(() => buildAssigneeMap(projectMembers), [projectMembers]);
  const userCanCreateTask = canCreateTask(isAdmin, projectRole);
  const userCanEditProject = canEditProject(isAdmin, projectRole);
  const isContractor = !isAdmin && projectRole === 'contractor';
  const isManager = isAdmin || projectRole === 'manager';

  // Task filtering (contractor vs full view)
  const tasks = useMemo(() => {
    if (!isContractor || !user) return allTasks;
    return filterContractorTasks(allTasks, user.id, myActiveWorkerTaskIds, myCandidateTaskIds);
  }, [allTasks, isContractor, user, myActiveWorkerTaskIds, myCandidateTaskIds]);

  const tasksWithParents = useMemo(() => {
    if (!isContractor) return tasks;
    return includeParentTasks(tasks, allTasks);
  }, [tasks, allTasks, isContractor]);

  // Build tree
  const rootTasks = useMemo(() => tasksWithParents.filter((t) => !t.parent_task_id), [tasksWithParents]);
  const childrenMap = useMemo(() => buildChildrenMap(tasks), [tasks]);

  // "What next?" summary
  const whatNext = useMemo(
    () => computeWhatNext(tasks, childrenMap, isContractor, user?.id),
    [tasks, childrenMap, isContractor, user?.id],
  );

  const projectTotalActual = useMemo(
    () => computeProjectTotalActual(rootTasks, childrenMap),
    [rootTasks, childrenMap],
  );

  // UI helpers
  const toggleExpanded = (taskId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const exitBulkMode = () => {
    setBulkMode(false);
    setSelectedTaskIds(new Set());
  };

  const handleBulkDone = () => {
    exitBulkMode();
    invalidateProject();
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
        assigned_to_user_id: assignedTo === 'unassigned' || assignedTo === 'outside_vendor' ? null : assignedTo,
        is_outside_vendor: assignedTo === 'outside_vendor',
        pendingMaterials,
        due_date: newDueDate || null,
        is_recurring: newIsRecurring && !!newDueDate,
        recurrence_frequency: newIsRecurring && newDueDate ? newRecurrenceFrequency : null,
      },
      {
        onSuccess: () => {
          setTaskName(''); setStage('Ready'); setPriority('2 – This Week');
          setRoomArea(''); setTrade(''); setNotes(''); setAssignedTo('unassigned');
          setPendingMaterials([]); setMatName(''); setMatQty(''); setMatUnit('');
          setNewDueDate(''); setNewIsRecurring(false); setNewRecurrenceFrequency('weekly');
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
              {isManager && (
                <Button size="sm" variant={bulkMode ? "secondary" : "outline"} onClick={() => bulkMode ? exitBulkMode() : setBulkMode(true)}>
                  <CheckSquare className="h-4 w-4 mr-1" />{bulkMode ? 'Cancel' : 'Bulk'}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => navigate(`/projects/${id}/materials`)}>
                 <Package className="h-4 w-4 mr-1" />Materials
               </Button>
              {/* Calendar route is admin-guarded in App routes */}
              {isAdmin && (
                <Button size="sm" variant="outline" onClick={() => navigate(`/admin/calendar?project=${id}`)}>
                   <CalendarDays className="h-4 w-4 mr-1" />Calendar
                 </Button>
              )}
              {/* Field Mode & Walkthrough are manager/admin workflows */}
              {isManager && (
                <>
                  <Button size="sm" variant="outline" onClick={() => navigate(`/projects/${id}/field-mode`)}>
                    <Zap className="h-4 w-4 mr-1" />Field Mode
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => navigate(`/projects/${id}/walkthrough`)}>
                    <Mic className="h-4 w-4 mr-1" />Walkthrough
                  </Button>
                </>
              )}
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
                      <SelectItem value="crew">Crew Task</SelectItem>
                      <SelectItem value="outside_vendor">Outside Vendor</SelectItem>
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
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Input type="date" value={newDueDate} onChange={(e) => {
                    setNewDueDate(e.target.value);
                    if (!e.target.value) setNewIsRecurring(false);
                  }} />
                </div>
                {newDueDate && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Recurring</Label>
                      <Switch checked={newIsRecurring} onCheckedChange={setNewIsRecurring} />
                    </div>
                    {newIsRecurring && (
                      <Select value={newRecurrenceFrequency} onValueChange={(v) => setNewRecurrenceFrequency(v as RecurrenceFrequency)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RECURRENCE_FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
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
          {userCanEditProject && (
            <div className="border-t pt-3 mt-1 flex flex-col gap-2">
              {(['construction', 'rental', 'general'] as const)
                .filter((t) => t !== (project as any).project_type)
                .map((targetType) => {
                  const labels: Record<string, string> = { construction: 'Construction', rental: 'Rentals', general: 'General' };
                  return (
                    <Button
                      key={targetType}
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={updateProjectMutation.isPending}
                      onClick={() => {
                        updateProjectMutation.mutate(
                          { project_type: targetType } as any,
                          {
                            onSuccess: () => {
                              setEditOpen(false);
                              toast({ title: `Moved to ${labels[targetType]}` });
                            },
                          },
                        );
                      }}
                    >
                      Move to {labels[targetType]}
                    </Button>
                  );
                })}
            </div>
          )}
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
        <WhatNextCard
          whatNext={whatNext}
          projectId={id!}
          isContractor={isContractor}
          openGroup={openGroup}
          setOpenGroup={setOpenGroup}
        />

        {bulkMode && (
          <BulkTaskBar
            selectedIds={selectedTaskIds}
            members={projectMembers}
            onClear={exitBulkMode}
            onDone={handleBulkDone}
          />
        )}
        {rootTasks.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No tasks yet.</p>
        ) : bulkMode ? (
          /* Bulk mode — checkboxes, no drag */
          <div className="space-y-2">
            {rootTasks.map((t) => {
              const children = childrenMap[t.id] || [];
              const isExpanded = expandedIds.has(t.id);
              const allChildrenDone = children.length === 0 || children.every((c: any) => c.stage === 'Done');
              return (
                <div key={t.id}>
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={selectedTaskIds.has(t.id)}
                      onCheckedChange={() => toggleTaskSelection(t.id)}
                      className="mt-4 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <TaskCard task={t} projectName={project.name} userId={user?.id ?? ''} isAdmin={isAdmin} onUpdate={invalidateProject} showProjectName={false} childCount={children.length} expanded={isExpanded} onToggle={() => toggleExpanded(t.id)} allChildrenDone={allChildrenDone} assigneeName={t.assigned_to_user_id ? assigneeMap[t.assigned_to_user_id] : undefined} photoCount={photoCountMap[t.id] || 0} materialCount={materialCountMap[t.id] || 0} />
                    </div>
                  </div>
                  {isExpanded && children.map((child: any) => (
                    <div key={child.id} className="flex items-start gap-2">
                      <Checkbox checked={selectedTaskIds.has(child.id)} onCheckedChange={() => toggleTaskSelection(child.id)} className="mt-4 ml-6 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <TaskCard task={child} projectName={project.name} userId={user?.id ?? ''} isAdmin={isAdmin} onUpdate={invalidateProject} showProjectName={false} isChild assigneeName={child.assigned_to_user_id ? assigneeMap[child.assigned_to_user_id] : undefined} photoCount={photoCountMap[child.id] || 0} materialCount={materialCountMap[child.id] || 0} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ) : isManager ? (
          /* Manager/Admin — draggable sort */
          <SortableTaskList
            items={rootTasks}
            onReorder={async (orderedIds) => {
              const { error } = await persistTaskOrder(orderedIds);
              if (error) toast({ title: 'Error', description: error, variant: 'destructive' });
              else invalidateProject();
            }}
          >
            {(t) => {
              const children = childrenMap[t.id] || [];
              const isExpanded = expandedIds.has(t.id);
              const allChildrenDone = children.length === 0 || children.every((c: any) => c.stage === 'Done');
              return (
                <SortableTaskItem key={t.id} id={t.id}>
                  <TaskCard task={t} projectName={project.name} userId={user?.id ?? ''} isAdmin={isAdmin} onUpdate={invalidateProject} showProjectName={false} childCount={children.length} expanded={isExpanded} onToggle={() => toggleExpanded(t.id)} allChildrenDone={allChildrenDone} assigneeName={t.assigned_to_user_id ? assigneeMap[t.assigned_to_user_id] : undefined} photoCount={photoCountMap[t.id] || 0} materialCount={materialCountMap[t.id] || 0} />
                  {isExpanded && children.map((child: any) => (
                    <div key={child.id} className="mt-2">
                      <TaskCard task={child} projectName={project.name} userId={user?.id ?? ''} isAdmin={isAdmin} onUpdate={invalidateProject} showProjectName={false} isChild assigneeName={child.assigned_to_user_id ? assigneeMap[child.assigned_to_user_id] : undefined} photoCount={photoCountMap[child.id] || 0} materialCount={materialCountMap[child.id] || 0} />
                    </div>
                  ))}
                </SortableTaskItem>
              );
            }}
          </SortableTaskList>
        ) : (
          /* Contractor — static list */
          <div className="space-y-2">
            {rootTasks.map((t) => {
              const children = childrenMap[t.id] || [];
              const isExpanded = expandedIds.has(t.id);
              const allChildrenDone = children.length === 0 || children.every((c: any) => c.stage === 'Done');
              return (
                <div key={t.id}>
                  <TaskCard task={t} projectName={project.name} userId={user?.id ?? ''} isAdmin={isAdmin} onUpdate={invalidateProject} showProjectName={false} childCount={children.length} expanded={isExpanded} onToggle={() => toggleExpanded(t.id)} allChildrenDone={allChildrenDone} assigneeName={t.assigned_to_user_id ? assigneeMap[t.assigned_to_user_id] : undefined} photoCount={photoCountMap[t.id] || 0} materialCount={materialCountMap[t.id] || 0} />
                  {isExpanded && children.map((child: any) => (
                    <TaskCard key={child.id} task={child} projectName={project.name} userId={user?.id ?? ''} isAdmin={isAdmin} onUpdate={invalidateProject} showProjectName={false} isChild assigneeName={child.assigned_to_user_id ? assigneeMap[child.assigned_to_user_id] : undefined} photoCount={photoCountMap[child.id] || 0} materialCount={materialCountMap[child.id] || 0} />
                  ))}
                </div>
              );
            })}
          </div>
        )}
        {isManager && <ProjectMembers projectId={id!} />}
      </div>
    </div>
  );
};

export default ProjectDetail;
