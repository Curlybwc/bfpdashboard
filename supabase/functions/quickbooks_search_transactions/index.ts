import { corsHeaders, requireAdminAuth } from "../_shared/auth.ts";
import { getConnectionForCompany, qbApiFetch } from "../_shared/quickbooks.ts";

/**
 * Search QuickBooks for already-paid transaction types (Purchase, Check, BillPayment).
 * Admin-only. Returns normalized list for matching to local worker_payments.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { adminClient } = await requireAdminAuth(req);

    const body = await req.json();
    const {
      company_id,
      vendor_id,
      from_date,
      to_date,
      min_amount,
      max_amount,
    } = body as {
      company_id: string;
      vendor_id?: string;
      from_date?: string;
      to_date?: string;
      min_amount?: number;
      max_amount?: number;
    };

    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "bad_request", message: "company_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { conn, error: connErr } = await getConnectionForCompany(adminClient, company_id);
    if (!conn) {
      return new Response(
        JSON.stringify({ error: "no_connection", message: connErr || "Cannot resolve QuickBooks connection." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Search Purchase, Check, BillPayment types
    const txnTypes = ["Purchase", "Check", "BillPayment"];
    const allResults: Array<{
      id: string;
      type: string;
      txn_date: string;
      amount: number;
      vendor_name: string | null;
      memo: string | null;
      doc_number: string | null;
    }> = [];

    for (const txnType of txnTypes) {
      const conditions: string[] = [];

      if (from_date) conditions.push(`TxnDate >= '${from_date}'`);
      if (to_date) conditions.push(`TxnDate <= '${to_date}'`);

      if (txnType === "Purchase") {
        // Purchases have EntityRef for vendor
        if (vendor_id) conditions.push(`EntityRef = '${vendor_id}'`);
        if (min_amount !== undefined) conditions.push(`TotalAmt >= '${min_amount}'`);
        if (max_amount !== undefined) conditions.push(`TotalAmt <= '${max_amount}'`);
      } else if (txnType === "Check") {
        if (vendor_id) conditions.push(`EntityRef = '${vendor_id}'`);
        if (min_amount !== undefined) conditions.push(`TotalAmt >= '${min_amount}'`);
        if (max_amount !== undefined) conditions.push(`TotalAmt <= '${max_amount}'`);
      } else if (txnType === "BillPayment") {
        if (vendor_id) conditions.push(`VendorRef = '${vendor_id}'`);
        if (min_amount !== undefined) conditions.push(`TotalAmt >= '${min_amount}'`);
        if (max_amount !== undefined) conditions.push(`TotalAmt <= '${max_amount}'`);
      }

      const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
      const query = `SELECT * FROM ${txnType}${whereClause} ORDERBY TxnDate DESC MAXRESULTS 50`;

      const result = await qbApiFetch(
        conn,
        "GET",
        `/query?query=${encodeURIComponent(query)}`,
      );

      if (result.ok && result.data) {
        const response = result.data as any;
        const rows = response?.QueryResponse?.[txnType] || [];

        for (const row of rows) {
          let vendorName: string | null = null;
          if (txnType === "BillPayment") {
            vendorName = row.VendorRef?.name || null;
          } else {
            vendorName = row.EntityRef?.name || null;
          }

          allResults.push({
            id: row.Id,
            type: txnType,
            txn_date: row.TxnDate || "",
            amount: Number(row.TotalAmt || 0),
            vendor_name: vendorName,
            memo: row.PrivateNote || row.Memo || null,
            doc_number: row.DocNumber || null,
          });
        }
      }
    }

    // Sort by date descending
    allResults.sort((a, b) => b.txn_date.localeCompare(a.txn_date));

    return new Response(
      JSON.stringify({ transactions: allResults }),
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
