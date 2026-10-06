// Pure discovery guardrail/candidate logic. Parallel to autopilot-engine.ts,
// not an extension of it — that file's bounds (up to 40% of portfolio, $25k
// max) are calibrated for an established, curated ~300-coin universe and
// would be a real safety mistake applied unchanged to two-day-old,
// unverified DEX tokens. No IO — easy to reason about, identical shape for
// every call site.
import type { DiscoveryGuardrails } from "./autonomy";
import type { DiscoveryTokenSignal } from "./discovery-intel";
import { MIN_ORDER_USD } from "./autopilot-engine";

export type DiscoveryCandidate = {
  network: string;
  tokenAddress: string;
  discoveredTokenId: string;
  symbol: string;
  notionalUsd: number;
  referencePrice: number;
  opportunityScore: number;
  safetyScore: number;
  rationale: string;
};

export type DiscoveryGuardrailVerdict = {
  passed: boolean;
  reason?: string;
  checks: { name: string; ok: boolean; detail: string }[];
  cappedNotional: number;
};

/**
 * Build candidates from this scan's gate-passed signals, excluding tokens
 * already held (one open paper position per token at a time — this isn't
 * trying to average into or scale out of a position, just screen new ones).
 * discoveredTokenId isn't filled in here because this module is pure and has
 * no DB access — the caller (discovery.server.ts's runDiscoveryForUser),
 * which already has each signal's row id, fills it in after.
 */
export function proposeDiscoveryActions(
  signals: DiscoveryTokenSignal[],
  heldKeys: Set<string>,
  g: DiscoveryGuardrails,
): DiscoveryCandidate[] {
  return signals
    .filter((s) => s.safety.passed)
    .filter((s) => !heldKeys.has(`${s.network}:${s.tokenAddress}`))
    .map((s) => ({
      network: s.network,
      tokenAddress: s.tokenAddress,
      discoveredTokenId: "",
      symbol: `${s.network}:${s.tokenAddress}`,
      notionalUsd: g.max_position_usd,
      referencePrice: s.priceUsd,
      opportunityScore: s.opportunityScore,
      safetyScore: s.safetyScore,
      rationale: s.rationale,
    }))
    .sort((a, b) => b.opportunityScore - a.opportunityScore);
}

/**
 * Every check that must pass before a paper position may be recorded.
 * safety_gate isn't re-checked here — proposeDiscoveryActions already
 * filtered to safety.passed signals from this same scan cycle, and
 * runDiscoveryForUser proposes and records in the same pass with no
 * separate manual-approval step in between (unlike autopilot's "approve"
 * level, where real time can pass between proposal and execution) — so
 * there's no time-of-check/time-of-use gap for a second check to guard
 * against here.
 */
export function checkDiscoveryGuardrails(
  c: DiscoveryCandidate,
  g: DiscoveryGuardrails,
  openPositionsCount: number,
  allocationUsedUsd: number,
): DiscoveryGuardrailVerdict {
  const checks: DiscoveryGuardrailVerdict["checks"] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  add("min_safety_score", c.safetyScore >= g.min_safety_score, `${c.safetyScore} vs floor ${g.min_safety_score}`);
  add(
    "network_allowed",
    g.allowed_networks.length === 0 || g.allowed_networks.includes(c.network),
    g.allowed_networks.length ? `allow-list of ${g.allowed_networks.length}` : "all covered networks allowed",
  );
  add("max_open_positions", openPositionsCount < g.max_open_positions, `${openPositionsCount}/${g.max_open_positions} open`);

  const remainingBudget = Math.max(0, g.total_allocation_budget_usd - allocationUsedUsd);
  add(
    "allocation_budget",
    remainingBudget > 0,
    `${allocationUsedUsd.toFixed(2)}/${g.total_allocation_budget_usd} used`,
  );
  const capped = Math.min(c.notionalUsd, g.max_position_usd, remainingBudget);
  add("min_order_size", capped >= MIN_ORDER_USD, `${capped.toFixed(2)} USD after caps`);

  const failed = checks.find((k) => !k.ok);
  return {
    passed: !failed,
    ...(failed ? { reason: `${failed.name}: ${failed.detail}` } : {}),
    checks,
    cappedNotional: Math.max(0, capped),
  };
}
