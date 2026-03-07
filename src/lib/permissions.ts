/**
 * Centralized permission helpers for project and scope pages.
 * Uses the existing role model from the database schema.
 */

/**
 * Whether the user can create tasks in a project.
 * Allowed for admins, project managers, and contractors.
 */
export function canCreateTask(isAdmin: boolean, projectRole: string | null): boolean {
  return isAdmin || projectRole === 'manager' || projectRole === 'contractor';
}

/**
 * Whether the user can edit project metadata (name, address).
 * Allowed for admins and project managers.
 */
export function canEditProject(isAdmin: boolean, projectRole: string | null): boolean {
  return isAdmin || projectRole === 'manager';
}

/**
 * Whether the user can delete tasks.
 * Allowed for admins and project managers only.
 */
export function canDeleteTask(isAdmin: boolean, projectRole: string | null): boolean {
  return isAdmin || projectRole === 'manager';
}

/**
 * Whether the user can archive/reactivate a scope.
 * Admin-only per current UI behavior.
 */
export function canArchiveScope(isAdmin: boolean): boolean {
  return isAdmin;
}

/**
 * Whether the user can delete individual scope items.
 * Admin-only per current UI and RLS.
 */
export function canDeleteScopeItem(isAdmin: boolean): boolean {
  return isAdmin;
}

/**
 * Whether the user can edit scope title.
 * Admin-only per current UI behavior.
 */
export function canEditScopeTitle(isAdmin: boolean): boolean {
  return isAdmin;
}

/**
 * Whether the user can report a blocker on a task.
 * Admins, managers, and contractors. UI further gates on task relevance.
 */
export function canReportBlocker(isAdmin: boolean, projectRole: string | null): boolean {
  return isAdmin || projectRole === 'manager' || projectRole === 'contractor';
}

/**
 * Whether the user can resolve a blocker.
 * Admins and managers only.
 */
export function canResolveBlocker(isAdmin: boolean, projectRole: string | null): boolean {
  return isAdmin || projectRole === 'manager';
}

/**
 * Extract the current user's project role from a members list.
 */
export function getProjectRole(
  members: Array<{ user_id: string; role: string }>,
  userId: string,
): string | null {
  return members.find((m) => m.user_id === userId)?.role ?? null;
}
