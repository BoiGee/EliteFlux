import { describe, expect, it } from "vitest";
import { computeDiscoveryTokenSignal, computeSafetyGate, isSolanaNetwork, type RawTokenData } from "../discovery-intel";

const NOW = Date.now();

function raw(over: Partial<RawTokenData> = {}): RawTokenData {
  return {
    network: "eth",
    tokenAddress: "0xabc",
    pairAddress: "0xpair",
    symbol: "TEST",
    name: "Test Token",
    priceUsd: 0.001,
    liquidityUsd: 50_000,
    volume24hUsd: 40_000,
    poolCreatedAt: NOW - 24 * 3600_000, // 24h old
    holderCount: 500,
    top10HolderPct: 25,
    lpLockedPct: 95,
    isHoneypot: false,
    buyTaxPct: 2,
    sellTaxPct: 2,
    sourceVerified: true,
    ownerRenounced: true,
    mintAuthorityRevoked: null,
    freezeAuthorityRevoked: null,
    ...over,
  };
}

function solanaRaw(over: Partial<RawTokenData> = {}): RawTokenData {
  return raw({
    network: "solana",
    tokenAddress: "SoLmintAddress",
    sourceVerified: null,
    ownerRenounced: null,
    mintAuthorityRevoked: true,
    freezeAuthorityRevoked: true,
    ...over,
  });
}

describe("isSolanaNetwork", () => {
  it("distinguishes solana from EVM networks", () => {
    expect(isSolanaNetwork("solana")).toBe(true);
    expect(isSolanaNetwork("eth")).toBe(false);
    expect(isSolanaNetwork("base")).toBe(false);
  });
});

describe("computeSafetyGate", () => {
  it("passes a token that clears every applicable check", () => {
    const gate = computeSafetyGate(raw());
    expect(gate.passed).toBe(true);
    expect(gate.failedReasons).toHaveLength(0);
  });

  it("fails closed when a check's data is genuinely unavailable, not just when it genuinely fails", () => {
    // isHoneypot: null — the provider never resolved, not "checked and found safe".
    const gate = computeSafetyGate(raw({ isHoneypot: null }));
    expect(gate.passed).toBe(false);
    expect(gate.checks.find((c) => c.id === "not_honeypot")?.result).toBe("unavailable");
    expect(gate.failedReasons.some((r) => r.includes("unavailable"))).toBe(true);
  });

  it("fails on a real honeypot detection", () => {
    const gate = computeSafetyGate(raw({ isHoneypot: true }));
    expect(gate.passed).toBe(false);
    expect(gate.checks.find((c) => c.id === "not_honeypot")).toMatchObject({ result: "fail" });
  });

  it("fails below the liquidity floor", () => {
    const gate = computeSafetyGate(raw({ liquidityUsd: 500 }));
    expect(gate.passed).toBe(false);
    expect(gate.checks.find((c) => c.id === "liquidity_floor")).toMatchObject({ result: "fail" });
  });

  it("fails when holder concentration exceeds the cap", () => {
    const gate = computeSafetyGate(raw({ top10HolderPct: 85 }));
    expect(gate.passed).toBe(false);
    expect(gate.checks.find((c) => c.id === "holder_concentration")).toMatchObject({ result: "fail" });
  });

  it("fails when buy or sell tax is too high", () => {
    const gate = computeSafetyGate(raw({ sellTaxPct: 25 }));
    expect(gate.passed).toBe(false);
    expect(gate.checks.find((c) => c.id === "tax_within_bounds")).toMatchObject({ result: "fail" });
  });

  it("fails when LP is not sufficiently locked or burned", () => {
    const gate = computeSafetyGate(raw({ lpLockedPct: 10 }));
    expect(gate.passed).toBe(false);
    expect(gate.checks.find((c) => c.id === "lp_locked_or_burned")).toMatchObject({ result: "fail" });
  });

  it("only evaluates EVM-applicable checks for an EVM token (no mint/freeze authority checks)", () => {
    const gate = computeSafetyGate(raw());
    const ids = gate.checks.map((c) => c.id);
    expect(ids).toContain("contract_verified");
    expect(ids).toContain("owner_renounced");
    expect(ids).not.toContain("mint_authority_revoked");
    expect(ids).not.toContain("freeze_authority_revoked");
  });

  it("only evaluates Solana-applicable checks for a Solana token (no contract-verified/owner-renounced checks)", () => {
    const gate = computeSafetyGate(solanaRaw());
    const ids = gate.checks.map((c) => c.id);
    expect(ids).toContain("mint_authority_revoked");
    expect(ids).toContain("freeze_authority_revoked");
    expect(ids).not.toContain("contract_verified");
    expect(ids).not.toContain("owner_renounced");
  });

  it("passes a well-formed Solana token", () => {
    const gate = computeSafetyGate(solanaRaw());
    expect(gate.passed).toBe(true);
  });

  it("fails a Solana token whose mint authority hasn't been revoked", () => {
    const gate = computeSafetyGate(solanaRaw({ mintAuthorityRevoked: false }));
    expect(gate.passed).toBe(false);
    expect(gate.checks.find((c) => c.id === "mint_authority_revoked")).toMatchObject({ result: "fail" });
  });
});

