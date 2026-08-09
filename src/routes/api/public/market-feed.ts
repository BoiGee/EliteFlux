import { createFileRoute } from "@tanstack/react-router";

// Shared market feed. Browsers read this instead of calling data providers
// directly, so upstream call volume stays constant no matter how many people
// are on the dashboard. Cached server-side with a short TTL plus a
// last-good fallback.
export const Route = createFileRoute("/api/public/market-feed")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { getUpstreamMarketData, getBrainSnapshotCached } = await import("@/lib/brain-server");
          const data = await getUpstreamMarketData();

          // Best-effort: the deeper intelligence layers (derivatives, order
          // book, social, crowd) are a "nice to have" enhancement on top of
          // the core price feed above — if any of it fails, prices still ship.
          let extra: {
            derivatives: Record<string, { score: number; crowding: string }>;
            orderbook: Record<string, { score: number; imbalance: number }>;
            social: Record<string, { score: number; trending: boolean }>;
            crowd: Record<string, { score: number; net: number }>;
            stablecoin: { netLiquidityScore: number };
            confluence: Record<string, { score: number; direction: string }>;
            options: Record<string, { score: number }>;
            macro: { score: number };
            volatility: Record<string, { regime: string }>;
            crossExchange: Record<string, { score: number }>;
            communityTrust: Record<string, { score: number }>;
          } | null = null;
          try {
            const [brain, crowdMod] = await Promise.all([
              getBrainSnapshotCached(),
              import("@/lib/crowd-intel"),
            ]);
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const crowd = await crowdMod.loadCrowdIntel(supabaseAdmin as never);
            extra = {
              derivatives: Object.fromEntries(
                Object.entries(brain.derivatives.perAsset)
                  .filter((e): e is [string, NonNullable<(typeof e)[1]>] => !!e[1])
                  .map(([k, v]) => [k, { score: v.score, crowding: v.crowding }]),
              ),
              orderbook: Object.fromEntries(
                Object.entries(brain.orderbook.perAsset)
                  .filter((e): e is [string, NonNullable<(typeof e)[1]>] => !!e[1])
                  .map(([k, v]) => [k, { score: v.score, imbalance: v.imbalance }]),
              ),
              social: Object.fromEntries(
                Object.entries(brain.social.perAsset)
                  .filter((e): e is [string, NonNullable<(typeof e)[1]>] => !!e[1])
                  .map(([k, v]) => [k, { score: v.score, trending: v.trending }]),
              ),
              crowd: Object.fromEntries(
                Object.entries(crowd.perAsset)
                  .filter((e): e is [string, NonNullable<(typeof e)[1]>] => !!e[1])
                  .map(([k, v]) => [k, { score: v.score, net: v.net }]),
              ),
              stablecoin: { netLiquidityScore: brain.stablecoin.netLiquidityScore },
              confluence: Object.fromEntries(
                Object.entries(brain.confluence.perAsset)
                  .filter((e): e is [string, NonNullable<(typeof e)[1]>] => !!e[1])
                  .map(([k, v]) => [k, { score: v.score, direction: v.direction }]),
              ),
              options: Object.fromEntries(
                Object.entries(brain.options.perCurrency)
                  .filter((e): e is [string, NonNullable<(typeof e)[1]>] => !!e[1])
                  .map(([k, v]) => [k, { score: v.score }]),
              ),
              macro: { score: brain.macro.score },
              volatility: Object.fromEntries(
                Object.entries(brain.volatility.perAsset)
                  .filter((e): e is [string, NonNullable<(typeof e)[1]>] => !!e[1])
                  .map(([k, v]) => [k, { regime: v.regime }]),
              ),
              crossExchange: Object.fromEntries(
                Object.entries(brain.crossExchange.perAsset)
                  .filter((e): e is [string, NonNullable<(typeof e)[1]>] => !!e[1])
                  .map(([k, v]) => [k, { score: v.score }]),
              ),
              communityTrust: Object.fromEntries(
                Object.entries(brain.communityTrust.perAsset)
                  .filter((e): e is [string, NonNullable<(typeof e)[1]>] => !!e[1])
                  .map(([k, v]) => [k, { score: v.score }]),
              ),
            };
          } catch {
            /* prices still ship without the enhancement layers */
          }

          return Response.json(
            {
              tickers: data.tickers,
              global: data.global,
              sentiment: data.fng,
              fetchedAt: data.fetchedAt,
              source: data.tickerSource,
              ageSeconds: Math.round((Date.now() - data.fetchedAt) / 1000),
              ...(extra ? { extra } : {}),
            },
            {
              headers: {
                "cache-control": "public, max-age=30, s-maxage=30, stale-while-revalidate=300",
              },
            },
          );

        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown";
          return Response.json({ error: `market data unavailable: ${msg}` }, { status: 502 });
        }
      },
    },
  },
});
