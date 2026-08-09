import { defineTool } from "../protocol";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_watchlist",
  title: "List my watchlist",
  description: "List the coins on the signed-in user's EliteFlux watchlists.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("watchlists")
      .select("id, name, is_default, watchlist_items(id, symbol, coin_name, added_at)")
      .order("created_at", { ascending: true });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const payload = { watchlists: data ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
