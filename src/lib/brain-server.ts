import { COIN_UNIVERSE, deriveSnapshot, type MarketSnapshot, type SentimentLabel, type Ticker } from "./market";
import type { BaselineUniverseResult } from "./baseline-universe.server";
import { computeWhaleIntel, type HistoryMap, type WhaleIntel } from "./whale-intel";
import { computeSentimentIntel, type SentimentIntel } from "./sentiment-intel";
import { runEliteBrain } from "./elite-brain";
import { computeNarrativeIntel, type NarrativeIntel } from "./narrative-engine";
import { computeMomentumIgnition, type MomentumIgnitionIntel } from "./momentum-ignition";
import { computeSmartMoney, type SmartMoneyIntel } from "./smart-money";
import { computePumpPressure, type PumpPressureIntel } from "./pump-pressure";
import { runEliteBrainV3 } from "./elite-brain-v3";
import { computeOnChainIntel, fetchOnChainFlows, type OnChainSignal } from "./onchain-intel";
import { getStablecoinSupplyIntel, type StablecoinSupplyIntel } from "./stablecoin-intel";
import { getConfluenceIntel, type ConfluenceIntel } from "./confluence-intel";
import { getOptionsIntel, type OptionsIntel } from "./options-intel";
import { getMacroIntel, type MacroIntel } from "./macro-intel";
import { getVolatilityIntel, type VolatilityIntel } from "./volatility-intel";
import { fetchOkxPrices, computeCrossExchangeIntel, type CrossExchangeIntel } from "./cross-exchange-intel";
import { getCommunityTrustIntel, type CommunityTrustIntel } from "./community-trust";
import { loadCrowdIntel, type CrowdIntel } from "./crowd-intel";
import { computeExitIntel } from "./exit-intel";
import { fetchDerivativesData, computeDerivativesIntel, type DerivativesIntel } from "./derivatives-intel";
import { fetchOrderBookData, computeOrderBookIntel, type OrderBookIntel } from "./orderbook-intel";
import { fetchTrendingData, computeSocialIntel, type SocialIntel } from "./social-intel";
import type { AlertMetrics } from "./alerts-engine";
import { computeConfidence, layerAgreement, type ConfidenceResult } from "./model-calibration";
import type { SignalEventInput } from "./signal-tracking.server";


const BINANCE_REST = "https://api.binance.com/api/v3";
const BINANCE_MIRROR = "https://data-api.binance.vision/api/v3";
const OKX_REST = "https://www.okx.com/api/v5";
const BYBIT_REST = "https://api.bybit.com/v5";
const COINGECKO = "https://api.coingecko.com/api/v3";
const PAPRIKA = "https://api.coinpaprika.com/v1";
const FNG = "https://api.alternative.me/fng/?limit=1";


/**
 * Every outbound provider call goes through here. Anonymous requests are
 * rejected outright by some providers (HTTP 403 "add a descriptive
 * User-Agent"), which is fatal for the cron cycle.
 */
const FETCH_TIMEOUT_MS = 8_000;

