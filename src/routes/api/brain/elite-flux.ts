import { createFileRoute } from "@tanstack/react-router";
import { getBrainSnapshotCached } from "@/lib/brain-server";

export const Route = createFileRoute("/api/brain/elite-flux")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireTier } = await import("@/lib/tier.server");
        const gate = await requireTier(request, "elite-brain");
        if ("response" in gate) return gate.response;
        try {
          const { brain, whale, sentiment, confidence, generatedAt } = await getBrainSnapshotCached();
          return Response.json({
            generatedAt,
            confidence,
            eliteFluxScore: brain.eliteFluxScore,
            band: brain.band,
            regime: brain.regime,
            regimeConfidence: brain.regimeConfidence,
            headline: brain.headline,
            insight: brain.insight,
            layers: {
              bitcoin: brain.bitcoin,
              liquidity: brain.liquidity,
              narrative: brain.narrative,
              altcoin: brain.altcoin,
              risk: brain.risk,
            },
            whaleContribution: brain.whaleContribution,
            sentimentContribution: brain.sentimentContribution,
            whale: { score: whale.score, phase: whale.phase, impact: whale.impact },
            sentiment: { score: sentiment.score, state: sentiment.state, trend: sentiment.trend },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown";
          return new Response(JSON.stringify({ error: msg }), {
            status: 502,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
