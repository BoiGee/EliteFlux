-- Persists Deribit's OI-weighted 30d IV reading per cycle so options-intel.ts
-- can compute a real IV percentile/regime the same way volatility-intel.ts
-- already does for price range, instead of only ever showing a raw
-- point-in-time number.
CREATE TABLE public.options_iv_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  currency text NOT NULL,
  avg_iv numeric NOT NULL,
  captured_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX idx_options_iv_history_currency_time ON public.options_iv_history (currency, captured_at DESC);
GRANT SELECT ON public.options_iv_history TO authenticated;
GRANT ALL ON public.options_iv_history TO service_role;
ALTER TABLE public.options_iv_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "options_iv_history_select_auth" ON public.options_iv_history FOR SELECT TO authenticated USING (true);
