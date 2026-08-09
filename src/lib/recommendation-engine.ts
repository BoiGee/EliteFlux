// ============================================================
// Elite Recommendation Engine
// ------------------------------------------------------------
// Aggregates every EliteFlux intelligence layer into a per-coin
// ranked opportunity score + market stance classification.
// This is a probability-based ranking engine, NOT predictions.
// ============================================================
import type { MarketSnapshot, CoinIntel } from "./market";
import type { WhaleIntel } from "./whale-intel";
import type { SentimentIntel } from "./sentiment-intel";
import type { NarrativeIntel } from "./narrative-engine";
import type { PumpPressureIntel } from "./pump-pressure";
import type { SmartMoneyIntel } from "./smart-money";
import type { OnChainIntel, OnChainSignal } from "./onchain-intel";
import type { DerivativesIntel } from "./derivatives-intel";
import type { OrderBookIntel } from "./orderbook-intel";
import type { SocialIntel } from "./social-intel";
import type { CrowdIntel } from "./crowd-intel";
import type { StablecoinSupplyIntel } from "./stablecoin-intel";
import type { ConfluenceIntel } from "./confluence-intel";
import type { OptionsIntel } from "./options-intel";
import type { MacroIntel } from "./macro-intel";
import type { CrossExchangeIntel } from "./cross-exchange-intel";
import type { CommunityTrustIntel } from "./community-trust";
import { calibrateScore, type ScoreBand } from "./model-calibration";

export type MarketStance =
  | "Accumulation Phase"
  | "Early Expansion Phase"
  | "Momentum Phase"
  | "Distribution Phase"
  | "High Risk / Unstable Phase";

export type Trend = "up" | "down" | "flat";

export interface EliteOpportunity {
  symbol: string;
  name: string;
  category: CoinIntel["category"];
  price: number;
  change24h: number;
  trend: Trend;
  stance: MarketStance;
  score: number; // 0..100 Elite Opportunity Score
  /** score, mapped onto the measured hit rate of scores in its band — what
   * the raw score has actually been worth historically. Equal to score
   * until enough resolved "recommendation" outcomes exist to calibrate
   * against (see calibrateScore in model-calibration.ts). */
  calibratedScore: number;
  band: "Weak" | "Neutral" | "Strong Early" | "High Conviction";
  isHighRisk: boolean;
  contributions: {
    whale: number;
    smartMoney: number;
    sentiment: number;
    narrative: number;
    pressure: number;
    relativeToBtc: number;
    onchain: number;
    derivatives: number;
    orderbook: number;
    social: number;
    crowd: number;
    stablecoin: number;
    confluence: number;
    options: number;
    macro: number;
    crossExchange: number;
    communityTrust: number;
    ignition: number;
  };
  reasonTags: string[];
}

export type GlobalRegime = "Risk-On" | "Risk-Off" | "Alt Rotation" | "Meme Speculation" | "Mixed";
export type LiquidityFlow = "BTC → Alts" | "Alts → BTC" | "Mixed";

export interface GlobalSummary {
  regime: GlobalRegime;
  btcDominanceState: "Rising" | "Falling" | "Stable";
  sentimentState: "Bullish" | "Bearish" | "Neutral";
  liquidityFlow: LiquidityFlow;
}

export interface RecommendationAlert {
  id: string;
  symbol?: string;
  sector?: string;
  reasonTag: string;
  scoreChange: number;
  severity: "info" | "warning" | "critical";
  message: string;
  timestamp: number;
}

export interface RecommendationOutput {
  opportunities: EliteOpportunity[]; // sorted by score desc
  global: GlobalSummary;
  generatedAt: number;
}

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

function bandFor(score: number): EliteOpportunity["band"] {
  if (score >= 81) return "High Conviction";
  if (score >= 61) return "Strong Early";
  if (score >= 31) return "Neutral";
  return "Weak";
}

function trendFor(change: number): Trend {
  if (change > 1) return "up";
  if (change < -1) return "down";
  return "flat";
}

