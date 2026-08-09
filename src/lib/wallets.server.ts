// Server-only read-only wallet balance reads from public chain endpoints.
// Public addresses only — EliteFlux never handles keys or signs anything.

export type Chain = "evm" | "solana";
export type WalletBalance = { symbol: string; amount: number };
export type WalletBalanceResult = { balances: WalletBalance[]; unrecognizedTokenCount: number };

const EVM_RPC = "https://eth.llamarpc.com";
const SOL_RPC = "https://api.mainnet-beta.solana.com";

export function isValidAddress(chain: Chain, address: string): boolean {
  const a = address.trim();
  if (chain === "evm") return /^0x[a-fA-F0-9]{40}$/.test(a);
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
}

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? "chain read failed");
  return json.result;
}

/**
 * ERC-20 tokens we read balances for, beyond native ETH — an eth_call to
 * balanceOf(address) per contract, same idea as SOL_MINTS below. Deliberately
 * limited to Ethereum mainnet and to contracts verified against public
 * sources: several other EVM chains have ambiguous native-vs-bridged token
 * variants (e.g. Arbitrum's USDT was reissued as "USDT0" under a new
 * contract; Polygon/Arbitrum both have a legacy bridged USDC.e alongside
 * native USDC) that aren't safe to hardcode here without live verification —
 * a wrong contract address would silently show a wrong balance, which is
 * worse than not showing one at all.
 */
const EVM_TOKENS: { symbol: string; contract: string; decimals: number }[] = [
  { symbol: "USDT", contract: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6 },
  { symbol: "USDC", contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6 },
];

const BALANCE_OF_SELECTOR = "70a08231";

async function erc20Balance(address: string, contract: string, decimals: number): Promise<number> {
  const paddedAddress = address.slice(2).toLowerCase().padStart(64, "0");
  const data = `0x${BALANCE_OF_SELECTOR}${paddedAddress}`;
  const hex = (await rpc(EVM_RPC, "eth_call", [{ to: contract, data }, "latest"])) as string;
  if (!hex || hex === "0x") return 0;
  const raw = BigInt(hex);
  return Number(raw) / 10 ** decimals;
}

async function evmBalances(address: string): Promise<WalletBalanceResult> {
  const [nativeHex, ...tokenAmounts] = await Promise.all([
    rpc(EVM_RPC, "eth_getBalance", [address, "latest"]) as Promise<string>,
    ...EVM_TOKENS.map((t) => erc20Balance(address, t.contract, t.decimals).catch(() => 0)),
  ]);
  const wei = BigInt(nativeHex ?? "0x0");
  const eth = Number(wei) / 1e18;
  const balances: WalletBalance[] = eth > 0 ? [{ symbol: "ETH", amount: eth }] : [];
  EVM_TOKENS.forEach((t, i) => {
    const amount = tokenAmounts[i] ?? 0;
    if (amount > 0) balances.push({ symbol: t.symbol, amount });
  });
  // Native + a curated token list, not an open-ended scan — there's no
  // generic "list every ERC-20 balance" JSON-RPC method the way Solana's
  // getTokenAccountsByOwner works, so unlike solanaBalances below this can't
  // report a real unrecognized-token count, only what it already checked.
  return { balances, unrecognizedTokenCount: 0 };
}

type TokenAccounts = {
  value?: {
    account?: {
      data?: { parsed?: { info?: { mint?: string; tokenAmount?: { uiAmount?: number } } } };
    };
  }[];
};

/** Mints we can map to tickers without an external token registry. */
const SOL_MINTS: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
  So11111111111111111111111111111111111111112: "SOL",
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: "MSOL",
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: "JUP",
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: "BONK",
};

async function solanaBalances(address: string): Promise<WalletBalanceResult> {
  const out: WalletBalance[] = [];
  let unrecognizedTokenCount = 0;
  const lamports = (await rpc(SOL_RPC, "getBalance", [address])) as { value?: number };
  const sol = (lamports?.value ?? 0) / 1e9;
  if (sol > 0) out.push({ symbol: "SOL", amount: sol });

  const accounts = (await rpc(SOL_RPC, "getTokenAccountsByOwner", [
    address,
    { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
    { encoding: "jsonParsed" },
  ])) as TokenAccounts;

  for (const acc of accounts?.value ?? []) {
    const info = acc.account?.data?.parsed?.info;
    const amount = info?.tokenAmount?.uiAmount ?? 0;
    if (amount <= 0) continue;
    const symbol = info?.mint ? SOL_MINTS[info.mint] : undefined;
    if (!symbol) {
      unrecognizedTokenCount++;
      continue;
    }
    const existing = out.find((b) => b.symbol === symbol);
    if (existing) existing.amount += amount;
    else out.push({ symbol, amount });
  }
  return { balances: out, unrecognizedTokenCount };
}

export async function fetchWalletBalances(chain: Chain, address: string): Promise<WalletBalanceResult> {
  if (!isValidAddress(chain, address)) throw new Error("That address does not look valid for this chain.");
  return chain === "evm" ? evmBalances(address) : solanaBalances(address);
}
