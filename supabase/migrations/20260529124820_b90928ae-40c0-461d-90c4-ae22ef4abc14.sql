-- Add 'expired' to subscription_status enum (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'expired'
      AND enumtypid = 'public.subscription_status'::regtype
  ) THEN
    ALTER TYPE public.subscription_status ADD VALUE 'expired';
  END IF;
END $$;