// Server-only: validate a candidate weight set against measured history
// *before* it ships, instead of only finding out via drift detection after
// the fact. Answers "would this blend have scored better than what's live
// right now, against the same resolved outcomes?"
import { loadAccuracy, loadModelWeights, type AccuracyRow } from "./signal-tracking.server";

type Admin = { from: (t: string) => any };

const LAYER_TO_SIGNAL: Record<string, string> = {
  whale: "whale",
  smartMoney: "smart_money",
  sentiment: "sentiment",
  narrative: "narrative",
  pressure: "pump_pressure",
  onchain: "smart_money",
  relativeToBtc: "momentum",
  derivatives: "derivatives",
  orderbook: "orderbook",
  social: "social",
  stablecoin: "stablecoin",
  confluence: "confluence",
  options: "options",
  macro: "macro",
  crossExchange: "cross_exchange",
  ignition: "momentum",
};

export interface BacktestPerSignal {
  layer: string;
  signalType: string;
  samples: number;
  hitRate: number | null;
  avgReturnPct: number | null;
  currentWeight: number;
  candidateWeight: number;
}

export interface BacktestResult {
  current: { weightedHitRate: number; sampleSize: number };
  candidate: { weightedHitRate: number; sampleSize: number };
  hitRateDelta: number; // candidate - current, positive = candidate would have done better
  perSignal: BacktestPerSignal[];
  verdict: "improvement" | "regression" | "no_measurable_difference" | "insufficient_data";
}

function weightedHitRate(rows: AccuracyRow[], weights: Record<string, number>): { rate: number; samples: number } {
  let num = 0;
  let denom = 0;
  for (const [layer, signal] of Object.entries(LAYER_TO_SIGNAL)) {
    const w = weights[layer] ?? 0;
    if (w <= 0) continue;
    const row = rows.find((r) => r.signalType === signal);
    if (!row || row.samples < 5) continue;
    num += row.hitRate * w * row.samples;
    denom += w * row.samples;
  }
  return { rate: denom > 0 ? num / denom : 0, samples: denom };
}

/**
 * Replay measured 24h outcomes under `candidate` weights vs. whatever is
 * currently live, and report the hit-rate delta. Doesn't require any new
 * data — it's a re-aggregation of the same signal_outcomes the accuracy
 * dashboard and the online calibrator already read.
 */
export async function backtestWeights(
  admin: Admin,
  candidate: Record<string, number>,
  opts: { days?: number; horizon?: number; regime?: string } = {},
): Promise<BacktestResult> {
  const horizon = opts.horizon ?? 24;
  const days = opts.days ?? 60;

  const [rows, storedCurrent] = await Promise.all([
    loadAccuracy(admin, { days, horizon, regime: opts.regime }),
    loadModelWeights(admin, opts.regime ? `recommendation:${opts.regime}` : "recommendation"),
  ]);

  const { BASE_RECOMMENDATION_WEIGHTS } = await import("./recommendation-engine");
  const currentWeights = storedCurrent?.weights ?? BASE_RECOMMENDATION_WEIGHTS;

  const currentResult = weightedHitRate(rows, currentWeights);
  const candidateResult = weightedHitRate(rows, candidate);

  const perSignal: BacktestPerSignal[] = Object.entries(LAYER_TO_SIGNAL).map(([layer, signal]) => {
    const row = rows.find((r) => r.signalType === signal);
    return {
      layer,
      signalType: signal,
      samples: row?.samples ?? 0,
      hitRate: row ? Math.round(row.hitRate * 1000) / 10 : null,
      avgReturnPct: row ? Math.round(row.avgReturnPct * 100) / 100 : null,
      currentWeight: currentWeights[layer] ?? 0,
      candidateWeight: candidate[layer] ?? 0,
    };
  });

  const hitRateDelta = Math.round((candidateResult.rate - currentResult.rate) * 1000) / 10;
  const minSamples = 40;
  let verdict: BacktestResult["verdict"];
  if (Math.min(currentResult.samples, candidateResult.samples) < minSamples) verdict = "insufficient_data";
  else if (Math.abs(hitRateDelta) < 1.5) verdict = "no_measurable_difference";
  else verdict = hitRateDelta > 0 ? "improvement" : "regression";

  return {
    current: { weightedHitRate: Math.round(currentResult.rate * 1000) / 10, sampleSize: Math.round(currentResult.samples) },
    candidate: { weightedHitRate: Math.round(candidateResult.rate * 1000) / 10, sampleSize: Math.round(candidateResult.samples) },
    hitRateDelta,
    perSignal,
    verdict,
  };
}

