import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getTaskOperationalStatus, isTaskPackage } from '@/lib/taskOperationalStatus';

/* ── Types ── */
export interface TodayData {
  inProgress: any[];
  assigned: any[];
  available: any[];
  needsReview: any[];
  blocked: any[];
  projectMap: Record<string, { name: string; address?: string }>;
  parentTitles: Record<string, string>;
  assigneeMap: Record<string, string>;
  blockerMap: Record<string, { reason: string; needs_from_manager?: string | null }>;
  crewActiveTaskIds: Set<string>;
  crewCandidateTaskIds: Set<string>;
  crewWorkerCounts: Record<string, number>;
  photoCountMap: Record<string, number>;
  materialCountMap: Record<string, number>;
  childTasksByParent: Record<string, any[]>;
  hasShiftToday: boolean;
  isManager: boolean;
  allProfiles: { id: string; full_name: string | null }[];
}

const EMPTY_DATA: TodayData = {
  inProgress: [],
  assigned: [],
  available: [],
  needsReview: [],
  blocked: [],
  projectMap: {},
  parentTitles: {},
  assigneeMap: {},
  blockerMap: {},
  crewActiveTaskIds: new Set(),
  crewCandidateTaskIds: new Set(),
  crewWorkerCounts: {},
  photoCountMap: {},
  materialCountMap: {},
  childTasksByParent: {},
  hasShiftToday: true, // default true to suppress flash
  isManager: false,
  allProfiles: [],
};

const EMPTY_PROJECT_IDS = ['00000000-0000-0000-0000-000000000000'];

/** Throw if a Supabase response has an error */
function unwrap<T>(result: { data: T | null; error: any }, label: string): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data as T;
}

/* ── Core fetch phases ── */

/** Phase 1: memberships + role check */
async function fetchMemberships(userId: string) {
  const memberships = unwrap(
    await supabase.from('project_members').select('project_id, role').eq('user_id', userId),
    'Fetch memberships',
  );
  const projectIds = memberships.map((m: any) => m.project_id);
  const hasManagerRole = memberships.some((m: any) => m.role === 'manager');
  return { projectIds, hasManagerRole };
}

/** Phase 2: parallel core task queries + crew + shift check */
async function fetchCoreTasks(userId: string, memberProjectIds: string[]) {
  const safeProjectIds = memberProjectIds.length > 0 ? memberProjectIds : EMPTY_PROJECT_IDS;

  const [ipRes, assignedRes, availRes, myWorkerRows, myCandidateRows, shiftCheck] = await Promise.all([
    supabase
      .from('tasks').select('*')
      .eq('assigned_to_user_id', userId)
      .eq('stage', 'In Progress')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('tasks').select('*')
      .eq('assigned_to_user_id', userId)
      .eq('stage', 'Ready')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('tasks').select('*')
      .is('assigned_to_user_id', null)
      .eq('stage', 'Ready')
      .eq('materials_on_site', 'Yes')
      .eq('assignment_mode', 'solo')
      .eq('is_outside_vendor', false)
      .in('project_id', safeProjectIds)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(20),
    supabase
      .from('task_workers').select('task_id')
      .eq('user_id', userId).eq('active', true),
    supabase
      .from('task_candidates').select('task_id')
      .eq('user_id', userId),
    supabase
      .from('shifts').select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('shift_date', new Date().toISOString().slice(0, 10)),
  ]);

  return {
    soloIp: unwrap(ipRes, 'In Progress tasks'),
    soloAssigned: unwrap(assignedRes, 'Assigned tasks'),
    soloAvail: unwrap(availRes, 'Available tasks'),
    myActiveTaskIds: new Set((unwrap(myWorkerRows, 'Worker rows') as any[]).map((r: any) => r.task_id)),
    myCandidateIds: new Set((unwrap(myCandidateRows, 'Candidate rows') as any[]).map((r: any) => r.task_id)),
    hasShiftToday: (shiftCheck.count ?? 0) > 0,
  };
}

/** Phase 3: crew task hydration */
async function fetchCrewTasks(myActiveTaskIds: Set<string>, myCandidateIds: Set<string>) {
  let crewIpTasks: any[] = [];
  if (myActiveTaskIds.size > 0) {
    const res = await supabase
      .from('tasks').select('*')
      .in('id', [...myActiveTaskIds])
      .eq('assignment_mode', 'crew')
      .neq('stage', 'Done');
    crewIpTasks = unwrap(res, 'Crew IP tasks');
  }

  const crewAvailableIds = [...myCandidateIds].filter(id => !myActiveTaskIds.has(id));
  let crewAvailTasks: any[] = [];
  if (crewAvailableIds.length > 0) {
    const res = await supabase
      .from('tasks').select('*')
      .in('id', crewAvailableIds)
      .eq('assignment_mode', 'crew')
      .neq('stage', 'Done');
    crewAvailTasks = unwrap(res, 'Crew available tasks');
  }

  return { crewIpTasks, crewAvailTasks };
}

