// Pure autopilot logic: turning intelligence into candidate actions and
// checking them against a user's guardrails. No IO — easy to reason about
// and identical for paper and live execution.
import type { Guardrails } from "./autonomy";
import type { ActionKind } from "./autonomy";
import type { EliteOpportunity } from "./recommendation-engine";
import type { ExitAssetSignal } from "./exit-intel";

export type PortfolioPosition = {
  symbol: string;
  amount: number;
  usdValue: number;
  weight: number; // 0..100
};

export type PortfolioView = {
  totalUsd: number;
  stableUsd: number;
  positions: PortfolioPosition[];
};

export type Candidate = {
  kind: ActionKind;
  symbol: string;
  conviction: number;
  notionalUsd: number;
  sizePct: number;
  referencePrice: number;
  rationale: string;
};

export type GuardrailVerdict = {
  passed: boolean;
  reason?: string;
  checks: { name: string; ok: boolean; detail: string }[];
  cappedNotional: number;
};

export type DayUsage = { trades: number; notionalUsd: number };

const STABLES = new Set(["USDT", "USDC", "DAI", "FDUSD", "TUSD", "BUSD", "USD"]);
export const isStable = (s: string) => STABLES.has(s.toUpperCase());

/**
 * Build candidate actions from ranked opportunities + the current book.
 * Buys come from high-conviction opportunities not yet held heavily;
 * trims and exits come from distribution/high-risk stances already held, OR
 * from exit-intel's own purpose-built exit-pressure score independently —
 * stance is a cruder heuristic computed inside stanceFor() and can lag a
 * real exit-pressure spike that exit-intel already caught.
 */
export function proposeActions(
  opportunities: EliteOpportunity[],
  portfolio: PortfolioView,
  g: Guardrails,
  exitPerAsset: Record<string, ExitAssetSignal | undefined> = {},
): Candidate[] {
  const out: Candidate[] = [];
  const held = new Map(portfolio.positions.map((p) => [p.symbol.toUpperCase(), p]));

  for (const o of opportunities) {
    const sym = o.symbol.toUpperCase();
    if (isStable(sym)) continue;
    const pos = held.get(sym);

    // exit-intel's own band thresholds (exit-intel.ts bandFor): >=81 "High
    // Exit Pressure", >=61 "Reduce Exposure" — used here as a second,
    // independent trigger alongside stance.
    const exitPressureScore = exitPerAsset[sym]?.exitPressureScore ?? exitPerAsset[o.symbol]?.exitPressureScore ?? 0;
    const exiting = o.stance === "High Risk / Unstable Phase" || o.isHighRisk || exitPressureScore >= 81;
    const distributing = o.stance === "Distribution Phase" || (!exiting && exitPressureScore >= 61);

    if (pos && (exiting || distributing)) {
      const fraction = exiting ? 1 : 0.35;
      const exitPressureNote = exitPressureScore >= 61 ? `, exit pressure ${Math.round(exitPressureScore)}` : "";
      out.push({
        kind: exiting ? "exit" : "trim",
        symbol: sym,
        conviction: Math.round(Math.max(100 - o.score, exitPressureScore)),
        notionalUsd: pos.usdValue * fraction,
        sizePct: fraction * 100,
        referencePrice: o.price,
        rationale: exiting
          ? `${sym} moved into an unstable read (${o.reasonTags.slice(0, 2).join(", ") || "risk elevated"}${exitPressureNote}). Rotating the position to ${g.stable_symbol}.`
          : `${sym} shows distribution characteristics (${o.reasonTags.slice(0, 2).join(", ") || "supply pressure"}${exitPressureNote}). Trimming ${Math.round(fraction * 100)}% to reduce exposure.`,
      });
      continue;
    }

    const accumulating =
      o.band === "High Conviction" || (o.band === "Strong Early" && o.stance !== "Distribution Phase");
    if (accumulating) {
      const targetPct = Math.min(g.max_trade_pct, 100);
      const currentWeight = pos?.weight ?? 0;
      if (currentWeight >= targetPct * 2) continue; // already sized in
      out.push({
        kind: "buy",
        symbol: sym,
        conviction: Math.round(o.score),
        notionalUsd: (portfolio.totalUsd * targetPct) / 100,
        sizePct: targetPct,
        referencePrice: o.price,
        rationale: `${sym} scores ${Math.round(o.score)} in ${o.stance.toLowerCase()} (${o.reasonTags.slice(0, 2).join(", ") || "constructive read"}). Adding a ${targetPct}% starter position.`,
      });
    }
  }

  return out.sort((a, b) => b.conviction - a.conviction);
}

