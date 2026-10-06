// Server-only: raw external-data fetchers for token discovery. Follows
// onchain-intel.ts's exact calling convention — process.env key read
// (gated, never throws on a missing key), AbortController + 8s timeout,
// per-item try/catch so one bad lookup doesn't kill a batch, response body
// drained on non-ok. Every function here returns null/[] on any failure;
// discovery-intel.ts's fail-closed safety gate is what turns "no data" into
// "treated as unsafe" — this layer's job is only to fetch, never to decide.
//
// IMPORTANT: GeckoTerminal/DexScreener/GoPlus/RugCheck response shapes below
// are this module's best-effort understanding of each provider's public API
// as of the time this was written — external APIs change. Before wiring the
// discover-tokens cron (jobs.server.ts), manually call runDiscoveryScan
// once and inspect real parsed output against each provider's current docs,
// per the implementation plan's own verification step. Don't trust this
// file's parsing as correct-by-construction.
import type { RawTokenData } from "./discovery-intel";
export { DISCOVERY_NETWORKS } from "./autonomy";

const TIMEOUT_MS = 8_000;

async function timedFetch(url: string, init?: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      res.body?.cancel().catch(() => {});
      return null;
    }
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function timedJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  const res = await timedFetch(url, init);
  if (!res) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// New-pair detection: GeckoTerminal primary, DexScreener fallback — mirrors
// brain-server.ts's tickerSources() try-in-order array.
// ---------------------------------------------------------------------------

export interface DiscoveredPair {
  network: string;
  tokenAddress: string;
  pairAddress: string;
  symbol: string;
  name: string;
  dex: string | null;
  quoteTokenSymbol: string | null;
  priceUsd: number;
  liquidityUsd: number;
  volume24hUsd: number;
  fdvUsd: number | null;
  poolCreatedAt: number | null;
}

interface GeckoTerminalPoolsResponse {
  data?: Array<{
    id: string;
    attributes?: {
      address?: string;
      name?: string;
      base_token_price_usd?: string;
      reserve_in_usd?: string;
      pool_created_at?: string;
      fdv_usd?: string;
      volume_usd?: { h24?: string };
    };
    relationships?: {
      base_token?: { data?: { id?: string } };
      dex?: { data?: { id?: string } };
    };
  }>;
  included?: Array<{
    id: string;
    type: string;
    attributes?: { address?: string; name?: string; symbol?: string };
  }>;
}

async function fetchGeckoTerminalNewPools(network: string): Promise<DiscoveredPair[]> {
  const body = await timedJson<GeckoTerminalPoolsResponse>(
    `https://api.geckoterminal.com/api/v2/networks/${network}/new_pools?page=1`,
    { headers: { Accept: "application/json;version=20230302" } },
  );
  if (!body?.data) return [];

  const tokenById = new Map((body.included ?? []).filter((r) => r.type === "token").map((r) => [r.id, r.attributes]));

  const out: DiscoveredPair[] = [];
  for (const pool of body.data) {
    const a = pool.attributes;
    if (!a?.address) continue;
    const baseTokenId = pool.relationships?.base_token?.data?.id;
    const token = baseTokenId ? tokenById.get(baseTokenId) : undefined;
    if (!token?.address || !token.symbol) continue;

    out.push({
      network,
      // EVM addresses are case-insensitive hex, lowercased for consistent
      // lookups/keys; Solana base58 addresses are case-sensitive — mangling
      // one corrupts it into an address nothing resolves to, which silently
      // fails every safety check downstream (fail-closed, but for the wrong
      // reason: "address wrong" reads identically to "data unavailable").
      tokenAddress: isSolana(network) ? token.address : token.address.toLowerCase(),
      pairAddress: a.address,
      symbol: token.symbol,
      name: token.name ?? token.symbol,
      dex: pool.relationships?.dex?.data?.id ?? null,
      quoteTokenSymbol: null,
      priceUsd: Number(a.base_token_price_usd ?? 0),
      liquidityUsd: Number(a.reserve_in_usd ?? 0),
      volume24hUsd: Number(a.volume_usd?.h24 ?? 0),
      fdvUsd: a.fdv_usd ? Number(a.fdv_usd) : null,
      poolCreatedAt: a.pool_created_at ? new Date(a.pool_created_at).getTime() : null,
    });
  }
  return out;
}