// No fetch() in this pipeline previously had a timeout — a single stalled
// upstream response (no error, just never resolving) could hang the whole
// evaluate-alerts cycle indefinitely, since Promise.all waits for every
// promise to settle and nothing here was racing against a clock. Confirmed
// live: jobs were sitting in "running" for 10+ minutes with no error logged.
function marketFetch(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, {
    headers: {
      "User-Agent": "EliteFlux/1.0 (+https://elite-flux.com)",
      Accept: "application/json",
    },
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
}

async function readJson<T>(url: string, label: string): Promise<T> {
  const res = await marketFetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const clean = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    throw new Error(`${label} HTTP ${res.status}${clean ? ` — ${clean.slice(0, 120)}` : ""}`);
  }
  return (await res.json()) as T;
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

async function fetchBinanceLike(base: string, label: string): Promise<Record<string, Ticker>> {
  const symbols = COIN_UNIVERSE.filter((c) => c.binance).map((c) => c.binance!);
  const url = `${base}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`;
  const arr = await readJson<BinanceTicker24h[]>(url, label);
  const out: Record<string, Ticker> = {};
  for (const t of arr) {
    out[t.symbol] = {
      price: parseFloat(t.lastPrice),
      change24h: parseFloat(t.priceChangePercent),
      volume: parseFloat(t.volume),
      quoteVolume: parseFloat(t.quoteVolume),
      high24h: parseFloat(t.highPrice),
      low24h: parseFloat(t.lowPrice),
    };
  }
  if (!Object.keys(out).length) throw new Error(`${label} returned no usable tickers`);
  return out;
}

interface OkxTicker {
  instId: string;
  last: string;
  open24h: string;
  high24h: string;
  low24h: string;
  vol24h: string;
  volCcy24h: string;
}

/** Second exchange, different corporate network path — survives region blocks. */
async function fetchOkxTickers(): Promise<Record<string, Ticker>> {
  const json = await readJson<{ data?: OkxTicker[] }>(`${OKX_REST}/market/tickers?instType=SPOT`, "OKX");
  const byInst = new Map((json.data ?? []).map((t) => [t.instId, t]));
  const out: Record<string, Ticker> = {};
  for (const c of COIN_UNIVERSE) {
    if (!c.binance) continue;
    const t = byInst.get(`${c.symbol}-USDT`);
    if (!t) continue;
    const price = parseFloat(t.last);
    const open = parseFloat(t.open24h);
    if (!Number.isFinite(price) || price <= 0) continue;
    out[c.binance] = {
      price,
      change24h: Number.isFinite(open) && open > 0 ? ((price - open) / open) * 100 : 0,
      volume: parseFloat(t.vol24h) || 0,
      quoteVolume: parseFloat(t.volCcy24h) || 0,
      high24h: parseFloat(t.high24h) || price,
      low24h: parseFloat(t.low24h) || price,
    };
  }
  if (!Object.keys(out).length) throw new Error("OKX returned no usable tickers");
  return out;
}

interface BybitTicker {
  symbol: string;
  lastPrice: string;
  price24hPcnt: string; // fraction, e.g. "0.0123" = 1.23%
  highPrice24h: string;
  lowPrice24h: string;
  volume24h: string; // base asset
  turnover24h: string; // quote (USDT) volume
}

/** Third exchange, no auth — Bybit's spot symbol already matches the
 * Binance-shaped pair key ("BTCUSDT") every downstream consumer expects,
 * unlike OKX's dashed instId. */
async function fetchBybitTickers(): Promise<Record<string, Ticker>> {
  const json = await readJson<{ result?: { list?: BybitTicker[] } }>(`${BYBIT_REST}/market/tickers?category=spot`, "Bybit");
  const bySymbol = new Map((json.result?.list ?? []).map((t) => [t.symbol, t]));
  const out: Record<string, Ticker> = {};
  for (const c of COIN_UNIVERSE) {
    if (!c.binance) continue;
    const t = bySymbol.get(c.binance);
    if (!t) continue;
    const price = parseFloat(t.lastPrice);
    if (!Number.isFinite(price) || price <= 0) continue;
    out[c.binance] = {
      price,
      change24h: (parseFloat(t.price24hPcnt) || 0) * 100,
      volume: parseFloat(t.volume24h) || 0,
      quoteVolume: parseFloat(t.turnover24h) || 0,
      high24h: parseFloat(t.highPrice24h) || price,
      low24h: parseFloat(t.lowPrice24h) || price,
    };
  }
  if (!Object.keys(out).length) throw new Error("Bybit returned no usable tickers");
  return out;
}

interface GeckoMarket {
  id: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  total_volume: number | null;
  high_24h: number | null;
  low_24h: number | null;
}

function mapGeckoMarkets(arr: GeckoMarket[], label: string): Record<string, Ticker> {
  const byId = new Map(arr.map((m) => [m.id, m]));
  const out: Record<string, Ticker> = {};
  for (const c of COIN_UNIVERSE) {
    if (!c.binance || !c.coingecko) continue;
    const m = byId.get(c.coingecko);
    if (!m || typeof m.current_price !== "number") continue;
    const change = m.price_change_percentage_24h ?? 0;
    const quoteVolume = m.total_volume ?? 0;
    out[c.binance] = {
      price: m.current_price,
      change24h: change,
      volume: m.current_price > 0 ? quoteVolume / m.current_price : 0,
      quoteVolume,
      high24h: m.high_24h ?? m.current_price,
      low24h: m.low_24h ?? m.current_price,
    };
  }
  if (!Object.keys(out).length) throw new Error(`${label} returned no usable tickers`);
  return out;
}

/** Aggregator backup — last resort when every exchange refuses the backend. */
async function fetchTickersFallback(): Promise<Record<string, Ticker>> {
  const ids = COIN_UNIVERSE.filter((c) => c.coingecko).map((c) => c.coingecko!);
  const url = `${COINGECKO}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids.join(","))}&per_page=250&price_change_percentage=24h`;
  return mapGeckoMarkets(await readJson<GeckoMarket[]>(url, "Aggregator"), "Aggregator");
}


interface PaprikaTicker {
  id: string;
  symbol: string;
  rank: number;
  quotes?: { USD?: { price?: number; volume_24h?: number; percent_change_24h?: number } };
}

/**
 * Independent aggregator that serves backend traffic without a key and
 * without region blocks — the workhorse when the exchanges refuse us.
 */
export async function fetchPaprikaTickers(): Promise<Record<string, Ticker>> {
  const arr = await readJson<PaprikaTicker[]>(`${PAPRIKA}/tickers?quotes=USD`, "Independent aggregator");
  const wanted = new Map(COIN_UNIVERSE.filter((c) => c.binance).map((c) => [c.symbol, c.binance!]));
  const best = new Map<string, PaprikaTicker>();
  for (const t of arr) {
    if (!wanted.has(t.symbol)) continue;
    const prev = best.get(t.symbol);
    if (!prev || (t.rank > 0 && t.rank < prev.rank)) best.set(t.symbol, t);
  }
  const out: Record<string, Ticker> = {};
  for (const [symbol, pair] of wanted) {
    const q = best.get(symbol)?.quotes?.USD;
    const price = q?.price;
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) continue;
    const change24h = q?.percent_change_24h ?? 0;
    const quoteVolume = q?.volume_24h ?? 0;
    const open = change24h > -100 ? price / (1 + change24h / 100) : price;
    out[pair] = {
      price,
      change24h,
      volume: quoteVolume / price,
      quoteVolume,
      high24h: Math.max(price, open),
      low24h: Math.min(price, open),
    };
  }
  if (!Object.keys(out).length) throw new Error("Independent aggregator returned no usable tickers");
  return out;
}

