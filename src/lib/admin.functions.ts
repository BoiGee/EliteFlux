import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Server-side admin authorisation. The client never decides who is an admin;
// the page waits for this verdict before rendering anything privileged.
async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || data !== true) throw new Error("Forbidden");
}

/**
 * Owner is a tier above admin, held in addition to (not instead of) 'admin' —
 * every existing admin check keeps working for owners. It gates who may
 * grant or revoke roles, and — separately — who may flip the Coach feature
 * switch (proactive nudges and the daily briefing call a paid model on a
 * schedule, so leaving that toggle open to any admin is an easy way to burn
 * budget by accident).
 */
async function assertOwner(context: { supabase: any; userId: string }, action = "do this") {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "owner",
  });
  if (error || data !== true) throw new Error(`Only the owner can ${action}.`);
}

export const verifyAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { admin: data === true };
  });

export const verifyOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    return { owner: data === true };
  });

// Must match wrangler.jsonc's triggers.crons / scheduler.server.ts's
// CRON_JOBS exactly (evaluate-alerts-fast: * * * * *, evaluate-alerts:
// */5 * * * *, settle-payments: 0 * * * *, expire-subs: 0 */12 * * *,
// retention-cleanup: 0 3 * * *) — confirmed live via audit that these had
// drifted badly out of sync with the real schedule (evaluate-alerts was set
// to 20min instead of 5, evaluate-alerts-fast to 5min instead of 1), which
// meant getSystemHealth's "stale: ageMin > intervalMin * 2" only fired
// after 4x longer than it should have — exactly the kind of
// silent-until-checked gap the health panel exists to catch. Exported (not
// a local const inside the handler) so admin.functions.test.ts can guard
// against this drifting again.
export const EXPECTED_INTERVAL_MIN: Record<string, number> = {
  "evaluate-alerts-fast": 1,
  "evaluate-alerts": 5,
  "settle-payments": 60,
  "expire-subs": 720,
  "retention-cleanup": 1440,
};

