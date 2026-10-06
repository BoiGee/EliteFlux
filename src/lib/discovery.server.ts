// Server-only: token-discovery orchestration and persistence. Fetches new
// pairs + safety data (discovery-providers.server.ts), scores them
// (discovery-intel.ts, pure), upserts the registry, and feeds the existing
// signal-tracking learning loop. No execution code lives here beyond the
// structurally paper-only executeDiscoveryAction at the bottom — this file
// deliberately never imports vault.server.ts or exchanges.server.ts.
import type { DiscoveryTokenSignal } from "./discovery-intel";
import { computeDiscoveryTokenSignal } from "./discovery-intel";
import { buildRawTokenData, fetchNewPairs, DISCOVERY_NETWORKS, type DiscoveredPair } from "./discovery-providers.server";
import { DISCOVERY_DEFAULT_SETTINGS, type DiscoveryGuardrails, type DiscoverySettings } from "./autonomy";
import { proposeDiscoveryActions, checkDiscoveryGuardrails } from "./discovery-engine";

type Admin = { from: (t: string) => any };

export async function loadDiscoverySettings(db: Admin, userId: string): Promise<DiscoverySettings> {
  const { data } = await db.from("discovery_settings").select("*").eq("user_id", userId).maybeSingle();
  if (data) return data as DiscoverySettings;
  const seed = { user_id: userId, ...DISCOVERY_DEFAULT_SETTINGS };
  await db.from("discovery_settings").insert(seed as never);
  return { ...seed, disclosure_accepted_at: null } as DiscoverySettings;
}

/** Users the scheduler should evaluate — opted in, armed, and not halted. */
export async function activeDiscoveryUsers(db: Admin): Promise<string[]> {
  const { data } = await db
    .from("discovery_settings")
    .select("user_id")
    .eq("opted_in", true)
    .eq("armed", true)
    .eq("kill_switch", false);
  return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
}

/**
 * Execute a stored, guardrail-cleared discovery action. Every discovery
 * action is paper — this function deliberately never imports
 * vault.server.ts or exchanges.server.ts, so there is no live-order code
 * path here to accidentally reach, structurally, not just by a runtime
 * check. The aa_discovery_paper_only DB CHECK constraint is the second,
 * independent layer behind the same guarantee.
 */
export async function executeDiscoveryAction(
  db: Admin,
  userId: string,
  actionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const claim = await db
    .from("autopilot_actions")
    .update({ state: "executing", executing_since: new Date().toISOString() })
    .eq("id", actionId)
    .eq("user_id", userId)
    .eq("source", "discovery")
    .eq("state", "proposed")
    .select("id,notional_usd,reference_price");
  if (!claim.data?.length) return { ok: false, error: "Action not found or already being processed." };

  const row = claim.data[0] as { id: string; notional_usd: number | null; reference_price: number | null };
  const result = {
    simulated: true,
    notionalUsd: row.notional_usd,
    price: row.reference_price,
    filledAt: new Date().toISOString(),
  };
  await db
    .from("autopilot_actions")
    .update({ state: "executed", order_result: result, executed_at: new Date().toISOString() })
    .eq("id", actionId);
  return { ok: true };
}

// A paper position stays "open" (counted against max_open_positions and the
// allocation budget) for as long as its underlying signal_event's thesis
// hasn't naturally resolved yet — matches signal-tracking.server.ts's own
// MAX_HORIZON_MS (168h/7d), rather than inventing a second, disconnected
// lifecycle. After that window a position is treated as closed for
// guardrail purposes (its outcome has already been graded, win or lose),
// freeing the slot/budget for new candidates — without this, max_open_
// positions would be a lifetime cap of 3 trades ever, not a concurrent-
// exposure limit, defeating the point of an ongoing gradeable track record.
const DISCOVERY_OPEN_WINDOW_MS = 7 * 24 * 3600_000;

/**
 * One scheduled pass for a single opted-in, armed user: propose paper
 * positions from this scan's gate-passed signals and auto-execute every one
 * that clears guardrails. No separate approve step — every candidate is
 * paper, so there's nothing a manual approval would protect against that
 * the guardrails below don't already check.
 */
