import { describe, expect, it } from "vitest";
import { computeNarrativeIntel } from "../narrative-engine";
import type { CoinIntel, MarketSnapshot } from "../market";
import type { HistoryMap } from "../whale-intel";

function coin(symbol: string, category: CoinIntel["category"], change24h: number): CoinIntel {
  return {
    symbol,
    name: symbol,
    category,
    price: 100,
    change24h,
    momentum: 0,
    risk: "Medium",
    btcCorrelation: "High",
    flow: change24h >= 0 ? "Accumulation" : "Distribution",
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

describe("computeNarrativeIntel", () => {
  // A category needs >= 2 coins to form a narrative bucket at all. With one
  // coin per category, every bucket is skipped — confirm the aggregate
  // falls back cleanly instead of NaN-ing on an empty `detected` array.
  it("falls back to safe defaults when no category has 2+ coins", () => {
    const snapshot = snapshotWith([
      coin("BTC", "Large Cap", 1),
      coin("SOL", "L1", 2),
      coin("FET", "AI", 3),
      coin("DOGE", "Meme", -1),
      coin("LINK", "Infra", 0.5),
      coin("ONDO", "RWA", 1.5),
    ]);
    const out = computeNarrativeIntel(snapshot, {});
    expect(out.detected).toEqual([]);
    expect(out.topEmerging).toEqual([]);
    expect(out.aggregateStrength).toBe(50);
    expect(out.rotationVelocity).toBe(0);
  });

  // sameDir only counts coins whose sign matches the bucket mean, AND
  // explicitly requires mean !== 0 — so a perfectly balanced 50/50 split
  // (mean == 0) reports momentumAlignment 0, not 0.5, even though every coin
  // in the bucket is clearly moving. Real risk: a caller reading
  // momentumAlignment as "share of coins trending together" would badly
  // misread a bucket that's actually split evenly but net-flat.
  it("reports momentumAlignment 0 (not 0.5) when a bucket's mean change is exactly zero", () => {
    const snapshot = snapshotWith([coin("FET", "AI", 5), coin("TAO", "AI", -5)]);
    const out = computeNarrativeIntel(snapshot, {});
    const ai = out.detected.find((n) => n.id === "ai");
    expect(ai).toBeDefined();
    expect(ai!.momentumAlignment).toBe(0);
    expect(Number.isFinite(ai!.correlation)).toBe(true);
    expect(Number.isFinite(ai!.strength)).toBe(true);
  });

  // volumeSurge = recentV / olderV is not clamped before being folded into
  // `strength` — only the final `strength` is clamped. Confirm an extreme,
  // realistic-shape surge (a coin going from near-zero to real volume) still
  // keeps strength/correlation within their documented ranges.
  it("keeps strength within 0..100 under an extreme volume surge", () => {
    const history: HistoryMap = {
      FET: [
        { ts: 0, price: 100, quoteVolume: 1 },
        { ts: 1, price: 100, quoteVolume: 1 },
        { ts: 2, price: 100, quoteVolume: 1_000_000 },
        { ts: 3, price: 100, quoteVolume: 1_000_000 },
      ],
      TAO: [
        { ts: 0, price: 100, quoteVolume: 1 },
        { ts: 1, price: 100, quoteVolume: 1 },
        { ts: 2, price: 100, quoteVolume: 1_000_000 },
        { ts: 3, price: 100, quoteVolume: 1_000_000 },
      ],
    };
    const snapshot = snapshotWith([coin("FET", "AI", 5), coin("TAO", "AI", 5)]);
    const out = computeNarrativeIntel(snapshot, history);
    const ai = out.detected.find((n) => n.id === "ai");
    expect(ai).toBeDefined();
    expect(ai!.strength).toBeLessThanOrEqual(100);
    expect(ai!.strength).toBeGreaterThanOrEqual(0);
    expect(ai!.correlation).toBeLessThanOrEqual(1);
    expect(ai!.correlation).toBeGreaterThanOrEqual(0);
    expect(out.aggregateStrength).toBeLessThanOrEqual(100);
    expect(out.rotationVelocity).toBeLessThanOrEqual(100);
  });
});
