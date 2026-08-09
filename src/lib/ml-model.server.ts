// Server-only: a real trained model — logistic regression fit by gradient
// descent — replacing the bucket-average calibration with an actual
// parametric fit. Trained on the same signal_outcomes data the online
// calibrator already reads; no new data collection required.
//
// This is intentionally logistic regression, not gradient-boosted trees:
// it's honestly implementable in pure TypeScript with no new dependencies,
// fully real (gradient-descent-optimized, not a heuristic), and a legitimate
// upgrade from bucket-averaging. Trees are the natural next step once this
// is proven out and there's a reason to invest in a training pipeline that
// can support them.
import { KNOWN_REGIMES } from "./signal-tracking.server";

type Admin = { from: (t: string) => any };

export interface LogisticModel {
  weights: number[]; // one per feature, in feature-vector order
  bias: number;
  featureNames: string[];
}

const clampProb = (p: number) => Math.min(1 - 1e-9, Math.max(1e-9, p));
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/**
 * Batch gradient descent with L2 regularization. Small datasets (hundreds to
 * low thousands of rows) converge in well under a second — no need for
 * anything fancier than full-batch gradient steps here.
 */
export function trainLogisticRegression(
  features: number[][],
  labels: number[],
  opts: { epochs?: number; learningRate?: number; l2?: number } = {},
): LogisticModel {
  const epochs = opts.epochs ?? 500;
  const lr = opts.learningRate ?? 0.5;
  const l2 = opts.l2 ?? 0.01;
  const n = features.length;
  const dim = features[0]?.length ?? 0;

  const weights = new Array<number>(dim).fill(0);
  let bias = 0;
  if (!n || !dim) return { weights, bias, featureNames: [] };

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = new Array<number>(dim).fill(0);
    let gradB = 0;
    for (let i = 0; i < n; i++) {
      const row = features[i]!;
      let z = bias;
      for (let j = 0; j < dim; j++) z += weights[j]! * row[j]!;
      const pred = sigmoid(z);
      const err = pred - labels[i]!;
      for (let j = 0; j < dim; j++) gradW[j]! += err * row[j]!;
      gradB += err;
    }
    for (let j = 0; j < dim; j++) {
      weights[j] = weights[j]! - lr * (gradW[j]! / n + l2 * weights[j]!);
    }
    bias -= lr * (gradB / n);
  }

  return { weights, bias, featureNames: [] };
}

export function predictProbability(model: LogisticModel, features: number[]): number {
  let z = model.bias;
  for (let j = 0; j < model.weights.length; j++) z += model.weights[j]! * (features[j] ?? 0);
  return clampProb(sigmoid(z));
}

// Feature layout shared between training and inference: [normalizedScore, oneHot(regime)...]
const FEATURE_NAMES = ["score", ...KNOWN_REGIMES.map((r) => `regime:${r}`)];

function featurize(score: number, regime: string | null): number[] {
  const oneHot = KNOWN_REGIMES.map((r) => (r === regime ? 1 : 0));
  return [score / 100, ...oneHot];
}

const MIN_TRAINING_SAMPLES = 40; // floor to attempt training at all
const MIN_HOLDOUT_SAMPLES = 15; // floor to trust a held-out log-loss comparison
const SHIP_MARGIN = 0.9; // trained model must beat baseline held-out log-loss by >=10%

export const logLoss = (labels: number[], probs: number[]): number => {
  let sum = 0;
  for (let i = 0; i < labels.length; i++) {
    const p = clampProb(probs[i]!);
    sum += labels[i]! * Math.log(p) + (1 - labels[i]!) * Math.log(1 - p);
  }
  return -sum / labels.length;
};