export async function runDiscoveryForUser(
  db: Admin,
  userId: string,
  signals: DiscoveryTokenSignal[],
  /** `${network}:${tokenAddress}` -> discovered_tokens.id, from this scan's own upserts. */
  idByKey: Map<string, string>,
): Promise<{ proposed: number; executed: number; blocked: number }> {
  const stats = { proposed: 0, executed: 0, blocked: 0 };
  const settings = await loadDiscoverySettings(db, userId);
  if (!settings.opted_in || !settings.armed || settings.kill_switch) return stats;

  const since = new Date(Date.now() - DISCOVERY_OPEN_WINDOW_MS).toISOString();
  const { data: openRows } = await db
    .from("autopilot_actions")
    .select("symbol,notional_usd")
    .eq("user_id", userId)
    .eq("source", "discovery")
    .eq("state", "executed")
    .gte("executed_at", since);
  const open = (openRows ?? []) as { symbol: string; notional_usd: number | null }[];
  const heldKeys = new Set(open.map((r) => r.symbol));
  let openCount = open.length;
  let allocationUsedUsd = open.reduce((s, r) => s + (r.notional_usd ?? 0), 0);

  const candidates = proposeDiscoveryActions(signals, heldKeys, settings as DiscoveryGuardrails)
    .slice(0, 5)
    .map((c) => ({ ...c, discoveredTokenId: idByKey.get(c.symbol) ?? "" }));
  for (const c of candidates) {
    const verdict = checkDiscoveryGuardrails(c, settings as DiscoveryGuardrails, openCount, allocationUsedUsd);
    const state = verdict.passed ? "proposed" : "blocked";
    const { data, error } = await db
      .from("autopilot_actions")
      .insert({
        user_id: userId,
        kind: "buy",
        symbol: c.symbol,
        notional_usd: verdict.cappedNotional,
        reference_price: c.referencePrice,
        conviction: c.opportunityScore,
        rationale: c.rationale,
        state,
        guardrail_verdict: verdict,
        blocked_reason: verdict.reason ?? null,
        paper: true,
        source: "discovery",
        discovered_token_id: c.discoveredTokenId || null,
        expires_at: new Date(Date.now() + 6 * 3600_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) continue;
    if (state === "blocked") {
      stats.blocked += 1;
      continue;
    }
    stats.proposed += 1;
    openCount += 1;
    allocationUsedUsd += verdict.cappedNotional;

    const id = (data as { id: string }).id;
    const res = await executeDiscoveryAction(db, userId, id);
    if (res.ok) stats.executed += 1;
  }
  return stats;
}

/** A scan caps how many brand-new candidates get a full safety-check spend per cycle — ranked by the cheap discovery-feed's own liquidity field first. Already-tracked active tokens are always re-checked regardless of this cap (see runDiscoveryScan). */
const MAX_NEW_CANDIDATES_PER_SCAN = 30;

export interface DiscoveryScanResult {
  scanned: number;
  safetyPassed: number;
  signalsRecorded: number;
  usersProcessed: number;
  actionsProposed: number;
  actionsExecuted: number;
  actionsBlocked: number;
  errors: number;
}

function candidateKey(network: string, tokenAddress: string): string {
  return `${network}:${tokenAddress}`;
}

/** Bounds one user's whole discovery pass so a slow safety-check batch can't stall the others — same pattern as jobs.server.ts's own withTimeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function loadActiveTrackedPairs(admin: Admin): Promise<DiscoveredPair[]> {
  const { data } = await admin
    .from("discovered_tokens")
    .select("network,token_address,pair_address,symbol,name,dex,quote_token_symbol,last_price_usd,last_liquidity_usd,last_volume_24h_usd,last_fdv_usd,pool_created_at")
    .eq("status", "active");
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    network: r.network as string,
    tokenAddress: r.token_address as string,
    pairAddress: (r.pair_address as string | null) ?? "",
    symbol: (r.symbol as string | null) ?? "",
    name: (r.name as string | null) ?? "",
    dex: (r.dex as string | null) ?? null,
    quoteTokenSymbol: (r.quote_token_symbol as string | null) ?? null,
    priceUsd: (r.last_price_usd as number | null) ?? 0,
    liquidityUsd: (r.last_liquidity_usd as number | null) ?? 0,
    volume24hUsd: (r.last_volume_24h_usd as number | null) ?? 0,
    fdvUsd: (r.last_fdv_usd as number | null) ?? null,
    poolCreatedAt: r.pool_created_at ? new Date(r.pool_created_at as string).getTime() : null,
  }));
}

async function upsertDiscoveredToken(admin: Admin, sig: DiscoveryTokenSignal): Promise<string | null> {
  const { data, error } = await admin
    .from("discovered_tokens")
    .upsert(
      {
        network: sig.network,
        token_address: sig.tokenAddress,
        pair_address: sig.pairAddress,
        symbol: sig.symbol,
        name: sig.name,
        last_price_usd: sig.priceUsd,
        last_liquidity_usd: sig.liquidityUsd,
        holder_count: sig.holderCount,
        top10_holder_pct: sig.top10HolderPct,
        safety_gate_passed: sig.safety.passed,
        safety_gate_reasons: sig.safety.failedReasons,
        safety_score: sig.safetyScore,
        opportunity_score: sig.opportunityScore,
        band: sig.band,
        contributors: sig.contributors as never,
        tags: sig.tags,
        rationale: sig.rationale,
        status: "active",
        last_checked_at: new Date().toISOString(),
      },
      { onConflict: "network,token_address" },
    )
    .select("id")
    .single();
  if (error) return null;
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * One scan cycle: detect new pairs across every covered network, re-check
 * already-tracked active tokens (a delayed/conditional honeypot can pass a
 * point-in-time check — re-checking is what catches a later flip), score
 * everything, persist, and record signal_events for gate-passed tokens so
 * the existing learning loop can grade them. Symbol is always
 * "${network}:${tokenAddress}", never a bare ticker — signal_events/
 * autopilot_actions are shared, type-agnostic tables, and a scam clone
 * sharing a ticker with a real curated-universe coin would otherwise
 * silently contaminate that coin's resolved-outcome history.
 */
export async function runDiscoveryScan(admin: Admin): Promise<DiscoveryScanResult> {
  const result: DiscoveryScanResult = {
    scanned: 0,
    safetyPassed: 0,
    signalsRecorded: 0,
    usersProcessed: 0,
    actionsProposed: 0,
    actionsExecuted: 0,
    actionsBlocked: 0,
    errors: 0,
  };

  const newPairsByNetwork = await Promise.all(
    DISCOVERY_NETWORKS.map((n) => fetchNewPairs(n).catch(() => [] as DiscoveredPair[])),
  );
  const newCandidates = newPairsByNetwork
    .flat()
    .sort((a, b) => b.liquidityUsd - a.liquidityUsd)
    .slice(0, MAX_NEW_CANDIDATES_PER_SCAN);

  const tracked = await loadActiveTrackedPairs(admin);

  const byKey = new Map<string, DiscoveredPair>();
  for (const p of tracked) byKey.set(candidateKey(p.network, p.tokenAddress), p);
  for (const p of newCandidates) byKey.set(candidateKey(p.network, p.tokenAddress), p); // fresh feed data wins over a stale tracked row

  const signals: DiscoveryTokenSignal[] = [];
  const idByKey = new Map<string, string>();
  const entries = [...byKey.values()];
  const CONCURRENCY = 5;
  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const slice = entries.slice(i, i + CONCURRENCY);
    await Promise.all(
      slice.map(async (pair) => {
        result.scanned++;
        try {
          const raw = await buildRawTokenData(pair);
          const sig = computeDiscoveryTokenSignal(raw);
          signals.push(sig);
          if (sig.safety.passed) result.safetyPassed++;
          const id = await upsertDiscoveredToken(admin, sig);
          if (id) idByKey.set(candidateKey(sig.network, sig.tokenAddress), id);
        } catch (e) {
          result.errors++;
          console.error("discovery scan: token processing failed", pair.network, pair.tokenAddress, e);
        }
      }),
    );
  }

  const { recordSignalEvents } = await import("./signal-tracking.server");
  const events = signals
    .filter((s) => s.safety.passed)
    .map((s) => ({
      signal_type: "token_discovery",
      symbol: candidateKey(s.network, s.tokenAddress),
      score: s.opportunityScore,
      band: s.band,
      reference_price: s.priceUsd,
      context: {
        network: s.network,
        tokenAddress: s.tokenAddress,
        dex: s.pairAddress,
        liquidityUsd: s.liquidityUsd,
        holderCount: s.holderCount,
      },
    }));
  result.signalsRecorded = await recordSignalEvents(admin as never, events);

  const passedSignals = signals.filter((s) => s.safety.passed);
  if (passedSignals.length) {
    const users = await activeDiscoveryUsers(admin);
    result.usersProcessed = users.length;
    const USER_CONCURRENCY = 5;
    for (let i = 0; i < users.length; i += USER_CONCURRENCY) {
      const slice = users.slice(i, i + USER_CONCURRENCY);
      await Promise.all(
        slice.map(async (uid) => {
          try {
            const s = await withTimeout(
              runDiscoveryForUser(admin, uid, passedSignals, idByKey),
              30_000,
              `runDiscoveryForUser:${uid}`,
            );
            result.actionsProposed += s.proposed;
            result.actionsExecuted += s.executed;
            result.actionsBlocked += s.blocked;
          } catch (e) {
            result.errors++;
            console.error("discovery per-user run failed", uid, e);
          }
        }),
      );
    }
  }

  return result;
}
