import type { MarketSnapshot } from "./market";
import type { WhaleIntel } from "./whale-intel";
import type { SentimentIntel } from "./sentiment-intel";
import type { NarrativeIntel } from "./narrative-engine";
import type { MomentumIgnitionIntel } from "./momentum-ignition";
import type { SmartMoneyIntel } from "./smart-money";

export type PressureBand = "Low" | "Moderate" | "High" | "Extreme";

export interface PumpPressureIntel {
  score: number; // 0..100
  band: PressureBand;
  contributors: {
    liquidityInflow: number;
    sentimentAccel: number;
    volumeExpansion: number;
    narrativeStrength: number;
    whaleAlignment: number;
    momentumIgnition: number;
  };
  rationale: string;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function computePumpPressure(
  snapshot: MarketSnapshot,
  whale: WhaleIntel,
  sentiment: SentimentIntel,
  narrative: NarrativeIntel,
  ignition: MomentumIgnitionIntel,
  smart: SmartMoneyIntel,
): PumpPressureIntel {
  // Liquidity inflow proxy from market cap change + dominance compression
  const liquidityInflow = clamp(
    50 +
      snapshot.marketOverview.marketCapChange * 6 -
      snapshot.marketOverview.btcDominanceChange * 15,
  );
  const sentimentAccel = clamp(
    sentiment.score +
      (sentiment.trend === "Rising" ? 10 : sentiment.trend === "Falling" ? -10 : 0),
  );
  const volumeExpansion = sentiment.components.volumeExpansion;
  const narrativeStrength = clamp(
    narrative.aggregateStrength + (narrative.topEmerging.length > 0 ? 8 : 0),
  );
  const whaleAlignment = clamp(
    whale.phase === "Accumulation"
      ? 50 + whale.score * 0.5 + smart.coordinationIndex * 0.2
      : whale.phase === "Distribution"
        ? 50 - whale.score * 0.4
        : 50,
  );
  const momentumIgnition = ignition.ignitionScore;

  const score = Math.round(
    clamp(
      liquidityInflow * 0.18 +
        sentimentAccel * 0.18 +
        volumeExpansion * 0.14 +
        narrativeStrength * 0.16 +
        whaleAlignment * 0.16 +
        momentumIgnition * 0.18,
    ),
  );

  const band: PressureBand =
    score >= 81 ? "Extreme" : score >= 61 ? "High" : score >= 31 ? "Moderate" : "Low";

  const rationale =
    band === "Extreme"
      ? "Liquidity, sentiment and whale activity stacking — breakout conditions forming."
      : band === "High"
        ? "Strong accumulation phase with broad participation."
        : band === "Moderate"
          ? "Early pressure formation, watch for confirmation."
          : "No meaningful pressure buildup detected.";

  return {
    score,
    band,
    contributors: {
      liquidityInflow: Math.round(liquidityInflow),
      sentimentAccel: Math.round(sentimentAccel),
      volumeExpansion: Math.round(volumeExpansion),
      narrativeStrength: Math.round(narrativeStrength),
      whaleAlignment: Math.round(whaleAlignment),
      momentumIgnition: Math.round(momentumIgnition),
    },
    rationale,
  };
}
