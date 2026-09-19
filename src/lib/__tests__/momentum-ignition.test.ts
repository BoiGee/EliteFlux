import { describe, expect, it } from "vitest";
import { computeMomentumIgnition } from "../momentum-ignition";
import type { CoinIntel, MarketSnapshot } from "../market";
import type { HistoryMap } from "../whale-intel";

function coin(symbol: string, category: CoinIntel["category"] = "Large Cap"): CoinIntel {
  return {
    symbol,
    name: symbol,
    category,
    price: 100,
    change24h: 0,
    momentum: 0,
    risk: "Medium",
    btcCorrelation: "High",
    flow: "Accumulation",
  };
}

function snapshotWith(coins: CoinIntel[]): MarketSnapshot {
  return {
    marketOverview: {
      btcPrice: 60_000,
      btcChange24h: 0.5,
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

describe("computeMomentumIgnition", () => {
  it("returns safe defaults with no NaN for an empty coin universe", () => {
    const out = computeMomentumIgnition(snapshotWith([]), {});
    expect(out.signals).toEqual([]);
    expect(out.ignitionScore).toBe(25);
    expect(out.sectorSync).toBe(50);
    expect(out.topByStage.Dormant).toEqual([]);
    expect(out.topByStage["Speculative Accumulation"]).toEqual([]);
    expect(out.topByStage["Pre-Breakout Conditions"]).toEqual([]);
    expect(out.topByStage["Early Momentum Detected"]).toEqual([]);
    expect(out.topByStage["Active Breakout"]).toEqual([]);
  });

  // computeRange returns 0 for a flat (zero-range) window, and
  // volatilityCompression's ternary explicitly branches to 0 rather than
  // dividing by olderRange when olderRange isn't > 0 — confirm a perfectly
  // flat baseline (a real case: a low-liquidity coin sitting at one price
  // tick for a while) doesn't produce NaN and reports compression as
  // exactly 0, not some divide-by-near-zero artifact.
  it("reports zero volatility compression (not NaN) when the baseline price never moved", () => {
    const history: HistoryMap = {
      BTC: [
        { ts: 0, price: 100, quoteVolume: 1_000_000 },
        { ts: 1, price: 100, quoteVolume: 1_000_000 },
        { ts: 2, price: 100, quoteVolume: 1_000_000 },
        { ts: 3, price: 100, quoteVolume: 3_000_000 },
        { ts: 4, price: 105, quoteVolume: 3_000_000 },
        { ts: 5, price: 110, quoteVolume: 3_000_000 },
      ],
    };
    const out = computeMomentumIgnition(snapshotWith([coin("BTC")]), history);
    const sig = out.signals.find((s) => s.symbol === "BTC");
    expect(sig).toBeDefined();
    expect(sig!.volatilityCompression).toBe(0);
    expect(Number.isFinite(sig!.expansionRate)).toBe(true);
    expect(sig!.score).toBeGreaterThanOrEqual(0);
    expect(sig!.score).toBeLessThanOrEqual(100);
  });

  // score is built from `40 + (volumeBuild - 1) * 38 + ...` with volumeBuild
  // itself an unclamped ratio (recentVol / olderVol) — only the final score
  // is clamped. Confirm an extreme, realistic volume ratio (near-zero
  // baseline volume waking up) still yields a score inside 0..100, not an
  // overflowed or NaN value leaking through the outer clamp.
  it("keeps score within 0..100 for an extreme volume-build ratio", () => {
    const history: HistoryMap = {
      BTC: [
        { ts: 0, price: 100, quoteVolume: 0.001 },
        { ts: 1, price: 100, quoteVolume: 0.001 },
        { ts: 2, price: 100, quoteVolume: 0.001 },
        { ts: 3, price: 100, quoteVolume: 10_000_000 },
        { ts: 4, price: 100, quoteVolume: 10_000_000 },
        { ts: 5, price: 100, quoteVolume: 10_000_000 },
      ],
    };
    const out = computeMomentumIgnition(snapshotWith([coin("BTC")]), history);
    const sig = out.signals.find((s) => s.symbol === "BTC");
    expect(sig).toBeDefined();
    expect(Number.isFinite(sig!.score)).toBe(true);
    expect(sig!.score).toBeGreaterThanOrEqual(0);
    expect(sig!.score).toBeLessThanOrEqual(100);
    expect(out.ignitionScore).toBeGreaterThanOrEqual(0);
    expect(out.ignitionScore).toBeLessThanOrEqual(100);
  });
});
