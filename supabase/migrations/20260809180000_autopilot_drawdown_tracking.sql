-- The drawdown circuit breaker (autopilot_settings.drawdown_breaker_pct) was
-- previously never fed real data (checkGuardrails always got `drawdownPct:
-- null`), so it could never trip. This adds a portfolio high-water mark per
-- user so the breaker has something real to compare against.
alter table public.autopilot_settings
  add column if not exists peak_portfolio_usd numeric;
