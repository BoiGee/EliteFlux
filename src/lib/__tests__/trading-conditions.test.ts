import { describe, expect, it } from "vitest";
import { evaluateTradingConditions, type ConditionInput } from "../trading-conditions";

const base: ConditionInput = {
  fluxScore: 55,
  regime: "Neutral Consolidation",
  exitPressure: 20,
  pumpPressureScore: 30,
  pumpPressureBand: "Low",
  cognitionConfidence: 70,
  sentimentScore: 50,
};

describe("trading conditions traffic light", () => {
  it("is green in a calm, constructive market", () => {
    const v = evaluateTradingConditions({ ...base, fluxScore: 70, regime: "Early Expansion" });
    expect(v.light).toBe("green");
    expect(v.headline).toBe("Conditions favour acting");
  });

  it("goes red when holders are heading for the door in a risk-off regime", () => {
    const v = evaluateTradingConditions({ ...base, exitPressure: 80, regime: "Risk-Off De-risking" });
    expect(v.light).toBe("red");
    expect(v.headline).toBe("Stand down");
  });

  it("goes amber on a single moderate warning", () => {
    const v = evaluateTradingConditions({ ...base, exitPressure: 55 });
    expect(v.light).toBe("amber");
  });

  it("treats an overheated read as a risk, not a green light", () => {
    const hot = evaluateTradingConditions({ ...base, fluxScore: 95, pumpPressureBand: "Extreme" });
    expect(hot.light).toBe("red");
  });

  it("penalises euphoric sentiment", () => {
    const v = evaluateTradingConditions({ ...base, sentimentScore: 90 });
    expect(v.light).not.toBe("green");
  });

  it("penalises low signal agreement", () => {
    const v = evaluateTradingConditions({ ...base, cognitionConfidence: 20 });
    expect(v.light).not.toBe("green");
  });

  it("always explains itself and how the verdict flips", () => {
    const v = evaluateTradingConditions({ ...base, exitPressure: 80, regime: "Distribution" });
    expect(v.reasons.length).toBeGreaterThan(0);
    expect(v.reasons.length).toBeLessThanOrEqual(4);
    expect(v.flipCondition).toBeTruthy();
    expect(v.plain).toBeTruthy();
  });
});
