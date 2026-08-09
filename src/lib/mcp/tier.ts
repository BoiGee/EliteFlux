import type { ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "./supabase";
import { type Tier, meetsTier, TIER_DISPLAY_NAME } from "@/lib/tier-matrix";

/** Reads the caller's real subscription tier through RLS. Never trusts input. */
export async function callerTier(ctx: ToolContext): Promise<Tier> {
  const supabase = supabaseForUser(ctx);
  const { data } = await supabase
    .from("subscriptions")
    .select("tier,status,current_period_end")
    .eq("user_id", ctx.getUserId()!)
    .maybeSingle();
  const active =
    data &&
    (data.status === "active" || data.status === "trialing") &&
    (!data.current_period_end || new Date(data.current_period_end) > new Date());
  return active ? (data.tier as Tier) : "free";
}

export const notAuthenticated = {
  content: [
    {
      type: "text" as const,
      text: "Not authenticated. Connect your EliteFlux account to use this tool.",
    },
  ],
  isError: true,
};

export function upgradeNotice(required: Tier, current: Tier) {
  return `Locked — requires the ${TIER_DISPLAY_NAME[required].toUpperCase()} plan (your plan: ${TIER_DISPLAY_NAME[current].toUpperCase()}). Upgrade at /pricing.`;
}

export { meetsTier };
