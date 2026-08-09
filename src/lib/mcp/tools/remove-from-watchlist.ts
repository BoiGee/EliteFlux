import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "remove_from_watchlist",
  title: "Remove coin from watchlist",
  description: "Remove a coin symbol from the signed-in user's EliteFlux watchlists.",
  inputSchema: { symbol: z.string().describe("Ticker symbol to remove, e.g. SOL") },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async ({ symbol }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const sym = symbol.trim().toUpperCase();
    const { data, error } = await supabase
      .from("watchlist_items")
      .delete()
      .eq("symbol", sym)
      .select("id");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const removed = data?.length ?? 0;
    return {
      content: [{ type: "text", text: removed ? `Removed ${sym} (${removed} entr${removed === 1 ? "y" : "ies"}).` : `${sym} was not on your watchlist.` }],
      structuredContent: { symbol: sym, removed },
    };
  },
});
