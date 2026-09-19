import { describe, expect, it } from "vitest";
import { computeExitIntel } from "../exit-intel";
import type { CoinIntel, MarketSnapshot } from "../market";
import type { HistoryMap, WhaleIntel } from "../whale-intel";
import type { SentimentIntel } from "../sentiment-intel";
import type { NarrativeIntel } from "../narrative-engine";
import type { PumpPressureIntel } from "../pump-pressure";
import type { OnChainIntel } from "../onchain-intel";

function coin(symbol: string, overrides: Partial<CoinIntel> = {}): CoinIntel {
  return {
    symbol,
    name: symbol,
    category: "Large Cap",
    price: 100,
    change24h: 0,
    momentum: 0,
    risk: "Medium",
    btcCorrelation: "High",
    flow: "Accumulation",
    ...overrides,
  };
}

function snapshotWith(coins: CoinIntel[], btcChange24h = 0): MarketSnapshot {
  return {
    marketOverview: {
      btcPrice: 60_000,
      btcChange24h,
      btcTrend: "neutral",
      btcDominance: 50,
      btcDominanceChange: 0,
      sentiment: { score: 50, label: "Neutral" },
      liquidityFlow: { target: "Bitcoin", strength: 50 },
      totalMarketCap: 2_000_000_000_000,
      marketCapChange: 0,
      volume24h: 100_000_000_000,
    },
    categoryFlows: [],
    narratives: [],
    coinIntel: coins,
    memeCoins: [],
    tickerStream: [],
  };
}

function sentimentFixture(score: number): SentimentIntel {
  return {
    score,
    state: "Neutral",
    trend: "Stable",
    components: { priceAcceleration: 50, volumeExpansion: 50, volatilitySpike: 50, momentumConsistency: 50, fearGreed: null },
    socialOverlay: null,
  };
}

const NEUTRAL_NARRATIVE: NarrativeIntel = { detected: [], topEmerging: [], aggregateStrength: 50, rotationVelocity: 0 };
const NEUTRAL_PRESSURE: PumpPressureIntel = {
  score: 50,
  band: "Moderate",
  contributors: { liquidityInflow: 50, sentimentAccel: 50, volumeExpansion: 50, narrativeStrength: 50, whaleAlignment: 50, momentumIgnition: 50 },
  rationale: "test",
};
const EMPTY_ONCHAIN: OnChainIntel = { signals: [], perAsset: {}, smartMoneyConfidenceIndex: 50, marketConvictionScore: 50, generatedAt: 0 };

describe("computeExitIntel", () => {
  // The per-asset "skip" guard is `score < 12 && tags.length === 0` — an
  // asset with ANY tag stays in the output even at a very low score, while
  // one with zero signal is dropped entirely. Lock in both sides of that
  // boundary with a real, weak-but-real distribution signal.
  it("keeps a weak-but-tagged asset while dropping a signal-free one", () => {
    const whale: WhaleIntel = {
      score: 10,
      phase: "Distribution",
      impact: "Low",
      topSignals: [
        { symbol: "HOT", name: "HOT", phase: "Distribution", impact: "Low", volumeSpike: 1, priceImpact: -1, liquidityShift: 0, score: 10, reason: "test" },
      ],
      accumulating: 0,
      distributing: 1,
      methodology: "test",
    };
    const snapshot = snapshotWith([coin("HOT"), coin("FLAT")]);
    const out = computeExitIntel(snapshot, {}, whale, sentimentFixture(50), NEUTRAL_NARRATIVE, NEUTRAL_PRESSURE, EMPTY_ONCHAIN);

    expect(out.perAsset["HOT"]).toBeDefined();
    expect(out.perAsset["HOT"]!.exitPressureScore).toBe(3);
    expect(out.perAsset["HOT"]!.tags).toContain("Smart Money Distribution");

    expect(out.perAsset["FLAT"]).toBeUndefined();
    expect(out.assets.map((a) => a.symbol)).toEqual(["HOT"]);
  });

  // Composite score is a weighted sum of five independently-clamped
  // contributors that sum to exactly 1.0 (0.32+0.22+0.2+0.14+0.12) — verify
  // that stacking every contributor at once (a real "everything is flashing
  // red at the same time" market moment) still produces a finite, in-range
  // score rather than a NaN from one of the underlying slope/ratio
  // computations.
  it("stays within 0..100 and finite when every exit-pressure signal fires at once", () => {
    const history: HistoryMap = {
      HOT: [
        { ts: 0, price: 70, quoteVolume: 5_000_000 },
        { ts: 1, price: 75, quoteVolume: 5_000_000 },
        { ts: 2, price: 80, quoteVolume: 5_000_000 },
        { ts: 3, price: 100, quoteVolume: 1_000_000 },
        { ts: 4, price: 100.3, quoteVolume: 1_000_000 },
        { ts: 5, price: 100.5, quoteVolume: 1_000_000 },
      ],
    };
    const whale: WhaleIntel = {
      score: 100,
      phase: "Distribution",
      impact: "High",
      topSignals: [
        { symbol: "HOT", name: "HOT", phase: "Distribution", impact: "High", volumeSpike: 1, priceImpact: -5, liquidityShift: 0, score: 100, reason: "test" },
      ],
      accumulating: 0,
      distributing: 1,
      methodology: "test",
    };
    const onchain: OnChainIntel = {
      signals: [],
      perAsset: {
        HOT: {
          id: "HOT:large_single_transfer:1",
          type: "large_single_transfer",
          walletGroup: "whale",
          asset: "HOT",
          assetName: "HOT",
          intensity: 90,
          confidence: "high",
          netFlowUsd: -3_000_000,
          exchangeNetUsd: 3_000_000,
          walletsInvolved: 1,
          rationale: "test",
          timestamp: 1,
        },
      },
      smartMoneyConfidenceIndex: 50,
      marketConvictionScore: 50,
      generatedAt: 1,
    };
    const narrative: NarrativeIntel = { detected: [], topEmerging: [], aggregateStrength: 50, rotationVelocity: 100 };
    const snapshot = snapshotWith([coin("HOT", { momentum: 70, change24h: 2 })]);

    const out = computeExitIntel(snapshot, history, whale, sentimentFixture(100), narrative, NEUTRAL_PRESSURE, onchain);
    const hot = out.perAsset["HOT"];
    expect(hot).toBeDefined();
    expect(Number.isFinite(hot!.exitPressureScore)).toBe(true);
    expect(hot!.exitPressureScore).toBeGreaterThanOrEqual(0);
    expect(hot!.exitPressureScore).toBeLessThanOrEqual(100);
    expect(out.marketExitPressure).toBeGreaterThanOrEqual(0);
    expect(out.marketExitPressure).toBeLessThanOrEqual(100);
  });

  it("returns safe zeroed defaults with no NaN for an empty coin universe", () => {
    const neutralWhale: WhaleIntel = { score: 0, phase: "Neutral", impact: "Low", topSignals: [], accumulating: 0, distributing: 0, methodology: "test" };
    const out = computeExitIntel(snapshotWith([]), {}, neutralWhale, sentimentFixture(50), NEUTRAL_NARRATIVE, NEUTRAL_PRESSURE, EMPTY_ONCHAIN);
    expect(out.assets).toEqual([]);
    expect(out.perAsset).toEqual({});
    expect(out.marketExitPressure).toBe(0);
    expect(out.marketBand).toBe("Strong Hold");
    expect(out.reversalWindow).toBe("No elevated reversal signal in the current cycle phase");
    expect(out.systemMessages).toEqual([]);
  });
});
