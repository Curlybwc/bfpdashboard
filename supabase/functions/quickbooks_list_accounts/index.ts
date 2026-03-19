import { corsHeaders, requireAdminAuth } from "../_shared/auth.ts";
import { getActiveConnection, getConnectionForCompany, qbApiFetch } from "../_shared/quickbooks.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { adminClient } = await requireAdminAuth(req);

    // Accept optional company_id to route to the correct QB connection
    let companyId: string | null = null;
    try {
      const body = await req.json();
      companyId = body?.company_id || null;
    } catch {
      // No body or invalid JSON — use legacy fallback
    }

    let conn;
    if (companyId) {
      const result = await getConnectionForCompany(adminClient, companyId);
      if (!result.conn) {
        return new Response(
          JSON.stringify({ error: "no_connection", message: result.error || "No active QuickBooks connection for this company." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      conn = result.conn;
    } else {
      conn = await getActiveConnection(adminClient);
      if (!conn) {
        return new Response(
          JSON.stringify({ error: "no_connection", message: "No active QuickBooks connection." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const query = encodeURIComponent(
      "SELECT Id, Name, FullyQualifiedName, AccountType, AccountSubType, Active FROM Account WHERE Active = true AND AccountType = 'Expense' MAXRESULTS 1000"
    );
    const result = await qbApiFetch(conn, "GET", `/query?query=${query}`);

    if (!result.ok) {
      return new Response(
        JSON.stringify({ error: "qb_api_error", message: result.error || `QB API error (${result.status})` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const responseData = result.data as any;
    const rawAccounts = responseData?.QueryResponse?.Account || [];

    const accounts = rawAccounts.map((a: any) => ({
      id: a.Id,
      name: a.Name,
      fully_qualified_name: a.FullyQualifiedName || a.Name,
      account_type: a.AccountType || null,
      account_sub_type: a.AccountSubType || null,
    }));

    return new Response(
      JSON.stringify({ accounts }),
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
