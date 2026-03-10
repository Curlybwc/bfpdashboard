import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
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
import { Plus, ChevronDown, ChevronRight, X, Mic, Zap, Package, Trash2, Loader2, Pencil, CalendarDays, CheckSquare, Search } from 'lucide-react';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import ProjectMembers from '@/components/ProjectMembers';
import { TASK_STAGES, TASK_PRIORITIES, RECURRENCE_FREQUENCIES, type TaskStage, type TaskPriority, type RecurrenceFrequency } from '@/lib/supabase-types';
import { Switch } from '@/components/ui/switch';
import TaskCard from '@/components/TaskCard';
import BulkTaskBar from '@/components/BulkTaskBar';
import { SortableTaskList, SortableTaskItem, persistTaskOrder } from '@/components/SortableTaskList';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useAdmin } from '@/hooks/useAdmin';
import { useProjectDetail } from '@/hooks/useProjectDetail';
import { useCreateTask, useUpdateProject, useDeleteProject } from '@/hooks/useProjectMutations';
import { canCreateTask, canEditProject, getProjectRole } from '@/lib/permissions';
import { useQueryClient } from '@tanstack/react-query';
import WhatNextCard from '@/components/WhatNextCard';
import { computeWhatNext, computeProjectHealthSummary, computeProjectTotalActual } from '@/lib/projectSummary';
import { filterContractorTasks, includeParentTasks, buildChildrenMap, buildAssigneeMap } from '@/lib/projectTaskFiltering';
import { getTaskOperationalStatus } from '@/lib/taskOperationalStatus';
import { buildTaskPackageGroups } from '@/lib/taskPackages';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

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
  const [selectedPackageId, setSelectedPackageId] = useState('general');
  const [createAsPackage, setCreateAsPackage] = useState(false);
  const [pendingMaterials, setPendingMaterials] = useState<{ name: string; quantity: string; unit: string }[]>([]);
  const [matName, setMatName] = useState('');
  const [matQty, setMatQty] = useState('');
  const [matUnit, setMatUnit] = useState('');
  const [crewCandidates, setCrewCandidates] = useState<string[]>([]);
  const [crewGroups, setCrewGroups] = useState<{ id: string; name: string; members: string[] }[]>([]);
  const [saveGroupName, setSaveGroupName] = useState('');
  const [showSaveGroup, setShowSaveGroup] = useState(false);
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
  const [taskSearch, setTaskSearch] = useState('');
  const [filterStage, setFilterStage] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterAssignee, setFilterAssignee] = useState<string>('all');
  const [filterTrade, setFilterTrade] = useState<string>('all');
  const [filterRoomArea, setFilterRoomArea] = useState<string>('all');
  const [showCompletedSection, setShowCompletedSection] = useState(false);

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

  // Fetch crew groups
  useEffect(() => {
    const fetchCrewGroups = async () => {
      const { data: groupsData } = await supabase.from('crew_groups').select('id, name');
      if (!groupsData) return;
      const { data: membersData } = await supabase.from('crew_group_members').select('crew_group_id, user_id');
      setCrewGroups(groupsData.map((g: any) => ({
        id: g.id,
        name: g.name,
        members: (membersData || []).filter((m: any) => m.crew_group_id === g.id).map((m: any) => m.user_id),
      })));
    };
    fetchCrewGroups();
  }, []);

  // Task filtering (contractor vs full view)
  const tasks = useMemo(() => {
    if (!isContractor || !user) return allTasks;
    return filterContractorTasks(allTasks, user.id, myActiveWorkerTaskIds, myCandidateTaskIds);
  }, [allTasks, isContractor, user, myActiveWorkerTaskIds, myCandidateTaskIds]);

  const tasksWithParents = useMemo(() => {
    if (!isContractor) return tasks;
    return includeParentTasks(tasks, allTasks);
  }, [tasks, allTasks, isContractor]);

  const packageOptions = useMemo(() => {
    return allTasks.filter((t) => allTasks.some((c) => c.parent_task_id === t.id));
  }, [allTasks]);

  const tradeFilterOptions = useMemo(() => {
    return [...new Set(tasksWithParents.map((t) => t.trade).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
  }, [tasksWithParents]);

  const roomAreaFilterOptions = useMemo(() => {
    return [...new Set(tasksWithParents.map((t) => t.room_area).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
  }, [tasksWithParents]);

  // Build tree
  const childrenMap = useMemo(() => buildChildrenMap(tasks), [tasks]);

  const filteredTasksWithParents = useMemo(() => {
    const query = taskSearch.trim().toLowerCase();
    const hasTaskFilters = !!query || filterStage !== 'all' || filterPriority !== 'all' || filterAssignee !== 'all' || filterTrade !== 'all' || filterRoomArea !== 'all';
    if (!hasTaskFilters) return tasksWithParents;

    const byId = new Map(tasksWithParents.map((t) => [t.id, t]));
    const matched = tasksWithParents.filter((task) => {
      if (query) {
        const haystack = [task.task, task.trade, task.room_area, task.notes].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (filterStage !== 'all' && task.stage !== filterStage) return false;
      if (filterPriority !== 'all' && task.priority !== filterPriority) return false;
      if (filterAssignee !== 'all' && (task.assigned_to_user_id || 'unassigned') !== filterAssignee) return false;
      if (filterTrade !== 'all' && (task.trade || '') !== filterTrade) return false;
      if (filterRoomArea !== 'all' && (task.room_area || '') !== filterRoomArea) return false;
      return true;
    });

    const visibleIds = new Set(matched.map((t) => t.id));
    matched.forEach((task) => {
      let parentId = task.parent_task_id;
      while (parentId) {
        visibleIds.add(parentId);
        parentId = byId.get(parentId)?.parent_task_id || null;
      }
    });

    return tasksWithParents.filter((task) => visibleIds.has(task.id));
  }, [tasksWithParents, taskSearch, filterStage, filterPriority, filterAssignee, filterTrade, filterRoomArea]);

  const rootTasks = useMemo(() => {
    const filtered = filteredTasksWithParents.filter((t) => !t.parent_task_id);
    return filtered.sort((a, b) => {
      const aDone = getTaskOperationalStatus(a) === 'done' ? 1 : 0;
      const bDone = getTaskOperationalStatus(b) === 'done' ? 1 : 0;
      return aDone - bDone;
    });
  }, [filteredTasksWithParents]);

  const packageGroups = useMemo(() => buildTaskPackageGroups(filteredTasksWithParents, materialCountMap), [filteredTasksWithParents, materialCountMap]);

  const activePackageGroups = useMemo(
    () => packageGroups.filter((group) => !(group.summary.total > 0 && group.summary.byStatus.done === group.summary.total)),
    [packageGroups],
  );

  const completedPackageGroups = useMemo(
    () => packageGroups.filter((group) => group.summary.total > 0 && group.summary.byStatus.done === group.summary.total),
    [packageGroups],
  );

  const completedTaskCount = useMemo(
    () => completedPackageGroups.reduce((sum, group) => sum + group.summary.total, 0),
    [completedPackageGroups],
  );

  // "What next?" summary
  const whatNext = useMemo(
    () => computeWhatNext(tasks, childrenMap, isContractor, user?.id),
    [tasks, childrenMap, isContractor, user?.id],
  );

  const projectTotalActual = useMemo(
    () => computeProjectTotalActual(rootTasks, childrenMap),
    [rootTasks, childrenMap],
  );

  const projectHealthSummary = useMemo(
    () => computeProjectHealthSummary(allTasks),
    [allTasks],
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

  const clearTaskFilters = () => {
    setTaskSearch('');
    setFilterStage('all');
    setFilterPriority('all');
    setFilterAssignee('all');
    setFilterTrade('all');
    setFilterRoomArea('all');
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
        assigned_to_user_id: createAsPackage || assignedTo === 'unassigned' || assignedTo === 'outside_vendor' || assignedTo === 'crew' ? null : assignedTo,
        is_outside_vendor: assignedTo === 'outside_vendor',
        assignment_mode: createAsPackage ? 'solo' : (assignedTo === 'crew' ? 'crew' : 'solo'),
        crewCandidates: createAsPackage ? [] : (assignedTo === 'crew' ? crewCandidates : []),
        parent_task_id: createAsPackage || selectedPackageId === 'general' ? null : selectedPackageId,
        is_package: createAsPackage,
        pendingMaterials: createAsPackage ? [] : pendingMaterials,
        due_date: newDueDate || null,
        is_recurring: newIsRecurring && !!newDueDate,
        recurrence_frequency: newIsRecurring && newDueDate ? newRecurrenceFrequency : null,
      },
      {
        onSuccess: () => {
          setTaskName(''); setStage('Ready'); setPriority('2 – This Week');
          setRoomArea(''); setTrade(''); setNotes(''); setAssignedTo('unassigned');
          setPendingMaterials([]); setMatName(''); setMatQty(''); setMatUnit('');
          setCrewCandidates([]);
          setSelectedPackageId('general');
          setCreateAsPackage(false);
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

  if (isLoading || !project) {
    return (
      <div className="pb-20">
        <div className="p-4 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Card>
            <CardContent className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-10" />
                </div>
              ))}
            </CardContent>
          </Card>
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
    );
  }

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
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={createAsPackage ? 'package' : 'task'} onValueChange={(v) => setCreateAsPackage(v === 'package')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="task">Actionable Task</SelectItem>
                      <SelectItem value="package">Package (Container)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {!createAsPackage && (
                  <div className="space-y-2">
                    <Label>Package</Label>
                    <Select value={selectedPackageId} onValueChange={setSelectedPackageId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General (No Package)</SelectItem>
                        {packageOptions.map((pkg) => (
                          <SelectItem key={pkg.id} value={pkg.id}>{pkg.task}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
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
                {!createAsPackage && (
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
                )}
                {!createAsPackage && assignedTo === 'crew' && (
                  <div className="space-y-2">
                    <Label>Crew Members</Label>
                    {crewGroups.length > 0 && (
                      <Select value="" onValueChange={(groupId) => {
                        const group = crewGroups.find(g => g.id === groupId);
                        if (group) setCrewCandidates(group.members);
                      }}>
                        <SelectTrigger><SelectValue placeholder="Load from crew group..." /></SelectTrigger>
                        <SelectContent>
                          {crewGroups.map(g => (
                            <SelectItem key={g.id} value={g.id}>{g.name} ({g.members.length})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <div className="space-y-1 max-h-40 overflow-y-auto rounded border p-2">
                      {projectMembers.map((m) => (
                        <label key={m.user_id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                          <Checkbox
                            checked={crewCandidates.includes(m.user_id)}
                            onCheckedChange={(checked) => {
                              setCrewCandidates(prev =>
                                checked
                                  ? [...prev, m.user_id]
                                  : prev.filter(cid => cid !== m.user_id)
                              );
                            }}
                          />
                          <span>{m.profiles?.full_name || 'Unnamed'}</span>
                          <span className="text-muted-foreground">({m.role})</span>
                        </label>
                      ))}
                    </div>
                    {crewCandidates.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">{crewCandidates.length} member{crewCandidates.length !== 1 ? 's' : ''} selected</p>
                        {!showSaveGroup ? (
                          <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowSaveGroup(true)}>
                            Save as crew group
                          </button>
                        ) : (
                          <div className="flex gap-1">
                            <Input
                              placeholder="Group name"
                              value={saveGroupName}
                              onChange={(e) => setSaveGroupName(e.target.value)}
                              className="h-7 text-xs"
                            />
                            <Button type="button" size="sm" className="h-7 text-xs" disabled={!saveGroupName.trim()} onClick={async () => {
                              if (!user) return;
                              const { data: newGroup } = await supabase.from('crew_groups').insert({ name: saveGroupName.trim(), created_by: user.id }).select('id').single();
                              if (newGroup) {
                                await supabase.from('crew_group_members').insert(crewCandidates.map(uid => ({ crew_group_id: newGroup.id, user_id: uid })));
                                setCrewGroups(prev => [...prev, { id: newGroup.id, name: saveGroupName.trim(), members: crewCandidates }]);
                                toast({ title: 'Crew group saved' });
                              }
                              setSaveGroupName('');
                              setShowSaveGroup(false);
                            }}>Save</Button>
                            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setShowSaveGroup(false); setSaveGroupName(''); }}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                </div>
                {!createAsPackage && (
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Input type="date" value={newDueDate} onChange={(e) => {
                    setNewDueDate(e.target.value);
                    if (!e.target.value) setNewIsRecurring(false);
                  }} />
                </div>
                )}
                {!createAsPackage && newDueDate && (
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
                {!createAsPackage && (
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
                )}
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
        <div className="flex items-center gap-2 mb-3">
          <StatusBadge status={project.status} />
          {project.address && <span className="text-sm text-muted-foreground">{project.address}</span>}
        </div>

        <Card className="mb-4">
          <CardContent className="p-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</p>
                <p className="text-lg font-semibold">{projectHealthSummary.totalTasks}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Completed</p>
                <p className="text-lg font-semibold">{projectHealthSummary.completedTasks}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Blocked</p>
                <p className="text-lg font-semibold text-destructive">{projectHealthSummary.blockedTasks}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Needs Review</p>
                <p className="text-lg font-semibold">{projectHealthSummary.needsReviewCount}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Overdue</p>
                <p className="text-lg font-semibold">{projectHealthSummary.overdueCount}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Actual Cost</p>
                <p className="text-lg font-semibold">${projectTotalActual.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* What next? section */}
        <WhatNextCard
          whatNext={whatNext}
          projectId={id!}
          isContractor={isContractor}
          openGroup={openGroup}
          setOpenGroup={setOpenGroup}
          members={projectMembers.map(m => ({ user_id: m.user_id, full_name: m.profiles?.full_name || null, role: m.role }))}
          crewGroups={crewGroups}
          onUpdate={invalidateProject}
        />

        <Card className="mb-4">
          <CardContent className="p-3 space-y-2">
            <div className="relative">
              <Search className="h-4 w-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                placeholder="Search tasks..."
                className="pl-8"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={filterStage} onValueChange={setFilterStage}>
                <SelectTrigger><SelectValue placeholder="Stage" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stages</SelectItem>
                  {TASK_STAGES.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  {TASK_PRIORITIES.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                <SelectTrigger><SelectValue placeholder="Assignee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assignees</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {projectMembers.map((member) => (
                    <SelectItem key={member.user_id} value={member.user_id}>{member.profiles?.full_name || 'Unnamed'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterTrade} onValueChange={setFilterTrade}>
                <SelectTrigger><SelectValue placeholder="Trade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All trades</SelectItem>
                  {tradeFilterOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterRoomArea} onValueChange={setFilterRoomArea}>
                <SelectTrigger><SelectValue placeholder="Room / Area" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All rooms/areas</SelectItem>
                  {roomAreaFilterOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={clearTaskFilters}>Clear</Button>
            </div>
          </CardContent>
        </Card>

        {bulkMode && (
          <BulkTaskBar
            selectedIds={selectedTaskIds}
            members={projectMembers}
            onClear={exitBulkMode}
            onDone={handleBulkDone}
          />
        )}

        {tasksWithParents.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No tasks yet.</p>
        ) : packageGroups.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center space-y-2">
            <p className="text-sm font-medium">No tasks match your filters.</p>
            <p className="text-xs text-muted-foreground">Try adjusting search or filter selections.</p>
            <Button type="button" variant="outline" size="sm" onClick={clearTaskFilters}>Reset filters</Button>
          </div>
        ) : (
          <>
            {activePackageGroups.length > 0 && (
              <div className="space-y-4">
                {activePackageGroups.map((group) => {
                  const packageKey = `pkg:${group.packageTask.id}`;
                  const open = expandedIds.has(packageKey);
                  return (
                    <div key={group.packageTask.id} className="rounded-lg border">
                      <button className="w-full p-3 text-left flex items-center gap-2" onClick={() => toggleExpanded(packageKey)}>
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{group.packageTask.task}</p>
                          {(group.packageTask.room_area || group.packageTask.trade) && (
                            <p className="text-xs text-muted-foreground">
                              {[group.packageTask.room_area, group.packageTask.trade].filter(Boolean).join(' • ')}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap justify-end gap-1">
                          <Badge variant="outline" className="text-xs">{group.summary.total} tasks</Badge>
                          <Badge variant="secondary" className="text-xs">Ready {group.summary.byStatus.ready}</Badge>
                          <Badge variant="secondary" className="text-xs">In Progress {group.summary.byStatus.in_progress}</Badge>
                          {group.summary.byStatus.blocked > 0 && <Badge variant="destructive" className="text-xs">Blocked {group.summary.byStatus.blocked}</Badge>}
                          {group.summary.byStatus.review_needed > 0 && <Badge variant="outline" className="text-xs">Review {group.summary.byStatus.review_needed}</Badge>}
                          {group.summary.materialsNeeded > 0 && <Badge variant="outline" className="text-xs">Materials {group.summary.materialsNeeded}</Badge>}
                        </div>
                      </button>
                      {open && (
                        <div className="border-t p-2 space-y-2">
                          {bulkMode ? (
                            group.childTasks.map((task) => (
                              <div key={task.id} className="flex items-start gap-2">
                                <Checkbox checked={selectedTaskIds.has(task.id)} onCheckedChange={() => toggleTaskSelection(task.id)} className="mt-4 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <TaskCard task={task} projectName={project.name} userId={user?.id ?? ''} isAdmin={isAdmin} onUpdate={invalidateProject} showProjectName={false} assigneeName={task.assigned_to_user_id ? assigneeMap[task.assigned_to_user_id] : undefined} photoCount={photoCountMap[task.id] || 0} materialCount={materialCountMap[task.id] || 0} canReportIssue={isContractor} />
                                </div>
                              </div>
                            ))
                          ) : isManager ? (
                            <SortableTaskList
                              items={group.childTasks}
                              onReorder={async (orderedIds) => {
                                const { error } = await persistTaskOrder(orderedIds);
                                if (error) toast({ title: 'Error', description: error, variant: 'destructive' });
                                else invalidateProject();
                              }}
                            >
                              {(task) => (
                                <SortableTaskItem key={task.id} id={task.id}>
                                  <TaskCard task={task} projectName={project.name} userId={user?.id ?? ''} isAdmin={isAdmin} onUpdate={invalidateProject} showProjectName={false} assigneeName={task.assigned_to_user_id ? assigneeMap[task.assigned_to_user_id] : undefined} photoCount={photoCountMap[task.id] || 0} materialCount={materialCountMap[task.id] || 0} canReportIssue={isContractor} />
                                </SortableTaskItem>
                              )}
                            </SortableTaskList>
                          ) : (
                            group.childTasks.map((task) => (
                              <TaskCard key={task.id} task={task} projectName={project.name} userId={user?.id ?? ''} isAdmin={isAdmin} onUpdate={invalidateProject} showProjectName={false} assigneeName={task.assigned_to_user_id ? assigneeMap[task.assigned_to_user_id] : undefined} photoCount={photoCountMap[task.id] || 0} materialCount={materialCountMap[task.id] || 0} canReportIssue={isContractor} />
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {completedPackageGroups.length > 0 && (
              <div className="mt-4">
                <button
                  type="button"
                  className="w-full flex items-center justify-between rounded-lg border p-3 text-left"
                  onClick={() => setShowCompletedSection((prev) => !prev)}
                >
                  <span className="text-sm font-medium">{showCompletedSection ? 'Hide' : 'Show'} {completedTaskCount} completed tasks</span>
                  {showCompletedSection ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                {showCompletedSection && (
                  <div className="mt-3 space-y-4">
                    {completedPackageGroups.map((group) => {
                      const packageKey = `pkg:${group.packageTask.id}`;
                      const open = expandedIds.has(packageKey);
                      return (
                        <div key={group.packageTask.id} className="rounded-lg border border-muted">
                          <button className="w-full p-3 text-left flex items-center gap-2" onClick={() => toggleExpanded(packageKey)}>
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm">{group.packageTask.task}</p>
                            </div>
                            <Badge variant="outline" className="text-xs">{group.summary.total} done</Badge>
                          </button>
                          {open && (
                            <div className="border-t p-2 space-y-2">
                              {group.childTasks.map((task) => (
                                <TaskCard key={task.id} task={task} projectName={project.name} userId={user?.id ?? ''} isAdmin={isAdmin} onUpdate={invalidateProject} showProjectName={false} assigneeName={task.assigned_to_user_id ? assigneeMap[task.assigned_to_user_id] : undefined} photoCount={photoCountMap[task.id] || 0} materialCount={materialCountMap[task.id] || 0} canReportIssue={isContractor} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {isManager && <ProjectMembers projectId={id!} />}
      </div>
    </div>
  );
};

export default ProjectDetail;
