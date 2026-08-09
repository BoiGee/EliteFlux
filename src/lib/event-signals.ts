import type { EliteBrainOutput, MarketRegime } from "./elite-brain";
import type { WhaleIntel } from "./whale-intel";
import type { SentimentIntel, SentimentState } from "./sentiment-intel";
import type { NarrativeIntel } from "./narrative-engine";
import type { PumpPressureIntel, PressureBand } from "./pump-pressure";
import type { SmartMoneyIntel } from "./smart-money";
import type { EliteBrainV3Output, RegimeV3 } from "./elite-brain-v3";

export type EventSeverity = "info" | "low" | "medium" | "high" | "extreme" | "warning" | "critical";
export type EventType =
  | "whale_activity_change"
  | "sentiment_shift"
  | "flux_threshold_cross"
  | "regime_transition"
  | "narrative_strength_cross"
  | "pump_pressure_surge"
  | "smart_money_cluster"
  | "v3_regime_transition";

export interface EventSignal {
  id: string;
  event_type: EventType;
  asset?: string;
  sector?: string;
  severity: EventSeverity;
  timestamp: number;
  explanation: string;
  tag: string;
}

export interface IntelSnapshot {
  whaleScore: number;
  whalePhase: WhaleIntel["phase"];
  sentimentScore: number;
  sentimentState: SentimentState;
  fluxScore: number;
  regime: MarketRegime;
  // v3 additions
  narrativeTop: { id: string; strength: number } | null;
  pressureScore: number;
  pressureBand: PressureBand;
  smartConfidence: number;
  smartClass: SmartMoneyIntel["dominantClass"];
  regimeV3: RegimeV3;
}

const THRESHOLDS = [30, 60, 80];
const NARRATIVE_THRESHOLD = 70;

function uid(parts: (string | number)[]) {
  return parts.join(":");
}

