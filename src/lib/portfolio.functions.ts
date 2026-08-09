import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  addWalletSchema,
  connectExchangeSchema,
  friendlyWalletError,
  idSchema,
  keyPolicySchema,
} from "@/lib/portfolio.schemas";

const MAX_WALLETS_PER_USER = 10;

export const listConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [exchanges, wallets, holdings] = await Promise.all([
      context.supabase
        .from("exchange_connections")
        .select("id,venue,label,permission,key_hint,status,last_error,last_synced_at,created_at")
        .order("created_at", { ascending: true }),
      context.supabase
        .from("wallet_addresses")
        .select("id,chain,address,label,status,last_error,last_synced_at,created_at")
        .order("created_at", { ascending: true }),
      context.supabase
        .from("portfolio_holdings")
        .select("id,source,source_label,symbol,amount,price,usd_value,weight,synced_at")
        .order("usd_value", { ascending: false, nullsFirst: false }),
    ]);
    return {
      exchanges: exchanges.data ?? [],
      wallets: wallets.data ?? [],
      holdings: holdings.data ?? [],
    };
  });

export const connectExchange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => connectExchangeSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Personal safety switch: if the user has locked their account to read-only,
    // a trading-capable key cannot be added at all.
    const { data: prof } = await context.supabase
      .from("profiles")
      .select("readonly_keys_only")
      .eq("id", context.userId)
      .maybeSingle();
    if ((prof as { readonly_keys_only?: boolean } | null)?.readonly_keys_only && data.permission === "read_trade") {
      throw new Error(
        "Your account is locked to read-only keys. Turn that setting off on the portfolio page before adding a key with trading permission.",
      );
    }

    const { seal, keyHint } = await import("@/lib/vault.server");
    const { fetchBalances } = await import("@/lib/exchanges.server");

    // Verify the credentials work before we store anything.
    try {
      await fetchBalances(data.venue, {
        apiKey: data.apiKey,
        apiSecret: data.apiSecret,
        passphrase: data.passphrase ?? null,
      });
    } catch (e) {
      throw new Error(
        `We could not read that account: ${e instanceof Error ? e.message : "unknown error"}. Check the key, its permissions and any IP restriction.`,
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("exchange_connections").upsert(
      {
        user_id: context.userId,
        venue: data.venue,
        label: data.label ?? null,
        permission: data.permission,
        api_key_ciphertext: seal(data.apiKey),
        api_secret_ciphertext: seal(data.apiSecret),
        passphrase_ciphertext: data.passphrase ? seal(data.passphrase) : null,
        key_hint: keyHint(data.apiKey),
        status: "connected",
        last_error: null,
      } as never,
      { onConflict: "user_id,venue,key_hint" },
    );
    if (error) throw new Error(error.message);

    const { syncPortfolio } = await import("@/lib/portfolio.server");
    return syncPortfolio(supabaseAdmin as never, context.userId);
  });

export const addWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => addWalletSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { isValidAddress } = await import("@/lib/wallets.server");
    if (!isValidAddress(data.chain, data.address)) {
      throw new Error("That address does not look valid for the selected chain.");
    }
    // EVM addresses are case-insensitive (0xABC... and 0xabc... are the same
    // address) — normalize before insert, or the same wallet can be added
    // twice under different casing and double-count its balance. Solana
    // addresses are base58 and case-sensitive; must not be touched.
    const normalizedAddress = data.chain === "evm" ? data.address.trim().toLowerCase() : data.address.trim();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // A public RPC is a shared resource, and there's no reason one account
    // needs unlimited wallets — same throttle pattern payments.functions.ts
    // already uses for its own paid-upstream-call concern.
    const { checkRateLimit } = await import("@/lib/rate-limit.server");
    const throttle = await checkRateLimit(supabaseAdmin as never, context.userId, "wallet_add", 10, 10 * 60_000);
    if (!throttle.allowed) {
      throw new Error(
        `Too many wallets added recently. Please wait ${Math.ceil(throttle.retryAfterSeconds / 60)} minute(s) and try again.`,
      );
    }

    const { count } = await context.supabase
      .from("wallet_addresses")
      .select("id", { count: "exact", head: true });
    if ((count ?? 0) >= MAX_WALLETS_PER_USER) {
      throw new Error(`You've reached the limit of ${MAX_WALLETS_PER_USER} tracked wallets. Remove one before adding another.`);
    }

    const { error } = await context.supabase.from("wallet_addresses").insert({
      user_id: context.userId,
      chain: data.chain,
      address: normalizedAddress,
      label: data.label ?? null,
      status: "pending",
    } as never);
    if (error) throw new Error(friendlyWalletError(error.message) ?? error.message);

    const { syncPortfolio } = await import("@/lib/portfolio.server");
    return syncPortfolio(supabaseAdmin as never, context.userId);
  });

export const removeConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase.from("exchange_connections").delete().eq("id", data.id);
    await context.supabase.from("wallet_addresses").delete().eq("id", data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { syncPortfolio } = await import("@/lib/portfolio.server");
    return syncPortfolio(supabaseAdmin as never, context.userId);
  });

export const refreshPortfolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { checkRateLimit } = await import("@/lib/rate-limit.server");
    const throttle = await checkRateLimit(supabaseAdmin as never, context.userId, "wallet_sync", 12, 10 * 60_000);
    if (!throttle.allowed) {
      throw new Error(
        `Syncing too often — please wait ${Math.ceil(throttle.retryAfterSeconds / 60)} minute(s) and try again.`,
      );
    }

    const { syncPortfolio } = await import("@/lib/portfolio.server");
    return syncPortfolio(supabaseAdmin as never, context.userId);
  });

export const getKeyPolicy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("readonly_keys_only")
      .eq("id", context.userId)
      .maybeSingle();
    return { readonlyOnly: Boolean((data as { readonly_keys_only?: boolean } | null)?.readonly_keys_only) };
  });

export const setKeyPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => keyPolicySchema.parse(input))
  .handler(async ({ data, context }) => {
    if (data.readonlyOnly) {
      const { count } = await context.supabase
        .from("exchange_connections")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .eq("permission", "read_trade");
      if ((count ?? 0) > 0) {
        throw new Error(
          "Remove your trading-permission keys first, then lock the account to read-only.",
        );
      }
    }
    const { error } = await context.supabase
      .from("profiles")
      .update({ readonly_keys_only: data.readonlyOnly } as never)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { readonlyOnly: data.readonlyOnly };
  });
