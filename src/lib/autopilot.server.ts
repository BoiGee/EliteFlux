// Server-only autopilot execution: guardrail enforcement, order routing and
// audit logging. Paper mode simulates fills; live mode places spot orders.
import type { SupabaseClient } from "@supabase/supabase-js";
import { open } from "./vault.server";
import { placeSpotOrder, type Venue } from "./exchanges.server";
import { loadPortfolioView, syncPortfolio } from "./portfolio.server";
import {
  checkGuardrails,
  proposeActions,
  proposeUrgentExits,
  MIN_ORDER_USD,
  type Candidate,
  type DayUsage,
  type PortfolioView,
} from "./autopilot-engine";
import { DEFAULT_SETTINGS, type AutopilotSettings, type Guardrails } from "./autonomy";
import type { EliteOpportunity } from "./recommendation-engine";
import type { ExitAssetSignal } from "./exit-intel";
import { computeSuggestedSizing, MAX_SUGGESTED_SIZE_PCT } from "./kelly-sizing.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

export async function audit(db: DB, userId: string, event: string, detail?: unknown, actionId?: string) {
  await db.from("autopilot_audit").insert({
    user_id: userId,
    action_id: actionId ?? null,
    event,
    detail: (detail ?? null) as never,
  });
}

export async function loadSettings(db: DB, userId: string): Promise<AutopilotSettings> {
  const { data } = await db.from("autopilot_settings").select("*").eq("user_id", userId).maybeSingle();
  if (data) return data as AutopilotSettings;
  const seed = { user_id: userId, ...DEFAULT_SETTINGS };
  await db.from("autopilot_settings").insert(seed as never);
  return {
    ...seed,
    disclosure_accepted_at: null,
    armed_at: null,
    disarmed_reason: null,
    peak_portfolio_usd: null,
  } as AutopilotSettings;
}

/**
 * Tracks each user's own portfolio high-water mark and returns the current
 * drawdown from it. Previously the drawdown breaker was always fed `null`
 * (no data ever computed it) so it could never trip; this is the real
 * measurement.
 */
async function trackDrawdown(
  db: DB,
  userId: string,
  peakPortfolioUsd: number | null,
  currentTotalUsd: number,
): Promise<number | null> {
  if (currentTotalUsd <= 0) return peakPortfolioUsd ? 100 : null;
  if (!peakPortfolioUsd || currentTotalUsd > peakPortfolioUsd) {
    await db.from("autopilot_settings").update({ peak_portfolio_usd: currentTotalUsd } as never).eq("user_id", userId);
    return 0;
  }
  return ((peakPortfolioUsd - currentTotalUsd) / peakPortfolioUsd) * 100;
}

// A row reconciled from a stuck 'executing' state (see
// reconcileStuckAutopilotActions) lands at 'unknown' — we genuinely don't
// know whether the venue filled it before the write that would have marked
// it 'executed' was lost. Counting it toward daily guardrails is the
// conservative direction: it can only make future trades MORE restricted,
// never less, and a real filled trade silently not counting toward the
// user's own daily-trade/cooldown/daily-USD limits was the actual risk this
// closes (confirmed live via code audit).
const COUNTS_AS_EXECUTED = ["executed", "unknown"] as const;

/** Trades already executed today (or of unresolved fate), used by the daily guardrails. */
export async function todayUsage(db: DB, userId: string): Promise<DayUsage> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data } = await db
    .from("autopilot_actions")
    .select("notional_usd")
    .eq("user_id", userId)
    .in("state", COUNTS_AS_EXECUTED)
    .gte("executed_at", since);
  const rows = (data ?? []) as { notional_usd: number | null }[];
  return {
    trades: rows.length,
    notionalUsd: rows.reduce((s, r) => s + (Number(r.notional_usd) || 0), 0),
  };
}

