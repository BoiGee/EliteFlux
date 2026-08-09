// ============================================================
// Model calibration — pure, testable maths.
// ------------------------------------------------------------
// Turns measured signal performance into (a) blend weights that
// replace hand-picked constants, (b) calibrated scores that mean
// what they say, and (c) an explicit confidence value.
// No I/O lives here.
// ============================================================

export const SIGNAL_HORIZONS = [1, 4, 24, 168] as const;
export type Horizon = (typeof SIGNAL_HORIZONS)[number];

/** Measured performance of one signal family over a lookback window. */
export interface SignalPerf {
  samples: number;
  hitRate: number; // 0..1
  avgReturnPct: number;
}

/** Signals whose thesis is "price should fall" — a hit is a negative move. */
const BEARISH = new Set(["exit_pressure", "pump_pressure", "whale_distribution"]);

export function isBearishSignal(signalType: string): boolean {
  return BEARISH.has(signalType);
}

/**
 * Did the signal call the direction right?
 * Returns null when the signal made no directional claim (mid-band scores)
 * or the move was inside the noise band.
 */
export function isHit(signalType: string, score: number, returnPct: number, noisePct = 0.4): boolean | null {
  if (Math.abs(returnPct) < noisePct) return null;
  const bearish = isBearishSignal(signalType);
  if (score >= 60) return bearish ? returnPct < 0 : returnPct > 0;
  if (score <= 40) return bearish ? returnPct > 0 : returnPct < 0;
  return null;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Blend weights derived from measured hit rates.
 *
 * Each layer's base weight is scaled by how far its hit rate sits from a coin
 * flip, damped by sample size (a layer with 5 observations barely moves), and
 * bounded so no single layer can dominate or vanish. The result is
 * renormalised to sum to 1 so downstream scoring stays on 0..100.
 */
export function deriveWeights(
  base: Record<string, number>,
  perf: Record<string, SignalPerf | undefined>,
  opts: { minSamples?: number; maxShift?: number; floorRatio?: number } = {},
): Record<string, number> {
  const minSamples = opts.minSamples ?? 30;
  const maxShift = opts.maxShift ?? 0.5; // ±50% of the base weight
  const floorRatio = opts.floorRatio ?? 0.4;

  const adjusted: Record<string, number> = {};
  for (const [layer, baseWeight] of Object.entries(base)) {
    const p = perf[layer];
    let factor = 1;
    if (p && p.samples > 0) {
      // Confidence in the measurement itself: 0 at no data, 1 at minSamples.
      const trust = clamp(p.samples / minSamples, 0, 1);
      // +1 when the layer is perfect, -1 when it is always wrong.
      const edge = clamp((p.hitRate - 0.5) * 2, -1, 1);
      factor = 1 + edge * trust * maxShift;
    }
    adjusted[layer] = Math.max(baseWeight * floorRatio, baseWeight * factor);
  }

  const total = Object.values(adjusted).reduce((a, b) => a + b, 0);
  if (!Number.isFinite(total) || total <= 0) return { ...base };
  const out: Record<string, number> = {};
  for (const [layer, w] of Object.entries(adjusted)) out[layer] = w / total;
  return out;
}

export interface ScoreBand {
  min: number;
  max: number;
  hitRate: number;
  samples: number;
}

/**
 * Map a raw 0..100 score onto the historical hit rate of scores in its band,
 * so "80" reflects observed reliability instead of raw enthusiasm.
 * Falls back to the raw score when the band has too little history.
 */
export function calibrateScore(raw: number, bands: ScoreBand[], minSamples = 20): number {
  const band = bands.find((b) => raw >= b.min && raw <= b.max);
  if (!band || band.samples < minSamples) return Math.round(raw);
  // Blend towards the measured reliability proportionally to sample weight.
  const trust = clamp(band.samples / (minSamples * 3), 0, 1);
  const calibrated = band.hitRate * 100;
  return Math.round(raw * (1 - trust) + calibrated * trust);
}

export interface ConfidenceInputs {
  /** Age of the underlying market read, in ms. */
  dataAgeMs: number;
  /** True when prices came from a degraded/stored source. */
  degradedSource: boolean;
  /** How many intelligence layers agree on direction, 0..1. */
  layerAgreement: number;
  /** Depth of observed history backing the read, 0..1. */
  historyDepth: number;
}

export interface ConfidenceResult {
  score: number; // 0..100
  band: "Low" | "Moderate" | "High";
  reasons: string[];
}

/** Explicit, explainable confidence for any published read. */
export function computeConfidence(i: ConfidenceInputs): ConfidenceResult {
  const reasons: string[] = [];
  const freshness = clamp(1 - i.dataAgeMs / (15 * 60_000), 0, 1);
  if (freshness < 0.5) reasons.push("market read is not fresh");
  if (i.degradedSource) reasons.push("running on a backup data source");
  if (i.layerAgreement < 0.5) reasons.push("intelligence layers disagree");
  if (i.historyDepth < 0.5) reasons.push("limited observed history");

  let score = 100 * (freshness * 0.3 + clamp(i.layerAgreement, 0, 1) * 0.4 + clamp(i.historyDepth, 0, 1) * 0.3);
  if (i.degradedSource) score *= 0.8;
  const rounded = Math.round(clamp(score, 0, 100));
  return {
    score: rounded,
    band: rounded >= 70 ? "High" : rounded >= 45 ? "Moderate" : "Low",
    reasons,
  };
}

/**
 * Drift guard: flags a layer whose recent accuracy has fallen well below its
 * long-run average, so a degrading signal gets downweighted instead of
 * quietly polluting the blend.
 */
export function detectDrift(
  recent: SignalPerf | undefined,
  longRun: SignalPerf | undefined,
  tolerance = 0.15,
): { drifting: boolean; delta: number } {
  if (!recent || !longRun || recent.samples < 10 || longRun.samples < 30) {
    return { drifting: false, delta: 0 };
  }
  const delta = recent.hitRate - longRun.hitRate;
  return { drifting: delta < -tolerance, delta };
}

/** Fraction of layers pointing the same way as the headline read. */
export function layerAgreement(values: number[], neutral = 50): number {
  if (!values.length) return 0.5;
  const up = values.filter((v) => v > neutral).length;
  const down = values.filter((v) => v < neutral).length;
  return clamp(Math.max(up, down) / values.length, 0, 1);
}
