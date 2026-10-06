// Pure autopilot logic: turning intelligence into candidate actions and
// checking them against a user's guardrails. No IO — easy to reason about
// and identical for paper and live execution.
import type { Guardrails, TradingStyle } from "./autonomy";
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
 * Floor below which an order isn't worth placing — was a flat $10 with no
 * documented reasoning. Confirmed live: a real, funded ($50+) live account
 * had every buy blocked here, because Kelly sizing was (correctly)
 * tightening proposals to a measured, conservative fraction of the
 * portfolio, landing consistently in the $1-$5 range — nowhere near the
 * arbitrary $10 floor. Checked actual exchange minimums for every venue
 * this platform can execute on: Bybit's official API minimum for spot
 * orders is 5 USDT (raised from 1 to 5 in Jan 2025), MEXC's is 1 USDT, and
 * OKX's is a small per-symbol minSz (typically well under $5 for majors,
 * not a flat USDT figure). $10 was stricter than any of them for no
 * documented reason. $6 clears the strictest confirmed venue (Bybit) with
 * a small buffer, without needlessly blocking a correctly, conservatively
 * sized position on a genuinely funded account. This is a flat platform-
 * wide floor, not per-venue/per-symbol — checkGuardrails has no venue
 * context to be more precise than that. Exported so autopilot.server.ts's
 * Kelly-sizing step can round a positive-edge proposal up to this floor
 * instead of leaving it stuck below it — see applyKellySizing's comment.
 */
export const MIN_ORDER_USD = 6;

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
      // Full exits are deliberately NOT tempered by conviction below — that
      // trigger (isHighRisk / High Risk-Unstable stance / exitPressure>=81)
      // is the platform's single most urgent protective signal, and
      // rationalizing it away because other layers still look good is
      // exactly the failure mode it exists to prevent. Trims are different:
      // a coin can score "High Conviction" on its own recommendation read
      // while exit-intel independently flags rising distribution risk —
      // two real, simultaneously-true signals the old logic never
      // reconciled, just acting on whichever fired. A High Conviction read
      // means the platform still has real confidence in this position, so
      // a real-but-moderate risk signal gets a lighter, hedging trim
      // (reduce some exposure) instead of the standard-strength one — never
      // skipped outright, since the risk signal is real too.
      const tempered = distributing && !exiting && o.band === "High Conviction";
      const fraction = exiting ? 1 : tempered ? 0.15 : 0.35;
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
          : tempered
            ? `${sym} shows distribution characteristics (${o.reasonTags.slice(0, 2).join(", ") || "supply pressure"}${exitPressureNote}), but still scores High Conviction overall. Trimming a lighter ${Math.round(fraction * 100)}% as a hedge rather than the standard cut.`
            : `${sym} shows distribution characteristics (${o.reasonTags.slice(0, 2).join(", ") || "supply pressure"}${exitPressureNote}). Trimming ${Math.round(fraction * 100)}% to reduce exposure.`,
      });
      continue;
    }

    // `exiting` above only gates a *held* position (the pos && guard) — a
    // not-yet-held coin fell straight through to this check with no
    // instability gate of its own, so the exact same "High Risk / Unstable
    // Phase" stance that forces a full exit on a held position could still
    // green-light a brand-new starter buy into that same coin. Confirmed
    // live: a real blocked-action rationale read "scores 61 in high risk /
    // unstable phase ... Adding a 25% starter position" — proposing to buy
    // into the very condition that would trigger selling out of it.
    const accumulating =
      !exiting &&
      (o.band === "High Conviction" || (o.band === "Strong Early" && o.stance !== "Distribution Phase"));
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
  // "today" was misleading — todayUsage (autopilot.server.ts) counts a
  // rolling 24h window from each trade's own timestamp, not since midnight.
  // Confirmed live: a real user's 2 trades from ~21:16 UTC one day still
  // correctly blocked new ones past midnight into the next day, but the
  // message said "2/2 today" right when it was, by their calendar, a new
  // day — reading as a stuck/broken counter instead of the (safer, harder
  // to game than a midnight reset) rolling window it actually is.
  add("daily_trade_count", usage.trades < g.max_trades_per_day, `${usage.trades}/${g.max_trades_per_day} in the last 24h`);
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

  // Same rolling-24h reality as daily_trade_count above, not a midnight reset.
  add("daily_notional", dailyRemaining > 0, `${usage.notionalUsd.toFixed(0)}/${g.max_daily_usd} used in the last 24h`);
  add("min_order_size", capped >= MIN_ORDER_USD, `${capped.toFixed(2)} USD after caps`);

  const failed = checks.find((k) => !k.ok);
  return {
    passed: !failed,
    ...(failed ? { reason: `${failed.name}: ${failed.detail}` } : {}),
    checks,
    cappedNotional: Math.max(0, capped),
  };
}