interface DexScreenerPairsResponse {
  pairs?: Array<{
    chainId?: string;
    dexId?: string;
    pairAddress?: string;
    baseToken?: { address?: string; name?: string; symbol?: string };
    quoteToken?: { symbol?: string };
    priceUsd?: string;
    liquidity?: { usd?: number };
    volume?: { h24?: number };
    fdv?: number;
    pairCreatedAt?: number; // epoch ms
  }>;
}

const DEXSCREENER_CHAIN_IDS: Record<string, string> = {
  eth: "ethereum",
  bsc: "bsc",
  base: "base",
  arbitrum: "arbitrum",
  solana: "solana",
};

async function fetchDexScreenerNewPairs(network: string): Promise<DiscoveredPair[]> {
  const chainId = DEXSCREENER_CHAIN_IDS[network] ?? network;
  const body = await timedJson<DexScreenerPairsResponse>(
    `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(chainId)}`,
  );
  if (!body?.pairs) return [];

  const out: DiscoveredPair[] = [];
  for (const p of body.pairs) {
    if (p.chainId !== chainId || !p.pairAddress || !p.baseToken?.address || !p.baseToken.symbol) continue;
    out.push({
      network,
      tokenAddress: isSolana(network) ? p.baseToken.address : p.baseToken.address.toLowerCase(),
      pairAddress: p.pairAddress,
      symbol: p.baseToken.symbol,
      name: p.baseToken.name ?? p.baseToken.symbol,
      dex: p.dexId ?? null,
      quoteTokenSymbol: p.quoteToken?.symbol ?? null,
      priceUsd: Number(p.priceUsd ?? 0),
      liquidityUsd: p.liquidity?.usd ?? 0,
      volume24hUsd: p.volume?.h24 ?? 0,
      fdvUsd: p.fdv ?? null,
      poolCreatedAt: p.pairCreatedAt ?? null,
    });
  }
  return out;
}

/** Try GeckoTerminal first, fall back to DexScreener only if it returned nothing. */
export async function fetchNewPairs(network: string): Promise<DiscoveredPair[]> {
  const primary = await fetchGeckoTerminalNewPools(network);
  if (primary.length) return primary;
  return fetchDexScreenerNewPairs(network);
}

// ---------------------------------------------------------------------------
// Contract/mint safety: GoPlus Security (EVM + Solana), RugCheck.xyz
// (Solana second opinion). Fails closed on disagreement rather than
// averaging — see mergeSolanaSafety below.
// ---------------------------------------------------------------------------

export interface SafetyLookup {
  isHoneypot: boolean | null;
  buyTaxPct: number | null;
  sellTaxPct: number | null;
  lpLockedPct: number | null;
  holderCount: number | null;
  top10HolderPct: number | null;
  sourceVerified: boolean | null; // EVM only
  ownerRenounced: boolean | null; // EVM only
}

const GOPLUS_CHAIN_IDS: Record<string, string> = { eth: "1", bsc: "56", base: "8453", arbitrum: "42161" };

interface GoPlusEvmResult {
  is_honeypot?: string;
  is_open_source?: string;
  owner_address?: string;
  buy_tax?: string;
  sell_tax?: string;
  holder_count?: string;
  lp_holders?: Array<{ percent?: string; is_locked?: number }>;
  holders?: Array<{ percent?: string }>;
}

