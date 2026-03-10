export type TaskOperationalStatus = 'blocked' | 'ready' | 'in_progress' | 'review_needed' | 'done';

export interface TaskMaterialSummary {
  hasRequiredMaterials?: boolean;
  missingRequiredCount?: number;
  requiredCount?: number;
}

export interface TaskReviewState {
  needsManagerReview?: boolean;
  isReviewComplete?: boolean;
}

const HOLD_STAGES = new Set(['Hold', 'Not Ready']);

export function isTaskPackage(task: any, childTasksByParent?: Record<string, any[]>): boolean {
  if (!task) return false;
  if (task.is_package === true) return true;
  if (!childTasksByParent) return false;
  return (childTasksByParent[task.id]?.length ?? 0) > 0;
}

export function getTaskOperationalStatus(
  task: any,
  materialSummary?: TaskMaterialSummary,
  reviewState?: TaskReviewState,
): TaskOperationalStatus {
  const stage = task?.stage;
  const needsManagerReview = reviewState?.needsManagerReview ?? task?.needs_manager_review === true;
  const isReviewComplete = reviewState?.isReviewComplete ?? false;
  const hasActiveWorkers = Number(task?.active_worker_count ?? 0) > 0;
  const hasStarted = !!task?.started_at;

  const hasMaterialGap =
    materialSummary?.hasRequiredMaterials === false ||
    (materialSummary?.missingRequiredCount ?? 0) > 0 ||
    ((materialSummary?.requiredCount ?? 0) > 0 && task?.materials_on_site === 'No');

  if (needsManagerReview && !isReviewComplete) return 'review_needed';
  if (stage === 'Done') return 'done';
  if (task?.is_blocked || HOLD_STAGES.has(stage) || hasMaterialGap) return 'blocked';
  if (stage === 'In Progress' || hasActiveWorkers || hasStarted) return 'in_progress';
  return 'ready';
}

export function isTaskActionable(task: any, childTasksByParent?: Record<string, any[]>): boolean {
  return !isTaskPackage(task, childTasksByParent);
}
