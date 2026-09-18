-- Supports reconciling autopilot_actions rows that got stuck at
-- state='executing' — confirmed live via code audit as a real risk:
-- withTimeout (jobs.server.ts) races a per-user autopilot run against a
-- timeout but never cancels the underlying work, so a run that times out
-- right after placeSpotOrder returns but before the final state-flipping
-- UPDATE lands leaves the row permanently at 'executing' with no
-- reconciliation path. Since executeAction's own guard only allows retrying
-- state IN ('proposed','approved'), a stuck row can never be picked up
-- again, and todayUsage()/hoursSinceLastTrade() only count state='executed'
-- — so a real, possibly-filled trade silently stops counting toward the
-- user's own configured daily-trade/cooldown/daily-USD guardrails.
--
-- 'unknown' is the reconciliation target: a stuck row gets flipped there
-- rather than left at 'executing' forever or guessed into 'executed'/
-- 'failed' outright. Application code treats 'unknown' as conservatively as
-- 'executed' for guardrail counting (fail toward tighter limits, not
-- looser), while still surfacing it distinctly so a human can check the
-- venue's own order history for what actually happened.
--
-- Standalone ADD VALUE statement only, no DML referencing it in this file —
-- Postgres forbids using a newly-added enum value in the same transaction
-- it was added in.
ALTER TYPE public.action_state ADD VALUE IF NOT EXISTS 'unknown';

-- Set only when a claim update (state -> 'executing') happens, so
-- reconciliation can tell a genuinely-stuck row (executing_since far in the
-- past) apart from one that's mid-flight and still within a normal
-- execution's real duration.
ALTER TABLE public.autopilot_actions ADD COLUMN IF NOT EXISTS executing_since timestamptz;
