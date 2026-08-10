import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CRON_JOBS } from "../scheduler.server";

/**
 * wrangler.jsonc's triggers.crons and scheduler.server.ts's CRON_JOBS are two
 * hand-maintained lists that must name the exact same cron patterns — nothing
 * enforces that automatically. An unmatched pattern is silently dropped (see
 * runScheduledTick's console.error-and-return), so drift here means a
 * background job quietly stops running with no crash and no alert.
 */
function readWranglerCrons(): string[] {
  const raw = readFileSync(path.resolve(__dirname, "../../../wrangler.jsonc"), "utf8");
  // Strip // line comments — safe here since no string value in this file contains "//".
  const stripped = raw.replace(/\/\/.*$/gm, "");
  const parsed = JSON.parse(stripped) as { triggers?: { crons?: string[] } };
  return parsed.triggers?.crons ?? [];
}

describe("cron dispatch stays in sync with wrangler.jsonc", () => {
  it("has exactly one CRON_JOBS entry per registered cron trigger", () => {
    const registered = readWranglerCrons();
    expect(registered.length).toBeGreaterThan(0);
    expect(Object.keys(CRON_JOBS).sort()).toEqual([...registered].sort());
  });
});
