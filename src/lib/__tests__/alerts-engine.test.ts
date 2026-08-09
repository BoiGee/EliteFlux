import { describe, expect, it } from "vitest";
import {
  ALERT_COOLDOWN_MS,
  evaluateAlert,
  isCoolingDown,
  type AlertDefinition,
  type AlertMetrics,
} from "../alerts-engine";

const metrics: AlertMetrics = {
  generatedAt: Date.now(),
  fluxScore: 72,
  regime: "Altcoin Rotation",
  whaleScore: 55,
  whalePhase: "Accumulation",
  whaleBySymbol: { BTC: { score: 81, phase: "Accumulation", volumeSpike: 2.4 } },
  sentimentScore: 44,
  sentimentState: "Neutral",
  narrativeStrength: 30,
  topNarrative: "AI",
  exitPressure: 25,
  exitBySymbol: { ETH: { score: 78, band: "High" } },
  ignitionScore: 40,
  ignitionBySymbol: { SOL: { score: 88, stage: "Ignition" } },
  priceBySymbol: { BTC: { price: 64000, change24h: 3.1 } },
};

const alert = (over: Partial<AlertDefinition>): AlertDefinition => ({
  id: "a1",
  user_id: "u1",
  name: "test",
  trigger_type: "flux_score",
  symbol: null,
  threshold: null,
  direction: null,
  enabled: true,
  last_triggered_at: null,
  ...over,
});

describe("cooldown", () => {
  const now = Date.now();
  it("never cools down an alert that has not fired", () => {
    expect(isCoolingDown(alert({}), now)).toBe(false);
  });
  it("cools down inside the window", () => {
    const at = new Date(now - ALERT_COOLDOWN_MS / 2).toISOString();
    expect(isCoolingDown(alert({ last_triggered_at: at }), now)).toBe(true);
  });
  it("releases after the window", () => {
    const at = new Date(now - ALERT_COOLDOWN_MS - 1000).toISOString();
    expect(isCoolingDown(alert({ last_triggered_at: at }), now)).toBe(false);
  });
});

describe("threshold crossing", () => {
  it("fires above the threshold by default", () => {
    expect(evaluateAlert(alert({ threshold: 70 }), metrics).fired).toBe(true);
    expect(evaluateAlert(alert({ threshold: 80 }), metrics).fired).toBe(false);
  });

  it("respects the below direction", () => {
    const below = alert({ threshold: 80, direction: "below" });
    expect(evaluateAlert(below, metrics).fired).toBe(true);
    expect(evaluateAlert(alert({ threshold: 60, direction: "below" }), metrics).fired).toBe(false);
  });

  it("uses per-trigger defaults when no threshold is set", () => {
    // narrative default is 65, current strength is 30
    expect(evaluateAlert(alert({ trigger_type: "narrative_surge" }), metrics).fired).toBe(false);
    // flux default is 70, current score is 72
    expect(evaluateAlert(alert({ trigger_type: "flux_score" }), metrics).fired).toBe(true);
  });
});

describe("per-symbol triggers", () => {
  it("uses the symbol reading when a symbol is set", () => {
    const r = evaluateAlert(
      alert({ trigger_type: "whale_spike", symbol: "btc", threshold: 75 }),
      metrics,
    );
    expect(r.fired).toBe(true);
    expect(r.value).toBe(81);
  });

  it("does not fire when the symbol has no data", () => {
    const r = evaluateAlert(
      alert({ trigger_type: "exit_pressure", symbol: "DOGE", threshold: 10 }),
      metrics,
    );
    expect(r.fired).toBe(false);
    expect(r.value).toBeNull();
  });

  it("requires a symbol for price alerts", () => {
    expect(evaluateAlert(alert({ trigger_type: "price_threshold", threshold: 1 }), metrics).fired).toBe(
      false,
    );
    expect(
      evaluateAlert(alert({ trigger_type: "price_threshold", symbol: "BTC", threshold: 60000 }), metrics)
        .fired,
    ).toBe(true);
  });

  it("falls back to the market-wide reading without a symbol", () => {
    const r = evaluateAlert(alert({ trigger_type: "momentum_change", threshold: 30 }), metrics);
    expect(r.value).toBe(metrics.ignitionScore);
    expect(r.fired).toBe(true);
  });
});
