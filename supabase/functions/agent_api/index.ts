// Agent API — external endpoint for Jen's AI agent.
// Auth: Authorization: Bearer <AGENT_API_KEY> (project secret, revocable in Project Settings → Secrets).
//
// Phase 1 (reads, GET ?resource=...): bills, projects, tasks, time-entries.
// Phase 2 (writes, POST {action}): set_property_class, create_task.
//   Writes stay off until the AGENT_API_ALLOW_WRITES secret is set to "true".
//   Every write is validated before anything is saved, and nothing is ever
//   guessed for you: an ambiguous QuickBooks class is never auto-selected.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getConnectionForCompany, checkQBRef } from '../_shared/quickbooks.ts';
import { validateCreateTask, validateSetPropertyClass, type ValidationFailure } from './validation.ts';
import { NEW_ACTIONS, handleNewWrite, InputError, getWorkers, getVendors } from './write-expansion.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const RESOURCE_LIST = ['bills', 'projects', 'tasks', 'time-entries', 'workers', 'vendors'];
const ACTION_LIST = ['set_property_class', 'create_task', ...NEW_ACTIONS];

const UUID_RE = /^[0-9a-f-]{36}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Constant-time string compare to avoid leaking the key via timing.
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ba.length, bb.length);
  let diff = ba.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ba[i % ba.length] ?? 0) ^ (bb[i % bb.length] ?? 0);
  }
  return diff === 0;
}

function fail(f: ValidationFailure, status = 400) {
  return json(
    { error: f.error, message: f.detail, ...(f.hint ? { hint: f.hint } : {}) },
    status,
  );
}

function authFailure(message: string, status = 401) {
  return json({ error: status === 401 ? 'unauthorized' : 'writes_disabled', message }, status);
}

// Each agent key is independent: removing one never affects the other.
const AGENT_KEYS: Array<{ name: string; secret: string }> = [
  { name: 'primary', secret: 'AGENT_API_KEY' },
  { name: 'samantha', secret: 'AGENT_API_KEY_SAMANTHA' },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const configured = AGENT_KEYS
    .map((k) => ({ name: k.name, value: (Deno.env.get(k.secret) ?? '').trim() }))
    .filter((k) => k.value.length > 0);
  if (configured.length === 0) {
    return json({ error: 'Agent API key is not configured on the server.' }, 503);
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  let keyName: string | null = null;
  if (provided) {
    for (const k of configured) {
      if (safeEqual(provided, k.value) && !keyName) keyName = k.name;
    }
  }
  if (!keyName) {
    return json({ error: 'Unauthorized. Provide Authorization: Bearer <key>.' }, 401);
  }

  const res = await route(req);
  res.headers.set('X-Agent-Key', keyName);
  return res;
});

async function route(req: Request): Promise<Response> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  if (req.method === 'POST') return handleWrite(supabase, req);
  if (req.method !== 'GET') {
    return json({ error: 'Unsupported method. Use GET to read or POST to write.' }, 405);
  }

  const url = new URL(req.url);
  const resource = url.searchParams.get('resource') ?? '';
  const from = url.searchParams.get('from'); // YYYY-MM-DD
  const to = url.searchParams.get('to');     // YYYY-MM-DD
  const worker = url.searchParams.get('worker');   // profile id or (partial) name
  const project = url.searchParams.get('project'); // project id or (partial) name

  try {
    switch (resource) {
      case 'bills':
        return json(await getBills(supabase, { from, to, worker, project }));
      case 'projects':
        return json(await getProjects(supabase));
      case 'tasks':
        return json(await getTasks(supabase, { project }));
      case 'time-entries':
        return json(await getTimeEntries(supabase, { from, to, worker, project }));
      case 'workers':
        return json(await getWorkers(supabase, worker));
      case 'vendors':
        return json(await getVendors(supabase, url.searchParams.get('vendor'), url.searchParams.get('company')));
      default:
        return json({
          error: `Unknown resource "${resource}".`,
          available: RESOURCE_LIST,
          usage: 'GET ?resource=bills&from=2026-09-01&to=2026-09-30&worker=Jen',
        }, 400);
    }
  } catch (err) {
    return json({ error: 'Query failed', detail: String((err as Error)?.message ?? err) }, 500);
  }
}

// ---------- Phase 2: writes ----------

