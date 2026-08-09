// ============================================================
// Exit Intelligence Engine
// ------------------------------------------------------------
// Probabilistic risk awareness layer. Does NOT generate exact
// price targets or exact timestamps. Outputs an Exit Pressure
// Score (0..100), a market phase classification, a risk status,
// and short reason tags per asset, plus a probabilistic reversal
// window string. This is risk detection, not financial advice.
// ============================================================
import type { MarketSnapshot } from "./market";
import type { HistoryMap } from "./whale-intel";
import type { WhaleIntel } from "./whale-intel";
import type { SentimentIntel } from "./sentiment-intel";
import type { NarrativeIntel } from "./narrative-engine";
import type { PumpPressureIntel } from "./pump-pressure";
import type { OnChainIntel } from "./onchain-intel";

export type ExitMarketPhase =
  | "Accumulation"
  | "Expansion"
  | "Distribution"
  | "Exhaustion";

export type ExitRiskStatus = "Low" | "Medium" | "High";

export type ExitBand =
  | "Strong Hold"
  | "Caution"
  | "Reduce Exposure"
  | "High Exit Pressure";

export type ExitReasonTag =
  | "Smart Money Distribution"
  | "Exchange Inflow Spike"
  | "Volume/Price Divergence"
  | "Momentum Exhaustion"
  | "Sentiment Overheated"
  | "Narrative Exhaustion"
  | "BTC Divergence"
  | "Late Cycle Expansion"
  | "Trend Weakening";

export interface ExitAssetSignal {
  symbol: string;
  name: string;
  exitPressureScore: number; // 0..100
  band: ExitBand;
  phase: ExitMarketPhase;
  risk: ExitRiskStatus;
  tags: ExitReasonTag[];
  rationale: string;
  contributors: {
    distribution: number; // 0..100
    divergence: number;
    momentumExhaustion: number;
    sentimentOverheat: number;
    narrativeExhaustion: number;
  };
  reversalWindow: string;
}

export interface ExitIntel {
  assets: ExitAssetSignal[];
  perAsset: Record<string, ExitAssetSignal | undefined>;
  marketExitPressure: number; // 0..100 aggregate
  marketBand: ExitBand;
  marketPhase: ExitMarketPhase;
  reversalWindow: string;
  systemMessages: string[]; // e.g. "Smart Money Distribution Detected"
  generatedAt: number;
}

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

function bandFor(score: number): ExitBand {
  if (score >= 81) return "High Exit Pressure";
  if (score >= 61) return "Reduce Exposure";
  if (score >= 31) return "Caution";
  return "Strong Hold";
}

