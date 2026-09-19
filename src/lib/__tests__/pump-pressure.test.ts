import { describe, expect, it } from "vitest";
import { computePumpPressure } from "../pump-pressure";
import type { MarketSnapshot } from "../market";
import type { WhaleIntel } from "../whale-intel";
import type { SentimentIntel } from "../sentiment-intel";
import type { NarrativeIntel } from "../narrative-engine";
import type { IgnitionSignal, IgnitionStage, MomentumIgnitionIntel } from "../momentum-ignition";
import type { SmartMoneyIntel } from "../smart-money";

function snapshotWith(marketCapChange: number, btcDominanceChange: number): MarketSnapshot {
  return {
    marketOverview: {
      btcPrice: 60_000,
      btcChange24h: 0.5,
      btcTrend: "neutral",
      btcDominance: 50,
      btcDominanceChange,
      sentiment: { score: 50, label: "Neutral" },
      liquidityFlow: { target: "Bitcoin", strength: 50 },
      totalMarketCap: 2_000_000_000_000,
      marketCapChange,
      volume24h: 100_000_000_000,
    },
    categoryFlows: [],
    narratives: [],
    coinIntel: [],
    memeCoins: [],
    tickerStream: [],
  };
}

const EMPTY_TOP_BY_STAGE: Record<IgnitionStage, IgnitionSignal[]> = {
  Dormant: [],
  "Speculative Accumulation": [],
  "Pre-Breakout Conditions": [],
  "Early Momentum Detected": [],
  "Active Breakout": [],
};

function whale(score: number, phase: WhaleIntel["phase"] = "Neutral"): WhaleIntel {
  return { score, phase, impact: "Medium", topSignals: [], accumulating: 0, distributing: 0, methodology: "test" };
}

function sentiment(score: number, volumeExpansion: number, trend: SentimentIntel["trend"] = "Stable"): SentimentIntel {
  return {
    score,
    state: "Neutral",
    trend,
    components: { priceAcceleration: 50, volumeExpansion, volatilitySpike: 50, momentumConsistency: 50, fearGreed: null },
    socialOverlay: null,
  };
}

function narrative(aggregateStrength: number, topEmergingCount = 0): NarrativeIntel {
  const topEmerging: NarrativeIntel["topEmerging"] = Array.from({ length: topEmergingCount }, (_, i) => ({
    id: `n${i}`,
    label: "test",
    category: "Cross-Sector" as const,
    strength: 50,
    acceleration: "rising" as const,
    correlation: 0.5,
    volumeSurge: 1,
    momentumAlignment: 0.5,
    assets: [] as string[],
    thesis: "test",
    emerging: true,
  }));
  return { detected: [], topEmerging, aggregateStrength, rotationVelocity: 0 };
}

function ignition(ignitionScore: number): MomentumIgnitionIntel {
  return { signals: [], topByStage: EMPTY_TOP_BY_STAGE, sectorSync: 50, ignitionScore };
}

function smart(coordinationIndex: number): SmartMoneyIntel {
  return { clusters: [], confidenceScore: 50, dominantClass: "Mixed Flow / Uncertain", coordinationIndex, methodology: "test" };
}

describe("computePumpPressure", () => {
  it("clamps the composite score within 0..100 under maxed-out adversarial inputs", () => {
    const out = computePumpPressure(
      snapshotWith(1000, -1000),
      whale(1000, "Accumulation"),
      sentiment(1000, 1000, "Rising"),
      narrative(1000, 3),
      ignition(1000),
      smart(1000),
    );
    expect(out.score).toBeLessThanOrEqual(100);
    expect(out.score).toBeGreaterThanOrEqual(0);
    expect(out.band).toBe("Extreme");
  });

  it("clamps the composite score within 0..100 under minimal/negative adversarial inputs", () => {
    const out = computePumpPressure(
      snapshotWith(-1000, 1000),
      whale(1000, "Distribution"),
      sentiment(-1000, -1000, "Falling"),
      narrative(-1000),
      ignition(-1000),
      smart(0),
    );
    expect(out.score).toBeGreaterThanOrEqual(0);
    expect(out.score).toBeLessThanOrEqual(100);
    expect(out.band).toBe("Low");
  });

  // contributors.volumeExpansion and contributors.momentumIgnition are typed
  // as 0..100 in PumpPressureIntel (same contract as every other field in
  // that object). Found by a test-coverage audit: unlike liquidityInflow/
  // sentimentAccel/narrativeStrength/whaleAlignment — each wrapped in
  // clamp() at its computation site — these two were assigned straight from
  // the upstream SentimentIntel/MomentumIgnitionIntel objects with no
  // clamp() of their own, then reported unclamped in `contributors`. In
  // real traffic those upstream fields are already clamped by their own
  // compute functions, so this couldn't fire in production today — but
  // nothing in this file enforced that at its own boundary, so a future
  // caller (or a bug in an upstream layer) could have pushed these two
  // reported percentages outside the range every UI consumer assumes.
  // Fixed by clamping both at their computation site, matching every
  // sibling field.
  it("keeps contributors.volumeExpansion / contributors.momentumIgnition within 0..100", () => {
    const out = computePumpPressure(
      snapshotWith(0, 0),
      whale(50, "Neutral"),
      sentiment(50, 250 /* out-of-contract upstream value */),
      narrative(50),
      ignition(-80 /* out-of-contract upstream value */),
      smart(50),
    );
    expect(out.contributors.volumeExpansion).toBeLessThanOrEqual(100);
    expect(out.contributors.volumeExpansion).toBeGreaterThanOrEqual(0);
    expect(out.contributors.momentumIgnition).toBeLessThanOrEqual(100);
    expect(out.contributors.momentumIgnition).toBeGreaterThanOrEqual(0);
  });
});
