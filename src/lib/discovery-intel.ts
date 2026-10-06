// ============================================================
// Token Discovery Intelligence
// ------------------------------------------------------------
// Scores brand-new, not-yet-centralized-exchange-listed tokens on two
// deliberately separate axes: a hard safety GATE (contract/mint
// verification, honeypot check, LP lock, holder concentration, tax) and,
// only for tokens that clear it, a 0..100 opportunity score (liquidity
// depth, holder distribution, volume momentum, age seasoning). A token
// failing the gate must never show a misleadingly "medium" opportunity
// number — opportunityScore is forced to 0 whenever the gate fails, and
// safetyScore is reported as its own informational field, never blended
// into the opportunity math.
//
// Pure, no IO — mirrors exit-intel.ts's shape. Fetching raw provider data
// is discovery-providers.server.ts's job; this module only scores whatever
// RawTokenData it's handed.
//
// Known, stated limitation, not a solved problem: wash-distributed holder
// concentration (many wallets, one real controller) is a genuine blind spot
// this gate does not close. discovery_settings' position-size and
// allocation-budget caps exist as an independent second line of defense for
// exactly this reason — this score is a screen, not a guarantee.
// ============================================================

export type SafetyCheckId =
  | "contract_verified" // EVM only
  | "not_honeypot" // both
  | "mint_authority_revoked" // Solana only
  | "freeze_authority_revoked" // Solana only
  | "lp_locked_or_burned" // both
  | "owner_renounced" // EVM only
  | "tax_within_bounds" // both
  | "holder_concentration" // both
  | "liquidity_floor"; // both

export type SafetyCheckResult = "pass" | "fail" | "unavailable";

export interface SafetyCheck {
  id: SafetyCheckId;
  result: SafetyCheckResult;
  detail: string;
}

export interface SafetyGateVerdict {
  /** false if ANY applicable check is "fail" OR "unavailable" — missing data is never treated as neutral. */
  passed: boolean;
  checks: SafetyCheck[];
  failedReasons: string[];
}

export type DiscoveryBand = "Unsafe" | "Caution" | "Emerging" | "Strong Signal";

export interface DiscoveryContributors {
  liquidityDepth: number; // 0..100
  holderDistribution: number; // 0..100
  volumeMomentum: number; // 0..100
  ageSeasoning: number; // 0..100
}

export interface DiscoveryTokenSignal {
  network: string;
  tokenAddress: string;
  pairAddress: string | null;
  symbol: string;
  name: string;
  safety: SafetyGateVerdict;
  /** 0..100 — margin above the pass bar on checks that resolved. Informational only, never feeds opportunityScore. */
  safetyScore: number;
  /** 0..100 — forced to 0 whenever safety.passed is false. */
  opportunityScore: number;
  band: DiscoveryBand;
  contributors: DiscoveryContributors;
  tags: string[];
  rationale: string;
  liquidityUsd: number;
  holderCount: number | null;
  top10HolderPct: number | null;
  priceUsd: number;
  ageMinutes: number;
  generatedAt: number;
}

/** Raw per-token data, already fetched by discovery-providers.server.ts — this module never calls out itself. */
export interface RawTokenData {
  network: string;
  tokenAddress: string;
  pairAddress: string | null;
  symbol: string;
  name: string;
  priceUsd: number;
  liquidityUsd: number;
  volume24hUsd: number;
  poolCreatedAt: number | null; // epoch ms
  holderCount: number | null;
  top10HolderPct: number | null;
  lpLockedPct: number | null;
  isHoneypot: boolean | null;
  buyTaxPct: number | null;
  sellTaxPct: number | null;
  /** EVM only — null (not false) when the chain doesn't have this concept, distinct from "checked and found not verified". */
  sourceVerified: boolean | null;
  ownerRenounced: boolean | null;
  /** Solana only. */
  mintAuthorityRevoked: boolean | null;
  freezeAuthorityRevoked: boolean | null;
}

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

const SOLANA_NETWORKS = new Set(["solana"]);
export const isSolanaNetwork = (network: string) => SOLANA_NETWORKS.has(network);

const MIN_LIQUIDITY_USD = 2_000;
const LP_LOCK_MIN_PCT = 80;
const MAX_TOP10_HOLDER_PCT = 50;
const MAX_TAX_PCT = 10;

/**
 * Hard pre-filter. Every check APPLICABLE to the token's chain must resolve
 * "pass" — a check that doesn't apply to this chain (e.g. mint authority on
 * an EVM token) is simply omitted, not counted either way. "unavailable"
 * (provider timeout, missing data) is treated identically to "fail": a gap
 * in data must never read as "probably fine".
 */
