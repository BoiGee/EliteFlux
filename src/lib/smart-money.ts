import { WHALE_METHODOLOGY, type WhaleAssetSignal, type WhaleIntel } from "./whale-intel";

export type ClusterClass =
  | "Institutional Accumulation Cluster"
  | "Whale Distribution Cluster"
  | "Mixed Flow / Uncertain";

export interface SmartMoneyCluster {
  id: string;
  klass: ClusterClass;
  size: number; // # of correlated whale signals
  avgScore: number;
  dominantPhase: "Accumulation" | "Distribution" | "Neutral";
  assets: string[];
  confidence: number; // 0..100
  rationale: string;
}

export interface SmartMoneyIntel {
  clusters: SmartMoneyCluster[];
  confidenceScore: number; // 0..100 global smart money confidence
  dominantClass: ClusterClass;
  coordinationIndex: number; // 0..100 — how synchronized whales appear
  /** Built entirely on whale-intel.ts's price/volume clustering — same caveat applies, see WHALE_METHODOLOGY. */
  methodology: string;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function computeSmartMoney(whale: WhaleIntel): SmartMoneyIntel {
  const signals: WhaleAssetSignal[] = whale.topSignals ?? [];
  if (signals.length === 0) {
    return {
      clusters: [],
      confidenceScore: 25,
      dominantClass: "Mixed Flow / Uncertain",
      coordinationIndex: 0,
      methodology: WHALE_METHODOLOGY,
    };
  }

  // Group by phase as proxy cluster
  const groups: Record<"Accumulation" | "Distribution" | "Neutral", WhaleAssetSignal[]> = {
    Accumulation: [],
    Distribution: [],
    Neutral: [],
  };
  for (const s of signals) groups[s.phase].push(s);

  const clusters: SmartMoneyCluster[] = [];
  for (const phase of ["Accumulation", "Distribution", "Neutral"] as const) {
    const g = groups[phase];
    if (g.length < 2) continue;
    const avgScore = g.reduce((s, x) => s + x.score, 0) / g.length;
    const klass: ClusterClass =
      phase === "Accumulation"
        ? "Institutional Accumulation Cluster"
        : phase === "Distribution"
          ? "Whale Distribution Cluster"
          : "Mixed Flow / Uncertain";
    const confidence = Math.round(clamp(avgScore * 0.7 + g.length * 8));
    const rationale =
      phase === "Accumulation"
        ? `${g.length} assets show coordinated volume spikes with upward price impulse`
        : phase === "Distribution"
          ? `${g.length} assets show heavy volume with downward pressure`
          : `${g.length} assets show volume without directional bias`;
    clusters.push({
      id: `cl-${phase.toLowerCase()}`,
      klass,
      size: g.length,
      avgScore: Math.round(avgScore),
      dominantPhase: phase,
      assets: g.slice(0, 6).map((x) => x.symbol),
      confidence,
      rationale,
    });
  }

  clusters.sort((a, b) => b.confidence - a.confidence);

  const acc = groups.Accumulation.length;
  const dist = groups.Distribution.length;
  const total = signals.length;
  const coordinationIndex = Math.round(clamp((Math.max(acc, dist) / total) * 100));

  const dominantClass: ClusterClass =
    acc > dist + 1
      ? "Institutional Accumulation Cluster"
      : dist > acc + 1
        ? "Whale Distribution Cluster"
        : "Mixed Flow / Uncertain";

  const top = clusters[0];
  const confidenceScore = Math.round(
    clamp(
      (top?.confidence ?? 30) * 0.6 +
        coordinationIndex * 0.25 +
        (whale.score ?? 0) * 0.15,
    ),
  );

  return { clusters, confidenceScore, dominantClass, coordinationIndex, methodology: WHALE_METHODOLOGY };
}
