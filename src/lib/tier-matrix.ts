// Single source of truth for tier access. Pure + client-safe:
// imported by the browser UI (src/lib/auth.tsx) AND by server-side gates
// (src/lib/tier.server.ts, /api/brain/*, MCP tools).

export type Tier = "free" | "pro" | "elite";

/**
 * Customer-facing names. The internal tier keys ("pro") stay put — they're
 * load-bearing across the DB enum, RLS, and dozens of call sites — this is
 * purely the display layer, so renaming what customers see never risks a
 * data migration.
 */
export const TIER_DISPLAY_NAME: Record<Tier, string> = {
  free: "Free",
  pro: "Operator",
  elite: "Elite",
};

export const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, elite: 2 };

/**
 * Which capability keys each tier can open — dashboard intelligence modules
 * plus a couple of whole-page capabilities (portfolio linking, autopilot)
 * that use the exact same gate.
 *
 * Free is deliberately down to a single module: after the 7-day Elite
 * trial ends without a paid plan, that's the entire dashboard a lapsed
 * account gets back — enough to see there's a real product, not enough to
 * use it. "elite-brain" and "narrative-detect" moved from Operator to
 * Elite-only (Operator keeps exit/momentum/sentiment/risk/coin-intel as its
 * baseline) so Elite is a meaningfully different tier, not just Operator
 * plus a few extras — Elite is every module the platform has.
 *
 * "portfolio" (connecting exchanges/wallets) is Operator+, per the pricing
 * page and coach-knowledge.ts's PLANS.pro entry. "autopilot" (arming
 * automated trade execution) is Elite-only, per PLANS.elite and
 * coach-knowledge.ts FEATURES' `autopilot` entry (`plan: "elite"`). Both
 * must be enforced server-side wherever they're checked — a disabled button
 * in the UI is not a tier gate.
 */
export const TIER_ACCESS: Record<Tier, Set<string>> = {
  free: new Set(["recommendations"]),
  pro: new Set([
    "recommendations", "market-flow", "heatmap", "meme", "events",
    "exit", "momentum", "sentiment", "risk", "coin-intel",
    "portfolio",
  ]),
  elite: new Set([
    "recommendations", "market-flow", "heatmap", "meme", "events",
    "exit", "momentum", "sentiment", "narrative-detect", "elite-brain", "risk", "coin-intel",
    "brain-v3", "smart-money", "whale", "onchain",
    "portfolio", "autopilot",
  ]),
};

export function canAccess(tier: Tier, moduleKey: string): boolean {
  return TIER_ACCESS[tier].has(moduleKey);
}

export function requiredTierFor(moduleKey: string): Tier {
  if (TIER_ACCESS.free.has(moduleKey)) return "free";
  if (TIER_ACCESS.pro.has(moduleKey)) return "pro";
  return "elite";
}

export function meetsTier(tier: Tier, required: Tier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[required];
}

// ---------------------------------------------------------------------------
// Alert delivery channels — shared by the alerts UI and the server evaluator.
// ---------------------------------------------------------------------------

export type AlertChannel = "in_app" | "email" | "telegram" | "webhook";

export const CHANNELS_BY_TIER: Record<Tier, AlertChannel[]> = {
  free: ["in_app"],
  pro: ["in_app", "email"],
  elite: ["in_app", "email", "telegram", "webhook"],
};

export const CHANNEL_LABEL: Record<AlertChannel, string> = {
  in_app: "In-app",
  email: "Email",
  telegram: "Telegram",
  webhook: "Webhook",
};

export function canUseChannel(tier: Tier, channel: AlertChannel): boolean {
  return CHANNELS_BY_TIER[tier].includes(channel);
}

/** Drop channels the tier can't use; always keep in-app so nothing is silent. */
export function sanitizeChannels(tier: Tier, channels: AlertChannel[]): AlertChannel[] {
  const allowed = channels.filter((c) => canUseChannel(tier, c));
  return allowed.includes("in_app") ? allowed : ["in_app", ...allowed];
}
