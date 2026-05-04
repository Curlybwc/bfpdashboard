import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/auth.ts";

/**
 * Returns a short-lived signed URL for a receipt file.
 * Authorization: caller must be the reimbursement submitter, the on-behalf-of user,
 * or an admin in the same org.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { reimbursement_id, path } = await req.json() as { reimbursement_id?: string; path?: string };
    if (!reimbursement_id || !path) {
      return new Response(JSON.stringify({ error: "bad_request", message: "reimbursement_id and path required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Look up reimbursement and verify access
    const { data: reimb } = await adminClient
      .from("reimbursement_requests")
      .select("id, org_id, submitter_user_id, on_behalf_of_user_id, receipt_paths")
      .eq("id", reimbursement_id)
      .maybeSingle();

    if (!reimb) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!reimb.receipt_paths?.includes(path)) {
      return new Response(JSON.stringify({ error: "path_not_in_reimbursement" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization: submitter, on-behalf-of, or admin in same org
    const isOwner = reimb.submitter_user_id === userId || reimb.on_behalf_of_user_id === userId;
    let isAdmin = false;
    if (!isOwner) {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("is_admin, org_id")
        .eq("id", userId)
        .maybeSingle();
      isAdmin = !!(profile?.is_admin && profile?.org_id === reimb.org_id);
    }

    if (!isOwner && !isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: signed, error: signErr } = await adminClient.storage
      .from("reimbursement-receipts")
      .createSignedUrl(path, 600);

    if (signErr || !signed) {
      return new Response(JSON.stringify({ error: "sign_failed", message: signErr?.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: signed.signedUrl, expires_in: 600 }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "internal", message: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});