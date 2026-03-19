import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyState } from "../_shared/quickbooks.ts";

Deno.serve(async (req) => {
  // This is a browser redirect from Intuit — no CORS needed, no bearer token
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const stateParam = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  const appBaseUrl = Deno.env.get("APP_BASE_URL") || "http://localhost:5173";

  function redirectError(msg: string) {
    const target = new URL("/shifts", appBaseUrl);
    target.searchParams.set("qb", "error");
    target.searchParams.set("msg", msg);
    return Response.redirect(target.toString(), 302);
  }

  function redirectSuccess() {
    const target = new URL("/shifts", appBaseUrl);
    target.searchParams.set("qb", "connected");
    return Response.redirect(target.toString(), 302);
  }

  if (errorParam) {
    return redirectError(errorParam);
  }

  if (!code || !realmId || !stateParam) {
    return redirectError("Missing code, realmId, or state");
  }

  // Validate state HMAC
  const stateSecret = Deno.env.get("QB_STATE_SECRET");
  if (!stateSecret) {
    return redirectError("Server misconfigured");
  }

  const parts = stateParam.split(":");
  if (parts.length < 3) {
    return redirectError("Invalid state parameter");
  }
  const sig = parts.pop()!;
  const payload = parts.join(":");
  const valid = await verifyState(payload, sig, stateSecret);
  if (!valid) {
    return redirectError("Invalid state signature");
  }

  // Check state isn't too old (10 min)
  const timestamp = parseInt(parts[1], 10);
  if (isNaN(timestamp) || Date.now() - timestamp > 10 * 60 * 1000) {
    return redirectError("State expired");
  }

  const userId = parts[0];

  // Exchange code for tokens
  const clientId = Deno.env.get("QB_CLIENT_ID");
  const clientSecret = Deno.env.get("QB_CLIENT_SECRET");
  const redirectUri = Deno.env.get("QB_REDIRECT_URI");

  if (!clientId || !clientSecret || !redirectUri) {
    return redirectError("Server misconfigured");
  }

  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  const tokenResp = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResp.ok) {
    const errText = await tokenResp.text();
    console.error("QB token exchange failed:", tokenResp.status, errText);
    return redirectError("Token exchange failed");
  }

  const tokens = await tokenResp.json();
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

  // Fetch company info for display name
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  let companyName: string | null = null;
  try {
    const env = Deno.env.get("QB_ENVIRONMENT") || "sandbox";
    const qbBase = env === "production"
      ? "https://quickbooks.api.intuit.com"
      : "https://sandbox-quickbooks.api.intuit.com";
    const companyResp = await fetch(
      `${qbBase}/v3/company/${realmId}/companyinfo/${realmId}`,
      {
        headers: {
          "Authorization": `Bearer ${tokens.access_token}`,
          "Accept": "application/json",
        },
      },
    );
    if (companyResp.ok) {
      const companyData = await companyResp.json();
      companyName = companyData?.CompanyInfo?.CompanyName || null;
    }
  } catch {
    // Non-fatal — we just won't have the display name
  }

  // Check if this realm is already connected (reconnecting same company)
  const { data: existingConn } = await adminClient
    .from("quickbooks_connections")
    .select("id")
    .eq("realm_id", realmId)
    .is("disconnected_at", null)
    .maybeSingle();

  if (existingConn) {
    // Update existing connection with new tokens
    const { error: updateError } = await adminClient
      .from("quickbooks_connections")
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: expiresAt,
        company_name: companyName,
      })
      .eq("id", existingConn.id);

    if (updateError) {
      console.error("Failed to update QB connection:", updateError.message);
      return redirectError("Failed to update connection");
    }
  } else {
    // Insert new connection (do NOT disconnect existing connections — multi-company support)
    const { error: insertError } = await adminClient
      .from("quickbooks_connections")
      .insert({
        realm_id: realmId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: expiresAt,
        company_name: companyName,
        connected_by: userId,
      });

    if (insertError) {
      console.error("Failed to store QB connection:", insertError.message);
      return redirectError("Failed to store connection");
    }
  }

  return redirectSuccess();
});