/** Operational health: last background run, delivery failures, data freshness. */
export const getSystemHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();

    const [runsRes, snapRes, failRes, ksRes] = await Promise.all([
      supabaseAdmin
        .from("system_runs")
        .select("id,job,status,started_at,finished_at,evaluated,fired,errors")
        .order("started_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("market_snapshots")
        .select("captured_at")
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("alert_deliveries")
        .select("channel,status")
        .gte("created_at", since)
        .limit(2000),
      supabaseAdmin
        .from("platform_settings")
        .select("value")
        .eq("key", "autopilot_kill_switch")
        .maybeSingle(),
    ]);

    const deliveries: Record<string, { sent: number; failed: number; skipped: number }> = {};
    for (const row of (failRes.data ?? []) as Array<{ channel: string; status: string }>) {
      const b = (deliveries[row.channel] ??= { sent: 0, failed: 0, skipped: 0 });
      if (row.status === "sent") b.sent++;
      else if (row.status === "failed") b.failed++;
      else b.skipped++;
    }

    const lastSnapshot = (snapRes.data as { captured_at: string } | null)?.captured_at ?? null;

    // A job that stopped running entirely must not look identical to a healthy
    // one, so each known job reports its own freshness.
    const runs = (runsRes.data ?? []) as Array<{ job: string; started_at: string; status: string }>;
    // Consecutive failures matter more than staleness here: a job that runs on
    // schedule but fails every time never looks "stale", it just does nothing.
    const { data: recentRuns } = await supabaseAdmin
      .from("system_runs")
      .select("job,status,started_at,detail")
      .order("started_at", { ascending: false })
      .limit(120);
    const history = (recentRuns ?? []) as Array<{ job: string; status: string; started_at: string; detail: unknown }>;

    const dayAgo = Date.now() - 24 * 3600_000;
    const cleanMsg = (m: unknown) =>
      typeof m === "string"
        ? m.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180)
        : "unknown error";

    const jobs = Object.entries(EXPECTED_INTERVAL_MIN).map(([job, intervalMin]) => {
      const last = runs.find((r) => r.job === job);
      const ageMin = last ? Math.round((Date.now() - new Date(last.started_at).getTime()) / 60000) : null;
      const mine = history.filter((r) => r.job === job);
      // "skipped" means the cycle found no fresh market data and stood down —
      // a degraded state, not a failure. Only real failures count as red.
      const isFailure = (s: string) => s !== "ok" && s !== "running" && s !== "skipped";
      let consecutiveFailures = 0;
      for (const r of mine) {
        if (!isFailure(r.status)) break;
        consecutiveFailures++;
      }
      const firstFailure = mine.find((r) => isFailure(r.status));
      const lastError =
        consecutiveFailures > 0 ? cleanMsg((firstFailure?.detail as { msg?: string } | null)?.msg) : null;

      // 24h rollup so a resolved incident stops dominating the view.
      const window24h = mine.filter((r) => new Date(r.started_at).getTime() >= dayAgo);
      const failed24h = window24h.filter((r) => isFailure(r.status)).length;
      const skipped24h = window24h.filter((r) => r.status === "skipped").length;

      // Green now, but red earlier today → show "recovered", not "healthy".
      const recovered = consecutiveFailures === 0 && failed24h > 0;

      return {
        job,
        lastRunAt: last?.started_at ?? null,
        lastStatus: last?.status ?? null,
        ageMinutes: ageMin,
        stale: ageMin === null || ageMin > intervalMin * 2,
        consecutiveFailures,
        lastError,
        runs24h: window24h.length,
        failed24h,
        skipped24h,
        recovered,

      };
    });

    const { count: pendingPayments } = await supabaseAdmin
      .from("payment_transactions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    // Which venue is actually serving prices right now (cached read, no extra
    // provider load) — a degraded-but-working state should be visible.
    let marketSource: string = "unavailable";
    let marketError: string | null = null;
    let marketAgeMinutes: number | null = null;
    try {
      const { getUpstreamMarketData } = await import("@/lib/brain-server");
      const up = await getUpstreamMarketData();
      marketSource = up.tickerSource;
      marketAgeMinutes = Math.round((Date.now() - up.fetchedAt) / 60000);
    } catch (e) {
      marketError = cleanMsg(e instanceof Error ? e.message : "unknown");
    }



    return {
      runs: runsRes.data ?? [],
      jobs,
      pendingPayments: pendingPayments ?? 0,
      lastSnapshot,
      snapshotAgeMinutes: lastSnapshot
        ? Math.round((Date.now() - new Date(lastSnapshot).getTime()) / 60000)
        : null,
      deliveries,
      marketSource,
      marketError,
      marketAgeMinutes,

      killSwitch: (ksRes.data as { value: unknown } | null)?.value === true,
    };
  });


/** Recent failed alert deliveries with their error text. */
export const listDeliveryFailures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const { data } = await supabaseAdmin
      .from("alert_deliveries")
      .select("id,user_id,channel,status,error,created_at")
      .eq("status", "failed")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50);
    return { failures: data ?? [] };
  });

/** Business metrics — computed with aggregate counts, never by shipping rows. */
export const getAdminMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = Date.now();
    const day = new Date(now - 24 * 3600_000).toISOString();
    const week = new Date(now - 7 * 24 * 3600_000).toISOString();
    const month = new Date(now - 30 * 24 * 3600_000).toISOString();
    const soon = new Date(now + 7 * 24 * 3600_000).toISOString();
    const nowIso = new Date(now).toISOString();

    const countOf = async (build: (q: any) => any) => {
      const { count } = await build(supabaseAdmin);
      return count ?? 0;
    };

    const [users, new24h, new7d, pro, elite, pendingPay, expiringSoon] = await Promise.all([
      countOf((s: any) => s.from("profiles").select("id", { count: "exact", head: true })),
      countOf((s: any) => s.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", day)),
      countOf((s: any) => s.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", week)),
      countOf((s: any) =>
        s.from("subscriptions").select("id", { count: "exact", head: true }).eq("tier", "pro").eq("status", "active"),
      ),
      countOf((s: any) =>
        s.from("subscriptions").select("id", { count: "exact", head: true }).eq("tier", "elite").eq("status", "active"),
      ),
      countOf((s: any) =>
        s.from("payment_transactions").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ),
      countOf((s: any) =>
        s
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("status", "active")
          .neq("tier", "free")
          .gte("current_period_end", nowIso)
          .lte("current_period_end", soon),
      ),
    ]);

    const { data: revenueRows } = await supabaseAdmin
      .from("payment_transactions")
      .select("detected_amount,expected_amount")
      .eq("status", "verified")
      .gte("created_at", month)
      .limit(5000);
    const revenue30d = ((revenueRows ?? []) as Array<{ detected_amount: number | null; expected_amount: number }>)
      .reduce((sum, r) => sum + Number(r.detected_amount ?? r.expected_amount ?? 0), 0);

    return { users, new24h, new7d, pro, elite, pendingPay, expiringSoon, revenue30d };
  });

const ListSchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.string().max(20).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

/** Users with their plan and role, searchable and paged. */
export const listAdminUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = data.limit ?? 50;
    const offset = data.offset ?? 0;

    let q = supabaseAdmin
      .from("profiles")
      .select("id,email,display_name,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (data.search) q = q.or(`email.ilike.%${data.search}%,display_name.ilike.%${data.search}%`);

    const { data: rows, count } = await q;
    const ids = ((rows ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (!ids.length) return { rows: [], total: count ?? 0 };

    const [{ data: subs }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("subscriptions").select("user_id,tier,status,current_period_end").in("user_id", ids),
      supabaseAdmin.from("user_roles").select("user_id,role").in("user_id", ids).eq("role", "admin"),
    ]);

    const subBy = new Map(((subs ?? []) as any[]).map((s) => [s.user_id, s]));
    const adminSet = new Set(((roles ?? []) as any[]).map((r) => r.user_id));

    return {
      total: count ?? 0,
      rows: ((rows ?? []) as any[]).map((p) => ({
        ...p,
        tier: subBy.get(p.id)?.tier ?? "free",
        subStatus: subBy.get(p.id)?.status ?? null,
        periodEnd: subBy.get(p.id)?.current_period_end ?? null,
        isAdmin: adminSet.has(p.id),
      })),
    };
  });

/** Payments with the payer's email resolved server-side. */
export const listAdminPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = data.limit ?? 50;
    const offset = data.offset ?? 0;

    let matchIds: string[] | null = null;
    if (data.search) {
      const term = data.search;
      const { data: matches } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .or(`email.ilike.%${term}%,display_name.ilike.%${term}%`)
        .limit(200);
      matchIds = ((matches ?? []) as Array<{ id: string }>).map((m) => m.id);
    }

    let q = supabaseAdmin
      .from("payment_transactions")
      .select(
        "id,user_id,tier,cycle,expected_amount,detected_amount,status,provider,provider_ref,notes,created_at,verified_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (data.status && data.status !== "all") q = q.eq("status", data.status as never);
    if (matchIds) {
      if (!matchIds.length && !/^[a-fA-F0-9-]{6,64}$/.test(data.search ?? "")) return { rows: [], total: 0 };
      if (matchIds.length) q = q.in("user_id", matchIds);
      else q = q.ilike("provider_ref", `%${data.search}%`);
    }

    const { data: rows, count } = await q;
    const ids = [...new Set(((rows ?? []) as any[]).map((r) => r.user_id))];
    const { data: profs } = ids.length
      ? await supabaseAdmin.from("profiles").select("id,email").in("id", ids)
      : { data: [] as any[] };
    const emailBy = new Map(((profs ?? []) as any[]).map((p) => [p.id, p.email]));

    return {
      total: count ?? 0,
      rows: ((rows ?? []) as any[]).map((r) => ({ ...r, email: emailBy.get(r.user_id) ?? null })),
    };
  });

const DecideSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approve", "reject", "recheck"]),
  reason: z.string().trim().max(300).optional(),
});

/**
 * Approving a payment must actually grant the plan — flipping the status
 * column alone leaves the customer paid-up with no access.
 */
