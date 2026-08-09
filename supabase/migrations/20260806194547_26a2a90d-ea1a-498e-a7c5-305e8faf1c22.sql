CREATE TABLE public.alert_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_id uuid REFERENCES public.alerts(id) ON DELETE CASCADE,
  history_id uuid REFERENCES public.alert_history(id) ON DELETE CASCADE,
  channel public.alert_channel NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_alert_deliveries_user ON public.alert_deliveries(user_id, created_at DESC);

GRANT SELECT ON public.alert_deliveries TO authenticated;
GRANT ALL ON public.alert_deliveries TO service_role;
ALTER TABLE public.alert_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY ad_select_own ON public.alert_deliveries FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.market_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  flux_score numeric,
  regime text,
  whale_score numeric,
  sentiment_score numeric,
  exit_pressure numeric,
  ignition_score numeric,
  coins jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_market_snapshots_time ON public.market_snapshots(captured_at DESC);

GRANT SELECT ON public.market_snapshots TO authenticated;
GRANT ALL ON public.market_snapshots TO service_role;
ALTER TABLE public.market_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY ms_select_auth ON public.market_snapshots FOR SELECT TO authenticated USING (true);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS webhook_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;