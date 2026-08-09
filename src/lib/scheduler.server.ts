// Server-only: runs the alert/coach/autopilot cycle, subscription expiry and
// payment settlement jobs.
//
// Two ways this fires, depending on where the server process runs:
//   - `startScheduler()` — an in-process setInterval loop, for a persistent
//     Node/Bun process (local dev). Cloudflare Workers isolates aren't
//     guaranteed to keep running after a response is sent, so setInterval
//     silently stops firing there — worse, calling it at module top level
//     throws ("Disallowed operation called within global scope").
//   - `runScheduledTick(cron)` — invoked from the Workers `scheduled` handler
//     (see server.ts) via Cloudflare Cron Triggers (wrangler.jsonc
//     `triggers.crons`), one job per registered cron pattern.
import {
  runEvaluateAlertsJob,
  runExpireSubsJob,
  runFastAlertsJob,
  runRetentionCleanupJob,
  runSettlePaymentsJob,
} from "./jobs.server";

const EVALUATE_ALERTS_INTERVAL_MS = 5 * 60_000; // health panel expects this job every <=20min
const SETTLE_PAYMENTS_INTERVAL_MS = 60 * 60_000; // expects <=120min
const EXPIRE_SUBS_INTERVAL_MS = 12 * 60 * 60_000; // expects <=1500min (~25h)
const FAST_ALERTS_INTERVAL_MS = 60_000; // momentum/exit-pressure/price alerts can't wait 5 minutes
const RETENTION_CLEANUP_INTERVAL_MS = 24 * 60 * 60_000; // expects <=1500min (~25h) — daily housekeeping

const FIRST_RUN_DELAY_MS = 15_000; // let the dev server settle before the first tick

async function runJob(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error(`[scheduler] ${name} failed`, e);
  }
}

async function withAdmin(fn: (admin: never) => Promise<unknown>): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await fn(supabaseAdmin as never);
}

const tickEvaluateAlerts = () => runJob("evaluate-alerts", () => withAdmin(runEvaluateAlertsJob));
const tickSettlePayments = () => runJob("settle-payments", () => withAdmin(runSettlePaymentsJob));
const tickExpireSubs = () => runJob("expire-subs", () => withAdmin(runExpireSubsJob));
const tickFastAlerts = () => runJob("evaluate-alerts-fast", () => withAdmin(runFastAlertsJob));
const tickRetentionCleanup = () => runJob("retention-cleanup", () => withAdmin(runRetentionCleanupJob));

/** Local dev only (persistent Node/Bun process) — see runScheduledTick for Workers. */
export function startScheduler(): void {
  const g = globalThis as unknown as { __eliteFluxSchedulerStarted?: boolean };
  if (g.__eliteFluxSchedulerStarted) return;
  g.__eliteFluxSchedulerStarted = true;

  setTimeout(() => {
    void tickEvaluateAlerts();
    setInterval(tickEvaluateAlerts, EVALUATE_ALERTS_INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS);

  setTimeout(() => {
    void tickFastAlerts();
    setInterval(tickFastAlerts, FAST_ALERTS_INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS + 20_000);

  setTimeout(() => {
    void tickSettlePayments();
    setInterval(tickSettlePayments, SETTLE_PAYMENTS_INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS + 5_000);

  setTimeout(() => {
    void tickExpireSubs();
    setInterval(tickExpireSubs, EXPIRE_SUBS_INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS + 10_000);

  setTimeout(() => {
    void tickRetentionCleanup();
    setInterval(tickRetentionCleanup, RETENTION_CLEANUP_INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS + 15_000);

  console.log(
    "[scheduler] started — evaluate-alerts every 5min, fast-lane alerts every 60s, settle-payments hourly, expire-subs every 12h, retention-cleanup daily",
  );
}

// Each pattern must exactly match an entry in wrangler.jsonc's `triggers.crons`.
const CRON_JOBS: Record<string, () => Promise<void>> = {
  "* * * * *": tickFastAlerts,
  "*/5 * * * *": tickEvaluateAlerts,
  "0 * * * *": tickSettlePayments,
  "0 */12 * * *": tickExpireSubs,
  "0 3 * * *": tickRetentionCleanup,
};

/** Cloudflare Workers `scheduled` handler entry point — see server.ts. */
export async function runScheduledTick(cron: string): Promise<void> {
  const job = CRON_JOBS[cron];
  if (!job) {
    console.error(`[scheduler] no job registered for cron pattern: ${cron}`);
    return;
  }
  await job();
}
