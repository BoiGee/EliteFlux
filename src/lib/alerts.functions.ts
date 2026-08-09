import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AlertDefinition } from "@/lib/alerts-engine";
import { sanitizeChannels, type AlertChannel, type Tier } from "@/lib/tier-matrix";

const TRIGGERS = [
  "flux_score",
  "whale_spike",
  "sentiment_shift",
  "narrative_surge",
  "exit_pressure",
  "momentum_change",
  "price_threshold",
] as const;

const CHANNELS = ["in_app", "email", "telegram", "webhook"] as const;

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  trigger_type: z.enum(TRIGGERS),
  symbol: z.string().trim().toUpperCase().max(12).nullable().optional(),
  threshold: z.number().finite().nullable().optional(),
  direction: z.enum(["above", "below"]).default("above"),
  channels: z.array(z.enum(CHANNELS)).min(1).max(4).default(["in_app"]),
});

/** Max alerts per plan tier. */
export const ALERT_LIMITS = { free: 3, pro: 15, elite: 100 } as const;


export const listAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("alerts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("tier,status")
      .eq("user_id", userId)
      .maybeSingle();
    const tier = (sub && (sub.status === "active" || sub.status === "trialing")
      ? sub.tier
      : "free") as keyof typeof ALERT_LIMITS;

    const { count } = await supabase
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if ((count ?? 0) >= ALERT_LIMITS[tier]) {
      return {
        ok: false as const,
        message: `Your ${tier.toUpperCase()} plan allows ${ALERT_LIMITS[tier]} alerts. Upgrade for more.`,
      };
    }

    if (data.trigger_type === "price_threshold" && (!data.symbol || data.threshold == null)) {
      return { ok: false as const, message: "Price alerts need a symbol and a price threshold." };
    }

    const channels = sanitizeChannels(tier as Tier, data.channels as AlertChannel[]);

    const { error } = await supabase.from("alerts").insert({
      user_id: userId,
      name: data.name,
      trigger_type: data.trigger_type,
      symbol: data.symbol || null,
      threshold: data.threshold ?? null,
      direction: data.direction,
      channels,
      enabled: true,
    });
    if (error) return { ok: false as const, message: error.message };
    const dropped = data.channels.length - channels.filter((c) => data.channels.includes(c)).length;
    return {
      ok: true as const,
      message: dropped > 0 ? "Alert created — some channels need a higher plan." : "Alert created.",
    };

  });

export const toggleAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("alerts")
      .update({ enabled: data.enabled })
      .eq("id", data.id);
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, message: data.enabled ? "Alert enabled." : "Alert paused." };
  });

export const deleteAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("alerts").delete().eq("id", data.id);
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, message: "Alert deleted." };
  });

export const listAlertHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("alert_history")
      .select("*")
      .order("fired_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const markAlertsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("alert_history")
      .update({ read: true })
      .eq("read", false);
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, message: "All caught up." };
  });

/** Run the evaluator immediately for the signed-in user's alerts. */
export const runMyAlertsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getBrainSnapshotCached, buildAlertMetrics } = await import("@/lib/brain-server");
    const { evaluateAlert, isCoolingDown } = await import("@/lib/alerts-engine");

    const { data: alerts } = await context.supabase
      .from("alerts")
      .select("id,user_id,name,trigger_type,symbol,threshold,direction,enabled,last_triggered_at")
      .eq("enabled", true);
    if (!alerts?.length) return { ok: true as const, fired: 0, message: "No enabled alerts." };

    let metrics;
    try {
      metrics = buildAlertMetrics(await getBrainSnapshotCached());
    } catch {
      return { ok: false as const, fired: 0, message: "Live market data unavailable right now." };
    }

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    let fired = 0;
    for (const raw of alerts) {
      const alert = raw as unknown as AlertDefinition;
      if (isCoolingDown(alert, now)) continue;
      const res = evaluateAlert(alert, metrics);
      if (!res.fired) continue;
      const { error } = await context.supabase.from("alert_history").insert({
        alert_id: alert.id,
        user_id: alert.user_id,
        fired_at: nowIso,
        payload: {
          name: alert.name,
          trigger: alert.trigger_type,
          symbol: alert.symbol,
          value: res.value,
          message: res.message,
          ...(res.detail ?? {}),
        },
      });
      if (error) continue;
      await context.supabase.from("alerts").update({ last_triggered_at: nowIso }).eq("id", alert.id);
      fired++;
    }
    return {
      ok: true as const,
      fired,
      message: fired ? `${fired} alert${fired > 1 ? "s" : ""} triggered.` : "No alerts triggered — conditions not met.",
    };
  });

