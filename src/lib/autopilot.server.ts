// Server-only autopilot execution: guardrail enforcement, order routing and
// audit logging. Paper mode simulates fills; live mode places spot orders.
import type { SupabaseClient } from "@supabase/supabase-js";
import { open } from "./vault.server";
import { placeSpotOrder, type Venue } from "./exchanges.server";
import { loadPortfolioView, syncPortfolio } from "./portfolio.server";
import {
  checkGuardrails,
  proposeActions,
  type Candidate,
  type DayUsage,
  type PortfolioView,
} from "./autopilot-engine";
import { DEFAULT_SETTINGS, type AutopilotSettings, type Guardrails } from "./autonomy";
import type { EliteOpportunity } from "./recommendation-engine";
import type { ExitAssetSignal } from "./exit-intel";
import { computeSuggestedSizing } from "./kelly-sizing.server";

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
  } as AutopilotSettings;
}

/** Trades already executed today, used by the daily guardrails. */
export async function todayUsage(db: DB, userId: string): Promise<DayUsage> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data } = await db
    .from("autopilot_actions")
    .select("notional_usd")
    .eq("user_id", userId)
    .eq("state", "executed")
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
    .eq("state", "executed")
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
  const { data: pending } = await db
    .from("autopilot_actions")
    .select("id")
    .eq("user_id", userId)
    .eq("symbol", c.symbol)
    .in("state", ["proposed", "approved"])
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (pending) {
    const id = (pending as { id: string }).id;
    return { id, state: "proposed" };
  }

  const usage = await todayUsage(db, userId);
  const ago = await hoursSinceLastTrade(db, userId, c.symbol);
  const verdict = checkGuardrails(c, settings as Guardrails, portfolio, usage, ago, null);

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
  const verdict = checkGuardrails(candidate, settings as Guardrails, portfolio, usage, ago, null);
  if (!verdict.passed) {
    await db
      .from("autopilot_actions")
      .update({ state: "blocked", blocked_reason: verdict.reason, guardrail_verdict: verdict as never })
      .eq("id", actionId);
    await audit(db, userId, "execution_blocked", verdict, actionId);
    return { ok: false, error: verdict.reason ?? "Blocked by guardrails." };
  }

  const notional = verdict.cappedNotional;
  const price = candidate.referencePrice || 0;

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
      apiKey: open(conn.api_key_ciphertext),
      apiSecret: open(conn.api_secret_ciphertext),
      passphrase: conn.passphrase_ciphertext ? open(conn.passphrase_ciphertext) : null,
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

/**
 * One scheduled pass for a single user: refresh the book, propose actions and
 * — at autopilot level — execute the ones that clear every guardrail.
 */
/**
 * Buy candidates come out of proposeActions at a flat sizePct (the
 * guardrail's max_trade_pct) — proposeActions is a pure function with no DB
 * access, so it can't know whether the platform has actually measured a
 * positive edge at this score/regime. Kelly sizing can only tighten what
 * proposeActions already proposed, never loosen it: a positive measured
 * edge caps the size to the (smaller, half-Kelly, capped) suggested
 * fraction; a real measured negative edge drops the candidate entirely;
 * an unclear or insufficient-sample-size read leaves the flat guardrail
 * sizing untouched rather than guessing.
 */
async function applyKellySizing(
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
      out.push({
        ...c,
        sizePct: sizing.suggestedSizePct,
        notionalUsd: (portfolio.totalUsd * sizing.suggestedSizePct) / 100,
        rationale: `${c.rationale} Kelly sizing (measured ${Math.round(sizing.hitProbability * 100)}% hit rate, ${sizing.sampleSize} samples) tightens this to ${sizing.suggestedSizePct}% of capital.`,
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
): Promise<{ proposed: number; executed: number; blocked: number }> {
  const stats = { proposed: 0, executed: 0, blocked: 0 };
  const { isFeatureEnabled } = await import("./platform.server");
  if (!(await isFeatureEnabled(db as never, "autopilot"))) return stats;

  const settings = await loadSettings(db, userId);

  if (settings.kill_switch) return stats;

  if (settings.level !== "approve" && settings.level !== "autopilot") return stats;
  if (settings.level === "autopilot" && !settings.armed) return stats;

  try {
    await syncPortfolio(db, userId);
  } catch {
    /* fall back to the last stored snapshot */
  }
  const portfolio = await loadPortfolioView(db, userId);
  if (portfolio.totalUsd <= 0) return stats;

  const proposed = proposeActions(opportunities, portfolio, settings as Guardrails, exitPerAsset).slice(0, 5);
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
