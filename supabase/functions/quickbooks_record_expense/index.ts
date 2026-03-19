import { corsHeaders, requireAdminAuth } from "../_shared/auth.ts";
import { getConnectionForCompany, qbApiFetch } from "../_shared/quickbooks.ts";

/**
 * Record a historical/external paid contractor transaction in QuickBooks.
 * Creates a QBO Purchase (Cash type) — no bill required.
 * Admin-only, server-side company routing.
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
      vendor_name,
      account_id,
      account_name,
      class_id,
      class_name,
      amount,
      payment_date,
      memo,
      project_id,
    } = body as {
      company_id: string;
      vendor_id: string;
      vendor_name?: string;
      account_id: string;
      account_name?: string;
      class_id?: string;
      class_name?: string;
      amount: number;
      payment_date: string;
      memo?: string;
      project_id?: string;
    };

    // Validate required fields
    if (!company_id) {
      return new Response(
        JSON.stringify({ error: "bad_request", message: "company_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!vendor_id) {
      return new Response(
        JSON.stringify({ error: "bad_request", message: "vendor_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!account_id) {
      return new Response(
        JSON.stringify({ error: "bad_request", message: "account_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: "bad_request", message: "amount must be a positive number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!payment_date) {
      return new Response(
        JSON.stringify({ error: "bad_request", message: "payment_date is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Resolve QB connection server-side from company_id
    const { conn, error: connErr } = await getConnectionForCompany(adminClient, company_id);
    if (!conn) {
      return new Response(
        JSON.stringify({ error: "no_connection", message: connErr || "Cannot resolve QuickBooks connection for this company." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build line detail
    const lineDetail: any = {
      AccountRef: {
        value: account_id,
        name: account_name || undefined,
      },
    };

    if (class_id) {
      lineDetail.ClassRef = {
        value: class_id,
        name: class_name || undefined,
      };
    }

    // Build QBO Purchase payload (Cash type = already paid)
    const purchasePayload: any = {
      PaymentType: "Cash",
      TxnDate: payment_date,
      EntityRef: {
        value: vendor_id,
        name: vendor_name || undefined,
        type: "Vendor",
      },
      AccountRef: {
        // The bank/payment account — use the same expense account for simplicity
        // In a full implementation this would be a separate bank account
        value: account_id,
        name: account_name || undefined,
      },
      Line: [
        {
          DetailType: "AccountBasedExpenseLineDetail",
          Amount: Number(amount),
          Description: memo || `Historical payment recorded via Lovable`,
          AccountBasedExpenseLineDetail: lineDetail,
        },
      ],
      PrivateNote: memo || `Historical/external payment recorded via Lovable on ${new Date().toISOString().slice(0, 10)}`,
    };

    const result = await qbApiFetch(conn, "POST", "/purchase", purchasePayload);

    if (!result.ok) {
      return new Response(
        JSON.stringify({
          error: "qb_api_error",
          message: `QuickBooks API error (${result.status}): ${result.error || "Unknown error"}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const purchaseData = result.data as any;
    const purchaseId = purchaseData?.Purchase?.Id || null;

    return new Response(
      JSON.stringify({
        success: true,
        purchase_id: purchaseId,
        company_id,
        amount,
        payment_date,
        vendor_id,
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