export function computeSafetyGate(raw: RawTokenData): SafetyGateVerdict {
  const solana = isSolanaNetwork(raw.network);
  const checks: SafetyCheck[] = [];
  const add = (id: SafetyCheckId, result: SafetyCheckResult, detail: string) => checks.push({ id, result, detail });

  if (solana) {
    add(
      "mint_authority_revoked",
      raw.mintAuthorityRevoked === true ? "pass" : raw.mintAuthorityRevoked === false ? "fail" : "unavailable",
      raw.mintAuthorityRevoked === null
        ? "mint authority status unavailable — treated as unsafe"
        : raw.mintAuthorityRevoked
          ? "mint authority revoked"
          : "mint authority still active — supply can be inflated at will",
    );
    add(
      "freeze_authority_revoked",
      raw.freezeAuthorityRevoked === true ? "pass" : raw.freezeAuthorityRevoked === false ? "fail" : "unavailable",
      raw.freezeAuthorityRevoked === null
        ? "freeze authority status unavailable — treated as unsafe"
        : raw.freezeAuthorityRevoked
          ? "freeze authority revoked"
          : "freeze authority still active — holder accounts can be frozen",
    );
  } else {
    add(
      "contract_verified",
      raw.sourceVerified === true ? "pass" : raw.sourceVerified === false ? "fail" : "unavailable",
      raw.sourceVerified === null
        ? "contract verification status unavailable — treated as unsafe"
        : raw.sourceVerified
          ? "contract source verified"
          : "contract source not verified",
    );
    add(
      "owner_renounced",
      raw.ownerRenounced === true ? "pass" : raw.ownerRenounced === false ? "fail" : "unavailable",
      raw.ownerRenounced === null
        ? "owner status unavailable — treated as unsafe"
        : raw.ownerRenounced
          ? "ownership renounced"
          : "owner retains privileged control",
    );
  }

  add(
    "not_honeypot",
    raw.isHoneypot === false ? "pass" : raw.isHoneypot === true ? "fail" : "unavailable",
    raw.isHoneypot === null
      ? "honeypot check unavailable — treated as unsafe"
      : raw.isHoneypot
        ? "honeypot behavior detected — sells may be blocked"
        : "no honeypot behavior detected",
  );

  add(
    "lp_locked_or_burned",
    raw.lpLockedPct === null ? "unavailable" : raw.lpLockedPct >= LP_LOCK_MIN_PCT ? "pass" : "fail",
    raw.lpLockedPct === null
      ? "LP lock status unavailable — treated as unsafe"
      : `${raw.lpLockedPct.toFixed(0)}% of liquidity locked/burned (need ${LP_LOCK_MIN_PCT}%+)`,
  );

  const taxUnavailable = raw.buyTaxPct === null || raw.sellTaxPct === null;
  const taxTooHigh = !taxUnavailable && (raw.buyTaxPct! > MAX_TAX_PCT || raw.sellTaxPct! > MAX_TAX_PCT);
  add(
    "tax_within_bounds",
    taxUnavailable ? "unavailable" : taxTooHigh ? "fail" : "pass",
    taxUnavailable
      ? "buy/sell tax unavailable — treated as unsafe"
      : `buy ${raw.buyTaxPct!.toFixed(1)}% / sell ${raw.sellTaxPct!.toFixed(1)}% (cap ${MAX_TAX_PCT}%)`,
  );

  add(
    "holder_concentration",
    raw.top10HolderPct === null
      ? "unavailable"
      : raw.top10HolderPct <= MAX_TOP10_HOLDER_PCT
        ? "pass"
        : "fail",
    raw.top10HolderPct === null
      ? "holder concentration unavailable — treated as unsafe"
      : `top 10 holders control ${raw.top10HolderPct.toFixed(0)}% (cap ${MAX_TOP10_HOLDER_PCT}%)`,
  );

  add(
    "liquidity_floor",
    raw.liquidityUsd >= MIN_LIQUIDITY_USD ? "pass" : "fail",
    `$${raw.liquidityUsd.toFixed(0)} liquidity (floor $${MIN_LIQUIDITY_USD})`,
  );

  const failed = checks.filter((c) => c.result !== "pass");
  return {
    passed: failed.length === 0,
    checks,
    failedReasons: failed.map((c) => c.detail),
  };
}

