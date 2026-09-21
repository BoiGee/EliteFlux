import { describe, expect, it } from "vitest";
import { applyKellySizing, executeAction, recordCandidate } from "../autopilot.server";
import { DEFAULT_SETTINGS, type AutopilotSettings } from "../autonomy";
import type { Candidate, PortfolioView } from "../autopilot-engine";
import { FakeDb } from "./helpers/fake-db";

const USER_ID = "user-1";
const ACTION_ID = "action-1";

function seedHappyPath(): FakeDb {
  const db = new FakeDb();
  db.seed("autopilot_settings", [{ user_id: USER_ID, ...DEFAULT_SETTINGS, peak_portfolio_usd: null }]);
  db.seed("autopilot_actions", [
    {
      id: ACTION_ID,
      user_id: USER_ID,
      kind: "buy",
      symbol: "BTC",
      notional_usd: 200,
      reference_price: 60_000,
      conviction: 85,
      size_pct: 5,
      rationale: "test",
      state: "proposed",
    },
  ]);
  db.seed("portfolio_holdings", [{ user_id: USER_ID, symbol: "USDT", amount: 5000, usd_value: 5000 }]);
  return db;
}

// executeAction's own code comment names the exact reason its atomic claim
// step (state -> 'executing' via an UPDATE ... WHERE state IN
// ('proposed','approved')) exists: two concurrent calls on the same action
// — a double-clicked Approve button, or a manual retry racing a scheduled
// run — must not both re-check guardrails and both place an order. This
// property has never been tested despite being the specific safety
// mechanism a critical bug this session (action_state missing 'executing'
// from its enum entirely) was found inside of.
const settings: AutopilotSettings = {
  ...DEFAULT_SETTINGS,
  user_id: USER_ID,
  disclosure_accepted_at: null,
  armed_at: null,
  disarmed_reason: null,
  peak_portfolio_usd: null,
};

const tinyPortfolio: PortfolioView = { totalUsd: 10.03, stableUsd: 10.03, positions: [] };

const avaxBuy: Candidate = {
  kind: "buy",
  symbol: "AVAX",
  conviction: 94,
  notionalUsd: 2.5,
  sizePct: 25,
  referencePrice: 30,
  rationale: "test",
};

// Reproduces the real production incident directly: a too-small account
// (~$10 stable) whose sized-down buy always lands under min_order_size,
// blocked every single guardrail-check cycle. Before this fix, a blocked
// row never counted as "already pending," so proposeActions + recordCandidate
// re-created an identical blocked row every cron cycle indefinitely.
describe("recordCandidate dedup", () => {
  it("does not re-propose a symbol with an unexpired blocked action already on file", async () => {
    const db = new FakeDb();
    db.seed("autopilot_actions", [
      {
        id: "existing-blocked",
        user_id: USER_ID,
        kind: "buy",
        symbol: "AVAX",
        state: "blocked",
        blocked_reason: "min_order_size: 2.51 USD after caps",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      },
    ]);

    const result = await recordCandidate(db as never, USER_ID, avaxBuy, settings, tinyPortfolio);

    expect(result.id).toBe("existing-blocked");
    expect(result.state).toBe("blocked");
    expect(db.rows("autopilot_actions")).toHaveLength(1);
  });

  it("does propose again once the previous blocked action has expired", async () => {
    const db = new FakeDb();
    db.seed("autopilot_actions", [
      {
        id: "stale-blocked",
        user_id: USER_ID,
        kind: "buy",
        symbol: "AVAX",
        state: "blocked",
        blocked_reason: "min_order_size: 2.51 USD after caps",
        expires_at: new Date(Date.now() - 1000).toISOString(),
      },
    ]);

    const result = await recordCandidate(db as never, USER_ID, avaxBuy, settings, tinyPortfolio);

    expect(result.id).not.toBe("stale-blocked");
    expect(db.rows("autopilot_actions")).toHaveLength(2);
  });

  it("still blocks a genuinely too-small buy with the same reason as production", async () => {
    const db = new FakeDb();
    const result = await recordCandidate(db as never, USER_ID, avaxBuy, settings, tinyPortfolio);

    expect(result.state).toBe("blocked");
    expect(result.blockedReason).toContain("min_order_size");
  });
});

