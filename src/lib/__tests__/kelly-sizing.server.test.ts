import { describe, expect, it } from "vitest";
import { computeSuggestedSizing } from "../kelly-sizing.server";
import { FakeDb } from "./helpers/fake-db";

function seedOutcomes(db: FakeDb, wins: number, losses: number, winPct = 8, lossPct = 4) {
  const now = new Date().toISOString();
  const rows = [
    ...Array.from({ length: wins }, () => ({ hit: true, forward_return_pct: winPct, signal_type: "flux_score", horizon_hours: 24, resolved_at: now })),
    ...Array.from({ length: losses }, () => ({ hit: false, forward_return_pct: -lossPct, signal_type: "flux_score", horizon_hours: 24, resolved_at: now })),
  ];
  db.seed("signal_outcomes", rows);
}

// hitProbability was previously unclamped (mlProb ?? stats.winRate, shown
// directly to users and fed into the rationale text) — fixed earlier this
// session by clamping to 0..1. loadWinLossStats itself can only ever
// produce a winRate within 0..1 by construction (wins/(wins+losses)), so
// this suite exercises the function end-to-end through a fake DB to confirm
// the real, wired-up path behaves as expected — not just the isolated
// clamp math already verified by reading the code.
describe("computeSuggestedSizing", () => {
  it("returns insufficient-data output below the minimum sample size", async () => {
    const db = new FakeDb();
    seedOutcomes(db, 2, 1); // well under MIN_SAMPLES
    const r = await computeSuggestedSizing(db as never, { score: 80, regime: null });
    expect(r.edge).toBe("unclear");
    expect(r.suggestedSizePct).toBe(0);
  });

  it("keeps hitProbability within 0..1 and suggests a positive size for a real, measured edge", async () => {
    const db = new FakeDb();
    seedOutcomes(db, 40, 10, 10, 4); // 80% hit rate, wins bigger than losses — a real edge
    const r = await computeSuggestedSizing(db as never, { score: 85, regime: null });
    expect(r.hitProbability).toBeGreaterThanOrEqual(0);
    expect(r.hitProbability).toBeLessThanOrEqual(1);
    expect(r.edge).toBe("positive");
    expect(r.suggestedSizePct).toBeGreaterThan(0);
    expect(r.fullKellyFraction).toBeGreaterThanOrEqual(0);
    expect(r.fullKellyFraction).toBeLessThanOrEqual(1);
  });

  it("suggests zero size and a negative edge when the measured hit rate doesn't support one", async () => {
    const db = new FakeDb();
    seedOutcomes(db, 10, 40, 4, 10); // 20% hit rate, losses bigger than wins
    const r = await computeSuggestedSizing(db as never, { score: 40, regime: null });
    expect(r.hitProbability).toBeGreaterThanOrEqual(0);
    expect(r.hitProbability).toBeLessThanOrEqual(1);
    expect(r.edge).toBe("negative");
    expect(r.suggestedSizePct).toBe(0);
  });
});
