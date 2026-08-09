// Server-only market history: reads the rolling `market_snapshots` table so the
// intelligence engines can score against real observed history instead of a
// history reconstructed from the 24h change.
import type { HistoryMap } from "./whale-intel";

type Admin = { from: (t: string) => any };

interface CoinCapture {
  price?: number;
  quoteVolume?: number;
  change24h?: number;
}

// Deeper observed history sharpens volatility compression, whale volume-spike
// detection and narrative rotation, all of which were previously scoring
// against a handful of points inside a single trading session.
const MAX_SAMPLES = 96;
const MAX_AGE_MS = 72 * 60 * 60 * 1000;

/** Build a HistoryMap from persisted snapshots. Returns null when too sparse. */
export async function loadPersistedHistory(): Promise<HistoryMap | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - MAX_AGE_MS).toISOString();
    const { data } = await (supabaseAdmin as unknown as Admin)
      .from("market_snapshots")
      .select("captured_at,coins")
      .gte("captured_at", since)
      .order("captured_at", { ascending: true })
      .limit(MAX_SAMPLES);

    const rows = (data ?? []) as { captured_at: string; coins: Record<string, CoinCapture> }[];
    if (rows.length < 3) return null;

    const history: HistoryMap = {};
    for (const row of rows) {
      const ts = new Date(row.captured_at).getTime();
      for (const [symbol, c] of Object.entries(row.coins ?? {})) {
        if (typeof c?.price !== "number" || !Number.isFinite(c.price)) continue;
        (history[symbol] ??= []).push({
          ts,
          price: c.price,
          quoteVolume: typeof c.quoteVolume === "number" ? c.quoteVolume : 0,
        });
      }
    }
    const usable = Object.values(history).filter((s) => s.length >= 3).length;
    return usable >= 5 ? history : null;
  } catch {
    return null;
  }
}

const LAST_GOOD_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * Newest stored reading, reshaped into the ticker map the engines expect.
 * This is the safety net when every upstream provider refuses the backend:
 * slightly stale prices beat a hard outage.
 */
export async function loadLastSnapshotTickers(): Promise<{
  tickers: Record<string, { price: number; change24h: number; volume: number; quoteVolume: number; high24h: number; low24h: number }>;
  capturedAt: number;
} | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as unknown as Admin)
      .from("market_snapshots")
      .select("captured_at,coins")
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const row = data as { captured_at: string; coins: Record<string, CoinCapture> } | null;
    if (!row) return null;
    const capturedAt = new Date(row.captured_at).getTime();
    if (!Number.isFinite(capturedAt) || Date.now() - capturedAt > LAST_GOOD_MAX_AGE_MS) return null;

    const tickers: Record<string, { price: number; change24h: number; volume: number; quoteVolume: number; high24h: number; low24h: number }> = {};
    for (const [symbol, c] of Object.entries(row.coins ?? {})) {
      const price = c?.price;
      if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) continue;
      const quoteVolume = typeof c.quoteVolume === "number" ? c.quoteVolume : 0;
      const change24h = typeof c.change24h === "number" ? c.change24h : 0;
      const open = change24h > -100 ? price / (1 + change24h / 100) : price;
      tickers[`${symbol}USDT`] = {
        price,
        change24h,
        volume: quoteVolume / price,
        quoteVolume,
        high24h: Math.max(price, open),
        low24h: Math.min(price, open),
      };
    }
    return Object.keys(tickers).length ? { tickers, capturedAt } : null;
  } catch {
    return null;
  }
}

let lastLightPersistAt = 0;
const LIGHT_PERSIST_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Best-effort throttled write of a plain price reading, so a last-good value
 * always exists even when no background run has succeeded recently.
 */
export async function persistTickerReading(coins: Record<string, CoinCapture>): Promise<void> {
  if (Date.now() - lastLightPersistAt < LIGHT_PERSIST_INTERVAL_MS) return;
  lastLightPersistAt = Date.now();
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as unknown as Admin).from("market_snapshots").insert({ coins });
  } catch {
    /* best effort */
  }
}


/** Persist the current tick so future runs have real history to read. */
export async function persistSnapshot(
  admin: Admin,
  row: {
    flux_score: number;
    regime: string;
    whale_score: number;
    sentiment_score: number;
    exit_pressure: number;
    ignition_score: number;
    coins: Record<string, CoinCapture>;
  },
): Promise<void> {
  try {
    await admin.from("market_snapshots").insert(row);
  } catch {
    /* history is best-effort — never break alert evaluation */
  }
}
