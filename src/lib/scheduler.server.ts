// Server-only: in-process scheduler for the background engine. Runs the
// alert/coach/autopilot cycle, subscription expiry and payment settlement on
// a timer for as long as this server process is alive.
//
// This works because the app currently runs as a persistent Node/Bun process
// (`bun run dev`, or any long-running host). It does NOT work on Cloudflare
// Workers or other request-scoped edge runtimes — isolates there aren't
// guaranteed to keep running after a response is sent, so `setInterval`
// silently stops firing. If this ever deploys to Workers, replace this file
// with a Cloudflare Cron Trigger (wrangler.toml `[triggers] crons = [...]`)
// that calls the /api/public/* routes on a schedule instead.
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

export function startScheduler(): void {
  const g = globalThis as unknown as { __eliteFluxSchedulerStarted?: boolean };
  if (g.__eliteFluxSchedulerStarted) return;
  g.__eliteFluxSchedulerStarted = true;

  const tickEvaluateAlerts = () =>
    void runJob("evaluate-alerts", async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await runEvaluateAlertsJob(supabaseAdmin as never);
    });

  const tickSettlePayments = () =>
    void runJob("settle-payments", async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await runSettlePaymentsJob(supabaseAdmin as never);
    });

  const tickExpireSubs = () =>
    void runJob("expire-subs", async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await runExpireSubsJob(supabaseAdmin as never);
    });

  const tickFastAlerts = () =>
    void runJob("evaluate-alerts-fast", async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await runFastAlertsJob(supabaseAdmin as never);
    });

  const tickRetentionCleanup = () =>
    void runJob("retention-cleanup", async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await runRetentionCleanupJob(supabaseAdmin as never);
    });

  setTimeout(() => {
    tickEvaluateAlerts();
    setInterval(tickEvaluateAlerts, EVALUATE_ALERTS_INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS);

  setTimeout(() => {
    tickFastAlerts();
    setInterval(tickFastAlerts, FAST_ALERTS_INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS + 20_000);

  setTimeout(() => {
    tickSettlePayments();
    setInterval(tickSettlePayments, SETTLE_PAYMENTS_INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS + 5_000);

  setTimeout(() => {
    tickExpireSubs();
    setInterval(tickExpireSubs, EXPIRE_SUBS_INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS + 10_000);

  setTimeout(() => {
    tickRetentionCleanup();
    setInterval(tickRetentionCleanup, RETENTION_CLEANUP_INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS + 15_000);

  console.log(
    "[scheduler] started — evaluate-alerts every 5min, fast-lane alerts every 60s, settle-payments hourly, expire-subs every 12h, retention-cleanup daily",
  );
}