/** Keyed aggregator read — identified by API key, so it isn't IP-throttled. */
async function fetchKeyedTickers(key: string): Promise<Record<string, Ticker>> {
  const ids = COIN_UNIVERSE.filter((c) => c.coingecko).map((c) => c.coingecko!);
  const url = `${COINGECKO}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids.join(","))}&per_page=250&price_change_percentage=24h&x_cg_demo_api_key=${encodeURIComponent(key)}`;
  return mapGeckoMarkets(await readJson<GeckoMarket[]>(url, "Keyed aggregator"), "Keyed aggregator");
}

/** Final safety net: the newest reading we already stored in our own database. */
async function fetchStoredTickers(): Promise<Record<string, Ticker>> {
  const { loadLastSnapshotTickers } = await import("./market-history.server");
  const stored = await loadLastSnapshotTickers();
  if (!stored) throw new Error("no recent stored reading available");
  return stored.tickers;
}

export type TickerSource = "keyed" | "primary" | "secondary" | "aggregator" | "fallback" | "extra" | "mirror" | "stored";

// Binance returns 403 (blocked) on every request from this Worker's egress —
// confirmed live in production. Two guaranteed-to-fail Binance attempts
// before falling through used to waste real cycle time every run (measured
// contributing to a 22s job runtime and Cloudflare's own "stalled response
// canceled" warnings). OKX and Bybit both work from here, so they're tried
// first now; Binance stays in the chain as a best-effort tail (it may work
// again from a different egress path, and other code paths still need it
// directly) rather than the first thing every cycle pays for.
function tickerSources(): Array<{ id: TickerSource; load: () => Promise<Record<string, Ticker>> }> {
  const key = process.env["COINGECKO_API_KEY"];
  return [
    ...(key ? [{ id: "keyed" as const, load: () => fetchKeyedTickers(key) }] : []),
    { id: "primary" as const, load: () => fetchOkxTickers() },
    { id: "secondary" as const, load: () => fetchBybitTickers() },
    { id: "aggregator" as const, load: () => fetchPaprikaTickers() },
    { id: "fallback" as const, load: () => fetchTickersFallback() },
    { id: "extra" as const, load: () => fetchBinanceLike(BINANCE_REST, "Primary venue") },
    { id: "mirror" as const, load: () => fetchBinanceLike(BINANCE_MIRROR, "Primary mirror") },
    { id: "stored" as const, load: () => fetchStoredTickers() },
  ];
}

/** Walk the source chain; first venue that answers wins. */
async function loadTickers(): Promise<{ tickers: Record<string, Ticker>; tickerSource: TickerSource }> {
  const errors: string[] = [];
  for (const src of tickerSources()) {
    try {
      return { tickers: await src.load(), tickerSource: src.id };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      console.error(`ticker source ${src.id} failed`, msg);
      errors.push(`${src.id}: ${msg}`);
    }
  }
  throw new Error(`no market data source available — ${errors.join("; ")}`);
}




async function fetchGlobal() {
  try {
    const r = await marketFetch(`${COINGECKO}/global`);
    if (!r.ok) throw new Error(`global HTTP ${r.status}`);
    const j = await r.json();
    const d = j.data;
    return {
      btcDominance: d.market_cap_percentage.btc as number,
      totalMarketCap: d.total_market_cap.usd as number,
      marketCapChange: d.market_cap_change_percentage_24h_usd as number,
      totalVolume: d.total_volume.usd as number,
    };
  } catch {
    // Independent source, so a throttled aggregator can't blank the header stats.
    try {
      const r = await marketFetch(`${PAPRIKA}/global`);
      if (!r.ok) return null;
      const g = (await r.json()) as {
        bitcoin_dominance_percentage?: number;
        market_cap_usd?: number;
        market_cap_change_24h?: number;
        volume_24h_usd?: number;
      };
      if (typeof g.market_cap_usd !== "number") return null;
      return {
        btcDominance: g.bitcoin_dominance_percentage ?? 0,
        totalMarketCap: g.market_cap_usd,
        marketCapChange: g.market_cap_change_24h ?? 0,
        totalVolume: g.volume_24h_usd ?? 0,
      };
    } catch {
      return null;
    }
  }
}


async function fetchFng(): Promise<{ score: number; label: SentimentLabel } | null> {
  try {
    const r = await marketFetch(FNG);
    if (!r.ok) return null;

    const j = await r.json();
    const item = j.data?.[0];
    if (!item) return null;
    return {
      score: parseInt(item.value, 10),
      label: (item.value_classification as SentimentLabel) ?? "Neutral",
    };
  } catch {
    return null;
  }
}

export interface BrainServerResult {
  snapshot: MarketSnapshot;
  whale: ReturnType<typeof computeWhaleIntel>;
  sentiment: ReturnType<typeof computeSentimentIntel>;
  brain: ReturnType<typeof runEliteBrain>;
  narrative: ReturnType<typeof computeNarrativeIntel>;
  ignition: ReturnType<typeof computeMomentumIgnition>;
  smartMoney: ReturnType<typeof computeSmartMoney>;
  pressure: ReturnType<typeof computePumpPressure>;
  brainV3: ReturnType<typeof runEliteBrainV3>;
  onchain: ReturnType<typeof computeOnChainIntel>;
  exit: ReturnType<typeof computeExitIntel>;
  derivatives: DerivativesIntel;
  orderbook: OrderBookIntel;
  social: SocialIntel;
  stablecoin: StablecoinSupplyIntel;
  confluence: ConfluenceIntel;
  options: OptionsIntel;
  macro: MacroIntel;
  volatility: VolatilityIntel;
  crossExchange: CrossExchangeIntel;
  communityTrust: CommunityTrustIntel;
  /** Aggregated stance counts from EliteFlux's own users' logged calls — proprietary, not available anywhere else. */
  crowd: CrowdIntel;
  /** Latest 24h quote volume per symbol — persisted so future runs get real history. */
  volumes: Record<string, number>;
  /** Top ~300 coins by traded volume, short-symbol-keyed, excluding anything already in COIN_UNIVERSE. Empty when the baseline fetch failed this cycle. */
  baselineTickers: Record<string, Ticker>;
  /** True when the engines scored against persisted history, not a synthesized one. */
  historySource: "persisted" | "synthesized";
  /** Which venue served the prices behind this snapshot. */
  tickerSource: TickerSource;
  /** How much this read can be trusted right now, and why. */
  confidence: ConfidenceResult;
  /** Depth of observed history backing the read, 0..1. */
  historyDepth: number;

