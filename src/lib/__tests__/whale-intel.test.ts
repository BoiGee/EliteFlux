import { describe, expect, it } from "vitest";
import { computeWhaleIntel } from "../whale-intel";
import type { CoinIntel, MarketSnapshot } from "../market";
import type { HistoryMap, SymbolHistorySample } from "../whale-intel";

function coin(symbol: string): CoinIntel {
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
  };
}

function snapshotWith(symbols: string[]): MarketSnapshot {
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
    coinIntel: symbols.map((s) => coin(s)),
    memeCoins: [],
    tickerStream: [],
  };
}

// scoreCoin requires hist.length >= 4 and a baseline (everything but the
// last 3 samples) of at least 2 — 2 baseline + 3 "recent" samples is the
// minimum real split this function actually exercises.
function whaleHistory(baseVol: number, recentPrices: number[], recentVol: number): SymbolHistorySample[] {
  return [
    { ts: 0, price: 100, quoteVolume: baseVol },
    { ts: 1, price: 100, quoteVolume: baseVol },
    ...recentPrices.map((price, i) => ({ ts: 2 + i, price, quoteVolume: recentVol })),
  ];
}

// A clean, strong accumulation pattern: volume triples in the recent window
// and price runs up meaningfully — comfortably clears the score>=18 floor.
// Used by the extraSymbols tests below (kept distinct from whaleHistory
// above since those tests care about reproducing a specific prior-verified
// scenario, not about the baseline/recent volume ratio itself).
function spikeHistory(): SymbolHistorySample[] {
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
  // avgBaseVol = baseline.reduce(...) / baseline.length || 1 — protects the
  // volumeSpike = avgRecentVol / avgBaseVol division from an exact-zero
  // baseline (real scenario: a thinly-traded coin with zero recorded volume
  // in its baseline window).
  it("does not divide by zero when the baseline volume is entirely zero", () => {
    const history: HistoryMap = {
      BTC: whaleHistory(0, [100, 101, 102], 5_000_000),
    };
    const out = computeWhaleIntel(snapshotWith(["BTC"]), history);
    expect(Number.isFinite(out.score)).toBe(true);
    expect(out.score).toBeGreaterThanOrEqual(0);
    expect(out.score).toBeLessThanOrEqual(100);
    for (const s of out.topSignals) {
      expect(Number.isFinite(s.volumeSpike)).toBe(true);
      expect(Number.isFinite(s.score)).toBe(true);
    }
  });

  // globalScore/spikeScore/impactScore are individually clamped, but
  // volumeSpike itself (avgRecentVol / avgBaseVol) is NOT clamped before
  // being fed into those — confirm a near-zero (not exactly zero) baseline
  // doesn't produce NaN/Infinity leaking into the final, rounded score.
  it("keeps the score within 0..100 for a near-zero baseline volume (extreme spike ratio)", () => {
    const history: HistoryMap = {
      BTC: whaleHistory(1, [100, 150, 300], 50_000_000),
    };
    const out = computeWhaleIntel(snapshotWith(["BTC"]), history);
    expect(out.score).toBeGreaterThanOrEqual(0);
    expect(out.score).toBeLessThanOrEqual(100);
    for (const s of out.topSignals) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
    }
  });

  // phase = accumulating > distributing + 1 ? "Accumulation" : ... — a
  // strict "+1" margin is required, not a simple majority. Confirm the
  // boundary: 2-vs-0 flips to Accumulation, but 1-vs-0 does not.
  it("requires accumulating to exceed distributing by more than one to call the phase", () => {
    const strongUp = whaleHistory(1_000_000, [100, 102, 104], 3_000_000); // +4% on 3x volume

    const two = computeWhaleIntel(snapshotWith(["A", "B"]), { A: strongUp, B: strongUp });
    expect(two.accumulating).toBe(2);
    expect(two.distributing).toBe(0);
    expect(two.phase).toBe("Accumulation");

    const one = computeWhaleIntel(snapshotWith(["A"]), { A: strongUp });
    expect(one.accumulating).toBe(1);
    expect(one.distributing).toBe(0);
    expect(one.phase).toBe("Neutral");
  });

  // extraSymbols widens detection beyond the curated coin set (added when
  // market coverage widened to the ~300-coin baseline) without moving the
  // curated aggregate score/phase/impact — these four were the original
  // coverage for that parameter before this file was extended with the
  // boundary/clamp tests above; kept so that widening coverage doesn't
  // regress this real, separate behavior.
  it("omitting extraSymbols reproduces prior curated-only behavior", () => {
    const snap = snapshotWith(["BTC", "ETH"]);
    const history: HistoryMap = { BTC: spikeHistory() };

    const withoutExtra = computeWhaleIntel(snap, history);
    const withEmptyExtra = computeWhaleIntel(snap, history, []);

    expect(withEmptyExtra).toEqual(withoutExtra);
    expect(withoutExtra.topSignals.map((s) => s.symbol)).toEqual(["BTC"]);
  });

  it("a high-scoring extra-only signal appears in topSignals without moving the curated aggregate", () => {
    const snap = snapshotWith(["BTC"]);
    // BTC has no history -> no curated signal at all, so the baseline is a
    // fully neutral aggregate.
    const history: HistoryMap = { BTC: [], SHIB2: spikeHistory() };

    const baseline = computeWhaleIntel(snap, history);
    const widened = computeWhaleIntel(snap, history, [{ symbol: "SHIB2", name: "Shib Two" }]);

    expect(baseline.topSignals).toEqual([]);
    expect(widened.topSignals.map((s) => s.symbol)).toEqual(["SHIB2"]);
    expect(widened.topSignals[0]!.name).toBe("Shib Two");

    // The aggregate stays anchored to the curated set only.
    expect(widened.score).toBe(baseline.score);
    expect(widened.phase).toBe(baseline.phase);
    expect(widened.impact).toBe(baseline.impact);
    expect(widened.accumulating).toBe(baseline.accumulating);
    expect(widened.distributing).toBe(baseline.distributing);
  });

  it("falls back to symbol as the display name when extraSymbols omits one", () => {
    const snap = snapshotWith([]);
    const history: HistoryMap = { NONAME: spikeHistory() };

    const result = computeWhaleIntel(snap, history, [{ symbol: "NONAME" }]);

    expect(result.topSignals).toHaveLength(1);
    expect(result.topSignals[0]!.name).toBe("NONAME");
  });

  it("does not duplicate a symbol that is already in the curated set", () => {
    const snap = snapshotWith(["BTC"]);
    const history: HistoryMap = { BTC: spikeHistory() };

    const result = computeWhaleIntel(snap, history, [{ symbol: "BTC", name: "Duplicate Bitcoin" }]);

    const btcSignals = result.topSignals.filter((s) => s.symbol === "BTC");
    expect(btcSignals).toHaveLength(1);
    expect(btcSignals[0]!.name).toBe("BTC"); // curated name wins, not the extra-list one
  });
});