/** Unread in-app alert count + the latest few, for the top-bar bell. */
export const getNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: recent }, { count }] = await Promise.all([
      context.supabase
        .from("alert_history")
        .select("id,fired_at,read,payload")
        .order("fired_at", { ascending: false })
        .limit(10),
      context.supabase
        .from("alert_history")
        .select("id", { count: "exact", head: true })
        .eq("read", false),
    ]);
    return { unread: count ?? 0, recent: recent ?? [] };
  });

/** Where alerts should reach the user outside the app. */
export const updateNotificationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        telegram_chat_id: z.string().trim().max(64).nullable().optional(),
        webhook_url: z
          .string()
          .trim()
          .max(500)
          .refine((v) => v === "" || /^https:\/\/.+/.test(v), "Webhook URL must start with https://")
          .nullable()
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch = {
      ...(data.telegram_chat_id !== undefined ? { telegram_chat_id: data.telegram_chat_id || null } : {}),
      ...(data.webhook_url !== undefined ? { webhook_url: data.webhook_url || null } : {}),
    };
    const { error } = await context.supabase.from("profiles").update(patch).eq("id", context.userId);
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, message: "Notification settings saved." };
  });

/** Recent delivery attempts so users can see failed webhooks/telegram sends. */
export const listDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("alert_deliveries")
      .select("id,channel,status,error,created_at")
      .order("created_at", { ascending: false })
      .limit(25);
    return data ?? [];
  });

/** Mark onboarding complete and seed starter alerts matching a risk profile. */
export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ risk: z.enum(["low", "medium", "high"]), seedAlerts: z.boolean().default(true) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("profiles")
      .update({ risk_sensitivity: data.risk, onboarded_at: new Date().toISOString() })
      .eq("id", userId);

    if (data.seedAlerts) {
      const { count } = await supabase
        .from("alerts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      if ((count ?? 0) === 0) {
        const presets: Record<string, Array<{ name: string; trigger_type: string; threshold: number; direction: string }>> = {
          low: [
            { name: "Exit pressure building", trigger_type: "exit_pressure", threshold: 65, direction: "above" },
            { name: "Flux score turns risk-off", trigger_type: "flux_score", threshold: 35, direction: "below" },
          ],
          medium: [
            { name: "Flux score turns bullish", trigger_type: "flux_score", threshold: 65, direction: "above" },
            { name: "Whale accumulation spike", trigger_type: "whale_spike", threshold: 70, direction: "above" },
            { name: "Exit pressure building", trigger_type: "exit_pressure", threshold: 70, direction: "above" },
          ],
          high: [
            { name: "Momentum ignition", trigger_type: "momentum_change", threshold: 65, direction: "above" },
            { name: "Narrative surge", trigger_type: "narrative_surge", threshold: 60, direction: "above" },
            { name: "Whale accumulation spike", trigger_type: "whale_spike", threshold: 65, direction: "above" },
          ],
        };
        const rows = (presets[data.risk] ?? []).map((p) => ({
          ...p,
          user_id: userId,
          symbol: null,
          channels: ["in_app"],
          enabled: true,
        }));
        if (rows.length) await supabase.from("alerts").insert(rows as never);
      }
    }
    return { ok: true as const, message: "You're all set." };
  });
