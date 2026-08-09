// Paystack payment configuration — client-safe constants.
import type { Tier, Cycle } from "./payments.config";

export const PAYSTACK_API = "https://api.paystack.co";

// This Paystack account settles in GHS only (confirmed: USD transactions are
// rejected with "USD not a supported currency"), though international cards
// are enabled — the card network converts on the customer's end, Paystack
// just needs the charge itself denominated in GHS. PRICING in payments.config.ts
// stays in USD as the source of truth; paystack.server.ts converts to GHS at
// plan-creation time using a live exchange rate.
export const CHECKOUT_CURRENCY = "GHS";

// Paystack plan `interval` values.
export const PLAN_INTERVAL: Record<Cycle, string> = {
  monthly: "monthly",
  yearly: "annually",
};

export function planName(tier: Tier, cycle: Cycle): string {
  return `EliteFlux ${tier === "pro" ? "Operator" : "Elite"} — ${cycle === "monthly" ? "Monthly" : "Yearly"}`;
}

/** The platform_settings key a plan's Paystack-assigned code is cached under, created once and reused. */
export function planSettingsKey(tier: Tier, cycle: Cycle): string {
  return `paystack_plan_code:${tier}:${cycle}`;
}
