// ============================================================
// Derivatives Intelligence Layer
// ------------------------------------------------------------
// Funding rate + open interest from Binance's public futures API
// (no key required). Extreme funding is one of the most reliable
// short-horizon contrarian signals in crypto: when longs are
// paying shorts heavily, the market is crowded long and prone to
// a squeeze-driven pullback, and vice versa. This is real,
// independent data — it doesn't derive from spot price/volume the
// way most of the other layers do.
// ============================================================
import type { MarketSnapshot } from "./market";
import { mapWithConcurrency } from "./concurrency.server";

export interface DerivativesSignal {
  symbol: string;
  fundingRate: number; // raw rate for the current 8h interval
  fundingRateAnnualized: number; // % per year, for human framing
  openInterest: number; // contracts
  openInterestUsd: number;
  crowding: "crowded_long" | "crowded_short" | "balanced";
  score: number; // 0..100, >50 = bullish lean (short squeeze risk), <50 = bearish lean (long squeeze risk)
}

export interface DerivativesIntel {
  perAsset: Record<string, DerivativesSignal | undefined>;
  marketFundingBias: number; // -100..100, negative = market-wide crowded long
  score: number; // 0..100, fused market-wide read
  extremeCount: number;
  generatedAt: number;
}

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

interface RawPremiumIndex {
  symbol: string;
  markPrice: string;
  lastFundingRate: string;
}

interface RawOpenInterest {
  symbol: string;
  openInterest: string;
}

export interface RawDerivativesData {
  funding: Map<string, number>; // binance symbol -> rate
  markPrice: Map<string, number>;
  openInterest: Map<string, number>;
}

const FUTURES_REST = "https://fapi.binance.com/fapi/v1";

// No timeout here previously could hang the whole evaluate-alerts cycle
// indefinitely — this fans out to up to ~20 concurrent per-symbol Binance
// calls every cycle, and Binance blocks this Worker's egress (confirmed
// live), so a single stalled connection among them blocks the entire
// Promise.all below forever.
function futuresFetch(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  return fetch(url, { headers: { "User-Agent": "EliteFlux/1.0", Accept: "application/json" }, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/**
 * One call gets funding rates + mark prices for every perpetual on Binance;
 * open interest needs one call per symbol since there's no bulk endpoint.
 * Best-effort — a partial/failed read degrades to fewer covered symbols
 * rather than breaking the pipeline.
 */
export async function fetchDerivativesData(binanceSymbols: string[]): Promise<RawDerivativesData | null> {
  const funding = new Map<string, number>();
  const markPrice = new Map<string, number>();
  const openInterest = new Map<string, number>();

  try {
    const res = await futuresFetch(`${FUTURES_REST}/premiumIndex`);
    // Binance is confirmed blocked (403) on every request from this Worker's
    // egress, so this branch always hits the non-ok path in practice — an
    // undrained body here, repeated every cycle, is exactly what Cloudflare's
    // "stalled HTTP response canceled to prevent deadlock" protection flags
    // (confirmed live via wrangler tail), independent of connection count.
    if (!res.ok) {
      res.body?.cancel().catch(() => {});
      return null;
    }
    const arr = (await res.json()) as RawPremiumIndex[];
    const wanted = new Set(binanceSymbols);
    for (const row of arr) {
      if (!wanted.has(row.symbol)) continue;
      funding.set(row.symbol, parseFloat(row.lastFundingRate));
      markPrice.set(row.symbol, parseFloat(row.markPrice));
    }
  } catch {
    return null;
  }
  if (!funding.size) return null;

  // Capped rather than all-at-once — see concurrency.server.ts for why. Kept
  // low (not just "capped") because this runs concurrently with
  // orderbook-intel's own 3-wide fan-out to the same host inside
  // brain-server.ts's wider Promise.all — the sum of simultaneously in-flight
  // requests across every extended-market-data branch is what trips
  // Cloudflare's "stalled HTTP response canceled to prevent deadlock"
  // protection, confirmed live via wrangler tail.
  await mapWithConcurrency(binanceSymbols, 3, async (sym) => {
    try {
      const res = await futuresFetch(`${FUTURES_REST}/openInterest?symbol=${sym}`);
      if (!res.ok) {
        res.body?.cancel().catch(() => {});
        return;
      }
      const row = (await res.json()) as RawOpenInterest;
      openInterest.set(sym, parseFloat(row.openInterest));
    } catch {
      /* one symbol missing OI is fine */
    }
  });

  return { funding, markPrice, openInterest };
}

const CROWDED_THRESHOLD = 0.0004; // 0.04% per 8h ≈ ~44%/yr — well above the typical ~0.01% baseline

export function computeDerivativesIntel(snapshot: MarketSnapshot, raw: RawDerivativesData | null): DerivativesIntel {
  const ts = Date.now();
  const perAsset: Record<string, DerivativesSignal | undefined> = {};
  if (!raw) return { perAsset, marketFundingBias: 0, score: 50, extremeCount: 0, generatedAt: ts };

  let biasSum = 0;
  let biasCount = 0;
  let extremeCount = 0;

  for (const coin of snapshot.coinIntel) {
    const binanceSym = `${coin.symbol}USDT`;
    const rate = raw.funding.get(binanceSym);
    if (rate === undefined || !Number.isFinite(rate)) continue;

    const oi = raw.openInterest.get(binanceSym) ?? 0;
    const mark = raw.markPrice.get(binanceSym) ?? coin.price;
    const annualized = rate * 3 * 365 * 100; // 3 funding events/day

    const crowding: DerivativesSignal["crowding"] =
      rate >= CROWDED_THRESHOLD ? "crowded_long" : rate <= -CROWDED_THRESHOLD ? "crowded_short" : "balanced";
    if (crowding !== "balanced") extremeCount++;

    // Contrarian framing: crowded long → bearish lean (score below 50);
    // crowded short → bullish lean (score above 50). Scaled so the
    // extremes seen in practice (roughly ±0.2%/8h) approach the 0/100 ends.
    const score = Math.round(clamp(50 - (rate / 0.002) * 50));

    perAsset[coin.symbol] = {
      symbol: coin.symbol,
      fundingRate: rate,
      fundingRateAnnualized: Math.round(annualized * 10) / 10,
      openInterest: oi,
      openInterestUsd: Math.round(oi * mark),
      crowding,
      score,
    };
    biasSum += -rate; // positive bias = net crowded-short = bullish lean
    biasCount++;
  }

  const marketFundingBias = biasCount ? clamp((biasSum / biasCount / 0.002) * 100, -100, 100) : 0;
  const score = Math.round(clamp(50 + marketFundingBias / 2));

  return { perAsset, marketFundingBias: Math.round(marketFundingBias), score, extremeCount, generatedAt: ts };
}
