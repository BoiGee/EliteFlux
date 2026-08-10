import type { MarketSnapshot } from "./market";

export type WhalePhase = "Accumulation" | "Distribution" | "Neutral";
export type WhaleImpact = "Low" | "Medium" | "High";

export interface WhaleAssetSignal {
  symbol: string;
  name: string;
  phase: WhalePhase;
  impact: WhaleImpact;
  volumeSpike: number; // ratio vs baseline (1 = normal)
  priceImpact: number; // % short-window move
  liquidityShift: number; // |Δ| of quote volume vs baseline (0..1)
  score: number; // 0..100
  reason: string;
}

/**
 * Honest methodology disclosure, carried on every WhaleIntel result so it
 * travels with the data to every consumer (dashboard, coach, MCP) rather
 * than needing every call site to remember to say it. This module has no
 * wallet/address data at all — it infers "whale activity" purely from
 * exchange ticker price/volume patterns. Real on-chain wallet tracking
 * exists separately in onchain-intel.ts (Ethereum mainnet only, gated on
 * ETHERSCAN_API_KEY) and is never merged into this signal.
 */
export const WHALE_METHODOLOGY =
  "Derived from exchange ticker price/volume patterns, not on-chain wallet tracking. A volume spike moving with price in a directional way scores as 'whale activity' — it is a market-microstructure proxy, not a confirmed large-wallet transaction.";

export interface WhaleIntel {
  score: number; // 0..100 global whale activity
  phase: WhalePhase;
  impact: WhaleImpact;
  topSignals: WhaleAssetSignal[];
  accumulating: number;
  distributing: number;
  methodology: string;
}

export interface SymbolHistorySample {
  ts: number;
  price: number;
  quoteVolume: number;
}

export type HistoryMap = Record<string, SymbolHistorySample[]>;

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

export function computeWhaleIntel(snapshot: MarketSnapshot, history: HistoryMap): WhaleIntel {
  const signals: WhaleAssetSignal[] = [];

  for (const coin of snapshot.coinIntel) {
    const hist = history[coin.symbol] ?? [];
    if (hist.length < 4) continue;

    const recent = hist.slice(-3);
    const baseline = hist.slice(0, -3);
    if (baseline.length < 2) continue;

    const avgBaseVol = baseline.reduce((s, x) => s + x.quoteVolume, 0) / baseline.length || 1;
    const avgRecentVol = recent.reduce((s, x) => s + x.quoteVolume, 0) / recent.length;
    const volumeSpike = avgRecentVol / avgBaseVol;

    const firstPrice = recent[0].price;
    const lastPrice = recent[recent.length - 1].price;
    const priceImpact = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;

    const baseVolStd = Math.sqrt(
      baseline.reduce((s, x) => s + Math.pow(x.quoteVolume - avgBaseVol, 2), 0) / baseline.length,
    );
    const liquidityShift = clamp(baseVolStd / Math.max(avgBaseVol, 1), 0, 2) / 2;

    // Score weights: volume spike dominant, then price impact, then liquidity shift
    const spikeScore = clamp((volumeSpike - 1) * 60, 0, 70);
    const impactScore = clamp(Math.abs(priceImpact) * 8, 0, 60);
    const shiftScore = liquidityShift * 30;
    const score = Math.round(clamp(spikeScore * 0.55 + impactScore * 0.3 + shiftScore * 0.15));

    if (score < 18) continue;

    const phase: WhalePhase =
      priceImpact > 0.25 && volumeSpike > 1.15
        ? "Accumulation"
        : priceImpact < -0.25 && volumeSpike > 1.15
          ? "Distribution"
          : "Neutral";

    const impact: WhaleImpact = score > 70 ? "High" : score > 40 ? "Medium" : "Low";

    const reason =
      phase === "Accumulation"
        ? `Volume +${((volumeSpike - 1) * 100).toFixed(0)}% with price impulse +${priceImpact.toFixed(2)}%`
        : phase === "Distribution"
          ? `Volume +${((volumeSpike - 1) * 100).toFixed(0)}% with price drop ${priceImpact.toFixed(2)}%`
          : `Volume +${((volumeSpike - 1) * 100).toFixed(0)}% with sideways price action`;

    signals.push({
      symbol: coin.symbol,
      name: coin.name,
      phase,
      impact,
      volumeSpike: +volumeSpike.toFixed(2),
      priceImpact: +priceImpact.toFixed(2),
      liquidityShift: +liquidityShift.toFixed(2),
      score,
      reason,
    });
  }

  signals.sort((a, b) => b.score - a.score);
  const topSignals = signals.slice(0, 6);

  const accumulating = signals.filter((s) => s.phase === "Accumulation").length;
  const distributing = signals.filter((s) => s.phase === "Distribution").length;

  const globalScore = signals.length
    ? Math.round(clamp(signals.slice(0, 5).reduce((s, x) => s + x.score, 0) / Math.min(5, signals.length)))
    : 18;

  const phase: WhalePhase =
    accumulating > distributing + 1
      ? "Accumulation"
      : distributing > accumulating + 1
        ? "Distribution"
        : "Neutral";

  const impact: WhaleImpact = globalScore > 70 ? "High" : globalScore > 40 ? "Medium" : "Low";

  return {
    score: globalScore,
    phase,
    impact,
    topSignals,
    accumulating,
    distributing,
    methodology: WHALE_METHODOLOGY,
  };
}
