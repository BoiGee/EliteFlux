import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { armSchema, decideSchema, settingsSchema } from "@/lib/portfolio.schemas";

export const getAutopilot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadSettings } = await import("@/lib/autopilot.server");
    const settings = await loadSettings(context.supabase as never, context.userId);
    const [actions, audit, connections] = await Promise.all([
      context.supabase
        .from("autopilot_actions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      context.supabase
        .from("autopilot_audit")
        .select("id,event,detail,created_at")
        .order("created_at", { ascending: false })
        .limit(40),
      context.supabase
        .from("exchange_connections")
        .select("permission,status"),
    ]);
    const conns = (connections.data ?? []) as { permission: string; status: string }[];
    return {
      settings,
      actions: actions.data ?? [],
      audit: audit.data ?? [],
      // Autopilot can't do anything without a connection that's both
      // trade-permission and actually connected (matches
      // autopilot.server.ts's tradingConnection() gate exactly) — the page
      // needs to tell these two "nothing works yet" cases apart:
      // no connections at all vs. a connection that's read-only-locked.
      hasAnyConnection: conns.length > 0,
      hasTradeConnection: conns.some((c) => c.permission === "read_trade" && c.status === "connected"),
    };
  });

export const updateAutopilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => settingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Autopilot level is Elite-only — see tier-matrix.ts's "autopilot" key.
    // Adjusting guardrails below that level needs no gate (they're inert
    // until armed), but the escalation itself must be checked server-side,
    // not just have its button disabled client-side.
    if (data.level === "autopilot") {
      const { assertTier } = await import("@/lib/tier-lookup.server");
      await assertTier(context.supabase as never, context.userId, "autopilot");
    }

    const { loadSettings, audit } = await import("@/lib/autopilot.server");
    const current = await loadSettings(context.supabase as never, context.userId);

    const patch: Record<string, unknown> = { ...data };
    // Raising the level to autopilot always requires a fresh arming step.
    if (data.level && data.level !== "autopilot") {
      patch["armed"] = false;
      patch["disarmed_reason"] = null;
    }
    if (data.level === "autopilot" && current.level !== "autopilot") patch["armed"] = false;

    const { error } = await context.supabase
      .from("autopilot_settings")
      .update(patch as never)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    await audit(context.supabase as never, context.userId, "settings_updated", data);
    return loadSettings(context.supabase as never, context.userId);
  });

export const armAutopilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => armSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertTier } = await import("@/lib/tier-lookup.server");
    await assertTier(context.supabase as never, context.userId, "autopilot");

    const { ARM_PHRASE } = await import("@/lib/autonomy");
    const { loadSettings, audit } = await import("@/lib/autopilot.server");
    if (data.phrase.trim().toUpperCase() !== ARM_PHRASE) {
      throw new Error(`Type ${ARM_PHRASE} exactly to arm.`);
    }
    if (!data.accept_disclosure) throw new Error("You must accept the risk disclosure first.");

    const settings = await loadSettings(context.supabase as never, context.userId);
    if (settings.level !== "autopilot") throw new Error("Set the autonomy level to Autopilot first.");

    if (!settings.paper_mode) {
      const { count } = await context.supabase
        .from("exchange_connections")
        .select("id", { count: "exact", head: true })
        .eq("permission", "read_trade")
        .eq("status", "connected");
      if (!count) throw new Error("Live autopilot needs a connected exchange key with trade permission.");
    }

    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("autopilot_settings")
      .update({
        armed: true,
        armed_at: now,
        disclosure_accepted_at: now,
        kill_switch: false,
        disarmed_reason: null,
      } as never)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    await audit(context.supabase as never, context.userId, "armed", { paper: settings.paper_mode });
    return loadSettings(context.supabase as never, context.userId);
  });

export const setKillSwitch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ({ on: Boolean((input as { on?: boolean }).on) }))
  .handler(async ({ data, context }) => {
    const { loadSettings, audit } = await import("@/lib/autopilot.server");
    await loadSettings(context.supabase as never, context.userId);
    const { error } = await context.supabase
      .from("autopilot_settings")
      .update({
        kill_switch: data.on,
        ...(data.on ? { armed: false, disarmed_reason: "kill switch" } : {}),
      } as never)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    await audit(context.supabase as never, context.userId, data.on ? "kill_switch_on" : "kill_switch_off");
    return loadSettings(context.supabase as never, context.userId);
  });

export const decideAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => decideSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { audit, executeAction } = await import("@/lib/autopilot.server");
    if (!data.approve) {
      await context.supabase
        .from("autopilot_actions")
        .update({ state: "rejected", decided_at: new Date().toISOString() } as never)
        .eq("id", data.id)
        .eq("user_id", context.userId);
      await audit(context.supabase as never, context.userId, "action_rejected", null, data.id);
      return { ok: true, rejected: true };
    }

    await context.supabase
      .from("autopilot_actions")
      .update({ state: "approved", decided_at: new Date().toISOString() } as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return executeAction(supabaseAdmin as never, context.userId, data.id);
  });
