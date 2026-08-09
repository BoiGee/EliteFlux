-- Adds an 'owner' tier above 'admin'. Owners are also granted 'admin' (see
-- application-side grant), so every existing has_role(...,'admin') check —
-- RLS policies and app code alike — keeps working unchanged. 'owner' is only
-- ever checked for one thing: who is allowed to grant/revoke roles.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';
