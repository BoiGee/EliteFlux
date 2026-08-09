import type { MarketSnapshot } from "./market";
import type { HistoryMap } from "./whale-intel";

export type IgnitionStage =
  | "Dormant"
  | "Speculative Accumulation"
  | "Pre-Breakout Conditions"
  | "Early Momentum Detected"
  | "Active Breakout";

export interface IgnitionSignal {
  symbol: string;
  stage: IgnitionStage;
  volumeBuild: number; // ratio vs baseline
  volatilityCompression: number; // 0..1, higher = tighter range before move
  expansionRate: number; // % range expansion in recent window
  alignmentScore: number; // 0..100 multi-asset sector sync
  score: number; // 0..100
  reason: string;
}

export interface MomentumIgnitionIntel {
  signals: IgnitionSignal[];
  topByStage: Record<IgnitionStage, IgnitionSignal[]>;
  sectorSync: number; // 0..100 — synchronized upward movement
  ignitionScore: number; // 0..100 global early-momentum score
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

function computeRange(samples: { price: number }[]): number {
  if (samples.length === 0) return 0;
  let mn = Infinity, mx = -Infinity;
  for (const s of samples) {
    if (s.price < mn) mn = s.price;
    if (s.price > mx) mx = s.price;
  }
  if (mn <= 0) return 0;
  return ((mx - mn) / mn) * 100;
}

export function computeMomentumIgnition(
  snapshot: MarketSnapshot,
  history: HistoryMap,
): MomentumIgnitionIntel {
  const signals: IgnitionSignal[] = [];

  // Sector sync precompute
  const sectorChange = new Map<string, number[]>();
  for (const c of snapshot.coinIntel) {
    const arr = sectorChange.get(c.category) ?? [];
    arr.push(c.change24h);
    sectorChange.set(c.category, arr);
  }
  const alignmentBySector = new Map<string, number>();
  for (const [cat, arr] of sectorChange) {
    if (arr.length < 2) {
      alignmentBySector.set(cat, 50);
      continue;
    }
    const up = arr.filter((x) => x > 0).length;
    const share = up / arr.length;
    alignmentBySector.set(cat, Math.round(share * 100));
  }

  for (const coin of snapshot.coinIntel) {
    const h = history[coin.symbol] ?? [];
    if (h.length < 6) continue;

    const mid = Math.floor(h.length / 2);
    const older = h.slice(0, mid);
    const recent = h.slice(mid);

    const olderRange = computeRange(older);
    const recentRange = computeRange(recent);
    const volatilityCompression = clamp(
      olderRange > 0 ? Math.max(0, 1 - recentRange / Math.max(olderRange, 0.01)) : 0,
      0,
      1,
    );
    const expansionRate = recentRange - olderRange;

    const olderVol = older.reduce((s, x) => s + x.quoteVolume, 0) / Math.max(older.length, 1) || 1;
    const recentVol = recent.reduce((s, x) => s + x.quoteVolume, 0) / Math.max(recent.length, 1);
    const volumeBuild = recentVol / olderVol;

    const align = alignmentBySector.get(coin.category) ?? 50;

    // Score: reward volume build, compression preceding expansion, sector sync
    const compBonus = volatilityCompression > 0.4 ? 18 : 0;
    const expansionBonus = expansionRate > 0.5 ? 14 : 0;
    const score = Math.round(
      clamp(
        40 +
          (volumeBuild - 1) * 38 +
          compBonus +
          expansionBonus +
          (align - 50) * 0.4,
      ),
    );

    if (score < 35) continue;

    let stage: IgnitionStage = "Dormant";
    if (score >= 80 && expansionRate > 1 && volumeBuild > 1.4) stage = "Active Breakout";
    else if (score >= 68 && volumeBuild > 1.25 && (expansionRate > 0.3 || volatilityCompression < 0.4))
      stage = "Early Momentum Detected";
    else if (score >= 55 && volatilityCompression > 0.45 && volumeBuild > 1.1)
      stage = "Pre-Breakout Conditions";
    else if (score >= 40 && volumeBuild > 1.1 && coin.change24h > -1)
      stage = "Speculative Accumulation";

    if (stage === "Dormant") continue;

    const reason =
      stage === "Active Breakout"
        ? `Vol +${((volumeBuild - 1) * 100).toFixed(0)}% with range expanding ${expansionRate.toFixed(2)}%`
        : stage === "Early Momentum Detected"
          ? `Vol building +${((volumeBuild - 1) * 100).toFixed(0)}%, sector ${align}% up`
          : stage === "Pre-Breakout Conditions"
            ? `Volatility compressed, vol building +${((volumeBuild - 1) * 100).toFixed(0)}%`
            : `Quiet accumulation, vol +${((volumeBuild - 1) * 100).toFixed(0)}%`;

    signals.push({
      symbol: coin.symbol,
      stage,
      volumeBuild: +volumeBuild.toFixed(2),
      volatilityCompression: +volatilityCompression.toFixed(2),
      expansionRate: +expansionRate.toFixed(2),
      alignmentScore: align,
      score,
      reason,
    });
  }

  signals.sort((a, b) => b.score - a.score);

  const topByStage = {
    Dormant: [],
    "Speculative Accumulation": [],
    "Pre-Breakout Conditions": [],
    "Early Momentum Detected": [],
    "Active Breakout": [],
  } as Record<IgnitionStage, IgnitionSignal[]>;
  for (const s of signals) topByStage[s.stage].push(s);

  const sectorSyncVals = Array.from(alignmentBySector.values());
  const sectorSync = sectorSyncVals.length
    ? Math.round(sectorSyncVals.reduce((s, x) => s + x, 0) / sectorSyncVals.length)
    : 50;

  const ignitionScore = signals.length
    ? Math.round(
        clamp(
          signals.slice(0, 6).reduce((s, x) => s + x.score, 0) / Math.min(6, signals.length),
        ),
      )
    : 25;

  return { signals: signals.slice(0, 12), topByStage, sectorSync, ignitionScore };
}
