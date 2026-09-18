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
// volume, sourced from a single batched exchange call, with no per-coin
// display metadata. It exists only to feed the parts of the pipeline that
// are pure in-memory computation (whale/volatility scoring) or a single
// generic write (market_snapshots persistence) — never a per-symbol fetch.
//
// Binance returns 403 (blocked) on every request from this Worker's
// egress — confirmed live in production. OKX is tried first now, Bybit
// second, and the original Binance path is kept intact as a last-resort
// tail (it may work again from a different egress path) rather than
// deleted.
// ============================================================
import type { Ticker } from "./market";

export const BASELINE_UNIVERSE_SIZE = 300;

const OKX_REST = "https://www.okx.com/api/v5";
const BYBIT_REST = "https://api.bybit.com/v5";
const BINANCE_REST = "https://api.binance.com/api/v3";

const FETCH_TIMEOUT_MS = 8_000;

// No fetch() in the wider pipeline previously had a timeout — a single
// stalled upstream response could hang the whole evaluate-alerts cycle
// indefinitely, since nothing here raced against a clock. Confirmed live:
// jobs sitting in "running" for 10+ minutes with no error logged.
function marketFetch(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { headers: { "User-Agent": "EliteFlux/1.0 (+https://elite-flux.com)", Accept: "application/json" }, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

// Neither OKX nor Bybit tags "stablecoin" or "leveraged" in their public
// ticker responses the way Binance's exchangeInfo `permissions` flag did —
// stablecoins would otherwise dominate the top-N by volume without ever
// moving in price, which is pure noise for whale/volatility detection.
const STABLE_BASE_ASSETS = new Set([
  "USDC", "FDUSD", "TUSD", "BUSD", "DAI", "USDP", "PYUSD", "USDE", "EUR", "GBP", "AEUR", "EURI", "USTC", "FRAX", "GUSD",
]);

// OKX's own historical leveraged-token naming (retired in 2022) — anchored
// to these specific suffixes rather than a loose /UP|DOWN|BULL|BEAR/ regex,
// since that style already false-positives on a real coin (JUP) in the
// Binance path below.
const LEVERAGED_SUFFIX = /(3L|3S|5L|5S)$/;

export interface BaselineUniverseResult {
  /** Binance-pair-shaped key (e.g. "SOMECOINUSDT") -> ticker, already ranked and capped. */
  tickers: Record<string, Ticker>;
  /** Same pairs, desc by quoteVolume. */
  symbols: string[];
  fetchedAt: number;
}

interface OkxTicker24h {
  instId: string;
  last: string;
  open24h: string;
  high24h: string;
  low24h: string;
  vol24h: string;
  volCcy24h: string;
}

function isTradeableOkxInstrument(instId: string): boolean {
  const [base, quote] = instId.split("-");
  if (quote !== "USDT" || !base) return false;
  if (STABLE_BASE_ASSETS.has(base)) return false;
  if (LEVERAGED_SUFFIX.test(base)) return false;
  return true;
}

/** Pure — unit-testable without network. */
export function rankBaselineSymbolsOkx(arr: OkxTicker24h[], limit: number): Array<{ symbol: string; ticker: Ticker }> {
  return arr
    .filter((t) => isTradeableOkxInstrument(t.instId))
    .map((t) => {
      const price = parseFloat(t.last);
      const open = parseFloat(t.open24h);
      return {
        symbol: t.instId.replace("-", ""), // "BTC-USDT" -> "BTCUSDT" — keeps the Binance-pair-shaped key every downstream consumer expects
        ticker: {
          price,
          change24h: Number.isFinite(open) && open > 0 ? ((price - open) / open) * 100 : 0,
          volume: parseFloat(t.vol24h) || 0,
          quoteVolume: parseFloat(t.volCcy24h) || 0,
          high24h: parseFloat(t.high24h) || price,
          low24h: parseFloat(t.low24h) || price,
        },
      };
    })
    .filter((x) => Number.isFinite(x.ticker.price) && x.ticker.price > 0)
    .sort((a, b) => b.ticker.quoteVolume - a.ticker.quoteVolume)
    .slice(0, limit);
}

async function fetchBaselineFromOkx(limit: number): Promise<Array<{ symbol: string; ticker: Ticker }>> {
  const res = await marketFetch(`${OKX_REST}/market/tickers?instType=SPOT`);
  if (!res.ok) {
    res.body?.cancel().catch(() => {});
    throw new Error(`OKX market/tickers HTTP ${res.status}`);
  }
  const json = (await res.json()) as { data?: OkxTicker24h[] };
  return rankBaselineSymbolsOkx(json.data ?? [], limit);
}

interface BybitTicker24h {
  symbol: string;
  lastPrice: string;
  price24hPcnt: string;
  highPrice24h: string;
  lowPrice24h: string;
  volume24h: string;
  turnover24h: string;
}

function isTradeableBybitSymbol(symbol: string): boolean {
  if (!symbol.endsWith("USDT")) return false;
  const base = symbol.slice(0, -4);
  if (STABLE_BASE_ASSETS.has(base)) return false;
  if (LEVERAGED_SUFFIX.test(base)) return false;
  return true;
}

/** Pure — unit-testable without network. */
export function rankBaselineSymbolsBybit(arr: BybitTicker24h[], limit: number): Array<{ symbol: string; ticker: Ticker }> {
  return arr
    .filter((t) => isTradeableBybitSymbol(t.symbol))
    .map((t) => ({
      symbol: t.symbol,
      ticker: {
        price: parseFloat(t.lastPrice),
        change24h: (parseFloat(t.price24hPcnt) || 0) * 100,
        volume: parseFloat(t.volume24h) || 0,
        quoteVolume: parseFloat(t.turnover24h) || 0,
        high24h: parseFloat(t.highPrice24h) || parseFloat(t.lastPrice),
        low24h: parseFloat(t.lowPrice24h) || parseFloat(t.lastPrice),
      },
    }))
    .filter((x) => Number.isFinite(x.ticker.price) && x.ticker.price > 0)
    .sort((a, b) => b.ticker.quoteVolume - a.ticker.quoteVolume)
    .slice(0, limit);
}

async function fetchBaselineFromBybit(limit: number): Promise<Array<{ symbol: string; ticker: Ticker }>> {
  const res = await marketFetch(`${BYBIT_REST}/market/tickers?category=spot`);
  if (!res.ok) {
    res.body?.cancel().catch(() => {});
    throw new Error(`Bybit market/tickers HTTP ${res.status}`);
  }
  const json = (await res.json()) as { result?: { list?: BybitTicker24h[] } };
  return rankBaselineSymbolsBybit(json.result?.list ?? [], limit);
}

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

/**
 * Tradeable spot USDT pairs, excluding leveraged tokens and stablecoins.
 * Uses Binance's own `permissions` flag rather than a symbol-suffix regex —
 * a naive /UP|DOWN|BULL|BEAR/ match false-positives on real coins like JUP.
 */
async function loadTradeableSpotUsdtSymbols(): Promise<Set<string>> {
  const res = await marketFetch(`${BINANCE_REST}/exchangeInfo?permissions=SPOT`);
  if (!res.ok) {
    res.body?.cancel().catch(() => {});
    throw new Error(`exchangeInfo HTTP ${res.status}`);
  }
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

/** Unchanged Binance path, demoted to last-resort tail — never deleted. */
async function fetchBaselineFromBinance(limit: number): Promise<Array<{ symbol: string; ticker: Ticker }>> {
  const { cached } = await import("./ttl-cache.server");
  const [tradeable, arr] = await Promise.all([
    cached("binance-tradeable-usdt-symbols", { ttlMs: 6 * 3600_000, staleMs: 24 * 3600_000 }, loadTradeableSpotUsdtSymbols),
    (async () => {
      const res = await marketFetch(`${BINANCE_REST}/ticker/24hr`);
      if (!res.ok) {
        res.body?.cancel().catch(() => {});
        throw new Error(`ticker/24hr HTTP ${res.status}`);
      }
      return (await res.json()) as BinanceTicker24h[];
    })(),
  ]);
  return rankBaselineSymbols(arr, tradeable, limit);
}

const BASELINE_SOURCES: Array<{ label: string; load: (limit: number) => Promise<Array<{ symbol: string; ticker: Ticker }>> }> = [
  { label: "OKX", load: fetchBaselineFromOkx },
  { label: "Bybit", load: fetchBaselineFromBybit },
  { label: "Binance", load: fetchBaselineFromBinance },
];

/**
 * One unscoped, batched read of the top `limit` USDT pairs by traded
 * volume, tried against OKX, then Bybit, then Binance in turn — the first
 * source to answer wins. Best-effort: a failure here must never break the
 * core snapshot, only degrade the wide-coverage extras for this cycle.
 */
export async function fetchBaselineUniverse(limit = BASELINE_UNIVERSE_SIZE): Promise<BaselineUniverseResult | null> {
  for (const source of BASELINE_SOURCES) {
    try {
      const ranked = await source.load(limit);
      const tickers: Record<string, Ticker> = {};
      for (const { symbol, ticker } of ranked) tickers[symbol] = ticker;
      if (!Object.keys(tickers).length) throw new Error("no usable tickers");
      return { tickers, symbols: ranked.map((r) => r.symbol), fetchedAt: Date.now() };
    } catch (e) {
      console.error(`fetchBaselineUniverse: ${source.label} source failed`, e);
    }
  }
  console.error("fetchBaselineUniverse: every source failed — wide-coverage whale/volatility inputs degrade to curated-only this cycle");
  return null;
}
