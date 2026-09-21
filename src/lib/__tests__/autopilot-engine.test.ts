import { describe, expect, it } from "vitest";
import {
  checkGuardrails,
  isStable,
  proposeActions,
  proposeUrgentExits,
  type Candidate,
  type PortfolioView,
} from "../autopilot-engine";
import { DEFAULT_SETTINGS, type Guardrails } from "../autonomy";
import type { EliteOpportunity } from "../recommendation-engine";
import type { ExitAssetSignal } from "../exit-intel";

const guardrails: Guardrails = {
  max_trade_pct: DEFAULT_SETTINGS.max_trade_pct,
  max_trade_usd: DEFAULT_SETTINGS.max_trade_usd,
  max_trades_per_day: DEFAULT_SETTINGS.max_trades_per_day,
  max_daily_usd: DEFAULT_SETTINGS.max_daily_usd,
  min_conviction: DEFAULT_SETTINGS.min_conviction,
  cooldown_hours: DEFAULT_SETTINGS.cooldown_hours,
  drawdown_breaker_pct: DEFAULT_SETTINGS.drawdown_breaker_pct,
  allowed_symbols: [],
  blocked_symbols: [],
  stable_symbol: "USDT",
};

const portfolio: PortfolioView = {
  totalUsd: 10000,
  stableUsd: 4000,
  positions: [
    { symbol: "ETH", amount: 1, usdValue: 3000, weight: 30, pricingUnknown: false },
    { symbol: "SOL", amount: 10, usdValue: 1500, weight: 15, pricingUnknown: false },
  ],
};

const opp = (over: Partial<EliteOpportunity>): EliteOpportunity => {
  const score = over.score ?? 88;
  return {
    symbol: "BTC",
    price: 64000,
    score,
    calibratedScore: score,
    band: "High Conviction",
    stance: "Accumulation Phase",
    reasonTags: ["whales accumulating"],
    isHighRisk: false,
    ...over,
  } as EliteOpportunity;
};

const candidate = (over: Partial<Candidate>): Candidate => ({
  kind: "buy",
  symbol: "BTC",
  conviction: 85,
  notionalUsd: 500,
  sizePct: 5,
  referencePrice: 64000,
  rationale: "test",
  ...over,
});

describe("proposeActions", () => {
  it("never proposes trading a stablecoin", () => {
    expect(isStable("usdt")).toBe(true);
    const out = proposeActions([opp({ symbol: "USDT" })], portfolio, guardrails);
    expect(out).toHaveLength(0);
  });

  it("proposes a starter buy for high-conviction names not yet held", () => {
    const out = proposeActions([opp({})], portfolio, guardrails);
    expect(out[0]?.kind).toBe("buy");
    expect(out[0]?.symbol).toBe("BTC");
    expect(out[0]?.sizePct).toBe(guardrails.max_trade_pct);
  });

  it("never proposes a starter buy for a not-yet-held coin in High Risk / Unstable Phase, even at High Conviction band", () => {
    // Reproduces a real production case: a live blocked-action rationale
    // read "scores 61 in high risk / unstable phase ... Adding a 25% starter
    // position" — the same stance that forces a full exit on an already-held
    // position was, until this fix, still allowed to green-light buying in.
    const out = proposeActions(
      [opp({ symbol: "AVAX", band: "High Conviction", stance: "High Risk / Unstable Phase" as EliteOpportunity["stance"] })],
      portfolio,
      guardrails,
    );
    expect(out).toHaveLength(0);
  });

  it("still proposes a buy at High Conviction band for an unheld coin once the isHighRisk/unstable trigger is gone", () => {
    const out = proposeActions(
      [opp({ symbol: "AVAX", band: "High Conviction", stance: "Accumulation Phase" as EliteOpportunity["stance"] })],
      portfolio,
      guardrails,
    );
    expect(out[0]?.kind).toBe("buy");
    expect(out[0]?.symbol).toBe("AVAX");
  });

  it("skips buys for positions already sized in", () => {
    const heavy: PortfolioView = {
      ...portfolio,
      positions: [{ symbol: "BTC", amount: 1, usdValue: 5000, weight: 50, pricingUnknown: false }],
    };
    expect(proposeActions([opp({})], heavy, guardrails)).toHaveLength(0);
  });

  it("proposes a full exit for held high-risk names", () => {
    const out = proposeActions([opp({ symbol: "ETH", isHighRisk: true })], portfolio, guardrails);
    expect(out[0]?.kind).toBe("exit");
    expect(out[0]?.notionalUsd).toBe(3000);
  });

  it("proposes a partial trim on distribution", () => {
    const out = proposeActions(
      [opp({ symbol: "SOL", stance: "Distribution Phase" as EliteOpportunity["stance"] })],
      portfolio,
      guardrails,
    );
    expect(out[0]?.kind).toBe("trim");
    expect(out[0]?.notionalUsd).toBeCloseTo(1500 * 0.35);
  });

  it("ranks by conviction", () => {
    const out = proposeActions(
      [opp({ symbol: "BTC", score: 75 }), opp({ symbol: "LINK", score: 92 })],
      portfolio,
      guardrails,
    );
    expect(out.map((c) => c.symbol)).toEqual(["LINK", "BTC"]);
  });

  it("is unaffected when exitPerAsset is omitted (back-compat default)", () => {
    const out = proposeActions([opp({})], portfolio, guardrails);
    expect(out[0]?.kind).toBe("buy");
  });

  it("triggers a full exit on high exit-pressure alone, even with a neutral stance", () => {
    const exitPerAsset: Record<string, ExitAssetSignal | undefined> = {
      ETH: { exitPressureScore: 85 } as ExitAssetSignal,
    };
    const out = proposeActions([opp({ symbol: "ETH", stance: "Accumulation Phase" })], portfolio, guardrails, exitPerAsset);
    expect(out[0]?.kind).toBe("exit");
    expect(out[0]?.notionalUsd).toBe(3000);
  });

  it("triggers a trim on 'Reduce Exposure'-band exit-pressure alone", () => {
    const exitPerAsset: Record<string, ExitAssetSignal | undefined> = {
      SOL: { exitPressureScore: 65 } as ExitAssetSignal,
    };
    const out = proposeActions([opp({ symbol: "SOL", stance: "Accumulation Phase" })], portfolio, guardrails, exitPerAsset);
    expect(out[0]?.kind).toBe("trim");
  });

  it("does not trigger below the exit-pressure bands", () => {
    const exitPerAsset: Record<string, ExitAssetSignal | undefined> = {
      ETH: { exitPressureScore: 40 } as ExitAssetSignal,
    };
    const out = proposeActions([opp({ symbol: "ETH", stance: "Accumulation Phase" })], portfolio, guardrails, exitPerAsset);
    expect(out).toHaveLength(0);
  });
});