function stanceFor(
  coin: CoinIntel,
  signal: OnChainSignal | undefined,
  whale: WhaleIntel,
  pressureScore: number,
): MarketStance {
  const abs = Math.abs(coin.change24h);
  const isMeme = coin.category === "Meme";

  if (isMeme && (abs > 12 || pressureScore > 75)) return "High Risk / Unstable Phase";
  if (coin.risk === "High" && abs > 8) return "High Risk / Unstable Phase";

  if (signal?.type === "exchange_outflow_accumulation" || signal?.type === "smart_money_cluster") {
    if (abs < 2.5) return "Accumulation Phase";
    if (coin.change24h > 2.5) return "Early Expansion Phase";
  }
  if (signal?.type === "whale_distribution" || signal?.type === "exchange_inflow_spike") {
    return "Distribution Phase";
  }
  if (coin.change24h > 5 && coin.momentum > 65) return "Momentum Phase";
  if (coin.change24h > 1.5 && coin.momentum > 55) return "Early Expansion Phase";
  if (coin.change24h < -3 && whale.phase === "Distribution") return "Distribution Phase";
  if (Math.abs(coin.change24h) < 1.5 && coin.momentum < 50) return "Accumulation Phase";
  return "Early Expansion Phase";
}

/**
 * Starting blend. These are only the cold-start values — once the accuracy
 * scoreboard has enough resolved outcomes, calibrated weights are passed in
 * and these constants stop deciding anything.
 */
export const BASE_RECOMMENDATION_WEIGHTS: Record<string, number> = {
  whale: 0.1,
  smartMoney: 0.1,
  sentiment: 0.09,
  narrative: 0.09,
  pressure: 0.09,
  relativeToBtc: 0.07,
  onchain: 0.08,
  derivatives: 0.05,
  orderbook: 0.05,
  social: 0.03,
  crowd: 0.02,
  stablecoin: 0.03,
  confluence: 0.03,
  options: 0.02,
  macro: 0.03,
  crossExchange: 0.02,
  communityTrust: 0.02,
  // Per-coin momentum-ignition score — previously computed every cycle
  // (momentum-ignition.ts) and used for alerts + the market-wide regime,
  // but never moved a coin's own Opportunity Score. Added here so an
  // early-momentum read on a specific coin actually counts toward it.
  ignition: 0.08,
};

/** The only thing the scoring loop actually reads off any of these four layers. */
interface ScoredPerAsset {
  perAsset: Record<string, { score: number } | undefined>;
}
const NEUTRAL_INTEL: ScoredPerAsset = { perAsset: {} };