async function fetchGoPlusEvmSafety(network: string, tokenAddress: string): Promise<SafetyLookup | null> {
  const chainId = GOPLUS_CHAIN_IDS[network];
  if (!chainId) return null;
  const apiKey = process.env["GOPLUS_API_KEY"]; // optional — higher rate limit when set, works without one
  const body = await timedJson<{ code?: number; result?: Record<string, GoPlusEvmResult> }>(
    `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${tokenAddress}`,
    apiKey ? { headers: { Authorization: apiKey } } : undefined,
  );
  const r = body?.result?.[tokenAddress.toLowerCase()];
  if (!r) return null;

  const lockedPct = (r.lp_holders ?? [])
    .filter((h) => h.is_locked === 1)
    .reduce((sum, h) => sum + Number(h.percent ?? 0), 0);
  const top10Pct = (r.holders ?? [])
    .slice(0, 10)
    .reduce((sum, h) => sum + Number(h.percent ?? 0), 0);

  return {
    isHoneypot: r.is_honeypot === undefined ? null : r.is_honeypot === "1",
    buyTaxPct: r.buy_tax !== undefined ? Number(r.buy_tax) * 100 : null,
    sellTaxPct: r.sell_tax !== undefined ? Number(r.sell_tax) * 100 : null,
    lpLockedPct: r.lp_holders ? Math.round(lockedPct * 100) : null,
    holderCount: r.holder_count !== undefined ? Number(r.holder_count) : null,
    top10HolderPct: r.holders ? Math.round(top10Pct * 100) : null,
    sourceVerified: r.is_open_source === undefined ? null : r.is_open_source === "1",
    ownerRenounced: r.owner_address === undefined ? null : /^(0x0+|null)?$/i.test(r.owner_address),
  };
}

interface RugCheckReport {
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
  topHolders?: Array<{ pct?: number }>;
  markets?: Array<{ liquidity?: number; lp?: { lpLockedPct?: number } }>;
}

async function fetchRugCheckSolana(tokenAddress: string): Promise<{
  mintAuthorityRevoked: boolean | null;
  freezeAuthorityRevoked: boolean | null;
  top10HolderPct: number | null;
  lpLockedPct: number | null;
} | null> {
  const body = await timedJson<RugCheckReport>(`https://api.rugcheck.xyz/v1/tokens/${tokenAddress}/report`);
  if (!body) return null;
  const top10Pct = (body.topHolders ?? []).slice(0, 10).reduce((s, h) => s + (h.pct ?? 0), 0);
  const lpLocked = body.markets?.[0]?.lp?.lpLockedPct;
  return {
    mintAuthorityRevoked: body.mintAuthority === undefined ? null : !body.mintAuthority,
    freezeAuthorityRevoked: body.freezeAuthority === undefined ? null : !body.freezeAuthority,
    top10HolderPct: body.topHolders ? Math.round(top10Pct) : null,
    lpLockedPct: lpLocked !== undefined ? Math.round(lpLocked) : null,
  };
}

// ---------------------------------------------------------------------------
// Free, provider-independent Solana mint/freeze-authority cross-check — the
// SPL Token Mint account layout is a fixed, well-known 82-byte C-style
// struct (not Borsh), stable since the program's launch: a 4-byte u32
// "option" tag (0 = None/revoked, 1 = Some/active) + 32-byte pubkey for
// mintAuthority, then 8-byte supply + 1-byte decimals + 1-byte
// isInitialized, then the same option+pubkey shape for freezeAuthority.
// Duplicated from wallets.server.ts's rpc() helper rather than exported
// from it — lower risk than changing an existing module's public surface
// for this unrelated consumer.
// ---------------------------------------------------------------------------

const SOL_RPC = "https://api.mainnet-beta.solana.com";

async function solanaRpc(method: string, params: unknown[]): Promise<unknown> {
  const body = await timedJson<{ result?: unknown; error?: { message?: string } }>(SOL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!body || body.error) return null;
  return body.result;
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const readU32LE = (bytes: Uint8Array, offset: number) =>
  bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24);

/**
 * Pure decode of an SPL Token Mint account's two COption<Pubkey> authority
 * fields from its raw 82-byte layout. Separated from the RPC call so the
 * byte-offset math (the part a mistake here would get silently wrong,
 * rather than visibly fail) can be unit-tested without mocking a network
 * response.
 */
export function decodeMintAuthorities(
  bytes: Uint8Array,
): { mintAuthorityRevoked: boolean | null; freezeAuthorityRevoked: boolean | null } {
  if (bytes.length < 82) return { mintAuthorityRevoked: null, freezeAuthorityRevoked: null };
  const mintAuthorityOption = readU32LE(bytes, 0);
  const freezeAuthorityOption = readU32LE(bytes, 4 + 32 + 8 + 1 + 1);
  return {
    mintAuthorityRevoked: mintAuthorityOption === 0,
    freezeAuthorityRevoked: freezeAuthorityOption === 0,
  };
}

