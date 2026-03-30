import { corsHeaders, requireAdminAuth } from "../_shared/auth.ts";
import { getConnectionForCompany, qbApiFetch } from "../_shared/quickbooks.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { adminClient } = await requireAdminAuth(req);

    const body = await req.json();
    const vendorId = body?.vendor_id;

    if (!vendorId) {
      return new Response(
        JSON.stringify({ error: "missing_vendor_id", message: "vendor_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Read local vendor
    const { data: vendor, error: vendorError } = await adminClient
      .from("vendors")
      .select("*")
      .eq("id", vendorId)
      .maybeSingle();

    if (vendorError || !vendor) {
      return new Response(
        JSON.stringify({ error: "not_found", message: "Vendor not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!vendor.quickbooks_vendor_id) {
      return new Response(
        JSON.stringify({ error: "not_mapped", message: "Vendor is not mapped to a QuickBooks vendor" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const connResult = await getConnectionForCompany(adminClient, vendor.company_id);
    if (!connResult.conn) {
      await adminClient.from("vendors").update({
        quickbooks_sync_status: "error",
        quickbooks_last_error: connResult.error || "No QB connection",
      }).eq("id", vendorId);

      return new Response(
        JSON.stringify({ error: "no_connection", message: connResult.error }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const qbResult = await qbApiFetch(
      connResult.conn,
      "GET",
      `/vendor/${vendor.quickbooks_vendor_id}`,
    );

    if (!qbResult.ok) {
      const errMsg = qbResult.error || `QB API error (${qbResult.status})`;
      await adminClient.from("vendors").update({
        quickbooks_sync_status: "error",
        quickbooks_last_error: errMsg,
      }).eq("id", vendorId);

      return new Response(
        JSON.stringify({ error: "qb_api_error", message: errMsg }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const qbVendor = (qbResult.data as any)?.Vendor;
    if (!qbVendor) {
      await adminClient.from("vendors").update({
        quickbooks_sync_status: "error",
        quickbooks_last_error: "QB returned no vendor data",
      }).eq("id", vendorId);

      return new Response(
        JSON.stringify({ error: "no_data", message: "QuickBooks returned no vendor data" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const updateData = {
      name: qbVendor.DisplayName || vendor.name,
      email: qbVendor.PrimaryEmailAddr?.Address || null,
      phone: qbVendor.PrimaryPhone?.FreeFormNumber || null,
      address_line_1: qbVendor.BillAddr?.Line1 || null,
      address_line_2: qbVendor.BillAddr?.Line2 || null,
      city: qbVendor.BillAddr?.City || null,
      state: qbVendor.BillAddr?.CountrySubDivisionCode || null,
      postal_code: qbVendor.BillAddr?.PostalCode || null,
      country: qbVendor.BillAddr?.Country || "US",
      quickbooks_display_name: qbVendor.DisplayName || null,
      quickbooks_sync_status: "synced",
      quickbooks_last_synced_at: new Date().toISOString(),
      quickbooks_last_error: null,
    };

    const { error: updateError } = await adminClient
      .from("vendors")
      .update(updateData)
      .eq("id", vendorId);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "update_failed", message: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, updated_fields: Object.keys(updateData) }),
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
