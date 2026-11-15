-- ============================================================
-- COMPANIES.SETTINGS JSONB COLUMN
-- ============================================================
-- The crew-SSN privacy stack (ea8d915 and b5ca382, merged into
-- main as PR #382 on 2026-11-13) shipped `getCompanySettings` and
-- `updateCompanySetting` in src/lib/db/companyOps.js, which read
-- and write a `settings` JSONB column on `companies`. The commit
-- message said "no database change" but the column was never
-- added in any migration. The live table (base schema in
-- 20241201000080_company_join_approval.sql + later ALTERs) has
-- id, name, code, office_code, subscription_tier,
-- owner_user_id, created_at, updated_at (+ branding columns from
-- 20241201000350_add_company_branding.sql and trade/company_type/
-- field_supervisor_label additions).
--
-- Consequences on production without this migration:
--   1. The admin toggle "Print SSN last 4 on crew sign-in PDFs"
--      (BrandingSettings.jsx) PostgREST-errors on save and the UI
--      shows "Could not save the setting". The setting never
--      persists.
--   2. Every PDF path reads `showSsnOnPdfs(await
--      db.getCompanySettings(id))`; the read silently swallows
--      the same error and returns `{}`. `showSsnOnPdfs({})` is
--      `true`, so every crew-check-in PDF prints the last 4
--      digits of every worker's SSN, regardless of whether the
--      admin ever tried to turn it off. This contradicts the
--      Privacy Policy shipped alongside the toggle.
--
-- This migration adds the column and lets RLS on `companies`
-- (already in place from 20261113_tenant_isolation_hardening.sql)
-- continue to gate reads and writes. Additive only, no data
-- touched, safe to re-run.
--
-- Rollback: supabase/rollbacks/20261115_companies_settings_column_rollback.sql
-- Tests:    supabase/tests/companies_settings_tests.sql
-- ============================================================

BEGIN;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.companies.settings IS
  'Per-company preferences in JSON. Readable by the company''s active members, writable only by administrators (gated by companies RLS). Current keys: crew_pdf_show_ssn_last4 (boolean, default true).';

-- Make the API see the new column immediately
NOTIFY pgrst, 'reload schema';

COMMIT;