export function computeRecommendations(
  snapshot: MarketSnapshot,
  whale: WhaleIntel,
  sentiment: SentimentIntel,
  narrative: NarrativeIntel,
  pressure: PumpPressureIntel,
  smart: SmartMoneyIntel,
  onchain: OnChainIntel,
  weights: Record<string, number> = BASE_RECOMMENDATION_WEIGHTS,
  derivatives: DerivativesIntel | ScoredPerAsset = NEUTRAL_INTEL,
  orderbook: OrderBookIntel | ScoredPerAsset = NEUTRAL_INTEL,
  social: SocialIntel | ScoredPerAsset = NEUTRAL_INTEL,
  crowd: CrowdIntel | ScoredPerAsset = NEUTRAL_INTEL,
  stablecoin: Pick<StablecoinSupplyIntel, "netLiquidityScore"> = { netLiquidityScore: 50 },
  confluence: ConfluenceIntel | ScoredPerAsset = NEUTRAL_INTEL,
  options: Pick<OptionsIntel, "perCurrency"> = { perCurrency: {} },
  macro: Pick<MacroIntel, "score"> = { score: 50 },
  volatility: { perAsset: Record<string, { regime: string } | undefined> } = { perAsset: {} },
  crossExchange: CrossExchangeIntel | ScoredPerAsset = NEUTRAL_INTEL,
  communityTrust: CommunityTrustIntel | ScoredPerAsset = NEUTRAL_INTEL,
  /** Measured hit-rate-by-band history for the "recommendation" signal type.
   * Empty until enough resolved outcomes exist — calibrateScore degrades to
   * the raw score in that case, so this is safe to omit entirely. */
  scoreBands: ScoreBand[] = [],
  /** Per-coin momentum-ignition score (momentum-ignition.ts). Appended last,
   * after scoreBands, so existing positional call sites that already pass
   * scoreBands as their final argument don't shift. */
  ignition: ScoredPerAsset = NEUTRAL_INTEL,
): RecommendationOutput {
  const stablecoinScore = clamp(stablecoin.netLiquidityScore);
  const macroScore = clamp(macro.score);
  const btcChange = snapshot.marketOverview.btcChange24h;
  const narrativeByCoin: Record<string, number> = {};
  for (const n of narrative.detected) {
    for (const c of n.assets ?? []) narrativeByCoin[c] = n.strength;
  }

  const opportunities: EliteOpportunity[] = snapshot.coinIntel.map((c) => {
    const sig = onchain.perAsset[c.symbol];

    // Per-coin component scores (0..100)
    const whaleScore = clamp(
      whale.phase === "Accumulation" ? whale.score : whale.phase === "Distribution" ? 100 - whale.score : 50,
    );
    const smartMoneyScore = clamp(
      smart.dominantClass.includes("Accumulation")
        ? smart.confidenceScore
        : smart.dominantClass.includes("Distribution")
          ? 100 - smart.confidenceScore
          : 50,
    );
    const sentimentScore = sentiment.score;
    const narrativeScore = narrativeByCoin[c.symbol] ?? narrative.aggregateStrength;
    const pressureScore = pressure.score;
    const relBtc = clamp(50 + (c.change24h - btcChange) * 4);
    const onchainScore = sig
      ? sig.type === "whale_accumulation" || sig.type === "exchange_outflow_accumulation"
        ? 60 + sig.intensity * 0.4
        : sig.type === "smart_money_cluster"
          ? 55 + sig.intensity * 0.4
          : sig.type === "large_single_transfer"
            ? (sig.netFlowUsd > 0 ? 58 : 42) + sig.intensity * (sig.netFlowUsd > 0 ? 0.35 : -0.35)
            : 50 - sig.intensity * 0.4
      : 50;
    const derivativesScore = derivatives.perAsset[c.symbol]?.score ?? 50;
    const orderbookScore = orderbook.perAsset[c.symbol]?.score ?? 50;
    const socialScore = social.perAsset[c.symbol]?.score ?? 50;
    const crowdScore = crowd.perAsset[c.symbol]?.score ?? 50;
    const confluenceScore = confluence.perAsset[c.symbol]?.score ?? 50;
    // Deribit only lists BTC/ETH options — every other coin rides neutral, same as any
    // other layer with no coverage for that asset.
    const optionsScore = (options.perCurrency as Record<string, { score: number } | undefined>)[c.symbol]?.score ?? 50;
    const crossExchangeScore = crossExchange.perAsset[c.symbol]?.score ?? 50;
    const communityTrustScore = communityTrust.perAsset[c.symbol]?.score ?? 50;
    const ignitionScore = ignition.perAsset[c.symbol]?.score ?? 50;

    const contributions = {
      whale: Math.round(whaleScore),
      smartMoney: Math.round(smartMoneyScore),
      sentiment: Math.round(sentimentScore),
      narrative: Math.round(narrativeScore),
      pressure: Math.round(pressureScore),
      relativeToBtc: Math.round(relBtc),
      onchain: Math.round(clamp(onchainScore)),
      derivatives: Math.round(clamp(derivativesScore)),
      orderbook: Math.round(clamp(orderbookScore)),
      social: Math.round(clamp(socialScore)),
      crowd: Math.round(clamp(crowdScore)),
      stablecoin: Math.round(stablecoinScore),
      confluence: Math.round(clamp(confluenceScore)),
      options: Math.round(clamp(optionsScore)),
      macro: Math.round(macroScore),
      crossExchange: Math.round(clamp(crossExchangeScore)),
      communityTrust: Math.round(clamp(communityTrustScore)),
      ignition: Math.round(clamp(ignitionScore)),
    };

    // Weighted composite — weights are measured, not guessed, once enough
    // outcomes have been resolved. Convergence still beats single-signal spikes.
    const w = (k: string) => weights[k] ?? BASE_RECOMMENDATION_WEIGHTS[k] ?? 0;
    const score = Math.round(
      clamp(
        whaleScore * w("whale") +
          smartMoneyScore * w("smartMoney") +
          sentimentScore * w("sentiment") +
          narrativeScore * w("narrative") +
          pressureScore * w("pressure") +
          relBtc * w("relativeToBtc") +
          onchainScore * w("onchain") +
          derivativesScore * w("derivatives") +
          orderbookScore * w("orderbook") +
          socialScore * w("social") +
          crowdScore * w("crowd") +
          stablecoinScore * w("stablecoin") +
          confluenceScore * w("confluence") +
          optionsScore * w("options") +
          macroScore * w("macro") +
          crossExchangeScore * w("crossExchange") +
          communityTrustScore * w("communityTrust") +
          ignitionScore * w("ignition"),
      ),
    );

    const calibratedScore = scoreBands.length ? calibrateScore(score, scoreBands) : score;
    const stance = stanceFor(c, sig, whale, pressureScore);
    const reasonTags: string[] = [];
    if (sig) reasonTags.push(sig.type.replace(/_/g, " "));
    if (narrativeByCoin[c.symbol] && narrativeByCoin[c.symbol] >= 70) reasonTags.push("narrative breakout");
    if (relBtc >= 65) reasonTags.push("outperforming BTC");
    if (c.momentum >= 70) reasonTags.push("strong momentum");
    if (ignitionScore >= 70) reasonTags.push("early momentum ignition");
    if (stance === "High Risk / Unstable Phase") reasonTags.push("high volatility");
    // Volatility is descriptive, not a weighted score input — it predicts the SIZE of the
    // next move, not its direction, so folding it into the composite would be statistically
    // dubious. It rides along purely as a reason tag for the coach/UI to explain.
    const volRegime = volatility.perAsset[c.symbol]?.regime;
    if (volRegime === "compressed") reasonTags.push("volatility compression");
    else if (volRegime === "expanded") reasonTags.push("volatility expansion");
    if (communityTrustScore <= 30) reasonTags.push("community flagged");

    return {
      symbol: c.symbol,
      name: c.name,
      category: c.category,
      price: c.price,
      change24h: c.change24h,
      trend: trendFor(c.change24h),
      stance,
      score,
      calibratedScore,
      band: bandFor(score),
      isHighRisk: stance === "High Risk / Unstable Phase",
      contributions,
      reasonTags,
    };
  });

  opportunities.sort((a, b) => b.score - a.score);

  // Global summary
  const mo = snapshot.marketOverview;
  const sentimentState: GlobalSummary["sentimentState"] =
    sentiment.state === "Bullish" ? "Bullish" : sentiment.state === "Bearish" ? "Bearish" : "Neutral";
  const btcDominanceState: GlobalSummary["btcDominanceState"] =
    mo.btcDominanceChange > 0.15 ? "Rising" : mo.btcDominanceChange < -0.15 ? "Falling" : "Stable";

  let liquidityFlow: LiquidityFlow = "Mixed";
  if (btcDominanceState === "Rising") liquidityFlow = "Alts → BTC";
  else if (btcDominanceState === "Falling") liquidityFlow = "BTC → Alts";

  let regime: GlobalRegime = "Mixed";
  const memeFlow = snapshot.categoryFlows.find((c) => c.id === "meme");
  if (memeFlow && memeFlow.change24h > 6) regime = "Meme Speculation";
  else if (btcDominanceState === "Falling" && sentimentState === "Bullish") regime = "Alt Rotation";
  else if (sentimentState === "Bullish" && mo.btcChange24h > 1) regime = "Risk-On";
  else if (sentimentState === "Bearish" && mo.btcChange24h < -1) regime = "Risk-Off";

  return {
    opportunities,
    global: { regime, btcDominanceState, sentimentState, liquidityFlow },
    generatedAt: Date.now(),
  };
}

