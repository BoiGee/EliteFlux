import { createFileRoute } from "@tanstack/react-router";
import { getBrainSnapshotCached } from "@/lib/brain-server";

export const Route = createFileRoute("/api/brain/sentiment")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireTier } = await import("@/lib/tier.server");
        const gate = await requireTier(request, "sentiment");
        if ("response" in gate) return gate.response;
        try {
          const { sentiment, generatedAt } = await getBrainSnapshotCached();
          return Response.json({ generatedAt, sentiment });
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