describe("proposeUrgentExits", () => {
  it("proposes a full exit for a held position at or above the High Exit Pressure band", () => {
    const exitPerAsset = { ETH: { exitPressureScore: 81, tags: ["Smart Money Distribution"] } as ExitAssetSignal };
    const out = proposeUrgentExits(portfolio, exitPerAsset, guardrails);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("exit");
    expect(out[0]?.symbol).toBe("ETH");
    expect(out[0]?.notionalUsd).toBe(3000);
    expect(out[0]?.sizePct).toBe(100);
    expect(out[0]?.rationale).toContain(guardrails.stable_symbol);
  });

  it("does not trigger below the High Exit Pressure band, even in Reduce-Exposure territory", () => {
    // Deliberately narrower than proposeActions: the fast lane only ever
    // does full exits (>=81), never trims — trims stay on the slower,
    // fully-synced cycle.
    const exitPerAsset = { ETH: { exitPressureScore: 80 } as ExitAssetSignal };
    expect(proposeUrgentExits(portfolio, exitPerAsset, guardrails)).toHaveLength(0);
    const midBand = { SOL: { exitPressureScore: 65 } as ExitAssetSignal };
    expect(proposeUrgentExits(portfolio, midBand, guardrails)).toHaveLength(0);
  });

  it("ignores symbols the user doesn't actually hold", () => {
    const exitPerAsset = { DOGE: { exitPressureScore: 95 } as ExitAssetSignal };
    expect(proposeUrgentExits(portfolio, exitPerAsset, guardrails)).toHaveLength(0);
  });

  it("never proposes exiting a stablecoin position", () => {
    const stableHeld: PortfolioView = {
      ...portfolio,
      positions: [...portfolio.positions, { symbol: "USDT", amount: 500, usdValue: 500, weight: 5, pricingUnknown: false }],
    };
    const exitPerAsset = { USDT: { exitPressureScore: 99 } as ExitAssetSignal };
    expect(proposeUrgentExits(stableHeld, exitPerAsset, guardrails)).toHaveLength(0);
  });

  it("skips a position with no usable value or amount rather than proposing a zero-size exit", () => {
    const empty: PortfolioView = {
      ...portfolio,
      positions: [{ symbol: "ETH", amount: 0, usdValue: 0, weight: 0, pricingUnknown: false }],
    };
    const exitPerAsset = { ETH: { exitPressureScore: 90 } as ExitAssetSignal };
    expect(proposeUrgentExits(empty, exitPerAsset, guardrails)).toHaveLength(0);
  });

  it("ranks multiple urgent exits by exit-pressure score", () => {
    const exitPerAsset = {
      ETH: { exitPressureScore: 85 } as ExitAssetSignal,
      SOL: { exitPressureScore: 97 } as ExitAssetSignal,
    };
    const out = proposeUrgentExits(portfolio, exitPerAsset, guardrails);
    expect(out.map((c) => c.symbol)).toEqual(["SOL", "ETH"]);
  });
});

