import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { acceptDiscoveryDisclosureSchema, discoverySettingsSchema } from "@/lib/portfolio.schemas";

// Settings are visible to any signed-in user (same "see it before you pay
// for it" pattern as getAutopilot) — the tier gate sits on the actual feed
// data and on opting in, not on viewing your own (default, opted-out)
// settings row.
export const getDiscoverySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadDiscoverySettings } = await import("@/lib/discovery.server");
    return loadDiscoverySettings(context.supabase as never, context.userId);
  });

export const updateDiscoverySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => discoverySettingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertTier } = await import("@/lib/tier-lookup.server");
    await assertTier(context.supabase as never, context.userId, "token-discovery");

    const { loadDiscoverySettings } = await import("@/lib/discovery.server");
    await loadDiscoverySettings(context.supabase as never, context.userId); // ensures the row exists before updating

    const patch: Record<string, unknown> = { ...data };
    // Opting out always drops armed — re-arming after opting back in is a
    // deliberate, separate step (matches autopilot's armed-reset-on-
    // level-change behavior).
    if (data.opted_in === false) patch["armed"] = false;

    const { error } = await context.supabase
      .from("discovery_settings")
      .update(patch as never)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return loadDiscoverySettings(context.supabase as never, context.userId);
  });

export const acceptDiscoveryDisclosure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => acceptDiscoveryDisclosureSchema.parse(input))
  .handler(async ({ context }) => {
    const { assertTier } = await import("@/lib/tier-lookup.server");
    await assertTier(context.supabase as never, context.userId, "token-discovery");

    const { loadDiscoverySettings } = await import("@/lib/discovery.server");
    await loadDiscoverySettings(context.supabase as never, context.userId);

    const { error } = await context.supabase
      .from("discovery_settings")
      .update({ disclosure_accepted_at: new Date().toISOString() } as never)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return loadDiscoverySettings(context.supabase as never, context.userId);
  });

/** The actual curated feed — gated, unlike settings, since this is the valuable data product itself. */
export const getDiscoveryFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertTier } = await import("@/lib/tier-lookup.server");
    await assertTier(context.supabase as never, context.userId, "token-discovery");

    const { data, error } = await context.supabase
      .from("discovered_tokens")
      .select(
        "id,network,token_address,symbol,name,dex,last_price_usd,last_liquidity_usd,last_volume_24h_usd,holder_count,top10_holder_pct,safety_gate_passed,safety_gate_reasons,safety_score,opportunity_score,band,tags,rationale,pool_created_at,last_checked_at",
      )
      .eq("status", "active")
      .eq("safety_gate_passed", true)
      .order("opportunity_score", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { tokens: data ?? [] };
  });