async function hoursSinceLastTrade(db: DB, userId: string, symbol: string): Promise<number | null> {
  const { data } = await db
    .from("autopilot_actions")
    .select("executed_at")
    .eq("user_id", userId)
    .eq("symbol", symbol)
    .in("state", COUNTS_AS_EXECUTED)
    .order("executed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const at = (data as { executed_at: string | null } | null)?.executed_at;
  return at ? (Date.now() - new Date(at).getTime()) / 3600_000 : null;
}

/** Live venue for a user, if they connected one with trade permission. */
async function tradingConnection(db: DB, userId: string) {
  const { data } = await db
    .from("exchange_connections")
    .select("id,venue,api_key_ciphertext,api_secret_ciphertext,passphrase_ciphertext")
    .eq("user_id", userId)
    .eq("permission", "read_trade")
    .eq("status", "connected")
    .limit(1)
    .maybeSingle();
  return data as {
    id: string;
    venue: Venue;
    api_key_ciphertext: string;
    api_secret_ciphertext: string;
    passphrase_ciphertext: string | null;
  } | null;
}

export type RecordedAction = { id: string; state: string; blockedReason?: string };

/** Store one candidate as an action row, with its guardrail verdict attached. */
export async function recordCandidate(
  db: DB,
  userId: string,
  c: Candidate,
  settings: AutopilotSettings,
  portfolio: PortfolioView,
): Promise<RecordedAction> {
  // proposeActions has no memory of what it already proposed last cycle —
  // it's a pure function scored fresh from the current portfolio each run.
  // Without this check, a symbol the user hasn't approved or rejected yet
  // gets re-proposed every cycle, piling up redundant pending actions for
  // the same symbol. hoursSinceLastTrade/todayUsage only look at *executed*
  // trades, so they don't catch this — check pending state directly instead.
  //
  // "blocked" is included too, not just proposed/approved — confirmed live
  // as a real bug: a candidate that fails a guardrail (e.g. min_order_size
  // on a too-small account) got re-proposed and re-blocked every single
  // cron cycle forever, since a blocked row never counted as "pending" here.
  // Reusing the same 6h expires_at as everything else means it still
  // retries periodically (in case the underlying condition changes, e.g.
  // the user deposits more funds) rather than being silenced permanently.
  const { data: pending } = await db
    .from("autopilot_actions")
    .select("id,state")
    .eq("user_id", userId)
    .eq("symbol", c.symbol)
    .in("state", ["proposed", "approved", "blocked"])
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (pending) {
    const row = pending as { id: string; state: "proposed" | "approved" | "blocked" };
    return { id: row.id, state: row.state };
  }

  const usage = await todayUsage(db, userId);
  const ago = await hoursSinceLastTrade(db, userId, c.symbol);
  const drawdownPct = await trackDrawdown(db, userId, settings.peak_portfolio_usd, portfolio.totalUsd);
  const verdict = checkGuardrails(c, settings as Guardrails, portfolio, usage, ago, drawdownPct);

  const state = verdict.passed ? "proposed" : "blocked";
  const { data, error } = await db
    .from("autopilot_actions")
    .insert({
      user_id: userId,
      kind: c.kind,
      symbol: c.symbol,
      size_pct: c.sizePct,
      notional_usd: verdict.cappedNotional,
      reference_price: c.referencePrice,
      conviction: c.conviction,
      rationale: c.rationale,
      state,
      guardrail_verdict: verdict as never,
      blocked_reason: verdict.reason ?? null,
      paper: settings.paper_mode,
      expires_at: new Date(Date.now() + 6 * 3600_000).toISOString(),
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const id = (data as { id: string }).id;
  await audit(db, userId, state === "proposed" ? "action_proposed" : "action_blocked", verdict, id);
  return { id, state, ...(verdict.reason ? { blockedReason: verdict.reason } : {}) };
}

/** Execute a stored, guardrail-cleared action. Re-checks everything first. */
export async function executeAction(db: DB, userId: string, actionId: string) {
  // Feature switch beats everything — used to stage or pull back the rollout.
  const { isFeatureEnabled } = await import("./platform.server");
  if (!(await isFeatureEnabled(db as never, "autopilot"))) {
    await audit(db, userId, "execution_refused", { reason: "autopilot disabled platform-wide" }, actionId);
    return { ok: false, error: "Automated trading is currently unavailable." };
  }

  // Platform-wide halt beats every individual setting.
  const { data: ks } = await db
    .from("platform_settings")
    .select("value")
    .eq("key", "autopilot_kill_switch")
    .maybeSingle();
  if ((ks as { value: unknown } | null)?.value === true) {
    await audit(db, userId, "execution_refused", { reason: "platform halt active" }, actionId);
    return { ok: false, error: "Automated trading is temporarily paused platform-wide." };
  }


  const settings = await loadSettings(db, userId);
  if (settings.kill_switch) {
    await audit(db, userId, "execution_refused", { reason: "kill switch active" }, actionId);
    return { ok: false, error: "Kill switch is active." };
  }


  const { data: action } = await db
    .from("autopilot_actions")
    .select("*")
    .eq("id", actionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!action) return { ok: false, error: "Action not found." };

  const a = action as {
    id: string;
    kind: "buy" | "trim" | "exit" | "hold";
    symbol: string;
    notional_usd: number | null;
    reference_price: number | null;
    conviction: number | null;
    size_pct: number | null;
    rationale: string;
    state: string;
  };
  if (a.state !== "proposed" && a.state !== "approved") {
    return { ok: false, error: `Action is already ${a.state}.` };
  }
  if (a.kind === "hold") return { ok: false, error: "Nothing to execute." };

  // Atomically claim this action before doing any real work: two concurrent
  // calls (double-clicking "Approve", or a manual retry racing a scheduled
  // run) both reading state="proposed" here would otherwise both re-check
  // guardrails and both place an order — the exchange's clientOrderId dedup
  // stops a literal second order, but without this claim the two DB writes
  // at the end can still race and overwrite a genuinely-filled order's row
  // with "failed". Only the caller whose UPDATE actually flips the row wins.
  const claim = await db
    .from("autopilot_actions")
    .update({ state: "executing", executing_since: new Date().toISOString() } as never)
    .eq("id", actionId)
    .eq("user_id", userId)
    .in("state", ["proposed", "approved"])
    .select("id");
  if (!claim.data?.length) {
    return { ok: false, error: "This action is already being processed." };
  }

  // Re-price the book and re-run every guardrail at execution time.
  const portfolio = await loadPortfolioView(db, userId);
  const usage = await todayUsage(db, userId);
  const ago = await hoursSinceLastTrade(db, userId, a.symbol);
  const candidate: Candidate = {
    kind: a.kind,
    symbol: a.symbol,
    conviction: a.conviction ?? 0,
    notionalUsd: Number(a.notional_usd) || 0,
    sizePct: Number(a.size_pct) || 0,
    referencePrice: Number(a.reference_price) || 0,
    rationale: a.rationale,
  };
  const drawdownPct = await trackDrawdown(db, userId, settings.peak_portfolio_usd, portfolio.totalUsd);
  const verdict = checkGuardrails(candidate, settings as Guardrails, portfolio, usage, ago, drawdownPct);
  if (!verdict.passed) {
    await db
      .from("autopilot_actions")
      .update({ state: "blocked", blocked_reason: verdict.reason, guardrail_verdict: verdict as never })
      .eq("id", actionId);
    await audit(db, userId, "execution_blocked", verdict, actionId);
    return { ok: false, error: verdict.reason ?? "Blocked by guardrails." };
  }

  const notional = verdict.cappedNotional;
  // For sells (trim/exit), baseQty = notional / price must use a price as of
  // *now*, not candidate.referencePrice (stale — set when the action was
  // proposed, up to 6h earlier per its expires_at window). notional is
  // already recomputed above against the freshly-reloaded `portfolio`; using
  // a stale price to convert that fresh USD amount to a base quantity can
  // leave part of an "exit" unsold, or request more than is actually held.
  // portfolio.positions is fresh (loaded at the top of this function), so
  // usdValue/amount for the held position is today's price, not the
  // proposal-time snapshot.
  const heldPosition = portfolio.positions.find((p) => p.symbol.toUpperCase() === a.symbol.toUpperCase());
  const price =
    a.kind === "buy"
      ? candidate.referencePrice || 0
      : heldPosition && heldPosition.amount > 0
        ? heldPosition.usdValue / heldPosition.amount
        : candidate.referencePrice || 0;

  if (settings.paper_mode) {
    const result = { simulated: true, notionalUsd: notional, price, filledAt: new Date().toISOString() };
    await db
      .from("autopilot_actions")
      .update({
        state: "executed",
        notional_usd: notional,
        order_result: result as never,
        executed_at: new Date().toISOString(),
        paper: true,
      })
      .eq("id", actionId);
    await audit(db, userId, "paper_fill", result, actionId);
    return { ok: true, paper: true, notionalUsd: notional };
  }

  const conn = await tradingConnection(db, userId);
  if (!conn) {
    await audit(db, userId, "execution_failed", { reason: "no trade-enabled connection" }, actionId);
    return { ok: false, error: "No exchange connection with trade permission." };
  }

  // Derived from this action's own row ID, so a retry of this exact action
  // (e.g. this process crashing after the exchange fills the order but
  // before the state update below lands, leaving the row in "proposed" for
  // a later run to pick up again) sends the venue the same ID it already
  // saw — every venue here rejects a repeat rather than placing a second
  // order. Alphanumeric-only: OKX's clOrdId doesn't accept hyphens.
  const clientOrderId = actionId.replace(/-/g, "");

  const order = await placeSpotOrder(
    {
      apiKey: await open(conn.api_key_ciphertext),
      apiSecret: await open(conn.api_secret_ciphertext),
      passphrase: conn.passphrase_ciphertext ? await open(conn.passphrase_ciphertext) : null,
    },
    {
      venue: conn.venue,
      side: a.kind === "buy" ? "buy" : "sell",
      symbol: a.symbol,
      stable: settings.stable_symbol,
      clientOrderId,
      ...(a.kind === "buy" ? { quoteUsd: Number(notional.toFixed(2)) } : {}),
      ...(a.kind !== "buy" && price > 0 ? { baseQty: Number((notional / price).toFixed(6)) } : {}),
    },
  );

  // A duplicate rejection means the venue already has an order under this
  // ID from an earlier attempt — it may well have filled. That's a
  // materially different situation from a fresh rejection, so it gets a
  // distinct note rather than being folded into an ordinary "failed" with
  // no trace of the ambiguity — a human needs to check the venue's own
  // order history for what actually happened, not trust this row either way.
  const orderResult = order.isDuplicate
    ? { ...order, note: `${conn.venue} reports an order already exists under this ID — check ${conn.venue} order history directly; this may have already filled.` }
    : order;

  await db
    .from("autopilot_actions")
    .update({
      state: order.ok ? "executed" : "failed",
      notional_usd: notional,
      venue: conn.venue,
      paper: false,
      order_result: (orderResult.raw ?? { error: orderResult.error, note: (orderResult as { note?: string }).note }) as never,
      executed_at: order.ok ? new Date().toISOString() : null,
    })
    .eq("id", actionId);
  await audit(db, userId, order.ok ? "live_fill" : order.isDuplicate ? "execution_unresolved_duplicate" : "execution_failed", orderResult, actionId);

  return order.ok
    ? { ok: true, paper: false, notionalUsd: notional, orderId: order.orderId }
    : { ok: false, error: order.isDuplicate ? (orderResult as { note?: string }).note! : (order.error ?? "Order rejected.") };
}

// Real execution (placeSpotOrder + the state-flipping UPDATE above) usually
// completes in well under a second once a user's connections/prices are
// warm — even a slow venue call is bounded by its own ~8s fetch timeout.
// Comfortably longer than any legitimate run, short enough that a stuck row
// doesn't sit unresolved (and invisible to guardrail counting) for long.
const STUCK_EXECUTING_MS = 5 * 60_000;

/**
 * Sweeps every user's autopilot_actions for rows stuck at state='executing'
 * — see the 20260918210000 migration's own comment for the full mechanism
 * (withTimeout races the whole per-user run without cancelling the
 * underlying work, so a timed-out run can abandon a claimed action between
 * placeSpotOrder returning and the final state-flipping UPDATE landing).
 * Reconciles each one to 'unknown' rather than guessing 'executed'/'failed'
 * outright — a human should check the venue's own order history for what
 * actually happened — while still making it count toward that user's daily
 * guardrails (see COUNTS_AS_EXECUTED) so a real, possibly-filled trade can't
 * silently evade their own configured limits. Global, not per-user — meant
 * to run once per cron cycle, not once per user in the per-user loop.
 */
export async function reconcileStuckAutopilotActions(db: DB): Promise<{ reconciled: number }> {
  const cutoff = new Date(Date.now() - STUCK_EXECUTING_MS).toISOString();
  const { data: stuck } = await db
    .from("autopilot_actions")
    .select("id,user_id,executing_since")
    .eq("state", "executing")
    .lt("executing_since", cutoff)
    .limit(200);

  const rows = (stuck ?? []) as { id: string; user_id: string; executing_since: string | null }[];
  if (!rows.length) return { reconciled: 0 };

  const nowIso = new Date().toISOString();
  const ids = rows.map((r) => r.id);
  const { error } = await db
    .from("autopilot_actions")
    .update({
      state: "unknown",
      // executed_at drives both todayUsage's window filter and
      // hoursSinceLastTrade's ordering — without it a reconciled row would
      // be silently excluded from the very guardrail counting this exists
      // to protect. Using now() (reconciliation time) rather than
      // executing_since is deliberately the more conservative of the two:
      // it's never earlier than when the order was actually placed, so it
      // can only make the cooldown/daily-window checks stricter, not looser.
      executed_at: nowIso,
    } as never)
    .in("id", ids)
    .eq("state", "executing"); // re-check state so this can't clobber a row that finished between the select and here
  if (error) return { reconciled: 0 };

  for (const r of rows) {
    await audit(db, r.user_id, "execution_reconciled_unknown", { executing_since: r.executing_since, cutoff }, r.id);
  }
  return { reconciled: rows.length };
}

/**
 * One scheduled pass for a single user: refresh the book, propose actions and
 * — at autopilot level — execute the ones that clear every guardrail.
 */
/**
 * Buy candidates come out of proposeActions at a flat sizePct (the
 * guardrail's max_trade_pct) — proposeActions is a pure function with no DB
 * access, so it can't know whether the platform has actually measured a
 * positive edge at this score/regime. Kelly sizing can only tighten toward
 * its measured-edge suggestion, never loosen beyond what proposeActions
 * already proposed (c.sizePct, itself already bounded by the user's own
 * max_trade_pct ceiling):
 *   - a positive measured edge caps the size to the (smaller, half-Kelly,
 *     capped-at-MAX_SUGGESTED_SIZE_PCT) suggested fraction — or, if that
 *     fraction is too small to clear the platform's minimum order size,
 *     rounds up just far enough to clear it, still never past c.sizePct;
 *   - a real measured negative edge drops the candidate entirely — the
 *     data says it loses money, so no floor or sizing trick should force it;
 *   - an unclear or insufficient-sample-size read (not "no signal", just
 *     "not enough resolved outcomes yet to confirm this specific signal/
 *     regime combo either way") is capped at the same
 *     MAX_SUGGESTED_SIZE_PCT ceiling positive-edge sizing itself never
 *     exceeds, rather than riding the full flat guardrail size untouched —
 *     an unvalidated signal must never be allowed to size larger than one
 *     the platform has actually confirmed is good.
 * Exported for direct testing — going through runAutopilotForUser
 * end-to-end means fighting syncPortfolio's real exchange-fetch behavior
 * (it unconditionally replaces portfolio_holdings based on what it
 * actually finds, which isn't what a sizing-logic test wants to exercise).
 */
export async function applyKellySizing(
  db: DB,
  userId: string,
  portfolio: PortfolioView,
  regime: string | null,
  candidates: Candidate[],
): Promise<Candidate[]> {
  const buys = candidates.filter((c) => c.kind === "buy");
  if (!buys.length) return candidates;

  const sizingByCandidate = new Map(
    await Promise.all(
      buys.map(
        async (c) =>
          [c, await computeSuggestedSizing(db, { score: c.conviction, regime, userId }).catch(() => null)] as const,
      ),
    ),
  );

  const out: Candidate[] = [];
  for (const c of candidates) {
    const sizing = c.kind === "buy" ? sizingByCandidate.get(c) : undefined;
    if (!sizing) {
      out.push(c);
      continue;
    }
    if (sizing.edge === "negative") {
      // Measured data says this score/regime doesn't pay off — don't propose it at all.
      continue;
    }
    if (sizing.edge === "positive" && sizing.suggestedSizePct < c.sizePct) {
      // Kelly's suggested fraction is itself hard-capped at 10% (see
      // MAX_SUGGESTED_SIZE_PCT in kelly-sizing.server.ts) — for any account
      // under roughly $60-100, 10% of totalUsd lands below MIN_ORDER_USD,
      // so a genuinely positive, measured edge could never clear the
      // exchange-minimum floor no matter how strong it was. Confirmed live:
      // a real, funded ($50+) account had every proposal blocked this way.
      // The edge assessment (worth betting at all) is separate from the
      // ideal-Kelly fraction (how much) — if the edge is positive, round the
      // size up to whatever actually clears the floor, capped at c.sizePct
      // so this still never exceeds the user's own guardrail ceiling
      // (proposeActions already sized c to that). If even c.sizePct can't
      // reach the floor, this can't help — checkGuardrails' min_order_size
      // check still correctly blocks it, same as before.
      const kellyNotional = (portfolio.totalUsd * sizing.suggestedSizePct) / 100;
      const minViablePct = portfolio.totalUsd > 0 ? (MIN_ORDER_USD / portfolio.totalUsd) * 100 : sizing.suggestedSizePct;
      const sizePct = kellyNotional < MIN_ORDER_USD ? Math.min(minViablePct, c.sizePct) : sizing.suggestedSizePct;
      const roundedUp = sizePct > sizing.suggestedSizePct;
      out.push({
        ...c,
        sizePct,
        notionalUsd: (portfolio.totalUsd * sizePct) / 100,
        rationale: roundedUp
          ? `${c.rationale} Kelly sizing (measured ${Math.round(sizing.hitProbability * 100)}% hit rate, ${sizing.sampleSize} samples) suggests ${sizing.suggestedSizePct}% of capital, but that's below the minimum order size — rounded up to ${sizePct.toFixed(1)}%.`
          : `${c.rationale} Kelly sizing (measured ${Math.round(sizing.hitProbability * 100)}% hit rate, ${sizing.sampleSize} samples) tightens this to ${sizing.suggestedSizePct}% of capital.`,
      });
      continue;
    }
    if (sizing.edge === "unclear" && c.sizePct > MAX_SUGGESTED_SIZE_PCT) {
      // "unclear" isn't "no information" — score/conviction already cleared
      // min_conviction and proposeActions' own band checks — it means the
      // platform hasn't measured enough resolved outcomes yet for this
      // signal/regime combo to confirm the edge either way (or it's
      // borderline). Before this, that case fell straight through to the
      // full flat guardrail size untouched, so a completely unvalidated
      // signal could size up to a user's full 40% ceiling while a signal
      // the platform HAD thoroughly validated as genuinely good stayed
      // capped at 10% — backwards from what "measured, disciplined sizing"
      // should mean. Cap it at the same ceiling positive-edge sizing itself
      // never exceeds, so confidence never decreases size relative to
      // having none.
      const sizePct = MAX_SUGGESTED_SIZE_PCT;
      out.push({
        ...c,
        sizePct,
        notionalUsd: (portfolio.totalUsd * sizePct) / 100,
        rationale: `${c.rationale} Not enough measured outcomes yet (${sizing.sampleSize} samples) to confirm an edge here — capped at ${sizePct}% until there's a validated track record.`,
      });
      continue;
    }
    out.push(c);
  }
  return out;
}

export async function runAutopilotForUser(
  db: DB,
  userId: string,
  opportunities: EliteOpportunity[],
  exitPerAsset: Record<string, ExitAssetSignal | undefined> = {},
  regime: string | null = null,
  /**
   * true from the 1-minute fast-alerts cycle: only the urgent "exit pressure
   * already at the High band" case is checked (never trims or new buys), and
   * the portfolio isn't re-synced against the exchange first — it reuses
   * whatever the last regular (5-minute) cycle already stored, since a fresh
   * exchange balance fetch for every armed user every single minute is the
   * same class of cost that caused the subrequest-limit incidents earlier.
   * Exit-pressure itself is already ~45s-fresh (brain-snapshot cache), so
   * the staleness this trades away is only "did the user's holdings change
   * in the last few minutes outside Autopilot" — narrow, and any mismatch
   * just caps the sell to whatever's actually on record, per checkGuardrails.
   * Point of this mode: a fast-forming exit signal no longer has to wait up
   * to 4 extra minutes for the next full cycle before Autopilot can act on it.
   */
  fastExitOnly = false,
): Promise<{ proposed: number; executed: number; blocked: number }> {
  const stats = { proposed: 0, executed: 0, blocked: 0 };
  const { isFeatureEnabled } = await import("./platform.server");
  if (!(await isFeatureEnabled(db as never, "autopilot"))) return stats;

  const settings = await loadSettings(db, userId);

  if (settings.kill_switch) return stats;

  if (settings.level !== "approve" && settings.level !== "autopilot") return stats;
  if (settings.level === "autopilot" && !settings.armed) return stats;

  if (!fastExitOnly) {
    try {
      await syncPortfolio(db, userId);
    } catch {
      /* fall back to the last stored snapshot */
    }
  }
  const portfolio = await loadPortfolioView(db, userId);
  if (portfolio.totalUsd <= 0) return stats;

  // fastExitOnly skips proposeActions entirely — it needs the ranked
  // opportunity universe (a heavier pass this cadence shouldn't pay for) and
  // this mode only ever wants the narrower, opportunities-independent check.
  const proposed = fastExitOnly
    ? proposeUrgentExits(portfolio, exitPerAsset, settings as Guardrails)
    : proposeActions(opportunities, portfolio, settings as Guardrails, exitPerAsset).slice(0, 5);
  const candidates = await applyKellySizing(db, userId, portfolio, regime, proposed);
  for (const c of candidates) {
    const recorded = await recordCandidate(db, userId, c, settings, portfolio);
    if (recorded.state === "blocked") {
      stats.blocked += 1;
      continue;
    }
    stats.proposed += 1;
    if (settings.level === "autopilot") {
      const res = await executeAction(db, userId, recorded.id);
      if (res.ok) stats.executed += 1;
    }
  }

  await audit(db, userId, "autopilot_run", stats);
  return stats;
}

/** Users the scheduler should evaluate. */
export async function activeAutopilotUsers(db: DB): Promise<string[]> {
  const { data } = await db
    .from("autopilot_settings")
    .select("user_id,level,armed,kill_switch")
    .in("level", ["approve", "autopilot"])
    .eq("kill_switch", false);
  return ((data ?? []) as { user_id: string; level: string; armed: boolean }[])
    .filter((r) => r.level === "approve" || r.armed)
    .map((r) => r.user_id);
}
