import type { MarketSnapshot } from "./market";
import type { WhaleIntel } from "./whale-intel";
import type { SentimentIntel } from "./sentiment-intel";

export type Regime = "Risk-On" | "Risk-Off" | "Neutral";
export type FlowPhase = "BTC Accumulation" | "Altcoin Rotation" | "Meme Speculation";
export type Volatility = "Low" | "Medium" | "High";
export type RiskLvl = "Low" | "Medium" | "High";

export type MarketRegime =
  | "Risk-On Expansion"
  | "Risk-Off De-risking"
  | "Altcoin Rotation"
  | "Meme Speculation"
  | "Consolidation / Chop";

export interface BitcoinControlLayer {
  trend: "Bullish" | "Bearish" | "Sideways";
  volatility: Volatility;
  dominance: number;
  dominanceTrend: "Expanding" | "Compressing" | "Stable";
  regime: Regime;
  score: number;
}

export interface LiquidityFlowLayer {
  phase: FlowPhase;
  btcShare: number;
  altShare: number;
  memeShare: number;
  rotationStrength: number;
  score: number;
}

export interface NarrativeMomentumLayer {
  leaders: { name: string; strength: number; direction: string }[];
  avgStrength: number;
  risingCount: number;
  score: number;
}

export interface AltcoinStrengthLayer {
  topPerformers: { symbol: string; momentum: number; change24h: number; vsBtc: number }[];
  breadth: number;
  avgMomentum: number;
  vsBtcStrength: number; // -100..100 relative strength
  score: number;
}

export interface RiskCompressionLayer {
  risk: RiskLvl;
  signals: string[];
  hypeIndex: number;
  whaleDistribution: number;
  volatilitySpike: number;
  score: number;
}

