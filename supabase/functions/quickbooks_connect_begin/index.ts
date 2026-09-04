import { corsHeaders, requireAdminAuth } from "../_shared/auth.ts";
import { signState } from "../_shared/quickbooks.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId } = await requireAdminAuth(req);

    const body = await req.json().catch(() => ({}));
    const companyId = body.company_id;
    const returnTo = body.return_to || "/shifts";
    const allowShared = body.allow_shared === true;


    if (!companyId || typeof companyId !== "string") {
      return new Response(
        JSON.stringify({ error: "bad_request", message: "company_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const clientId = Deno.env.get("QB_CLIENT_ID");
    const redirectUri = Deno.env.get("QB_REDIRECT_URI");
    const scopes = Deno.env.get("QB_OAUTH_SCOPES") || "com.intuit.quickbooks.accounting";
    const stateSecret = Deno.env.get("QB_STATE_SECRET");

    if (!clientId || !redirectUri || !stateSecret) {
      return new Response(
        JSON.stringify({ error: "server_misconfigured", message: "QuickBooks OAuth not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build state: companyId:userId:timestamp:returnTo, signed with HMAC
    const statePayload = `${companyId}:${userId}:${Date.now()}:${returnTo}`;
    const stateSig = await signState(statePayload, stateSecret);
    const state = `${statePayload}:${stateSig}`;

    const authUrl = new URL("https://appcenter.intuit.com/connect/oauth2");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes);
    authUrl.searchParams.set("state", state);

    return new Response(
      JSON.stringify({ auth_url: authUrl.toString() }),
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
