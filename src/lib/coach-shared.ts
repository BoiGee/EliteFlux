// Client-safe shared definitions for the EliteFlux AI Coach.
// Imported by the browser UI and by the server route/tools.

import type { Tier } from "./tier-matrix";

export type CoachLevel = "beginner" | "intermediate" | "advanced" | "pro";

export const COACH_LEVELS: { key: CoachLevel; label: string; blurb: string }[] = [
  { key: "beginner", label: "New to crypto", blurb: "Plain language, no jargon, always explains the why." },
  { key: "intermediate", label: "Comfortable", blurb: "Balanced detail, defines terms only when they matter." },
  { key: "advanced", label: "Experienced", blurb: "Dense, signal-first, assumes you know the mechanics." },
  { key: "pro", label: "Professional", blurb: "Terse desk notes: levels, flows, invalidation, risk." },
];

export const LEVEL_LABEL: Record<CoachLevel, string> = {
  beginner: "New to crypto",
  intermediate: "Comfortable",
  advanced: "Experienced",
  pro: "Professional",
};

/**
 * Daily coach message allowance per plan.
 *
 * Sized against actual Opus 5 economics, not a round number: each paid
 * plan's cap is set so that a user who maxes it out every single day of the
 * month still leaves EliteFlux with roughly half of that plan's
 * subscription revenue after Opus cost alone (prompt caching enabled via
 * cacheControl in api/coach.ts; elite additionally runs "xhigh" effort
 * rather than "max" — see EFFORT_BY_TIER in api/coach.ts — which is
 * materially cheaper per turn for comparable answer quality on this kind of
 * agentic workload). This is the worst case; typical usage is well under
 * the daily cap and correspondingly more profitable. Free has no revenue to
 * size a margin against and is capped at 1/day deliberately — enough for
 * Flux to nudge toward upgrading, not enough to be a substitute for paying
 * (see COACH_TOOLS_BY_TIER.free below: free's tool set is cut to match, so
 * that single message also can't leak paid market intelligence).
 *
 * These are estimates from prompt/tool size and effort level, not measured
 * response.usage data — true them up against real usage once this ships.
 */
export const COACH_DAILY_LIMIT: Record<Tier, number> = {
  free: 1,
  pro: 30,
  elite: 45,
};

/** How much of the intelligence stack the coach may read, per plan. */
/** Tools every plan gets: they describe the product or the user's own data. */
export const COACH_UNIVERSAL_TOOLS = [
  "explain_feature",
  "get_whats_new",
  "get_my_account",
  "get_engine_accuracy",
  "remember_fact",
  "web_search",
  "get_event_risk",
] as const;

export const COACH_TOOLS_BY_TIER: Record<Tier, string[]> = {
  // No get_market_pulse / get_trading_conditions here on purpose: those
  // tools return most of the paid intelligence stack, and free's dashboard
  // access is now recommendations-only (see TIER_ACCESS.free in
  // tier-matrix.ts) — letting free chat its way to the same data via Flux
  // would make the dashboard restriction pointless.
  free: [...COACH_UNIVERSAL_TOOLS, "get_my_journal"],
  pro: [
    ...COACH_UNIVERSAL_TOOLS,
    "get_market_pulse",
    "get_trading_conditions",
    "get_coin_intel",
    "get_my_watchlist",
    "get_my_alerts",
    "log_call",
    "get_my_journal",
    "get_suggested_sizing",
  ],
  elite: [
    ...COACH_UNIVERSAL_TOOLS,
    "get_market_pulse",
    "get_trading_conditions",
    "get_coin_intel",
    "get_my_watchlist",
    "get_my_alerts",
    "log_call",
    "get_my_journal",
    "get_suggested_sizing",
    "simulate_scenario",
    "get_deep_cognition",
  ],
};

export type CallStance = "accumulate" | "reduce" | "watch" | "avoid";

export const STANCE_LABEL: Record<CallStance, string> = {
  accumulate: "Accumulate",
  reduce: "Reduce",
  watch: "Watch",
  avoid: "Avoid",
};

export const COACH_STARTERS = [
  "Should I be trading right now, or standing down?",
  "What can EliteFlux actually do for me?",
  "Walk me through connecting my exchange safely.",
  "How accurate have your reads been lately?",
  "Explain what the market is doing like I'm five.",
  "Grade my recent calls and tell me my biggest mistake.",
];
