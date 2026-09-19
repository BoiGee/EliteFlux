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
  /**
   * True when usdValue is a real 0 held-but-worthless artifact of a pricing
   * gap, not a genuine zero position — fetchPrices failed for this symbol
   * and portfolio.server.ts's loadPortfolioView has no way to distinguish
   * "unpriced" from "actually zero" once it's collapsed to a number. Without
   * this flag, an exit-intel signal wanting OUT of a real, held, risky asset
   * would fail the position_exists guardrail check with a misleading "not
   * held" reason instead of the true "pricing unavailable" — confirmed live
   * via code audit as a real failure mode, not hypothetical.
   */
  pricingUnknown: boolean;
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
        // calibratedScore (recommendation-engine.ts), not the raw score —
        // this conviction number is what min_conviction/Kelly-sizing act on,
        // so it should reflect the score's measured real-world hit rate,
        // not the raw enthusiasm of one cycle's read.
        conviction: Math.round(Math.max(100 - o.calibratedScore, exitPressureScore)),
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
        conviction: Math.round(o.calibratedScore),
        notionalUsd: (portfolio.totalUsd * targetPct) / 100,
        sizePct: targetPct,
        referencePrice: o.price,
        rationale: `${sym} scores ${Math.round(o.score)} in ${o.stance.toLowerCase()} (${o.reasonTags.slice(0, 2).join(", ") || "constructive read"}). Adding a ${targetPct}% starter position.`,
      });
    }
  }

  return out.sort((a, b) => b.conviction - a.conviction);
}

/**
 * Fast-lane companion to proposeActions, run from the 1-minute cycle instead
 * of the 5-minute one. Deliberately narrower: only currently-held positions
 * (not the ranked-opportunity universe, which needs a heavier pass this
 * cadence shouldn't pay for) and only exit-intel's own High Exit Pressure
 * band (>=81) — the same absolute threshold proposeActions uses for a full
 * exit. No trims, no buys, and no stance/isHighRisk check (that reads from
 * the recommendation engine, which only refreshes on the slower cycle) —
 * those stay on the regular pass. This exists so a fast-forming exit signal
 * on something already held doesn't sit unacted-on for up to 4 extra minutes
 * just because the next full cycle hasn't run yet.
 */
export function proposeUrgentExits(
  portfolio: PortfolioView,
  exitPerAsset: Record<string, ExitAssetSignal | undefined>,
  g: Guardrails,
): Candidate[] {
  const out: Candidate[] = [];
  for (const pos of portfolio.positions) {
    const sym = pos.symbol.toUpperCase();
    if (isStable(sym) || pos.usdValue <= 0 || pos.amount <= 0) continue;
    const sig = exitPerAsset[sym] ?? exitPerAsset[pos.symbol];
    if (!sig || sig.exitPressureScore < 81) continue;
    out.push({
      kind: "exit",
      symbol: sym,
      conviction: Math.round(sig.exitPressureScore),
      notionalUsd: pos.usdValue,
      sizePct: 100,
      // Informational only — execution re-prices from the live held value at
      // the moment it actually sells (see executeAction), same as every
      // other exit/trim candidate.
      referencePrice: pos.usdValue / pos.amount,
      rationale: `${sym} hit High Exit Pressure (${Math.round(sig.exitPressureScore)}${sig.tags?.length ? `, ${sig.tags.slice(0, 2).join(", ")}` : ""}) on the fast check. Rotating the position to ${g.stable_symbol} before the next full cycle.`,
    });
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
  // Exempt from exit/trim: this breaker exists to stop new risk-taking once
  // the account is already deep in a drawdown, not to trap the user in a
  // losing position by blocking the very sell that would reduce it. Applying
  // it unconditionally (as before) meant a real drawdown could silently
  // block Autopilot's own protective exits at exactly the moment they
  // mattered most — confirmed via code audit, no test previously covered the
  // exit/trim case specifically.
  add(
    "drawdown_breaker",
    c.kind !== "buy" || drawdownPct === null || drawdownPct < g.drawdown_breaker_pct,
    c.kind !== "buy"
      ? "exit/trim exempt — reduces risk, doesn't add it"
      : drawdownPct === null
        ? "no baseline"
        : `${drawdownPct.toFixed(1)}% vs ${g.drawdown_breaker_pct}% limit`,
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
    // Exits are allowed to clear the whole position regardless of size caps —
    // this must NOT also min() against c.notionalUsd, which is the proposal-
    // time figure (up to 6h stale per expires_at). If price rose since
    // proposal, the stale figure is smaller than the fresh position value,
    // undersizing the exit and leaving part of it unsold — contradicting
    // this comment's own stated intent. Confirmed live via code audit.
    if (c.kind === "exit") capped = pos?.usdValue ?? 0;
    // A genuinely held-but-unpriced position must not read as "not held" —
    // that wording tells an operator EliteFlux has no visibility into the
    // position at all, when the truth is it knows the holding exists and
    // specifically can't price it right now. The trade still can't be safely
    // USD-sized without a price (capped stays 0, so min_order_size below
    // still blocks it), but the failure reason now says why.
    if (pos?.pricingUnknown) {
      add("position_exists", false, `holding ${pos.amount} ${sym} but its USD value is currently unpriceable — exit blocked until pricing recovers`);
    } else {
      add("position_exists", (pos?.usdValue ?? 0) > 0, pos ? `holding ${pos.usdValue.toFixed(2)} USD` : "not held");
    }
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
