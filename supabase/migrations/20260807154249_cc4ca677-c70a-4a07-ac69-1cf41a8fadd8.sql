CREATE TABLE public.signal_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  signal_type text NOT NULL,
  symbol text,
  score numeric NOT NULL,
  band text,
  regime text,
  confidence numeric,
  reference_price numeric,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  fired_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone
);
CREATE INDEX idx_signal_events_fired_at ON public.signal_events (fired_at DESC);
CREATE INDEX idx_signal_events_unresolved ON public.signal_events (resolved_at, fired_at) WHERE resolved_at IS NULL;
CREATE INDEX idx_signal_events_type ON public.signal_events (signal_type, fired_at DESC);

GRANT ALL ON public.signal_events TO service_role;
ALTER TABLE public.signal_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signal_events admin read" ON public.signal_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.signal_outcomes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.signal_events(id) ON DELETE CASCADE,
  signal_type text NOT NULL,
  symbol text,
  horizon_hours integer NOT NULL,
  entry_price numeric,
  exit_price numeric,
  forward_return_pct numeric,
  hit boolean,
  score numeric,
  regime text,
  resolved_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_signal_outcomes_unique ON public.signal_outcomes (event_id, horizon_hours);
CREATE INDEX idx_signal_outcomes_type ON public.signal_outcomes (signal_type, horizon_hours, resolved_at DESC);

GRANT ALL ON public.signal_outcomes TO service_role;
ALTER TABLE public.signal_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signal_outcomes admin read" ON public.signal_outcomes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.model_weights (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model text NOT NULL,
  weights jsonb NOT NULL,
  sample_size integer NOT NULL DEFAULT 0,
  computed_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX idx_model_weights_model ON public.model_weights (model, computed_at DESC);
GRANT ALL ON public.model_weights TO service_role;
ALTER TABLE public.model_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "model_weights admin read" ON public.model_weights FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));