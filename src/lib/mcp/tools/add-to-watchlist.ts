import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "add_to_watchlist",
  title: "Add coin to watchlist",
  description: "Add a coin symbol to the signed-in user's default EliteFlux watchlist.",
  inputSchema: {
    symbol: z.string().describe("Ticker symbol, e.g. SOL"),
    coin_name: z.string().optional().describe("Optional display name for the coin."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ symbol, coin_name }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const userId = ctx.getUserId()!;
    const supabase = supabaseForUser(ctx);
    const { data: lists, error: listErr } = await supabase
      .from("watchlists")
      .select("id, is_default")
      .order("is_default", { ascending: false })
      .limit(1);
    if (listErr) return { content: [{ type: "text", text: listErr.message }], isError: true };
    let watchlistId = lists?.[0]?.id;
    if (!watchlistId) {
      const { data: created, error: createErr } = await supabase
        .from("watchlists")
        .insert({ user_id: userId, name: "My Watchlist", is_default: true })
        .select("id")
        .single();
      if (createErr) return { content: [{ type: "text", text: createErr.message }], isError: true };
      watchlistId = created.id;
    }
    const { data, error } = await supabase
      .from("watchlist_items")
      .insert({
        user_id: userId,
        watchlist_id: watchlistId,
        symbol: symbol.trim().toUpperCase(),
        coin_name: coin_name ?? null,
      })
      .select("id, symbol, coin_name")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Added ${data.symbol} to your watchlist.` }],
      structuredContent: { item: data },
    };
  },
});
