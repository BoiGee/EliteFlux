-- Cross-thread coach memory: durable facts Flux learns about a user,
-- independent of any single conversation thread.
CREATE TABLE public.coach_memory (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fact text NOT NULL,
  source_thread_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX idx_coach_memory_user ON public.coach_memory (user_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.coach_memory TO authenticated;
GRANT ALL ON public.coach_memory TO service_role;
ALTER TABLE public.coach_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_memory_select_own" ON public.coach_memory FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "coach_memory_insert_own" ON public.coach_memory FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "coach_memory_delete_own" ON public.coach_memory FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Generic feedback: coach message quality, opportunity ranking quality —
-- one small table instead of a bespoke one per feature.
CREATE TABLE public.user_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('coach_message', 'opportunity')),
  subject_id text NOT NULL,
  rating text NOT NULL CHECK (rating IN ('up', 'down')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, subject_type, subject_id)
);
CREATE INDEX idx_user_feedback_subject ON public.user_feedback (subject_type, subject_id);
GRANT SELECT, INSERT, UPDATE ON public.user_feedback TO authenticated;
GRANT ALL ON public.user_feedback TO service_role;
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_feedback_select_own" ON public.user_feedback FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_feedback_insert_own" ON public.user_feedback FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_feedback_update_own" ON public.user_feedback FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Rolling stablecoin total-supply readings — mint/burn velocity is a
-- well-known liquidity leading indicator (net minting = capital entering,
-- net burning = capital leaving).
CREATE TABLE public.stablecoin_supply_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol text NOT NULL,
  total_supply numeric NOT NULL,
  captured_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX idx_stablecoin_supply_symbol_time ON public.stablecoin_supply_history (symbol, captured_at DESC);
GRANT SELECT ON public.stablecoin_supply_history TO authenticated;
GRANT ALL ON public.stablecoin_supply_history TO service_role;
ALTER TABLE public.stablecoin_supply_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stablecoin_supply_select_auth" ON public.stablecoin_supply_history FOR SELECT TO authenticated USING (true);