async function handleWrite(supabase: any, req: Request): Promise<Response> {
  if (Deno.env.get('AGENT_API_ALLOW_WRITES') !== 'true') {
    return authFailure(
      'Writes are turned off for this endpoint. Set the AGENT_API_ALLOW_WRITES secret to "true" in Project Settings → Secrets to enable them.',
      403,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_body', message: 'Request body must be JSON.' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'invalid_body', message: 'Request body must be a JSON object.' }, 400);
  }
  const action = (body as Record<string, unknown>).action;
  if (typeof action !== 'string') {
    return json({
      error: 'missing_action',
      message: 'Body must include an action.',
      available: ACTION_LIST,
      usage: 'POST {action:"create_task", project:"1428 Ramona", title:"Replace faucet", stage:"Ready"}',
      hint: 'Add dry_run:true to any write to see what would change without saving anything.',
    }, 400);
  }

  try {
    switch (action) {
      case 'set_property_class':
        return await setPropertyClass(supabase, body);
      case 'create_task':
        return await createTask(supabase, body);
      default:
        if (NEW_ACTIONS.includes(action)) return json(await handleNewWrite(supabase, body as Record<string, unknown>));
        return json({ error: `Unknown action "${action}".`, available: ACTION_LIST }, 400);
    }
  } catch (err) {
    if (err instanceof InputError) return json({ error: err.code, message: err.message }, err.status);
    return json({ error: 'write_failed', detail: String((err as Error)?.message ?? err) }, 500);
  }
}

/** Link a property (project) to an exact QuickBooks class id. */
async function setPropertyClass(supabase: any, body: unknown): Promise<Response> {
  const v = validateSetPropertyClass(body);
  if (!v.ok) return fail(v.failure);
  const { property, class_id: classId, dry_run: dryRun } = v.value;

  const resolved = await resolveOneProject(supabase, property);
  if ('error' in resolved) return fail(resolved.error, resolved.status);
  const proj = resolved.project;

  const { data: companyRow, error: companyErr } = await supabase
    .from('projects')
    .select('company_id')
    .eq('id', proj.id)
    .maybeSingle();
  if (companyErr) throw companyErr;
  if (!companyRow?.company_id) {
    return fail({
      error: 'property_has_no_company',
      detail: `"${proj.name}" is not assigned to a company, so the endpoint cannot know which QuickBooks company this class must exist in. Nothing was changed.`,
    });
  }

  const { conn, error: connError } = await getConnectionForCompany(supabase, companyRow.company_id);
  if (!conn) {
    return fail({
      error: 'quickbooks_not_connected',
      detail: `${connError ?? 'QuickBooks is not connected for this company.'} Nothing was changed.`,
    }, 409);
  }

  // The class must exist and be active in THAT company — realm-scoped, so a
  // class id from another QuickBooks company can never be saved here.
  const check = await checkQBRef(conn, 'Class', classId);
  if (!check.ok) {
    if (check.apiError) {
      return fail({ error: 'quickbooks_unreachable', detail: `Could not verify the class in QuickBooks: ${check.apiError} Nothing was changed.` }, 502);
    }
    if (check.inactive) {
      return fail({ error: 'class_inactive', detail: `QuickBooks class ${classId} (${check.name ?? 'name unknown'}) is inactive in this company. Nothing was changed.` }, 409);
    }
    return fail({
      error: 'class_not_found',
      detail: `QuickBooks class id ${classId} does not exist in the QuickBooks company for "${proj.name}". Nothing was changed.`,
      hint: 'Class ids are company-specific. Pick the exact id for this company — when a property has more than one possible class, one must be chosen by a person.',
    }, 409);
  }

  const className = check.name ?? null;
  if (dryRun) {
    return json({
      dry_run: true,
      would_save: { project_id: proj.id, property: proj.name, qb_class_id: classId, qb_class_name: className },
      saved: false,
    });
  }

  const { error: upErr } = await supabase
    .from('quickbooks_class_mappings')
    .upsert({ project_id: proj.id, qb_class_id: classId, qb_class_name: className }, { onConflict: 'project_id' });
  if (upErr) throw upErr;

  // Read the mapping back so the caller sees what is actually stored.
  const { data: saved, error: readErr } = await supabase
    .from('quickbooks_class_mappings')
    .select('project_id, qb_class_id, qb_class_name, verified_at')
    .eq('project_id', proj.id)
    .maybeSingle();
  if (readErr) throw readErr;

  return json({
    saved: true,
    property: proj.name,
    project_id: proj.id,
    quickbooks_class: saved ?? { qb_class_id: classId, qb_class_name: className },
    note: 'This class applies to bills pushed from now on. Already-exported bills were not changed.',
  });
}

/** Create a task on a property, exactly the way the app's own task form does. */
async function createTask(supabase: any, body: unknown): Promise<Response> {
  const clientRef = (body as Record<string, unknown>).client_ref;
  if (clientRef !== undefined && (typeof clientRef !== 'string' || !clientRef.trim() || clientRef.trim().length > 200)) {
    return fail({error:'invalid_client_ref',detail:'client_ref must be a nonempty string up to 200 characters.'});
  }
  const v = validateCreateTask(body);
  if (!v.ok) return fail(v.failure);
  const p = v.value;

  if (typeof clientRef === 'string') {
    const {data: existing,error} = await supabase.from('tasks').select('id, task, stage, priority, due_date, trade, assigned_to_user_id, created_by, project_id, created_at').eq('client_ref',clientRef.trim()).maybeSingle();
    if(error) throw error;
    if(existing) {
      const project = await supabase.from('projects').select('name').eq('id',existing.project_id).maybeSingle();
      const worker = existing.assigned_to_user_id ? await supabase.from('profiles').select('full_name').eq('id',existing.assigned_to_user_id).maybeSingle() : null;
      const task = {...existing,property:project.data?.name??null,assigned_to:worker?.data?.full_name??null};
      return json(p.dry_run ? {dry_run:true,would_save:task,saved:false,duplicate:true} : {saved:false,task,duplicate:true});
    }
  }

  const resolved = await resolveOneProject(supabase, p.project);
  if ('error' in resolved) return fail(resolved.error, resolved.status);
  const proj = resolved.project;

  let assigneeId: string | null = null;
  if (p.worker) {
    const w = await resolveOneProfile(supabase, p.worker);
    if ('error' in w) return fail(w.error, w.status);
    assigneeId = w.profile.id;
  }

  // created_by must be a real user; fall back to an administrator.
  let creatorId: string | null = null;
  if (p.created_by) {
    if (!UUID_RE.test(p.created_by)) {
      return fail({ error: 'invalid_created_by', detail: 'created_by must be a user id (a UUID).' });
    }
    const { data: creator, error: creatorErr } = await supabase
      .from('profiles')
      .select('id, full_name, is_admin')
      .eq('id', p.created_by)
      .maybeSingle();
    if (creatorErr) throw creatorErr;
    if (!creator) return fail({ error: 'created_by_not_found', detail: `No user matches created_by ${p.created_by}.` }, 404);
    creatorId = creator.id;
  } else {
    const { data: adminRow, error: adminErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_admin', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (adminErr) throw adminErr;
    if (!adminRow) {
      return fail({ error: 'no_admin_user', detail: 'No administrator exists to credit the task to. Pass created_by with a user id.' }, 500);
    }
    creatorId = adminRow.id;
  }

  if (p.dry_run) {
    return json({
      dry_run: true,
      would_save: {
        project_id: proj.id,
        property: proj.name,
        task: p.title,
        stage: p.stage,
        priority: p.priority,
        materials_on_site: p.materials_on_site,
        due_date: p.due_date,
        trade: p.trade,
        assigned_to_user_id: assigneeId,
        created_by: creatorId,
      },
      saved: false,
    });
  }

  const { data: created, error: insertErr } = await supabase
    .from('tasks')
    .insert({
      project_id: proj.id,
      task: p.title,
      stage: p.stage,
      priority: p.priority,
      materials_on_site: p.materials_on_site,
      due_date: p.due_date,
      trade: p.trade,
      assigned_to_user_id: assigneeId,
      created_by: creatorId,
      assignment_mode: 'solo',
      ...(typeof clientRef === 'string' ? {client_ref:clientRef.trim()} : {}),
    } as never)
    .select('id, task, stage, priority, due_date, trade, assigned_to_user_id, created_by, project_id, created_at')
    .single();
  if (insertErr?.code === '23505' && typeof clientRef === 'string') return createTask(supabase, body);
  if (insertErr) throw insertErr;

  const workerName = assigneeId
    ? (await supabase.from('profiles').select('full_name').eq('id', assigneeId).maybeSingle())?.data?.full_name ?? null
    : null;

  return json({
    saved: true,
    task: {
      ...created,
      property: proj.name,
      assigned_to: workerName,
    },
  });
}

// ---------- resolution helpers (writes) ----------

type ProjectRow = { id: string; name: string; status: string | null };
type ProfileRow = { id: string; full_name: string | null; is_active?: boolean };

async function resolveOneProject(
  supabase: any,
  value: string,
): Promise<{ project: ProjectRow } | { error: ValidationFailure; status: number }> {
  let q = supabase.from('projects').select('id, name, status');
  q = UUID_RE.test(value) ? q.eq('id', value) : q.ilike('name', `%${value}%`);
  const { data, error } = await q.limit(5);
  if (error) throw error;
  const rows = (data ?? []) as ProjectRow[];
  if (rows.length === 0) {
    return { status: 404, error: { error: 'property_not_found', detail: `No property matches "${value}". Nothing was changed.` } };
  }
  if (rows.length > 1) {
    return {
      status: 409,
      error: {
        error: 'property_ambiguous',
        detail: `"${value}" matches more than one property. Nothing was changed.`,
        hint: `Use one of these ids: ${rows.map((r) => `${r.id} (${r.name})`).join(', ')}`,
      },
    };
  }
  return { project: rows[0] };
}

async function resolveOneProfile(
  supabase: any,
  value: string,
): Promise<{ profile: ProfileRow } | { error: ValidationFailure; status: number }> {
  let q = supabase.from('profiles').select('id, full_name, is_active');
  q = UUID_RE.test(value) ? q.eq('id', value) : q.ilike('full_name', `%${value}%`);
  const { data, error } = await q.limit(5);
  if (error) throw error;
  const rows = (data ?? []) as ProfileRow[];
  if (rows.length === 0) {
    return { status: 404, error: { error: 'worker_not_found', detail: `No user matches "${value}". Nothing was changed.` } };
  }
  if (rows.length > 1) {
    return {
      status: 409,
      error: {
        error: 'worker_ambiguous',
        detail: `"${value}" matches more than one user. Nothing was changed.`,
        hint: `Use one of these ids: ${rows.map((r) => `${r.id} (${r.full_name ?? 'unnamed'})`).join(', ')}`,
      },
    };
  }
  return { profile: rows[0] };
}

// ---------- Phase 1: reads (unchanged) ----------

type Filters = { from?: string | null; to?: string | null; worker?: string | null; project?: string | null };

async function resolveWorkerIds(supabase: any, worker: string | null | undefined): Promise<string[] | null> {
  if (!worker) return null;
  // UUID passed directly
  if (UUID_RE.test(worker)) return [worker];
  const { data, error } = await supabase.from('profiles').select('id, full_name').ilike('full_name', `%${worker}%`);
  if (error) throw error;
  return (data ?? []).map((p: any) => p.id);
}

async function resolveProjectIds(supabase: any, project: string | null | undefined): Promise<string[] | null> {
  if (!project) return null;
  if (UUID_RE.test(project)) return [project];
  const { data, error } = await supabase.from('projects').select('id, name').ilike('name', `%${project}%`);
  if (error) throw error;
  return (data ?? []).map((p: any) => p.id);
}

async function getBills(supabase: any, f: Filters) {
  const workerIds = await resolveWorkerIds(supabase, f.worker);
  const projectIds = await resolveProjectIds(supabase, f.project);

  // Payroll bills (batches)
  let batchQ = supabase
    .from('worker_payable_batches')
    .select('id, worker_user_id, project_id, company_id, period_start, period_end, total_amount, status, paid_at, qb_bill_doc_number, settlement_method, accounting_source, created_at, purpose, invoice_no')
    .order('created_at', { ascending: false });
  if (workerIds) batchQ = batchQ.in('worker_user_id', workerIds);
  if (projectIds) batchQ = batchQ.in('project_id', projectIds);
  if (f.from) batchQ = batchQ.gte('period_end', f.from);
  if (f.to) batchQ = batchQ.lte('period_start', f.to);

  // Direct worker payments
  let payQ = supabase
    .from('worker_payments')
    .select('id, worker_user_id, project_id, company_id, amount, status, paid_date, payment_source, external_reference, memo, pay_period_start, pay_period_end, qb_txn_type, purpose, invoice_no, settlement_method')
    .order('paid_date', { ascending: false });
  if (workerIds) payQ = payQ.in('worker_user_id', workerIds);
  if (projectIds) payQ = payQ.in('project_id', projectIds);
  if (f.from) payQ = payQ.gte('paid_date', f.from);
  if (f.to) payQ = payQ.lte('paid_date', f.to);

  const [batchRes, payRes, profilesRes, projectsRes, classRes] = await Promise.all([
    batchQ,
    payQ,
    supabase.from('profiles').select('id, full_name'),
    supabase.from('projects').select('id, name'),
    supabase.from('quickbooks_class_mappings').select('project_id, qb_class_id, qb_class_name'),
  ]);
  if (batchRes.error) throw batchRes.error;
  if (payRes.error) throw payRes.error;

  const workerName = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p.full_name ?? 'Unknown']));
  const projectName = new Map((projectsRes.data ?? []).map((p: any) => [p.id, p.name]));
  const classByProject = new Map<string, { id: string; name: string | null }>(
    (classRes.data ?? []).map((c: any) => [c.project_id as string, { id: c.qb_class_id as string, name: c.qb_class_name as string | null }]),
  );

  const bills = [
    ...(batchRes.data ?? []).map((b: any) => ({
      kind: 'payroll_bill',
      id: b.id,
      worker: workerName.get(b.worker_user_id) ?? 'Unknown',
      worker_id: b.worker_user_id,
      property: b.project_id ? (projectName.get(b.project_id) ?? 'Unknown project') : null,
      project_id: b.project_id,
      quickbooks_class: b.project_id ? (classByProject.get(b.project_id)?.name ?? null) : null,
      quickbooks_class_id: b.project_id ? (classByProject.get(b.project_id)?.id ?? null) : null,
      period_start: b.period_start,
      period_end: b.period_end,
      amount: Number(b.total_amount),
      purpose: b.purpose,
      invoice_no: b.invoice_no,
      status: b.status,
      paid_at: b.paid_at,
      qb_bill_doc_number: b.qb_bill_doc_number,
      settlement_method: b.settlement_method ?? b.accounting_source ?? null,
    })),
    ...(payRes.data ?? []).map((p: any) => ({
      kind: 'worker_payment',
      id: p.id,
      worker: workerName.get(p.worker_user_id) ?? 'Unknown',
      worker_id: p.worker_user_id,
      property: p.project_id ? (projectName.get(p.project_id) ?? 'Unknown project') : null,
      project_id: p.project_id,
      quickbooks_class: p.project_id ? (classByProject.get(p.project_id)?.name ?? null) : null,
      quickbooks_class_id: p.project_id ? (classByProject.get(p.project_id)?.id ?? null) : null,
      period_start: p.pay_period_start,
      period_end: p.pay_period_end,
      amount: Number(p.amount),
      purpose: p.purpose,
      invoice_no: p.invoice_no,
      status: p.status,
      paid_at: p.paid_date,
      qb_bill_doc_number: p.external_reference,
      settlement_method: p.payment_source,
      recorded_settlement_method: p.settlement_method,
    })),
  ];

  return { count: bills.length, bills };
}