  generatedAt: number;
}

function synthesizeHistory(snapshot: MarketSnapshot, tickers: Record<string, Ticker>): HistoryMap {
  const now = Date.now();
  const history: HistoryMap = {};
  for (const c of snapshot.coinIntel) {
    const t = tickers[`${c.symbol}USDT`];
    if (!t) continue;
    const samples = 8;
    const arr = [];
    for (let i = 0; i < samples; i++) {
      const frac = i / (samples - 1);
      const priceAtStart = t.price / (1 + c.change24h / 100);
      const price = priceAtStart + (t.price - priceAtStart) * frac;
      const vol = t.quoteVolume * (0.6 + frac * 0.8);
      arr.push({ ts: now - (samples - i) * 4000, price, quoteVolume: vol });
    }
    history[c.symbol] = arr;
  }
  return history;
}

/** Raw upstream market payload, shared by the brain and the public feed. */
export interface UpstreamMarketData {
  tickers: Record<string, Ticker>;
  global: Awaited<ReturnType<typeof fetchGlobal>>;
  fng: Awaited<ReturnType<typeof fetchFng>>;
  /** Which venue actually served the prices on this read. */
  tickerSource: TickerSource;
  /** Top ~300 coins by traded volume, beyond the curated COIN_UNIVERSE. Best-effort — null on failure. */
  baseline: BaselineUniverseResult | null;

  fetchedAt: number;
}

/**
 * One shared upstream read for the whole server. Every visitor, cron run and
 * agent tool goes through this, so provider call volume stays flat no matter
 * how many users are online.
 */
export async function getUpstreamMarketData(): Promise<UpstreamMarketData> {
  const { cached } = await import("./ttl-cache.server");
  // Long TTL + long stale window: page views must never translate into
  // upstream calls, which is what got our backend rate-limited.
  return cached("upstream-market", { ttlMs: 60_000, staleMs: 15 * 60_000 }, async () => {
    const t0 = Date.now();
    console.log("[diag] getUpstreamMarketData: starting cold fetch");
    const { fetchBaselineUniverse } = await import("./baseline-universe.server");
    const [tickerRead, global, fng, baseline] = await Promise.all([loadTickers(), fetchGlobal(), fetchFng(), fetchBaselineUniverse()]);
    console.log(`[diag] getUpstreamMarketData: Promise.all resolved after ${Date.now() - t0}ms, tickerSource=${tickerRead.tickerSource}, baseline=${baseline ? "ok" : "null"}`);

    // Keep a durable last-good reading so a total provider outage degrades
    // into stale prices instead of a dead dashboard.
    if (tickerRead.tickerSource !== "stored") {
      try {
        const coins: Record<string, { price: number; change24h: number; quoteVolume: number }> = {};
        for (const c of COIN_UNIVERSE) {
          const t = c.binance ? tickerRead.tickers[c.binance] : undefined;
          if (t) coins[c.symbol] = { price: t.price, change24h: t.change24h, quoteVolume: t.quoteVolume };
        }
        if (Object.keys(coins).length) {
          const { persistTickerReading } = await import("./market-history.server");
          await persistTickerReading(coins);
        }
      } catch {
        /* best effort */
      }
    }

    return { ...tickerRead, global, fng, baseline, fetchedAt: Date.now() };
  });
}

export interface ExtendedMarketData {
  derivatives: DerivativesIntel;
  orderbook: OrderBookIntel;
  social: SocialIntel;
  onchainReal: OnChainSignal[] | null;
  stablecoin: StablecoinSupplyIntel;
  confluence: ConfluenceIntel;
  options: OptionsIntel;
  macro: MacroIntel;
  volatility: VolatilityIntel;
  crossExchange: CrossExchangeIntel;
  communityTrust: CommunityTrustIntel;
  crowd: CrowdIntel;
  fetchedAt: number;
}

const NEUTRAL_MACRO: MacroIntel = {
  dxy: { correlation30d: null, sampleSize: 0, return30dPct: null },
  spx: { correlation30d: null, sampleSize: 0, return30dPct: null },
  gold: { correlation30d: null, sampleSize: 0, return30dPct: null },
  regime: "insufficient_data",
  score: 50,
  generatedAt: 0,
};

/**
 * The extra intelligence layers: derivatives (funding/OI), order-book depth,
 * social attention, and real on-chain flow when a key is configured. Slower
 * and heavier than the core ticker read (dozens of calls across venues), so
 * it's cached separately with a longer TTL and shares one fetch across every
 * visitor and cron run, same as getUpstreamMarketData above.
 */
