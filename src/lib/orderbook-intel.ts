// ============================================================
// Order-Book Intelligence Layer
// ------------------------------------------------------------
// Bid/ask depth imbalance from Binance's public spot order book
// (no key required). Heavy bid-side depth relative to ask-side
// suggests real buy-wall support; heavy ask-side depth suggests a
// wall sellers expect price to struggle through. This reads the
// book directly rather than inferring from trade prints, so it's
// a genuinely independent signal from price/volume.
// ============================================================
import type { MarketSnapshot } from "./market";

export interface OrderBookSignal {
  symbol: string;
  bidDepthUsd: number;
  askDepthUsd: number;
  imbalance: number; // -1..1, positive = bid-heavy (support), negative = ask-heavy (resistance)
  score: number; // 0..100, >50 = supportive book
}

export interface OrderBookIntel {
  perAsset: Record<string, OrderBookSignal | undefined>;
  marketImbalance: number; // -100..100
  score: number;
  generatedAt: number;
}

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const SPOT_REST = "https://api.binance.com/api/v3";
const DEPTH_LIMIT = 50; // top 50 levels each side — enough to smooth out single-order noise

interface RawDepth {
  bids: [string, string][];
  asks: [string, string][];
}

// No timeout here previously could hang the whole evaluate-alerts cycle
// indefinitely — this fans out to ~20 concurrent per-symbol Binance calls
// every cycle, and Binance blocks this Worker's egress (confirmed live), so
// a single stalled connection among them blocks the entire Promise.all
// below forever.
function depthFetch(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  return fetch(url, { headers: { "User-Agent": "EliteFlux/1.0", Accept: "application/json" }, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export type RawOrderBookData = Map<string, RawDepth>;

/** Best-effort: one request per symbol, partial coverage on failure is fine. */
export async function fetchOrderBookData(binanceSymbols: string[]): Promise<RawOrderBookData> {
  const out: RawOrderBookData = new Map();
  await Promise.all(
    binanceSymbols.map(async (sym) => {
      try {
        const res = await depthFetch(`${SPOT_REST}/depth?symbol=${sym}&limit=${DEPTH_LIMIT}`);
        if (!res.ok) return;
        const json = (await res.json()) as RawDepth;
        out.set(sym, json);
      } catch {
        /* one symbol missing is fine */
      }
    }),
  );
  return out;
}

export function computeOrderBookIntel(snapshot: MarketSnapshot, raw: RawOrderBookData): OrderBookIntel {
  const ts = Date.now();
  const perAsset: Record<string, OrderBookSignal | undefined> = {};
  let imbalanceSum = 0;
  let count = 0;

  for (const coin of snapshot.coinIntel) {
    const book = raw.get(`${coin.symbol}USDT`);
    if (!book || !book.bids.length || !book.asks.length) continue;

    const bidDepthUsd = book.bids.reduce((s, [price, qty]) => s + parseFloat(price) * parseFloat(qty), 0);
    const askDepthUsd = book.asks.reduce((s, [price, qty]) => s + parseFloat(price) * parseFloat(qty), 0);
    const total = bidDepthUsd + askDepthUsd;
    if (total <= 0) continue;

    const imbalance = (bidDepthUsd - askDepthUsd) / total; // -1..1
    const score = Math.round(clamp(50 + imbalance * 50));

    perAsset[coin.symbol] = { symbol: coin.symbol, bidDepthUsd, askDepthUsd, imbalance: Math.round(imbalance * 100) / 100, score };
    imbalanceSum += imbalance;
    count++;
  }

  const marketImbalance = count ? Math.round((imbalanceSum / count) * 100) : 0;
  const score = Math.round(clamp(50 + marketImbalance / 2));

  return { perAsset, marketImbalance, score, generatedAt: ts };
}
