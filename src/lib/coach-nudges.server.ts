// Server-only: proactive coach notes. Fires when the market regime flips or
// exit pressure spikes, and lands in the user's coach nudge feed — and now
// actually reaches them via Telegram/email, the same way alerts do, since a
// coaching moment nobody sees isn't coaching.
type Admin = { from: (t: string) => any };

export interface NudgeContext {
  regime: string;
  previousRegime: string | null;
  fluxScore: number;
  exitPressure: number;
  whalePhase: string;
  leadingNarrative: string | null;
}

type NudgeKind = "regime_shift" | "exit_pressure" | "rotation";

interface NudgeTrigger {
  kind: NudgeKind;
  title: string;
  severity: "info" | "warn";
  facts: string;
}

function detectTrigger(ctx: NudgeContext): NudgeTrigger | null {
  if (ctx.previousRegime && ctx.previousRegime !== ctx.regime) {
    return {
      kind: "regime_shift",
      title: `Regime shift · ${ctx.regime}`,
      severity: "warn",
      facts: `Market moved from "${ctx.previousRegime}" to "${ctx.regime}". Flux score ${Math.round(ctx.fluxScore)}. Whales are ${ctx.whalePhase.toLowerCase()}. Positions sized for the old regime are usually the ones that get hurt in a shift like this.`,
    };
  }
  if (ctx.exitPressure >= 75) {
    return {
      kind: "exit_pressure",
      title: "Exit pressure elevated",
      severity: "warn",
      facts: `Exit pressure is at ${Math.round(ctx.exitPressure)} while the regime reads "${ctx.regime}". That combination has historically preceded distribution.`,
    };
  }
  if (ctx.fluxScore >= 72 && ctx.leadingNarrative) {
    return {
      kind: "rotation",
      title: `Rotation into ${ctx.leadingNarrative}`,
      severity: "info",
      facts: `Flux score is ${Math.round(ctx.fluxScore)} and capital is concentrating in ${ctx.leadingNarrative}. Early rotation is often where the best-graded calls come from.`,
    };
  }
  return null;
}

const LEVELS = ["beginner", "intermediate", "advanced", "pro"] as const;
type Level = (typeof LEVELS)[number];

const LEVEL_HINT: Record<Level, string> = {
  beginner: "Plain language, no jargon at all — explain any term you use in a few words. One short idea, then what it means for them.",
  intermediate: "Direct and short. Define only unusual terms.",
  advanced: "Dense, signal-first, no hand-holding.",
  pro: "Terse desk-note style: read, implication, one line. No filler.",
};

/** One model call composes a version for every experience level, so cost stays flat regardless of how many users get this nudge. */
async function composeNudgeVariants(trigger: NudgeTrigger): Promise<Record<Level, string>> {
  try {
    const { generateObject } = await import("ai");
    const { anthropic } = await import("@ai-sdk/anthropic");
    const { z } = await import("zod");

    const { object } = await generateObject({
      // Short, formulaic push-notification copy — doesn't need Opus-tier
      // reasoning, and this runs automatically off market triggers rather
      // than a deliberate user action, so cost per call matters more here.
      model: anthropic("claude-haiku-4-5-20251001"),
      schema: z.object({
        beginner: z.string().max(280),
        intermediate: z.string().max(280),
        advanced: z.string().max(280),
        pro: z.string().max(220),
      }),
      system:
        "You are Flux, EliteFlux's AI coach, writing a short proactive nudge that will be pushed to a user's phone. Write four versions of the SAME nudge, one per experience level, each true to the facts given. Never invent numbers. No financial advice, no promise of profit. No greeting, no preamble.",
      prompt: `Nudge type: ${trigger.kind}\nFacts: ${trigger.facts}\n\nWrite each version:\n- beginner: ${LEVEL_HINT.beginner}\n- intermediate: ${LEVEL_HINT.intermediate}\n- advanced: ${LEVEL_HINT.advanced}\n- pro: ${LEVEL_HINT.pro}`,
      providerOptions: { anthropic: { thinking: { type: "adaptive" }, effort: "low" } },
    });
    return object;
  } catch (e) {
    console.error("nudge composition failed, falling back to plain facts", e);
    const fallback = trigger.facts;
    return { beginner: fallback, intermediate: fallback, advanced: fallback, pro: fallback };
  }
}

/** One nudge per user, at most one every 8 hours. Returns how many were sent. */
export async function sendCoachNudges(admin: Admin, ctx: NudgeContext): Promise<number> {
  const { isFeatureEnabled } = await import("./platform.server");
  if (!(await isFeatureEnabled(admin, "coach"))) return 0;

  const trigger = detectTrigger(ctx);
  if (!trigger) return 0;

  // Paying subscribers only — a trial ('trialing') is every new signup by
  // default, so including it here would call the model on nothing more than
  // an account existing, not on anyone actually paying for the coach.
  const { data: subs } = await admin
    .from("subscriptions")
    .select("user_id,tier,status")
    .in("tier", ["pro", "elite"])
    .eq("status", "active");
  const users = ((subs ?? []) as { user_id: string }[]).map((s) => s.user_id);
  if (!users.length) return 0;

  const since = new Date(Date.now() - 8 * 3600_000).toISOString();
  const { data: recent } = await admin
    .from("coach_nudges")
    .select("user_id")
    .neq("severity", "briefing")
    .gt("created_at", since);
  const recentSet = new Set(((recent ?? []) as { user_id: string }[]).map((r) => r.user_id));
  const eligible = users.filter((u) => !recentSet.has(u));
  if (!eligible.length) return 0;

  const variants = await composeNudgeVariants(trigger);

  const { data: profiles } = await admin
    .from("coach_profile")
    .select("user_id,experience_level")
    .in("user_id", eligible);
  const levelByUser = new Map(
    ((profiles ?? []) as { user_id: string; experience_level: Level | null }[]).map((p) => [
      p.user_id,
      p.experience_level ?? "beginner",
    ]),
  );

  const rows = eligible.map((u) => ({
    user_id: u,
    title: trigger.title,
    body: variants[levelByUser.get(u) ?? "beginner"],
    severity: trigger.severity,
  }));
  const { data: inserted } = await admin.from("coach_nudges").insert(rows).select("id,user_id,title,body");

  // Best-effort: reach the user where alerts already reach them. A coaching
  // moment nobody sees isn't coaching — this is the whole point of the upgrade.
  const { deliverAlert } = await import("./alert-delivery.server");
  for (const row of (inserted ?? []) as { id: string; user_id: string; title: string; body: string }[]) {
    try {
      await deliverAlert(admin, {
        userId: row.user_id,
        alertId: row.id,
        historyId: null,
        channels: ["telegram", "email"],
        title: `Flux · ${row.title}`,
        message: row.body,
        payload: { kind: "coach_nudge" },
      });
    } catch (e) {
      console.error("nudge delivery failed", row.user_id, e);
    }
  }

  return rows.length;
}
