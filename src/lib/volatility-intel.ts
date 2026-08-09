// ============================================================
// Volatility Regime Layer
// ------------------------------------------------------------
// 24h high/low range persisted per cycle and percentile-ranked
// against its own recent history. Compression (low percentile) is
// one of the best-documented precursors to a breakout; expansion
// flags chase risk. This is informational, not directional —
// volatility predicts the SIZE of the next move, not which way it
// goes — so it is deliberately NOT wired into the recommendation
// engine's weighted composite. It surfaces as a reason tag and in
// the coach's read instead.
// ============================================================

type Admin = { from: (t: string) => any };

export interface VolatilitySignal {
  symbol: string;
  rangePct: number; // (high24h - low24h) / price * 100
  percentile: number | null; // 0..100 rank vs this symbol's own recent history, null until enough history exists
  regime: "compressed" | "normal" | "expanded" | "unknown";
}

export interface VolatilityIntel {
  perAsset: Record<string, VolatilitySignal | undefined>;
  generatedAt: number;
}

let lastPersistAt = 0;
const PERSIST_INTERVAL_MS = 30 * 60_000;

async function maybePersist(admin: Admin, readings: { symbol: string; rangePct: number }[]): Promise<void> {
  if (Date.now() - lastPersistAt < PERSIST_INTERVAL_MS) return;
  lastPersistAt = Date.now();
  try {
    await admin.from("volatility_history").insert(readings.map((r) => ({ symbol: r.symbol, range_pct: r.rangePct })));
  } catch {
    /* best effort */
  }
}

const LOOKBACK_DAYS = 30;
const MIN_SAMPLES_FOR_PERCENTILE = 10;

function percentileRank(current: number, history: number[]): number {
  if (!history.length) return 50;
  const below = history.filter((h) => h < current).length;
  return Math.round((below / history.length) * 100);
}

export async function getVolatilityIntel(
  admin: Admin,
  tickers: Record<string, { price: number; high24h: number; low24h: number } | undefined>,
  symbols: { symbol: string; binance?: string }[],
): Promise<VolatilityIntel> {
  const now = Date.now();
  const readings: { symbol: string; rangePct: number }[] = [];
  for (const s of symbols) {
    if (!s.binance) continue;
    const t = tickers[s.binance];
    if (!t || t.price <= 0) continue;
    const rangePct = ((t.high24h - t.low24h) / t.price) * 100;
    if (Number.isFinite(rangePct) && rangePct >= 0) readings.push({ symbol: s.symbol, rangePct });
  }

  void maybePersist(admin, readings);

  const perAsset: VolatilityIntel["perAsset"] = {};
  try {
    const since = new Date(now - LOOKBACK_DAYS * 86400_000).toISOString();
    const { data } = await admin.from("volatility_history").select("symbol,range_pct").gte("captured_at", since).limit(5000);
    const historyRows = (data ?? []) as { symbol: string; range_pct: number }[];

    const bySymbol = new Map<string, number[]>();
    for (const r of historyRows) {
      (bySymbol.get(r.symbol) ?? bySymbol.set(r.symbol, []).get(r.symbol)!).push(r.range_pct);
    }

    for (const r of readings) {
      const hist = bySymbol.get(r.symbol) ?? [];
      if (hist.length < MIN_SAMPLES_FOR_PERCENTILE) {
        perAsset[r.symbol] = { symbol: r.symbol, rangePct: Math.round(r.rangePct * 100) / 100, percentile: null, regime: "unknown" };
        continue;
      }
      const pct = percentileRank(r.rangePct, hist);
      const regime: VolatilitySignal["regime"] = pct <= 25 ? "compressed" : pct >= 75 ? "expanded" : "normal";
      perAsset[r.symbol] = { symbol: r.symbol, rangePct: Math.round(r.rangePct * 100) / 100, percentile: pct, regime };
    }
  } catch {
    for (const r of readings) {
      perAsset[r.symbol] = { symbol: r.symbol, rangePct: Math.round(r.rangePct * 100) / 100, percentile: null, regime: "unknown" };
    }
  }

  return { perAsset, generatedAt: now };
}
