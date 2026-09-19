import { describe, expect, it } from "vitest";
import { computeSmartMoney } from "../smart-money";
import { WHALE_METHODOLOGY } from "../whale-intel";
import type { WhaleAssetSignal, WhaleIntel, WhalePhase } from "../whale-intel";

function signal(symbol: string, phase: WhalePhase, score: number): WhaleAssetSignal {
  return { symbol, name: symbol, phase, impact: "Medium", volumeSpike: 1, priceImpact: 0, liquidityShift: 0, score, reason: "test" };
}

function whaleWith(topSignals: WhaleAssetSignal[], score = 50): WhaleIntel {
  const accumulating = topSignals.filter((s) => s.phase === "Accumulation").length;
  const distributing = topSignals.filter((s) => s.phase === "Distribution").length;
  return { score, phase: "Neutral", impact: "Medium", topSignals, accumulating, distributing, methodology: WHALE_METHODOLOGY };
}

describe("computeSmartMoney", () => {
  it("returns the documented empty-input default when there are no whale signals", () => {
    const out = computeSmartMoney(whaleWith([]));
    expect(out).toEqual({
      clusters: [],
      confidenceScore: 25,
      dominantClass: "Mixed Flow / Uncertain",
      coordinationIndex: 0,
      methodology: WHALE_METHODOLOGY,
    });
  });

  // dominantClass = acc > dist + 1 ? Institutional : dist > acc + 1 ? Whale
  // : Mixed — a strict "+1" margin, the same shape as whale-intel's own
  // phase boundary. A 2-vs-1 split must NOT call it; only 3-vs-1 (or wider)
  // does.
  it("requires accumulation to exceed distribution by more than one to call dominantClass", () => {
    const tied = computeSmartMoney(
      whaleWith([signal("A", "Accumulation", 50), signal("B", "Accumulation", 50), signal("C", "Distribution", 50)]),
    );
    expect(tied.dominantClass).toBe("Mixed Flow / Uncertain");

    const clear = computeSmartMoney(
      whaleWith([
        signal("A", "Accumulation", 50),
        signal("B", "Accumulation", 50),
        signal("C", "Accumulation", 50),
        signal("D", "Distribution", 50),
      ]),
    );
    expect(clear.dominantClass).toBe("Institutional Accumulation Cluster");
  });

  // cluster confidence = avgScore * 0.7 + g.length * 8, clamped — with
  // enough correlated signals the raw value (e.g. 100*0.7 + 20*8 = 230) is
  // far past 100 before the clamp; confirm the clamp actually holds instead
  // of leaking an out-of-range confidence into a user-facing cluster card.
  it("clamps confidence to 0..100 even with a large, high-scoring signal cluster", () => {
    const signals = Array.from({ length: 20 }, (_, i) => signal(`A${i}`, "Accumulation", 100));
    const out = computeSmartMoney(whaleWith(signals, 100));
    expect(out.clusters).toHaveLength(1);
    expect(out.clusters[0]!.confidence).toBeLessThanOrEqual(100);
    expect(out.clusters[0]!.confidence).toBeGreaterThanOrEqual(0);
    expect(out.confidenceScore).toBeLessThanOrEqual(100);
    expect(out.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(out.coordinationIndex).toBeLessThanOrEqual(100);
  });
});
