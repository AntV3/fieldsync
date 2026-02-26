-- ============================================================
-- FIX: 20260226_fix_field_access_grants
--
-- Fixes two issues observed in the browser console:
--
-- 1. 401 Unauthorized on validate_pin_and_create_session RPC
--    Root cause: the anon role may have lost EXECUTE permission
--    after the function was dropped and recreated in a prior
--    migration.  This migration re-grants it (idempotent).
--
-- 2. 42501 RLS violation when field workers save/submit a daily
--    report that already exists for today.
--    Root cause: the first secure_field_rls migration added an
--    INSERT policy but no UPDATE policy.  An UPSERT that hits
--    an existing row silently becomes an UPDATE, which was then
--    blocked.  This migration adds the missing UPDATE policy and
--    ensures the anon role has the corresponding table privilege.
-- ============================================================

-- ============================================================
-- PART 1: Re-grant EXECUTE on all field session functions
-- (Safe to run multiple times — grants are idempotent)
-- ============================================================

GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION log_auth_attempt(TEXT, TEXT, BOOLEAN, TEXT)    TO anon;
GRANT EXECUTE ON FUNCTION validate_field_session(UUID)                   TO anon;
GRANT EXECUTE ON FUNCTION has_valid_field_session()                      TO anon;
GRANT EXECUTE ON FUNCTION validate_pin_and_create_session(TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION can_access_project(UUID)                       TO anon;
GRANT EXECUTE ON FUNCTION can_access_project(UUID)                       TO authenticated;
GRANT EXECUTE ON FUNCTION invalidate_field_session(TEXT)                 TO anon;
GRANT EXECUTE ON FUNCTION extend_field_session(TEXT)                     TO anon;

-- ============================================================
-- PART 2: daily_reports — add missing UPDATE policy and grant
-- ============================================================

-- Drop all existing field policies so we can recreate them cleanly
DROP POLICY IF EXISTS "Field users can view daily reports"   ON daily_reports;
DROP POLICY IF EXISTS "Field users can create daily reports" ON daily_reports;
DROP POLICY IF EXISTS "Secure field view daily reports"      ON daily_reports;
DROP POLICY IF EXISTS "Secure field create daily reports"    ON daily_reports;
DROP POLICY IF EXISTS "Secure field update daily reports"    ON daily_reports;

CREATE POLICY "Secure field view daily reports"
  ON daily_reports FOR SELECT
  USING (can_access_project(project_id));

CREATE POLICY "Secure field create daily reports"
  ON daily_reports FOR INSERT
  WITH CHECK (can_access_project(project_id));

-- This UPDATE policy was missing — upserts on existing rows failed with 42501
CREATE POLICY "Secure field update daily reports"
  ON daily_reports FOR UPDATE
  USING     (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));

-- Ensure the anon role has the required table-level privileges
GRANT SELECT, INSERT, UPDATE ON daily_reports TO anon;

-- ============================================================

DO $$
BEGIN
  RAISE NOTICE 'FIX APPLIED: 20260226_fix_field_access_grants';
  RAISE NOTICE '  - Re-granted EXECUTE on all field session functions to anon';
  RAISE NOTICE '  - Added missing UPDATE policy on daily_reports for field users';
  RAISE NOTICE '  - Granted SELECT, INSERT, UPDATE on daily_reports to anon';
END $$;
