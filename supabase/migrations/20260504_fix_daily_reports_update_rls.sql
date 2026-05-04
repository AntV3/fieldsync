-- ============================================================
-- FIX: Restore the missing UPDATE RLS policy on daily_reports
--
-- ROOT CAUSE:
--   `20260310_field_sessions_security.sql` re-issued the SELECT and
--   INSERT policies for daily_reports but did NOT recreate the
--   "Secure field update daily reports" policy that was added in
--   `20260228_fix_foreman_auth_errors.sql` and
--   `20260219_fix_foreman_rls.sql`. On any database where the
--   UPDATE policy was not previously persisted (or was dropped by
--   a re-run of the upstream migrations), no policy permits UPDATE
--   on daily_reports.
--
--   The DailyReport submit flow performs:
--     1. saveDailyReport()    → upsert (INSERT on first call)
--     2. submitDailyReport()  → upsert (UPDATE because the row
--                                exists from step 1)
--
--   Step 2's UPDATE is denied with:
--     "new row violates row-level security policy for table
--      'daily_reports'"
--
-- FIX:
--   Re-create unified SELECT / INSERT / UPDATE policies for
--   daily_reports using the shared can_access_project() helper,
--   matching the pattern used for punch_list_items, disposal_loads,
--   and crew_checkins. Reaffirm anon grants required by the field
--   session flow.
--
--   IDEMPOTENT — safe to re-run on any database.
-- ============================================================

DROP POLICY IF EXISTS "Field users can view daily reports"   ON daily_reports;
DROP POLICY IF EXISTS "Field users can create daily reports" ON daily_reports;
DROP POLICY IF EXISTS "Field users can update daily reports" ON daily_reports;
DROP POLICY IF EXISTS "Secure field view daily reports"      ON daily_reports;
DROP POLICY IF EXISTS "Secure field create daily reports"    ON daily_reports;
DROP POLICY IF EXISTS "Secure field update daily reports"    ON daily_reports;

CREATE POLICY "Secure field view daily reports"
  ON daily_reports FOR SELECT
  USING (can_access_project(project_id));

CREATE POLICY "Secure field create daily reports"
  ON daily_reports FOR INSERT
  WITH CHECK (can_access_project(project_id));

CREATE POLICY "Secure field update daily reports"
  ON daily_reports FOR UPDATE
  USING      (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));

GRANT SELECT, INSERT, UPDATE ON daily_reports TO anon;
GRANT SELECT, INSERT, UPDATE ON daily_reports TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'FIX APPLIED: 20260504_fix_daily_reports_update_rls';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'daily_reports: SELECT / INSERT / UPDATE policies restored';
  RAISE NOTICE 'Field-session submits (saveDailyReport + submitDailyReport)';
  RAISE NOTICE 'no longer fail with "new row violates row-level security';
  RAISE NOTICE 'policy for table daily_reports".';
  RAISE NOTICE '============================================================';
END $$;
