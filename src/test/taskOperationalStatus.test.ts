import { describe, expect, it } from 'vitest';
import { getTaskOperationalStatus, isTaskActionable, isTaskPackage } from '@/lib/taskOperationalStatus';

describe('getTaskOperationalStatus', () => {
  it('returns ready for actionable unstarted task', () => {
    const status = getTaskOperationalStatus({ stage: 'Ready', is_blocked: false, materials_on_site: 'Yes' }, { requiredCount: 1, hasRequiredMaterials: true });
    expect(status).toBe('ready');
  });

  it('returns blocked when materials are missing', () => {
    const status = getTaskOperationalStatus({ stage: 'Ready', is_blocked: false, materials_on_site: 'No' }, { requiredCount: 2, hasRequiredMaterials: false, missingRequiredCount: 1 });
    expect(status).toBe('blocked');
  });

  it('returns in_progress for active task', () => {
    const status = getTaskOperationalStatus({ stage: 'In Progress', is_blocked: false });
    expect(status).toBe('in_progress');
  });

  it('returns review_needed when manager review is required', () => {
    const status = getTaskOperationalStatus({ stage: 'Done', needs_manager_review: true });
    expect(status).toBe('review_needed');
  });

  it('returns done when completed and no review required', () => {
    const status = getTaskOperationalStatus({ stage: 'Done', needs_manager_review: false });
    expect(status).toBe('done');
  });
});

describe('package/actionable behavior', () => {
  it('treats parent/package tasks as non-actionable worker tasks', () => {
    const parent = { id: 'parent1' };
    const explicitPackage = { id: 'pkg', is_package: true };
    const childTasksByParent = { parent1: [{ id: 'child1' }] };

    expect(isTaskPackage(parent, childTasksByParent)).toBe(true);
    expect(isTaskActionable(parent, childTasksByParent)).toBe(false);
    expect(isTaskPackage(explicitPackage, childTasksByParent)).toBe(true);
    expect(isTaskActionable({ id: 'child1' }, childTasksByParent)).toBe(true);
  });
});
