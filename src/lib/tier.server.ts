// Server-only tier resolution. Verifies the caller's Supabase bearer token
// and reads their real subscription tier from the database — never trusts
// anything sent by the client.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { type Tier, meetsTier, requiredTierFor } from "./tier-matrix";

function publishableClient(accessToken?: string) {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        if (accessToken) h.set("Authorization", `Bearer ${accessToken}`);
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export type Caller = { userId: string; tier: Tier };

/** Resolve the caller from an `Authorization: Bearer <supabase jwt>` header. */
export async function resolveCaller(request: Request): Promise<Caller | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  const supabase = publishableClient(token);
  const { data: userData, error } = await supabase.auth.getUser(token);
  if (error || !userData.user) return null;

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("tier,status,current_period_end")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  const active =
    sub &&
    (sub.status === "active" || sub.status === "trialing") &&
    (!sub.current_period_end || new Date(sub.current_period_end) > new Date());

  return { userId: userData.user.id, tier: active ? (sub.tier as Tier) : "free" };
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Gate a server route by module key. Returns a Response to send back when the
 * caller is unauthenticated or under-tiered, otherwise the resolved caller.
 */
export async function requireTier(
  request: Request,
  moduleKey: string,
): Promise<{ caller: Caller } | { response: Response }> {
  const required = requiredTierFor(moduleKey);
  const caller = await resolveCaller(request);

  if (!caller) {
    return {
      response: json(
        {
          error: "unauthorized",
          message: "Sign in to EliteFlux and send your access token as `Authorization: Bearer <token>`.",
          requiredTier: required,
        },
        401,
      ),
    };
  }

  if (!meetsTier(caller.tier, required)) {
    return {
      response: json(
        {
          error: "upgrade_required",
          message: `This intelligence layer requires the ${required.toUpperCase()} plan. Your plan: ${caller.tier.toUpperCase()}.`,
          requiredTier: required,
          currentTier: caller.tier,
          upgradeUrl: "/pricing",
        },
        403,
      ),
    };
  }

  return { caller };
}
