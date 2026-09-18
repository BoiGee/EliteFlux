// Background-run bookkeeping: one lock row per job so overlapping cron
// invocations can't double-fire alerts, plus a durable summary of each run
// so a partial or failed cycle is visible instead of silent.

type Admin = { from: (t: string) => any };

const STALE_RUN_MS = 10 * 60 * 1000;

export interface RunHandle {
  id: string;
}

/** Claim the lock for `job`. Returns null when another run holds it. */
export async function beginRun(admin: Admin, job: string): Promise<RunHandle | null> {
  // Release a lock left behind by a crashed/timed-out run.
  const cutoff = new Date(Date.now() - STALE_RUN_MS).toISOString();
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
  if (error || !data) {
    // TEMPORARY diagnostic: system_runs has recorded zero rows of any kind
    // since 2026-08-08, across every job, on this Cloudflare deployment,
    // despite an identical raw insert succeeding outside the app. This
    // surfaces the actual swallowed error so the real cause is visible
    // instead of every caller silently treating it as "lock contention".
    console.error(`[beginRun] insert failed for job=${job}`, JSON.stringify(error), "data:", JSON.stringify(data));
    return null;
  }
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

  await admin
    .from("system_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      evaluated: summary.evaluated ?? 0,
      fired: summary.fired ?? 0,
      errors: summary.errors ?? 0,
      detail: (summary.detail as never) ?? null,
    })
    .eq("id", handle.id);

  if (status === "failed") {
    const { data: row } = await admin.from("system_runs").select("job").eq("id", handle.id).maybeSingle();
    const job = (row as { job?: string } | null)?.job;
    if (job) {
      const { notifyOperatorsOfFailure } = await import("./platform.server");
      await notifyOperatorsOfFailure(admin, job, summary.detail);
    }
  }
}