function seedStrongEdge(db: FakeDb) {
  // Mirrors kelly-sizing.server.test.ts's "keeps hitProbability within 0..1
  // and suggests a positive size for a real, measured edge" seed exactly:
  // 80% hit rate, wins 10% avg vs losses 4% avg — strong enough to hit
  // MAX_SUGGESTED_SIZE_PCT's 10% hard cap (see kelly-sizing.server.ts).
  const now = new Date().toISOString();
  db.seed("signal_outcomes", [
    ...Array.from({ length: 40 }, () => ({ hit: true, forward_return_pct: 10, signal_type: "flux_score", horizon_hours: 24, resolved_at: now })),
    ...Array.from({ length: 10 }, () => ({ hit: false, forward_return_pct: -4, signal_type: "flux_score", horizon_hours: 24, resolved_at: now })),
  ]);
}

const btcBuyCandidate: Candidate = {
  kind: "buy",
  symbol: "BTC",
  conviction: 85,
  notionalUsd: 20, // proposeActions' own flat sizing: 40% guardrail of $50
  sizePct: 40,
  referencePrice: 64_000,
  rationale: "BTC scores 85 in accumulation phase. Adding a 40% starter position.",
};

// Reproduces the real follow-up to the min_order_size fix: MAX_SUGGESTED_SIZE_PCT
// hard-caps Kelly's own suggestion at 10% regardless of edge strength, so for
// any account under roughly $60, 10% of totalUsd lands below MIN_ORDER_USD —
// meaning a genuinely positive, strongly-measured edge could never clear the
// exchange-minimum floor no matter what. Confirmed live on a real $50 account.
describe("applyKellySizing rounds up to the minimum order size", () => {
  it("rounds a positive-edge proposal up to MIN_ORDER_USD instead of leaving it stuck below it", async () => {
    const db = new FakeDb();
    seedStrongEdge(db);
    const portfolio: PortfolioView = { totalUsd: 50, stableUsd: 50, positions: [] };

    const [out] = await applyKellySizing(db as never, USER_ID, portfolio, null, [btcBuyCandidate]);

    expect(out).toBeDefined();
    // Kelly's own ideal (10% of $50 = $5) is below MIN_ORDER_USD; confirm
    // the result is the rounded-up figure, not the raw Kelly suggestion,
    // and not the original flat 40% guardrail sizing either.
    expect(out!.notionalUsd).toBeGreaterThanOrEqual(6);
    expect(out!.sizePct).toBeGreaterThan(10);
    expect(out!.sizePct).toBeLessThan(40);
    expect(out!.rationale).toContain("rounded up");
  });

  it("never rounds up past the original guardrail ceiling, even when that ceiling can't reach the minimum order size", async () => {
    const db = new FakeDb();
    seedStrongEdge(db);
    // 40% of a $10 account is $4 — below MIN_ORDER_USD even at the
    // candidate's own guardrail-derived sizePct, so rounding up must not
    // exceed that ceiling (checkGuardrails' min_order_size check still
    // correctly blocks this downstream, same as before this change).
    const portfolio: PortfolioView = { totalUsd: 10, stableUsd: 10, positions: [] };
    const candidate: Candidate = { ...btcBuyCandidate, notionalUsd: 4, sizePct: 40 };

    const [out] = await applyKellySizing(db as never, USER_ID, portfolio, null, [candidate]);

    expect(out).toBeDefined();
    expect(out!.sizePct).toBeLessThanOrEqual(40);
    expect(out!.notionalUsd).toBeLessThan(6);
  });
});

