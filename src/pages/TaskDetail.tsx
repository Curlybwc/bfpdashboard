import { useEffect, useState } from 'react';
import { getErrorMessage } from '@/lib/utils';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { TASK_STAGES, TASK_PRIORITIES, BLOCKER_REASONS, RECURRENCE_FREQUENCIES, type TaskStage, type TaskPriority, type BlockerReason, type RecurrenceFrequency } from '@/lib/supabase-types';
import { canReportBlocker, canResolveBlocker } from '@/lib/permissions';
import { Trash2, Zap, CheckCircle2, Users, X, Plus, BookOpen, Save, Search, Pencil, ChevronDown, ChevronUp, AlertTriangle, Repeat } from 'lucide-react';
import TaskMaterialsSheet from '@/components/TaskMaterialsSheet';
import TaskPhotos from '@/components/TaskPhotos';
import TaskComments from '@/components/TaskComments';
import { Card } from '@/components/ui/card';
import { getTaskOperationalStatus, isTaskActionable } from '@/lib/taskOperationalStatus';
import RecipeStepsEditor from '@/components/recipe/RecipeStepsEditor';
import { claimTask, completeTask, startTask } from '@/lib/taskLifecycle';
import { useTaskDetailData } from '@/hooks/useTaskDetailData';
import TaskLifecycleActions from '@/components/task-detail/TaskLifecycleActions';
import SubtaskRow from '@/components/task-detail/SubtaskRow';

