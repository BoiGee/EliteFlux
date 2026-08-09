-- 1. Background run bookkeeping + lock
CREATE TABLE public.system_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  evaluated INTEGER NOT NULL DEFAULT 0,
  fired INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  detail JSONB
);
GRANT SELECT ON public.system_runs TO authenticated;
GRANT ALL ON public.system_runs TO service_role;
ALTER TABLE public.system_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read system runs" ON public.system_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX system_runs_one_active ON public.system_runs (job) WHERE status = 'running';
CREATE INDEX system_runs_job_started ON public.system_runs (job, started_at DESC);

-- 2. Ad-hoc per-user rate limiting for third-party calls
CREATE TABLE public.rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, bucket, window_start)
);
GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- 3. Platform settings (global automation kill switch)
CREATE TABLE public.platform_settings (
  key TEXT NOT NULL PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in can read platform settings" ON public.platform_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins change platform settings" ON public.platform_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.platform_settings (key, value)
VALUES ('autopilot_kill_switch', 'false'::jsonb);

-- 4. Hot-path indexes
CREATE INDEX IF NOT EXISTS alerts_enabled_idx ON public.alerts (enabled) WHERE enabled;
CREATE INDEX IF NOT EXISTS alerts_user_idx ON public.alerts (user_id);
CREATE INDEX IF NOT EXISTS alert_history_user_fired_idx ON public.alert_history (user_id, fired_at DESC);
CREATE INDEX IF NOT EXISTS alert_history_unread_idx ON public.alert_history (user_id) WHERE NOT read;
CREATE INDEX IF NOT EXISTS alert_deliveries_user_created_idx ON public.alert_deliveries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS alert_deliveries_status_created_idx ON public.alert_deliveries (status, created_at DESC);
CREATE INDEX IF NOT EXISTS market_snapshots_captured_idx ON public.market_snapshots (captured_at DESC);
CREATE INDEX IF NOT EXISTS autopilot_actions_user_state_idx ON public.autopilot_actions (user_id, state, created_at DESC);
CREATE INDEX IF NOT EXISTS autopilot_audit_user_created_idx ON public.autopilot_audit (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS coach_messages_thread_created_idx ON public.coach_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS coach_nudges_user_created_idx ON public.coach_nudges (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_transactions_user_created_idx ON public.payment_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS portfolio_holdings_user_idx ON public.portfolio_holdings (user_id);