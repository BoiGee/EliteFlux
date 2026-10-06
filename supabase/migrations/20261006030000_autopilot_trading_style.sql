-- Lets a user choose how patient Autopilot's new position-rotation logic
-- should be before reallocating out of an underperforming holding — see
-- autopilot-engine.ts's ROTATION_PARAMS, which reads this value. Does not
-- affect any existing guardrail (min_conviction, cooldown_hours, etc.).
ALTER TABLE public.autopilot_settings
  ADD COLUMN IF NOT EXISTS trading_style text NOT NULL DEFAULT 'balanced';

ALTER TABLE public.autopilot_settings
  ADD CONSTRAINT autopilot_settings_trading_style_check
  CHECK (trading_style IN ('short_term', 'balanced', 'long_term'));
