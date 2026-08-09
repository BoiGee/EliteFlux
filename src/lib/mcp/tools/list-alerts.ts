import { defineTool } from "../protocol";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_alerts",
  title: "List my alerts",
  description: "List the signed-in user's EliteFlux alerts with their trigger type, threshold and status.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("alerts")
      .select("id, name, trigger_type, symbol, threshold, direction, channels, enabled, last_triggered_at, created_at")
      .order("created_at", { ascending: false });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const payload = { alerts: data ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
