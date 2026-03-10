import { getTaskOperationalStatus, type TaskOperationalStatus, isTaskPackage } from '@/lib/taskOperationalStatus';

export interface TaskPackageGroup {
  packageTask: any;
  childTasks: any[];
  summary: {
    total: number;
    byStatus: Record<TaskOperationalStatus, number>;
    materialsNeeded: number;
  };
}

function emptyStatusSummary(): Record<TaskOperationalStatus, number> {
  return { blocked: 0, ready: 0, in_progress: 0, review_needed: 0, done: 0 };
}

export function buildTaskPackageGroups(tasks: any[], materialCountMap: Record<string, number>): TaskPackageGroup[] {
  const childrenByParent: Record<string, any[]> = {};
  tasks.forEach((task) => {
    if (!task.parent_task_id) return;
    if (!childrenByParent[task.parent_task_id]) childrenByParent[task.parent_task_id] = [];
    childrenByParent[task.parent_task_id].push(task);
  });

  const packageTasks = tasks.filter((task) => !task.parent_task_id && isTaskPackage(task, childrenByParent));
  const flatTasks = tasks.filter((task) => !task.parent_task_id && !isTaskPackage(task, childrenByParent));

  const groups: TaskPackageGroup[] = packageTasks.map((pkg) => ({
    packageTask: pkg,
    childTasks: childrenByParent[pkg.id] || [],
    summary: { total: 0, byStatus: emptyStatusSummary(), materialsNeeded: 0 },
  }));

  if (flatTasks.length > 0) {
    groups.unshift({
      packageTask: {
        id: 'general-package',
        task: 'General',
        room_area: null,
        trade: null,
        is_package: true,
      },
      childTasks: flatTasks,
      summary: { total: 0, byStatus: emptyStatusSummary(), materialsNeeded: 0 },
    });
  }

  groups.forEach((group) => {
    group.childTasks = [...group.childTasks].sort((a, b) => {
      const aDone = a.stage === 'Done' ? 1 : 0;
      const bDone = b.stage === 'Done' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      const aSort = a.sort_order ?? 999999;
      const bSort = b.sort_order ?? 999999;
      if (aSort !== bSort) return aSort - bSort;
      return (a.created_at || '').localeCompare(b.created_at || '');
    });

    group.summary.total = group.childTasks.length;
    group.childTasks.forEach((child) => {
      const status = getTaskOperationalStatus(child, {
        requiredCount: materialCountMap[child.id] || 0,
        hasRequiredMaterials: (materialCountMap[child.id] || 0) > 0 ? child.materials_on_site === 'Yes' : true,
      });
      group.summary.byStatus[status] += 1;
      if ((materialCountMap[child.id] || 0) > 0 && child.materials_on_site !== 'Yes') {
        group.summary.materialsNeeded += 1;
      }
    });
  });

  return groups;
}
