import { corsHeaders, requireAdminAuth } from "../_shared/auth.ts";
import { getConnectionForCompany, qbApiFetch } from "../_shared/quickbooks.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { adminClient } = await requireAdminAuth(req);

    const body = await req.json();
    const companyId = body?.company_id;
    const rawTerm = body?.search_term || "";

    if (!companyId) {
      return new Response(
        JSON.stringify({ error: "missing_company_id", message: "company_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await getConnectionForCompany(adminClient, companyId);
    if (!result.conn) {
      return new Response(
        JSON.stringify({ error: "no_connection", message: result.error || "No active QuickBooks connection." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Sanitize search term: strip control chars, escape single quotes, limit length
    const sanitized = rawTerm
      .replace(/[\x00-\x1f\x7f]/g, "")
      .replace(/'/g, "\\'")
      .slice(0, 100)
      .trim();

    let query: string;
    if (sanitized) {
      query = encodeURIComponent(
        `SELECT Id, DisplayName, PrimaryEmailAddr, PrimaryPhone, BillAddr FROM Vendor WHERE Active = true AND DisplayName LIKE '%${sanitized}%' MAXRESULTS 50`
      );
    } else {
      query = encodeURIComponent(
        "SELECT Id, DisplayName, PrimaryEmailAddr, PrimaryPhone, BillAddr FROM Vendor WHERE Active = true MAXRESULTS 50"
      );
    }

    const qbResult = await qbApiFetch(result.conn, "GET", `/query?query=${query}`);

    if (!qbResult.ok) {
      return new Response(
        JSON.stringify({ error: "qb_api_error", message: qbResult.error || `QB API error (${qbResult.status})` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const responseData = qbResult.data as any;
    const rawVendors = responseData?.QueryResponse?.Vendor || [];

    const vendors = rawVendors.map((v: any) => ({
      id: v.Id,
      display_name: v.DisplayName || v.Id,
      email: v.PrimaryEmailAddr?.Address || null,
      phone: v.PrimaryPhone?.FreeFormNumber || null,
      city: v.BillAddr?.City || null,
      state: v.BillAddr?.CountrySubDivisionCode || null,
      line1: v.BillAddr?.Line1 || null,
      line2: v.BillAddr?.Line2 || null,
      postal_code: v.BillAddr?.PostalCode || null,
      country: v.BillAddr?.Country || null,
    }));

    return new Response(
      JSON.stringify({ vendors }),
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
