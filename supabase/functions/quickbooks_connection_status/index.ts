import { corsHeaders, requireAdminAuth } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { adminClient } = await requireAdminAuth(req);

    // Return ALL active connections (multi-company support)
    const { data, error } = await adminClient
      .from("quickbooks_connections")
      .select("id, realm_id, company_name, connected_by, connected_at, disconnected_at, token_expires_at")
      .is("disconnected_at", null)
      .order("connected_at", { ascending: true });

    if (error) {
      return new Response(
        JSON.stringify({ error: "query_failed", message: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const connections = (data || []).map((row: any) => ({
      id: row.id,
      company_name: row.company_name,
      realm_id: row.realm_id,
      connected_at: row.connected_at,
      token_healthy: new Date(row.token_expires_at).getTime() > Date.now(),
    }));

    // Backward compat: also return top-level connected flag
    const first = connections[0] || null;

    return new Response(
      JSON.stringify({
        connected: connections.length > 0,
        company_name: first?.company_name || null,
        realm_id: first?.realm_id || null,
        connected_at: first?.connected_at || null,
        token_healthy: first?.token_healthy ?? false,
        connections,
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