/**
 * Train one logistic model per signal type — P(hit | score, regime) — from
 * every resolved 24h outcome on record. Runs as part of the learning cycle,
 * same cadence as the linear weight recalibration.
 *
 * Chronological 80/20 split (not random — outcomes over time are
 * autocorrelated, a random split would leak). Trains on the older 80%
 * regardless of sample size (cheap, and a useful diagnostic even when small),
 * but only *ships* once the held-out 20% is large enough to trust and the
 * trained model actually beats a naive constant-probability baseline by a
 * real margin on data it never saw — otherwise the previous model (if any)
 * stays live via loadCalibrationModel.
 */
export async function trainSignalCalibrationModels(
  admin: Admin,
): Promise<{ trained: string[]; heldBack: string[]; skipped: string[] }> {
  const { data } = await admin
    .from("signal_outcomes")
    .select("signal_type,score,regime,hit,resolved_at")
    .eq("horizon_hours", 24)
    .not("hit", "is", null)
    .order("resolved_at", { ascending: true })
    .limit(20000);

  const rows = (data ?? []) as { signal_type: string; score: number; regime: string | null; hit: boolean; resolved_at: string }[];
  const bySignal = new Map<string, typeof rows>();
  for (const r of rows) {
    (bySignal.get(r.signal_type) ?? bySignal.set(r.signal_type, []).get(r.signal_type)!).push(r);
  }

  const trained: string[] = [];
  const heldBack: string[] = [];
  const skipped: string[] = [];

  for (const [signalType, sample] of bySignal) {
    if (sample.length < MIN_TRAINING_SAMPLES) {
      skipped.push(signalType);
      continue;
    }
    // Already ordered by resolved_at from the query — split preserves that order.
    const splitAt = Math.floor(sample.length * 0.8);
    const trainSet = sample.slice(0, splitAt);
    const testSet = sample.slice(splitAt);

    const features = trainSet.map((r) => featurize(r.score, r.regime));
    const labels = trainSet.map((r) => (r.hit ? 1 : 0));
    const model = trainLogisticRegression(features, labels);
    model.featureNames = FEATURE_NAMES;

    if (testSet.length < MIN_HOLDOUT_SAMPLES) {
      heldBack.push(signalType);
      continue;
    }

    const testLabels = testSet.map((r) => (r.hit ? 1 : 0));
    const trainedProbs = testSet.map((r) => predictProbability(model, featurize(r.score, r.regime)));
    const baselineP = labels.reduce((a: number, l) => a + l, 0) / labels.length; // naive: train-set hit rate, constant
    const baselineProbs = testSet.map(() => baselineP);

    const trainedLoss = logLoss(testLabels, trainedProbs);
    const baselineLoss = logLoss(testLabels, baselineProbs);

    if (!(trainedLoss <= baselineLoss * SHIP_MARGIN)) {
      heldBack.push(signalType);
      continue;
    }

    await admin.from("model_weights").insert({
      model: `calibration:${signalType}`,
      weights: {
        weights: model.weights,
        bias: model.bias,
        featureNames: model.featureNames,
        evalTrainedLogLoss: Math.round(trainedLoss * 1000) / 1000,
        evalBaselineLogLoss: Math.round(baselineLoss * 1000) / 1000,
        evalHoldoutSamples: testSet.length,
      },
      sample_size: sample.length,
    });
    trained.push(signalType);
  }

  return { trained, heldBack, skipped };
}

/** Newest trained calibration model for a signal type, or null if never trained. */
export async function loadCalibrationModel(admin: Admin, signalType: string): Promise<LogisticModel | null> {
  const { data } = await admin
    .from("model_weights")
    .select("weights")
    .eq("model", `calibration:${signalType}`)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const w = (data as { weights: { weights: number[]; bias: number; featureNames: string[] } } | null)?.weights;
  if (!w) return null;
  return { weights: w.weights, bias: w.bias, featureNames: w.featureNames };
}

/** P(hit) for a live score+regime, from the trained model — falls back to null when untrained. */
export async function predictHitProbability(
  admin: Admin,
  signalType: string,
  score: number,
  regime: string | null,
): Promise<number | null> {
  const model = await loadCalibrationModel(admin, signalType);
  if (!model) return null;
  return predictProbability(model, featurize(score, regime));
}
