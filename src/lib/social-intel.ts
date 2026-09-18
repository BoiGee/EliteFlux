// ============================================================
// Social Attention Layer
// ------------------------------------------------------------
// Real (not synthesized) retail-attention signal from CoinGecko's
// public trending endpoint (free, no key). It reflects actual
// search/view velocity across CoinGecko's own traffic, so it's an
// independent read from our price feed — a coin can spike here
// without having moved much yet, which is exactly the early-signal
// case worth catching.
//
// Note: Reddit's own public JSON search API now blocks server-side
// requests outright (403, even with a descriptive User-Agent) — it's
// no longer usable without registering an OAuth app. CoinGecko's
// `community_data` (Reddit/Twitter follower counts) has also been
// sunset upstream and returns zeros for every coin now. Trending is
// the one free social-adjacent read left standing; a paid provider
// (LunarCrush, Santiment) is the real upgrade path if this proves
// valuable and warrants the spend.
// ============================================================
import type { MarketSnapshot } from "./market";

export interface SocialSignal {
  symbol: string;
  trending: boolean;
  rank: number | null; // 0 = most trending
  score: number; // 0..100
}

export interface SocialIntel {
  perAsset: Record<string, SocialSignal | undefined>;
  trendingCount: number;
  score: number; // 0..100 aggregate — how much of our universe is currently trending
  generatedAt: number;
}

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const TRENDING_URL = "https://api.coingecko.com/api/v3/search/trending";

interface RawTrendingItem {
  item: { symbol: string; market_cap_rank: number | null };
}

export type RawTrendingData = RawTrendingItem[] | null;

export async function fetchTrendingData(): Promise<RawTrendingData> {
  try {
    // No timeout here previously could hang the whole evaluate-alerts cycle
    // indefinitely — this call sits in every cycle's Promise.all.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(TRENDING_URL, { headers: { "User-Agent": "EliteFlux/1.0", Accept: "application/json" }, signal: controller.signal }).finally(() =>
      clearTimeout(timer),
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { coins?: RawTrendingItem[] };
    return json.coins ?? null;
  } catch {
    return null;
  }
}

export function computeSocialIntel(snapshot: MarketSnapshot, raw: RawTrendingData): SocialIntel {
  const ts = Date.now();
  const perAsset: Record<string, SocialSignal | undefined> = {};
  if (!raw) return { perAsset, trendingCount: 0, score: 50, generatedAt: ts };

  const bySymbol = new Map<string, number>(); // symbol -> rank (index)
  raw.forEach((item, i) => {
    const sym = item.item.symbol?.toUpperCase();
    if (sym && !bySymbol.has(sym)) bySymbol.set(sym, i);
  });

  let trendingCount = 0;
  for (const coin of snapshot.coinIntel) {
    const rank = bySymbol.get(coin.symbol);
    const trending = rank !== undefined;
    if (trending) trendingCount++;
    perAsset[coin.symbol] = {
      symbol: coin.symbol,
      trending,
      rank: rank ?? null,
      // Top of the trending list scores highest; decays toward neutral by rank 15.
      score: trending ? Math.round(clamp(100 - rank! * 6)) : 50,
    };
  }

  const score = Math.round(clamp(50 + trendingCount * 8));
  return { perAsset, trendingCount, score, generatedAt: ts };
}