export function diffEvents(prev: IntelSnapshot | null, curr: IntelSnapshot, ts: number): EventSignal[] {
  if (!prev) return [];
  const events: EventSignal[] = [];

  const whaleDelta = curr.whaleScore - prev.whaleScore;
  if (Math.abs(whaleDelta) >= 15 || curr.whalePhase !== prev.whalePhase) {
    events.push({
      id: uid(["whale", ts]),
      event_type: "whale_activity_change",
      severity: Math.abs(whaleDelta) >= 30 || curr.whalePhase !== prev.whalePhase ? "warning" : "info",
      timestamp: ts,
      explanation: `Whale activity ${whaleDelta >= 0 ? "rising" : "cooling"} (${prev.whaleScore} → ${curr.whaleScore}). Phase ${prev.whalePhase} → ${curr.whalePhase}.`,
      tag: `WHALE_${curr.whalePhase.toUpperCase()}`,
    });
  }

  if (curr.sentimentState !== prev.sentimentState) {
    const severity: EventSeverity =
      (prev.sentimentState === "Bullish" && curr.sentimentState === "Bearish") ||
      (prev.sentimentState === "Bearish" && curr.sentimentState === "Bullish")
        ? "critical"
        : "warning";
    events.push({
      id: uid(["sent", ts]),
      event_type: "sentiment_shift",
      severity,
      timestamp: ts,
      explanation: `Sentiment ${prev.sentimentState} → ${curr.sentimentState} (${prev.sentimentScore} → ${curr.sentimentScore}).`,
      tag: `SENT_${curr.sentimentState.toUpperCase()}`,
    });
  }

  for (const t of THRESHOLDS) {
    const crossedUp = prev.fluxScore < t && curr.fluxScore >= t;
    const crossedDown = prev.fluxScore >= t && curr.fluxScore < t;
    if (crossedUp || crossedDown) {
      events.push({
        id: uid(["flux", t, ts]),
        event_type: "flux_threshold_cross",
        severity: t === 80 ? "critical" : t === 60 ? "warning" : "info",
        timestamp: ts,
        explanation: `Elite Flux Score ${crossedUp ? "crossed above" : "fell below"} ${t} (${prev.fluxScore} → ${curr.fluxScore}).`,
        tag: `FLUX_${crossedUp ? "BREAK" : "FAIL"}_${t}`,
      });
    }
  }

  if (curr.regime !== prev.regime) {
    events.push({
      id: uid(["regime", ts]),
      event_type: "regime_transition",
      severity:
        curr.regime === "Risk-Off De-risking"
          ? "critical"
          : curr.regime === "Meme Speculation"
            ? "warning"
            : "info",
      timestamp: ts,
      explanation: `Market regime shifted: ${prev.regime} → ${curr.regime}.`,
      tag: `REGIME_${curr.regime.replace(/\W+/g, "_").toUpperCase()}`,
    });
  }

  // v3: narrative strength crossing 70
  const prevN = prev.narrativeTop;
  const currN = curr.narrativeTop;
  if (currN && (!prevN || prevN.id !== currN.id || (prevN.strength < NARRATIVE_THRESHOLD && currN.strength >= NARRATIVE_THRESHOLD))) {
    if (currN.strength >= NARRATIVE_THRESHOLD) {
      events.push({
        id: uid(["narr", currN.id, ts]),
        event_type: "narrative_strength_cross",
        sector: currN.id,
        severity: currN.strength >= 85 ? "high" : "medium",
        timestamp: ts,
        explanation: `Narrative "${currN.id}" strength reached ${currN.strength}.`,
        tag: `NARR_${currN.id.toUpperCase()}_BREAK`,
      });
    }
  }

  // v3: pump pressure surge — rapid increase in short window
  const pressureDelta = curr.pressureScore - prev.pressureScore;
  if (pressureDelta >= 12 || (curr.pressureBand !== prev.pressureBand && (curr.pressureBand === "High" || curr.pressureBand === "Extreme"))) {
    events.push({
      id: uid(["press", ts]),
      event_type: "pump_pressure_surge",
      severity: curr.pressureBand === "Extreme" ? "extreme" : pressureDelta >= 20 ? "high" : "medium",
      timestamp: ts,
      explanation: `Pump pressure surged ${prev.pressureScore} → ${curr.pressureScore} (${curr.pressureBand}).`,
      tag: `PRESSURE_${curr.pressureBand.toUpperCase()}`,
    });
  }

  // v3: smart money cluster forming
  if (
    (curr.smartClass !== prev.smartClass && curr.smartClass !== "Mixed Flow / Uncertain") ||
    (curr.smartConfidence - prev.smartConfidence >= 18 && curr.smartConfidence >= 60)
  ) {
    events.push({
      id: uid(["smart", ts]),
      event_type: "smart_money_cluster",
      severity: curr.smartConfidence >= 75 ? "high" : "medium",
      timestamp: ts,
      explanation: `${curr.smartClass} detected (confidence ${curr.smartConfidence}).`,
      tag: `SMART_${curr.smartClass.replace(/\W+/g, "_").toUpperCase()}`,
    });
  }

  // v3: regime transition
  if (curr.regimeV3 !== prev.regimeV3) {
    events.push({
      id: uid(["regimeV3", ts]),
      event_type: "v3_regime_transition",
      severity:
        curr.regimeV3 === "Distribution / Exit Phase" || curr.regimeV3 === "Risk-Off De-risking Phase"
          ? "high"
          : curr.regimeV3 === "Meme Speculation Phase"
            ? "medium"
            : "medium",
      timestamp: ts,
      explanation: `Phase transition: ${prev.regimeV3} → ${curr.regimeV3}.`,
      tag: `PHASE_${curr.regimeV3.replace(/\W+/g, "_").toUpperCase()}`,
    });
  }

  return events;
}

export function brainToIntelSnapshot(
  brain: EliteBrainOutput,
  whale: WhaleIntel,
  sentiment: SentimentIntel,
  narrative?: NarrativeIntel,
  pressure?: PumpPressureIntel,
  smart?: SmartMoneyIntel,
  v3?: EliteBrainV3Output,
): IntelSnapshot {
  const top = narrative?.detected[0];
  return {
    whaleScore: whale.score,
    whalePhase: whale.phase,
    sentimentScore: sentiment.score,
    sentimentState: sentiment.state,
    fluxScore: brain.eliteFluxScore,
    regime: brain.regime,
    narrativeTop: top ? { id: top.id, strength: top.strength } : null,
    pressureScore: pressure?.score ?? 0,
    pressureBand: pressure?.band ?? "Low",
    smartConfidence: smart?.confidenceScore ?? 0,
    smartClass: smart?.dominantClass ?? "Mixed Flow / Uncertain",
    regimeV3: v3?.regime ?? "Accumulation Phase (Smart Money Entry)",
  };
}
