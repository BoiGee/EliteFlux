// Shared payment settlement logic. The customer-facing callback-page verify,
// the Paystack webhook, the hourly sweep, and the admin console all go
// through settlePayment, so a payment is granted exactly once no matter which
// caller wins the race to confirm it.

import { CYCLE_DAYS, type Cycle, type Tier } from "./payments.config";

type Admin = { from: (t: string) => any };

/**
 * Grant (or extend) a paid plan. Extending only happens when the same tier is
 * still active, matching the customer-facing behaviour.
 */
export async function grantSubscription(
  admin: Admin,
  userId: string,
  tier: Tier,
  cycle: Cycle,
): Promise<{ periodStart: Date; periodEnd: Date }> {
  const now = new Date();
  const { data: current } = await admin
    .from("subscriptions")
    .select("current_period_end,tier")
    .eq("user_id", userId)
    .maybeSingle();

  let periodStart = now;
  const sub = current as { current_period_end: string | null; tier: string } | null;
  if (sub?.current_period_end && sub.tier === tier && new Date(sub.current_period_end) > now) {
    periodStart = new Date(sub.current_period_end);
  }
  const periodEnd = new Date(periodStart.getTime() + CYCLE_DAYS[cycle] * 86400_000);

  await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      tier,
      status: "active",
      provider: "paystack",
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
      updated_at: now.toISOString(),
    },
    { onConflict: "user_id" },
  );

  return { periodStart, periodEnd };
}

export interface SettleResult {
  ok: boolean;
  status: "verified" | "pending" | "rejected" | "error";
  message: string;
  periodEnd?: string;
}

/**
 * Re-check a stored payment against Paystack and activate the plan when it
 * matches. Safe to call repeatedly and concurrently: the DB update that flips
 * a row to "verified" is conditional (`neq("status", "verified")`), so only
 * the caller that actually wins that update goes on to grant the plan — a
 * second, near-simultaneous caller (webhook vs. callback-page verify vs. the
 * account page's poll) just sees "already verified" and stops.
 */
export async function settlePayment(admin: Admin, paymentId: string): Promise<SettleResult> {
  const { data: row } = await admin
    .from("payment_transactions")
    .select("id,user_id,provider_ref,tier,cycle,status")
    .eq("id", paymentId)
    .maybeSingle();

  const tx = row as
    | { id: string; user_id: string; provider_ref: string | null; tier: Tier; cycle: Cycle; status: string }
    | null;

  if (!tx) return { ok: false, status: "error", message: "Payment not found." };
  if (tx.status === "verified") return { ok: true, status: "verified", message: "Already verified." };
  if (!tx.provider_ref) return { ok: false, status: "error", message: "This payment has no reference to verify." };

  const { verifyTransaction, fetchCustomerSubscription } = await import("./paystack.server");
  const result = await verifyTransaction(tx.provider_ref);

  if (!result.ok) {
    return { ok: false, status: "pending", message: result.message ?? "Paystack lookup unavailable." };
  }
  if (result.status !== "success") {
    const failed = result.status === "failed" || result.status === "abandoned";
    return {
      ok: false,
      status: failed ? "rejected" : "pending",
      message: `Payment ${result.status ?? "not yet confirmed"}.`,
    };
  }

  const { data: claimed } = await admin
    .from("payment_transactions")
    .update({
      status: "verified",
      detected_amount: result.amountUsd,
      provider_data: (result.raw as never) ?? null,
      verified_at: new Date().toISOString(),
    })
    .eq("id", tx.id)
    .neq("status", "verified")
    .select("id,user_id,tier,cycle")
    .maybeSingle();

  const won = claimed as { id: string; user_id: string; tier: Tier; cycle: Cycle } | null;
  if (!won) return { ok: true, status: "verified", message: "Already verified." };

  const { periodEnd } = await grantSubscription(admin, won.user_id, won.tier, won.cycle);

  if (result.customerCode) {
    const subInfo = await fetchCustomerSubscription(result.customerCode);
    await admin
      .from("subscriptions")
      .update({
        paystack_customer_code: result.customerCode,
        paystack_authorization_code: result.authorizationCode ?? null,
        ...(subInfo
          ? { paystack_subscription_code: subInfo.subscriptionCode, paystack_email_token: subInfo.emailToken }
          : {}),
      })
      .eq("user_id", won.user_id);
  }

  return {
    ok: true,
    status: "verified",
    message: `Verified — ${won.tier.toUpperCase()} active until ${periodEnd.toLocaleDateString()}.`,
    periodEnd: periodEnd.toISOString(),
  };
}

/** Record an admin action so privileged changes are never anonymous. */
export async function writeAudit(
  admin: Admin,
  entry: {
    actorId: string;
    action: string;
    targetUserId?: string | null;
    targetId?: string | null;
    detail?: unknown;
  },
): Promise<void> {
  try {
    await admin.from("admin_audit").insert({
      actor_id: entry.actorId,
      action: entry.action,
      target_user_id: entry.targetUserId ?? null,
      target_id: entry.targetId ?? null,
      detail: (entry.detail as never) ?? null,
    });
  } catch {
    /* audit must never block the action it describes */
  }
}
