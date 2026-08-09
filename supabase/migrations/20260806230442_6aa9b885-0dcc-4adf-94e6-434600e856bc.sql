INSERT INTO public.platform_settings (key, value)
VALUES
  ('signup_mode', '{"mode":"open","code":""}'::jsonb),
  ('feature_flags', '{"autopilot":true,"payments":true,"coach":true}'::jsonb)
ON CONFLICT (key) DO NOTHING;