// Background-run bookkeeping: one lock row per job so overlapping cron
// invocations can't double-fire alerts, plus a durable summary of each run
// so a partial or failed cycle is visible instead of silent.

type Admin = { from: (t: string) => any };

const STALE_RUN_MS = 10 * 60 * 1000;

export interface RunHandle {
  id: string;
}

/**
 * Claim the lock for `job`. Returns null when another run holds it.
 *
 * staleMs defaults to 10 minutes, generous enough for the slowest real job
 * here (evaluate-alerts, whose sequential withTimeout-wrapped stages can
 * legitimately add up to a few minutes worst-case) without misclassifying
 * genuine slow progress as a crash. evaluate-alerts-fast overrides this
 * tighter (see its call site) — it deliberately skips the heavy learning/
 * coach machinery and has never legitimately taken more than a few seconds,
 * so a stuck lock there is always a crash, never real work in progress, and
 * the default 10-minute recovery window means up to 10 missed 1-minute
 * cycles before it self-heals. Confirmed live: a deploy landing mid-flight
 * on this exact job left it locked in "running" for the full 10 minutes
 * (this is a real, recurring pattern — the same thing happened repeatedly
 * on 2026-09-18 during earlier debugging), which is what first surfaced
 * this asymmetry.
 */
export async function beginRun(admin: Admin, job: string, staleMs = STALE_RUN_MS): Promise<RunHandle | null> {
  // Release a lock left behind by a crashed/timed-out run.
  const cutoff = new Date(Date.now() - staleMs).toISOString();
  await admin
    .from("system_runs")
    .update({ status: "stale", finished_at: new Date().toISOString() })
    .eq("job", job)
    .eq("status", "running")
    .lt("started_at", cutoff);

  const { data, error } = await admin
    .from("system_runs")
    .insert({ job, status: "running" })
    .select("id")
    .maybeSingle();

  // Unique partial index on (job) WHERE status='running' rejects concurrent runs.
  if (error || !data) return null;
  return { id: data.id as string };
}

export async function finishRun(
  admin: Admin,
  handle: RunHandle,
  summary: {
    /** "skipped" = the cycle stood down (e.g. no fresh data): degraded, not failed. */
    status?: "ok" | "failed" | "skipped";
    evaluated?: number;
    fired?: number;
    errors?: number;
    detail?: unknown;
  },
): Promise<void> {
  const status = summary.status ?? "ok";

  // Previously unchecked: an update() that fails server-side (RLS, a bad
  // constraint, anything) resolves without throwing, same as a successful
  // one — the caller's own mark()/log right after this call would fire
  // either way, making a silently-failed finishRun look identical to a
  // real one in the logs. Confirmed live: jobs reached this call, logged
  // past it, and the row was still "running" with finished_at still null
  // minutes later. Logging the error here doesn't fix why it fails, but it
  // stops that failure from being invisible.
  const { error, data } = await admin
    .from("system_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      evaluated: summary.evaluated ?? 0,
      fired: summary.fired ?? 0,
      errors: summary.errors ?? 0,
      detail: (summary.detail as never) ?? null,
    })
    .eq("id", handle.id)
    .select("id");
  if (error) {
    console.error(`finishRun: update failed for run ${handle.id}`, error);
  } else if (!data || (Array.isArray(data) && data.length === 0)) {
    console.error(`finishRun: update matched no row for run ${handle.id} (already overwritten by stale-cleanup?)`);
  }

  if (status === "failed") {
    const { data: row } = await admin.from("system_runs").select("job").eq("id", handle.id).maybeSingle();
    const job = (row as { job?: string } | null)?.job;
    if (job) {
      const { notifyOperatorsOfFailure } = await import("./platform.server");
      await notifyOperatorsOfFailure(admin, job, summary.detail);
    }
  }
}

