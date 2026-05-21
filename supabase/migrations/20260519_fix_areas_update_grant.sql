-- ============================================================
-- FIX: Field foremen cannot update area status from Field View
--
-- ROOT CAUSE:
--   Foremen tap "Working" / "Done" on a task in the Progress view
--   and the request fails with a permission / RLS error, surfacing
--   in the UI as the "Error updating" toast in ForemanView.jsx
--   (handleStatusUpdate).
--
--   The RLS policy "Secure field update areas" exists and is
--   correct (USING/WITH CHECK can_access_project(project_id)), but
--   PostgreSQL evaluates table-level grants BEFORE RLS. The anon
--   role — which all PIN-authenticated foreman traffic uses — was
--   re-granted `SELECT` ONLY on `areas` by the two most recent
--   foreman-auth fix migrations:
--
--     supabase/migrations/20260227_fix_foreman_project_400_error.sql:180
--       GRANT SELECT ON areas TO anon;
--     supabase/migrations/20260228_fix_foreman_auth_errors.sql:583
--       GRANT SELECT ON areas TO anon;
--
--   The earlier `GRANT SELECT, UPDATE ON areas TO anon` (from
--   20241230_field_cor_access.sql / 20250116_fix_ambiguous_project_id*)
--   never had its UPDATE component reaffirmed by the later
--   "self-contained" migrations, so any environment that pruned
--   privileges (or was rebuilt from scratch) ends up with anon
--   missing UPDATE on areas.
--
--   Same failure pattern as `20260504_fix_daily_reports_update_rls`
--   — RLS policy present, table-level grant missing.
--
-- FIX:
--   Re-create the canonical SELECT / UPDATE policies on `areas`
--   using the shared can_access_project() helper, and re-issue
--   GRANT SELECT, UPDATE on areas TO anon and authenticated.
--
--   IDEMPOTENT — safe to re-run on any database.
-- ============================================================

DROP POLICY IF EXISTS "Field users can view areas"   ON areas;
DROP POLICY IF EXISTS "Field users can update areas" ON areas;
DROP POLICY IF EXISTS "Secure field access to areas" ON areas;
DROP POLICY IF EXISTS "Secure field update areas"    ON areas;

CREATE POLICY "Secure field access to areas"
  ON areas FOR SELECT
  USING (can_access_project(project_id));

CREATE POLICY "Secure field update areas"
  ON areas FOR UPDATE
  USING      (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));

-- Table-level grants. Without UPDATE, RLS is never even reached
-- and PostgreSQL returns "permission denied for table areas".
GRANT SELECT, UPDATE ON areas TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON areas TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'FIX APPLIED: 20260519_fix_areas_update_grant';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'areas: SELECT / UPDATE policies restored';
  RAISE NOTICE 'anon: GRANT SELECT, UPDATE ON areas re-issued';
  RAISE NOTICE 'Field foremen can now mark areas working / done from the';
  RAISE NOTICE 'Progress view without the "Error updating" toast.';
  RAISE NOTICE '============================================================';
END $$;
