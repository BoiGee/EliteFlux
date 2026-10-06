-- Early/unlisted token discovery: a real-time module that detects brand-new
-- DEX tokens, verifies contract/mint safety, measures liquidity depth and
-- holder concentration, and scores them 0..100. Deliberately paper-mode
-- only — this codebase has no on-chain transaction-signing infrastructure
-- today (vault.server.ts only ever encrypts CEX API credentials,
-- wallets.server.ts is read-only JSON-RPC, no blockchain SDK is installed),
-- and "EliteFlux never holds your funds, never asks for a seed phrase or
-- private key" is a stated security promise (KeySafety.tsx,
-- ConnectWalletWizard.tsx, RISK_DISCLOSURE in autonomy.ts). The
-- aa_discovery_paper_only constraint below makes that a database-level
-- invariant, not just an application convention.

-- ============ DISCOVERED TOKENS (registry, one row per token) ============
-- network is plain text, not an enum — matches signal_events' signal_type/
-- band/regime convention, so adding a chain later needs no ALTER TYPE.
-- Current-state only; signal_events/signal_outcomes carry the historical,
-- gradeable record (same split as market_snapshots vs. signal_events).
CREATE TABLE public.discovered_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL,
  token_address text NOT NULL,
  pair_address text,
  symbol text,
  name text,
  dex text,
  quote_token_symbol text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  pool_created_at timestamptz,
  last_price_usd numeric,
  last_liquidity_usd numeric,
  last_volume_24h_usd numeric,
  last_fdv_usd numeric,
  holder_count integer,
  top10_holder_pct numeric,
  lp_locked_pct numeric,
  lp_lock_until timestamptz,
  mint_authority_revoked boolean,
  freeze_authority_revoked boolean,
  owner_renounced boolean,
  is_honeypot boolean,
  buy_tax_pct numeric,
  sell_tax_pct numeric,
  -- Hard pre-filter, deliberately separate from opportunity_score below —
  -- a token failing this must never show a misleadingly "medium" score.
  safety_gate_passed boolean NOT NULL DEFAULT false,
  safety_gate_reasons text[] NOT NULL DEFAULT '{}',
  safety_score integer,      -- 0..100, informational margin only — never blended into opportunity_score
  opportunity_score integer, -- 0..100, forced 0 whenever safety_gate_passed = false
  band text,                 -- 'Unsafe' | 'Caution' | 'Emerging' | 'Strong Signal'
  contributors jsonb NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  rationale text,
  status text NOT NULL DEFAULT 'active', -- 'active' | 'stale' | 'delisted' | 'rugged_confirmed'
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network, token_address)
);
CREATE INDEX idx_discovered_tokens_score ON public.discovered_tokens (safety_gate_passed, opportunity_score DESC) WHERE status = 'active';
CREATE INDEX idx_discovered_tokens_checked ON public.discovered_tokens (last_checked_at);

-- Service-role-only writes (matches market_snapshots/signal_events) — the
-- user-facing feed reads through a tier-gated createServerFn using
-- supabaseAdmin, not direct client RLS access. Admins can read the raw
-- table directly from the owner console.
GRANT ALL ON public.discovered_tokens TO service_role;
ALTER TABLE public.discovered_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY dt_admin_read ON public.discovered_tokens FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============ DISCOVERY SETTINGS (per-user, separate from autopilot_settings) ============
-- Reusing autopilot_settings/Guardrails' bounds (up to 40% per trade, $25k
-- max) would be a real safety mistake for two-day-old tokens — this asset
-- class gets its own, much stricter opt-in and limits. No max_position_pct:
-- these are paper positions, so sizing relative to a real balance isn't a
-- meaningful boundary the way it is for live Autopilot.
CREATE TABLE public.discovery_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  opted_in boolean NOT NULL DEFAULT false,
  disclosure_accepted_at timestamptz,
  armed boolean NOT NULL DEFAULT false,
  kill_switch boolean NOT NULL DEFAULT false,
  min_safety_score integer NOT NULL DEFAULT 80,
  max_position_usd numeric NOT NULL DEFAULT 25,
  total_allocation_budget_usd numeric NOT NULL DEFAULT 100,
  max_open_positions integer NOT NULL DEFAULT 3,
  allowed_networks text[] NOT NULL DEFAULT '{}', -- empty = all supported networks
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.discovery_settings TO authenticated;
GRANT ALL ON public.discovery_settings TO service_role;
ALTER TABLE public.discovery_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ds_select_own ON public.discovery_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY ds_insert_own ON public.discovery_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY ds_update_own ON public.discovery_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_ds_updated BEFORE UPDATE ON public.discovery_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ AUTOPILOT_ACTIONS: additive link to discovery, paper-only invariant ============
ALTER TABLE public.autopilot_actions ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'curated';
ALTER TABLE public.autopilot_actions ADD COLUMN IF NOT EXISTS discovered_token_id uuid REFERENCES public.discovered_tokens(id) ON DELETE SET NULL;
ALTER TABLE public.autopilot_actions ADD CONSTRAINT aa_source_check CHECK (source IN ('curated', 'discovery'));
-- The single most important line in this migration: even a future
-- application bug cannot insert a live discovery trade, because Postgres
-- itself rejects the row regardless of what the app code does.
ALTER TABLE public.autopilot_actions ADD CONSTRAINT aa_discovery_paper_only CHECK (source <> 'discovery' OR paper = true);