export async function getExtendedMarketData(
  snapshot: MarketSnapshot,
  tickers: Record<string, Ticker>,
  baseline: BaselineUniverseResult | null = null,
): Promise<ExtendedMarketData> {
  const { cached } = await import("./ttl-cache.server");
  return cached("extended-market", { ttlMs: 90_000, staleMs: 30 * 60_000 }, async () => {
    // Order book depth and derivatives open interest cost one HTTP request
    // PER symbol (see fetchOrderBookData/fetchDerivativesData) — these stay
    // scoped to the curated flagship list. Widening them to the ~300-coin
    // baseline would multiply Cloudflare Workers subrequests and exchange
    // rate-limit weight per cron cycle for no product benefit (nothing shows
    // order-book/derivatives depth for coins outside the flagship dashboard).
    const binanceSymbols = COIN_UNIVERSE.filter((c) => c.binance).map((c) => c.binance!);
    const ethPrice = snapshot.coinIntel.find((c) => c.symbol === "ETH")?.price;

    // Volatility is pure in-memory computation (no extra fetch per symbol),
    // so it's cheap to widen to the baseline set. Curated reading wins on any
    // overlap (spread order below), and baseline entries already covered by
    // COIN_UNIVERSE are dropped rather than scored twice.
    const curatedSymbols = new Set(COIN_UNIVERSE.map((c) => c.symbol));
    const volatilityTickers = baseline ? { ...baseline.tickers, ...tickers } : tickers;
    const volatilitySymbols: { symbol: string; binance?: string }[] = baseline
      ? [
          ...COIN_UNIVERSE,
          ...baseline.symbols
            .filter((p) => p.endsWith("USDT"))
            .map((p) => ({ symbol: p.slice(0, -4), binance: p }))
            .filter((s) => !curatedSymbols.has(s.symbol)),
        ]
      : COIN_UNIVERSE;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Every one of these degrades to a neutral fallback on failure rather
    // than aborting the cycle (unlike the core whale/sentiment chain below,
    // these are additive layers, not foundational) — but that used to be
    // completely silent (no console.error at all). If one provider breaks
    // for weeks, every downstream consumer just sees a permanent neutral
    // contribution with no operational signal anything died. `logged` names
    // the failure so it at least shows up in logs/tail.
    const logged = <T,>(label: string, p: Promise<T>, fallback: T): Promise<T> =>
      p.catch((e) => {
        console.error(`brain-server: ${label} failed, degrading to neutral fallback`, e);
        return fallback;
      });

    // Macro data (daily closes off Yahoo + CoinGecko) barely moves intra-day —
    // its own long-lived cache so it isn't re-fetched every 90s with everything else.
    const macroPromise = cached("macro-intel", { ttlMs: 3 * 3600_000, staleMs: 24 * 3600_000 }, () =>
      logged("getMacroIntel", getMacroIntel(), NEUTRAL_MACRO),
    );

    // Derivatives and order-book each fan out to several concurrent
    // per-symbol Binance calls internally (see their own concurrency caps).
    // Running both of those fan-outs at the same time — on top of every
    // other branch below — was enough combined in-flight connection count to
    // trip Cloudflare's "stalled HTTP response canceled to prevent deadlock"
    // protection, confirmed live via wrangler tail. Sequencing just these
    // two (letting everything else below still run in parallel) keeps the
    // peak concurrent connection count bounded without giving up the
    // per-fan-out concurrency caps entirely.
    const derivativesThenOrderBook = (async () => {
      const derivatives = await logged("fetchDerivativesData", fetchDerivativesData(binanceSymbols), null);
      const orderBook = await logged("fetchOrderBookData", fetchOrderBookData(binanceSymbols), new Map());
      return [derivatives, orderBook] as const;
    })();

    const [[rawDerivatives, rawOrderBook], rawTrending, onchainReal, stablecoin, confluence, options, macro, okxPrices, volatility, communityTrust, crowd] =
      await Promise.all([
        derivativesThenOrderBook,
        logged("fetchTrendingData", fetchTrendingData(), null),
        logged("fetchOnChainFlows", fetchOnChainFlows(ethPrice), null),
        logged(
          "getStablecoinSupplyIntel",
          getStablecoinSupplyIntel(supabaseAdmin as never),
          { perSymbol: {}, netLiquidityScore: 50, totalSupplyUsd: 0, generatedAt: Date.now() } as StablecoinSupplyIntel,
        ),
        logged(
          "getConfluenceIntel",
          getConfluenceIntel(supabaseAdmin as never, snapshot),
          { perAsset: {}, marketAlignment: 0, generatedAt: Date.now() } as ConfluenceIntel,
        ),
        logged(
          "getOptionsIntel",
          getOptionsIntel(supabaseAdmin as never),
          { perCurrency: {}, generatedAt: Date.now() } as OptionsIntel,
        ),
        macroPromise,
        logged("fetchOkxPrices", fetchOkxPrices(), null),
        logged(
          "getVolatilityIntel",
          getVolatilityIntel(supabaseAdmin as never, volatilityTickers, volatilitySymbols),
          { perAsset: {}, generatedAt: Date.now() } as VolatilityIntel,
        ),
        logged(
          "getCommunityTrustIntel",
          getCommunityTrustIntel(supabaseAdmin as never),
          { perAsset: {}, generatedAt: Date.now() } as CommunityTrustIntel,
        ),
        logged(
          "loadCrowdIntel",
          loadCrowdIntel(supabaseAdmin as never),
          { perAsset: {}, sampleSize: 0, generatedAt: Date.now() } as CrowdIntel,
        ),
      ]);

    return {
      derivatives: computeDerivativesIntel(snapshot, rawDerivatives),
      orderbook: computeOrderBookIntel(snapshot, rawOrderBook),
      social: computeSocialIntel(snapshot, rawTrending),
      macro,
      volatility,
      crossExchange: computeCrossExchangeIntel(snapshot, okxPrices),
      communityTrust,
      crowd,
      onchainReal,
      stablecoin,
      confluence,
      options,
      fetchedAt: Date.now(),
    };
  });
}




