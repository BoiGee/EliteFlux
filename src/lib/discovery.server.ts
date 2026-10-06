// Server-only: token-discovery orchestration and persistence. Fetches new
// pairs + safety data (discovery-providers.server.ts), scores them
// (discovery-intel.ts, pure), upserts the registry, and feeds the existing
// signal-tracking learning loop. No execution code lives here beyond the
// structurally paper-only executeDiscoveryAction at the bottom — this file
// deliberately never imports vault.server.ts or exchanges.server.ts.
import type { DiscoveryTokenSignal } from "./discovery-intel";
import { computeDiscoveryTokenSignal } from "./discovery-intel";
import { buildRawTokenData, fetchNewPairs, DISCOVERY_NETWORKS, type DiscoveredPair } from "./discovery-providers.server";

type Admin = { from: (t: string) => any };

/** A scan caps how many brand-new candidates get a full safety-check spend per cycle — ranked by the cheap discovery-feed's own liquidity field first. Already-tracked active tokens are always re-checked regardless of this cap (see runDiscoveryScan). */
const MAX_NEW_CANDIDATES_PER_SCAN = 30;

export interface DiscoveryScanResult {
  scanned: number;
  safetyPassed: number;
  signalsRecorded: number;
  errors: number;
}

function candidateKey(network: string, tokenAddress: string): string {
  return `${network}:${tokenAddress}`;
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

async function upsertDiscoveredToken(admin: Admin, sig: DiscoveryTokenSignal): Promise<void> {
  await admin.from("discovered_tokens").upsert(
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
  );
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
  const result: DiscoveryScanResult = { scanned: 0, safetyPassed: 0, signalsRecorded: 0, errors: 0 };

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
          await upsertDiscoveredToken(admin, sig);
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

  return result;
}
