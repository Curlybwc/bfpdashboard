import { getTaskOperationalStatus, isTaskPackage } from '@/lib/taskOperationalStatus';

/**
 * Pure computation for the "What next?" project summary card.
 * Extracted from ProjectDetail.tsx to reduce fragility.
 */

export type RecommendationType = 'blocked' | 'unassigned' | 'ready' | 'progress' | 'done';

export interface SummaryTask {
  id: string;
  task?: string | null;
  priority?: string | null;
  sort_order?: number | null;
  created_at?: string | null;
  assigned_to_user_id?: string | null;
  assignment_mode?: string | null;
  is_outside_vendor?: boolean | null;
  materials_on_site?: string | null;
  actual_total_cost?: number | null;
  parent_task_id?: string | null;
  due_date?: string | null;
  stage?: string | null;
  is_blocked?: boolean | null;
  needs_manager_review?: boolean | null;
  is_package?: boolean | null;
  started_at?: string | null;
  active_worker_count?: number | null;
}

export interface WhatNextResult {
  blocked: SummaryTask[];
  inProgress: SummaryTask[];
  ready: SummaryTask[];
  readyUnassigned: SummaryTask[];
  waitingMaterials: SummaryTask[];
  sortedBlocked: SummaryTask[];
  sortedReady: SummaryTask[];
  sortedUnassigned: SummaryTask[];
  sortedWaitingMaterials: SummaryTask[];
  recommendation: string;
  recommendationType: RecommendationType;
  hasAnyWork: boolean;
  // Contractor-specific
  myBlocked: SummaryTask[];
  myInProgress: SummaryTask[];
  available: SummaryTask[];
}

export interface ProjectHealthSummary {
  totalTasks: number;
  completedTasks: number;
  blockedTasks: number;
  needsReviewCount: number;
  overdueCount: number;
  percentComplete: number;
}

const sortByPriority = (a: SummaryTask, b: SummaryTask) => {
  const pa = a.priority || '5 – Later';
  const pb = b.priority || '5 – Later';
  if (pa !== pb) return pa.localeCompare(pb);
  const sa = a.sort_order ?? 999999;
  const sb = b.sort_order ?? 999999;
  if (sa !== sb) return sa - sb;
  return (a.created_at || '').localeCompare(b.created_at || '');
};

export function computeWhatNext(
  tasks: SummaryTask[],
  childrenMap: Record<string, SummaryTask[]>,
  isContractor: boolean,
  userId: string | undefined,
): WhatNextResult {
  const leafTasks = tasks.filter((t) => !isTaskPackage(t, childrenMap) && !(childrenMap[t.id]?.length) && getTaskOperationalStatus(t) !== 'done');
  const blocked = leafTasks.filter((t) => getTaskOperationalStatus(t) === 'blocked');
  const inProgress = leafTasks.filter((t) => getTaskOperationalStatus(t) === 'in_progress');
  const ready = leafTasks.filter((t) => getTaskOperationalStatus(t) === 'ready');
  const readyUnassigned = ready.filter((t) => !t.assigned_to_user_id && t.assignment_mode !== 'crew' && !t.is_outside_vendor);
  const waitingMaterials = ready.filter((t) => t.materials_on_site === 'No');

  const sortedReady = [...ready].sort(sortByPriority);
  const sortedBlocked = [...blocked].sort(sortByPriority);
  const sortedUnassigned = [...readyUnassigned].sort(sortByPriority);
  const sortedWaitingMaterials = [...waitingMaterials].sort(sortByPriority);

  const myBlocked = blocked.filter((t) => t.assigned_to_user_id === userId);
  const myInProgress = inProgress.filter((t) => t.assigned_to_user_id === userId);
  const available = sortedReady.filter((t) => !t.assigned_to_user_id);

  let recommendation = '';
  let recommendationType: RecommendationType = 'done';

  if (isContractor) {
    const myReady = sortedReady.filter((t) => t.assigned_to_user_id === userId);
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

  return {
    blocked,
    inProgress,
    ready,
    readyUnassigned,
    waitingMaterials,
    sortedBlocked,
    sortedReady,
    sortedUnassigned,
    sortedWaitingMaterials,
    recommendation,
    recommendationType,
    hasAnyWork: leafTasks.length > 0,
    myBlocked,
    myInProgress,
    available,
  };
}

/**
 * Compute total actual cost across root tasks (rolling up children).
 */
export function computeProjectTotalActual(
  rootTasks: SummaryTask[],
  childrenMap: Record<string, SummaryTask[]>,
): number {
  const getTaskActual = (task: SummaryTask): number => {
    const children = childrenMap[task.id];
    if (children && children.length > 0) {
      return children.reduce((sum, child) => sum + (child.actual_total_cost ?? 0), 0);
    }
    return task.actual_total_cost ?? 0;
  };
  return rootTasks.reduce((sum, task) => sum + getTaskActual(task), 0);
}

/**
 * Compute compact project-health metrics from task rows.
 * Packages/containers are excluded from counts.
 */
export function computeProjectHealthSummary(tasks: SummaryTask[]): ProjectHealthSummary {
  const childrenMap: Record<string, SummaryTask[]> = {};
  tasks.forEach((task) => {
    if (!task.parent_task_id) return;
    if (!childrenMap[task.parent_task_id]) childrenMap[task.parent_task_id] = [];
    childrenMap[task.parent_task_id].push(task);
  });

  const actionableTasks = tasks.filter((task) => !isTaskPackage(task, childrenMap));
  const today = new Date().toISOString().slice(0, 10);

  let completedTasks = 0;
  let blockedTasks = 0;
  let needsReviewCount = 0;
  let overdueCount = 0;

  actionableTasks.forEach((task) => {
    const status = getTaskOperationalStatus(task);
    if (status === 'done') completedTasks += 1;
    if (status === 'blocked') blockedTasks += 1;
    if (status === 'review_needed') needsReviewCount += 1;
    if (task.due_date && task.due_date < today && status !== 'done') overdueCount += 1;
  });

  const totalTasks = actionableTasks.length;
  const percentComplete = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return {
    totalTasks,
    completedTasks,
    blockedTasks,
    needsReviewCount,
    overdueCount,
    percentComplete,
  };
}

