-- ============================================================
-- ROLLBACK for 20261115_companies_settings_column.sql
-- ============================================================
-- WARNING: drops the settings column and every per-company
-- preference stored in it (notably the "do not print SSN last 4
-- on crew PDFs" toggle). After rollback the admin toggle in
-- Branding settings errors on save, and every crew-check-in PDF
-- again prints the SSN last 4 for every worker (the code-side
-- default when settings are unreadable is to print).
-- ============================================================

BEGIN;

ALTER TABLE public.companies
  DROP COLUMN IF EXISTS settings;

NOTIFY pgrst, 'reload schema';

COMMIT;
