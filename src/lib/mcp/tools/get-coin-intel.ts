import { defineTool } from "../protocol";
import { z } from "zod";
import { getBrainSnapshotCached } from "@/lib/brain-server";
import { callerTier, meetsTier, notAuthenticated, upgradeNotice } from "../tier";

export default defineTool({
  name: "get_coin_intel",
  title: "Get coin intelligence",
  description:
    "Per-asset EliteFlux intelligence: price, 24h change, momentum score, risk level, BTC correlation and flow direction. Full per-coin signals require the OPERATOR plan.",
  inputSchema: {
    symbols: z
      .array(z.string())
      .optional()
      .describe("Ticker symbols to filter on, e.g. ['BTC','SOL']. Omit for the whole universe."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ symbols }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated;
    const tier = await callerTier(ctx);

    const { snapshot, generatedAt } = await getBrainSnapshotCached();
    const wanted = symbols?.map((s) => s.trim().toUpperCase());
    const all = wanted?.length
      ? snapshot.coinIntel.filter((c) => wanted.includes(c.symbol.toUpperCase()))
      : snapshot.coinIntel;

    const full = meetsTier(tier, "pro");
    const coins = full
      ? all
      : all.map((c) => ({
          symbol: c.symbol,
          name: c.name,
          price: c.price,
          change24h: c.change24h,
        }));

    const payload = {
      generatedAt: new Date(generatedAt).toISOString(),
      plan: tier,
      count: coins.length,
      coins,
      ...(full ? {} : { locked_pro: upgradeNotice("pro", tier) }),
      disclaimer: "Market intelligence only — not financial advice.",
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
