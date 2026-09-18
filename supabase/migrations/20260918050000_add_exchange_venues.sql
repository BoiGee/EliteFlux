-- Adds three newly supported centralized-exchange venues: Gate.io, KuCoin
-- and MEXC (balance tracking; MEXC also gets Autopilot trade execution in
-- application code). A fourth candidate, Bitget, was dropped after a live
-- connectivity smoke test from the production Worker found it blocked
-- ({"cloudflare":"block"}) — the same failure class Binance already hit.
--
-- Standalone ADD VALUE statements only, with no DML in this file that
-- references the new labels — Postgres forbids using a newly-added enum
-- value in the same transaction it was added in, even on PG12+.
ALTER TYPE public.exchange_venue ADD VALUE IF NOT EXISTS 'gateio';
ALTER TYPE public.exchange_venue ADD VALUE IF NOT EXISTS 'kucoin';
ALTER TYPE public.exchange_venue ADD VALUE IF NOT EXISTS 'mexc';
