import type { MarketSnapshot } from "./market";
import type { HistoryMap } from "./whale-intel";

export type SentimentState = "Bullish" | "Neutral" | "Bearish";
export type SentimentTrend = "Rising" | "Falling" | "Stable";

export interface SentimentIntel {
  score: number; // 0..100
  state: SentimentState;
  trend: SentimentTrend;
  components: {
    priceAcceleration: number;
    volumeExpansion: number;
    volatilitySpike: number;
    momentumConsistency: number;
    /** Alternative.me Fear & Greed Index, 0..100 — real crowd-sentiment data,
     * not derived from the same price/volume basket as the other three. Null
     * when the upstream fetch failed; the other components pick up its
     * weight proportionally when that happens. */
    fearGreed: number | null;
  };
  // Hook reserved for future social integration (X/Twitter, Reddit, etc.) — NOT fearGreed, which is its own real, independent index (see components.fearGreed).
  socialOverlay?: { score: number; source: string } | null;
}

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

export function computeSentimentIntel(
  snapshot: MarketSnapshot,
  history: HistoryMap,
  prevScore: number | null,
  fearGreed: number | null = null,
): SentimentIntel {
  const coins = snapshot.coinIntel;

  // Price acceleration: ratio of recent price slope vs older slope across the basket
  let accel = 0;
  let consistencyPos = 0;
  let consistencyNeg = 0;
  let volExpansion = 0;
  let sampleN = 0;

  for (const coin of coins) {
    const h = history[coin.symbol] ?? [];
    if (h.length < 4) continue;
    const mid = Math.floor(h.length / 2);
    const older = h.slice(0, mid);
    const recent = h.slice(mid);
    const olderAvgP = older.reduce((s, x) => s + x.price, 0) / older.length;
    const recentAvgP = recent.reduce((s, x) => s + x.price, 0) / recent.length;
    const olderAvgV = older.reduce((s, x) => s + x.quoteVolume, 0) / older.length || 1;
    const recentAvgV = recent.reduce((s, x) => s + x.quoteVolume, 0) / recent.length;

    const priceDelta = (recentAvgP - olderAvgP) / Math.max(olderAvgP, 1e-9);
    accel += priceDelta;
    volExpansion += recentAvgV / olderAvgV - 1;
    if (priceDelta > 0) consistencyPos++;
    else if (priceDelta < 0) consistencyNeg++;
    sampleN++;
  }

  const n = Math.max(sampleN, 1);
  const priceAcceleration = clamp(50 + (accel / n) * 2000, 0, 100);
  const volumeExpansion = clamp(50 + (volExpansion / n) * 200, 0, 100);

  // Volatility spike from 24h change spread
  const changes = coins.map((c) => c.change24h);
  const meanCh = changes.reduce((s, x) => s + x, 0) / Math.max(changes.length, 1);
  const variance =
    changes.reduce((s, x) => s + Math.pow(x - meanCh, 2), 0) / Math.max(changes.length, 1);
  const vol = Math.sqrt(variance);
  const volatilitySpike = clamp(100 - vol * 6, 0, 100); // lower vol = healthier
  const momentumConsistency = clamp(
    50 + ((consistencyPos - consistencyNeg) / Math.max(consistencyPos + consistencyNeg, 1)) * 50,
    0,
    100,
  );

  // Fear & Greed is real, independent crowd-sentiment data (not derived from
  // the same price/volume basket as the other three components) — give it a
  // real weight when available, and let the other components pick up its
  // share proportionally when it isn't (upstream fetch failed).
  const FNG_WEIGHT = 0.2;
  const baseWeight = fearGreed !== null ? 1 - FNG_WEIGHT : 1;
  const score = Math.round(
    (priceAcceleration * 0.32 + volumeExpansion * 0.22 + momentumConsistency * 0.28 + volatilitySpike * 0.18) *
      baseWeight +
      (fearGreed !== null ? fearGreed * FNG_WEIGHT : 0),
  );

  const state: SentimentState = score >= 62 ? "Bullish" : score <= 38 ? "Bearish" : "Neutral";

  let trend: SentimentTrend = "Stable";
  if (prevScore !== null) {
    const delta = score - prevScore;
    trend = delta > 2 ? "Rising" : delta < -2 ? "Falling" : "Stable";
  }

  return {
    score,
    state,
    trend,
    components: {
      priceAcceleration: Math.round(priceAcceleration),
      volumeExpansion: Math.round(volumeExpansion),
      volatilitySpike: Math.round(volatilitySpike),
      momentumConsistency: Math.round(momentumConsistency),
      fearGreed,
    },
    socialOverlay: null,
  };
}
