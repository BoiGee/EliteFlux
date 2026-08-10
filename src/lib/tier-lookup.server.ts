// Server-only tier resolution for TanStack Start server functions that already
// have an authenticated, token-scoped Supabase client + verified userId from
// requireSupabaseAuth's middleware context (src/integrations/supabase/auth-middleware.ts).
// Distinct from tier.server.ts's resolveCaller (which builds its own client from
// a raw Request) and mcp/tier.ts's callerTier (which builds its own client from
// a ToolContext) — all three do the same subscriptions-table lookup because each
// caller shape supplies the Supabase client differently; this one is for the
// createServerFn + requireSupabaseAuth shape specifically.
import type { SupabaseClient } from "@supabase/supabase-js";
import { type Tier } from "./tier-matrix";

export async function resolveTierForCaller(
  supabase: SupabaseClient,
  userId: string,
): Promise<Tier> {
  const { data } = await supabase
    .from("subscriptions")
    .select("tier,status,current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  const active =
    data &&
    (data.status === "active" || data.status === "trialing") &&
    (!data.current_period_end || new Date(data.current_period_end) > new Date());

  return active ? (data.tier as Tier) : "free";
}

export class TierRequiredError extends Error {
  constructor(
    public readonly required: Tier,
    public readonly current: Tier,
  ) {
    super(`This requires the ${required.toUpperCase()} plan. Your plan: ${current.toUpperCase()}. Upgrade at /pricing.`);
    this.name = "TierRequiredError";
  }
}

/** Throws TierRequiredError if the caller doesn't meet the required tier for moduleKey. */
export async function assertTier(
  supabase: SupabaseClient,
  userId: string,
  moduleKey: string,
): Promise<Tier> {
  const { meetsTier, requiredTierFor } = await import("./tier-matrix");
  const tier = await resolveTierForCaller(supabase, userId);
  const required = requiredTierFor(moduleKey);
  if (!meetsTier(tier, required)) {
    throw new TierRequiredError(required, tier);
  }
  return tier;
}
