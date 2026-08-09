import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

const TRIGGERS = [
  "flux_score",
  "whale_spike",
  "sentiment_shift",
  "narrative_surge",
  "exit_pressure",
  "momentum_change",
  "price_threshold",
] as const;

export default defineTool({
  name: "create_alert",
  title: "Create an alert",
  description: "Create an EliteFlux alert for the signed-in user (e.g. flux score crossing a threshold or a price level).",
  inputSchema: {
    name: z.string().describe("Short alert name."),
    trigger_type: z.enum(TRIGGERS).describe("What the alert watches."),
    symbol: z.string().optional().describe("Ticker symbol the alert applies to, e.g. BTC."),
    threshold: z.number().optional().describe("Numeric threshold that triggers the alert."),
    direction: z.enum(["above", "below"]).optional().describe("Direction relative to the threshold."),
    channels: z
      .array(z.enum(["in_app", "email", "telegram", "webhook"]))
      .optional()
      .describe("Delivery channels. Defaults to in_app."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ name, trigger_type, symbol, threshold, direction, channels }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("alerts")
      .insert({
        user_id: ctx.getUserId()!,
        name: name.trim(),
        trigger_type,
        symbol: symbol ? symbol.trim().toUpperCase() : null,
        threshold: threshold ?? null,
        direction: direction ?? null,
        channels: channels?.length ? channels : ["in_app"],
      })
      .select("id, name, trigger_type, symbol, threshold, direction, channels, enabled")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created alert "${data.name}".` }],
      structuredContent: { alert: data },
    };
  },
});