/** Cached full intelligence snapshot — the default entry point for callers. */
export async function getBrainSnapshotCached(): Promise<BrainServerResult> {
  const { cached } = await import("./ttl-cache.server");
  return cached("brain-snapshot", { ttlMs: 45_000, staleMs: 15 * 60_000 }, getBrainServerSnapshot);
}

export async function getBrainServerSnapshot(): Promise<BrainServerResult> {
  const { tickers, global, fng, tickerSource, baseline, fetchedAt: tickersFetchedAt } = await getUpstreamMarketData();
  const snapshot = deriveSnapshot(tickers, global, global, fng);

  // Short-symbol-keyed (e.g. "SOMECOIN", not "SOMECOINUSDT") so it lines up
  // with how COIN_UNIVERSE and market_snapshots.coins are already keyed.
  // Coins already in COIN_UNIVERSE keep their curated ticker, not this one.
  const curatedSymbols = new Set(snapshot.coinIntel.map((c) => c.symbol));
  const baselineTickers: Record<string, Ticker> = {};
  if (baseline) {
    for (const [pair, t] of Object.entries(baseline.tickers)) {
      if (!pair.endsWith("USDT")) continue;
      const symbol = pair.slice(0, -4);
      if (curatedSymbols.has(symbol)) continue;
      baselineTickers[symbol] = t;
    }
  }

  // Prefer real observed history from the rolling snapshot table; fall back to
  // the synthesized path when there isn't enough of it yet (cold start).
  let historySource: BrainServerResult["historySource"] = "synthesized";
  let history = synthesizeHistory(snapshot, tickers);
  try {
    const { loadPersistedHistory } = await import("./market-history.server");
    const persisted = await loadPersistedHistory();
    if (persisted) {
      const now = Date.now();
      for (const c of snapshot.coinIntel) {
        const t = tickers[`${c.symbol}USDT`];
        if (!t) continue;
        const series = (persisted[c.symbol] ??= []);
        series.push({ ts: now, price: t.price, quoteVolume: t.quoteVolume });
      }
      for (const [symbol, t] of Object.entries(baselineTickers)) {
        const series = (persisted[symbol] ??= []);
        series.push({ ts: now, price: t.price, quoteVolume: t.quoteVolume });
      }
      history = persisted;
      historySource = "persisted";
    }
  } catch {
    /* keep synthesized history */
  }

  const volumes: Record<string, number> = {};
  for (const c of snapshot.coinIntel) {
    const t = tickers[`${c.symbol}USDT`];
    if (t) volumes[c.symbol] = t.quoteVolume;
  }
  // Best-effort: previous cycle's persisted sentiment score (for trend) and
  // the measured elite-brain layer weights (for the flagship score). Neither
  // is available on a cold start / DB hiccup — both degrade gracefully to
  // their previous defaults (prevScore null -> trend "Stable", weights
  // undefined -> runEliteBrain's own BASE_ELITE_BRAIN_WEIGHTS default).
  let prevSentimentScore: number | null = null;
  let eliteBrainWeights: Record<string, number> | undefined;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: prevSnap }, brainWeights] = await Promise.all([
      supabaseAdmin.from("market_snapshots").select("sentiment_score").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
      (async () => {
        const { loadModelWeights } = await import("./signal-tracking.server");
        return loadModelWeights(supabaseAdmin as never, "elite-brain");
      })(),
    ]);
    prevSentimentScore = (prevSnap as { sentiment_score: number | null } | null)?.sentiment_score ?? null;
    eliteBrainWeights = brainWeights?.weights;
  } catch {
    /* keep defaults */
  }

  // narrative and ignition depend only on (snapshot, history) — nothing
  // downstream of them requires them to be *correct*, only present, so a
  // failure here safely degrades to "nothing detected" rather than needing
  // to abort the whole cycle. whale/sentiment and everything chained off
  // them below are NOT isolated the same way: they're the foundation every
  // other layer in this cycle builds on, and fabricating a plausible-looking
  // but made-up whale/sentiment read would put a wrong signal in front of
  // real trading decisions — worse than a visible failure that lets the
  // cache in getBrainSnapshotCached serve the last known-good snapshot.
  let narrative: NarrativeIntel;
  try {
    narrative = computeNarrativeIntel(snapshot, history);
  } catch (e) {
    console.error("brain-server: computeNarrativeIntel failed, degrading to empty", e);
    narrative = { detected: [], topEmerging: [], aggregateStrength: 0, rotationVelocity: 0 };
  }
  let ignition: MomentumIgnitionIntel;
  try {
    ignition = computeMomentumIgnition(snapshot, history);
  } catch (e) {
    console.error("brain-server: computeMomentumIgnition failed, degrading to empty", e);
    ignition = {
      signals: [],
      topByStage: {
        Dormant: [],
        "Speculative Accumulation": [],
        "Pre-Breakout Conditions": [],
        "Early Momentum Detected": [],
        "Active Breakout": [],
      },
      sectorSync: 0,
      ignitionScore: 0,
    };
  }

  let whale: WhaleIntel;
  let sentiment: SentimentIntel;
  let brain: ReturnType<typeof runEliteBrain>;
  let smartMoney: SmartMoneyIntel;
  let pressure: PumpPressureIntel;
  let brainV3: ReturnType<typeof runEliteBrainV3>;
  let extended: Awaited<ReturnType<typeof getExtendedMarketData>>;
  let onchain: ReturnType<typeof computeOnChainIntel>;
  let exit: ReturnType<typeof computeExitIntel>;
  try {
    const extraWhaleSymbols = Object.keys(baselineTickers).map((symbol) => ({ symbol }));
    whale = computeWhaleIntel(snapshot, history, extraWhaleSymbols);
    sentiment = computeSentimentIntel(snapshot, history, prevSentimentScore, fng?.score ?? null);
    brain = runEliteBrain(snapshot, whale, sentiment, eliteBrainWeights);
    smartMoney = computeSmartMoney(whale);
    pressure = computePumpPressure(snapshot, whale, sentiment, narrative, ignition, smartMoney);
    brainV3 = runEliteBrainV3(snapshot, whale, sentiment, narrative, ignition, smartMoney, pressure);
    extended = await getExtendedMarketData(snapshot, tickers, baseline);
    onchain = computeOnChainIntel(snapshot, history, whale, sentiment, narrative, pressure, extended.onchainReal);
    exit = computeExitIntel(snapshot, history, whale, sentiment, narrative, pressure, onchain);
  } catch (e) {
    console.error(
      "brain-server: core signal chain (whale/sentiment/brain/smartMoney/pressure/brainV3/onchain/exit) failed — " +
        "this aborts the whole snapshot rather than fabricating a foundational market read; " +
        "getBrainSnapshotCached will serve the last known-good snapshot if one exists",
      e,
    );
    throw e;
  }

  // How deep is the observed history behind this read? Used both for the
  // published confidence value and to damp claims made on thin data.
  const series = Object.values(history).map((s) => s.length);
  const avgSamples = series.length ? series.reduce((a, b) => a + b, 0) / series.length : 0;
  const historyDepth = Math.max(0, Math.min(1, avgSamples / 24));

  const confidence = computeConfidence({
    // getUpstreamMarketData is itself TTL-cached (cached() in
    // ttl-cache.server.ts) and returns the *original* fetch's value object
    // verbatim on a cache hit, so fetchedAt reflects when the underlying
    // ticker data was actually pulled — not "now". This was previously
    // hardcoded to 0, permanently maxing out the freshness term regardless
    // of real staleness (including during a provider outage being served
    // from the stale-while-revalidate window).
    dataAgeMs: Math.max(0, Date.now() - tickersFetchedAt),
    degradedSource: tickerSource === "stored" || tickerSource === "fallback",
    layerAgreement: layerAgreement([
      brain.eliteFluxScore,
      sentiment.score,
      whale.score,
      narrative.aggregateStrength,
      ignition.ignitionScore,
      100 - pressure.score,
    ]),
    historyDepth: historySource === "persisted" ? historyDepth : Math.min(historyDepth, 0.35),
    syntheticHistory: historySource !== "persisted",
  });

  return {
    snapshot,
    whale,
    sentiment,
    brain,
    narrative,
    ignition,
    smartMoney,
    pressure,
    brainV3,
    onchain,
    exit,
    derivatives: extended.derivatives,
    orderbook: extended.orderbook,
    social: extended.social,
    stablecoin: extended.stablecoin,
    confluence: extended.confluence,
    options: extended.options,
    macro: extended.macro,
    volatility: extended.volatility,
    crossExchange: extended.crossExchange,
    communityTrust: extended.communityTrust,
    crowd: extended.crowd,
    volumes,
    baselineTickers,
    historySource,
    tickerSource,
    confidence,
    historyDepth,
    generatedAt: Date.now(),
  };
}

