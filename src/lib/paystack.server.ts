// Server-only Paystack API client: transaction initialize/verify, plan
// caching, subscription lookup/disable, and inbound webhook signature
// verification. Raw fetch throughout, matching this codebase's convention of
// not pulling in provider SDKs.
import { createHmac, timingSafeEqual } from "node:crypto";
import { CHECKOUT_CURRENCY, PAYSTACK_API, PLAN_INTERVAL, planName, planSettingsKey } from "./paystack.config";
import type { Tier, Cycle } from "./payments.config";

type Admin = { from: (t: string) => any };

function secretKey(): string {
  const key = process.env["PAYSTACK_SECRET_KEY"];
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  return key;
}

// No timeout here previously could hang checkout/settlement indefinitely —
// runSettlePaymentsJob (jobs.server.ts) loops sequentially over pending
// payments, calling this for each one, so a single stalled Paystack response
// would stall the whole settlement cron the same way an unprotected fetch
// stalled evaluate-alerts earlier this session.
function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function paystackFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ ok: boolean; data?: T; message?: string }> {
  const res = await timedFetch(`${PAYSTACK_API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as
    | { status?: boolean; message?: string; data?: T }
    | null;
  if (!res.ok || !json?.status) {
    return { ok: false, message: json?.message ?? `Paystack ${path} failed (${res.status})` };
  }
  return { ok: true, data: json.data };
}

// New signups get repriced onto a fresh plan (new plan_code) roughly this
// often, so the GHS charge doesn't drift too far from the USD sticker price
// as the exchange rate moves. Existing subscribers are unaffected — Paystack
// bills them at the rate on the plan_code they actually subscribed to,
// which is normal subscription-billing behavior, not a bug to work around.
const PLAN_REFRESH_MS = 30 * 24 * 3600_000;

/**
 * USD->GHS rate from a free, keyless FX API. Throws rather than falling back
 * to a guessed/stale rate — this feeds directly into what a customer is
 * charged, so a failed lookup should block checkout, not silently mis-price it.
 */
export async function fetchUsdToGhsRate(): Promise<number> {
  const res = await timedFetch("https://open.er-api.com/v6/latest/USD");
  if (!res.ok) throw new Error(`Exchange rate lookup failed (${res.status})`);
  const json = (await res.json().catch(() => null)) as { result?: string; rates?: Record<string, number> } | null;
  const rate = json?.result === "success" ? json.rates?.["GHS"] : undefined;
  if (!rate || !Number.isFinite(rate) || rate <= 0) throw new Error("Exchange rate lookup returned no usable GHS rate.");
  return rate;
}

interface CachedPlan {
  plan_code: string;
  created_at: string;
  usd_amount: number;
  ghs_rate: number;
  amount_pesewas: number;
}

export interface PlanInfo {
  planCode: string;
  /** Pesewas — the exact amount the plan was created with. Pass this straight through to initializeTransaction; it must match the plan exactly or Paystack rejects the transaction. */
  amount: number;
}

/** Cached Paystack plan_code for a tier+cycle, refreshed periodically so the GHS charge tracks the USD price. */
export async function getOrCreatePlanCode(admin: Admin, tier: Tier, cycle: Cycle): Promise<PlanInfo> {
  const key = planSettingsKey(tier, cycle);
  const { data: row } = await admin.from("platform_settings").select("value").eq("key", key).maybeSingle();
  const cached = (row as { value: unknown } | null)?.value as CachedPlan | undefined;
  // Number.isFinite guards against a cache entry from an older shape of this
  // function (e.g. missing amount_pesewas) — reusing one of those silently
  // sends amount: undefined to initializeTransaction, which is exactly what
  // produced "Invalid Amount Sent" once already. Treat an incomplete cache
  // entry as not-fresh rather than trusting its shape.
  const isFresh =
    cached?.created_at &&
    Number.isFinite(cached.amount_pesewas) &&
    Date.now() - new Date(cached.created_at).getTime() < PLAN_REFRESH_MS;
  if (cached?.plan_code && isFresh) return { planCode: cached.plan_code, amount: cached.amount_pesewas };

  const { PRICING } = await import("./payments.config");
  const usdAmount = PRICING[tier][cycle];
  const rate = await fetchUsdToGhsRate();
  const amount = Math.round(usdAmount * rate * 100); // USD -> GHS -> pesewas

  const created = await paystackFetch<{ plan_code: string }>("/plan", {
    method: "POST",
    body: {
      name: planName(tier, cycle),
      amount,
      interval: PLAN_INTERVAL[cycle],
      currency: CHECKOUT_CURRENCY,
    },
  });
  if (!created.ok || !created.data) throw new Error(created.message ?? "Could not create Paystack plan.");

  const value: CachedPlan = {
    plan_code: created.data.plan_code,
    created_at: new Date().toISOString(),
    usd_amount: usdAmount,
    ghs_rate: rate,
    amount_pesewas: amount,
  };
  await admin.from("platform_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

  return { planCode: created.data.plan_code, amount };
}

export interface InitializeResult {
  ok: boolean;
  authorizationUrl?: string;
  message?: string;
}

export async function initializeTransaction(params: {
  email: string;
  reference: string;
  planCode: string;
  /** Pesewas. Must be the exact amount the plan was created with (PlanInfo.amount from getOrCreatePlanCode) — on this account, omitting it entirely produced "Invalid Amount Sent" rather than falling back to the plan's own amount, so it's required here despite being redundant with the plan. */
  amount: number;
  callbackUrl: string;
}): Promise<InitializeResult> {
  const r = await paystackFetch<{ authorization_url: string }>("/transaction/initialize", {
    method: "POST",
    body: {
      email: params.email,
      amount: params.amount,
      reference: params.reference,
      plan: params.planCode,
      currency: CHECKOUT_CURRENCY,
      callback_url: params.callbackUrl,
    },
  });
  if (!r.ok || !r.data) return { ok: false, message: r.message ?? "Could not start checkout." };
  return { ok: true, authorizationUrl: r.data.authorization_url };
}

export interface VerifyResult {
  ok: boolean;
  status?: "success" | "failed" | "abandoned" | "pending";
  amountUsd?: number;
  customerCode?: string;
  customerEmail?: string;
  authorizationCode?: string;
  raw?: unknown;
  message?: string;
}

export async function verifyTransaction(reference: string): Promise<VerifyResult> {
  const r = await paystackFetch<{
    status: "success" | "failed" | "abandoned";
    amount: number;
    customer: { customer_code: string; email: string };
    authorization?: { authorization_code: string };
  }>(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (!r.ok || !r.data) return { ok: false, message: r.message ?? "Verification failed." };
  return {
    ok: true,
    status: r.data.status,
    amountUsd: r.data.amount / 100,
    customerCode: r.data.customer?.customer_code,
    customerEmail: r.data.customer?.email,
    authorizationCode: r.data.authorization?.authorization_code,
    raw: r.data,
  };
}

export interface SubscriptionInfo {
  subscriptionCode: string;
  emailToken: string;
}

/**
 * Fetch a customer's active subscription straight from Paystack rather than
 * relying on catching a one-time "subscription created" webhook event —
 * Paystack's docs are inconsistent on that event's exact name, so this is
 * called after every charge.success instead and is idempotent either way.
 */
export async function fetchCustomerSubscription(customerCode: string): Promise<SubscriptionInfo | null> {
  const r = await paystackFetch<
    Array<{ subscription_code: string; email_token: string; status: string }>
  >(`/subscription?customer=${encodeURIComponent(customerCode)}`);
  if (!r.ok || !r.data?.length) return null;
  const active = r.data.find((s) => s.status === "active") ?? r.data[0]!;
  return { subscriptionCode: active.subscription_code, emailToken: active.email_token };
}

export async function disableSubscription(params: { code: string; token: string }): Promise<{ ok: boolean; message?: string }> {
  const r = await paystackFetch("/subscription/disable", {
    method: "POST",
    body: { code: params.code, token: params.token },
  });
  return { ok: r.ok, message: r.message };
}

/**
 * Paystack signs webhooks with HMAC-SHA512 of the raw request body, keyed
 * with the secret key. Must be computed over the exact bytes received —
 * parse-then-restringify silently breaks this.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha512", secretKey()).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
