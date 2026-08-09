// App-internal server functions for the EliteFlux AI Coach.
// Client-safe module: every server-only import lives inside a handler.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { COACH_DAILY_LIMIT, type CoachLevel } from "@/lib/coach-shared";
import type { BehaviorProfile, CallRow } from "@/lib/coach.server";
import type { Json } from "@/integrations/supabase/types";

const CALL_COLS =
  "id,symbol,stance,source,entry_price,horizon_hours,rationale,move_pct,score,grade,verdict,status,regime_at_call,flux_at_call,created_at,graded_at";

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

/** Whether this user has ever sent Flux a message — drives the first-visit "Ask Flux" prompt. */
export const getCoachActivityStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count } = await context.supabase
      .from("coach_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("role", "user");
    return { hasMessaged: (count ?? 0) > 0 };
  });

export const listCoachThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("coach_threads")
      .select("id,title,updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createCoachThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("coach_threads")
      .insert({ user_id: context.userId, title: "New conversation" })
      .select("id,title,updated_at")
      .single();
    if (error) throw new Error(error.message);
    return data;
  });

export const getCoachThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ threadId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: thread } = await context.supabase
      .from("coach_threads")
      .select("id,title,updated_at")
      .eq("id", data.threadId)
      .maybeSingle();
    if (!thread) return { thread: null, messages: [] as { id: string; role: string; parts: Json; created_at: string }[] };
    const { data: rows } = await context.supabase
      .from("coach_messages")
      .select("id,role,parts,created_at")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true });
    return { thread, messages: rows ?? [] };
  });

export const deleteCoachThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ threadId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("coach_threads").delete().eq("id", data.threadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Coaching profile + usage
// ---------------------------------------------------------------------------

export const getCoachProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const day = new Date().toISOString().slice(0, 10);
    const [{ data: prof }, { data: sub }, { data: usage }] = await Promise.all([
      context.supabase
        .from("coach_profile")
        .select("experience_level,goals")
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase.from("subscriptions").select("tier,status").eq("user_id", context.userId).maybeSingle(),
      context.supabase
        .from("coach_usage")
        .select("messages")
        .eq("user_id", context.userId)
        .eq("day", day)
        .maybeSingle(),
    ]);
    const tier =
      sub && (sub.status === "active" || sub.status === "trialing") ? (sub.tier as "free" | "pro" | "elite") : "free";
    return {
      experience_level: (prof?.experience_level as CoachLevel) ?? null,
      goals: prof?.goals ?? null,
      tier,
      usedToday: usage?.messages ?? 0,
      dailyLimit: COACH_DAILY_LIMIT[tier],
    };
  });

export const saveCoachProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        experience_level: z.enum(["beginner", "intermediate", "advanced", "pro"]),
        goals: z.string().max(400).nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("coach_profile").upsert(
      {
        user_id: context.userId,
        experience_level: data.experience_level,
        goals: data.goals,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

export const listCoachCalls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("coach_calls")
      .select(CALL_COLS)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(60);
    const calls = (data ?? []) as unknown as (CallRow & { id: string; rationale: string | null })[];
    const { computeBehavior } = await import("@/lib/coach.server");
    return { calls, behavior: computeBehavior(calls) as BehaviorProfile };
  });

export const logCoachCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        symbol: z.string().min(1).max(12),
        stance: z.enum(["accumulate", "reduce", "watch", "avoid"]),
        horizon_hours: z.number().int().min(1).max(720),
        rationale: z.string().max(500).nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { getBrainSnapshotCached } = await import("@/lib/brain-server");
    const r = await getBrainSnapshotCached();
    const sym = data.symbol.trim().toUpperCase();
    const coin = r.snapshot.coinIntel.find((c) => c.symbol.toUpperCase() === sym);
    if (!coin) throw new Error(`${sym} is not covered by EliteFlux.`);
    const { error } = await context.supabase.from("coach_calls").insert({
      user_id: context.userId,
      symbol: sym,
      stance: data.stance,
      source: "user",
      entry_price: coin.price,
      horizon_hours: data.horizon_hours,
      rationale: data.rationale,
      regime_at_call: r.brain.regime,
      flux_at_call: r.brain.eliteFluxScore,
    });
    if (error) throw new Error(error.message);
    return { ok: true, entry_price: coin.price };
  });

export const deleteCoachCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("coach_calls").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Nudges (proactive coach notes)
// ---------------------------------------------------------------------------

export const listCoachNudges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("coach_nudges")
      .select("id,title,body,severity,read,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    const rows = data ?? [];
    return { nudges: rows, unread: rows.filter((n) => !n.read).length };
  });

export const markNudgesRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase
      .from("coach_nudges")
      .update({ read: true })
      .eq("user_id", context.userId)
      .eq("read", false);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Feedback (coach message quality, opportunity ranking quality)
// ---------------------------------------------------------------------------

export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        subjectType: z.enum(["coach_message", "opportunity"]),
        subjectId: z.string().min(1).max(200),
        rating: z.enum(["up", "down"]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as unknown as { from: (t: string) => any })
      .from("user_feedback")
      .upsert(
        { user_id: context.userId, subject_type: data.subjectType, subject_id: data.subjectId, rating: data.rating },
        { onConflict: "user_id,subject_type,subject_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Daily briefing — one AI-written session brief, cached for 6 hours
// ---------------------------------------------------------------------------

export const getDailyBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ force: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const { isFeatureEnabled } = await import("@/lib/platform.server");
    if (!(await isFeatureEnabled(context.supabase as never, "coach"))) {
      throw new Error("Flux the AI Coach is temporarily unavailable.");
    }

    const sixHoursAgo = new Date(Date.now() - 6 * 3600_000).toISOString();
    if (!data.force) {
      const { data: cached } = await context.supabase
        .from("coach_nudges")
        .select("id,title,body,created_at")
        .eq("user_id", context.userId)
        .eq("severity", "briefing")
        .gt("created_at", sixHoursAgo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cached) return { ...cached, cached: true };
    }

    const { buildBriefing } = await import("@/lib/coach-briefing.server");
    return buildBriefing(context.userId);
  });
