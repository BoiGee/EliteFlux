// ============================================================
// Multi-Timeframe Confluence Layer
// ------------------------------------------------------------
// A move that agrees across 1h, 4h, 24h and 7d is a trend; a move
// that only shows up on one timeframe is noise. Reads the same
// `market_snapshots` history table other engines already persist
// into, and scores how unanimous each asset's direction is across
// the four horizons — real measured history, not a synthesized
// proxy.
// ============================================================
import type { MarketSnapshot } from "./market";

type Admin = { from: (t: string) => any };

interface CoinCapture {
  price?: number;
}

interface SnapshotRow {
  captured_at: string;
  coins: Record<string, CoinCapture>;
}

const TIMEFRAMES = [
  { key: "1h", targetMs: 3600_000, toleranceMs: 20 * 60_000 },
  { key: "4h", targetMs: 4 * 3600_000, toleranceMs: 45 * 60_000 },
  { key: "24h", targetMs: 24 * 3600_000, toleranceMs: 3 * 3600_000 },
  { key: "7d", targetMs: 7 * 86400_000, toleranceMs: 18 * 3600_000 },
] as const;
type TimeframeKey = (typeof TIMEFRAMES)[number]["key"];

/** The persisted snapshot closest to `now - targetMs`, within `toleranceMs`. Null if nothing qualifies. */
async function nearestSnapshot(admin: Admin, now: number, targetMs: number, toleranceMs: number): Promise<SnapshotRow | null> {
  try {
    const target = now - targetMs;
    const since = new Date(target - toleranceMs).toISOString();
    const until = new Date(target + toleranceMs).toISOString();
    const { data } = await admin
      .from("market_snapshots")
      .select("captured_at,coins")
      .gte("captured_at", since)
      .lte("captured_at", until)
      .order("captured_at", { ascending: true })
      .limit(50);
    const rows = (data ?? []) as SnapshotRow[];
    if (!rows.length) return null;
    let best = rows[0]!;
    let bestDiff = Math.abs(new Date(best.captured_at).getTime() - target);
    for (const r of rows) {
      const diff = Math.abs(new Date(r.captured_at).getTime() - target);
      if (diff < bestDiff) {
        best = r;
        bestDiff = diff;
      }
    }
    return best;
  } catch {
    return null;
  }
}

export interface ConfluenceSignal {
  symbol: string;
  changes: Record<TimeframeKey, number | null>; // % change from that horizon to now
  timeframesAvailable: number;
  direction: "bullish" | "bearish" | "mixed" | "unknown";
  alignmentPct: number; // 0..100 — how unanimous the available timeframes are
  score: number; // 0..100, feeds the recommendation blend like any other layer
}

export interface ConfluenceIntel {
  perAsset: Record<string, ConfluenceSignal | undefined>;
  marketAlignment: number; // average |score - 50| across the universe, 0..50
  generatedAt: number;
}

const MOVE_NOISE_FLOOR_PCT = 0.3; // smaller than this counts as flat, not a directional vote

/** Fetch the four reference snapshots and score confluence for every coin in `snapshot`. */
export async function getConfluenceIntel(admin: Admin, snapshot: MarketSnapshot): Promise<ConfluenceIntel> {
  const now = Date.now();
  const refs = await Promise.all(TIMEFRAMES.map((tf) => nearestSnapshot(admin, now, tf.targetMs, tf.toleranceMs)));

  const perAsset: Record<string, ConfluenceSignal | undefined> = {};
  let alignmentSum = 0;
  let alignmentCount = 0;

  for (const c of snapshot.coinIntel) {
    const changes = {} as Record<TimeframeKey, number | null>;
    let bullish = 0;
    let bearish = 0;
    let available = 0;

    TIMEFRAMES.forEach((tf, i) => {
      const ref = refs[i];
      const past = ref?.coins?.[c.symbol]?.price;
      if (!past || past <= 0 || !c.price) {
        changes[tf.key] = null;
        return;
      }
      const pct = ((c.price - past) / past) * 100;
      changes[tf.key] = Math.round(pct * 100) / 100;
      available++;
      if (pct > MOVE_NOISE_FLOOR_PCT) bullish++;
      else if (pct < -MOVE_NOISE_FLOOR_PCT) bearish++;
    });

    if (available < 2) {
      perAsset[c.symbol] = {
        symbol: c.symbol,
        changes,
        timeframesAvailable: available,
        direction: "unknown",
        alignmentPct: 0,
        score: 50,
      };
      continue;
    }

    const agreeing = Math.max(bullish, bearish);
    const alignmentPct = Math.round((agreeing / available) * 100);
    const direction: ConfluenceSignal["direction"] = bullish === bearish ? "mixed" : bullish > bearish ? "bullish" : "bearish";
    const score =
      direction === "mixed"
        ? 50
        : direction === "bullish"
          ? Math.round(50 + alignmentPct * 0.4)
          : Math.round(50 - alignmentPct * 0.4);

    perAsset[c.symbol] = { symbol: c.symbol, changes, timeframesAvailable: available, direction, alignmentPct, score };
    alignmentSum += Math.abs(score - 50);
    alignmentCount++;
  }

  return {
    perAsset,
    marketAlignment: alignmentCount ? Math.round((alignmentSum / alignmentCount) * 10) / 10 : 0,
    generatedAt: now,
  };
}
