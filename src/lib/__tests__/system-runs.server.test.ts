import { describe, expect, it } from "vitest";
import { beginRun } from "../system-runs.server";
import { FakeDb } from "./helpers/fake-db";

const JOB = "evaluate-alerts-fast";

function seedStuckRun(ageMs: number): FakeDb {
  const db = new FakeDb();
  db.seed("system_runs", [
    {
      id: "stuck-1",
      job: JOB,
      status: "running",
      started_at: new Date(Date.now() - ageMs).toISOString(),
      finished_at: null,
    },
  ]);
  return db;
}

// evaluate-alerts-fast overrides beginRun's default 10-minute stale-recovery
// window down to 3 minutes (jobs.server.ts) — this job has never
// legitimately taken more than a few seconds, so a stuck lock is always a
// crash, and the default window meant up to 10 missed 1-minute cycles
// before self-healing. Confirmed live: a deploy landing mid-flight left a
// real run stuck in "running" for the full 10 minutes before this fix.
describe("beginRun staleMs override", () => {
  it("releases a stuck lock older than a custom (tighter) staleMs", async () => {
    const db = seedStuckRun(4 * 60 * 1000); // 4 minutes old
    await beginRun(db as never, JOB, 3 * 60 * 1000); // tighter than default

    const stuck = db.rows("system_runs").find((r) => r.id === "stuck-1") as { status: string } | undefined;
    expect(stuck?.status).toBe("stale");
  });

  it("does not release a lock younger than the given staleMs", async () => {
    const db = seedStuckRun(2 * 60 * 1000); // 2 minutes old
    await beginRun(db as never, JOB, 3 * 60 * 1000); // still under the 3min threshold

    const stuck = db.rows("system_runs").find((r) => r.id === "stuck-1") as { status: string } | undefined;
    expect(stuck?.status).toBe("running");
  });

  it("the same lock age is treated differently under the tight override vs. the default", async () => {
    const ageMs = 4 * 60 * 1000; // 4 minutes old — past the tight 3min override, well under the 10min default

    const tight = seedStuckRun(ageMs);
    await beginRun(tight as never, JOB, 3 * 60 * 1000);
    expect((tight.rows("system_runs").find((r) => r.id === "stuck-1") as { status: string }).status).toBe("stale");

    const loose = seedStuckRun(ageMs);
    await beginRun(loose as never, JOB); // default 10-minute staleMs
    expect((loose.rows("system_runs").find((r) => r.id === "stuck-1") as { status: string }).status).toBe("running");
  });
});
