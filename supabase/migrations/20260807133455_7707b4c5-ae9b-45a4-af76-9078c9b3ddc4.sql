
-- payments: users may only file pending, unverified claims
DROP POLICY IF EXISTS pt_insert_own ON public.payment_transactions;
CREATE POLICY pt_insert_own ON public.payment_transactions
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND status = 'pending'::payment_status
  AND verified_at IS NULL
  AND detected_amount IS NULL
  AND tron_data IS NULL
);

-- autopilot: users may only propose, and may only move to approved/rejected
DROP POLICY IF EXISTS aa_insert_own ON public.autopilot_actions;
CREATE POLICY aa_insert_own ON public.autopilot_actions
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND state = 'proposed'::action_state
  AND guardrail_verdict IS NULL
  AND order_result IS NULL
  AND executed_at IS NULL
);

DROP POLICY IF EXISTS aa_update_own ON public.autopilot_actions;
CREATE POLICY aa_update_own ON public.autopilot_actions
FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND state = 'proposed'::action_state)
WITH CHECK (
  auth.uid() = user_id
  AND state IN ('approved'::action_state, 'rejected'::action_state)
  AND order_result IS NULL
  AND executed_at IS NULL
);

-- platform settings: admin-only reads (all app reads go through the service role)
DROP POLICY IF EXISTS "Anyone signed in can read platform settings" ON public.platform_settings;
CREATE POLICY "Admins read platform settings" ON public.platform_settings
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
