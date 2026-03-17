import { corsHeaders, requireAdminAuth } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { adminClient } = await requireAdminAuth(req);

    const { data, error } = await adminClient
      .from("quickbooks_connections")
      .select("id, realm_id, company_name, connected_by, connected_at, disconnected_at, token_expires_at")
      .is("disconnected_at", null)
      .limit(1)
      .maybeSingle();

    if (error) {
      return new Response(
        JSON.stringify({ error: "query_failed", message: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!data) {
      return new Response(
        JSON.stringify({ connected: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tokenHealthy = new Date(data.token_expires_at).getTime() > Date.now();

    return new Response(
      JSON.stringify({
        connected: true,
        company_name: data.company_name,
        realm_id: data.realm_id,
        connected_at: data.connected_at,
        token_healthy: tokenHealthy,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    if (e instanceof Response) return e;
    return new Response(
      JSON.stringify({ error: "internal", message: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
