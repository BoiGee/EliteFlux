-- ============ ENUMS ============
CREATE TYPE public.autonomy_level AS ENUM ('observe','advise','approve','autopilot');
CREATE TYPE public.exchange_venue AS ENUM ('binance','bybit','okx');
CREATE TYPE public.exchange_permission AS ENUM ('read_only','read_trade');
CREATE TYPE public.wallet_chain AS ENUM ('evm','solana');
CREATE TYPE public.holding_source AS ENUM ('exchange','wallet','manual');
CREATE TYPE public.action_kind AS ENUM ('buy','trim','exit','hold');
CREATE TYPE public.action_state AS ENUM ('proposed','approved','rejected','executed','failed','expired','blocked');

-- ============ EXCHANGE CONNECTIONS ============
CREATE TABLE public.exchange_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue public.exchange_venue NOT NULL,
  label text,
  permission public.exchange_permission NOT NULL DEFAULT 'read_only',
  api_key_ciphertext text NOT NULL,
  api_secret_ciphertext text NOT NULL,
  passphrase_ciphertext text,
  key_hint text,
  status text NOT NULL DEFAULT 'pending',
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, venue, key_hint)
);

GRANT SELECT (id, user_id, venue, label, permission, key_hint, status, last_error, last_synced_at, created_at, updated_at)
  ON public.exchange_connections TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.exchange_connections TO authenticated;
GRANT ALL ON public.exchange_connections TO service_role;
ALTER TABLE public.exchange_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY ec_select_own ON public.exchange_connections FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY ec_insert_own ON public.exchange_connections FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY ec_update_own ON public.exchange_connections FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY ec_delete_own ON public.exchange_connections FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_ec_updated BEFORE UPDATE ON public.exchange_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ WALLET ADDRESSES ============
CREATE TABLE public.wallet_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chain public.wallet_chain NOT NULL,
  address text NOT NULL,
  label text,
  status text NOT NULL DEFAULT 'pending',
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, chain, address)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_addresses TO authenticated;
GRANT ALL ON public.wallet_addresses TO service_role;
ALTER TABLE public.wallet_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY wa_all_own ON public.wallet_addresses FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ PORTFOLIO HOLDINGS ============
CREATE TABLE public.portfolio_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source public.holding_source NOT NULL,
  source_id uuid,
  source_label text,
  symbol text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  price numeric,
  usd_value numeric,
  weight numeric,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, source_label, symbol)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_holdings TO authenticated;
GRANT ALL ON public.portfolio_holdings TO service_role;
ALTER TABLE public.portfolio_holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ph_all_own ON public.portfolio_holdings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ AUTOPILOT SETTINGS ============
CREATE TABLE public.autopilot_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  level public.autonomy_level NOT NULL DEFAULT 'advise',
  paper_mode boolean NOT NULL DEFAULT true,
  armed boolean NOT NULL DEFAULT false,
  kill_switch boolean NOT NULL DEFAULT false,
  max_trade_pct numeric NOT NULL DEFAULT 5,
  max_trade_usd numeric NOT NULL DEFAULT 250,
  max_trades_per_day integer NOT NULL DEFAULT 3,
  max_daily_usd numeric NOT NULL DEFAULT 750,
  min_conviction integer NOT NULL DEFAULT 70,
  cooldown_hours integer NOT NULL DEFAULT 12,
  drawdown_breaker_pct numeric NOT NULL DEFAULT 15,
  allowed_symbols text[] NOT NULL DEFAULT '{}',
  blocked_symbols text[] NOT NULL DEFAULT '{}',
  stable_symbol text NOT NULL DEFAULT 'USDT',
  disclosure_accepted_at timestamptz,
  armed_at timestamptz,
  disarmed_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.autopilot_settings TO authenticated;
GRANT ALL ON public.autopilot_settings TO service_role;
ALTER TABLE public.autopilot_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY aps_select_own ON public.autopilot_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY aps_insert_own ON public.autopilot_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY aps_update_own ON public.autopilot_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_aps_updated BEFORE UPDATE ON public.autopilot_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ AUTOPILOT ACTIONS ============
CREATE TABLE public.autopilot_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.action_kind NOT NULL,
  symbol text NOT NULL,
  size_pct numeric,
  notional_usd numeric,
  reference_price numeric,
  conviction integer,
  rationale text NOT NULL,
  state public.action_state NOT NULL DEFAULT 'proposed',
  guardrail_verdict jsonb,
  blocked_reason text,
  paper boolean NOT NULL DEFAULT true,
  venue public.exchange_venue,
  order_result jsonb,
  expires_at timestamptz,
  decided_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.autopilot_actions TO authenticated;
GRANT ALL ON public.autopilot_actions TO service_role;
ALTER TABLE public.autopilot_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY aa_select_own ON public.autopilot_actions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY aa_insert_own ON public.autopilot_actions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY aa_update_own ON public.autopilot_actions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_aa_user_state ON public.autopilot_actions (user_id, state, created_at DESC);

-- ============ AUTOPILOT AUDIT ============
CREATE TABLE public.autopilot_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_id uuid REFERENCES public.autopilot_actions(id) ON DELETE SET NULL,
  event text NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.autopilot_audit TO authenticated;
GRANT ALL ON public.autopilot_audit TO service_role;
ALTER TABLE public.autopilot_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY au_select_own ON public.autopilot_audit FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_au_user_created ON public.autopilot_audit (user_id, created_at DESC);