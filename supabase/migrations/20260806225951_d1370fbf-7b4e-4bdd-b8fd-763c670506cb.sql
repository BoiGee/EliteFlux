REVOKE EXECUTE ON FUNCTION public.get_user_tier(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_tier(uuid) TO service_role;

DROP POLICY IF EXISTS "rate_limits_no_client_access" ON public.rate_limits;
CREATE POLICY "rate_limits_no_client_access"
  ON public.rate_limits
  FOR SELECT
  TO authenticated
  USING (false);