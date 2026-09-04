import { corsHeaders, requireAdminAuth } from "../_shared/auth.ts";
import { checkQBRef, fetchRealmCompanyName, getConnectionForCompany } from "../_shared/quickbooks.ts";

type Status = "valid" | "missing" | "not_found" | "inactive" | "unknown";

interface CheckResult {
  kind: "labor_account" | "reimbursement_account" | "vendor" | "class";
  label: string;
  qb_id: string | null;
  saved_name: string | null;
  status: Status;
  detail: string;
  ref_id?: string; // user_id or project_id, for re-mapping in the UI
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { adminClient } = await requireAdminAuth(req);
    const body = await req.json().catch(() => ({}));
    const companyId: string | null = body?.company_id || null;

    if (!companyId) {
      return new Response(
        JSON.stringify({ error: "bad_request", message: "company_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: company } = await adminClient
      .from("companies").select("id, name, short_name, qb_connection_id").eq("id", companyId).maybeSingle();

    if (!company) {
      return new Response(
        JSON.stringify({ error: "not_found", message: "Company not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { conn, error: connErr } = await getConnectionForCompany(adminClient, companyId);
    if (!conn) {
      return new Response(
        JSON.stringify({
          company: { id: company.id, name: company.name },
          connection: null,
          message: connErr || "No active QuickBooks connection for this company.",
          checks: [],
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Verify the "Linked to" display against the live realm
    const liveCompanyName = await fetchRealmCompanyName(conn);
    if (liveCompanyName && liveCompanyName !== conn.company_name) {
      await adminClient.from("quickbooks_connections")
        .update({ company_name: liveCompanyName }).eq("id", conn.id);
    }

    const checks: CheckResult[] = [];
    const nowIso = new Date().toISOString();

    // ---- Accounts ----
    const { data: settings } = await adminClient
      .from("quickbooks_settings")
      .select("id, labor_expense_account_id, labor_expense_account_name, qb_reimbursement_expense_account_id, qb_reimbursement_expense_account_name")
      .eq("company_id", companyId)
      .maybeSingle();

    const accountUpdates: Record<string, unknown> = {};

    const runAccount = async (
      kind: "labor_account" | "reimbursement_account",
      label: string,
      id: string | null | undefined,
      name: string | null | undefined,
      realmField: string,
      verifiedField: string,
    ) => {
      if (!id) {
        checks.push({ kind, label, qb_id: null, saved_name: null, status: "missing", detail: "No account configured for this company." });
        return;
      }
      const res = await checkQBRef(conn, "Account", id);
      if (res.ok) {
        accountUpdates[realmField] = conn.realm_id;
        accountUpdates[verifiedField] = nowIso;
        checks.push({ kind, label, qb_id: id, saved_name: name || null, status: "valid", detail: res.name || name || "" });
      } else {
        accountUpdates[realmField] = null;
        accountUpdates[verifiedField] = null;
        checks.push({
          kind, label, qb_id: id, saved_name: name || null,
          status: res.apiError ? "unknown" : res.inactive ? "inactive" : "not_found",
          detail: res.apiError
            ? res.apiError
            : res.inactive
              ? "Account exists but is inactive in this QuickBooks company."
              : `Not found in ${liveCompanyName || conn.realm_id} — this ID belongs to a different QuickBooks company.`,
        });
      }
    };

    await runAccount("labor_account", "Labor expense account", settings?.labor_expense_account_id, settings?.labor_expense_account_name, "labor_account_realm_id", "labor_account_verified_at");
    await runAccount("reimbursement_account", "Reimbursement expense account", (settings as any)?.qb_reimbursement_expense_account_id, (settings as any)?.qb_reimbursement_expense_account_name, "reimbursement_account_realm_id", "reimbursement_account_verified_at");

    if (settings?.id && Object.keys(accountUpdates).length > 0) {
      await adminClient.from("quickbooks_settings").update(accountUpdates).eq("id", settings.id);
    }

    // ---- Vendor mappings ----
    const { data: vendorMappings } = await adminClient
      .from("quickbooks_vendor_mappings")
      .select("id, user_id, qb_vendor_id, qb_vendor_name")
      .eq("company_id", companyId);

    const userIds = (vendorMappings || []).map((v: any) => v.user_id);
    const { data: profiles } = userIds.length
      ? await adminClient.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] as any[] };
    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name || p.id]));

    for (const m of vendorMappings || []) {
      const label = `Vendor: ${profileMap.get(m.user_id) || m.user_id}`;
      const res = await checkQBRef(conn, "Vendor", m.qb_vendor_id);
      if (res.ok) {
        await adminClient.from("quickbooks_vendor_mappings")
          .update({ qb_realm_id: conn.realm_id, verified_at: nowIso, verification_error: null }).eq("id", m.id);
        checks.push({ kind: "vendor", label, qb_id: m.qb_vendor_id, saved_name: m.qb_vendor_name, status: "valid", detail: res.name || m.qb_vendor_name || "", ref_id: m.user_id });
      } else {
        const detail = res.apiError
          ? res.apiError
          : res.inactive
            ? "Vendor exists but is inactive in this QuickBooks company."
            : `Not found in ${liveCompanyName || conn.realm_id} — this ID belongs to a different QuickBooks company.`;
        await adminClient.from("quickbooks_vendor_mappings")
          .update({ qb_realm_id: null, verified_at: null, verification_error: detail }).eq("id", m.id);
        checks.push({
          kind: "vendor", label, qb_id: m.qb_vendor_id, saved_name: m.qb_vendor_name,
          status: res.apiError ? "unknown" : res.inactive ? "inactive" : "not_found",
          detail, ref_id: m.user_id,
        });
      }
    }

    // Contractors with no mapping at all for this company
    const { data: activeProfiles } = await adminClient
      .from("profiles").select("id, full_name").eq("is_active", true);
    const mappedUsers = new Set((vendorMappings || []).map((v: any) => v.user_id));
    for (const p of activeProfiles || []) {
      if (!mappedUsers.has(p.id)) {
        checks.push({
          kind: "vendor", label: `Vendor: ${p.full_name || p.id}`, qb_id: null, saved_name: null,
          status: "missing", detail: "No QuickBooks vendor mapped for this company.", ref_id: p.id,
        });
      }
    }

    // ---- Class / project mappings ----
    const { data: projects } = await adminClient
      .from("projects").select("id, name").eq("company_id", companyId);
    const projectIds = (projects || []).map((p: any) => p.id);
    const projectMap = new Map((projects || []).map((p: any) => [p.id, p.name]));

    const { data: classMappings } = projectIds.length
      ? await adminClient.from("quickbooks_class_mappings").select("id, project_id, qb_class_id, qb_class_name").in("project_id", projectIds)
      : { data: [] as any[] };

    for (const cm of classMappings || []) {
      const label = `Class: ${projectMap.get(cm.project_id) || cm.project_id}`;
      const res = await checkQBRef(conn, "Class", cm.qb_class_id);
      if (res.ok) {
        await adminClient.from("quickbooks_class_mappings")
          .update({ qb_realm_id: conn.realm_id, verified_at: nowIso, verification_error: null }).eq("id", cm.id);
        checks.push({ kind: "class", label, qb_id: cm.qb_class_id, saved_name: cm.qb_class_name, status: "valid", detail: res.name || cm.qb_class_name || "", ref_id: cm.project_id });
      } else {
        const detail = res.apiError
          ? res.apiError
          : res.inactive
            ? "Class exists but is inactive in this QuickBooks company."
            : `Not found in ${liveCompanyName || conn.realm_id} — this ID belongs to a different QuickBooks company.`;
        await adminClient.from("quickbooks_class_mappings")
          .update({ qb_realm_id: null, verified_at: null, verification_error: detail }).eq("id", cm.id);
        checks.push({
          kind: "class", label, qb_id: cm.qb_class_id, saved_name: cm.qb_class_name,
          status: res.apiError ? "unknown" : res.inactive ? "inactive" : "not_found",
          detail, ref_id: cm.project_id,
        });
      }
    }

    const summary = {
      valid: checks.filter((c) => c.status === "valid").length,
      missing: checks.filter((c) => c.status === "missing").length,
      invalid: checks.filter((c) => c.status === "not_found" || c.status === "inactive").length,
      unknown: checks.filter((c) => c.status === "unknown").length,
    };

    return new Response(
      JSON.stringify({
        company: { id: company.id, name: company.name, short_name: company.short_name },
        connection: {
          id: conn.id,
          realm_id: conn.realm_id,
          stored_company_name: conn.company_name,
          live_company_name: liveCompanyName,
          name_mismatch: !!liveCompanyName && liveCompanyName !== conn.company_name,
        },
        summary,
        checks,
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
