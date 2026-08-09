import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/brain/onchain")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireTier } = await import("@/lib/tier.server");
        const gate = await requireTier(request, "onchain");
        if ("response" in gate) return gate.response;
        // Real on-chain read when ETHERSCAN_API_KEY is configured; otherwise
        // the UI falls back to computing on-chain intel client-side from
        // market microstructure (see onchain-intel.ts's synthetic path).
        try {
          const { fetchOnChainFlows } = await import("@/lib/onchain-intel");
          const { getBrainSnapshotCached } = await import("@/lib/brain-server");
          const brain = await getBrainSnapshotCached().catch(() => null);
          const ethPrice = brain?.snapshot.coinIntel.find((c) => c.symbol === "ETH")?.price;
          const signals = await fetchOnChainFlows(ethPrice);
          return Response.json({
            generatedAt: Date.now(),
            provider: signals ? "external" : "client-derived",
            signals: signals ?? [],
            note: signals
              ? undefined
              : "Real provider not configured (set ETHERSCAN_API_KEY). UI computes on-chain intel client-side from market microstructure.",
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