/**
 * Flatten a snapshot into the signal rows the accuracy scoreboard records.
 * Market-wide layers are stored against BTC as the market proxy.
 */
export function buildSignalEvents(r: BrainServerResult): SignalEventInput[] {
  const priceOf = (sym: string) => r.snapshot.coinIntel.find((c) => c.symbol === sym)?.price ?? r.baselineTickers[sym]?.price ?? null;
  const btc = priceOf("BTC");
  const regime = r.brain.regime;
  const conf = r.confidence.score;
  const events: SignalEventInput[] = [
    { signal_type: "flux_score", symbol: null, score: r.brain.eliteFluxScore, band: r.brain.band, regime, confidence: conf, reference_price: btc },
    // The four elite-brain sub-layers not already tracked under their own
    // name elsewhere (whale/sentiment/narrative are) — recorded so
    // recomputeEliteBrainWeights (signal-tracking.server.ts) has something
    // to measure. flux_score was already graded; these are what let that
    // grade actually change the formula instead of just being observed.
    { signal_type: "btc_control", symbol: null, score: r.brain.bitcoin.score, regime, confidence: conf, reference_price: btc },
    { signal_type: "liquidity_flow", symbol: null, score: r.brain.liquidity.score, band: r.brain.liquidity.phase, regime, confidence: conf, reference_price: btc },
    { signal_type: "altcoin_strength", symbol: null, score: r.brain.altcoin.score, regime, confidence: conf, reference_price: btc },
    { signal_type: "risk_compression", symbol: null, score: r.brain.risk.score, band: r.brain.risk.risk, regime, confidence: conf, reference_price: btc },
    { signal_type: "sentiment", symbol: null, score: r.sentiment.score, band: r.sentiment.state, regime, confidence: conf, reference_price: btc },
    { signal_type: "whale", symbol: null, score: r.whale.score, band: r.whale.phase, regime, confidence: conf, reference_price: btc },
    { signal_type: "narrative", symbol: null, score: r.narrative.aggregateStrength, regime, confidence: conf, reference_price: btc },
    { signal_type: "momentum", symbol: null, score: r.ignition.ignitionScore, regime, confidence: conf, reference_price: btc },
    { signal_type: "smart_money", symbol: null, score: r.smartMoney.confidenceScore, band: r.smartMoney.dominantClass, regime, confidence: conf, reference_price: btc },
    { signal_type: "pump_pressure", symbol: null, score: r.pressure.score, band: r.pressure.band, regime, confidence: conf, reference_price: btc },
    { signal_type: "derivatives", symbol: null, score: r.derivatives.score, regime, confidence: conf, reference_price: btc },
    { signal_type: "orderbook", symbol: null, score: r.orderbook.score, regime, confidence: conf, reference_price: btc },
    { signal_type: "social", symbol: null, score: r.social.score, regime, confidence: conf, reference_price: btc },
    { signal_type: "stablecoin", symbol: null, score: r.stablecoin.netLiquidityScore, regime, confidence: conf, reference_price: btc },
  ];

  for (const s of r.ignition.signals.slice(0, 12)) {
    events.push({ signal_type: "momentum", symbol: s.symbol, score: s.score, band: s.stage, regime, confidence: conf, reference_price: priceOf(s.symbol) });
  }
  for (const a of r.exit.assets.slice(0, 12)) {
    events.push({ signal_type: "exit_pressure", symbol: a.symbol, score: a.exitPressureScore, band: a.band, regime, confidence: conf, reference_price: priceOf(a.symbol) });
  }
  for (const s of r.whale.topSignals.slice(0, 12)) {
    events.push({ signal_type: "whale", symbol: s.symbol, score: s.score, band: s.phase, regime, confidence: conf, reference_price: priceOf(s.symbol) });
  }
  for (const d of Object.values(r.derivatives.perAsset).slice(0, 12)) {
    if (!d) continue;
    events.push({ signal_type: "derivatives", symbol: d.symbol, score: d.score, band: d.crowding, regime, confidence: conf, reference_price: priceOf(d.symbol) });
  }
  for (const cf of Object.values(r.confluence.perAsset).slice(0, 12)) {
    if (!cf || cf.timeframesAvailable < 2) continue;
    events.push({ signal_type: "confluence", symbol: cf.symbol, score: cf.score, band: cf.direction, regime, confidence: conf, reference_price: priceOf(cf.symbol) });
  }
  for (const [sym, o] of Object.entries(r.options.perCurrency)) {
    if (!o) continue;
    events.push({ signal_type: "options", symbol: sym, score: o.score, regime, confidence: conf, reference_price: priceOf(sym) });
  }
  if (r.macro.regime !== "insufficient_data") {
    events.push({ signal_type: "macro", symbol: null, score: r.macro.score, band: r.macro.regime, regime, confidence: conf, reference_price: btc });
  }
  for (const x of Object.values(r.crossExchange.perAsset).slice(0, 12)) {
    if (!x) continue;
    events.push({ signal_type: "cross_exchange", symbol: x.symbol, score: x.score, regime, confidence: conf, reference_price: priceOf(x.symbol) });
  }
  return events.filter((e) => Number.isFinite(e.score));
}