export const decidePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DecideSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { grantSubscription, settlePayment, writeAudit } = await import("./payments.server");

    const { data: row } = await supabaseAdmin
      .from("payment_transactions")
      .select("id,user_id,tier,cycle,status")
      .eq("id", data.id)
      .maybeSingle();
    const tx = row as { id: string; user_id: string; tier: any; cycle: any; status: string } | null;
    if (!tx) return { ok: false, message: "Payment not found." };

    if (data.decision === "recheck") {
      const result = await settlePayment(supabaseAdmin as never, tx.id);
      await writeAudit(supabaseAdmin as never, {
        actorId: context.userId,
        action: "payment.recheck",
        targetUserId: tx.user_id,
        targetId: tx.id,
        detail: { result: result.status },
      });
      return { ok: result.ok, message: result.message };
    }

    if (data.decision === "reject") {
      await supabaseAdmin
        .from("payment_transactions")
        .update({ status: "rejected", notes: data.reason ?? "Rejected by an administrator." })
        .eq("id", tx.id);
      await writeAudit(supabaseAdmin as never, {
        actorId: context.userId,
        action: "payment.reject",
        targetUserId: tx.user_id,
        targetId: tx.id,
        detail: { reason: data.reason ?? null },
      });
      return { ok: true, message: "Payment rejected." };
    }

    const { periodEnd } = await grantSubscription(supabaseAdmin as never, tx.user_id, tx.tier, tx.cycle);
    await supabaseAdmin
      .from("payment_transactions")
      .update({
        status: "verified",
        verified_at: new Date().toISOString(),
        notes: data.reason ?? "Approved manually by an administrator.",
      })
      .eq("id", tx.id);
    await writeAudit(supabaseAdmin as never, {
      actorId: context.userId,
      action: "payment.approve",
      targetUserId: tx.user_id,
      targetId: tx.id,
      detail: { tier: tx.tier, cycle: tx.cycle, periodEnd: periodEnd.toISOString(), reason: data.reason ?? null },
    });
    return {
      ok: true,
      message: `Approved — ${String(tx.tier).toUpperCase()} active until ${periodEnd.toLocaleDateString()}.`,
    };
  });

const PlanSchema = z.object({
  userId: z.string().uuid(),
  tier: z.enum(["free", "pro", "elite"]).optional(),
  status: z.enum(["active", "canceled", "past_due", "trialing", "incomplete", "expired"]).optional(),
  extendDays: z.number().int().min(1).max(3650).optional(),
});

/** Manual plan override — always audited. */
export const setUserPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PlanSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeAudit } = await import("./payments.server");

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.tier) patch.tier = data.tier;
    if (data.status) patch.status = data.status;
    if (data.extendDays) {
      const { data: cur } = await supabaseAdmin
        .from("subscriptions")
        .select("current_period_end")
        .eq("user_id", data.userId)
        .maybeSingle();
      const base = (cur as { current_period_end: string | null } | null)?.current_period_end;
      const from = base && new Date(base) > new Date() ? new Date(base) : new Date();
      patch.current_period_end = new Date(from.getTime() + data.extendDays * 86400_000).toISOString();
      patch.status = "active";
      patch.cancel_at_period_end = false;
    }

    const { error } = await supabaseAdmin
      .from("subscriptions")
      .upsert({ user_id: data.userId, ...patch } as never, { onConflict: "user_id" });
    if (error) return { ok: false, message: error.message };

    await writeAudit(supabaseAdmin as never, {
      actorId: context.userId,
      action: "plan.override",
      targetUserId: data.userId,
      detail: patch,
    });
    return { ok: true, message: "Plan updated." };
  });

/**
 * Role changes are the one action that can lock everyone out, so the server
 * refuses self-revocation and refuses to remove the last admin.
 */
export const setAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), admin: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context as never, "change roles");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeAudit } = await import("./payments.server");

    if (!data.admin) {
      if (data.userId === context.userId) {
        return { ok: false, message: "You can't remove your own admin access." };
      }
      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      if ((count ?? 0) <= 1) return { ok: false, message: "This is the last admin — promote someone else first." };

      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", "admin");
      if (error) return { ok: false, message: error.message };
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.userId, role: "admin" });
      if (error && !error.message.includes("duplicate")) return { ok: false, message: error.message };
    }

    await writeAudit(supabaseAdmin as never, {
      actorId: context.userId,
      action: data.admin ? "role.grant_admin" : "role.revoke_admin",
      targetUserId: data.userId,
    });
    return { ok: true, message: data.admin ? "Admin access granted." : "Admin access revoked." };
  });

