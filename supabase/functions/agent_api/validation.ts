// Pure, runtime-agnostic input validation for the Agent API write actions.
// No network, no database, no environment reads — so it is unit-testable from
// the app's own test suite (see src/test/agentApiValidation.test.ts).

const MAX_ID_LEN = 200;
const MAX_NAME_LEN = 300;
const MAX_TITLE_LEN = 500;
const MAX_TRADE_LEN = 200;

export const TASK_STAGES = ['Ready', 'In Progress', 'Not Ready', 'Hold', 'Done'] as const;
export const TASK_PRIORITIES = ['1 – Now', '2 – This Week', '3 – Soon', '4 – When Time', '5 – Later'] as const;
export const MATERIALS_STATUSES = ['Yes', 'Partial', 'No'] as const;

export type ValidationFailure = { error: string; detail: string; hint?: string };
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; failure: ValidationFailure };

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 && t.length <= max ? t : null;
}

function boolOrUndefined(v: unknown): boolean | string | undefined {
  if (v === undefined || v === null) return undefined;
  if (v === true) return true;
  if (v === false) return false;
  return 'not a true/false value';
}

/** Validate the body of a create_task write request. */
export function validateCreateTask(body: unknown): ValidationResult<CreateTaskPayload> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, failure: { error: 'invalid_body', detail: 'Request body must be a JSON object.' } };
  }
  const b = body as Record<string, unknown>;

  const project = str(b.project, MAX_ID_LEN);
  if (!project) {
    return {
      ok: false,
      failure: { error: 'invalid_project', detail: 'project is required: a project id, or a property name to match.' },
    };
  }

  const title = str(b.title, MAX_TITLE_LEN);
  if (!title) {
    return {
      ok: false,
      failure: { error: 'invalid_title', detail: `title is required, 1-${MAX_TITLE_LEN} characters.` },
    };
  }

  const stage = b.stage === undefined ? 'Ready' : str(b.stage, 50);
  if (!stage || !(TASK_STAGES as readonly string[]).includes(stage)) {
    return {
      ok: false,
      failure: { error: 'invalid_stage', detail: `stage must be one of: ${TASK_STAGES.join(', ')}.`, hint: 'Omit stage to use the default "Ready".' },
    };
  }

  const priority = b.priority === undefined ? '2 – This Week' : str(b.priority, 50);
  if (!priority || !(TASK_PRIORITIES as readonly string[]).includes(priority)) {
    return {
      ok: false,
      failure: { error: 'invalid_priority', detail: `priority must be one of: ${TASK_PRIORITIES.join(', ')}.`, hint: 'Omit priority to use the default "2 – This Week".' },
    };
  }

  const materials = b.materials_on_site === undefined ? 'No' : str(b.materials_on_site, 20);
  if (!materials || !(MATERIALS_STATUSES as readonly string[]).includes(materials)) {
    return {
      ok: false,
      failure: { error: 'invalid_materials_on_site', detail: `materials_on_site must be one of: ${MATERIALS_STATUSES.join(', ')}.` },
    };
  }

  let dueDate: string | null = null;
  if (b.due_date !== undefined && b.due_date !== null) {
    const d = str(b.due_date, 10);
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) {
      return { ok: false, failure: { error: 'invalid_due_date', detail: 'due_date must be YYYY-MM-DD.' } };
    }
    dueDate = d;
  }

  const worker = b.worker === undefined || b.worker === null ? null : str(b.worker, MAX_NAME_LEN);
  if (b.worker != null && worker === null) {
    return { ok: false, failure: { error: 'invalid_worker', detail: `worker must be a user id or a name of up to ${MAX_NAME_LEN} characters.` } };
  }

  const createdBy = b.created_by === undefined || b.created_by === null ? null : str(b.created_by, MAX_ID_LEN);
  if (b.created_by != null && createdBy === null) {
    return { ok: false, failure: { error: 'invalid_created_by', detail: 'created_by must be a user id.' } };
  }

  const dryRun = boolOrUndefined(b.dry_run);
  if (typeof dryRun === 'string') {
    return { ok: false, failure: { error: 'invalid_dry_run', detail: 'dry_run must be true or false.' } };
  }

  const trade = b.trade === undefined || b.trade === null ? null : str(b.trade, MAX_TRADE_LEN);
  if (b.trade != null && trade === null) {
    return { ok: false, failure: { error: 'invalid_trade', detail: `trade must be up to ${MAX_TRADE_LEN} characters.` } };
  }

  return {
    ok: true,
    value: {
      project,
      title,
      stage,
      priority,
      materials_on_site: materials,
      due_date: dueDate,
      worker,
      trade,
      created_by: createdBy,
      dry_run: dryRun === true,
    },
  };
}

export interface CreateTaskPayload {
  project: string;
  title: string;
  stage: string;
  priority: string;
  materials_on_site: string;
  due_date: string | null;
  worker: string | null;
  trade: string | null;
  created_by: string | null;
  dry_run: boolean;
}

/** Validate the body of a set_property_class write request. */
export function validateSetPropertyClass(body: unknown): ValidationResult<SetPropertyClassPayload> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, failure: { error: 'invalid_body', detail: 'Request body must be a JSON object.' } };
  }
  const b = body as Record<string, unknown>;

  const property = str(b.property, MAX_ID_LEN);
  if (!property) {
    return {
      ok: false,
      failure: { error: 'invalid_property', detail: 'property is required: a project id, or a property name to match.' },
    };
  }

  const classId = str(b.class_id, MAX_ID_LEN);
  if (!classId) {
    return {
      ok: false,
      failure: {
        error: 'invalid_class_id',
        detail: 'class_id is required and must be an exact QuickBooks class id.',
        hint: 'The id must exist and be active in the QuickBooks company this property belongs to; nothing is chosen for you.',
      },
    };
  }

  const className = b.class_name === undefined || b.class_name === null ? null : str(b.class_name, MAX_NAME_LEN);
  if (b.class_name != null && className === null) {
    return { ok: false, failure: { error: 'invalid_class_name', detail: `class_name must be up to ${MAX_NAME_LEN} characters.` } };
  }

  const dryRun = boolOrUndefined(b.dry_run);
  if (typeof dryRun === 'string') {
    return { ok: false, failure: { error: 'invalid_dry_run', detail: 'dry_run must be true or false.' } };
  }

  return { ok: true, value: { property, class_id: classId, class_name: className, dry_run: dryRun === true } };
}

export interface SetPropertyClassPayload {
  property: string;
  class_id: string;
  class_name: string | null;
  dry_run: boolean;
}
