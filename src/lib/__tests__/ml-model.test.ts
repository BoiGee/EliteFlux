import { describe, expect, it } from "vitest";
import { logLoss, predictProbability, trainLogisticRegression } from "../ml-model.server";

describe("logLoss", () => {
  it("is near zero for confident, correct predictions", () => {
    expect(logLoss([1, 0, 1], [0.99, 0.01, 0.99])).toBeLessThan(0.02);
  });
  it("is large for confident, wrong predictions", () => {
    expect(logLoss([1, 0], [0.01, 0.99])).toBeGreaterThan(4);
  });
  it("is exactly ln(2) for a coin-flip baseline", () => {
    expect(logLoss([1, 0, 1, 0], [0.5, 0.5, 0.5, 0.5])).toBeCloseTo(Math.log(2), 5);
  });
});

describe("trainLogisticRegression + predictProbability", () => {
  it("separates a trivially linearly-separable dataset", () => {
    // score >= 0.5 (post-normalization) always hits, below never does.
    const features = [[0.9, 0, 0, 0, 0], [0.8, 0, 0, 0, 0], [0.1, 0, 0, 0, 0], [0.2, 0, 0, 0, 0]];
    const labels = [1, 1, 0, 0];
    const model = trainLogisticRegression(features, labels);
    expect(predictProbability(model, [0.9, 0, 0, 0, 0])).toBeGreaterThan(0.7);
    expect(predictProbability(model, [0.1, 0, 0, 0, 0])).toBeLessThan(0.3);
  });

  it("returns a neutral model when given no data, never throws", () => {
    const model = trainLogisticRegression([], []);
    expect(predictProbability(model, [0.5])).toBeCloseTo(0.5, 5);
  });
});
