// Agent API — read-only external endpoint for Jen's AI agent.
// Auth: Authorization: Bearer <AGENT_API_KEY> (project secret, revocable in Project Settings → Secrets).
// Phase 1: read-only. Any non-GET method is rejected.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Read-only: hard reject anything that isn't GET.
  if (req.method !== 'GET') {
    return json({ error: 'This endpoint is read-only. Only GET requests are allowed.' }, 405);
  }

  const expectedKey = Deno.env.get('AGENT_API_KEY');
  if (!expectedKey) {
    return json({ error: 'Agent API key is not configured on the server.' }, 503);
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!provided || !safeEqual(provided, expectedKey)) {
    return json({ error: 'Unauthorized. Provide Authorization: Bearer <key>.' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

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
      default:
        return json({
          error: `Unknown resource "${resource}".`,
          available: ['bills', 'projects', 'tasks', 'time-entries'],
          usage: 'GET ?resource=bills&from=2026-09-01&to=2026-09-30&worker=Jen',
        }, 400);
    }
  } catch (err) {
    return json({ error: 'Query failed', detail: String((err as Error)?.message ?? err) }, 500);
  }
});

type Filters = { from: string | null; to: string | null; worker?: string | null; project?: string | null };

async function resolveWorkerIds(supabase: any, worker: string | null | undefined): Promise<string[] | null> {
  if (!worker) return null;
  // UUID passed directly
  if (/^[0-9a-f-]{36}$/i.test(worker)) return [worker];
  const { data, error } = await supabase.from('profiles').select('id, full_name').ilike('full_name', `%${worker}%`);
  if (error) throw error;
  return (data ?? []).map((p: any) => p.id);
}

async function resolveProjectIds(supabase: any, project: string | null | undefined): Promise<string[] | null> {
  if (!project) return null;
  if (/^[0-9a-f-]{36}$/i.test(project)) return [project];
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
    .select('id, worker_user_id, project_id, company_id, period_start, period_end, total_amount, status, paid_at, qb_bill_doc_number, settlement_method, accounting_source, created_at')
    .order('created_at', { ascending: false });
  if (workerIds) batchQ = batchQ.in('worker_user_id', workerIds);
  if (projectIds) batchQ = batchQ.in('project_id', projectIds);
  if (f.from) batchQ = batchQ.gte('period_end', f.from);
  if (f.to) batchQ = batchQ.lte('period_start', f.to);

  // Direct worker payments
  let payQ = supabase
    .from('worker_payments')
    .select('id, worker_user_id, project_id, company_id, amount, status, paid_date, payment_source, external_reference, memo, pay_period_start, pay_period_end, qb_txn_type')
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
  const classByProject = new Map((classRes.data ?? []).map((c: any) => [c.project_id, { id: c.qb_class_id, name: c.qb_class_name }]));

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
      status: p.status,
      paid_at: p.paid_date,
      qb_bill_doc_number: p.external_reference,
      settlement_method: p.payment_source,
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
    .select('id, task, stage, priority, project_id, assigned_to_user_id, due_date, is_blocked, is_flat_rate, flat_rate_amount, actual_total_cost, created_at')
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
    .select('id, user_id, project_id, shift_date, start_time, end_time, total_hours, hourly_rate_snapshot, is_flat_rate, flat_rate_amount, created_at')
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
    start_time: s.start_time,
    end_time: s.end_time,
    hours: s.total_hours === null ? null : Number(s.total_hours),
    is_flat_rate: !!s.is_flat_rate,
    flat_rate_amount: s.flat_rate_amount === null ? null : Number(s.flat_rate_amount),
    hourly_rate: s.hourly_rate_snapshot === null ? null : Number(s.hourly_rate_snapshot),
  }));
  return { count: entries.length, time_entries: entries };
}
