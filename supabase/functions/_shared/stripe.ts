const STRIPE_API_BASE = "https://api.stripe.com/v1";

export interface StripeAccount {
  id: string;
  details_submitted: boolean;
  payouts_enabled: boolean;
  charges_enabled: boolean;
  requirements?: {
    currently_due?: string[];
    disabled_reason?: string | null;
  };
}

export interface WorkerPayoutUpdate {
  stripe_connected_account_id: string;
  details_submitted: boolean;
  payouts_enabled: boolean;
  charges_enabled: boolean;
  onboarding_status: "not_started" | "in_progress" | "completed" | "restricted";
}

function requireStripeSecret(): string {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) {
    throw new Error("Stripe configuration missing: STRIPE_SECRET_KEY is not set");
  }
  return key;
}

async function stripeRequest(path: string, init?: RequestInit): Promise<any> {
  const secret = requireStripeSecret();
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(init?.headers || {}),
    },
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message || `Stripe API request failed (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

export async function createConnectedAccount(workerUserId: string, email: string | null): Promise<StripeAccount> {
  const params = new URLSearchParams();
  params.set("type", "express");
  params.set("metadata[worker_user_id]", workerUserId);
  params.set("capabilities[transfers][requested]", "true");
  if (email) params.set("email", email);

  return await stripeRequest("/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
}

export async function getConnectedAccount(accountId: string): Promise<StripeAccount> {
  return await stripeRequest(`/accounts/${accountId}`);
}

export async function createAccountLink(accountId: string, linkType: "account_onboarding" | "account_update"): Promise<string> {
  const refreshUrl = Deno.env.get("STRIPE_CONNECT_REFRESH_URL");
  const returnUrl = Deno.env.get("STRIPE_CONNECT_RETURN_URL");

  if (!refreshUrl || !returnUrl) {
    throw new Error("Stripe configuration missing: STRIPE_CONNECT_REFRESH_URL and STRIPE_CONNECT_RETURN_URL are required");
  }

  const params = new URLSearchParams();
  params.set("account", accountId);
  params.set("type", linkType);
  params.set("refresh_url", refreshUrl);
  params.set("return_url", returnUrl);

  const payload = await stripeRequest("/account_links", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!payload?.url) {
    throw new Error("Stripe onboarding link creation failed");
  }

  return payload.url as string;
}

export function normalizeOnboardingStatus(account: StripeAccount): WorkerPayoutUpdate["onboarding_status"] {
  const disabledReason = account.requirements?.disabled_reason;
  const currentlyDue = account.requirements?.currently_due || [];

  if (disabledReason) return "restricted";
  if (account.details_submitted && account.payouts_enabled) return "completed";
  if (account.details_submitted || currentlyDue.length > 0) return "in_progress";
  return "not_started";
}

export function toWorkerPayoutUpdate(account: StripeAccount): WorkerPayoutUpdate {
  return {
    stripe_connected_account_id: account.id,
    details_submitted: !!account.details_submitted,
    payouts_enabled: !!account.payouts_enabled,
    charges_enabled: !!account.charges_enabled,
    onboarding_status: normalizeOnboardingStatus(account),
  };
}
