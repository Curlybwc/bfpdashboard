import { getTaskOperationalStatus, type TaskOperationalStatus, isTaskPackage } from '@/lib/taskOperationalStatus';

export interface TaskPackageGroup {
  packageTask: any;
  childTasks: any[];
  isStandalone: boolean;
  summary: {
    total: number;
    byStatus: Record<TaskOperationalStatus, number>;
    materialsNeeded: number;
  };
}

function emptyStatusSummary(): Record<TaskOperationalStatus, number> {
  return { blocked: 0, ready: 0, in_progress: 0, review_needed: 0, done: 0 };
}

/**
 * Build a unified, ordered list of top-level items.
 * Each item is either:
 *   - A standalone task (isStandalone: true, childTasks contains the task itself)
 *   - A package/recipe (isStandalone: false, childTasks contains children)
 * All items are sorted together by sort_order of the top-level task.
 */
export function buildTaskPackageGroups(tasks: any[], materialCountMap: Record<string, number>): TaskPackageGroup[] {
  const childrenByParent: Record<string, any[]> = {};
  tasks.forEach((task) => {
    if (!task.parent_task_id) return;
    if (!childrenByParent[task.parent_task_id]) childrenByParent[task.parent_task_id] = [];
    childrenByParent[task.parent_task_id].push(task);
  });

  const topLevelTasks = tasks.filter((task) => !task.parent_task_id);

  const groups: TaskPackageGroup[] = topLevelTasks.map((task) => {
    const isPackage = isTaskPackage(task, childrenByParent);

    if (isPackage) {
      const children = [...(childrenByParent[task.id] || [])].sort((a, b) => {
        const aDone = a.stage === 'Done' ? 1 : 0;
        const bDone = b.stage === 'Done' ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        const aSort = a.sort_order ?? 999999;
        const bSort = b.sort_order ?? 999999;
        if (aSort !== bSort) return aSort - bSort;
        return (a.created_at || '').localeCompare(b.created_at || '');
      });

      const summary = { total: children.length, byStatus: emptyStatusSummary(), materialsNeeded: 0 };
      children.forEach((child) => {
        const status = getTaskOperationalStatus(child, {
          requiredCount: materialCountMap[child.id] || 0,
          hasRequiredMaterials: (materialCountMap[child.id] || 0) > 0 ? child.materials_on_site === 'Yes' : true,
        });
        summary.byStatus[status] += 1;
        if ((materialCountMap[child.id] || 0) > 0 && child.materials_on_site !== 'Yes') {
          summary.materialsNeeded += 1;
        }
      });

      return { packageTask: task, childTasks: children, isStandalone: false, summary };
    } else {
      // Standalone task — represented as a group with itself
      const status = getTaskOperationalStatus(task, {
        requiredCount: materialCountMap[task.id] || 0,
        hasRequiredMaterials: (materialCountMap[task.id] || 0) > 0 ? task.materials_on_site === 'Yes' : true,
      });
      const summary = { total: 1, byStatus: emptyStatusSummary(), materialsNeeded: 0 };
      summary.byStatus[status] = 1;
      if ((materialCountMap[task.id] || 0) > 0 && task.materials_on_site !== 'Yes') {
        summary.materialsNeeded = 1;
      }

      return { packageTask: task, childTasks: [task], isStandalone: true, summary };
    }
  });

  // Sort all top-level items together: done last, then by sort_order, then created_at
  groups.sort((a, b) => {
    const aDone = a.isStandalone
      ? (a.packageTask.stage === 'Done' ? 1 : 0)
      : (a.summary.total > 0 && a.summary.byStatus.done === a.summary.total ? 1 : 0);
    const bDone = b.isStandalone
      ? (b.packageTask.stage === 'Done' ? 1 : 0)
      : (b.summary.total > 0 && b.summary.byStatus.done === b.summary.total ? 1 : 0);
    if (aDone !== bDone) return aDone - bDone;

    const aSort = a.packageTask.sort_order ?? 999999;
    const bSort = b.packageTask.sort_order ?? 999999;
    if (aSort !== bSort) return aSort - bSort;
    return (a.packageTask.created_at || '').localeCompare(b.packageTask.created_at || '');
  });

  return groups;
}
