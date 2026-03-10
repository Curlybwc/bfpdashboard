import { getTaskOperationalStatus } from '@/lib/taskOperationalStatus';

/**
 * Pure helpers for filtering and structuring tasks on the ProjectDetail page.
 * Extracted to reduce fragility in ProjectDetail.tsx.
 */

/**
 * Filter tasks visible to a contractor.
 * Contractors see: tasks assigned to them, crew tasks they're part of,
 * and unassigned solo Ready tasks (excluding outside vendor).
 */
export function filterContractorTasks(
  allTasks: any[],
  userId: string,
  myActiveWorkerTaskIds: Set<string>,
  myCandidateTaskIds: Set<string>,
): any[] {
  return allTasks.filter((t) => {
    if (t.assigned_to_user_id === userId) return true;
    if (myActiveWorkerTaskIds.has(t.id)) return true;
    if (myCandidateTaskIds.has(t.id)) return true;
    if (!t.assigned_to_user_id && t.assignment_mode === 'solo' && !t.is_package && getTaskOperationalStatus(t) === 'ready' && !t.is_outside_vendor) return true;
    return false;
  });
}

/**
 * Ensure parent tasks are included when their children are visible.
 */
export function includeParentTasks(
  filteredTasks: any[],
  allTasks: any[],
): any[] {
  const visibleIds = new Set(filteredTasks.map((t) => t.id));
  const parentIds = new Set<string>();
  filteredTasks.forEach((t) => {
    if (t.parent_task_id && !visibleIds.has(t.parent_task_id)) {
      parentIds.add(t.parent_task_id);
    }
  });
  if (parentIds.size === 0) return filteredTasks;
  const parents = allTasks.filter((t) => parentIds.has(t.id));
  return [...parents, ...filteredTasks];
}

/**
 * Build parent→children map.
 */
export function buildChildrenMap(tasks: any[]): Record<string, any[]> {
  const map: Record<string, any[]> = {};
  tasks.forEach((t) => {
    if (t.parent_task_id) {
      if (!map[t.parent_task_id]) map[t.parent_task_id] = [];
      map[t.parent_task_id].push(t);
    }
  });
  return map;
}

/**
 * Build assignee display-name map from project members.
 */
export function buildAssigneeMap(
  members: Array<{ user_id: string; profiles: { full_name: string | null } | null }>,
): Record<string, string> {
  const map: Record<string, string> = {};
  members.forEach((m) => {
    map[m.user_id] = m.profiles?.full_name || 'Unnamed';
  });
  return map;
}
