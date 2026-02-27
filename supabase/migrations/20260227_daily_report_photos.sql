-- ============================================================
-- DAILY REPORT PHOTOS
-- 1. Ensure daily_reports.photos column exists
-- 2. Ensure foreman (anon) can write to daily_reports
--    (also covers disposal_loads which was missing this grant)
-- ============================================================

-- Add photos column to daily_reports (safe to run multiple times)
ALTER TABLE daily_reports
  ADD COLUMN IF NOT EXISTS photos TEXT[] DEFAULT '{}';

-- Ensure anon role can write disposal_loads (field foremen use PIN auth = anon role)
-- These grants are idempotent — harmless if already present.
GRANT SELECT, INSERT, UPDATE, DELETE ON disposal_loads TO anon;
GRANT SELECT, INSERT, UPDATE           ON daily_reports  TO anon;

-- Ensure the storage policy allows anon to upload to the daily-report path.
-- The existing "Field users can upload tm-photos" policy validates that path
-- segment [2] is a valid project UUID, which our path format satisfies:
--   {companyId}/{projectId}/daily-report-{date}/{fileName}
-- No additional storage policy is needed.

DO $$
BEGIN
  RAISE NOTICE 'Migration 20260227_daily_report_photos applied.';
  RAISE NOTICE '  - daily_reports.photos column ensured';
  RAISE NOTICE '  - anon GRANT for disposal_loads ensured';
  RAISE NOTICE '  - anon GRANT for daily_reports ensured';
END $$;
