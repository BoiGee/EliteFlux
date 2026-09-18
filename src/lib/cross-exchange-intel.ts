// ============================================================
// Cross-Exchange Divergence Layer
// ------------------------------------------------------------
// Same asset, two venues, two prices. A sustained premium on one
// exchange (the modern "kimchi premium" effect) signals demand
// concentrated there outpacing arbitrage capacity — a real
// micro-signal, not a proxy. Divergence is measured between whatever
// venue won this cycle's market feed and OKX.
// ============================================================
import type { MarketSnapshot } from "./market";

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

const OKX_TICKERS = "https://www.okx.com/api/v5/market/tickers?instType=SPOT";

/** One call covers every OKX spot pair — same shape as the Binance all-symbols reads elsewhere. */
export async function fetchOkxPrices(): Promise<Map<string, number> | null> {
  try {
    // No timeout here previously could hang the whole evaluate-alerts cycle
    // indefinitely on a single stalled response — this call sits in every
    // cycle's Promise.all, and its own try/catch only guards against a
    // rejection, not a connection that never settles at all.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(OKX_TICKERS, { headers: { "User-Agent": "EliteFlux/1.0", Accept: "application/json" }, signal: controller.signal }).finally(() =>
      clearTimeout(timer),
    );
    // Draining an unread body before bailing matters here: this sits in a
    // pool of concurrent branches every cycle (getExtendedMarketData), and
    // Cloudflare's deadlock detector confirmed live counts unread response
    // bodies, not just open connections — a non-ok response left undrained
    // is exactly what it flags.
    if (!res.ok) {
      res.body?.cancel().catch(() => {});
      return null;
    }
    const json = (await res.json()) as { code?: string; data?: { instId: string; last: string }[] };
    if (json.code !== "0" || !json.data) return null;
    const map = new Map<string, number>();
    for (const t of json.data) {
      const price = Number(t.last);
      if (Number.isFinite(price) && price > 0) map.set(t.instId, price);
    }
    return map;
  } catch {
    return null;
  }
}

export interface DivergenceSignal {
  symbol: string;
  binancePrice: number;
  okxPrice: number;
  divergencePct: number; // (binance - okx) / okx * 100, positive = Binance premium
  score: number; // 0..100, 50 = no notable divergence
}

export interface CrossExchangeIntel {
  perAsset: Record<string, DivergenceSignal | undefined>;
  marketDivergencePct: number; // average |divergence| across the universe — a fragmentation gauge
  generatedAt: number;
}

const NOTABLE_DIVERGENCE_PCT = 0.15; // below this is just bid/ask noise, not a real signal

export function computeCrossExchangeIntel(snapshot: MarketSnapshot, okxPrices: Map<string, number> | null): CrossExchangeIntel {
  const now = Date.now();
  const perAsset: CrossExchangeIntel["perAsset"] = {};
  if (!okxPrices) return { perAsset, marketDivergencePct: 0, generatedAt: now };

  let sumAbs = 0;
  let count = 0;

  for (const c of snapshot.coinIntel) {
    const okx = okxPrices.get(`${c.symbol}-USDT`);
    if (!okx || okx <= 0 || !c.price) continue;
    const divergencePct = ((c.price - okx) / okx) * 100;
    if (Math.abs(divergencePct) < NOTABLE_DIVERGENCE_PCT) continue;

    // A Binance premium (positive) reads as a mild bullish tilt — the highest-volume venue
    // trading hot suggests real demand outpacing arb capacity, not just noise. Large moves
    // either way also get flagged as fragmentation risk regardless of direction.
    const score = Math.round(clamp(50 + divergencePct * 15));

    perAsset[c.symbol] = {
      symbol: c.symbol,
      binancePrice: c.price,
      okxPrice: okx,
      divergencePct: Math.round(divergencePct * 1000) / 1000,
      score,
    };
    sumAbs += Math.abs(divergencePct);
    count++;
  }

  return {
    perAsset,
    marketDivergencePct: count ? Math.round((sumAbs / count) * 1000) / 1000 : 0,
    generatedAt: now,
  };
}
