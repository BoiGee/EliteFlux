import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * The dashboard's live score (market.tsx's runEliteBrain, recomputed
 * client-side from a live WebSocket/poll feed) is deliberately NOT the same
 * computation as the server's periodic one (jobs.server.ts, every 5
 * minutes, persisted to market_snapshots) — alerts and Autopilot act on the
 * server's value, not the live one. That's an intentional live-responsiveness
 * tradeoff, not a bug, but it means the two numbers can genuinely differ at
 * any given moment. This exists so the dashboard can show what the server
 * actually last confirmed alongside the live number, instead of a user
 * wondering why an alert fired at a score that doesn't match what's on
 * screen right now.
 */
export const getServerSnapshotStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Not every market_snapshots row carries a real score — the fast cron
    // (evaluate-alerts-fast, every minute) persists its own rows too, more
    // often than the regular job that actually runs the full brain
    // computation, so "most recent row" alone frequently lands on a
    // null-score one. Filtering for a real score directly means this
    // returns the last genuinely confirmed reading, not whichever row
    // happens to be newest.
    const { data } = await supabaseAdmin
      .from("market_snapshots")
      .select("flux_score,regime,captured_at")
      .not("flux_score", "is", null)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as { flux_score: number | null; regime: string | null; captured_at: string } | null;
    if (!row || row.flux_score === null) return null;
    return { fluxScore: row.flux_score, regime: row.regime, capturedAt: row.captured_at };
  });