describe("checkGuardrails", () => {
  const zeroUsage = { trades: 0, notionalUsd: 0 };

  it("passes a normal in-budget buy", () => {
    const v = checkGuardrails(candidate({}), guardrails, portfolio, zeroUsage, null, null);
    expect(v.passed).toBe(true);
    expect(v.cappedNotional).toBeGreaterThan(0);
  });

  it("blocks low conviction", () => {
    const v = checkGuardrails(candidate({ conviction: 10 }), guardrails, portfolio, zeroUsage, null, null);
    expect(v.passed).toBe(false);
    expect(v.reason).toContain("conviction");
  });

  it("blocks never-touch symbols", () => {
    const g = { ...guardrails, blocked_symbols: ["btc"] };
    const v = checkGuardrails(candidate({}), g, portfolio, zeroUsage, null, null);
    expect(v.passed).toBe(false);
    expect(v.reason).toContain("not_blocked");
  });

  it("enforces an allow-list when one is set", () => {
    const g = { ...guardrails, allowed_symbols: ["ETH"] };
    expect(checkGuardrails(candidate({}), g, portfolio, zeroUsage, null, null).passed).toBe(false);
    expect(
      checkGuardrails(candidate({ symbol: "ETH", kind: "trim" }), g, portfolio, zeroUsage, null, null)
        .passed,
    ).toBe(true);
  });

  it("enforces the daily trade count", () => {
    const usage = { trades: guardrails.max_trades_per_day, notionalUsd: 0 };
    const v = checkGuardrails(candidate({}), guardrails, portfolio, usage, null, null);
    expect(v.passed).toBe(false);
    expect(v.reason).toContain("daily_trade_count");
  });

  it("enforces the cooldown window", () => {
    const v = checkGuardrails(candidate({}), guardrails, portfolio, zeroUsage, 1, null);
    expect(v.passed).toBe(false);
    expect(v.reason).toContain("cooldown");
  });

  it("trips the drawdown breaker on a buy", () => {
    const v = checkGuardrails(
      candidate({}),
      guardrails,
      portfolio,
      zeroUsage,
      null,
      guardrails.drawdown_breaker_pct + 1,
    );
    expect(v.passed).toBe(false);
    expect(v.reason).toContain("drawdown_breaker");
  });

  it("does not let the drawdown breaker block an exit or trim", () => {
    // The breaker exists to stop new risk-taking once the account is deep in
    // a drawdown, not to trap the user in a losing position by blocking the
    // very sell that would reduce it. A candidate that fails every other
    // check for an unrelated reason would still show drawdown_breaker as the
    // (or a) failure if this regressed, so assert the specific check passed
    // rather than just v.passed overall.
    const deepDrawdown = guardrails.drawdown_breaker_pct + 1;
    const exitVerdict = checkGuardrails(
      candidate({ kind: "exit", symbol: "ETH", notionalUsd: 3000 }),
      guardrails,
      portfolio,
      zeroUsage,
      null,
      deepDrawdown,
    );
    const trimVerdict = checkGuardrails(
      candidate({ kind: "trim", symbol: "SOL", notionalUsd: 500 }),
      guardrails,
      portfolio,
      zeroUsage,
      null,
      deepDrawdown,
    );
    expect(exitVerdict.checks.find((c) => c.name === "drawdown_breaker")?.ok).toBe(true);
    expect(trimVerdict.checks.find((c) => c.name === "drawdown_breaker")?.ok).toBe(true);
    expect(exitVerdict.passed).toBe(true);
    expect(trimVerdict.passed).toBe(true);
  });

  it("caps notional to the smallest applicable limit", () => {
    const v = checkGuardrails(candidate({ notionalUsd: 99999 }), guardrails, portfolio, zeroUsage, null, null);
    expect(v.cappedNotional).toBeLessThanOrEqual(guardrails.max_trade_usd);
    expect(v.cappedNotional).toBeLessThanOrEqual((portfolio.totalUsd * guardrails.max_trade_pct) / 100);
  });

  it("cannot buy more than the available stable balance", () => {
    const broke: PortfolioView = { ...portfolio, stableUsd: 0 };
    const v = checkGuardrails(candidate({}), guardrails, broke, zeroUsage, null, null);
    expect(v.passed).toBe(false);
    expect(v.cappedNotional).toBe(0);
  });

  it("cannot sell an asset that is not held", () => {
    const v = checkGuardrails(
      candidate({ kind: "trim", symbol: "DOGE" }),
      guardrails,
      portfolio,
      zeroUsage,
      null,
      null,
    );
    expect(v.passed).toBe(false);
    expect(v.reason).toContain("position_exists");
  });

  it("lets an exit clear the whole position regardless of size caps", () => {
    const v = checkGuardrails(
      candidate({ kind: "exit", symbol: "ETH", notionalUsd: 3000 }),
      guardrails,
      portfolio,
      zeroUsage,
      null,
      null,
    );
    expect(v.cappedNotional).toBe(3000);
  });

  it("sizes an exit off the fresh position value, not a stale proposal-time notional", () => {
    // The candidate's notionalUsd is whatever was computed when the action
    // was proposed (up to 6h earlier, per expires_at) — if price rose since
    // then, the live position is worth more than that stale figure. An exit
    // must still clear the whole live position, not the smaller stale one.
    const v = checkGuardrails(
      candidate({ kind: "exit", symbol: "ETH", notionalUsd: 2000 }),
      guardrails,
      portfolio, // ETH position is 3000 USD live
      zeroUsage,
      null,
      null,
    );
    expect(v.cappedNotional).toBe(3000);
  });

  it("blocks an exit on a held-but-unpriced position with an honest reason, not 'not held'", () => {
    const unpriced: PortfolioView = {
      ...portfolio,
      positions: [{ symbol: "ETH", amount: 1, usdValue: 0, weight: 0, pricingUnknown: true }],
    };
    const v = checkGuardrails(candidate({ kind: "exit", symbol: "ETH" }), guardrails, unpriced, zeroUsage, null, null);
    expect(v.passed).toBe(false);
    expect(v.reason).toContain("position_exists");
    expect(v.reason?.toLowerCase()).not.toContain("not held");
    expect(v.reason?.toLowerCase()).toContain("unpriceable");
  });

  it("blocks dust-sized orders", () => {
    const tiny = { ...guardrails, max_trade_usd: 5 };
    const v = checkGuardrails(candidate({ notionalUsd: 5 }), tiny, portfolio, zeroUsage, null, null);
    expect(v.passed).toBe(false);
    expect(v.reason).toContain("min_order_size");
  });

  // MIN_ORDER_USD was a flat $10 with no documented reasoning, nearly 2x
  // Bybit's real API minimum for spot orders (5 USDT, confirmed via Bybit's
  // own docs) — confirmed live as the sole blocker on a real, funded ($50+)
  // account whose Kelly-tightened proposals landed at $1-5. Lowered to $6:
  // a small buffer over the strictest connectable venue's real minimum.
  it("no longer blocks an order that clears the real exchange minimum but was previously caught by the old $10 floor", () => {
    const tiny = { ...guardrails, max_trade_usd: 7 };
    const v = checkGuardrails(candidate({ notionalUsd: 7 }), tiny, portfolio, zeroUsage, null, null);
    expect(v.passed).toBe(true);
  });

  it("still blocks an order too close to the real exchange minimum to safely clear it (the exact case seen live)", () => {
    // $5.07 is only $0.07 above Bybit's real 5 USDT minimum — accepting it
    // risks the order being rejected at the exchange itself (a worse
    // failure mode than a clean pre-flight block), so this isn't the old
    // bug recurring, it's Kelly sizing genuinely being this conservative on
    // a still-small account.
    const tiny = { ...guardrails, max_trade_usd: 5.07 };
    const v = checkGuardrails(candidate({ notionalUsd: 5.07 }), tiny, portfolio, zeroUsage, null, null);
    expect(v.passed).toBe(false);
    expect(v.reason).toContain("min_order_size");
  });

  it("blocks once the daily notional budget is spent", () => {
    const usage = { trades: 0, notionalUsd: guardrails.max_daily_usd };
    const v = checkGuardrails(candidate({}), guardrails, portfolio, usage, null, null);
    expect(v.passed).toBe(false);
  });
});