// ----- Alert diffing -----
export interface PrevRanking {
  scores: Record<string, number>;
  top5: string[];
}

export function diffRecommendationAlerts(
  prev: PrevRanking | null,
  curr: RecommendationOutput,
  ts: number,
): { alerts: RecommendationAlert[]; next: PrevRanking } {
  const alerts: RecommendationAlert[] = [];
  const next: PrevRanking = {
    scores: Object.fromEntries(curr.opportunities.map((o) => [o.symbol, o.score])),
    top5: curr.opportunities.slice(0, 5).map((o) => o.symbol),
  };
  if (!prev) return { alerts, next };

  // Entered top 5
  for (const sym of next.top5) {
    if (!prev.top5.includes(sym)) {
      const o = curr.opportunities.find((x) => x.symbol === sym);
      if (!o) continue;
      alerts.push({
        id: `top5:${sym}:${ts}`,
        symbol: sym,
        reasonTag: "TOP_5_ENTRY",
        scoreChange: o.score - (prev.scores[sym] ?? 0),
        severity: "info",
        message: `${sym} entered the top 5 opportunities (score ${o.score}).`,
        timestamp: ts,
      });
    }
  }

  // Sharp score moves
  for (const o of curr.opportunities) {
    const prevScore = prev.scores[o.symbol];
    if (prevScore == null) continue;
    const delta = o.score - prevScore;
    if (Math.abs(delta) >= 12) {
      alerts.push({
        id: `score:${o.symbol}:${ts}`,
        symbol: o.symbol,
        reasonTag: delta > 0 ? "SCORE_SURGE" : "SCORE_DROP",
        scoreChange: delta,
        severity: Math.abs(delta) >= 20 ? "warning" : "info",
        message: `${o.symbol} Elite Opportunity Score ${delta >= 0 ? "+" : ""}${delta} (now ${o.score}).`,
        timestamp: ts,
      });
    }
  }

  return { alerts, next };
}
