import { describe, expect, it } from 'vitest';
import { buildTaskPackageGroups } from '@/lib/taskPackages';

describe('buildTaskPackageGroups', () => {
  it('creates unified groups for standalone and package tasks', () => {
    const tasks = [
      { id: 'pkg-1', task: 'Kitchen Package', is_package: true, parent_task_id: null, sort_order: 10, stage: 'Ready' },
      { id: 'task-1', task: 'Demo cabinets', parent_task_id: 'pkg-1', stage: 'Ready', materials_on_site: 'Yes' },
      { id: 'task-2', task: 'Install cabinets', parent_task_id: 'pkg-1', stage: 'In Progress', materials_on_site: 'No' },
      { id: 'flat-1', task: 'Loose task', parent_task_id: null, stage: 'Ready', materials_on_site: 'Yes', sort_order: 5 },
    ];

    const groups = buildTaskPackageGroups(tasks, { 'task-2': 2 });

    // Standalone task sorted first (sort_order 5 < 10)
    expect(groups[0].packageTask.id).toBe('flat-1');
    expect(groups[0].isStandalone).toBe(true);

    const kitchen = groups.find((g) => g.packageTask.id === 'pkg-1');
    expect(kitchen?.isStandalone).toBe(false);
    expect(kitchen?.summary.total).toBe(2);
    expect(kitchen?.summary.byStatus.blocked).toBe(1); // task-2 has materials needed but not on site
    expect(kitchen?.summary.materialsNeeded).toBe(1);
  });
});
