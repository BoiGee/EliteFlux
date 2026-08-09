// Public, unauthenticated: aggregate (never per-user) measured accuracy for
// the track-record page. No PII, no per-user data — just how often each
// signal family has actually been right, exactly what the accuracy
// scoreboard already computes for the coach and the admin console.
import { createServerFn } from "@tanstack/react-start";

const SIGNAL_LABELS: Record<string, string> = {
  flux_score: "EliteFlux Score",
  sentiment: "Sentiment",
  whale: "Whale Intelligence",
  narrative: "Narrative Rotation",
  momentum: "Momentum Ignition",
  smart_money: "Smart Money",
  pump_pressure: "Pump Pressure",
  exit_pressure: "Exit Pressure",
  derivatives: "Derivatives (funding/OI)",
  orderbook: "Order Book Depth",
  social: "Social Attention",
};

export const getPublicTrackRecord = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { loadAccuracy } = await import("@/lib/signal-tracking.server");

  const [rows30, rows7] = await Promise.all([
    loadAccuracy(supabaseAdmin as never, { days: 30, horizon: 24 }),
    loadAccuracy(supabaseAdmin as never, { days: 7, horizon: 24 }),
  ]);
  const recentBySignal = new Map(rows7.map((r) => [r.signalType, r]));

  const families = rows30
    .filter((r) => r.samples >= 5)
    .map((r) => ({
      signal: r.signalType,
      label: SIGNAL_LABELS[r.signalType] ?? r.signalType,
      samples: r.samples,
      hitRatePct: Math.round(r.hitRate * 100),
      avgReturnPct: Math.round(r.avgReturnPct * 100) / 100,
      recentHitRatePct: recentBySignal.has(r.signalType) ? Math.round(recentBySignal.get(r.signalType)!.hitRate * 100) : null,
    }))
    .sort((a, b) => b.samples - a.samples);

  const totalSamples = families.reduce((a, f) => a + f.samples, 0);
  const overallHitRate = totalSamples
    ? Math.round((families.reduce((a, f) => a + (f.hitRatePct / 100) * f.samples, 0) / totalSamples) * 100)
    : null;

  return {
    families,
    totalSamples,
    overallHitRate,
    generatedAt: new Date().toISOString(),
  };
});