/** Margin above the pass bar on checks that actually resolved (pass or fail) — unavailable checks don't count toward or against it, since they already force passed=false above. Purely informational. */
function computeSafetyScore(gate: SafetyGateVerdict): number {
  const resolved = gate.checks.filter((c) => c.result !== "unavailable");
  if (!resolved.length) return 0;
  const passed = resolved.filter((c) => c.result === "pass").length;
  return Math.round((passed / resolved.length) * 100);
}

function scoreLiquidityDepth(liquidityUsd: number): number {
  if (liquidityUsd <= 0) return 0;
  // $5k -> ~29, $25k -> ~52, $100k -> ~74, $500k+ -> 100
  return clamp(Math.log10(liquidityUsd / 1000 + 1) * 37);
}

function scoreHolderDistribution(top10HolderPct: number | null): number {
  if (top10HolderPct === null) return 0; // no data — don't reward what wasn't measured
  return clamp(100 - top10HolderPct);
}

function scoreVolumeMomentum(volume24hUsd: number, liquidityUsd: number): number {
  if (liquidityUsd <= 0) return 0;
  return clamp((volume24hUsd / liquidityUsd) * 40);
}

function scoreAgeSeasoning(ageMinutes: number): number {
  if (ageMinutes <= 0) return 0;
  const ageHours = ageMinutes / 60;
  // 1h -> ~15, 6h -> ~42, 24h -> ~70, 72h -> ~94, 7d+ -> 100
  return clamp(Math.log2(ageHours + 1) * 15);
}

function bandFor(gate: SafetyGateVerdict, opportunityScore: number): DiscoveryBand {
  if (!gate.passed) return "Unsafe";
  if (opportunityScore >= 75) return "Strong Signal";
  if (opportunityScore >= 45) return "Emerging";
  return "Caution";
}

export function computeDiscoveryTokenSignal(raw: RawTokenData, now = Date.now()): DiscoveryTokenSignal {
  const safety = computeSafetyGate(raw);
  const safetyScore = computeSafetyScore(safety);
  const ageMinutes = raw.poolCreatedAt ? Math.max(0, (now - raw.poolCreatedAt) / 60_000) : 0;

  const contributors: DiscoveryContributors = {
    liquidityDepth: Math.round(scoreLiquidityDepth(raw.liquidityUsd)),
    holderDistribution: Math.round(scoreHolderDistribution(raw.top10HolderPct)),
    volumeMomentum: Math.round(scoreVolumeMomentum(raw.volume24hUsd, raw.liquidityUsd)),
    ageSeasoning: Math.round(scoreAgeSeasoning(ageMinutes)),
  };

  // Opportunity math only matters once the gate has already passed — forced
  // to 0 otherwise so a failing token can never show a misleadingly
  // "medium" number regardless of how good its liquidity/holders look.
  const rawOpportunity = Math.round(
    clamp(
      contributors.liquidityDepth * 0.3 +
        contributors.holderDistribution * 0.25 +
        contributors.volumeMomentum * 0.25 +
        contributors.ageSeasoning * 0.2,
    ),
  );
  const opportunityScore = safety.passed ? rawOpportunity : 0;
  const band = bandFor(safety, opportunityScore);

  const tags: string[] = [];
  if (!safety.passed) tags.push(...safety.failedReasons.slice(0, 3));
  if (safety.passed && contributors.liquidityDepth >= 70) tags.push("Deep liquidity");
  if (safety.passed && contributors.holderDistribution >= 70) tags.push("Well distributed");
  if (safety.passed && contributors.volumeMomentum >= 70) tags.push("High turnover");
  if (safety.passed && ageMinutes < 60) tags.push("Just launched");

  const rationale = !safety.passed
    ? `Failed the safety gate: ${safety.failedReasons[0] ?? "unresolved check"}.`
    : `Opportunity score ${opportunityScore} — ${tags.slice(0, 2).join(", ") || "baseline read, no standout factor"}.`;

  return {
    network: raw.network,
    tokenAddress: raw.tokenAddress,
    pairAddress: raw.pairAddress,
    symbol: raw.symbol,
    name: raw.name,
    safety,
    safetyScore,
    opportunityScore,
    band,
    contributors,
    tags: Array.from(new Set(tags)).slice(0, 5),
    rationale,
    liquidityUsd: raw.liquidityUsd,
    holderCount: raw.holderCount,
    top10HolderPct: raw.top10HolderPct,
    priceUsd: raw.priceUsd,
    ageMinutes: Math.round(ageMinutes),
    generatedAt: now,
  };
}
