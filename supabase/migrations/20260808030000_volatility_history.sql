CREATE TABLE public.volatility_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol text NOT NULL,
  range_pct numeric NOT NULL,
  captured_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX idx_volatility_history_symbol_time ON public.volatility_history (symbol, captured_at DESC);
GRANT SELECT ON public.volatility_history TO authenticated;
GRANT ALL ON public.volatility_history TO service_role;
ALTER TABLE public.volatility_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "volatility_history_select_auth" ON public.volatility_history FOR SELECT TO authenticated USING (true);
