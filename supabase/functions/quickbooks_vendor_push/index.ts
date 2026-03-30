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

    // Guard: refuse push if already mapped
    if (vendor.quickbooks_vendor_id) {
      return new Response(
        JSON.stringify({ error: "already_mapped", message: "Vendor already mapped to QuickBooks. Use pull to refresh or unlink first." }),
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

    // Build QB vendor payload
    const qbVendorPayload: Record<string, any> = {
      DisplayName: vendor.name,
    };

    if (vendor.email) {
      qbVendorPayload.PrimaryEmailAddr = { Address: vendor.email };
    }
    if (vendor.phone) {
      qbVendorPayload.PrimaryPhone = { FreeFormNumber: vendor.phone };
    }

    const hasAddress = vendor.address_line_1 || vendor.city || vendor.state || vendor.postal_code;
    if (hasAddress) {
      qbVendorPayload.BillAddr = {
        Line1: vendor.address_line_1 || undefined,
        Line2: vendor.address_line_2 || undefined,
        City: vendor.city || undefined,
        CountrySubDivisionCode: vendor.state || undefined,
        PostalCode: vendor.postal_code || undefined,
        Country: vendor.country || "US",
      };
    }

    const qbResult = await qbApiFetch(
      connResult.conn,
      "POST",
      "/vendor",
      qbVendorPayload,
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

    const createdVendor = (qbResult.data as any)?.Vendor;
    if (!createdVendor?.Id) {
      await adminClient.from("vendors").update({
        quickbooks_sync_status: "error",
        quickbooks_last_error: "QB returned no vendor ID after create",
      }).eq("id", vendorId);

      return new Response(
        JSON.stringify({ error: "no_id", message: "QuickBooks did not return a vendor ID" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Save QB vendor ID back to local record
    const { error: updateError } = await adminClient
      .from("vendors")
      .update({
        quickbooks_vendor_id: createdVendor.Id,
        quickbooks_display_name: createdVendor.DisplayName || vendor.name,
        quickbooks_sync_status: "synced",
        quickbooks_last_synced_at: new Date().toISOString(),
        quickbooks_last_error: null,
      })
      .eq("id", vendorId);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "update_failed", message: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, quickbooks_vendor_id: createdVendor.Id }),
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