/** Phase 4: blocked + review tasks + blocker details */
async function fetchBlockedAndReview(
  isAdminOrManager: boolean,
  memberProjectIds: string[],
  mergedIp: any[],
  assignedTasks: any[],
  crewIpTasks: any[],
) {
  const safeProjectIds = memberProjectIds.length > 0 ? memberProjectIds : EMPTY_PROJECT_IDS;
  let blockedTasks: any[];

  if (isAdminOrManager) {
    const res = await supabase
      .from('tasks').select('*')
      .eq('is_blocked', true)
      .neq('stage', 'Done')
      .in('project_id', safeProjectIds)
      .order('created_at', { ascending: false })
      .limit(30);
    blockedTasks = unwrap(res, 'Blocked tasks');
  } else {
    const allOwn = [...mergedIp, ...assignedTasks, ...crewIpTasks];
    const seen = new Set<string>();
    blockedTasks = allOwn.filter(t => {
      if (!t.is_blocked || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  }

  // Blocker details
  let blockerMap: Record<string, { reason: string; needs_from_manager?: string | null }> = {};
  if (blockedTasks.length > 0) {
    const res = await supabase
      .from('task_blockers')
      .select('task_id, reason, needs_from_manager')
      .in('task_id', blockedTasks.map(t => t.id))
      .is('resolved_at', null);
    const rows = unwrap(res, 'Blocker details');
    (rows as any[]).forEach(r => {
      blockerMap[r.task_id] = { reason: r.reason, needs_from_manager: r.needs_from_manager };
    });
  }

  // Needs review
  let reviewTasks: any[] = [];
  if (isAdminOrManager) {
    const res = await supabase
      .from('tasks').select('*')
      .eq('needs_manager_review', true)
      .in('project_id', safeProjectIds)
      .order('created_at', { ascending: false })
      .limit(30);
    reviewTasks = unwrap(res, 'Review tasks');
  }

  return { blockedTasks, blockerMap, reviewTasks };
}

/** Phase 5: enrichment — projects, parents, assignees, photos, crew counts */
async function fetchEnrichment(allTasks: any[], userId: string) {
  const projectIds = [...new Set(allTasks.map(t => t.project_id))];
  const parentIds = [...new Set(allTasks.map(t => t.parent_task_id).filter(Boolean))];
  const assigneeIds = [...new Set(
    allTasks.map(t => t.assigned_to_user_id).filter((id): id is string => !!id && id !== userId),
  )];
  const crewTaskIds = allTasks.filter(t => t.assignment_mode === 'crew').map(t => t.id);
  const allTaskIds = [...new Set(allTasks.map(t => t.id))];

  // Run all enrichment queries in parallel
  const [projectsRes, parentsRes, assigneesRes, crewWorkerRes, photoRes, materialRes, allProfilesRes] = await Promise.all([
    projectIds.length > 0
      ? supabase.from('projects').select('id, name, address').in('id', projectIds)
      : Promise.resolve({ data: [], error: null }),
    parentIds.length > 0
      ? supabase.from('tasks').select('id, task').in('id', parentIds)
      : Promise.resolve({ data: [], error: null }),
    assigneeIds.length > 0
      ? supabase.from('profiles').select('id, full_name').in('id', assigneeIds)
      : Promise.resolve({ data: [], error: null }),
    crewTaskIds.length > 0
      ? supabase.from('task_workers').select('task_id').in('task_id', crewTaskIds).eq('active', true)
      : Promise.resolve({ data: [], error: null }),
    allTaskIds.length > 0
      ? supabase.from('task_photos' as any).select('task_id').in('task_id', allTaskIds)
      : Promise.resolve({ data: [], error: null }),
    allTaskIds.length > 0
      ? supabase.from('task_materials').select('task_id').in('task_id', allTaskIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('profiles').select('id, full_name'),
  ]);

  const projectMap: Record<string, { name: string; address?: string }> = {};
  (unwrap(projectsRes, 'Projects') as any[]).forEach(p => {
    projectMap[p.id] = { name: p.name, address: p.address ?? undefined };
  });

  const parentTitles: Record<string, string> = {};
  (unwrap(parentsRes, 'Parent tasks') as any[]).forEach(p => {
    parentTitles[p.id] = p.task;
  });

  const assigneeMap: Record<string, string> = {};
  (unwrap(assigneesRes, 'Assignees') as any[]).forEach(a => {
    assigneeMap[a.id] = a.full_name || 'Unknown';
  });

  const crewWorkerCounts: Record<string, number> = {};
  (unwrap(crewWorkerRes, 'Crew workers') as any[]).forEach(r => {
    crewWorkerCounts[r.task_id] = (crewWorkerCounts[r.task_id] || 0) + 1;
  });

  const photoCountMap: Record<string, number> = {};
  (unwrap(photoRes, 'Photos') as any[]).forEach((r: any) => {
    photoCountMap[r.task_id] = (photoCountMap[r.task_id] || 0) + 1;
  });

  const materialCountMap: Record<string, number> = {};
  (unwrap(materialRes, 'Materials') as any[]).forEach((r: any) => {
    materialCountMap[r.task_id] = (materialCountMap[r.task_id] || 0) + 1;
  });

  return { projectMap, parentTitles, assigneeMap, crewWorkerCounts, photoCountMap, materialCountMap };
}


async function fetchChildrenForParents(parentIds: string[]) {
  if (parentIds.length === 0) return {};

  const res = await supabase
    .from('tasks')
    .select('*')
    .in('parent_task_id', parentIds)
    .order('created_at', { ascending: true });

  const childRows = unwrap(res, 'Child tasks') as any[];
  const childTasksByParent: Record<string, any[]> = {};

  childRows.forEach((child) => {
    const pid = child.parent_task_id;
    if (!pid) return;
    if (!childTasksByParent[pid]) childTasksByParent[pid] = [];
    childTasksByParent[pid].push(child);
  });

  return childTasksByParent;
}

/* ── Merge helpers ── */
function mergeAndDedupe(primary: any[], secondary: any[]): any[] {
  const ids = new Set(primary.map(t => t.id));
  const merged = [...primary];
  secondary.forEach(t => { if (!ids.has(t.id)) merged.push(t); });
  return merged;
}


function addCrewWorkerCounts(tasks: any[], crewWorkerCounts: Record<string, number>) {
  return tasks.map((task) => ({ ...task, active_worker_count: crewWorkerCounts[task.id] || 0 }));
}

function splitTodaySections(tasks: any[], childTasksByParent: Record<string, any[]>, isAdminOrManager: boolean, userId: string) {
  const inProgress: any[] = [];
  const assigned: any[] = [];
  const available: any[] = [];
  const needsReview: any[] = [];
  const blocked: any[] = [];

  tasks.forEach((task) => {
    if (isTaskPackage(task, childTasksByParent)) return;

    const status = getTaskOperationalStatus(task, {
      requiredCount: task.material_count || 0,
      hasRequiredMaterials: (task.material_count || 0) > 0 ? task.materials_on_site === 'Yes' : true,
    });

    if (status === 'review_needed') {
      if (isAdminOrManager) needsReview.push(task);
      return;
    }

    if (status === 'blocked') {
      blocked.push(task);
      return;
    }

    if (status === 'in_progress') {
      inProgress.push(task);
      return;
    }

    if (status === 'ready') {
      const canTake = !task.assigned_to_user_id && task.assignment_mode === 'solo' && !task.is_outside_vendor;
      if (canTake) available.push(task);
      else if (task.assigned_to_user_id === userId) assigned.push(task);
    }
  });

  return { inProgress, assigned, available, needsReview, blocked };
}

/* ── Hook ── */
export function useTodayData(userId: string | undefined, isAdmin: boolean) {
  const query = useQuery({
    queryKey: ['today-data', userId, isAdmin],
    queryFn: async (): Promise<TodayData> => {
      if (!userId) return EMPTY_DATA;

      const { projectIds: memberProjectIds, hasManagerRole } = await fetchMemberships(userId);
      const isAdminOrManager = isAdmin || hasManagerRole;

      const core = await fetchCoreTasks(userId, memberProjectIds);
      const crew = await fetchCrewTasks(core.myActiveTaskIds, core.myCandidateIds);

      const mergedIp = mergeAndDedupe(core.soloIp, crew.crewIpTasks);
      const mergedAvail = mergeAndDedupe(core.soloAvail, crew.crewAvailTasks);

      const { blockedTasks, blockerMap, reviewTasks } = await fetchBlockedAndReview(
        isAdminOrManager,
        memberProjectIds,
        mergedIp,
        core.soloAssigned,
        crew.crewIpTasks,
      );

      const allTasks = [...mergedIp, ...core.soloAssigned, ...mergedAvail, ...reviewTasks, ...blockedTasks];
      const parentIds = [...new Set(allTasks.map((t) => t.id))];
      const [enrichment, childTasksByParent] = await Promise.all([
        fetchEnrichment(allTasks, userId),
        fetchChildrenForParents(parentIds),
      ]);

      const allTasksWithCounts = addCrewWorkerCounts(allTasks, enrichment.crewWorkerCounts).map((task) => ({
        ...task,
        material_count: enrichment.materialCountMap[task.id] || 0,
      }));

      const sections = splitTodaySections(allTasksWithCounts, childTasksByParent, isAdminOrManager, userId);

      return {
        ...sections,
        blockerMap,
        crewActiveTaskIds: core.myActiveTaskIds,
        crewCandidateTaskIds: core.myCandidateIds,
        crewWorkerCounts: enrichment.crewWorkerCounts,
        hasShiftToday: core.hasShiftToday,
        isManager: hasManagerRole,
        ...enrichment,
        childTasksByParent,
      };
    },
    enabled: !!userId,
    refetchOnWindowFocus: true,
    refetchInterval: 60000,
    staleTime: 30000,
    placeholderData: EMPTY_DATA,
  });

  const refresh = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    data: query.data ?? EMPTY_DATA,
    loading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error.message : 'Failed to load today data') : null,
    refresh,
    isFetching: query.isFetching,
  };
}
