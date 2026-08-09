import { describe, expect, it } from "vitest";
import { BASE_RECOMMENDATION_WEIGHTS } from "../recommendation-engine";

describe("BASE_RECOMMENDATION_WEIGHTS", () => {
  it("sums to 1 so the weighted composite stays within 0..100", () => {
    const total = Object.values(BASE_RECOMMENDATION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it("includes a real weight for the ignition layer", () => {
    expect(BASE_RECOMMENDATION_WEIGHTS.ignition).toBeGreaterThan(0);
  });
});
