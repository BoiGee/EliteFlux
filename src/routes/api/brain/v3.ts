import { createFileRoute } from "@tanstack/react-router";
import { getBrainSnapshotCached } from "@/lib/brain-server";

export const Route = createFileRoute("/api/brain/v3")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireTier } = await import("@/lib/tier.server");
        const gate = await requireTier(request, "brain-v3");
        if ("response" in gate) return gate.response;
        try {
          const { brainV3, narrative, ignition, smartMoney, pressure, generatedAt } =
            await getBrainSnapshotCached();
          return Response.json({
            generatedAt,
            regime: brainV3.regime,
            confidence: brainV3.confidence,
            cognitionScore: brainV3.cognitionScore,
            signals: brainV3.signals,
            vector: brainV3.vector,
            narrative: {
              aggregateStrength: narrative.aggregateStrength,
              rotationVelocity: narrative.rotationVelocity,
              detected: narrative.detected,
              topEmerging: narrative.topEmerging,
            },
            momentumIgnition: {
              score: ignition.ignitionScore,
              sectorSync: ignition.sectorSync,
              signals: ignition.signals,
            },
            smartMoney: {
              confidence: smartMoney.confidenceScore,
              dominantClass: smartMoney.dominantClass,
              coordinationIndex: smartMoney.coordinationIndex,
              clusters: smartMoney.clusters,
            },
            pumpPressure: {
              score: pressure.score,
              band: pressure.band,
              contributors: pressure.contributors,
              rationale: pressure.rationale,
            },
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