// A signal the platform hasn't measured enough outcomes for yet (edge:
// "unclear") previously fell through untouched, at the full flat guardrail
// size — meaning a completely unvalidated signal could size up to a user's
// full 40% ceiling, larger than a signal the platform HAD confirmed was
// genuinely good (capped at 10%). Backwards from what disciplined,
// measured sizing should mean.
describe("applyKellySizing caps an unvalidated (unclear-edge) signal", () => {
  it("caps an insufficient-data signal at the same ceiling positive-edge sizing itself never exceeds", async () => {
    const db = new FakeDb(); // no signal_outcomes seeded at all -> insufficient data -> edge "unclear"
    const portfolio: PortfolioView = { totalUsd: 50, stableUsd: 50, positions: [] };

    const [out] = await applyKellySizing(db as never, USER_ID, portfolio, null, [btcBuyCandidate]);

    expect(out).toBeDefined();
    expect(out!.sizePct).toBe(10);
    expect(out!.notionalUsd).toBe(5);
    expect(out!.rationale).toContain("Not enough measured outcomes");
  });

  it("leaves a candidate whose guardrail sizePct is already at or below the cap untouched", async () => {
    const db = new FakeDb();
    const portfolio: PortfolioView = { totalUsd: 50, stableUsd: 50, positions: [] };
    const conservative: Candidate = { ...btcBuyCandidate, sizePct: 5, notionalUsd: 2.5 };

    const [out] = await applyKellySizing(db as never, USER_ID, portfolio, null, [conservative]);

    expect(out).toBeDefined();
    expect(out!.sizePct).toBe(5);
    expect(out!.rationale).not.toContain("Not enough measured outcomes");
  });
});

describe("executeAction claim race", () => {
  it("lets exactly one of two concurrent calls on the same action proceed", async () => {
    const db = seedHappyPath();
    const [a, b] = await Promise.all([
      executeAction(db as never, USER_ID, ACTION_ID),
      executeAction(db as never, USER_ID, ACTION_ID),
    ]);

    const results = [a, b];
    const winners = results.filter((r) => r.ok);
    const losers = results.filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]?.error).toContain("already being processed");

    // Only one autopilot_actions row exists for this action, and it must
    // have moved out of the claimable states — a real double-order bug
    // would show up here as either two executed rows or the row bouncing
    // back to a claimable state.
    const row = db.rows("autopilot_actions").find((r) => r.id === ACTION_ID) as { state: string } | undefined;
    expect(row).toBeDefined();
    expect(["proposed", "approved"]).not.toContain(row!.state);
  });

  it("a third call after the action has already resolved also gets rejected, not re-executed", async () => {
    const db = seedHappyPath();
    const first = await executeAction(db as never, USER_ID, ACTION_ID);
    expect(first.ok).toBe(true);

    const second = await executeAction(db as never, USER_ID, ACTION_ID);
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/already/);
  });
});

describe("executeAction platform controls", () => {
  it("refuses execution when the platform-wide kill switch is on, before claiming the action", async () => {
    const db = seedHappyPath();
    db.seed("platform_settings", [{ key: "autopilot_kill_switch", value: true }]);

    const result = await executeAction(db as never, USER_ID, ACTION_ID);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/platform/i);

    // Must not have claimed the action — a later legitimate attempt (once
    // the kill switch is lifted) should still be able to run it.
    const row = db.rows("autopilot_actions").find((r) => r.id === ACTION_ID) as { state: string } | undefined;
    expect(row?.state).toBe("proposed");
  });

  it("refuses execution when the user's own kill switch is on", async () => {
    const db = seedHappyPath();
    db.seed("autopilot_settings", [{ user_id: USER_ID, ...DEFAULT_SETTINGS, kill_switch: true, peak_portfolio_usd: null }]);

    const result = await executeAction(db as never, USER_ID, ACTION_ID);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/kill switch/i);
  });
});

describe("executeAction paper mode", () => {
  it("fills a well-formed, guardrail-clearing buy in paper mode without touching a real exchange", async () => {
    const db = seedHappyPath();
    const result = await executeAction(db as never, USER_ID, ACTION_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect((result as { paper?: boolean }).paper).toBe(true);

    const row = db.rows("autopilot_actions").find((r) => r.id === ACTION_ID) as { state: string; paper: boolean } | undefined;
    expect(row?.state).toBe("executed");
    expect(row?.paper).toBe(true);
  });
});
