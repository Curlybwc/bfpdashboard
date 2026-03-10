/**
 * Lightweight operational alerts — purely derived from existing Today page state.
 * No database table, no event bus. Computed on each Today load.
 */

export interface OperationalAlert {
  id: string;
  type: 'blocked' | 'review' | 'overdue' | 'due_tomorrow' | 'due_this_week' | 'shift' | 'photo';
  severity: 'high' | 'medium' | 'low';
  title: string;
  subtitle?: string;
  actionPath: string;
  taskId?: string;
}

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

interface AlertInput {
  inProgress: any[];
  assigned: any[];
  blocked: any[];
  needsReview: any[];
  available: any[];
  isAdmin: boolean;
  isManager: boolean;
  isContractor: boolean;
  hasShiftToday: boolean;
  photoCountMap: Record<string, number>;
  projectMap: Record<string, { name: string; address?: string }>;
  userId: string;
  /** Crew task IDs the user is actively working on */
  crewActiveTaskIds: Set<string>;
}

export function generateAlerts(input: AlertInput): OperationalAlert[] {
  const {
    inProgress, assigned, blocked, needsReview, available,
    isAdmin, isManager, isContractor,
    hasShiftToday, photoCountMap, projectMap, userId, crewActiveTaskIds,
  } = input;

  const alerts: OperationalAlert[] = [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const dueWeekEnd = new Date();
  dueWeekEnd.setDate(dueWeekEnd.getDate() + 7);
  const dueWeekEndStr = dueWeekEnd.toISOString().slice(0, 10);
  const alertedTaskIds = new Set<string>();

  // ── Blocked tasks (high) ──
  // Manager/admin see all blocked; contractor sees only their own
  if (isAdmin || isManager) {
    blocked.forEach(t => {
      alerts.push({
        id: `blocked-${t.id}`,
        type: 'blocked',
        severity: 'high',
        title: `Blocked: ${t.task}`,
        subtitle: projectMap[t.project_id]?.name,
        actionPath: `/projects/${t.project_id}/tasks/${t.id}`,
        taskId: t.id,
      });
      alertedTaskIds.add(t.id);
    });
  } else {
    blocked.forEach(t => {
      const isMine =
        t.assigned_to_user_id === userId || crewActiveTaskIds.has(t.id);
      if (isMine) {
        alerts.push({
          id: `blocked-${t.id}`,
          type: 'blocked',
          severity: 'high',
          title: `Blocked: ${t.task}`,
          subtitle: projectMap[t.project_id]?.name,
          actionPath: `/projects/${t.project_id}/tasks/${t.id}`,
          taskId: t.id,
        });
        alertedTaskIds.add(t.id);
      }
    });
  }

  // ── Needs manager review (high) — manager/admin only ──
  if (isAdmin || isManager) {
    needsReview.forEach(t => {
      alerts.push({
        id: `review-${t.id}`,
        type: 'review',
        severity: 'high',
        title: `Needs review: ${t.task}`,
        subtitle: projectMap[t.project_id]?.name,
        actionPath: `/projects/${t.project_id}/tasks/${t.id}`,
        taskId: t.id,
      });
      alertedTaskIds.add(t.id);
    });
  }

  // ── Overdue tasks (medium) ──
  const allTasks = [...inProgress, ...assigned, ...available];
  const seenOverdue = new Set<string>();
  allTasks.forEach(t => {
    if (seenOverdue.has(t.id)) return;
    if (!t.due_date || t.stage === 'Done') return;
    if (t.due_date >= todayStr) return;

    // Contractor: only their own tasks
    if (isContractor) {
      const isMine =
        t.assigned_to_user_id === userId || crewActiveTaskIds.has(t.id);
      if (!isMine) return;
    }

    seenOverdue.add(t.id);
    alerts.push({
      id: `overdue-${t.id}`,
      type: 'overdue',
      severity: 'medium',
      title: `Overdue: ${t.task}`,
      subtitle: projectMap[t.project_id]?.name,
      actionPath: `/projects/${t.project_id}/tasks/${t.id}`,
      taskId: t.id,
    });
    alertedTaskIds.add(t.id);
  });

  // ── Due tomorrow / due this week (low) ──
  const seenDueSoon = new Set<string>();
  allTasks.forEach((t) => {
    if (seenDueSoon.has(t.id) || alertedTaskIds.has(t.id)) return;
    if (!t.due_date || t.stage === 'Done') return;
    if (t.due_date <= todayStr) return;

    // Contractor: only their own tasks
    if (isContractor) {
      const isMine =
        t.assigned_to_user_id === userId || crewActiveTaskIds.has(t.id);
      if (!isMine) return;
    }

    if (t.due_date === tomorrowStr) {
      seenDueSoon.add(t.id);
      alerts.push({
        id: `due-tomorrow-${t.id}`,
        type: 'due_tomorrow',
        severity: 'low',
        title: `Due tomorrow: ${t.task}`,
        subtitle: projectMap[t.project_id]?.name,
        actionPath: `/projects/${t.project_id}/tasks/${t.id}`,
        taskId: t.id,
      });
      return;
    }

    if (t.due_date > tomorrowStr && t.due_date <= dueWeekEndStr) {
      seenDueSoon.add(t.id);
      alerts.push({
        id: `due-week-${t.id}`,
        type: 'due_this_week',
        severity: 'low',
        title: `Due this week: ${t.task}`,
        subtitle: projectMap[t.project_id]?.name,
        actionPath: `/projects/${t.project_id}/tasks/${t.id}`,
        taskId: t.id,
      });
    }
  });

  // ── No shift logged today (medium) — contractor only, after 10am ──
  if (isContractor && !hasShiftToday && new Date().getHours() >= 10) {
    alerts.push({
      id: 'shift-today',
      type: 'shift',
      severity: 'medium',
      title: 'No shift logged today',
      subtitle: 'Tap to log your hours',
      actionPath: '/shifts',
    });
  }

  // ── Photo reminder (low) — contractor, in-progress tasks with 0 photos ──
  if (isContractor) {
    inProgress.forEach(t => {
      const isMine =
        t.assigned_to_user_id === userId || crewActiveTaskIds.has(t.id);
      if (!isMine) return;
      if ((photoCountMap[t.id] || 0) > 0) return;
      alerts.push({
        id: `photo-${t.id}`,
        type: 'photo',
        severity: 'low',
        title: `Add photos: ${t.task}`,
        subtitle: projectMap[t.project_id]?.name,
        actionPath: `/projects/${t.project_id}/tasks/${t.id}`,
        taskId: t.id,
      });
    });
  }

  // Sort: severity first, then by due date for tie-breaking
  alerts.sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity] ?? 9;
    const sb = SEVERITY_ORDER[b.severity] ?? 9;
    return sa - sb;
  });

  return alerts;
}
