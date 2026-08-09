import type { MarketSnapshot } from "./market";
import type { WhaleIntel } from "./whale-intel";
import type { SentimentIntel } from "./sentiment-intel";
import type { NarrativeIntel } from "./narrative-engine";
import type { MomentumIgnitionIntel } from "./momentum-ignition";
import type { SmartMoneyIntel } from "./smart-money";
import type { PumpPressureIntel } from "./pump-pressure";

export type RegimeV3 =
  | "Risk-Off De-risking Phase"
  | "Accumulation Phase (Smart Money Entry)"
  | "Early Expansion Phase"
  | "Altcoin Rotation Phase"
  | "Meme Speculation Phase"
  | "Distribution / Exit Phase";

export interface RegimeTransition {
  from: RegimeV3 | null;
  to: RegimeV3;
  at: number;
  reason: string;
}

export interface EliteBrainV3Output {
  regime: RegimeV3;
  confidence: number; // 0..100
  cognitionScore: number; // 0..100 unified intelligence score
  signals: string[];
  transition: RegimeTransition | null;
  vector: {
    whale: number;
    sentiment: number;
    narrative: number;
    ignition: number;
    pressure: number;
    smartMoney: number;
  };
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export interface BrainV3Context {
  previousRegime: RegimeV3 | null;
}

export function runEliteBrainV3(
  snapshot: MarketSnapshot,
  whale: WhaleIntel,
  sentiment: SentimentIntel,
  narrative: NarrativeIntel,
  ignition: MomentumIgnitionIntel,
  smart: SmartMoneyIntel,
  pressure: PumpPressureIntel,
  ctx: BrainV3Context = { previousRegime: null },
): EliteBrainV3Output {
  const memeNarr = narrative.detected.find((n) => n.id === "meme");
  const altNarrStrong =
    (narrative.detected.find((n) => n.id === "l1")?.strength ?? 0) > 60 ||
    (narrative.detected.find((n) => n.id === "ai")?.strength ?? 0) > 60;

  const altsBeatBtc =
    snapshot.coinIntel
      .filter((c) => c.symbol !== "BTC")
      .reduce((s, c) => s + c.change24h, 0) /
      Math.max(snapshot.coinIntel.length - 1, 1) >
    snapshot.marketOverview.btcChange24h + 1;

  const riskOff =
    sentiment.state === "Bearish" ||
    smart.dominantClass === "Whale Distribution Cluster" ||
    snapshot.marketOverview.btcChange24h < -3;

  const distribution =
    whale.phase === "Distribution" &&
    smart.coordinationIndex > 55 &&
    sentiment.trend !== "Rising";

  const accumulation =
    smart.dominantClass === "Institutional Accumulation Cluster" &&
    smart.confidenceScore > 55 &&
    sentiment.state !== "Bearish";

  const earlyExpansion =
    ignition.ignitionScore > 60 &&
    pressure.band !== "Low" &&
    sentiment.trend !== "Falling" &&
    !riskOff;

  let regime: RegimeV3;
  let reason: string;

  if (memeNarr && memeNarr.strength > 75 && memeNarr.acceleration === "rising") {
    regime = "Meme Speculation Phase";
    reason = "Meme narrative strength >75 with rising acceleration";
  } else if (distribution || (riskOff && pressure.band === "Low")) {
    regime = distribution ? "Distribution / Exit Phase" : "Risk-Off De-risking Phase";
    reason = distribution
      ? "Coordinated whale distribution detected"
      : "Bearish sentiment with no pressure buildup";
  } else if (altsBeatBtc && altNarrStrong && pressure.score > 55) {
    regime = "Altcoin Rotation Phase";
    reason = "Alts outperforming BTC with strong sector narratives";
  } else if (earlyExpansion) {
    regime = "Early Expansion Phase";
    reason = "Ignition + pressure buildup with healthy sentiment";
  } else if (accumulation) {
    regime = "Accumulation Phase (Smart Money Entry)";
    reason = "Institutional accumulation cluster with high confidence";
  } else if (riskOff) {
    regime = "Risk-Off De-risking Phase";
    reason = "Defensive market structure";
  } else {
    regime = "Accumulation Phase (Smart Money Entry)";
    reason = "Default to base accumulation when no extremes detected";
  }

  // Confidence: blend pressure, smart money, narrative aggregate
  const confidence = Math.round(
    clamp(
      pressure.score * 0.35 +
        smart.confidenceScore * 0.35 +
        narrative.aggregateStrength * 0.3,
    ),
  );

  const cognitionScore = Math.round(
    clamp(
      whale.score * 0.15 +
        sentiment.score * 0.18 +
        narrative.aggregateStrength * 0.18 +
        ignition.ignitionScore * 0.16 +
        pressure.score * 0.18 +
        smart.confidenceScore * 0.15,
    ),
  );

  const signals: string[] = [];
  if (narrative.topEmerging.length > 0)
    signals.push(`Emerging narrative: ${narrative.topEmerging[0].label}`);
  if (ignition.ignitionScore > 65) signals.push("Multi-asset momentum ignition active");
  if (pressure.band === "Extreme") signals.push("Extreme pump pressure — breakout conditions");
  if (smart.confidenceScore > 65)
    signals.push(`${smart.dominantClass} (confidence ${smart.confidenceScore})`);
  if (sentiment.trend === "Rising" && sentiment.state === "Bullish")
    signals.push("Sentiment accelerating bullish");
  if (signals.length === 0) signals.push("Equilibrium — no dominant signal");

  const transition: RegimeTransition | null =
    ctx.previousRegime && ctx.previousRegime !== regime
      ? { from: ctx.previousRegime, to: regime, at: Date.now(), reason }
      : null;

  return {
    regime,
    confidence,
    cognitionScore,
    signals,
    transition,
    vector: {
      whale: whale.score,
      sentiment: sentiment.score,
      narrative: narrative.aggregateStrength,
      ignition: ignition.ignitionScore,
      pressure: pressure.score,
      smartMoney: smart.confidenceScore,
    },
  };
}