/** Every check that must pass before an action may execute. */
export function checkGuardrails(
  c: Candidate,
  g: Guardrails,
  portfolio: PortfolioView,
  usage: DayUsage,
  lastTradeAgoHours: number | null,
  drawdownPct: number | null,
): GuardrailVerdict {
  const checks: GuardrailVerdict["checks"] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  const sym = c.symbol.toUpperCase();
  add("conviction", c.conviction >= g.min_conviction, `${c.conviction} vs floor ${g.min_conviction}`);
  add(
    "allowed_asset",
    g.allowed_symbols.length === 0 || g.allowed_symbols.map((s) => s.toUpperCase()).includes(sym),
    g.allowed_symbols.length ? `allow-list of ${g.allowed_symbols.length}` : "no allow-list set",
  );
  add(
    "not_blocked",
    !g.blocked_symbols.map((s) => s.toUpperCase()).includes(sym),
    g.blocked_symbols.length ? "never-touch list checked" : "never-touch list empty",
  );
  add("daily_trade_count", usage.trades < g.max_trades_per_day, `${usage.trades}/${g.max_trades_per_day} today`);
  add(
    "cooldown",
    lastTradeAgoHours === null || lastTradeAgoHours >= g.cooldown_hours,
    lastTradeAgoHours === null ? "no recent trade" : `${lastTradeAgoHours.toFixed(1)}h since last ${sym} trade`,
  );
  add(
    "drawdown_breaker",
    drawdownPct === null || drawdownPct < g.drawdown_breaker_pct,
    drawdownPct === null ? "no baseline" : `${drawdownPct.toFixed(1)}% vs ${g.drawdown_breaker_pct}% limit`,
  );

  const pctCap = (portfolio.totalUsd * g.max_trade_pct) / 100;
  const dailyRemaining = Math.max(0, g.max_daily_usd - usage.notionalUsd);
  let capped = Math.min(c.notionalUsd, pctCap, g.max_trade_usd, dailyRemaining);

  if (c.kind === "buy") {
    capped = Math.min(capped, portfolio.stableUsd);
    add("stable_liquidity", portfolio.stableUsd > 0, `${portfolio.stableUsd.toFixed(2)} ${g.stable_symbol} available`);
  } else {
    const pos = portfolio.positions.find((p) => p.symbol.toUpperCase() === sym);
    capped = Math.min(capped, pos?.usdValue ?? 0);
    // Exits are allowed to clear the whole position regardless of size caps.
    if (c.kind === "exit") capped = Math.min(c.notionalUsd, pos?.usdValue ?? 0);
    add("position_exists", (pos?.usdValue ?? 0) > 0, pos ? `holding ${pos.usdValue.toFixed(2)} USD` : "not held");
  }

  add("daily_notional", dailyRemaining > 0, `${usage.notionalUsd.toFixed(0)}/${g.max_daily_usd} used today`);
  add("min_order_size", capped >= 10, `${capped.toFixed(2)} USD after caps`);

  const failed = checks.find((k) => !k.ok);
  return {
    passed: !failed,
    ...(failed ? { reason: `${failed.name}: ${failed.detail}` } : {}),
    checks,
    cappedNotional: Math.max(0, capped),
  };
}
