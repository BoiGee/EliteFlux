import { describe, expect, it } from "vitest";
import { computeSentimentIntel } from "../sentiment-intel";
import type { CoinIntel, MarketSnapshot } from "../market";
import type { HistoryMap } from "../whale-intel";

function coin(symbol: string, change24h: number): CoinIntel {
  return {
    symbol,
    name: symbol,
    category: "Large Cap",
    price: 100,
    change24h,
    momentum: 0,
    risk: "Medium",
    btcCorrelation: "High",
    flow: "Accumulation",
  };
}

function history(prices: number[], quoteVolume = 1_000_000): HistoryMap[string] {
  return prices.map((price, i) => ({ ts: i, price, quoteVolume }));
}

const baseSnapshot: MarketSnapshot = {
  marketOverview: {
    btcPrice: 60_000,
    btcChange24h: 1,
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
  coinIntel: [coin("BTC", 5)],
  memeCoins: [],
  tickerStream: [],
};

const baseHistory: HistoryMap = {
  BTC: history([58_000, 59_000, 60_000, 61_000]),
};

// components.priceAcceleration/volumeExpansion/momentumConsistency/
// volatilitySpike are each clamped independently on the way in, but the
// final blended `score` used to skip its own clamp — a malformed
// Fear & Greed reading (real, upstream, keyless API data with no schema
// enforcement) could push the composite outside its documented 0..100
// contract. Confirmed live via code audit; fixed by clamping the composite
// itself, not just its inputs.
describe("computeSentimentIntel", () => {
  it("keeps score within 0..100 even with a wildly out-of-range fearGreed reading", () => {
    const high = computeSentimentIntel(baseSnapshot, baseHistory, null, 5000);
    expect(high.score).toBeLessThanOrEqual(100);
    expect(high.score).toBeGreaterThanOrEqual(0);

    const low = computeSentimentIntel(baseSnapshot, baseHistory, null, -5000);
    expect(low.score).toBeLessThanOrEqual(100);
    expect(low.score).toBeGreaterThanOrEqual(0);
  });

  it("stays within 0..100 for a normal, in-range fearGreed reading", () => {
    const r = computeSentimentIntel(baseSnapshot, baseHistory, null, 72);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });

  it("stays within 0..100 with no fearGreed data at all", () => {
    const r = computeSentimentIntel(baseSnapshot, baseHistory, null, null);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});
