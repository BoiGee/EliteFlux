import { describe, expect, it } from "vitest";
import { checkGuardrails, isStable, proposeActions, type Candidate, type PortfolioView } from "../autopilot-engine";
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
    { symbol: "ETH", amount: 1, usdValue: 3000, weight: 30 },
    { symbol: "SOL", amount: 10, usdValue: 1500, weight: 15 },
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

  it("skips buys for positions already sized in", () => {
    const heavy: PortfolioView = {
      ...portfolio,
      positions: [{ symbol: "BTC", amount: 1, usdValue: 5000, weight: 50 }],
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

  it("trips the drawdown breaker", () => {
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

  it("blocks dust-sized orders", () => {
    const tiny = { ...guardrails, max_trade_usd: 5 };
    const v = checkGuardrails(candidate({ notionalUsd: 5 }), tiny, portfolio, zeroUsage, null, null);
    expect(v.passed).toBe(false);
    expect(v.reason).toContain("min_order_size");
  });

  it("blocks once the daily notional budget is spent", () => {
    const usage = { trades: 0, notionalUsd: guardrails.max_daily_usd };
    const v = checkGuardrails(candidate({}), guardrails, portfolio, usage, null, null);
    expect(v.passed).toBe(false);
  });
});