const TaskDetail = () => {
  const { projectId, taskId } = useParams<{ projectId: string; taskId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [dibsConfirmOpen, setDibsConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [cascadeAssign, setCascadeAssign] = useState(false);
  const [markingReviewed, setMarkingReviewed] = useState(false);

  // Blocker state
  const [blockerSheetOpen, setBlockerSheetOpen] = useState(false);
  const [blockerReason, setBlockerReason] = useState<BlockerReason>('missing_materials');
  const [blockerNote, setBlockerNote] = useState('');
  const [blockerNeedsFromManager, setBlockerNeedsFromManager] = useState('');
  const [reportingBlocker, setReportingBlocker] = useState(false);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolvingBlocker, setResolvingBlocker] = useState(false);

  // Recipe state
  const [expandingRecipe, setExpandingRecipe] = useState(false);
  const [saveRecipeOpen, setSaveRecipeOpen] = useState(false);
  const [saveRecipeName, setSaveRecipeName] = useState('');
  const [saveRecipeTrade, setSaveRecipeTrade] = useState('');
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [createRecipeOpen, setCreateRecipeOpen] = useState(false);
  const [newRecipeName, setNewRecipeName] = useState('');
  const [newRecipeTrade, setNewRecipeTrade] = useState('');
  const [newRecipeKeywords, setNewRecipeKeywords] = useState('');
  const [creatingRecipe, setCreatingRecipe] = useState(false);
  const [newlyCreatedRecipeId, setNewlyCreatedRecipeId] = useState<string | null>(null);
  const [newRecipeStepCount, setNewRecipeStepCount] = useState(0);
  const [recipeEditorOpen, setRecipeEditorOpen] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [recipeSearchOpen, setRecipeSearchOpen] = useState(false);
  const [recipeSearchQuery, setRecipeSearchQuery] = useState('');
  const [recipeSearchResults, setRecipeSearchResults] = useState<{ id: string; name: string; trade: string | null; keywords: string[] | null }[]>([]);
  const [recipeSearchLoading, setRecipeSearchLoading] = useState(false);

  // Crew state
  const [crewToggleLoading, setCrewToggleLoading] = useState(false);
  const [addCandidatesOpen, setAddCandidatesOpen] = useState(false);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [addingCandidates, setAddingCandidates] = useState(false);

  // Photo state
  const [photoConfirmOpen, setPhotoConfirmOpen] = useState(false);
  // Recipe sync state
  const [recipeSyncOpen, setRecipeSyncOpen] = useState(false);
  const [syncingRecipe, setSyncingRecipe] = useState(false);
  const {
    task,
    projectRole,
    children,
    projectMembers,
    fieldCapture,
    photos,
    activeBlocker,
    blockerReporterName,
    suggestedRecipe,
    setSuggestedRecipe,
    recipeSearchDone,
    setRecipeSearchDone,
    linkedRecipeStepCount,
    crewWorkers,
    crewCandidates,
    fetchTask,
    fetchChildren,
    fetchPhotos,
    fetchCrewData,
    fetchLinkedRecipeStepCount,
  } = useTaskDetailData(taskId, user?.id);

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
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency>('weekly');


  // Sync fetched task data into editable form fields
  useEffect(() => {
    if (!task) return;
    setTaskText(task.task || '');
    setStage(task.stage || 'Ready');
    setPriority(task.priority || '2 – This Week');
    setRoomArea(task.room_area || '');
    setTrade(task.trade || '');
    setNotes(task.notes || '');
    setDueDate(task.due_date || '');
    setActualCost(task.actual_total_cost != null ? String(task.actual_total_cost) : '');
    setAssignedTo(task.is_outside_vendor ? 'outside_vendor' : (task.assigned_to_user_id || 'unassigned'));
    setIsRecurring(task.is_recurring || false);
    setRecurrenceFrequency(task.recurrence_frequency || 'weekly');
  }, [task]);

  useEffect(() => {
    if (!task) return;
    if (searchParams.get('report') !== '1') return;
    const reason = searchParams.get('reason');
    const allowed = new Set(BLOCKER_REASONS.map((r) => r.value));
    if (reason && allowed.has(reason as any)) {
      setBlockerReason(reason as BlockerReason);
    }
    setBlockerSheetOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('report');
    next.delete('reason');
    setSearchParams(next, { replace: true });
  }, [task, searchParams, setSearchParams]);


  const handleMarkReviewed = async () => {
    if (!taskId) return;
    setMarkingReviewed(true);
    await supabase.from('tasks').update({ needs_manager_review: false }).eq('id', taskId);
    setMarkingReviewed(false);
    toast({ title: 'Marked as reviewed' });
    fetchTask();
  };

  const handleReportBlocker = async () => {
    if (!user || !taskId) return;
    setReportingBlocker(true);
    // Single write — trigger keeps tasks.is_blocked in sync
    const { error: insertErr } = await supabase.from('task_blockers').insert({
      task_id: taskId,
      reason: blockerReason as any,
      note: blockerNote.trim() || null,
      needs_from_manager: blockerNeedsFromManager.trim() || null,
      blocked_by_user_id: user.id,
    } as any);
    setReportingBlocker(false);
    if (insertErr) {
      const isDuplicate = insertErr.code === '23505';
      toast({
        title: isDuplicate ? 'Already blocked' : 'Failed to report blocker',
        description: isDuplicate ? 'This task already has an active blocker.' : insertErr.message,
        variant: 'destructive',
      });
      return;
    }
    if (projectRole === 'contractor') {
      await supabase.from('tasks').update({ needs_manager_review: true }).eq('id', taskId);
      if (blockerNote.trim()) {
        await supabase.from('task_comments').insert({
          task_id: taskId,
          author_user_id: user.id,
          content: `[Issue Report] ${blockerNote.trim()}`,
        } as any);
      }
    }

    setBlockerSheetOpen(false);
    setBlockerReason('missing_materials');
    setBlockerNote('');
    setBlockerNeedsFromManager('');
    toast({ title: projectRole === 'contractor' ? 'Issue submitted for manager review' : 'Blocker reported' });
    fetchTask();
  };

  const handleResolveBlocker = async () => {
    if (!user || !activeBlocker) return;
    setResolvingBlocker(true);
    // Single write — trigger keeps tasks.is_blocked in sync
    const { error: updateErr } = await supabase.from('task_blockers').update({
      resolved_at: new Date().toISOString(),
      resolved_by_user_id: user.id,
      resolution_note: resolutionNote.trim() || null,
    }).eq('id', activeBlocker.id);
    setResolvingBlocker(false);
    if (updateErr) {
      toast({ title: 'Failed to resolve blocker', description: updateErr.message, variant: 'destructive' });
      return;
    }
    setResolveDialogOpen(false);
    setResolutionNote('');
    toast({ title: 'Blocker resolved' });
    fetchTask();
  };

  const handleSave = async (skipPhotoCheck = false) => {
    if (!taskId || !task) return;

    // Validation: recurring requires due date
    if (isRecurring && !dueDate) {
      toast({ title: 'Due date required', description: 'A recurring task must have a due date.', variant: 'destructive' });
      return;
    }
    // Photo nudge: prompt if no "after" photo when marking Done
    if (!skipPhotoCheck && stage === 'Done' && task.stage !== 'Done') {
      const hasAfterPhoto = photos.some(p => p.phase === 'after');
      if (!hasAfterPhoto) {
        setPhotoConfirmOpen(true);
        return;
      }
    }

    setSaving(true);

    const oldStage = task.stage;
    const isCrewMode = task.assignment_mode === 'crew';
    const isVendor = assignedTo === 'outside_vendor';
    const newAssignedTo = isCrewMode ? null : (assignedTo === 'unassigned' || isVendor ? null : assignedTo);

    const updatePayload: any = {
      task: taskText,
      stage,
      priority,
      room_area: roomArea || null,
      trade: trade || null,
      notes: notes || null,
      due_date: dueDate || null,
      assigned_to_user_id: newAssignedTo,
      is_outside_vendor: isVendor,
      is_recurring: isRecurring,
      recurrence_frequency: isRecurring ? recurrenceFrequency : null,
      recurrence_anchor_date: isRecurring && dueDate ? dueDate : null,
    };
    if (isAdmin) {
      updatePayload.actual_total_cost = actualCost ? parseFloat(actualCost) : null;
    }

    // If transitioning to Done and recurring, use RPC instead
    if (stage === 'Done' && oldStage !== 'Done' && isRecurring && dueDate) {
      // First save all other fields
      const savePay = { ...updatePayload };
      delete savePay.stage; // RPC will set stage
      await supabase.from('tasks').update(savePay).eq('id', taskId);
      const { error: rpcErr } = await supabase.rpc('complete_recurring_task', { p_task_id: taskId });
      setSaving(false);
      if (rpcErr) { toast({ title: 'Error', description: rpcErr.message, variant: 'destructive' }); }
      else { toast({ title: 'Saved — next occurrence created' }); fetchTask(); fetchChildren(); }
      return;
    }

    const { error } = await supabase.from('tasks').update(updatePayload).eq('id', taskId);

    // Stage sync: if moving FROM Done and has parent, revert parent
    if (!error && oldStage === 'Done' && stage !== 'Done' && task.parent_task_id) {
      const { data: parent } = await supabase.from('tasks').select('id, stage').eq('id', task.parent_task_id).single();
      if (parent && parent.stage === 'Done') {
        await supabase.from('tasks').update({ stage: 'In Progress' }).eq('id', task.parent_task_id);
      }
    }

    // Assignment cascade (solo only)
    if (!error && !isCrewMode && cascadeAssign && children.length > 0) {
      await supabase.from('tasks').update({
        assigned_to_user_id: newAssignedTo,
      }).in('id', children.map(c => c.id));
    }

    setSaving(false);
    setCascadeAssign(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
    else {
      toast({ title: 'Saved' });
      fetchTask();
      fetchChildren();
      // Prompt recipe sync if task was expanded from a recipe and has children
      if (task.expanded_recipe_id && children.length > 0) {
        setRecipeSyncOpen(true);
      }
    }
  };




  const handleExpandRecipe = async (recipeId: string) => {
    if (!taskId || !task || !user) return;
    setExpandingRecipe(true);
    // Clear stale expanded_recipe_id if set but no children exist (orphaned state)
    if (task.expanded_recipe_id && children.length === 0) {
      await supabase.from('tasks').update({ expanded_recipe_id: null }).eq('id', taskId);
    }
    const { data, error } = await supabase.rpc('expand_recipe', {
      p_parent_task_id: taskId,
      p_recipe_id: recipeId,
      p_user_id: user.id,
    });
    if (error) {
      toast({ title: 'Error expanding recipe', description: error.message, variant: 'destructive' });
      setExpandingRecipe(false);
      return;
    }
    setExpandingRecipe(false);
    toast({ title: `Recipe expanded (${data} steps)` });
    fetchTask();
    fetchChildren();
  };

  const handleAddSubtask = async () => {
    if (!newSubtaskTitle.trim() || !user || !projectId || !taskId) return;
    setAddingSubtask(true);
    const maxOrder = children.length > 0 ? Math.max(...children.map((c: any) => c.sort_order ?? 0)) : 0;
    const { error } = await supabase.from('tasks').insert({
      project_id: projectId,
      parent_task_id: taskId,
      task: newSubtaskTitle.trim(),
      sort_order: maxOrder + 10,
      trade: task?.trade || null,
      priority: task?.priority || '2 – This Week',
      stage: 'Not Ready',
      materials_on_site: 'No',
      created_by: user.id,
    });
    setAddingSubtask(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setNewSubtaskTitle('');
    fetchChildren();
  };

  const handleSaveAsRecipe = async () => {
    if (!user || !task || !saveRecipeName.trim()) return;
    setSavingRecipe(true);
    const { data: recipe, error: recipeErr } = await supabase.from('task_recipes').insert({
      name: saveRecipeName.trim(),
      trade: saveRecipeTrade.trim() || null,
      keywords: [],
      created_by: user.id,
    }).select('id').single();
    if (recipeErr || !recipe) {
      toast({ title: 'Error', description: recipeErr?.message, variant: 'destructive' });
      setSavingRecipe(false);
      return;
    }

    const sourceTasks = children.length > 0 ? children : [task];

    // Fetch crew candidates for each source task
    const sourceTaskIds = sourceTasks.map((sourceTask) => sourceTask.id);
    const { data: allCandidates } = await supabase
      .from('task_candidates')
      .select('task_id, user_id')
      .in('task_id', sourceTaskIds);

    const candidatesByTask = new Map<string, string[]>();
    (allCandidates || []).forEach((c) => {
      const list = candidatesByTask.get(c.task_id) || [];
      list.push(c.user_id);
      candidatesByTask.set(c.task_id, list);
    });

    const stepInserts = sourceTasks.map((sourceTask, idx) => ({
      recipe_id: recipe.id,
      title: sourceTask.task,
      sort_order: (idx + 1) * 10,
      trade: sourceTask.trade || null,
      created_by: user.id,
      assignment_mode: sourceTask.assignment_mode || 'solo',
      default_candidate_user_ids: candidatesByTask.get(sourceTask.id) || [],
    }));

    const { data: insertedSteps, error: stepErr } = await supabase
      .from('task_recipe_steps')
      .insert(stepInserts)
      .select('id, sort_order');

    if (stepErr || !insertedSteps) {
      toast({ title: 'Error', description: stepErr?.message || 'Unable to save recipe steps', variant: 'destructive' });
      setSavingRecipe(false);
      return;
    }

    const { data: sourceMaterials, error: matsErr } = await supabase
      .from('task_materials')
      .select('task_id, name, quantity, unit, sku, vendor_url, store_section, provided_by, item_type, unit_cost')
      .in('task_id', sourceTaskIds)
      .eq('is_active', true);

    if (matsErr) {
      toast({ title: 'Error', description: matsErr.message, variant: 'destructive' });
      setSavingRecipe(false);
      return;
    }

    const stepIdByTaskId = new Map<string, string>();
    sourceTasks.forEach((sourceTask, index) => {
      const sortOrder = (index + 1) * 10;
      const step = insertedSteps.find((insertedStep) => insertedStep.sort_order === sortOrder);
      if (step?.id) stepIdByTaskId.set(sourceTask.id, step.id);
    });

    const materialInserts = (sourceMaterials || []).flatMap((material) => {
      const stepId = stepIdByTaskId.get(material.task_id);
      if (!stepId) return [];
      return [{
        recipe_step_id: stepId,
        material_name: material.name,
        qty: material.quantity,
        unit: material.unit,
        sku: material.sku,
        vendor_url: material.vendor_url,
        store_section: material.store_section,
        provided_by: material.provided_by,
        item_type: material.item_type,
        unit_cost: material.unit_cost,
      }];
    });

    if (materialInserts.length > 0) {
      const { error: insertMatsErr } = await supabase.from('task_recipe_step_materials').insert(materialInserts);
      if (insertMatsErr) {
        toast({ title: 'Error', description: insertMatsErr.message, variant: 'destructive' });
        setSavingRecipe(false);
        return;
      }
    }

    await supabase.from('tasks').update({ recipe_hint_id: recipe.id }).eq('id', taskId);
    setSuggestedRecipe({ id: recipe.id, name: saveRecipeName.trim() });
    fetchLinkedRecipeStepCount();
    setSavingRecipe(false);
    setSaveRecipeOpen(false);
    setSaveRecipeName('');
    setSaveRecipeTrade('');
    toast({ title: children.length > 0 ? 'Workflow recipe saved from subtasks' : 'Single-step recipe saved from task' });
  };

  const handleCreateRecipeAndExpand = async () => {
    if (!user || !taskId || !newRecipeName.trim()) return;
    setCreatingRecipe(true);
    const kwArray = newRecipeKeywords.split(',').map(k => k.trim()).filter(Boolean);
    const { data: recipe, error: recipeErr } = await supabase.from('task_recipes').insert({
      name: newRecipeName.trim(),
      trade: newRecipeTrade.trim() || null,
      keywords: kwArray,
      created_by: user.id,
    }).select('id').single();
    if (recipeErr || !recipe) {
      toast({ title: 'Error creating recipe', description: recipeErr?.message, variant: 'destructive' });
      setCreatingRecipe(false);
      return;
    }
    await supabase.from('tasks').update({ recipe_hint_id: recipe.id }).eq('id', taskId);
    setCreatingRecipe(false);
    setNewlyCreatedRecipeId(recipe.id);
    setNewRecipeStepCount(0);
    toast({ title: 'Recipe created — add steps below' });
    setSuggestedRecipe({ id: recipe.id, name: newRecipeName.trim() });
    fetchTask();
  };

  const handleFinishRecipeCreation = () => {
    setCreateRecipeOpen(false);
    setNewlyCreatedRecipeId(null);
    setNewRecipeName('');
    setNewRecipeTrade('');
    setNewRecipeKeywords('');
    setNewRecipeStepCount(0);
    fetchLinkedRecipeStepCount();
  };

  const handleRecipeSearch = async (query: string) => {
    setRecipeSearchQuery(query);
    if (!query.trim()) { setRecipeSearchResults([]); return; }
    setRecipeSearchLoading(true);
    const { data } = await supabase.from('task_recipes')
      .select('id, name, trade, keywords')
      .eq('active', true)
      .ilike('name', `%${query.trim()}%`)
      .limit(10);
    setRecipeSearchResults(data || []);
    setRecipeSearchLoading(false);
  };

  const handleLinkRecipe = async (recipeId: string, recipeName: string) => {
    if (!taskId) return;
    await supabase.from('tasks').update({ recipe_hint_id: recipeId }).eq('id', taskId);
    setSuggestedRecipe({ id: recipeId, name: recipeName });
    setRecipeSearchOpen(false);
    setRecipeSearchQuery('');
    setRecipeSearchResults([]);
    toast({ title: 'Recipe linked' });
    fetchTask();
    fetchLinkedRecipeStepCount();
  };



  const canDelete = isAdmin || projectRole === 'manager';
  const canManageCrew = isAdmin || projectRole === 'manager';
  const canEditTaskMetadata = isAdmin || projectRole === 'manager';
  const hasChildren = children.length > 0;
  const allChildrenDone = hasChildren && children.every(c => c.stage === 'Done');
  const isCrewMode = task?.assignment_mode === 'crew';

  // Crew toggle handlers
  const handleToggleCrew = async (checked: boolean) => {
    if (!taskId || !task) return;
    setCrewToggleLoading(true);

    if (checked) {
      // Solo -> Crew
      const priorAssignee = task.assigned_to_user_id;
      await supabase.from('tasks').update({
        assignment_mode: 'crew',
        lead_user_id: priorAssignee || null,
        assigned_to_user_id: null,
      }).eq('id', taskId);

      if (priorAssignee) {
        // Add as candidate
        await supabase.from('task_candidates').upsert({
          task_id: taskId,
          user_id: priorAssignee,
        }, { onConflict: 'task_id,user_id' });
        // Add as active worker
        await supabase.from('task_workers').upsert({
          task_id: taskId,
          user_id: priorAssignee,
          active: true,
          joined_at: new Date().toISOString(),
          left_at: null,
        }, { onConflict: 'task_id,user_id' });
      }
    } else {
      // Crew -> Solo
      const activeWorkers = crewWorkers.filter(w => w.active);
      let newAssignee: string | null = null;
      if (activeWorkers.length === 1) {
        newAssignee = activeWorkers[0].user_id;
      } else if (task.lead_user_id) {
        newAssignee = task.lead_user_id;
      }

      await supabase.from('tasks').update({
        assignment_mode: 'solo',
        assigned_to_user_id: newAssignee,
      }).eq('id', taskId);

      // Clean up crew tables
      await Promise.all([
        supabase.from('task_candidates').delete().eq('task_id', taskId),
        supabase.from('task_workers').delete().eq('task_id', taskId),
      ]);
    }

    setCrewToggleLoading(false);
    fetchTask();
    if (checked) fetchCrewData();
  };

  // Crew join/leave for current user
  const handleJoinCrew = async () => {
    if (!user || !taskId) return;
    setActionLoading(true);
    await supabase.from('task_workers').upsert({
      task_id: taskId,
      user_id: user.id,
      active: true,
      joined_at: new Date().toISOString(),
      left_at: null,
    }, { onConflict: 'task_id,user_id' });

    if (task.stage === 'Ready') {
      await supabase.from('tasks').update({ stage: 'In Progress' }).eq('id', taskId);
    }
    setActionLoading(false);
    fetchTask();
    fetchCrewData();
  };

  const handleLeaveCrew = async () => {
    if (!user || !taskId) return;
    setActionLoading(true);
    await supabase.from('task_workers').update({
      active: false,
      left_at: new Date().toISOString(),
    }).eq('task_id', taskId).eq('user_id', user.id);
    setActionLoading(false);
    fetchTask();
    fetchCrewData();
  };

  // Candidate management
  const handleAddCandidate = async (userId: string) => {
    if (!taskId) return;
    await supabase.from('task_candidates').upsert({
      task_id: taskId,
      user_id: userId,
    }, { onConflict: 'task_id,user_id' });
    fetchCrewData();
  };

  const handleAddCandidatesBatch = async () => {
    if (!taskId || selectedCandidates.length === 0) return;
    setAddingCandidates(true);
    const inserts = selectedCandidates.map(userId => ({ task_id: taskId, user_id: userId }));
    const { error } = await supabase.from('task_candidates').upsert(inserts, { onConflict: 'task_id,user_id' });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `${selectedCandidates.length} worker(s) added` });
    }
    setAddCandidatesOpen(false);
    setSelectedCandidates([]);
    setCandidateSearch('');
    setAddingCandidates(false);
    fetchCrewData();
  };

  const handleRemoveCandidate = async (userId: string) => {
    if (!taskId) return;
    await Promise.all([
      supabase.from('task_candidates').delete().eq('task_id', taskId).eq('user_id', userId),
      supabase.from('task_workers').delete().eq('task_id', taskId).eq('user_id', userId),
    ]);
    fetchCrewData();
  };

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
  const meIsCandidate = user ? crewCandidates.includes(user.id) : false;
  const meIsActiveWorker = user ? crewWorkers.some(w => w.user_id === user.id && w.active) : false;
  const hasTaskRelevance = isAssignedToMe || meIsActiveWorker || isAdmin || projectRole === 'manager';
  const isActionableTask = isTaskActionable(task);
  const operationalStatus = getTaskOperationalStatus(task);
  const canExecuteTask = operationalStatus !== 'review_needed' && operationalStatus !== 'done';
  const showBlockerButton = isActionableTask && !task?.is_blocked && (task?.stage === 'Ready' || task?.stage === 'In Progress') && canReportBlocker(isAdmin, projectRole) && hasTaskRelevance;

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
    try {
      await claimTask(taskId, user.id);
      fetchTask();
    } catch (error: unknown) {
      toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleStart = async () => {
    if (!user || !taskId) return;
    setActionLoading(true);
    try {
      await startTask(taskId, user.id);
      fetchTask();
      // Nudge for before photos
      const hasBeforePhoto = photos.some((p: any) => p.phase === 'before');
      if (!hasBeforePhoto) {
        toast({ title: '📷 Add a before photo', description: 'Document starting conditions for this task.' });
      }
    } catch (error: unknown) {
      toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!taskId) return;
    setActionLoading(true);
    try {
      await completeTask({
        taskId,
        parentTaskId: task?.parent_task_id,
        isRecurring: task?.is_recurring,
      });
      fetchTask();
      // Nudge for after photos
      const hasAfterPhoto = photos.some((p: any) => p.phase === 'after');
      if (!hasAfterPhoto) {
        toast({ title: '📷 Add an after photo', description: 'Document the completed work for this task.' });
      }
    } catch (error: unknown) {
      toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const canComplete = hasChildren ? allChildrenDone : true;

  if (!task) return <div className="p-4 text-center text-muted-foreground">Loading...</div>;

  // Members not yet candidates (for adding)
  const nonCandidateMembers = projectMembers.filter(m => !crewCandidates.includes(m.user_id));

  return (
    <div className="pb-20">
      <PageHeader title="Task Detail" backTo={`/projects/${projectId}`} />
      <div className="p-4 space-y-4">
        {/* Lifecycle action buttons */}
        <TaskLifecycleActions
          isActionableTask={isActionableTask}
          canExecuteTask={canExecuteTask}
          isCrewMode={isCrewMode}
          isUnassigned={isUnassigned}
          isAssignedToMe={!!isAssignedToMe}
          materialsReady={materialsReady}
          canComplete={canComplete}
          meIsCandidate={meIsCandidate}
          meIsActiveWorker={meIsActiveWorker}
          showBlockerButton={showBlockerButton}
          actionLoading={actionLoading}
          stage={task.stage}
          onDibs={() => handleDibs()}
          onStart={handleStart}
          onComplete={handleComplete}
          onJoinCrew={handleJoinCrew}
          onLeaveCrew={handleLeaveCrew}
          onOpenBlocker={() => setBlockerSheetOpen(true)}
          onOpenMaterials={() => setMaterialsOpen(true)}
        />

        {/* Active blocker display card */}
        {task.is_blocked && activeBlocker && (
          <Card className="p-3 space-y-2 border-destructive/50 bg-destructive/5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <StatusBadge status="Blocked" />
              <span className="text-sm font-medium">
                {BLOCKER_REASONS.find(r => r.value === activeBlocker.reason)?.label || activeBlocker.reason}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Reported by {blockerReporterName} · {new Date(activeBlocker.blocked_at).toLocaleDateString()}
            </p>
            {activeBlocker.note && (
              <p className="text-sm">{activeBlocker.note}</p>
            )}
            {activeBlocker.needs_from_manager && (
              <div className="text-sm border-l-2 border-destructive/30 pl-2">
                <span className="text-xs font-medium text-muted-foreground">Needs from manager:</span>
                <p>{activeBlocker.needs_from_manager}</p>
              </div>
            )}
            {canResolveBlocker(isAdmin, projectRole) && (
              <Button size="sm" variant="outline" onClick={() => setResolveDialogOpen(true)}>
                <CheckCircle2 className="h-4 w-4 mr-1" />Resolve
              </Button>
            )}
          </Card>
        )}

        {/* Task Photos */}
        <TaskPhotos
          taskId={taskId!}
          photos={photos}
          userId={user!.id}
          onPhotosChange={fetchPhotos}
          canUpload={isAdmin || projectRole === 'manager' || projectRole === 'contractor'}
        />

        {/* Task Comments */}
        <TaskComments
          taskId={taskId!}
          userId={user!.id}
          isAdmin={isAdmin}
          canComment={isAdmin || projectRole === 'manager' || projectRole === 'contractor'}
        />

        {/* Recipe: read-only badge if already expanded AND has children */}
        {task.expanded_recipe_id && suggestedRecipe && hasChildren && (
          <Card className="p-3 flex items-center gap-2 border-muted">
            <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground truncate">Recipe: {suggestedRecipe.name}</p>
          </Card>
        )}
        {/* Recipe linked but not yet expanded — show edit + expand */}
        {((!task.expanded_recipe_id || !hasChildren) && suggestedRecipe && children.length === 0) && (
          <Card className="p-3 space-y-3 border-primary/30 bg-primary/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen className="h-4 w-4 text-primary shrink-0" />
                <p className="text-sm font-medium truncate">Recipe: {suggestedRecipe.name}</p>
                <Badge variant="secondary" className="text-xs">{linkedRecipeStepCount} steps</Badge>
                <Badge variant="outline" className="text-xs">
                  {linkedRecipeStepCount <= 1 ? 'Single-step template' : 'Multi-step workflow'}
                </Badge>
              </div>
              <div className="flex gap-2 shrink-0">
                {(isAdmin || projectRole === 'manager') && (
                  <Button size="sm" variant="ghost" onClick={() => setRecipeEditorOpen(prev => !prev)}>
                    {recipeEditorOpen ? <ChevronUp className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                  </Button>
                )}
                <Button size="sm" onClick={() => handleExpandRecipe(suggestedRecipe.id)} disabled={expandingRecipe || linkedRecipeStepCount === 0}>
                  {expandingRecipe ? 'Expanding…' : 'Expand'}
                </Button>
              </div>
            </div>
            {recipeEditorOpen && (
              <div className="border-t pt-3">
                <RecipeStepsEditor recipeId={suggestedRecipe.id} onStepsChanged={fetchLinkedRecipeStepCount} />
              </div>
            )}
          </Card>
        )}
        {/* No recipe match — offer Create Recipe (admin/manager only) */}
        {!task.expanded_recipe_id && !suggestedRecipe && children.length === 0 && recipeSearchDone && (isAdmin || projectRole === 'manager') && (
          <Card className="p-3 space-y-3 border-dashed border-muted-foreground/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-sm text-muted-foreground">No recipe match</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setRecipeSearchOpen(prev => !prev); setRecipeSearchQuery(''); setRecipeSearchResults([]); }}>
                  <Search className="h-4 w-4 mr-1" />Find
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setNewRecipeName(task.task || ''); setNewRecipeTrade(task.trade || ''); setCreateRecipeOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1" />Create
                </Button>
              </div>
            </div>
            {recipeSearchOpen && (
              <div className="space-y-2 border-t pt-3">
                <Input
                  placeholder="Search recipes by name…"
                  value={recipeSearchQuery}
                  onChange={(e) => handleRecipeSearch(e.target.value)}
                  autoFocus
                />
                {recipeSearchLoading && <p className="text-xs text-muted-foreground">Searching…</p>}
                {recipeSearchResults.length > 0 && (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {recipeSearchResults.map(r => (
                      <div key={r.id} className="flex items-center justify-between text-sm border rounded px-3 py-2 hover:bg-muted/50 cursor-pointer" onClick={() => handleLinkRecipe(r.id, r.name)}>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{r.name}</p>
                          {r.trade && <p className="text-xs text-muted-foreground">{r.trade}</p>}
                        </div>
                        <Button size="sm" variant="ghost" className="shrink-0"><Plus className="h-3.5 w-3.5" /></Button>
                      </div>
                    ))}
                  </div>
                )}
                {recipeSearchQuery.trim() && !recipeSearchLoading && recipeSearchResults.length === 0 && (
                  <p className="text-xs text-muted-foreground">No recipes found</p>
                )}
              </div>
            )}
          </Card>
        )}

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
            <Input type="date" value={dueDate} onChange={(e) => {
              setDueDate(e.target.value);
              if (!e.target.value) setIsRecurring(false);
            }} />
          </div>
        </div>
        {/* Recurrence section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Repeat className="h-4 w-4" />
              Recurring
            </Label>
            <Switch
              checked={isRecurring}
              onCheckedChange={(checked) => {
                if (checked && !dueDate) {
                  toast({ title: 'Due date required', description: 'Set a due date first to enable recurrence.', variant: 'destructive' });
                  return;
                }
                setIsRecurring(checked);
              }}
            />
          </div>
          {isRecurring && (
            <Select value={recurrenceFrequency} onValueChange={(v) => setRecurrenceFrequency(v as RecurrenceFrequency)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RECURRENCE_FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {task.recurrence_source_task_id && (
            <p className="text-xs text-muted-foreground">
              Created from a previous recurring task
            </p>
          )}
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

        {/* Crew toggle (manager/admin only) */}
        {canManageCrew && (
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Crew Task
            </Label>
            <Switch
              checked={isCrewMode}
              onCheckedChange={handleToggleCrew}
              disabled={crewToggleLoading}
            />
          </div>
        )}

        {/* Crew panel */}
        {isCrewMode && (
          <Card className="p-3 space-y-3">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Active Crew</Label>
              {crewWorkers.filter(w => w.active).length === 0 ? (
                <p className="text-sm text-muted-foreground">No active workers</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {crewWorkers.filter(w => w.active).map(w => (
                    <Badge key={w.user_id} variant="secondary">{w.full_name}</Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Candidate pool (manager/admin) */}
            {canManageCrew && (
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Eligible Workers</Label>
                <div className="space-y-1">
                  {crewCandidates.map(uid => {
                    const member = projectMembers.find(m => m.user_id === uid);
                    const name = member?.profiles?.full_name || 'Unknown';
                    return (
                      <div key={uid} className="flex items-center justify-between text-sm border rounded px-2 py-1">
                        <span>{name}</span>
                        <button onClick={() => handleRemoveCandidate(uid)} className="text-muted-foreground hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {nonCandidateMembers.length > 0 && (
                  <Dialog open={addCandidatesOpen} onOpenChange={(o) => { setAddCandidatesOpen(o); if (!o) { setSelectedCandidates([]); setCandidateSearch(''); } }}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="w-full"><Plus className="h-4 w-4 mr-1" />Add Workers</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Add Eligible Workers</DialogTitle></DialogHeader>
                      <div className="space-y-4">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search members..."
                            value={candidateSearch}
                            onChange={e => setCandidateSearch(e.target.value)}
                            className="pl-9"
                          />
                        </div>
                        <div className="max-h-52 overflow-auto border rounded-md">
                          {nonCandidateMembers
                            .filter(m => {
                              if (!candidateSearch.trim()) return true;
                              const q = candidateSearch.toLowerCase();
                              return (m.profiles?.full_name || '').toLowerCase().includes(q);
                            })
                            .map(m => (
                              <label
                                key={m.user_id}
                                className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent cursor-pointer transition-colors border-b last:border-b-0"
                              >
                                <Checkbox
                                  checked={selectedCandidates.includes(m.user_id)}
                                  onCheckedChange={() =>
                                    setSelectedCandidates(prev =>
                                      prev.includes(m.user_id) ? prev.filter(id => id !== m.user_id) : [...prev, m.user_id]
                                    )
                                  }
                                />
                                <span className="text-sm truncate">{m.profiles?.full_name || 'Unnamed'} ({m.role})</span>
                              </label>
                            ))}
                          {nonCandidateMembers.filter(m => {
                            if (!candidateSearch.trim()) return true;
                            return (m.profiles?.full_name || '').toLowerCase().includes(candidateSearch.toLowerCase());
                          }).length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-4">No members available.</p>
                          )}
                        </div>
                        {selectedCandidates.length > 0 && (
                          <p className="text-xs text-muted-foreground">{selectedCandidates.length} selected</p>
                        )}
                        <Button onClick={handleAddCandidatesBatch} className="w-full" disabled={selectedCandidates.length === 0 || addingCandidates}>
                          {addingCandidates ? 'Adding...' : `Add ${selectedCandidates.length || ''} Worker${selectedCandidates.length !== 1 ? 's' : ''}`}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Solo assignment (only in solo mode) */}
        {!isCrewMode && (
          <div className="space-y-2">
            <Label>Assigned To</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                <SelectItem value="outside_vendor">Outside Vendor</SelectItem>
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
        )}

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

        {(canDelete || hasChildren) && (
          <div className="space-y-1">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <Label>Subtasks ({children.length})</Label>
              <div className="flex gap-1">
                {canDelete && task.expanded_recipe_id && hasChildren && (
                  <Button size="sm" variant="outline" onClick={() => setRecipeSyncOpen(true)}>
                    <BookOpen className="h-3.5 w-3.5 mr-1" />Sync to Recipe
                  </Button>
                )}
                {canDelete && (
                  <Button size="sm" variant="ghost" onClick={() => { setSaveRecipeName(task.task || ''); setSaveRecipeTrade(task.trade || ''); setSaveRecipeOpen(true); }}>
                    <Save className="h-3.5 w-3.5 mr-1" />{hasChildren ? 'Save as Workflow Recipe' : 'Save as Single-Step Recipe'}
                  </Button>
                )}
              </div>
            </div>
            {!hasChildren && (
              <p className="text-xs text-muted-foreground">No subtasks yet. Saving now creates a 1-step reusable task template from this task + materials.</p>
            )}
            {children.map(c => {
              const assigneeName = c.assigned_to_user_id
                ? projectMembers.find(m => m.user_id === c.assigned_to_user_id)?.profiles?.full_name || undefined
                : undefined;
              return (
                <TaskCard
                  key={c.id}
                  task={c}
                  projectName=""
                  userId={user?.id ?? ''}
                  isAdmin={isAdmin}
                  onUpdate={() => { fetchChildren(); fetchTask(); }}
                  showProjectName={false}
                  isChild
                  parentTitle={task.task}
                  assigneeName={assigneeName}
                  canReportIssue={projectRole === 'contractor'}
                  canDelete={canDelete}
                  allProfiles={projectMembers.map(m => ({ id: m.user_id, full_name: m.profiles?.full_name || null }))}
                />
              );
            })}
            {canEditTaskMetadata && (
              <div className="flex gap-2 pt-1">
                <Input
                  placeholder="Add subtask…"
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && newSubtaskTitle.trim()) handleAddSubtask(); }}
                  className="flex-1"
                />
                <Button size="sm" onClick={handleAddSubtask} disabled={!newSubtaskTitle.trim() || addingSubtask}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        <Button onClick={() => handleSave()} disabled={saving || !canEditTaskMetadata} className="w-full">
          {saving ? 'Saving...' : canEditTaskMetadata ? 'Save Changes' : 'Managers edit task details'}
        </Button>
        {canDelete && (
          <Button variant="destructive" className="w-full" onClick={() => setDeleteConfirmOpen(true)}>
            <Trash2 className="h-4 w-4 mr-1" />Delete Task
          </Button>
        )}
      </div>

      <TaskMaterialsSheet
        taskId={taskId!}
        projectId={projectId!}
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

      <Dialog open={saveRecipeOpen} onOpenChange={setSaveRecipeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Save as Recipe</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Recipe Name</Label>
              <Input value={saveRecipeName} onChange={(e) => setSaveRecipeName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Trade</Label>
              <Input value={saveRecipeTrade} onChange={(e) => setSaveRecipeTrade(e.target.value)} />
            </div>
            <p className="text-sm text-muted-foreground">
              {children.length > 0
                ? `${children.length} steps will be saved as a reusable workflow.`
                : '1 step will be saved as a reusable standalone task template.'}
            </p>
            <Button className="w-full" onClick={handleSaveAsRecipe} disabled={savingRecipe || !saveRecipeName.trim()}>
              {savingRecipe ? 'Saving…' : 'Save Recipe'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createRecipeOpen} onOpenChange={(open) => { if (!open) handleFinishRecipeCreation(); else setCreateRecipeOpen(true); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{newlyCreatedRecipeId ? 'Add Recipe Steps' : 'Create Recipe'}</DialogTitle></DialogHeader>
          {!newlyCreatedRecipeId ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Recipe Name</Label>
                <Input value={newRecipeName} onChange={(e) => setNewRecipeName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Trade</Label>
                <Input value={newRecipeTrade} onChange={(e) => setNewRecipeTrade(e.target.value)} placeholder="e.g. Plumbing, Electrical" />
              </div>
              <div className="space-y-2">
                <Label>Keywords (comma-separated)</Label>
                <Input value={newRecipeKeywords} onChange={(e) => setNewRecipeKeywords(e.target.value)} placeholder="e.g. caulk, seal, bathroom" />
              </div>
              <Button className="w-full" onClick={handleCreateRecipeAndExpand} disabled={creatingRecipe || !newRecipeName.trim()}>
                {creatingRecipe ? 'Creating…' : 'Create & Add Steps'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <RecipeStepsEditor recipeId={newlyCreatedRecipeId} onStepsChanged={() => {
                setNewRecipeStepCount(prev => prev + 1);
                fetchLinkedRecipeStepCount();
              }} />
              <Button className="w-full" onClick={handleFinishRecipeCreation} variant={newRecipeStepCount > 0 ? 'default' : 'outline'}>
                {newRecipeStepCount > 0 ? 'Done — Ready to Expand' : 'Close'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Report Issue Sheet */}
      <Sheet open={blockerSheetOpen} onOpenChange={setBlockerSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Report Issue
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Report missing materials or a jobsite issue</Label>
              <RadioGroup value={blockerReason} onValueChange={(v) => setBlockerReason(v as BlockerReason)}>
                {BLOCKER_REASONS.map(r => (
                  <div key={r.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={r.value} id={`reason-${r.value}`} />
                    <Label htmlFor={`reason-${r.value}`} className="font-normal cursor-pointer">{r.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label>Comment (optional)</Label>
              <Textarea value={blockerNote} onChange={(e) => setBlockerNote(e.target.value)} rows={2} placeholder="Describe what you found…" />
            </div>
            <div className="space-y-2">
              <Label>What do you need from the manager?</Label>
              <Textarea value={blockerNeedsFromManager} onChange={(e) => setBlockerNeedsFromManager(e.target.value)} rows={2} placeholder="e.g. Order 2x4s, get key from owner…" />
            </div>
            <Button className="w-full" variant="destructive" onClick={handleReportBlocker} disabled={reportingBlocker}>
              {reportingBlocker ? 'Reporting…' : 'Report Issue'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Resolve Blocker Dialog */}
      <AlertDialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resolve Blocker</AlertDialogTitle>
            <AlertDialogDescription>
              Mark this blocker as resolved. Optionally add a note.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Textarea value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} rows={2} placeholder="Resolution note (optional)…" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResolveBlocker} disabled={resolvingBlocker}>
              {resolvingBlocker ? 'Resolving…' : 'Resolve'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Photo nudge dialog */}
      <AlertDialog open={photoConfirmOpen} onOpenChange={setPhotoConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No "After" Photo</AlertDialogTitle>
            <AlertDialogDescription>
              This task doesn't have an "after" photo yet. It's best to add one when you can, but you can complete it now if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setPhotoConfirmOpen(false); handleSave(true); }}>
              Complete Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Recipe sync prompt */}
      <AlertDialog open={recipeSyncOpen} onOpenChange={setRecipeSyncOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update Recipe in Library?</AlertDialogTitle>
            <AlertDialogDescription>
              This task was expanded from a recipe. Would you like to sync these changes back to the recipe library so future projects use the updated steps and materials?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, keep local only</AlertDialogCancel>
            <AlertDialogAction
              disabled={syncingRecipe}
              onClick={async () => {
                if (!taskId || !task?.expanded_recipe_id) return;
                setSyncingRecipe(true);
                const { data, error: syncErr } = await supabase.rpc('capture_recipe_from_task', {
                  p_parent_task_id: taskId,
                  p_recipe_id: task.expanded_recipe_id,
                });
                setSyncingRecipe(false);
                if (syncErr) {
                  toast({ title: 'Sync failed', description: syncErr.message, variant: 'destructive' });
                } else {
                  const result = data as any;
                  toast({ title: 'Recipe updated', description: `${result?.steps_written ?? 0} steps, ${result?.materials_written ?? 0} materials synced.` });
                }
                setRecipeSyncOpen(false);
              }}
            >
              {syncingRecipe ? 'Syncing…' : 'Yes, update recipe'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TaskDetail;
