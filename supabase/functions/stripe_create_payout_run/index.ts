import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, requireAdminAuth } from "../_shared/auth.ts";

interface WorkerSnapshotInput {
  worker_user_id?: string;
  amount?: number;
  memo?: string | null;
}

interface RequestBody {
  period_start?: string;
  period_end?: string;
  notes?: string | null;
  workers?: WorkerSnapshotInput[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, adminClient } = await requireAdminAuth(req);
    const body = (await req.json()) as RequestBody;

    if (!body.period_start || !body.period_end) {
      return new Response(JSON.stringify({
        error: "invalid_request",
        message: "period_start and period_end are required",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const workerRows = (body.workers || [])
      .filter((w) => !!w.worker_user_id && typeof w.amount === "number" && (w.amount || 0) > 0)
      .map((w) => ({
        worker_user_id: w.worker_user_id as string,
        amount: Number((w.amount as number).toFixed(2)),
        memo: w.memo || null,
      }));

    if (workerRows.length === 0) {
      return new Response(JSON.stringify({
        error: "invalid_request",
        message: "workers must include at least one positive amount",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const dedupMap = new Map<string, { amount: number; memo: string | null }>();
    for (const row of workerRows) {
      const existing = dedupMap.get(row.worker_user_id);
      if (existing) {
        dedupMap.set(row.worker_user_id, {
          amount: Number((existing.amount + row.amount).toFixed(2)),
          memo: existing.memo || row.memo,
        });
      } else {
        dedupMap.set(row.worker_user_id, { amount: row.amount, memo: row.memo });
      }
    }

    const dedupWorkerIds = [...dedupMap.keys()];
    const { data: profiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("id")
      .in("id", dedupWorkerIds);

    if (profilesError) {
      return new Response(JSON.stringify({ error: "worker_lookup_failed", message: profilesError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validIds = new Set((profiles || []).map((p) => p.id));
    const unknownIds = dedupWorkerIds.filter((id) => !validIds.has(id));
    if (unknownIds.length > 0) {
      return new Response(JSON.stringify({
        error: "invalid_workers",
        message: "Some worker_user_id values are not valid profiles",
        unknown_worker_ids: unknownIds,
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: run, error: runError } = await adminClient
      .from("payout_runs")
      .insert({
        period_start: body.period_start,
        period_end: body.period_end,
        payout_date: null,
        status: "draft",
        notes: body.notes || null,
        created_by: userId,
      })
      .select("*")
      .single();

    if (runError || !run) {
      return new Response(JSON.stringify({ error: "run_create_failed", message: runError?.message || "Failed to create payout run" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paymentsToInsert = dedupWorkerIds.map((workerId) => {
      const snapshot = dedupMap.get(workerId)!;
      return {
        worker_user_id: workerId,
        payout_run_id: run.id,
        pay_period_start: body.period_start,
        pay_period_end: body.period_end,
        paid_date: body.period_end,
        amount: snapshot.amount,
        payment_source: "stripe_connect" as const,
        status: "pending" as const,
        stripe_transfer_id: null,
        stripe_payout_id: null,
        stripe_balance_transaction_id: null,
        external_reference: null,
        memo: snapshot.memo,
        created_by: userId,
      };
    });

    const { data: payments, error: paymentsError } = await adminClient
      .from("worker_payments")
      .insert(paymentsToInsert)
      .select("*");

    if (paymentsError) {
      await adminClient.from("payout_runs").delete().eq("id", run.id);
      return new Response(JSON.stringify({ error: "snapshot_create_failed", message: paymentsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      payout_run: run,
      worker_payments: payments || [],
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Response) return error;

    return new Response(JSON.stringify({
      error: "internal_error",
      message: error instanceof Error ? error.message : "Unknown server error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
