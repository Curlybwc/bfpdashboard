import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface QBConnection {
  id: string;
  realm_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  company_name: string | null;
  connected_at: string;
  disconnected_at: string | null;
}

function getQBBaseUrl(): string {
  const env = Deno.env.get("QB_ENVIRONMENT") || "sandbox";
  return env === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

function getOAuthBaseUrl(): string {
  return "https://oauth.platform.intuit.com";
}

/**
 * Fetch the active (non-disconnected) QuickBooks connection.
 * Automatically refreshes the token if it expires within 5 minutes.
 * @deprecated Use getConnectionForCompany for multi-company routing.
 */
export async function getActiveConnection(
  adminClient: SupabaseClient,
): Promise<QBConnection | null> {
  const { data, error } = await adminClient
    .from("quickbooks_connections")
    .select("*")
    .is("disconnected_at", null)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const conn = data as QBConnection;
  return ensureTokenFresh(adminClient, conn);
}

/**
 * Fetch the QuickBooks connection for a specific company.
 * Resolves company -> qb_connection_id -> connection row.
 * Automatically refreshes the token if it expires within 5 minutes.
 */
export async function getConnectionForCompany(
  adminClient: SupabaseClient,
  companyId: string,
): Promise<{ conn: QBConnection | null; error?: string }> {
  // Look up the company
  const { data: company, error: companyError } = await adminClient
    .from("companies")
    .select("id, name, short_name, qb_connection_id")
    .eq("id", companyId)
    .maybeSingle();

  if (companyError) {
    return { conn: null, error: `Failed to look up company: ${companyError.message}` };
  }
  if (!company) {
    return { conn: null, error: `Company not found (${companyId})` };
  }
  if (!company.qb_connection_id) {
    return { conn: null, error: `Company "${company.name}" has no QuickBooks connection linked. Go to QuickBooks Settings and link a connection.` };
  }

  // Fetch the specific connection
  const { data: connRow, error: connError } = await adminClient
    .from("quickbooks_connections")
    .select("*")
    .eq("id", company.qb_connection_id)
    .is("disconnected_at", null)
    .maybeSingle();

  if (connError) {
    return { conn: null, error: `Failed to fetch QuickBooks connection: ${connError.message}` };
  }
  if (!connRow) {
    return { conn: null, error: `QuickBooks connection for "${company.name}" is disconnected or missing. Reconnect QuickBooks for this company.` };
  }

  const conn = await ensureTokenFresh(adminClient, connRow as QBConnection);
  if (!conn) {
    return { conn: null, error: `Failed to refresh QuickBooks token for "${company.name}". Reconnect QuickBooks.` };
  }

  return { conn };
}

/**
 * Fetch a specific connection by its ID directly.
 * Used by list functions when caller provides a connection_id.
 */
export async function getConnectionById(
  adminClient: SupabaseClient,
  connectionId: string,
): Promise<QBConnection | null> {
  const { data, error } = await adminClient
    .from("quickbooks_connections")
    .select("*")
    .eq("id", connectionId)
    .is("disconnected_at", null)
    .maybeSingle();

  if (error || !data) return null;
  return ensureTokenFresh(adminClient, data as QBConnection);
}

async function ensureTokenFresh(
  adminClient: SupabaseClient,
  conn: QBConnection,
): Promise<QBConnection | null> {
  const expiresAt = new Date(conn.token_expires_at).getTime();
  const fiveMinFromNow = Date.now() + 5 * 60 * 1000;

  if (expiresAt > fiveMinFromNow) {
    return conn;
  }

  return refreshToken(adminClient, conn);
}

async function refreshToken(
  adminClient: SupabaseClient,
  conn: QBConnection,
): Promise<QBConnection | null> {
  const clientId = Deno.env.get("QB_CLIENT_ID");
  const clientSecret = Deno.env.get("QB_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    console.error("QB_CLIENT_ID or QB_CLIENT_SECRET not configured");
    return null;
  }

  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  const resp = await fetch(`${getOAuthBaseUrl()}/oauth2/v1/tokens/bearer`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("QB token refresh failed:", resp.status, errText);
    return null;
  }

  const tokens = await resp.json();
  const newExpiresAt = new Date(
    Date.now() + (tokens.expires_in || 3600) * 1000,
  ).toISOString();

  const { error } = await adminClient
    .from("quickbooks_connections")
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || conn.refresh_token,
      token_expires_at: newExpiresAt,
    })
    .eq("id", conn.id);

  if (error) {
    console.error("Failed to persist refreshed QB tokens:", error.message);
    return null;
  }

  return {
    ...conn,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || conn.refresh_token,
    token_expires_at: newExpiresAt,
  };
}

/**
 * Make an authenticated request to the QuickBooks API.
 */
export async function qbApiFetch(
  conn: QBConnection,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data?: unknown; error?: string }> {
  const baseUrl = getQBBaseUrl();
  const url = `${baseUrl}/v3/company/${conn.realm_id}${path}`;

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${conn.access_token}`,
    "Accept": "application/json",
    "Content-Type": "application/json",
  };

  const resp = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await resp.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!resp.ok) {
    return { ok: false, status: resp.status, error: typeof data === "string" ? data : JSON.stringify(data) };
  }

  return { ok: true, status: resp.status, data };
}

/**
 * Create an HMAC-SHA256 signature for the OAuth state parameter.
 */
export async function signState(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verify an HMAC-SHA256 signature for the OAuth state parameter.
 */
export async function verifyState(payload: string, signature: string, secret: string): Promise<boolean> {
  const expected = await signState(payload, secret);
  return expected === signature;
}