export interface EliteBrainOutput {
  bitcoin: BitcoinControlLayer;
  liquidity: LiquidityFlowLayer;
  narrative: NarrativeMomentumLayer;
  altcoin: AltcoinStrengthLayer;
  risk: RiskCompressionLayer;
  eliteFluxScore: number;
  band: "Risk-Off" | "Neutral" | "Early Bullish" | "Strong Bullish";
  bandColor: "bear" | "warn" | "neon-cyan" | "bull";
  headline: string;
  insight: string;
  pulse: "stable" | "expanding" | "compressing";
  regime: MarketRegime;
  regimeConfidence: number; // 0..100
  whaleContribution: number;
  sentimentContribution: number;
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

/** Cold-start values — replaced by measured weights (recomputeEliteBrainWeights, signal-tracking.server.ts) once enough flux_score outcomes have resolved. */
export const BASE_ELITE_BRAIN_WEIGHTS: Record<string, number> = {
  bitcoin: 0.16,
  liquidity: 0.16,
  narrative: 0.12,
  altcoin: 0.18,
  risk: 0.1,
  whale: 0.14,
  sentiment: 0.14,
};

export function runEliteBrain(
  snapshot: MarketSnapshot,
  whale?: WhaleIntel | null,
  sentiment?: SentimentIntel | null,
  weights: Record<string, number> = BASE_ELITE_BRAIN_WEIGHTS,
): EliteBrainOutput {
  const { marketOverview, categoryFlows, narratives, coinIntel, memeCoins } = snapshot;

  // 1. Bitcoin Control Layer
  const btcChange = marketOverview.btcChange24h;
  const trend =
    marketOverview.btcTrend === "bullish"
      ? "Bullish"
      : marketOverview.btcTrend === "bearish"
        ? "Bearish"
        : "Sideways";
  const absChange = Math.abs(btcChange);
  const volatility: Volatility = absChange > 4 ? "High" : absChange > 1.5 ? "Medium" : "Low";
  const dominanceTrend =
    marketOverview.btcDominanceChange > 0.15
      ? "Expanding"
      : marketOverview.btcDominanceChange < -0.15
        ? "Compressing"
        : "Stable";
  const regime: Regime =
    trend === "Bullish" && dominanceTrend !== "Expanding"
      ? "Risk-On"
      : trend === "Bearish" || dominanceTrend === "Expanding"
        ? dominanceTrend === "Expanding" && trend === "Bullish"
          ? "Neutral"
          : "Risk-Off"
        : "Neutral";
  const btcScore = clamp(
    (trend === "Bullish" ? 75 : trend === "Sideways" ? 50 : 25) +
      (dominanceTrend === "Compressing" ? 10 : dominanceTrend === "Expanding" ? -10 : 0) +
      (volatility === "Low" ? 5 : volatility === "High" ? -10 : 0),
  );

  // 2. Liquidity Flow Layer
  const memeMomentum = categoryFlows.find((c) => c.id === "meme")?.momentum ?? 0;
  const altMomentum =
    (categoryFlows.find((c) => c.id === "mid")?.momentum ?? 0) +
    (categoryFlows.find((c) => c.id === "ai")?.momentum ?? 0);
  const largeMomentum = categoryFlows.find((c) => c.id === "large")?.momentum ?? 0;

  const memeShare = clamp(memeMomentum * 0.35);
  const altShare = clamp(altMomentum * 0.45);
  const btcShare = clamp(100 - memeShare - altShare);

  const phase: FlowPhase =
    memeShare > 28 && memeMomentum > 85
      ? "Meme Speculation"
      : altShare > btcShare
        ? "Altcoin Rotation"
        : "BTC Accumulation";

  const liqScore = clamp(
    phase === "Altcoin Rotation"
      ? 78
      : phase === "Meme Speculation"
        ? 92
        : largeMomentum > 70
          ? 60
          : 40,
  );

  // 3. Narrative Momentum
  const sorted = [...narratives].sort((a, b) => b.strength - a.strength);
  const leaders = sorted.slice(0, 3).map((n) => ({
    name: n.name,
    strength: n.strength,
    direction: n.direction,
  }));
  const avgStrength = narratives.length
    ? narratives.reduce((s, n) => s + n.strength, 0) / narratives.length
    : 0;
  const risingCount = narratives.filter((n) => n.direction === "rising").length;
  const narrativeScore = clamp(avgStrength + risingCount * 3);

  // 4. Altcoin Strength
  const alts = coinIntel.filter((c) => c.symbol !== "BTC");
  const accumulating = alts.filter((c) => c.flow === "Accumulation").length;
  const breadth = alts.length ? (accumulating / alts.length) * 100 : 0;
  const avgMomentum = alts.length
    ? alts.reduce((s, c) => s + c.momentum, 0) / alts.length
    : 0;
  const avgAltChange = alts.length ? alts.reduce((s, c) => s + c.change24h, 0) / alts.length : 0;
  const vsBtcStrength = clamp(((avgAltChange - btcChange) * 8) + 50, -50, 150) - 50;
  const topPerformers = [...alts]
    .sort((a, b) => b.momentum - a.momentum)
    .slice(0, 4)
    .map((c) => ({
      symbol: c.symbol,
      momentum: c.momentum,
      change24h: c.change24h,
      vsBtc: +(c.change24h - marketOverview.btcChange24h).toFixed(2),
    }));
  const altScore = clamp(avgMomentum * 0.55 + breadth * 0.35 + (vsBtcStrength + 50) * 0.2);

  // 5. Risk Compression
  const hypeIndex = memeCoins.length
    ? memeCoins.reduce((s, m) => s + m.socialHype, 0) / memeCoins.length
    : 0;
  const whaleDistribution =
    memeCoins.filter((m) => m.tags.includes("Whale-controlled")).length * 18 +
    (whale?.phase === "Distribution" ? 20 : 0);
  const volatilitySpike = memeCoins.length
    ? memeCoins.reduce((s, m) => s + Math.abs(m.change24h), 0) / memeCoins.length
    : 0;
  const signals: string[] = [];
  if (hypeIndex > 80) signals.push("Excessive retail hype");
  if (whaleDistribution > 35) signals.push("Whale distribution detected");
  if (volatilitySpike > 15) signals.push("Volatility spike");
  if (marketOverview.volume24h > 0 && marketOverview.volume24h < 100_000_000_000)
    signals.push("Liquidity drying");
  if (whale && whale.impact === "High" && whale.phase === "Accumulation")
    signals.push("Whale accumulation pressure");
  if (signals.length === 0) signals.push("Healthy market structure");

  const rawRisk = hypeIndex * 0.35 + whaleDistribution * 0.25 + volatilitySpike * 1.5;
  const risk: RiskLvl = rawRisk > 75 ? "High" : rawRisk > 45 ? "Medium" : "Low";
  const riskScore = clamp(100 - rawRisk * 0.6);

  // ====== Enhanced composite scoring ======
  // Whale contribution: accumulation lifts, distribution drops
  const whaleScore = whale
    ? clamp(
        50 +
          (whale.phase === "Accumulation"
            ? whale.score * 0.5
            : whale.phase === "Distribution"
              ? -whale.score * 0.5
              : 0),
      )
    : 50;
  // Sentiment contribution with trend acceleration boost
  const sentimentScore = sentiment
    ? clamp(
        sentiment.score +
          (sentiment.trend === "Rising" ? 6 : sentiment.trend === "Falling" ? -6 : 0),
      )
    : 50;

  const w = (layer: string) => weights[layer] ?? BASE_ELITE_BRAIN_WEIGHTS[layer] ?? 0;
  const eliteFluxScore = Math.round(
    btcScore * w("bitcoin") +
      liqScore * w("liquidity") +
      narrativeScore * w("narrative") +
      altScore * w("altcoin") +
      riskScore * w("risk") +
      whaleScore * w("whale") +
      sentimentScore * w("sentiment"),
  );

  const band =
    eliteFluxScore >= 81
      ? "Strong Bullish"
      : eliteFluxScore >= 61
        ? "Early Bullish"
        : eliteFluxScore >= 31
          ? "Neutral"
          : "Risk-Off";
  const bandColor =
    band === "Strong Bullish"
      ? "bull"
      : band === "Early Bullish"
        ? "neon-cyan"
        : band === "Neutral"
          ? "warn"
          : "bear";

  // ====== Enhanced market regime detection ======
  // Priority order: meme speculation > altcoin rotation > risk-off > risk-on expansion > consolidation
  let marketRegime: MarketRegime;
  let regimeConfidence: number;

  const memeDominant = phase === "Meme Speculation" || (memeMomentum > 80 && hypeIndex > 70);
  const altsBeatingBtc = vsBtcStrength > 10 && breadth > 55;
  const riskOff =
    sentimentScore < 38 ||
    (whale?.phase === "Distribution" && whale.impact !== "Low") ||
    (trend === "Bearish" && volatility === "High");
  const expansion =
    sentimentScore > 60 &&
    altScore > 55 &&
    (whaleScore > 50 || whale?.phase === "Accumulation") &&
    trend !== "Bearish";
  const chop = volatility === "Low" && Math.abs(avgAltChange - btcChange) < 1.2 && !memeDominant;

  if (memeDominant) {
    marketRegime = "Meme Speculation";
    regimeConfidence = Math.round(clamp(60 + (memeMomentum - 70) * 1.2));
  } else if (altsBeatingBtc && !riskOff) {
    marketRegime = "Altcoin Rotation";
    regimeConfidence = Math.round(clamp(55 + vsBtcStrength * 1.5));
  } else if (riskOff) {
    marketRegime = "Risk-Off De-risking";
    regimeConfidence = Math.round(clamp(60 + (50 - sentimentScore) + (whale?.score ?? 0) * 0.2));
  } else if (expansion) {
    marketRegime = "Risk-On Expansion";
    regimeConfidence = Math.round(clamp(55 + (sentimentScore - 50) + altScore * 0.2));
  } else if (chop) {
    marketRegime = "Consolidation / Chop";
    regimeConfidence = Math.round(clamp(50 + (10 - Math.abs(avgAltChange - btcChange)) * 4));
  } else {
    marketRegime = "Consolidation / Chop";
    regimeConfidence = 45;
  }

  const headline =
    band === "Strong Bullish"
      ? "Altseason conditions detected"
      : band === "Early Bullish"
        ? "Capital expansion underway"
        : band === "Neutral"
          ? "Sideways regime — selective positioning"
          : "Defensive regime — preserve capital";

  const insight = `${marketRegime} · ${phase} · Risk ${risk} · ${risingCount} narratives rising · breadth ${breadth.toFixed(0)}%${
    whale ? ` · Whales ${whale.phase}` : ""
  }${sentiment ? ` · Sentiment ${sentiment.state} ${sentiment.trend}` : ""}`;

  const pulse =
    dominanceTrend === "Compressing"
      ? "expanding"
      : dominanceTrend === "Expanding"
        ? "compressing"
        : "stable";

  return {
    bitcoin: {
      trend,
      volatility,
      dominance: marketOverview.btcDominance,
      dominanceTrend,
      regime,
      score: btcScore,
    },
    liquidity: { phase, btcShare, altShare, memeShare, rotationStrength: liqScore, score: liqScore },
    narrative: { leaders, avgStrength: Math.round(avgStrength), risingCount, score: narrativeScore },
    altcoin: {
      topPerformers,
      breadth: Math.round(breadth),
      avgMomentum: Math.round(avgMomentum),
      vsBtcStrength: Math.round(vsBtcStrength),
      score: altScore,
    },
    risk: {
      risk,
      signals,
      hypeIndex: Math.round(hypeIndex),
      whaleDistribution,
      volatilitySpike: +volatilitySpike.toFixed(1),
      score: riskScore,
    },
    eliteFluxScore,
    band,
    bandColor,
    headline,
    insight,
    pulse,
    regime: marketRegime,
    regimeConfidence,
    whaleContribution: Math.round(whaleScore),
    sentimentContribution: Math.round(sentimentScore),
  };
}

export function computeRiskIndex(snapshot: MarketSnapshot): {
  score: number;
  label: string;
  description: string;
} {
  const { marketOverview, categoryFlows } = snapshot;
  const btc =
    marketOverview.btcTrend === "bullish"
      ? 80
      : marketOverview.btcTrend === "neutral"
        ? 50
        : 25;
  const dom = 50 - marketOverview.btcDominanceChange * 30;
  const alt = categoryFlows.length
    ? categoryFlows.reduce((s, c) => s + c.momentum, 0) / categoryFlows.length
    : 50;
  const vol = Math.min(100, (marketOverview.volume24h / 200_000_000_000) * 100);
  const score = Math.round(btc * 0.3 + dom * 0.2 + alt * 0.3 + vol * 0.2);
  const label = score >= 71 ? "Strong Bullish" : score >= 31 ? "Neutral / Mixed" : "High Risk";
  const description =
    score >= 71
      ? "Capital expanding across risk curve. Favorable conditions."
      : score >= 31
        ? "Mixed signals. Selective positioning advised."
        : "Defensive regime. Avoid leverage, preserve capital.";
  return { score, label, description };
}