/** Flatten a full brain result into the metrics bundle the alert engine reads. */
export function buildAlertMetrics(r: BrainServerResult): AlertMetrics {
  const whaleBySymbol: AlertMetrics["whaleBySymbol"] = {};
  for (const s of r.whale.topSignals) {
    whaleBySymbol[s.symbol] = { score: s.score, phase: s.phase, volumeSpike: s.volumeSpike };
  }
  const exitBySymbol: AlertMetrics["exitBySymbol"] = {};
  for (const a of r.exit.assets) {
    exitBySymbol[a.symbol] = { score: a.exitPressureScore, band: a.band };
  }
  const ignitionBySymbol: AlertMetrics["ignitionBySymbol"] = {};
  for (const s of r.ignition.signals) {
    ignitionBySymbol[s.symbol] = { score: s.score, stage: s.stage };
  }
  const priceBySymbol: AlertMetrics["priceBySymbol"] = {};
  for (const c of r.snapshot.coinIntel) {
    priceBySymbol[c.symbol] = { price: c.price, change24h: c.change24h };
  }
  return {
    generatedAt: r.generatedAt,
    fluxScore: r.brain.eliteFluxScore,
    regime: r.brain.regime,
    whaleScore: r.whale.score,
    whalePhase: r.whale.phase,
    whaleBySymbol,
    sentimentScore: r.sentiment.score,
    sentimentState: r.sentiment.state,
    narrativeStrength: r.narrative.aggregateStrength,
    topNarrative: r.narrative.topEmerging[0]?.label ?? null,
    exitPressure: r.exit.marketExitPressure,
    exitBySymbol,
    ignitionScore: r.ignition.ignitionScore,
    ignitionBySymbol,
    priceBySymbol,
  };
}

