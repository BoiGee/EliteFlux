// Plan pricing — client-safe constants
export type Tier = "pro" | "elite";
export type Cycle = "monthly" | "yearly";

// Base pricing (USD). Yearly = exactly 10x monthly (2 months free).
// Deliberately priced above impulse-buy SaaS thresholds — this platform runs
// 20+ measured intelligence layers and a frontier-model coach, and the price
// should say so. Round numbers on purpose: no charm pricing (.99 endings),
// that's a budget-tier signal we don't want here.
export const PRICING: Record<Tier, Record<Cycle, number>> = {
  pro: { monthly: 79, yearly: 790 },
  elite: { monthly: 149, yearly: 1490 },
};

export const CYCLE_DAYS: Record<Cycle, number> = {
  monthly: 30,
  yearly: 365,
};

export function priceFor(tier: Tier, cycle: Cycle): number {
  return PRICING[tier][cycle];
}