// ---------------------------------------------------------------------------
// Position rotation: reallocating out of a position that's gone quiet or
// lagged, into whatever currently looks better — the one thing
// proposeActions above never does (it only ever sells on a RISK signal:
// exit-pressure or an unstable stance). No existing rotation concept lived
// anywhere in this codebase before this.
// ---------------------------------------------------------------------------

export type OwnedBasis = { openedAt: number; ownedUsd: number };

/**
 * Reconstructs, per symbol, how much of a position is Autopilot's OWN doing
 * in dollar terms, and when that stretch of ownership began — from this
 * user's own executed autopilot_actions rows only (buy/trim/exit, already
 * filtered by the caller to source:"curated", excluding Token Discovery's
 * paper rows which share this table).
 *
 * This is notional-dollars-in net of notional-dollars-out, NOT quantity/
 * price lot accounting — the platform doesn't reliably have a confirmed
 * per-fill price to do better (reference_price is proposal-time, not
 * necessarily the real fill). Good enough to answer "roughly how much of
 * this position did Autopilot itself put in," which is all rotation sizing
 * needs: it must never sell more than that, regardless of how large the
 * user's total held position actually is — a user who already owned some
 * of a coin before Autopilot ever touched it must never have that
 * pre-existing stack swept up in a rotation.
 *
 * A full exit zeroes a symbol's basis entirely (including openedAt) — a
 * later buy of the same symbol starts a brand new position, not a
 * resumption of one already closed out.
 */
export function computeOwnedBasis(
  rows: { kind: ActionKind; symbol: string; notionalUsd: number; executedAt: number }[],
): Record<string, OwnedBasis> {
  const bySymbol = new Map<string, { kind: ActionKind; notionalUsd: number; executedAt: number }[]>();
  for (const r of rows) {
    const sym = r.symbol.toUpperCase();
    (bySymbol.get(sym) ?? bySymbol.set(sym, []).get(sym)!).push(r);
  }

  const out: Record<string, OwnedBasis> = {};
  for (const [sym, sorted] of bySymbol) {
    sorted.sort((a, b) => a.executedAt - b.executedAt);
    let ownedUsd = 0;
    let openedAt: number | null = null;
    for (const r of sorted) {
      if (r.kind === "buy") {
        if (ownedUsd <= 0) openedAt = r.executedAt;
        ownedUsd += r.notionalUsd;
      } else if (r.kind === "trim") {
        ownedUsd = Math.max(0, ownedUsd - r.notionalUsd);
      } else if (r.kind === "exit") {
        ownedUsd = 0;
        openedAt = null;
      }
    }
    if (ownedUsd > 0 && openedAt !== null) out[sym] = { openedAt, ownedUsd };
  }
  return out;
}

/**
 * How long to wait before rotating, and how big a gap is required, per the
 * user's chosen trading_style. lookbackDays is capped at 14 — the retention
 * window market_snapshots itself keeps (see market-history.server.ts).
 */
export const ROTATION_PARAMS: Record<
  TradingStyle,
  { minDwellDays: number; scoreGap: number; underperformGapPct: number; lookbackDays: number }
> = {
  short_term: { minDwellDays: 3, scoreGap: 20, underperformGapPct: 8, lookbackDays: 7 },
  balanced: { minDwellDays: 7, scoreGap: 25, underperformGapPct: 12, lookbackDays: 10 },
  long_term: { minDwellDays: 21, scoreGap: 35, underperformGapPct: 20, lookbackDays: 14 },
};

/** Lowest-priority signal of the three proposeActions/proposeRotations can produce — never crowds out a risk-driven exit or trim. */
const MAX_ROTATIONS_PER_CYCLE = 2;

const GOOD_BANDS = new Set<EliteOpportunity["band"]>(["High Conviction", "Strong Early"]);