/**
 * Replay measured accuracy under the currently-live blend vs. the naive
 * cold-start weights, so "is the adaptive calibration actually beating the
 * hand-picked baseline" has a real, measured answer instead of a guess.
 */
export const runModelBacktest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ regime: z.string().nullable().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { backtestWeights, walkForwardValidate } = await import("./backtest.server");
    const { BASE_RECOMMENDATION_WEIGHTS } = await import("./recommendation-engine");
    const [backtest, walkForward] = await Promise.all([
      backtestWeights(supabaseAdmin as never, BASE_RECOMMENDATION_WEIGHTS, { regime: data.regime ?? undefined }),
      walkForwardValidate(supabaseAdmin as never, { regime: data.regime ?? undefined }),
    ]);
    return { backtest, walkForward };
  });

/** Everything about one customer in a single call. */
export const getUserDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = data.userId;

    const [profile, sub, payments, deliveries, autopilot, exchanges, wallets, roles] = await Promise.all([
      supabaseAdmin.from("profiles").select("id,email,display_name,created_at,risk_sensitivity,timezone,onboarded_at,readonly_keys_only").eq("id", uid).maybeSingle(),
      supabaseAdmin.from("subscriptions").select("tier,status,current_period_start,current_period_end,cancel_at_period_end").eq("user_id", uid).maybeSingle(),
      supabaseAdmin.from("payment_transactions").select("id,tier,cycle,expected_amount,detected_amount,status,txid,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(20),
      supabaseAdmin.from("alert_deliveries").select("channel,status,error,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(20),
      supabaseAdmin.from("autopilot_settings").select("level,paper_mode,armed,kill_switch,max_trade_usd,max_trades_per_day").eq("user_id", uid).maybeSingle(),
      // Never select ciphertext columns — only connection state.
      supabaseAdmin.from("exchange_connections").select("id,venue,label,permission,status,last_error,last_synced_at").eq("user_id", uid),
      supabaseAdmin.from("wallet_addresses").select("id,chain,label,status,last_synced_at").eq("user_id", uid),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", uid),
    ]);

    return {
      profile: profile.data ?? null,
      subscription: sub.data ?? null,
      payments: payments.data ?? [],
      deliveries: deliveries.data ?? [],
      autopilot: autopilot.data ?? null,
      exchanges: exchanges.data ?? [],
      wallets: wallets.data ?? [],
      isAdmin: ((roles.data ?? []) as Array<{ role: string }>).some((r) => r.role === "admin"),
    };
  });

/** Recent privileged actions, newest first. */
export const listAdminAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("admin_audit")
      .select("id,actor_id,action,target_user_id,target_id,detail,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    const rows = (data ?? []) as any[];
    const ids = [...new Set(rows.flatMap((r) => [r.actor_id, r.target_user_id].filter(Boolean)))];
    const { data: profs } = ids.length
      ? await supabaseAdmin.from("profiles").select("id,email").in("id", ids)
      : { data: [] as any[] };
    const emailBy = new Map(((profs ?? []) as any[]).map((p) => [p.id, p.email]));
    return {
      rows: rows.map((r) => ({
        ...r,
        actorEmail: emailBy.get(r.actor_id) ?? r.actor_id?.slice(0, 8),
        targetEmail: r.target_user_id ? (emailBy.get(r.target_user_id) ?? r.target_user_id.slice(0, 8)) : null,
      })),
    };
  });

