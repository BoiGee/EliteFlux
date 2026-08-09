-- Cards via Paystack (recurring auto-charge), replacing crypto (USDT) as the
-- customer-facing payment method — crypto's core limitation was no recurring
-- autocharge, and no real subscriber data exists on the old USDT rows, so
-- this is a clean swap rather than a migration path.

ALTER TABLE public.payment_transactions
  ALTER COLUMN txid DROP NOT NULL;

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'paystack',
  ADD COLUMN IF NOT EXISTS provider_ref TEXT,
  ADD COLUMN IF NOT EXISTS provider_data JSONB;

-- txid was UNIQUE + NOT NULL for USDT TXIDs; Paystack rows use provider_ref
-- (the transaction reference) instead, so txid becomes nullable for
-- non-usdt rows. The uniqueness constraint on txid already tolerates
-- multiple NULLs in Postgres.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pt_provider_ref ON public.payment_transactions (provider, provider_ref) WHERE provider_ref IS NOT NULL;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'paystack',
  ADD COLUMN IF NOT EXISTS paystack_customer_code TEXT,
  ADD COLUMN IF NOT EXISTS paystack_subscription_code TEXT,
  ADD COLUMN IF NOT EXISTS paystack_email_token TEXT,
  ADD COLUMN IF NOT EXISTS paystack_authorization_code TEXT;

ALTER TABLE public.subscriptions
  DROP COLUMN IF EXISTS stripe_customer_id,
  DROP COLUMN IF EXISTS stripe_subscription_id;