/**
 * Proposes reducing a held, Autopilot-owned position when either: (a) it's
 * gone quiet (no longer High Conviction) while a materially better, itself-
 * good opportunity is available, or (b) it's relatively lagged the market
 * baseline over the lookback window, regardless of whether it even has a
 * live score at all (recommendation-engine's ranked universe only covers 20
 * curated coins — a held coin outside that list has "no opinion," not
 * "known bad," so the underperformance read is what covers it instead).
 *
 * Always a "trim" sized at min(ownedUsd, position's current usdValue) —
 * never a full "exit": checkGuardrails already further-caps whatever
 * notionalUsd this hands it against the per-trade/daily ceilings, so a
 * rotation larger than one cycle's caps simply unwinds over a few cycles
 * instead of all at once. There is deliberately no paired same-cycle buy —
 * freeing stable balance lets proposeActions' own existing `accumulating`
 * logic pick up the best opportunity next cycle, exactly like a risk-driven
 * exit today doesn't synchronously trigger a replacement buy either.
 */
export function proposeRotations(
  portfolio: PortfolioView,
  opportunities: EliteOpportunity[],
  basisBySymbol: Record<string, OwnedBasis>,
  recentReturnBySymbol: Record<string, number | null>,
  marketReturn: number | null,
  style: TradingStyle,
  excludeSymbols: Set<string>,
  now: number,
): Candidate[] {
  const params = ROTATION_PARAMS[style];
  const heldSymbols = new Set(portfolio.positions.map((p) => p.symbol.toUpperCase()));
  const oppBySymbol = new Map(opportunities.map((o) => [o.symbol.toUpperCase(), o]));

  const bestAlt = opportunities
    .filter((o) => !heldSymbols.has(o.symbol.toUpperCase()) && !isStable(o.symbol) && GOOD_BANDS.has(o.band))
    .sort((a, b) => b.calibratedScore - a.calibratedScore)[0];

  type Scored = { candidate: Candidate; severity: number };
  const out: Scored[] = [];

  for (const pos of portfolio.positions) {
    const sym = pos.symbol.toUpperCase();
    if (isStable(sym) || pos.usdValue <= 0 || excludeSymbols.has(sym)) continue;
    const basis = basisBySymbol[sym];
    if (!basis || basis.ownedUsd <= 0) continue; // never rotate a position Autopilot didn't itself build

    const dwellDays = (now - basis.openedAt) / (24 * 3600_000);
    if (dwellDays < params.minDwellDays) continue;

    const heldOpp = oppBySymbol.get(sym);
    const scoreGapActual =
      heldOpp && heldOpp.band !== "High Conviction" && bestAlt && bestAlt.symbol.toUpperCase() !== sym
        ? bestAlt.calibratedScore - heldOpp.calibratedScore
        : -Infinity;
    const scoreTrigger = scoreGapActual >= params.scoreGap;

    const ret = recentReturnBySymbol[sym] ?? null;
    const underperformGapActual = ret !== null && marketReturn !== null ? marketReturn - ret : -Infinity;
    const underperformTrigger = underperformGapActual >= params.underperformGapPct;

    if (!scoreTrigger && !underperformTrigger) continue;

    const notionalUsd = Math.min(basis.ownedUsd, pos.usdValue);
    const severity = Math.max(scoreTrigger ? scoreGapActual : -Infinity, underperformTrigger ? underperformGapActual : -Infinity);

    const rationale = scoreTrigger
      ? `${sym} has gone quiet (scores ${Math.round(heldOpp!.calibratedScore)} now) while ${bestAlt!.symbol} is scoring ${Math.round(bestAlt!.calibratedScore)} (${bestAlt!.band}). Reducing this position to redeploy toward the stronger read.`
      : `${sym} has lagged the market by ${underperformGapActual.toFixed(1)}pts over the last ${params.lookbackDays} days with no improving signal. Reducing this position to free capital for something stronger.`;

    const conviction = scoreTrigger
      ? Math.round(bestAlt!.calibratedScore)
      : Math.round(Math.min(100, 50 + (underperformGapActual - params.underperformGapPct)));

    out.push({
      severity,
      candidate: {
        kind: "trim",
        symbol: sym,
        conviction,
        notionalUsd,
        sizePct: pos.usdValue > 0 ? (notionalUsd / pos.usdValue) * 100 : 0,
        referencePrice: pos.amount > 0 ? pos.usdValue / pos.amount : 0,
        rationale,
      },
    });
  }

  return out
    .sort((a, b) => b.severity - a.severity)
    .slice(0, MAX_ROTATIONS_PER_CYCLE)
    .map((s) => s.candidate);
}