/** Trigger a background job immediately instead of waiting for its schedule. */
export const runBackgroundJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        job: z.enum(["evaluate-alerts", "evaluate-alerts-fast", "expire-subs", "settle-payments", "retention-cleanup"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeAudit } = await import("./payments.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!key) return { ok: false, message: "Server is missing its API key configuration." };

    const req = getRequest();
    const origin = new URL(req.url).origin;

    try {
      // Bounded so a stuck downstream job (this can trigger the very cron
      // jobs that were hanging earlier — see jobs.server.ts) fails the admin
      // request with a clear message instead of hanging it indefinitely.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      const res = await fetch(`${origin}/api/public/${data.job}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key },
        body: "{}",
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
      const body = await res.text();
      await writeAudit(supabaseAdmin as never, {
        actorId: context.userId,
        action: "job.run",
        targetId: data.job,
        detail: { status: res.status },
      });
      return { ok: res.ok, message: res.ok ? `${data.job} finished (${res.status}).` : `Failed: ${body.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Could not reach the job endpoint." };
    }
  });

/**
 * Anonymized, aggregate-only view of how the user base is behaving —
 * counts and distributions, never anything tied to an individual. Also
 * where the two pieces of collected-but-never-read data get a first real
 * use: coach message feedback and opportunity community trust.
 */
export const getCohortAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as never as { from: (t: string) => any };

    const since14d = new Date(Date.now() - 14 * 86400_000).toISOString();

    const [subs, profiles, autopilot, watchlist, coachFeedback, communityTrustMod, crowdMod] = await Promise.all([
      admin.from("subscriptions").select("tier,status"),
      admin.from("profiles").select("risk_sensitivity"),
      admin.from("autopilot_settings").select("level,armed"),
      admin.from("watchlist_items").select("symbol"),
      admin.from("user_feedback").select("rating").eq("subject_type", "coach_message").gte("created_at", since14d),
      import("./community-trust"),
      import("./crowd-intel"),
    ]);

    const tierCounts: Record<string, number> = {};
    for (const s of (subs.data ?? []) as { tier: string; status: string }[]) {
      if (s.status !== "active" && s.status !== "trialing") continue;
      tierCounts[s.tier] = (tierCounts[s.tier] ?? 0) + 1;
    }

    const riskCounts: Record<string, number> = {};
    for (const p of (profiles.data ?? []) as { risk_sensitivity: string }[]) {
      riskCounts[p.risk_sensitivity] = (riskCounts[p.risk_sensitivity] ?? 0) + 1;
    }

    const autopilotRows = (autopilot.data ?? []) as { level: string; armed: boolean }[];
    const autopilotLevelCounts: Record<string, number> = {};
    let autopilotArmedCount = 0;
    for (const a of autopilotRows) {
      autopilotLevelCounts[a.level] = (autopilotLevelCounts[a.level] ?? 0) + 1;
      if (a.armed) autopilotArmedCount++;
    }

    const watchlistCounts: Record<string, number> = {};
    for (const w of (watchlist.data ?? []) as { symbol: string }[]) {
      watchlistCounts[w.symbol] = (watchlistCounts[w.symbol] ?? 0) + 1;
    }
    const topWatchlisted = Object.entries(watchlistCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([symbol, count]) => ({ symbol, count }));

    const feedbackRows = (coachFeedback.data ?? []) as { rating: "up" | "down" }[];
    const coachUp = feedbackRows.filter((r) => r.rating === "up").length;
    const coachDown = feedbackRows.filter((r) => r.rating === "down").length;

    const communityTrust = await communityTrustMod.getCommunityTrustIntel(admin);
    const trustedEnough = Object.values(communityTrust.perAsset).filter(
      (t): t is NonNullable<typeof t> => !!t && t.raters >= 3,
    );
    const mostTrusted = [...trustedEnough].sort((a, b) => b.score - a.score).slice(0, 5);
    const leastTrusted = [...trustedEnough].sort((a, b) => a.score - b.score).slice(0, 5);

    const crowd = await crowdMod.loadCrowdIntel(admin);

    return {
      tierDistribution: tierCounts,
      riskDistribution: riskCounts,
      autopilot: { armedCount: autopilotArmedCount, levelDistribution: autopilotLevelCounts, totalConfigured: autopilotRows.length },
      topWatchlisted,
      coachFeedback: {
        upvotes: coachUp,
        downvotes: coachDown,
        total: feedbackRows.length,
        positiveRatioPct: feedbackRows.length ? Math.round((coachUp / feedbackRows.length) * 1000) / 10 : null,
      },
      communityTrust: { mostTrusted, leastTrusted, symbolsRated: trustedEnough.length },
      crowdPositioning: crowd.perAsset,
    };
  });

/** Global automation kill switch — halts every user's autopilot immediately. */
export const setAutopilotKillSwitch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ on: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("platform_settings")
      .update({ value: data.on as never, updated_at: new Date().toISOString() })
      .eq("key", "autopilot_kill_switch");
    if (error) return { ok: false, message: error.message };
    const { writeAudit } = await import("./payments.server");
    await writeAudit(supabaseAdmin as never, {
      actorId: context.userId,
      action: data.on ? "killswitch.on" : "killswitch.off",
    });
    return { ok: true, on: data.on };
  });

/** Launch controls: sign-up gating and platform feature switches. */
export const getPlatformControls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getFeatureFlags, getSignupMode } = await import("./platform.server");
    const [flags, signup] = await Promise.all([
      getFeatureFlags(supabaseAdmin as never),
      getSignupMode(supabaseAdmin as never),
    ]);
    return { flags, signup };
  });

export const setPlatformControls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        flags: z
          .object({ autopilot: z.boolean(), payments: z.boolean(), coach: z.boolean() })
          .optional(),
        signup: z.object({ mode: z.enum(["open", "invite"]), code: z.string().max(64) }).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeSetting, getFeatureFlags } = await import("./platform.server");
    if (data.flags) {
      // The Coach switch is owner-only. Gate on an actual change to it
      // (not just its presence — the client always round-trips the full
      // flags object) so a plain admin can still freely flip autopilot/
      // payments without hitting this check.
      const current = await getFeatureFlags(supabaseAdmin as never);
      if (data.flags.coach !== current.coach) await assertOwner(context as never, "change the Coach switch");
      await writeSetting(supabaseAdmin as never, "feature_flags", data.flags);
    }
    if (data.signup) await writeSetting(supabaseAdmin as never, "signup_mode", data.signup);
    const { writeAudit } = await import("./payments.server");
    await writeAudit(supabaseAdmin as never, {
      actorId: context.userId,
      action: "platform.controls",
      detail: data,
    });
    return { ok: true };
  });

/** Measured model accuracy: how often each signal family called it right. */
export const getModelAccuracy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ days: z.number().int().min(1).max(180).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadAccuracy, loadModelWeights } = await import("./signal-tracking.server");
    const { detectDrift } = await import("./model-calibration");

    const days = data.days ?? 30;
    const [rows, recentRows, weights, pendingRes, totalRes] = await Promise.all([
      loadAccuracy(supabaseAdmin as never, { days }),
      loadAccuracy(supabaseAdmin as never, { days: 7 }),
      loadModelWeights(supabaseAdmin as never, "recommendation"),
      supabaseAdmin.from("signal_events").select("id", { count: "exact", head: true }).is("resolved_at", null),
      supabaseAdmin.from("signal_outcomes").select("id", { count: "exact", head: true }),
    ]);

    const recentBy = new Map(recentRows.map((r) => [`${r.signalType}|${r.horizonHours}`, r]));
    const signals = rows.map((r) => {
      const recent = recentBy.get(`${r.signalType}|${r.horizonHours}`);
      const drift = detectDrift(
        recent ? { samples: recent.samples, hitRate: recent.hitRate, avgReturnPct: recent.avgReturnPct } : undefined,
        { samples: r.samples, hitRate: r.hitRate, avgReturnPct: r.avgReturnPct },
      );
      return {
        ...r,
        recentHitRate: recent?.hitRate ?? null,
        drifting: drift.drifting,
      };
    });

    const graded = signals.reduce((a, s) => a + s.samples, 0);
    const hits = signals.reduce((a, s) => a + s.hits, 0);

    return {
      days,
      signals,
      overallHitRate: graded ? hits / graded : null,
      gradedSamples: graded,
      pendingSignals: pendingRes.count ?? 0,
      totalOutcomes: totalRes.count ?? 0,
      weights: weights?.weights ?? null,
      weightsSampleSize: weights?.sampleSize ?? 0,
      weightsComputedAt: weights?.computedAt ?? null,
    };
  });
