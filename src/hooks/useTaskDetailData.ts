import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { suggestRecipes, type RecipeForMatch } from '@/lib/recipeMatch';

export interface TaskDetailDataState {
  task: any;
  projectRole: string | null;
  children: any[];
  projectMembers: { user_id: string; role: string; profiles: { full_name: string | null } | null }[];
  fieldCapture: any;
  photos: any[];
  activeBlocker: any;
  blockerReporterName: string;
  suggestedRecipe: { id: string; name: string } | null;
  setSuggestedRecipe: (recipe: { id: string; name: string } | null) => void;
  recipeSearchDone: boolean;
  setRecipeSearchDone: (done: boolean) => void;
  linkedRecipeStepCount: number;
  crewWorkers: { user_id: string; active: boolean; full_name: string }[];
  crewCandidates: string[];
  fetchTask: () => Promise<void>;
  fetchChildren: () => Promise<void>;
  fetchMembers: () => Promise<void>;
  fetchPhotos: () => Promise<void>;
  fetchCrewData: () => Promise<void>;
  fetchLinkedRecipeStepCount: () => Promise<void>;
  fetchProjectRole: () => Promise<void>;
}

export function useTaskDetailData(taskId: string | undefined, userId?: string): TaskDetailDataState {
  const [task, setTask] = useState<any>(null);
  const [projectRole, setProjectRole] = useState<string | null>(null);
  const [children, setChildren] = useState<any[]>([]);
  const [projectMembers, setProjectMembers] = useState<{ user_id: string; role: string; profiles: { full_name: string | null } | null }[]>([]);
  const [fieldCapture, setFieldCapture] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [activeBlocker, setActiveBlocker] = useState<any>(null);
  const [blockerReporterName, setBlockerReporterName] = useState('');
  const [suggestedRecipe, setSuggestedRecipe] = useState<{ id: string; name: string } | null>(null);
  const [recipeSearchDone, setRecipeSearchDone] = useState(false);
  const [linkedRecipeStepCount, setLinkedRecipeStepCount] = useState(0);
  const [crewWorkers, setCrewWorkers] = useState<{ user_id: string; active: boolean; full_name: string }[]>([]);
  const [crewCandidates, setCrewCandidates] = useState<string[]>([]);

  const fetchTask = async () => {
    if (!taskId) return;
    const { data } = await supabase.from('tasks').select('*').eq('id', taskId).single();
    setTask(data);
  };

  const fetchProjectRole = async () => {
    if (!taskId || !userId) return;
    const { data: t } = await supabase.from('tasks').select('project_id').eq('id', taskId).single();
    if (!t?.project_id) return;
    const { data: pm } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', t.project_id)
      .eq('user_id', userId)
      .maybeSingle();
    setProjectRole(pm?.role || null);
  };

  const fetchChildren = async () => {
    if (!taskId) return;
    const { data } = await supabase.from('tasks').select('*').eq('parent_task_id', taskId).order('sort_order', { ascending: true, nullsFirst: false });
    setChildren(data || []);
  };

  const fetchMembers = async () => {
    if (!taskId) return;
    const { data: t } = await supabase.from('tasks').select('project_id').eq('id', taskId).single();
    if (!t?.project_id) return;
    const { data } = await supabase
      .from('project_members')
      .select('user_id, role, profiles(full_name)')
      .eq('project_id', t.project_id);
    setProjectMembers((data as any) || []);
  };

  const fetchPhotos = async () => {
    if (!taskId) return;
    const { data } = await supabase.from('task_photos').select('*').eq('task_id', taskId).order('created_at', { ascending: false });
    setPhotos(data || []);
  };

  const fetchCrewData = async () => {
    if (!taskId) return;
    const [workersRes, candidatesRes] = await Promise.all([
      supabase.from('task_workers').select('user_id, active').eq('task_id', taskId),
      supabase.from('task_candidates').select('user_id').eq('task_id', taskId),
    ]);

    const workerUserIds = (workersRes.data || []).map((w) => w.user_id);
    const candidateUserIds = (candidatesRes.data || []).map((c) => c.user_id);
    setCrewCandidates(candidateUserIds);

    if (workerUserIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', workerUserIds);
      const profileMap: Record<string, string> = {};
      (profiles || []).forEach((p) => {
        profileMap[p.id] = p.full_name || 'Unknown';
      });

      setCrewWorkers((workersRes.data || []).map((w) => ({
        user_id: w.user_id,
        active: w.active,
        full_name: profileMap[w.user_id] || 'Unknown',
      })));
    } else {
      setCrewWorkers([]);
    }
  };

  const fetchLinkedRecipeStepCount = async () => {
    if (!suggestedRecipe) { setLinkedRecipeStepCount(0); return; }
    const { count } = await supabase
      .from('task_recipe_steps')
      .select('id', { count: 'exact', head: true })
      .eq('recipe_id', suggestedRecipe.id);
    setLinkedRecipeStepCount(count ?? 0);
  };

  useEffect(() => {
    if (!taskId) return;
    fetchTask();
    fetchProjectRole();
    fetchChildren();
    fetchMembers();
    fetchPhotos();
  }, [taskId, userId]);

  useEffect(() => {
    if (!taskId || !task?.is_blocked) { setActiveBlocker(null); setBlockerReporterName(''); return; }
    const fetchBlocker = async () => {
      const { data } = await supabase
        .from('task_blockers')
        .select('*')
        .eq('task_id', taskId)
        .is('resolved_at', null)
        .order('blocked_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setActiveBlocker(data);
      if (data?.blocked_by_user_id) {
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', data.blocked_by_user_id).single();
        setBlockerReporterName(profile?.full_name || 'Unknown');
      }
    };
    fetchBlocker();
  }, [taskId, task?.is_blocked]);

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

  useEffect(() => {
    fetchLinkedRecipeStepCount();
  }, [suggestedRecipe?.id]);

  useEffect(() => {
    if (task?.assignment_mode === 'crew') {
      fetchCrewData();
    }
  }, [task?.assignment_mode, task?.id]);

  useEffect(() => {
    if (!task?.field_capture_id) { setFieldCapture(null); return; }
    supabase.from('field_captures').select('*').eq('id', task.field_capture_id).single().then(({ data }) => {
      setFieldCapture(data);
    });
  }, [task?.field_capture_id]);

  return {
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
    fetchMembers,
    fetchPhotos,
    fetchCrewData,
    fetchLinkedRecipeStepCount,
    fetchProjectRole,
  };
}
