import { describe, expect, it } from 'vitest';
import { buildTaskPackageGroups } from '@/lib/taskPackages';

describe('buildTaskPackageGroups', () => {
  it('groups tasks under packages and uses General for flat tasks', () => {
    const tasks = [
      { id: 'pkg-1', task: 'Kitchen Package', is_package: true, parent_task_id: null },
      { id: 'task-1', task: 'Demo cabinets', parent_task_id: 'pkg-1', stage: 'Ready', materials_on_site: 'Yes' },
      { id: 'task-2', task: 'Install cabinets', parent_task_id: 'pkg-1', stage: 'In Progress', materials_on_site: 'No' },
      { id: 'flat-1', task: 'Loose task', parent_task_id: null, stage: 'Ready', materials_on_site: 'Yes' },
    ];

    const groups = buildTaskPackageGroups(tasks, { 'task-2': 2 });

    expect(groups[0].packageTask.task).toBe('General');
    expect(groups[0].childTasks).toHaveLength(1);

    const kitchen = groups.find((g) => g.packageTask.id === 'pkg-1');
    expect(kitchen?.summary.total).toBe(2);
    expect(kitchen?.summary.byStatus.in_progress).toBe(1);
    expect(kitchen?.summary.materialsNeeded).toBe(1);
  });
});
