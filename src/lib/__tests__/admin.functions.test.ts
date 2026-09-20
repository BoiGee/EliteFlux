import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EXPECTED_INTERVAL_MIN } from "../admin.functions";

/**
 * EXPECTED_INTERVAL_MIN (getSystemHealth's staleness threshold per job) is a
 * hand-maintained list that must track wrangler.jsonc's real cron cadence —
 * nothing enforces that automatically. Confirmed live: it had drifted badly
 * (evaluate-alerts at 20min instead of 5, evaluate-alerts-fast at 5min
 * instead of 1), which meant a genuinely stalled job could run 4x longer
 * than expected before the owner console's "Needs your attention" banner
 * ever flagged it. Mirrors scheduler.test.ts's wrangler.jsonc-sync pattern.
 */
function readWranglerCrons(): string[] {
  const raw = readFileSync(path.resolve(__dirname, "../../../wrangler.jsonc"), "utf8");
  const stripped = raw.replace(/\/\/.*$/gm, "");
  const parsed = JSON.parse(stripped) as { triggers?: { crons?: string[] } };
  return parsed.triggers?.crons ?? [];
}

/** Minutes between firings for the small set of simple cron shapes this project actually uses. */
function intervalMinutesFor(cron: string): number {
  if (cron === "* * * * *") return 1;
  const everyN = cron.match(/^\*\/(\d+) \* \* \* \*$/);
  if (everyN) return Number(everyN[1]);
  if (cron === "0 * * * *") return 60;
  const everyNHours = cron.match(/^0 \*\/(\d+) \* \* \*$/);
  if (everyNHours) return Number(everyNHours[1]) * 60;
  if (/^0 \d+ \* \* \*$/.test(cron)) return 1440;
  throw new Error(`intervalMinutesFor: unrecognized cron shape "${cron}" — extend this test's parser`);
}

const JOB_TO_CRON: Record<string, string> = {
  "evaluate-alerts-fast": "* * * * *",
  "evaluate-alerts": "*/5 * * * *",
  "settle-payments": "0 * * * *",
  "expire-subs": "0 */12 * * *",
  "retention-cleanup": "0 3 * * *",
};

describe("EXPECTED_INTERVAL_MIN stays in sync with the real cron schedule", () => {
  it("every registered cron trigger has a job mapped to it in this test", () => {
    const registered = readWranglerCrons();
    expect(registered.length).toBeGreaterThan(0);
    expect(Object.values(JOB_TO_CRON).sort()).toEqual([...registered].sort());
  });

  it("EXPECTED_INTERVAL_MIN's keys match JOB_TO_CRON's keys exactly", () => {
    expect(Object.keys(EXPECTED_INTERVAL_MIN).sort()).toEqual(Object.keys(JOB_TO_CRON).sort());
  });

  for (const [job, cron] of Object.entries(JOB_TO_CRON)) {
    it(`"${job}" (${cron}) has a matching expected interval`, () => {
      expect(EXPECTED_INTERVAL_MIN[job]).toBe(intervalMinutesFor(cron));
    });
  }
});
