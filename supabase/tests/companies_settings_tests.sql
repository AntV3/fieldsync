-- ============================================================
-- COMPANIES.SETTINGS TESTS
-- ============================================================
-- Exercises supabase/migrations/20261115_companies_settings_column.sql.
-- Checks:
--   1. companies.settings exists, is JSONB, is NOT NULL, defaults to {}.
--   2. An update that merges a key (the pattern updateCompanySetting
--      in src/lib/db/companyOps.js uses) round-trips.
--   3. Reading the shipped SSN-PDF toggle back after writing
--      `{crew_pdf_show_ssn_last4: false}` yields false (so the app's
--      `showSsnOnPdfs(settings)` returns false, hiding the digits).
--
-- HOW TO USE: paste the whole file into the Supabase SQL editor AFTER
-- the migration and run it. One transaction ending in ROLLBACK, so
-- nothing is left behind. A failing check stops the run with an error
-- starting "FAIL:"; a clean finish means every check passed.
-- ============================================================

BEGIN;

-- Guard against running before the migration
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'settings'
  ) THEN
    RAISE EXCEPTION 'FAIL: 20261115_companies_settings_column.sql has not been applied (companies.settings missing)';
  END IF;
END $$;

-- 1. Column shape
DO $$
DECLARE
  v_type    TEXT;
  v_notnull BOOLEAN;
  v_default TEXT;
BEGIN
  SELECT data_type, (is_nullable = 'NO'), column_default
    INTO v_type, v_notnull, v_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'settings';

  IF v_type <> 'jsonb' THEN
    RAISE EXCEPTION 'FAIL: companies.settings is % (expected jsonb)', v_type;
  END IF;
  IF NOT v_notnull THEN
    RAISE EXCEPTION 'FAIL: companies.settings is nullable (expected NOT NULL)';
  END IF;
  IF v_default IS NULL OR v_default NOT LIKE '%''{}''%jsonb%' THEN
    RAISE EXCEPTION 'FAIL: companies.settings default is % (expected ''{}''::jsonb)', v_default;
  END IF;
END $$;

-- 2 and 3. Round-trip the SSN-PDF toggle
DO $$
DECLARE
  v_company_id UUID;
  v_settings   JSONB;
  v_toggle     BOOLEAN;
BEGIN
  INSERT INTO public.companies (name, code)
  VALUES ('TEST_COMPANIES_SETTINGS', 'TSTSET')
  RETURNING id INTO v_company_id;

  -- Default on a fresh company is {}
  SELECT settings INTO v_settings FROM public.companies WHERE id = v_company_id;
  IF v_settings <> '{}'::jsonb THEN
    RAISE EXCEPTION 'FAIL: fresh company.settings is % (expected {})', v_settings;
  END IF;

  -- The JS merge pattern: read current, spread a new key, write back
  UPDATE public.companies
     SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('crew_pdf_show_ssn_last4', false)
   WHERE id = v_company_id;

  SELECT settings INTO v_settings FROM public.companies WHERE id = v_company_id;
  IF NOT (v_settings ? 'crew_pdf_show_ssn_last4') THEN
    RAISE EXCEPTION 'FAIL: crew_pdf_show_ssn_last4 missing after update: %', v_settings;
  END IF;

  v_toggle := (v_settings ->> 'crew_pdf_show_ssn_last4')::boolean;
  IF v_toggle IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL: crew_pdf_show_ssn_last4 is % (expected false)', v_toggle;
  END IF;
END $$;

ROLLBACK;
