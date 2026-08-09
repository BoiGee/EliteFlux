-- Payment transactions for USDT TRC20
CREATE TYPE public.payment_status AS ENUM ('pending','verified','rejected','expired');
CREATE TYPE public.billing_cycle AS ENUM ('monthly','yearly');

CREATE TABLE public.payment_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  txid TEXT NOT NULL UNIQUE,
  tier public.subscription_tier NOT NULL,
  cycle public.billing_cycle NOT NULL,
  expected_amount NUMERIC(18,6) NOT NULL,
  detected_amount NUMERIC(18,6),
  from_address TEXT,
  to_address TEXT,
  status public.payment_status NOT NULL DEFAULT 'pending',
  tron_data JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ
);

GRANT SELECT, INSERT ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY pt_select_own ON public.payment_transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE POLICY pt_insert_own ON public.payment_transactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_pt_user ON public.payment_transactions(user_id, created_at DESC);
CREATE INDEX idx_pt_status ON public.payment_transactions(status);

-- Allow subscriptions to be updated/inserted by service role (server fn)
-- Existing policies only cover SELECT; admin client bypasses RLS regardless,
-- but make explicit policies for clarity.
CREATE POLICY subs_admin_all ON public.subscriptions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
