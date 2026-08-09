import { describe, expect, it } from "vitest";
import { bestPerfMap, combinedShipVerdict, hasEnoughBreadth, type AccuracyRow } from "../signal-tracking.server";

const row = (overrides: Partial<AccuracyRow>): AccuracyRow => ({
  signalType: "whale",
  horizonHours: 24,
  samples: 10,
  hits: 5,
  hitRate: 0.5,
  avgReturnPct: 0,
  ...overrides,
});

describe("hasEnoughBreadth", () => {
  it("rejects volume concentrated in one family even when the aggregate looks sufficient", () => {
    // One well-sampled family + a dozen near-empty ones can still sum past
    // a naive aggregate threshold — this is exactly the loophole being closed.
    const rows = [
      row({ signalType: "whale", samples: 20 }),
      ...Array.from({ length: 12 }, (_, i) => row({ signalType: `family${i}`, samples: 1 })),
    ];
    expect(hasEnoughBreadth(rows)).toBe(false);
  });

  it("accepts real breadth across multiple families", () => {
    const rows = [
      row({ signalType: "whale", samples: 8 }),
      row({ signalType: "sentiment", samples: 8 }),
      row({ signalType: "narrative", samples: 8 }),
      row({ signalType: "momentum", samples: 8 }),
    ];
    expect(hasEnoughBreadth(rows)).toBe(true);
  });
});

describe("bestPerfMap", () => {
  it("picks the horizon with the strongest edge among those with enough samples", () => {
    const rows = [
      row({ signalType: "whale", horizonHours: 1, samples: 50, hitRate: 0.52 }), // weak edge, plenty of data
      row({ signalType: "whale", horizonHours: 24, samples: 50, hitRate: 0.75 }), // strong edge, plenty of data
      row({ signalType: "whale", horizonHours: 168, samples: 2, hitRate: 1.0 }), // "perfect" but too thin to trust
    ];
    const perf = bestPerfMap(rows, 10);
    expect(perf["whale"]?.hitRate).toBe(0.75);
  });

  it("falls back to whatever exists when nothing meets the sample floor", () => {
    const rows = [row({ signalType: "narrative", horizonHours: 4, samples: 2, hitRate: 0.6 })];
    const perf = bestPerfMap(rows, 10);
    expect(perf["narrative"]?.samples).toBe(2);
  });
});

describe("combinedShipVerdict", () => {
  it("ships when neither check objects", () => {
    expect(combinedShipVerdict("generalizes", "improvement")).toBe(true);
    expect(combinedShipVerdict("no_measurable_difference", "no_measurable_difference")).toBe(true);
    expect(combinedShipVerdict("insufficient_data", "insufficient_data")).toBe(true);
  });
  it("blocks on either check failing", () => {
    expect(combinedShipVerdict("overfits", "improvement")).toBe(false);
    expect(combinedShipVerdict("generalizes", "regression")).toBe(false);
    expect(combinedShipVerdict("overfits", "regression")).toBe(false);
  });
});
