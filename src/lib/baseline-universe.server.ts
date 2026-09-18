// ============================================================
// Baseline Universe
// ------------------------------------------------------------
// The curated COIN_UNIVERSE (src/lib/market.tsx) is ~20 hand-picked coins
// with real display metadata, and feeds every per-symbol-fan-out engine
// (order book depth, derivatives open interest, on-chain flows) — those stay
// scoped to it, since they cost one HTTP request per coin and can't safely
// scale to hundreds without blowing Cloudflare's per-invocation subrequest
// budget and exchange rate limits.
//
// This module is the wide, cheap layer: the top few hundred coins by traded
// volume, sourced from a single batched Binance call, with no per-coin
// display metadata. It exists only to feed the parts of the pipeline that
// are pure in-memory computation (whale/volatility scoring) or a single
// generic write (market_snapshots persistence) — never a per-symbol fetch.
// ============================================================
import type { Ticker } from "./market";

export const BASELINE_UNIVERSE_SIZE = 300;

const BINANCE_REST = "https://api.binance.com/api/v3";

interface BinanceTicker24h {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  volume: string;
  quoteVolume: string;
  highPrice: string;
  lowPrice: string;
}

interface ExchangeSymbolInfo {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  permissions?: string[];
  isSpotTradingAllowed?: boolean;
}

// Binance doesn't tag "stablecoin" anywhere in exchangeInfo — these would
// otherwise dominate the top-N by volume without ever moving in price, which
// is pure noise for whale/volatility detection.
const STABLE_BASE_ASSETS = new Set([
  "USDC", "FDUSD", "TUSD", "BUSD", "DAI", "USDP", "PYUSD", "USDE", "EUR", "GBP", "AEUR", "EURI", "USTC", "FRAX", "GUSD",
]);

function marketFetch(url: string): Promise<Response> {
  return fetch(url, { headers: { "User-Agent": "EliteFlux/1.0 (+https://elite-flux.com)", Accept: "application/json" } });
}

/**
 * Tradeable spot USDT pairs, excluding leveraged tokens and stablecoins.
 * Uses Binance's own `permissions` flag rather than a symbol-suffix regex —
 * a naive /UP|DOWN|BULL|BEAR/ match false-positives on real coins like JUP.
 */
async function loadTradeableSpotUsdtSymbols(): Promise<Set<string>> {
  const res = await marketFetch(`${BINANCE_REST}/exchangeInfo?permissions=SPOT`);
  if (!res.ok) throw new Error(`exchangeInfo HTTP ${res.status}`);
  const json = (await res.json()) as { symbols: ExchangeSymbolInfo[] };
  const set = new Set<string>();
  for (const s of json.symbols) {
    if (s.quoteAsset !== "USDT" || s.status !== "TRADING") continue;
    if (s.isSpotTradingAllowed === false) continue;
    if (s.permissions?.includes("LEVERAGED")) continue;
    if (STABLE_BASE_ASSETS.has(s.baseAsset)) continue;
    set.add(s.symbol);
  }
  return set;
}

/** Pure — unit-testable without network. */
export function rankBaselineSymbols(
  arr: BinanceTicker24h[],
  tradeable: Set<string>,
  limit: number,
): Array<{ symbol: string; ticker: Ticker }> {
  return arr
    .filter((t) => tradeable.has(t.symbol))
    .map((t) => ({
      symbol: t.symbol,
      ticker: {
        price: parseFloat(t.lastPrice),
        change24h: parseFloat(t.priceChangePercent),
        volume: parseFloat(t.volume),
        quoteVolume: parseFloat(t.quoteVolume) || 0,
        high24h: parseFloat(t.highPrice),
        low24h: parseFloat(t.lowPrice),
      },
    }))
    .filter((x) => Number.isFinite(x.ticker.price) && x.ticker.price > 0)
    .sort((a, b) => b.ticker.quoteVolume - a.ticker.quoteVolume)
    .slice(0, limit);
}

export interface BaselineUniverseResult {
  /** Binance pair (e.g. "SOMECOINUSDT") -> ticker, already ranked and capped. */
  tickers: Record<string, Ticker>;
  /** Same pairs, desc by quoteVolume. */
  symbols: string[];
  fetchedAt: number;
}

/**
 * One unscoped, batched read of every USDT spot pair, ranked by volume and
 * capped at `limit`. Deliberately not `symbols=`-scoped like the curated
 * ticker fetch — Binance returns all pairs in one call when the param is
 * omitted, which is simpler and cheaper than building a huge symbols array.
 * Best-effort: a failure here must never break the core snapshot, only
 * degrade the wide-coverage extras for this cycle.
 */
export async function fetchBaselineUniverse(limit = BASELINE_UNIVERSE_SIZE): Promise<BaselineUniverseResult | null> {
  try {
    const { cached } = await import("./ttl-cache.server");
    const [tradeable, arr] = await Promise.all([
      cached("binance-tradeable-usdt-symbols", { ttlMs: 6 * 3600_000, staleMs: 24 * 3600_000 }, loadTradeableSpotUsdtSymbols),
      (async () => {
        const res = await marketFetch(`${BINANCE_REST}/ticker/24hr`);
        if (!res.ok) throw new Error(`ticker/24hr HTTP ${res.status}`);
        return (await res.json()) as BinanceTicker24h[];
      })(),
    ]);

    const ranked = rankBaselineSymbols(arr, tradeable, limit);
    const tickers: Record<string, Ticker> = {};
    for (const { symbol, ticker } of ranked) tickers[symbol] = ticker;
    return { tickers, symbols: ranked.map((r) => r.symbol), fetchedAt: Date.now() };
  } catch (e) {
    console.error("fetchBaselineUniverse failed — wide-coverage whale/volatility inputs degrade to curated-only this cycle", e);
    return null;
  }
}
