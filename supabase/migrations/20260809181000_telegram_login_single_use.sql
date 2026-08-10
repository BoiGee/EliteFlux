-- Telegram's signed login payload was previously replayable within its own
-- 300s freshness window: the same valid callback could be resubmitted to
-- telegramSignIn any number of times, and the invite-code check had no
-- throttle either — a real Telegram login click bought an attacker a
-- 5-minute window of unlimited, cheap invite-code guesses. This table makes
-- each signed payload single-use: the unique constraint on payload_hash
-- rejects a second attempt outright, before the invite-code check ever runs.
create table public.telegram_login_attempts (
  payload_hash text not null primary key,
  created_at timestamptz not null default now()
);
alter table public.telegram_login_attempts enable row level security;
grant all on public.telegram_login_attempts to service_role;
