import { describe, expect, it } from "vitest";
import { computeWhaleIntel, type HistoryMap } from "../whale-intel";
import type { MarketSnapshot, CoinIntel } from "../market";

function coin(symbol: string, name = symbol): CoinIntel {
  return {
    symbol,
    name,
    category: "Large Cap",
    price: 100,
    change24h: 1,
    momentum: 50,
    risk: "Medium",
    btcCorrelation: "Medium",
    flow: "Accumulation",
  };
}

function snapshot(coins: CoinIntel[]): MarketSnapshot {
  return {
    marketOverview: {} as MarketSnapshot["marketOverview"],
    categoryFlows: [],
    narratives: [],
    coinIntel: coins,
    memeCoins: [],
    tickerStream: [],
  };
}

// A clean, strong accumulation pattern: volume triples in the recent window
// and price runs up meaningfully — comfortably clears the score>=18 floor.
function spikeHistory(symbol: string): HistoryMap[string] {
  return [
    { ts: 0, price: 100, quoteVolume: 1_000_000 },
    { ts: 1, price: 100, quoteVolume: 1_000_000 },
    { ts: 2, price: 101, quoteVolume: 1_100_000 },
    { ts: 3, price: 103, quoteVolume: 3_000_000 },
    { ts: 4, price: 106, quoteVolume: 3_200_000 },
    { ts: 5, price: 109, quoteVolume: 3_500_000 },
  ];
}

describe("computeWhaleIntel", () => {
  it("omitting extraSymbols reproduces prior curated-only behavior", () => {
    const snap = snapshot([coin("BTC"), coin("ETH")]);
    const history: HistoryMap = { BTC: spikeHistory("BTC") };

    const withoutExtra = computeWhaleIntel(snap, history);
    const withEmptyExtra = computeWhaleIntel(snap, history, []);

    expect(withEmptyExtra).toEqual(withoutExtra);
    expect(withoutExtra.topSignals.map((s) => s.symbol)).toEqual(["BTC"]);
  });

  it("a high-scoring extra-only signal appears in topSignals without moving the curated aggregate", () => {
    const snap = snapshot([coin("BTC")]);
    // BTC has no history -> no curated signal at all, so the baseline is a
    // fully neutral aggregate.
    const history: HistoryMap = { BTC: [], SHIB2: spikeHistory("SHIB2") };

    const baseline = computeWhaleIntel(snap, history);
    const widened = computeWhaleIntel(snap, history, [{ symbol: "SHIB2", name: "Shib Two" }]);

    expect(baseline.topSignals).toEqual([]);
    expect(widened.topSignals.map((s) => s.symbol)).toEqual(["SHIB2"]);
    expect(widened.topSignals[0].name).toBe("Shib Two");

    // The aggregate stays anchored to the curated set only.
    expect(widened.score).toBe(baseline.score);
    expect(widened.phase).toBe(baseline.phase);
    expect(widened.impact).toBe(baseline.impact);
    expect(widened.accumulating).toBe(baseline.accumulating);
    expect(widened.distributing).toBe(baseline.distributing);
  });

  it("falls back to symbol as the display name when extraSymbols omits one", () => {
    const snap = snapshot([]);
    const history: HistoryMap = { NONAME: spikeHistory("NONAME") };

    const result = computeWhaleIntel(snap, history, [{ symbol: "NONAME" }]);

    expect(result.topSignals).toHaveLength(1);
    expect(result.topSignals[0].name).toBe("NONAME");
  });

  it("does not duplicate a symbol that is already in the curated set", () => {
    const snap = snapshot([coin("BTC")]);
    const history: HistoryMap = { BTC: spikeHistory("BTC") };

    const result = computeWhaleIntel(snap, history, [{ symbol: "BTC", name: "Duplicate Bitcoin" }]);

    const btcSignals = result.topSignals.filter((s) => s.symbol === "BTC");
    expect(btcSignals).toHaveLength(1);
    expect(btcSignals[0].name).toBe("BTC"); // curated name wins, not the extra-list one
  });
});
