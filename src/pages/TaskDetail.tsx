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
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { TASK_STAGES, TASK_PRIORITIES, type TaskStage, type TaskPriority } from '@/lib/supabase-types';
import { Package, Trash2, Zap, CheckCircle2, Users, X, Plus, BookOpen, Save, Search, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import TaskMaterialsSheet from '@/components/TaskMaterialsSheet';
import { Card } from '@/components/ui/card';
import { suggestRecipes, type RecipeForMatch } from '@/lib/recipeMatch';
import RecipeStepsEditor from '@/components/recipe/RecipeStepsEditor';

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

  // Recipe state
  const [suggestedRecipe, setSuggestedRecipe] = useState<{ id: string; name: string } | null>(null);
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
  const [recipeSearchDone, setRecipeSearchDone] = useState(false);
  const [recipeEditorOpen, setRecipeEditorOpen] = useState(false);
  const [linkedRecipeStepCount, setLinkedRecipeStepCount] = useState(0);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);

  // Crew state
  const [crewWorkers, setCrewWorkers] = useState<{ user_id: string; active: boolean; full_name: string }[]>([]);
  const [crewCandidates, setCrewCandidates] = useState<string[]>([]);
  const [crewToggleLoading, setCrewToggleLoading] = useState(false);
  const [addCandidatesOpen, setAddCandidatesOpen] = useState(false);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [addingCandidates, setAddingCandidates] = useState(false);

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

  // Recipe suggestion effect
  useEffect(() => {
    if (!task) { setSuggestedRecipe(null); setRecipeSearchDone(false); return; }
    if (task.expanded_recipe_id) {
      supabase.from('task_recipes').select('id, name').eq('id', task.expanded_recipe_id).single().then(({ data }) => {
        setSuggestedRecipe(data ? { id: data.id, name: data.name } : null);
        setRecipeSearchDone(true);
      });
      return;
    }
    if (children.length > 0) { setSuggestedRecipe(null); setRecipeSearchDone(true); return; }
    const fetchRecipeSuggestion = async () => {
      if (task.recipe_hint_id) {
        const { data } = await supabase.from('task_recipes').select('id, name').eq('id', task.recipe_hint_id).eq('active', true).single();
        if (data) { setSuggestedRecipe(data); setRecipeSearchDone(true); return; }
      }
      const { data: recipes } = await supabase.from('task_recipes').select('id, name, keywords').eq('active', true);
      if (!recipes || recipes.length === 0) { setSuggestedRecipe(null); setRecipeSearchDone(true); return; }
      const suggestions = suggestRecipes(task.task, recipes as RecipeForMatch[]);
      setSuggestedRecipe(suggestions.length > 0 ? { id: suggestions[0].recipe.id, name: suggestions[0].recipe.name } : null);
      setRecipeSearchDone(true);
    };
    fetchRecipeSuggestion();
  }, [task?.id, task?.task, task?.recipe_hint_id, task?.expanded_recipe_id, children.length]);

  // Fetch step count for linked recipe
  const fetchLinkedRecipeStepCount = async () => {
    if (!suggestedRecipe) { setLinkedRecipeStepCount(0); return; }
    const { count } = await supabase
      .from('task_recipe_steps')
      .select('id', { count: 'exact', head: true })
      .eq('recipe_id', suggestedRecipe.id);
    setLinkedRecipeStepCount(count ?? 0);
  };

  useEffect(() => {
    fetchLinkedRecipeStepCount();
  }, [suggestedRecipe?.id]);

  useEffect(() => {
    if (task?.assignment_mode === 'crew') {
      fetchCrewData();
    }
  }, [task?.assignment_mode, task?.id]);

  // Fetch field capture when task loads
  useEffect(() => {
    if (!task?.field_capture_id) { setFieldCapture(null); return; }
    supabase.from('field_captures').select('*').eq('id', task.field_capture_id).single().then(({ data }) => {
      setFieldCapture(data);
    });
  }, [task?.field_capture_id]);

  const fetchCrewData = async () => {
    if (!taskId) return;
    const [workersRes, candidatesRes] = await Promise.all([
      supabase.from('task_workers').select('user_id, active').eq('task_id', taskId),
      supabase.from('task_candidates').select('user_id').eq('task_id', taskId),
    ]);

    const workerUserIds = (workersRes.data || []).map(w => w.user_id);
    const candidateUserIds = (candidatesRes.data || []).map(c => c.user_id);
    setCrewCandidates(candidateUserIds);

    // Fetch profile names for workers
    if (workerUserIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', workerUserIds);
      const profileMap: Record<string, string> = {};
      (profiles || []).forEach(p => { profileMap[p.id] = p.full_name || 'Unknown'; });

      setCrewWorkers((workersRes.data || []).map(w => ({
        user_id: w.user_id,
        active: w.active,
        full_name: profileMap[w.user_id] || 'Unknown',
      })));
    } else {
      setCrewWorkers([]);
    }
  };

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
    const isCrewMode = task.assignment_mode === 'crew';
    const newAssignedTo = isCrewMode ? null : (assignedTo === 'unassigned' ? null : assignedTo);

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

    // Assignment cascade (solo only)
    if (!error && !isCrewMode && cascadeAssign && children.length > 0) {
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
    const { data } = await supabase.from('tasks')
      .select('id, task, stage, assigned_to_user_id')
      .eq('parent_task_id', taskId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });
    setChildren(data || []);
  };

  const handleExpandRecipe = async (recipeId: string) => {
    if (!taskId || !task || !user) return;
    setExpandingRecipe(true);
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

    if (!user || !saveRecipeName.trim() || children.length === 0) return;
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
    const stepInserts = children.map((c, idx) => ({
      recipe_id: recipe.id,
      title: c.task,
      sort_order: (idx + 1) * 10,
      trade: null as string | null,
      created_by: user.id,
    }));
    await supabase.from('task_recipe_steps').insert(stepInserts);
    setSavingRecipe(false);
    setSaveRecipeOpen(false);
    setSaveRecipeName('');
    setSaveRecipeTrade('');
    toast({ title: 'Recipe saved from tasks' });
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
    // Set recipe_hint_id on the task
    await supabase.from('tasks').update({ recipe_hint_id: recipe.id }).eq('id', taskId);
    setCreatingRecipe(false);
    setCreateRecipeOpen(false);
    setNewRecipeName('');
    setNewRecipeTrade('');
    setNewRecipeKeywords('');
    toast({ title: 'Recipe created! Add steps in Admin > Recipes, then return here to Expand.' });
    setSuggestedRecipe({ id: recipe.id, name: newRecipeName.trim() });
    fetchTask();
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
  const canManageCrew = isAdmin || projectRole === 'manager';
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

  // Members not yet candidates (for adding)
  const nonCandidateMembers = projectMembers.filter(m => !crewCandidates.includes(m.user_id));

  return (
    <div className="pb-20">
      <PageHeader title="Task Detail" backTo={`/projects/${projectId}`} />
      <div className="p-4 space-y-4">
        {/* Lifecycle action buttons */}
        <div className="flex gap-2 flex-wrap">
          {!isCrewMode && isUnassigned && task.stage === 'Ready' && (
            <Button variant="outline" onClick={() => handleDibs()} disabled={actionLoading}>Dibs</Button>
          )}
          {!isCrewMode && isAssignedToMe && task.stage === 'Ready' && (
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
          {!isCrewMode && isAssignedToMe && task.stage === 'In Progress' && (
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
          {/* Crew actions */}
          {isCrewMode && meIsCandidate && !meIsActiveWorker && (
            <Button onClick={handleJoinCrew} disabled={actionLoading}>
              <Users className="h-4 w-4 mr-1" />Join
            </Button>
          )}
          {isCrewMode && meIsActiveWorker && (
            <Button variant="outline" onClick={handleLeaveCrew} disabled={actionLoading}>Leave</Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setMaterialsOpen(true)}>
            <Package className="h-4 w-4" />
            Materials
          </Button>
        </div>

        {/* Recipe: read-only badge if already expanded */}
        {task.expanded_recipe_id && suggestedRecipe && (
          <Card className="p-3 flex items-center gap-2 border-muted">
            <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground truncate">Recipe: {suggestedRecipe.name}</p>
          </Card>
        )}
        {/* Recipe linked but not yet expanded — show edit + expand */}
        {!task.expanded_recipe_id && suggestedRecipe && children.length === 0 && (
          <Card className="p-3 space-y-3 border-primary/30 bg-primary/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen className="h-4 w-4 text-primary shrink-0" />
                <p className="text-sm font-medium truncate">Recipe: {suggestedRecipe.name}</p>
                <Badge variant="secondary" className="text-xs">{linkedRecipeStepCount} steps</Badge>
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
          <Card className="p-3 flex items-center justify-between border-dashed border-muted-foreground/30">
            <div className="flex items-center gap-2 min-w-0">
              <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground">No recipe match</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => { setNewRecipeName(task.task || ''); setNewRecipeTrade(task.trade || ''); setCreateRecipeOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" />Create Recipe
            </Button>
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

        {hasChildren && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Subtasks ({children.length})</Label>
              {canDelete && (
                <Button size="sm" variant="ghost" onClick={() => { setSaveRecipeName(task.task || ''); setSaveRecipeTrade(task.trade || ''); setSaveRecipeOpen(true); }}>
                  <Save className="h-3.5 w-3.5 mr-1" />Save as Recipe
                </Button>
              )}
            </div>
            {children.map(c => (
              <div key={c.id} className="text-sm border rounded px-3 py-2 flex justify-between cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/projects/${projectId}/tasks/${c.id}`)}>
                <span className="truncate">{c.task}</span>
                <StatusBadge status={c.stage} />
              </div>
            ))}
            {(isAdmin || projectRole === 'manager' || projectRole === 'contractor') && (
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
            <p className="text-sm text-muted-foreground">{children.length} step(s) will be saved.</p>
            <Button className="w-full" onClick={handleSaveAsRecipe} disabled={savingRecipe || !saveRecipeName.trim()}>
              {savingRecipe ? 'Saving…' : 'Save Recipe'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createRecipeOpen} onOpenChange={setCreateRecipeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Recipe</DialogTitle></DialogHeader>
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
            <p className="text-xs text-muted-foreground">
              This creates an empty recipe linked to this task. Add steps in Admin → Recipes, then return here to Expand.
            </p>
            <Button className="w-full" onClick={handleCreateRecipeAndExpand} disabled={creatingRecipe || !newRecipeName.trim()}>
              {creatingRecipe ? 'Creating…' : 'Create Recipe'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TaskDetail;
