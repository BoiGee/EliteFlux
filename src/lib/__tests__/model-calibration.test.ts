import { describe, expect, it } from "vitest";
import {
  calibrateScore,
  computeConfidence,
  deriveWeights,
  detectDrift,
  isHit,
  layerAgreement,
} from "../model-calibration";

describe("isHit", () => {
  it("treats a rise as a hit for a bullish high score", () => {
    expect(isHit("momentum", 75, 3)).toBe(true);
    expect(isHit("momentum", 75, -3)).toBe(false);
  });
  it("inverts the test for bearish signal families", () => {
    expect(isHit("exit_pressure", 80, -4)).toBe(true);
    expect(isHit("exit_pressure", 80, 4)).toBe(false);
  });
  it("returns null for mid-band scores and noise moves", () => {
    expect(isHit("momentum", 50, 5)).toBeNull();
    expect(isHit("momentum", 90, 0.1)).toBeNull();
  });
});

describe("deriveWeights", () => {
  const base = { a: 0.5, b: 0.5 };
  it("returns the base blend when there is no measured history", () => {
    const w = deriveWeights(base, {});
    expect(w.a).toBeCloseTo(0.5);
    expect(w.b).toBeCloseTo(0.5);
  });
  it("shifts weight towards the more accurate layer", () => {
    const w = deriveWeights(base, {
      a: { samples: 100, hitRate: 0.8, avgReturnPct: 2 },
      b: { samples: 100, hitRate: 0.4, avgReturnPct: -1 },
    });
    expect(w.a).toBeGreaterThan(w.b);
    expect(w.a + w.b).toBeCloseTo(1);
  });
  it("barely moves on a tiny sample", () => {
    const w = deriveWeights(base, { a: { samples: 2, hitRate: 1, avgReturnPct: 5 } });
    expect(Math.abs(w.a - 0.5)).toBeLessThan(0.05);
  });
  it("never lets a layer collapse to zero", () => {
    const w = deriveWeights(base, { a: { samples: 500, hitRate: 0, avgReturnPct: -9 } });
    expect(w.a).toBeGreaterThan(0.1);
  });
});

describe("calibrateScore", () => {
  const bands = [{ min: 70, max: 100, hitRate: 0.5, samples: 200 }];
  it("pulls an inflated score towards measured reliability", () => {
    expect(calibrateScore(95, bands)).toBeLessThan(95);
  });
  it("leaves the score alone without enough history", () => {
    expect(calibrateScore(95, [{ min: 70, max: 100, hitRate: 0.2, samples: 3 }])).toBe(95);
  });
});

describe("computeConfidence", () => {
  it("is high on fresh, agreeing, well-backed reads", () => {
    const c = computeConfidence({ dataAgeMs: 10_000, degradedSource: false, layerAgreement: 0.9, historyDepth: 0.9 });
    expect(c.band).toBe("High");
    expect(c.reasons).toHaveLength(0);
  });
  it("drops and explains itself on stale degraded reads", () => {
    const c = computeConfidence({ dataAgeMs: 20 * 60_000, degradedSource: true, layerAgreement: 0.4, historyDepth: 0.2 });
    expect(c.band).toBe("Low");
    expect(c.reasons.length).toBeGreaterThan(2);
  });
});

describe("detectDrift", () => {
  it("flags a meaningful recent decline", () => {
    expect(
      detectDrift({ samples: 40, hitRate: 0.35, avgReturnPct: 0 }, { samples: 200, hitRate: 0.6, avgReturnPct: 0 })
        .drifting,
    ).toBe(true);
  });
  it("stays quiet without enough samples", () => {
    expect(
      detectDrift({ samples: 3, hitRate: 0, avgReturnPct: 0 }, { samples: 200, hitRate: 0.6, avgReturnPct: 0 }).drifting,
    ).toBe(false);
  });
});

describe("layerAgreement", () => {
  it("is 1 when every layer points the same way", () => {
    expect(layerAgreement([70, 80, 65])).toBe(1);
  });
  it("is near half on a split read", () => {
    expect(layerAgreement([70, 30])).toBeCloseTo(0.5);
  });
});