async function getProjects(supabase: any) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, status, company_id, property_id, created_at')
    .order('name');
  if (error) throw error;
  return { count: data?.length ?? 0, projects: data ?? [] };
}

async function getTasks(supabase: any, f: Filters) {
  const projectIds = await resolveProjectIds(supabase, f.project);
  let q = supabase
    .from('tasks')
    .select('id, task, stage, priority, project_id, assigned_to_user_id, due_date, is_blocked, actual_total_cost, created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (projectIds) q = q.in('project_id', projectIds);
  const { data, error } = await q;
  if (error) throw error;
  return { count: data?.length ?? 0, tasks: data ?? [] };
}

async function getTimeEntries(supabase: any, f: Filters) {
  const workerIds = await resolveWorkerIds(supabase, f.worker);
  const projectIds = await resolveProjectIds(supabase, f.project);
  let q = supabase
    .from('shifts')
    .select('id, user_id, project_id, shift_date, start_time, end_time, total_hours, hourly_rate_snapshot, is_flat_rate, flat_rate_amount, created_at, purpose, invoice_no, trade, client_ref')
    .order('shift_date', { ascending: false });
  if (workerIds) q = q.in('user_id', workerIds);
  if (projectIds) q = q.in('project_id', projectIds);
  if (f.from) q = q.gte('shift_date', f.from);
  if (f.to) q = q.lte('shift_date', f.to);
  const { data, error } = await q;
  if (error) throw error;

  const profilesRes = await supabase.from('profiles').select('id, full_name');
  const projectsRes = await supabase.from('projects').select('id, name');
  const workerName = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p.full_name ?? 'Unknown']));
  const projectName = new Map((projectsRes.data ?? []).map((p: any) => [p.id, p.name]));

  const entries = (data ?? []).map((s: any) => ({
    id: s.id,
    worker: workerName.get(s.user_id) ?? 'Unknown',
    worker_id: s.user_id,
    property: projectName.get(s.project_id) ?? 'Unknown project',
    project_id: s.project_id,
    date: s.shift_date,
    purpose: s.purpose,
    invoice_no: s.invoice_no,
    trade: s.trade,
    client_ref: s.client_ref,
    start_time: s.start_time,
    end_time: s.end_time,
    hours: s.total_hours === null ? null : Number(s.total_hours),
    is_flat_rate: !!s.is_flat_rate,
    flat_rate_amount: s.flat_rate_amount === null ? null : Number(s.flat_rate_amount),
    hourly_rate: s.hourly_rate_snapshot === null ? null : Number(s.hourly_rate_snapshot),
  }));
  return { count: entries.length, time_entries: entries };
}