export async function fetchSolanaMintAuthorityStatus(
  mintAddress: string,
): Promise<{ mintAuthorityRevoked: boolean | null; freezeAuthorityRevoked: boolean | null }> {
  try {
    const result = (await solanaRpc("getAccountInfo", [mintAddress, { encoding: "base64" }])) as {
      value: { data: [string, string] } | null;
    } | null;
    const b64 = result?.value?.data?.[0];
    if (!b64) return { mintAuthorityRevoked: null, freezeAuthorityRevoked: null };
    return decodeMintAuthorities(base64ToBytes(b64));
  } catch {
    return { mintAuthorityRevoked: null, freezeAuthorityRevoked: null };
  }
}

// ---------------------------------------------------------------------------
// Orchestration: combine a discovered pair with its safety lookups into the
// RawTokenData shape discovery-intel.ts scores.
// ---------------------------------------------------------------------------

function isSolana(network: string): boolean {
  return network === "solana";
}

export async function buildRawTokenData(pair: DiscoveredPair): Promise<RawTokenData> {
  if (isSolana(pair.network)) {
    // Two independent sources for Solana: RugCheck's report, and a free RPC
    // read of the mint account itself. Fail closed (unavailable) rather
    // than average when they materially disagree on authority status.
    const [rugCheck, rpcAuthorities] = await Promise.all([
      fetchRugCheckSolana(pair.tokenAddress),
      fetchSolanaMintAuthorityStatus(pair.tokenAddress),
    ]);

    const reconcile = (a: boolean | null, b: boolean | null): boolean | null => {
      if (a === null) return b;
      if (b === null) return a;
      return a === b ? a : null; // disagreement -> unavailable, not averaged
    };

    return {
      network: pair.network,
      tokenAddress: pair.tokenAddress,
      pairAddress: pair.pairAddress,
      symbol: pair.symbol,
      name: pair.name,
      priceUsd: pair.priceUsd,
      liquidityUsd: pair.liquidityUsd,
      volume24hUsd: pair.volume24hUsd,
      poolCreatedAt: pair.poolCreatedAt,
      holderCount: null, // RugCheck's report doesn't expose a plain count in this shape — top10 pct is what feeds the gate/score
      top10HolderPct: rugCheck?.top10HolderPct ?? null,
      lpLockedPct: rugCheck?.lpLockedPct ?? null,
      isHoneypot: null, // honeypot concept doesn't map cleanly to Solana SPL tokens the way it does EVM contracts; mint/freeze authority are the equivalent trust signals
      buyTaxPct: null,
      sellTaxPct: null,
      sourceVerified: null,
      ownerRenounced: null,
      mintAuthorityRevoked: reconcile(rugCheck?.mintAuthorityRevoked ?? null, rpcAuthorities.mintAuthorityRevoked),
      freezeAuthorityRevoked: reconcile(rugCheck?.freezeAuthorityRevoked ?? null, rpcAuthorities.freezeAuthorityRevoked),
    };
  }

  const safety = await fetchGoPlusEvmSafety(pair.network, pair.tokenAddress);
  return {
    network: pair.network,
    tokenAddress: pair.tokenAddress,
    pairAddress: pair.pairAddress,
    symbol: pair.symbol,
    name: pair.name,
    priceUsd: pair.priceUsd,
    liquidityUsd: pair.liquidityUsd,
    volume24hUsd: pair.volume24hUsd,
    poolCreatedAt: pair.poolCreatedAt,
    holderCount: safety?.holderCount ?? null,
    top10HolderPct: safety?.top10HolderPct ?? null,
    lpLockedPct: safety?.lpLockedPct ?? null,
    isHoneypot: safety?.isHoneypot ?? null,
    buyTaxPct: safety?.buyTaxPct ?? null,
    sellTaxPct: safety?.sellTaxPct ?? null,
    sourceVerified: safety?.sourceVerified ?? null,
    ownerRenounced: safety?.ownerRenounced ?? null,
    mintAuthorityRevoked: null,
    freezeAuthorityRevoked: null,
  };
}