describe("computeDiscoveryTokenSignal", () => {
  it("forces opportunityScore to 0 and band to Unsafe when the safety gate fails, regardless of how good other factors look", () => {
    // Deep liquidity, well distributed, high turnover, well-seasoned — every
    // opportunity contributor would score high — but it's a honeypot.
    const sig = computeDiscoveryTokenSignal(
      raw({ isHoneypot: true, liquidityUsd: 1_000_000, top10HolderPct: 10, volume24hUsd: 2_000_000, poolCreatedAt: NOW - 7 * 24 * 3600_000 }),
      NOW,
    );
    expect(sig.safety.passed).toBe(false);
    expect(sig.opportunityScore).toBe(0);
    expect(sig.band).toBe("Unsafe");
    // The underlying contributor math still ran (it's informational/debuggable) even though it's zeroed out above.
    expect(sig.contributors.liquidityDepth).toBeGreaterThan(0);
  });

  it("gives a strong, safety-passed token a high opportunity score and Strong Signal band", () => {
    const sig = computeDiscoveryTokenSignal(
      raw({ liquidityUsd: 800_000, top10HolderPct: 15, volume24hUsd: 1_500_000, poolCreatedAt: NOW - 5 * 24 * 3600_000 }),
      NOW,
    );
    expect(sig.safety.passed).toBe(true);
    expect(sig.opportunityScore).toBeGreaterThanOrEqual(75);
    expect(sig.band).toBe("Strong Signal");
  });

  it("gives a just-passed-but-thin token a low Caution-band score, not an inflated one", () => {
    const sig = computeDiscoveryTokenSignal(
      raw({ liquidityUsd: 2_100, top10HolderPct: 49, volume24hUsd: 100, poolCreatedAt: NOW - 5 * 60_000 }),
      NOW,
    );
    expect(sig.safety.passed).toBe(true);
    expect(sig.band).toBe("Caution");
    expect(sig.opportunityScore).toBeLessThan(45);
  });

  it("reports safetyScore independently of opportunityScore", () => {
    // Passes every check (safetyScore should be 100) but thin liquidity keeps opportunityScore low.
    const sig = computeDiscoveryTokenSignal(raw({ liquidityUsd: 2_100, volume24hUsd: 50 }), NOW);
    expect(sig.safetyScore).toBe(100);
    expect(sig.opportunityScore).toBeLessThan(sig.safetyScore);
  });

  it("computes ageMinutes from poolCreatedAt relative to the supplied clock", () => {
    const sig = computeDiscoveryTokenSignal(raw({ poolCreatedAt: NOW - 90 * 60_000 }), NOW);
    expect(sig.ageMinutes).toBe(90);
  });

  it("treats a missing poolCreatedAt as brand new (age 0) rather than throwing", () => {
    const sig = computeDiscoveryTokenSignal(raw({ poolCreatedAt: null }), NOW);
    expect(sig.ageMinutes).toBe(0);
    expect(sig.contributors.ageSeasoning).toBe(0);
  });

  it("surfaces the failure reason in tags when the gate fails", () => {
    const sig = computeDiscoveryTokenSignal(raw({ liquidityUsd: 100 }), NOW);
    expect(sig.tags.some((t) => t.toLowerCase().includes("liquidity"))).toBe(true);
  });
});
