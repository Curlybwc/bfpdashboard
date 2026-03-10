import { getTaskOperationalStatus } from '@/lib/taskOperationalStatus';

/**
 * Pure computation for the "What next?" project summary card.
 * Extracted from ProjectDetail.tsx to reduce fragility.
 */

export type RecommendationType = 'blocked' | 'unassigned' | 'ready' | 'progress' | 'done';

export interface WhatNextResult {
  blocked: any[];
  inProgress: any[];
  ready: any[];
  readyUnassigned: any[];
  waitingMaterials: any[];
  sortedBlocked: any[];
  sortedReady: any[];
  sortedUnassigned: any[];
  sortedWaitingMaterials: any[];
  recommendation: string;
  recommendationType: RecommendationType;
  hasAnyWork: boolean;
  // Contractor-specific
  myBlocked: any[];
  myInProgress: any[];
  available: any[];
}

const sortByPriority = (a: any, b: any) => {
  const pa = a.priority || '5 – Later';
  const pb = b.priority || '5 – Later';
  if (pa !== pb) return pa.localeCompare(pb);
  const sa = a.sort_order ?? 999999;
  const sb = b.sort_order ?? 999999;
  if (sa !== sb) return sa - sb;
  return (a.created_at || '').localeCompare(b.created_at || '');
};

export function computeWhatNext(
  tasks: any[],
  childrenMap: Record<string, any[]>,
  isContractor: boolean,
  userId: string | undefined,
): WhatNextResult {
  const leafTasks = tasks.filter((t) => !(childrenMap[t.id]?.length) && getTaskOperationalStatus(t) !== 'done');
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
    blocked, inProgress, ready, readyUnassigned, waitingMaterials,
    sortedBlocked, sortedReady, sortedUnassigned, sortedWaitingMaterials,
    recommendation, recommendationType,
    hasAnyWork: leafTasks.length > 0,
    myBlocked, myInProgress, available,
  };
}

/**
 * Compute total actual cost across root tasks (rolling up children).
 */
export function computeProjectTotalActual(
  rootTasks: any[],
  childrenMap: Record<string, any[]>,
): number {
  const getTaskActual = (t: any): number => {
    const children = childrenMap[t.id];
    if (children && children.length > 0) {
      return children.reduce((sum: number, c: any) => sum + (c.actual_total_cost ?? 0), 0);
    }
    return t.actual_total_cost ?? 0;
  };
  return rootTasks.reduce((sum, t) => sum + getTaskActual(t), 0);
}