export interface WalkForwardResult {
  trainWindow: { days: number };
  testWindow: { days: number };
  trainSamples: number;
  testSamples: number;
  /** Weights derived from the train window only, applied out-of-sample to the test window. */
  outOfSampleHitRate: number;
  /** The naive cold-start baseline applied to the same test window, for comparison. */
  baselineHitRate: number;
  outOfSampleDelta: number; // outOfSample - baseline; positive = the adaptive blend generalizes, not just overfits
  verdict: "generalizes" | "overfits" | "no_measurable_difference" | "insufficient_data";
}

/**
 * The check the online drift detector can't do: derive weights from an
 * OLDER window only, then measure them against a NEWER window they never
 * saw. If the adaptive blend only ever looks good on the same data it was
 * fit to, this is where that shows up — recency-weighted online learning
 * has no other way to catch it.
 */
export async function walkForwardValidate(
  admin: Admin,
  opts: { trainDays?: number; testDays?: number; horizon?: number; regime?: string } = {},
): Promise<WalkForwardResult> {
  const testDays = opts.testDays ?? 14;
  const trainDays = opts.trainDays ?? 60;
  const horizon = opts.horizon ?? 24;

  const [trainRows, testRows] = await Promise.all([
    // Train window: everything older than the test window, back to trainDays+testDays ago.
    loadAccuracy(admin, { days: trainDays + testDays, untilDaysAgo: testDays, horizon, regime: opts.regime }),
    // Test window: the most recent testDays only — never seen by the train derivation.
    loadAccuracy(admin, { days: testDays, horizon, regime: opts.regime }),
  ]);

  const { BASE_RECOMMENDATION_WEIGHTS } = await import("./recommendation-engine");
  const { deriveWeights } = await import("./model-calibration");

  const perf: Record<string, { samples: number; hitRate: number; avgReturnPct: number } | undefined> = {};
  for (const [layer, signal] of Object.entries(LAYER_TO_SIGNAL)) {
    const row = trainRows.find((r) => r.signalType === signal);
    if (row) perf[layer] = { samples: row.samples, hitRate: row.hitRate, avgReturnPct: row.avgReturnPct };
  }
  const trainDerivedWeights = deriveWeights(BASE_RECOMMENDATION_WEIGHTS, perf);

  const outOfSample = weightedHitRate(testRows, trainDerivedWeights);
  const baseline = weightedHitRate(testRows, BASE_RECOMMENDATION_WEIGHTS);

  const trainSamples = trainRows.reduce((a, r) => a + r.samples, 0);
  const testSamples = testRows.reduce((a, r) => a + r.samples, 0);
  const outOfSampleDelta = Math.round((outOfSample.rate - baseline.rate) * 1000) / 10;

  const minSamples = 30;
  let verdict: WalkForwardResult["verdict"];
  if (Math.min(outOfSample.samples, baseline.samples) < minSamples) verdict = "insufficient_data";
  else if (Math.abs(outOfSampleDelta) < 1.5) verdict = "no_measurable_difference";
  else verdict = outOfSampleDelta > 0 ? "generalizes" : "overfits";

  return {
    trainWindow: { days: trainDays },
    testWindow: { days: testDays },
    trainSamples,
    testSamples,
    outOfSampleHitRate: Math.round(outOfSample.rate * 1000) / 10,
    baselineHitRate: Math.round(baseline.rate * 1000) / 10,
    outOfSampleDelta,
    verdict,
  };
}
