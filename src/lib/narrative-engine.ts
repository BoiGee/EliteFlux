import type { MarketSnapshot, Category } from "./market";
import type { HistoryMap } from "./whale-intel";

export type NarrativeAcceleration = "rising" | "stable" | "fading";

export interface DetectedNarrative {
  id: string;
  label: string;
  category: Category | "Cross-Sector";
  strength: number; // 0..100
  acceleration: NarrativeAcceleration;
  correlation: number; // 0..1 — pairwise co-movement
  volumeSurge: number; // ratio recent vs baseline
  momentumAlignment: number; // 0..1 share moving same direction
  assets: string[];
  thesis: string;
  emerging: boolean; // not yet mainstream but accelerating
}

export interface NarrativeIntel {
  detected: DetectedNarrative[];
  topEmerging: DetectedNarrative[];
  aggregateStrength: number; // 0..100
  rotationVelocity: number; // 0..100, how fast leadership rotates
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

const NARRATIVE_LABELS: Record<string, { label: string; cat: Category | "Cross-Sector"; thesis: string }> = {
  ai: { label: "AI narrative expansion", cat: "AI", thesis: "Compute & agent tokens drawing thematic flow." },
  meme: { label: "Meme cycle ignition", cat: "Meme", thesis: "Retail risk-on rotation in speculative tickers." },
  l1: { label: "Layer 1 rotation", cat: "L1", thesis: "Capital cycling through execution layers." },
  rwa: { label: "Real World Asset inflow", cat: "RWA", thesis: "TradFi onchain settlement narrative building." },
  infra: { label: "Infrastructure bid", cat: "Infra", thesis: "Oracles / middleware re-rating." },
  large: { label: "Blue-chip leadership", cat: "Large Cap", thesis: "Majors leading the bid." },
};

export function computeNarrativeIntel(snapshot: MarketSnapshot, history: HistoryMap): NarrativeIntel {
  const buckets = new Map<string, { symbols: string[]; changes: number[]; vols: number[] }>();
  for (const c of snapshot.coinIntel) {
    const id =
      c.category === "AI" ? "ai" :
      c.category === "Meme" ? "meme" :
      c.category === "L1" ? "l1" :
      c.category === "RWA" ? "rwa" :
      c.category === "Infra" ? "infra" : "large";
    if (!buckets.has(id)) buckets.set(id, { symbols: [], changes: [], vols: [] });
    const b = buckets.get(id)!;
    b.symbols.push(c.symbol);
    b.changes.push(c.change24h);
    const h = history[c.symbol] ?? [];
    if (h.length >= 4) {
      const mid = Math.floor(h.length / 2);
      const olderV = h.slice(0, mid).reduce((s, x) => s + x.quoteVolume, 0) / Math.max(mid, 1) || 1;
      const recentV = h.slice(mid).reduce((s, x) => s + x.quoteVolume, 0) / Math.max(h.length - mid, 1);
      b.vols.push(recentV / olderV);
    } else {
      b.vols.push(1);
    }
  }

  const detected: DetectedNarrative[] = [];
  for (const [id, b] of buckets) {
    if (b.symbols.length < 2) continue;
    const meta = NARRATIVE_LABELS[id];
    if (!meta) continue;

    const mean = b.changes.reduce((s, x) => s + x, 0) / b.changes.length;
    const variance = b.changes.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / b.changes.length;
    const std = Math.sqrt(variance);
    // Correlation proxy: low dispersion vs mean magnitude = strong co-movement
    const correlation = clamp(1 - std / Math.max(Math.abs(mean) + std + 0.5, 1), 0, 1);

    const sameDir = b.changes.filter((x) => Math.sign(x) === Math.sign(mean) && mean !== 0).length;
    const momentumAlignment = sameDir / b.changes.length;
    const volumeSurge = b.vols.reduce((s, x) => s + x, 0) / b.vols.length;

    // Strength: blend mean magnitude, correlation, alignment, vol surge
    const strength = Math.round(
      clamp(
        50 +
          mean * 4 +
          (correlation - 0.5) * 30 +
          (momentumAlignment - 0.5) * 30 +
          (volumeSurge - 1) * 35,
      ),
    );

    const acceleration: NarrativeAcceleration =
      mean > 1.5 && momentumAlignment > 0.6 && volumeSurge > 1.05
        ? "rising"
        : mean < -1 || volumeSurge < 0.9
          ? "fading"
          : "stable";

    // Emerging: strong correlation + vol surge, but mainstream strength not yet extreme
    const emerging =
      acceleration === "rising" &&
      correlation > 0.55 &&
      volumeSurge > 1.15 &&
      strength < 82;

    detected.push({
      id,
      label: meta.label,
      category: meta.cat,
      strength,
      acceleration,
      correlation: +correlation.toFixed(2),
      volumeSurge: +volumeSurge.toFixed(2),
      momentumAlignment: +momentumAlignment.toFixed(2),
      assets: b.symbols.slice(0, 6),
      thesis: meta.thesis,
      emerging,
    });
  }

  detected.sort((a, b) => b.strength - a.strength);
  const topEmerging = detected.filter((n) => n.emerging).slice(0, 3);
  const aggregateStrength = detected.length
    ? Math.round(detected.reduce((s, n) => s + n.strength, 0) / detected.length)
    : 50;

  // Rotation velocity: variance of strengths
  const sMean = aggregateStrength;
  const sVar = detected.length
    ? detected.reduce((s, n) => s + Math.pow(n.strength - sMean, 2), 0) / detected.length
    : 0;
  const rotationVelocity = Math.round(clamp(Math.sqrt(sVar) * 3, 0, 100));

  return { detected, topEmerging, aggregateStrength, rotationVelocity };
}
