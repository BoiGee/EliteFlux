// Pure alert evaluation engine. No I/O — takes a metrics bundle plus an alert
// definition and decides whether the alert should fire right now.

export type AlertTrigger =
  | "flux_score"
  | "whale_spike"
  | "sentiment_shift"
  | "narrative_surge"
  | "exit_pressure"
  | "momentum_change"
  | "price_threshold";

export interface AlertDefinition {
  id: string;
  user_id: string;
  name: string;
  trigger_type: AlertTrigger;
  symbol: string | null;
  threshold: number | null;
  direction: string | null; // "above" | "below"
  enabled: boolean;
  last_triggered_at: string | null;
}

/** Flattened, serialisable view of every intelligence layer the engine needs. */
export interface AlertMetrics {
  generatedAt: number;
  fluxScore: number;
  regime: string;
  whaleScore: number;
  whalePhase: string;
  whaleBySymbol: Record<string, { score: number; phase: string; volumeSpike: number }>;
  sentimentScore: number;
  sentimentState: string;
  narrativeStrength: number;
  topNarrative: string | null;
  exitPressure: number;
  exitBySymbol: Record<string, { score: number; band: string }>;
  ignitionScore: number;
  ignitionBySymbol: Record<string, { score: number; stage: string }>;
  priceBySymbol: Record<string, { price: number; change24h: number }>;
}

export interface AlertEvaluation {
  fired: boolean;
  message: string;
  value: number | null;
  detail?: Record<string, unknown>;
}

const DEFAULT_THRESHOLDS: Record<AlertTrigger, number> = {
  flux_score: 70,
  whale_spike: 70,
  sentiment_shift: 70,
  narrative_surge: 65,
  exit_pressure: 70,
  momentum_change: 70,
  price_threshold: 0,
};

/** Minimum gap between two firings of the same alert. */
export const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export function isCoolingDown(alert: AlertDefinition, now = Date.now()): boolean {
  if (!alert.last_triggered_at) return false;
  return now - new Date(alert.last_triggered_at).getTime() < ALERT_COOLDOWN_MS;
}

function cross(value: number, threshold: number, direction: string | null): boolean {
  return direction === "below" ? value <= threshold : value >= threshold;
}

const dirWord = (d: string | null) => (d === "below" ? "below" : "above");

export function evaluateAlert(alert: AlertDefinition, m: AlertMetrics): AlertEvaluation {
  const threshold = alert.threshold ?? DEFAULT_THRESHOLDS[alert.trigger_type];
  const sym = alert.symbol?.toUpperCase() ?? null;
  const no = (msg: string): AlertEvaluation => ({ fired: false, message: msg, value: null });

  switch (alert.trigger_type) {
    case "flux_score": {
      const v = m.fluxScore;
      return {
        fired: cross(v, threshold, alert.direction),
        value: v,
        message: `Elite Flux Score ${v.toFixed(0)} is ${dirWord(alert.direction)} ${threshold} — regime: ${m.regime}.`,
        detail: { regime: m.regime },
      };
    }
    case "whale_spike": {
      if (sym) {
        const s = m.whaleBySymbol[sym];
        if (!s) return no(`No whale data for ${sym}.`);
        return {
          fired: cross(s.score, threshold, alert.direction),
          value: s.score,
          message: `${sym} whale activity ${s.score.toFixed(0)} (${s.phase}, ${s.volumeSpike.toFixed(2)}x volume).`,
          detail: { symbol: sym, phase: s.phase },
        };
      }
      return {
        fired: cross(m.whaleScore, threshold, alert.direction),
        value: m.whaleScore,
        message: `Market-wide whale activity ${m.whaleScore.toFixed(0)} — phase ${m.whalePhase}.`,
        detail: { phase: m.whalePhase },
      };
    }
    case "sentiment_shift":
      return {
        fired: cross(m.sentimentScore, threshold, alert.direction),
        value: m.sentimentScore,
        message: `Sentiment ${m.sentimentScore.toFixed(0)} (${m.sentimentState}) is ${dirWord(alert.direction)} ${threshold}.`,
        detail: { state: m.sentimentState },
      };
    case "narrative_surge":
      return {
        fired: cross(m.narrativeStrength, threshold, alert.direction),
        value: m.narrativeStrength,
        message: `Narrative strength ${m.narrativeStrength.toFixed(0)}${m.topNarrative ? ` — leading: ${m.topNarrative}` : ""}.`,
        detail: { topNarrative: m.topNarrative },
      };
    case "exit_pressure": {
      if (sym) {
        const s = m.exitBySymbol[sym];
        if (!s) return no(`No exit data for ${sym}.`);
        return {
          fired: cross(s.score, threshold, alert.direction),
          value: s.score,
          message: `${sym} exit pressure ${s.score.toFixed(0)} — ${s.band}.`,
          detail: { symbol: sym, band: s.band },
        };
      }
      return {
        fired: cross(m.exitPressure, threshold, alert.direction),
        value: m.exitPressure,
        message: `Market exit pressure ${m.exitPressure.toFixed(0)} is ${dirWord(alert.direction)} ${threshold}.`,
      };
    }
    case "momentum_change": {
      if (sym) {
        const s = m.ignitionBySymbol[sym];
        if (!s) return no(`No momentum data for ${sym}.`);
        return {
          fired: cross(s.score, threshold, alert.direction),
          value: s.score,
          message: `${sym} momentum ignition ${s.score.toFixed(0)} — ${s.stage}.`,
          detail: { symbol: sym, stage: s.stage },
        };
      }
      return {
        fired: cross(m.ignitionScore, threshold, alert.direction),
        value: m.ignitionScore,
        message: `Global momentum ignition ${m.ignitionScore.toFixed(0)} is ${dirWord(alert.direction)} ${threshold}.`,
      };
    }
    case "price_threshold": {
      if (!sym) return no("Price alerts require a symbol.");
      const p = m.priceBySymbol[sym];
      if (!p) return no(`No price data for ${sym}.`);
      return {
        fired: cross(p.price, threshold, alert.direction),
        value: p.price,
        message: `${sym} at $${p.price} is ${dirWord(alert.direction)} $${threshold} (${p.change24h > 0 ? "+" : ""}${p.change24h}% 24h).`,
        detail: { symbol: sym, change24h: p.change24h },
      };
    }
    default:
      return no("Unsupported trigger.");
  }
}
