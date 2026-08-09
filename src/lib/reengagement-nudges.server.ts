// ============================================================
// Re-Engagement Nudges
// ------------------------------------------------------------
// The one per-user signal `profiles.last_active_at` exists for:
// detect a pro/elite user who's gone quiet and nudge them back,
// the same way market-driven coach nudges already reach people
// (coach_nudges + Telegram/email). Static per-level copy, not
// LLM-composed — there's no market fact to weave in here, so
// keeping this cheap and failure-free matters more than variety.
// ============================================================
type Admin = { from: (t: string) => any };

const LEVELS = ["beginner", "intermediate", "advanced", "pro"] as const;
type Level = (typeof LEVELS)[number];

const INACTIVITY_DAYS = 5; // no coach activity in this long = "gone quiet"
const COOLDOWN_DAYS = 7; // at most one nudge (of any kind) per week per user

const COPY: Record<Level, { title: string; body: string }> = {
  beginner: {
    title: "It's been a few days",
    body: "Markets keep moving even when you're not watching. Pop back into EliteFlux for a quick read on where things stand — no pressure, just a look.",
  },
  intermediate: {
    title: "A few days quiet",
    body: "Regime, flux score and your watchlist have all moved since your last visit. Worth a quick check-in.",
  },
  advanced: {
    title: "Been a minute",
    body: "Several days since your last session — regime and conviction levels have shifted. Worth a look before you're too far behind the tape.",
  },
  pro: {
    title: "Re-sync",
    body: "Multi-day gap since last active. Regime/flux/positioning have moved. Recommend a quick re-sync.",
  },
};

/** Nudges pro/elite users who've gone quiet. Returns how many were sent. */
export async function sendReengagementNudges(admin: Admin): Promise<number> {
  const inactiveSince = new Date(Date.now() - INACTIVITY_DAYS * 86400_000).toISOString();
  const cooldownSince = new Date(Date.now() - COOLDOWN_DAYS * 86400_000).toISOString();

  const { data: subs } = await admin
    .from("subscriptions")
    .select("user_id")
    .in("tier", ["pro", "elite"])
    .in("status", ["active", "trialing"]);
  const userIds = ((subs ?? []) as { user_id: string }[]).map((s) => s.user_id);
  if (!userIds.length) return 0;

  // Only users with at least one recorded active timestamp that's now stale —
  // never-tracked users (null) are excluded so rollout day doesn't nudge everyone.
  const { data: profiles } = await admin
    .from("profiles")
    .select("id")
    .in("id", userIds)
    .not("last_active_at", "is", null)
    .lt("last_active_at", inactiveSince);
  const candidates = ((profiles ?? []) as { id: string }[]).map((p) => p.id);
  if (!candidates.length) return 0;

  const { data: recent } = await admin.from("coach_nudges").select("user_id").in("user_id", candidates).gt("created_at", cooldownSince);
  const recentSet = new Set(((recent ?? []) as { user_id: string }[]).map((r) => r.user_id));
  const eligible = candidates.filter((id) => !recentSet.has(id));
  if (!eligible.length) return 0;

  const { data: levelRows } = await admin.from("coach_profile").select("user_id,experience_level").in("user_id", eligible);
  const levelByUser = new Map(
    ((levelRows ?? []) as { user_id: string; experience_level: Level | null }[]).map((p) => [p.user_id, p.experience_level ?? "beginner"]),
  );

  const rows = eligible.map((userId) => {
    const copy = COPY[levelByUser.get(userId) ?? "beginner"];
    return { user_id: userId, title: copy.title, body: copy.body, severity: "info" as const };
  });
  const { data: inserted } = await admin.from("coach_nudges").insert(rows).select("id,user_id,title,body");

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
        payload: { kind: "reengagement_nudge" },
      });
    } catch (e) {
      console.error("reengagement nudge delivery failed", row.user_id, e);
    }
  }

  return rows.length;
}