function riskFor(score: number): ExitRiskStatus {
  if (score >= 65) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

function reversalWindowFor(score: number): string {
  if (score >= 81) return "Elevated reversal probability within a 12–48 hour window";
  if (score >= 61) return "Elevated pullback risk within a 24–72 hour window";
  if (score >= 31) return "Conditions warming for a reversal across the coming cycle phase";
  return "No elevated reversal signal in the current cycle phase";
}

function phaseFor(
  score: number,
  change24h: number,
  whalePhaseDist: boolean,
): ExitMarketPhase {
  if (score >= 81) return "Exhaustion";
  if (score >= 61 || whalePhaseDist) return "Distribution";
  if (score >= 31 && change24h > 0) return "Expansion";
  return "Accumulation";
}

export function computeExitIntel(
  snapshot: MarketSnapshot,
  history: HistoryMap,
  whale: WhaleIntel,
  sentiment: SentimentIntel,
  narrative: NarrativeIntel,
  pressure: PumpPressureIntel,
  onchain: OnChainIntel,
): ExitIntel {
  const ts = Date.now();
  const assets: ExitAssetSignal[] = [];
  const perAsset: Record<string, ExitAssetSignal | undefined> = {};

  // Global modifiers
  const sentimentOverheat = clamp((sentiment.score - 60) * 2.5, 0, 100);
  const narrativeFadeBoost = narrative.rotationVelocity > 60 ? 15 : 0;
  const btcChange = snapshot.marketOverview.btcChange24h;

  const whaleByAsset = new Map(whale.topSignals.map((s) => [s.symbol, s]));

  for (const coin of snapshot.coinIntel) {
    const hist = history[coin.symbol] ?? [];
    const w = whaleByAsset.get(coin.symbol);
    const oc = onchain.perAsset[coin.symbol];

    // 1. Smart money distribution
    let distribution = 0;
    const tags: ExitReasonTag[] = [];
    if (w?.phase === "Distribution") {
      distribution += Math.min(60, w.score);
      tags.push("Smart Money Distribution");
    }
    if (oc?.type === "exchange_inflow_spike") {
      distribution += 35;
      tags.push("Exchange Inflow Spike");
    } else if (oc?.type === "whale_distribution") {
      distribution += 25;
      if (!tags.includes("Smart Money Distribution")) tags.push("Smart Money Distribution");
    } else if (oc?.type === "large_single_transfer" && oc.netFlowUsd < 0) {
      distribution += 40; // a single decisive $2M+ deposit outweighs a netted trickle
      tags.push("Exchange Inflow Spike");
    }
    distribution = clamp(distribution);

    // 2. Volume / price divergence + momentum exhaustion
    let divergence = 0;
    let momentumExhaustion = 0;
    if (hist.length >= 6) {
      const recent = hist.slice(-3);
      const base = hist.slice(0, -3);
      const avgBaseVol = base.reduce((s, x) => s + x.quoteVolume, 0) / base.length || 1;
      const avgRecentVol = recent.reduce((s, x) => s + x.quoteVolume, 0) / recent.length;
      const volRatio = avgRecentVol / avgBaseVol;

      const pStart = recent[0].price;
      const pEnd = recent[recent.length - 1].price;
      const pImpact = pStart > 0 ? ((pEnd - pStart) / pStart) * 100 : 0;
      const basePriceAvg = base.reduce((s, x) => s + x.price, 0) / base.length || pStart;
      const recentPriceAvg = recent.reduce((s, x) => s + x.price, 0) / recent.length;
      const priceUp = recentPriceAvg > basePriceAvg;

      // Price rising while volume declines → bearish divergence
      if (priceUp && volRatio < 0.85) {
        divergence = clamp(60 + (0.85 - volRatio) * 200, 0, 100);
        tags.push("Volume/Price Divergence");
      }

      // Momentum weakening: slope of recent prices flattening vs base
      const slopeRecent = (pEnd - pStart) / Math.max(recent.length, 1);
      const baseSlope = (base[base.length - 1].price - base[0].price) / Math.max(base.length, 1);
      if (baseSlope > 0 && slopeRecent < baseSlope * 0.5 && pImpact >= -1) {
        momentumExhaustion = clamp(50 + (1 - slopeRecent / Math.max(baseSlope, 1e-9)) * 40, 0, 100);
        tags.push("Momentum Exhaustion");
        if (priceUp) tags.push("Trend Weakening");
      }

      // Cross-asset divergence vs Bitcoin
      if (priceUp && btcChange < -0.5 && coin.symbol !== "BTC") {
        momentumExhaustion = Math.max(momentumExhaustion, 55);
        tags.push("BTC Divergence");
      }
    }

    // 3. Narrative exhaustion (global rotation as proxy; coin-narrative map not 1:1)
    let narrativeExhaustion = 0;
    if (narrative.rotationVelocity > 55 && coin.momentum > 60) {
      narrativeExhaustion = clamp(40 + narrativeFadeBoost + (narrative.rotationVelocity - 55), 0, 100);
      tags.push("Narrative Exhaustion");
    }

    // 4. Late cycle expansion overlay (pressure very high + sentiment greed)
    if (pressure.score > 70 && sentiment.score > 70 && coin.change24h > 4) {
      tags.push("Late Cycle Expansion");
    }

    // Sentiment overheat tag
    if (sentimentOverheat > 60) {
      tags.push("Sentiment Overheated");
    }

    // ----- Composite score -----
    const score = Math.round(
      clamp(
        distribution * 0.32 +
          divergence * 0.22 +
          momentumExhaustion * 0.2 +
          sentimentOverheat * 0.14 +
          narrativeExhaustion * 0.12,
      ),
    );

    if (score < 12 && tags.length === 0) {
      // Skip assets with no meaningful exit pressure signal
      continue;
    }

    const band = bandFor(score);
    const risk = riskFor(score);
    const phase = phaseFor(score, coin.change24h, w?.phase === "Distribution");

    const uniqTags = Array.from(new Set(tags)).slice(0, 5);
    const rationale =
      uniqTags.length === 0
        ? "Baseline exit pressure — no dominant distribution signal."
        : `${uniqTags[0]}${uniqTags[1] ? ` + ${uniqTags[1]}` : ""} dominating risk profile.`;

    const sig: ExitAssetSignal = {
      symbol: coin.symbol,
      name: coin.name,
      exitPressureScore: score,
      band,
      phase,
      risk,
      tags: uniqTags,
      rationale,
      contributors: {
        distribution: Math.round(distribution),
        divergence: Math.round(divergence),
        momentumExhaustion: Math.round(momentumExhaustion),
        sentimentOverheat: Math.round(sentimentOverheat),
        narrativeExhaustion: Math.round(narrativeExhaustion),
      },
      reversalWindow: reversalWindowFor(score),
    };

    assets.push(sig);
    perAsset[coin.symbol] = sig;
  }

  assets.sort((a, b) => b.exitPressureScore - a.exitPressureScore);

  // Market aggregate — weighted toward top distributors
  const top = assets.slice(0, 6);
  const marketExitPressure = top.length
    ? Math.round(top.reduce((s, a) => s + a.exitPressureScore, 0) / top.length)
    : 0;
  const marketBand = bandFor(marketExitPressure);
  const marketPhase = phaseFor(
    marketExitPressure,
    snapshot.marketOverview.btcChange24h,
    whale.phase === "Distribution",
  );

  const systemMessages: string[] = [];
  if (whale.phase === "Distribution" || onchain.signals.some((s) => s.type === "whale_distribution")) {
    systemMessages.push("Smart Money Distribution Detected");
  }
  if (onchain.signals.some((s) => s.type === "exchange_inflow_spike")) {
    systemMessages.push("Liquidity Exit Pressure Rising");
  }
  if (marketExitPressure >= 65 && sentiment.score >= 65) {
    systemMessages.push("Institutional Profit-Taking Phase");
  }
  if (assets.some((a) => a.tags.includes("Momentum Exhaustion"))) {
    systemMessages.push("Momentum Exhaustion Detected");
  }
  if (
    pressure.score > 70 &&
    sentiment.score > 70 &&
    snapshot.marketOverview.btcChange24h > 0
  ) {
    systemMessages.push("Late Cycle Expansion Phase");
  }
  if (assets.some((a) => a.tags.includes("Trend Weakening"))) {
    systemMessages.push("Trend Weakening Despite Price Strength");
  }

  return {
    assets,
    perAsset,
    marketExitPressure,
    marketBand,
    marketPhase,
    reversalWindow: reversalWindowFor(marketExitPressure),
    systemMessages: Array.from(new Set(systemMessages)),
    generatedAt: ts,
  };
}
