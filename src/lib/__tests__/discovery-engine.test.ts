import { describe, expect, it } from "vitest";
import { checkDiscoveryGuardrails, proposeDiscoveryActions, type DiscoveryCandidate } from "../discovery-engine";
import { DISCOVERY_DEFAULT_SETTINGS, type DiscoveryGuardrails } from "../autonomy";
import type { DiscoveryTokenSignal, SafetyGateVerdict } from "../discovery-intel";

const guardrails: DiscoveryGuardrails = {
  min_safety_score: DISCOVERY_DEFAULT_SETTINGS.min_safety_score,
  max_position_usd: DISCOVERY_DEFAULT_SETTINGS.max_position_usd,
  total_allocation_budget_usd: DISCOVERY_DEFAULT_SETTINGS.total_allocation_budget_usd,
  max_open_positions: DISCOVERY_DEFAULT_SETTINGS.max_open_positions,
  allowed_networks: [],
};

const passedGate: SafetyGateVerdict = { passed: true, checks: [], failedReasons: [] };
const failedGate: SafetyGateVerdict = { passed: false, checks: [], failedReasons: ["liquidity floor"] };

function sig(over: Partial<DiscoveryTokenSignal> = {}): DiscoveryTokenSignal {
  return {
    network: "eth",
    tokenAddress: "0xabc",
    pairAddress: "0xpair",
    symbol: "TEST",
    name: "Test Token",
    safety: passedGate,
    safetyScore: 100,
    opportunityScore: 60,
    band: "Emerging",
    contributors: { liquidityDepth: 50, holderDistribution: 50, volumeMomentum: 50, ageSeasoning: 50 },
    tags: [],
    rationale: "test",
    liquidityUsd: 50_000,
    holderCount: 100,
    top10HolderPct: 25,
    priceUsd: 1,
    ageMinutes: 60,
    generatedAt: Date.now(),
    ...over,
  };
}

function candidate(over: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate {
  return {
    network: "eth",
    tokenAddress: "0xabc",
    discoveredTokenId: "id-1",
    symbol: "eth:0xabc",
    notionalUsd: guardrails.max_position_usd,
    referencePrice: 1,
    opportunityScore: 60,
    safetyScore: 100,
    rationale: "test",
    ...over,
  };
}

describe("proposeDiscoveryActions", () => {
  it("excludes signals that failed the safety gate", () => {
    const out = proposeDiscoveryActions([sig({ safety: failedGate })], new Set(), guardrails);
    expect(out).toHaveLength(0);
  });

  it("excludes a token already held (one open position per token at a time)", () => {
    const out = proposeDiscoveryActions([sig()], new Set(["eth:0xabc"]), guardrails);
    expect(out).toHaveLength(0);
  });

  it("includes a gate-passed, not-yet-held signal, sized at the flat max_position_usd ceiling", () => {
    const out = proposeDiscoveryActions([sig()], new Set(), guardrails);
    expect(out).toHaveLength(1);
    expect(out[0]!.notionalUsd).toBe(guardrails.max_position_usd);
    expect(out[0]!.symbol).toBe("eth:0xabc");
  });

  it("ranks multiple candidates by opportunityScore descending", () => {
    const out = proposeDiscoveryActions(
      [
        sig({ tokenAddress: "0x1", opportunityScore: 40 }),
        sig({ tokenAddress: "0x2", opportunityScore: 90 }),
      ],
      new Set(),
      guardrails,
    );
    expect(out.map((c) => c.tokenAddress)).toEqual(["0x2", "0x1"]);
  });
});

describe("checkDiscoveryGuardrails", () => {
  it("passes a candidate that clears every guardrail", () => {
    const v = checkDiscoveryGuardrails(candidate(), guardrails, 0, 0);
    expect(v.passed).toBe(true);
    expect(v.cappedNotional).toBe(guardrails.max_position_usd);
  });

  it("fails below the min_safety_score floor", () => {
    const v = checkDiscoveryGuardrails(candidate({ safetyScore: 50 }), guardrails, 0, 0);
    expect(v.passed).toBe(false);
    expect(v.reason).toContain("min_safety_score");
  });

  it("fails when the network isn't on the user's allow-list", () => {
    const g = { ...guardrails, allowed_networks: ["solana"] };
    const v = checkDiscoveryGuardrails(candidate({ network: "eth" }), g, 0, 0);
    expect(v.passed).toBe(false);
    expect(v.reason).toContain("network_allowed");
  });

  it("fails at the max_open_positions ceiling", () => {
    const v = checkDiscoveryGuardrails(candidate(), { ...guardrails, max_open_positions: 2 }, 2, 0);
    expect(v.passed).toBe(false);
    expect(v.reason).toContain("max_open_positions");
  });

  it("fails once the cumulative allocation budget is exhausted", () => {
    const v = checkDiscoveryGuardrails(candidate(), guardrails, 0, guardrails.total_allocation_budget_usd);
    expect(v.passed).toBe(false);
    expect(v.reason).toContain("allocation_budget");
  });

  it("caps notional to whatever allocation budget remains", () => {
    const g = { ...guardrails, max_position_usd: 100 };
    const v = checkDiscoveryGuardrails(candidate({ notionalUsd: 100 }), g, 0, 95); // only $5 of a $100 budget left
    expect(v.cappedNotional).toBe(5);
  });

  it("fails min_order_size once capped notional drops below the platform floor", () => {
    const g = { ...guardrails, total_allocation_budget_usd: 100 };
    const v = checkDiscoveryGuardrails(candidate(), g, 0, 97); // $3 left, below MIN_ORDER_USD
    expect(v.passed).toBe(false);
    expect(v.reason).toContain("min_order_size");
  });
});
