import { describe, it, expect } from 'vitest';
import {
  validateCreateTask,
  validateSetPropertyClass,
  TASK_STAGES,
  TASK_PRIORITIES,
} from '../../supabase/functions/agent_api/validation';

describe('agent API: create_task input rules', () => {
  it('accepts a minimal request and applies the app defaults', () => {
    const r = validateCreateTask({ project: '1428 Ramona', title: 'Replace kitchen faucet' });
    if (!r.ok) throw new Error(`expected acceptance, got ${r.failure.error}`);
    expect(r.value.stage).toBe('Ready');
    expect(r.value.priority).toBe('2 – This Week');
    expect(r.value.materials_on_site).toBe('No');
    expect(r.value.due_date).toBeNull();
    expect(r.value.dry_run).toBe(false);
  });

  it('rejects a stage outside the task stages the app itself allows', () => {
    const r = validateCreateTask({ project: 'p', title: 't', stage: 'Finished' });
    if (r.ok) throw new Error('expected rejection');
    expect(r.failure.error).toBe('invalid_stage');
    expect(r.failure.detail).toContain(TASK_STAGES.join(', '));
  });

  it('rejects a priority outside the app list', () => {
    const r = validateCreateTask({ project: 'p', title: 't', priority: 'ASAP' });
    if (r.ok) throw new Error('expected rejection');
    expect(r.failure.error).toBe('invalid_priority');
    expect(r.failure.detail).toContain(TASK_PRIORITIES.join(', '));
  });

  it('rejects a malformed due date', () => {
    const r = validateCreateTask({ project: 'p', title: 't', due_date: '2026-13-45' });
    if (r.ok) throw new Error('expected rejection');
    expect(r.failure.error).toBe('invalid_due_date');
  });

  it('rejects an empty title', () => {
    const r = validateCreateTask({ project: 'p', title: '   ' });
    if (r.ok) throw new Error('expected rejection');
    expect(r.failure.error).toBe('invalid_title');
  });

  it('rejects a non-object body', () => {
    const a = validateCreateTask('nope');
    if (a.ok) throw new Error('expected rejection');
    expect(a.failure.error).toBe('invalid_body');
    const b = validateCreateTask(null);
    if (b.ok) throw new Error('expected rejection');
    expect(b.failure.error).toBe('invalid_body');
  });
});

describe('agent API: set_property_class input rules', () => {
  it('requires an exact class id — a name alone is never enough', () => {
    const r = validateSetPropertyClass({ property: '137 Forestwood', class_name: '137 Forestwood' });
    if (r.ok) throw new Error('expected rejection');
    expect(r.failure.error).toBe('invalid_class_id');
    expect(r.failure.hint).toContain('nothing is chosen for you');
  });

  it('accepts an explicit property plus class id', () => {
    const r = validateSetPropertyClass({ property: '137 Forestwood', class_id: '9999' });
    if (!r.ok) throw new Error(`expected acceptance, got ${r.failure.error}`);
    expect(r.value.class_id).toBe('9999');
    expect(r.value.dry_run).toBe(false);
  });

  it('passes dry_run through when it is a real boolean', () => {
    const r = validateSetPropertyClass({ property: 'p', class_id: '1', dry_run: true });
    if (!r.ok) throw new Error(`expected acceptance, got ${r.failure.error}`);
    expect(r.value.dry_run).toBe(true);
  });
});
