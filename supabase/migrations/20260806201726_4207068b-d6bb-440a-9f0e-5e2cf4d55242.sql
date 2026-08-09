CREATE TYPE public.coach_level AS ENUM ('beginner','intermediate','advanced','pro');
CREATE TYPE public.call_stance AS ENUM ('accumulate','reduce','watch','avoid');
CREATE TYPE public.call_source AS ENUM ('coach','user');
CREATE TYPE public.call_status AS ENUM ('open','graded','expired');

CREATE TABLE public.coach_profile (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  experience_level public.coach_level NOT NULL DEFAULT 'beginner',
  goals TEXT,
  behavior JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_profile TO authenticated;
GRANT ALL ON public.coach_profile TO service_role;
ALTER TABLE public.coach_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY cp_own ON public.coach_profile FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_coach_profile_updated BEFORE UPDATE ON public.coach_profile FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.coach_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_coach_threads_user ON public.coach_threads(user_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_threads TO authenticated;
GRANT ALL ON public.coach_threads TO service_role;
ALTER TABLE public.coach_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY ct_own ON public.coach_threads FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_coach_threads_updated BEFORE UPDATE ON public.coach_threads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.coach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.coach_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT,
  role TEXT NOT NULL,
  parts JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_coach_messages_thread ON public.coach_messages(thread_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_messages TO authenticated;
GRANT ALL ON public.coach_messages TO service_role;
ALTER TABLE public.coach_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY cm_own ON public.coach_messages FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.coach_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES public.coach_threads(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  stance public.call_stance NOT NULL,
  source public.call_source NOT NULL DEFAULT 'user',
  entry_price NUMERIC NOT NULL,
  horizon_hours INTEGER NOT NULL DEFAULT 72,
  rationale TEXT,
  regime_at_call TEXT,
  flux_at_call NUMERIC,
  status public.call_status NOT NULL DEFAULT 'open',
  exit_price NUMERIC,
  move_pct NUMERIC,
  score NUMERIC,
  grade TEXT,
  verdict TEXT,
  graded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_coach_calls_user ON public.coach_calls(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_calls TO authenticated;
GRANT ALL ON public.coach_calls TO service_role;
ALTER TABLE public.coach_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY cc_own ON public.coach_calls FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.coach_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  messages INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, day)
);
GRANT SELECT ON public.coach_usage TO authenticated;
GRANT ALL ON public.coach_usage TO service_role;
ALTER TABLE public.coach_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY cu_select_own ON public.coach_usage FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.coach_nudges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_coach_nudges_user ON public.coach_nudges(user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.coach_nudges TO authenticated;
GRANT ALL ON public.coach_nudges TO service_role;
ALTER TABLE public.coach_nudges ENABLE ROW LEVEL SECURITY;
CREATE POLICY cn_select_own ON public.coach_nudges FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY cn_update_own ON public.coach_nudges FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);