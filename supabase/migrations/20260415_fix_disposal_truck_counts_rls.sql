-- ============================================================
-- FIX: disposal_truck_counts RLS policies for field users (foremen)
--
-- ROOT CAUSE:
--   disposal_truck_counts was created in 20260306 with RLS policies
--   that only check auth.uid(), which is NULL for field users
--   (anon role authenticated via PIN / x-field-session token).
--   A follow-up migration (20260306_fix_permissions) added the
--   missing GRANT statements, but the RLS policies themselves were
--   never updated. As a result, foremen on the mobile view cannot
--   save the "Trucks Used" count — INSERT/UPDATE are silently
--   blocked by RLS.
--
-- FIX:
--   Replace all disposal_truck_counts policies with unified ones
--   using can_access_project(), which handles both authenticated
--   (office) and anon (field) users. This matches the pattern
--   already in use for disposal_loads, daily_reports, and
--   punch_list_items.
--
-- This migration is IDEMPOTENT — safe to re-run on any database.
-- ============================================================

-- Drop ALL existing policies (original auth.uid()-based variants)
DROP POLICY IF EXISTS "Users can view truck counts for their projects"     ON disposal_truck_counts;
DROP POLICY IF EXISTS "Users can insert truck counts for assigned projects" ON disposal_truck_counts;
DROP POLICY IF EXISTS "Users can update truck counts for their projects"   ON disposal_truck_counts;
DROP POLICY IF EXISTS "Users can delete truck counts for their projects"   ON disposal_truck_counts;
DROP POLICY IF EXISTS "Secure field view truck counts"                     ON disposal_truck_counts;
DROP POLICY IF EXISTS "Secure field create truck counts"                   ON disposal_truck_counts;
DROP POLICY IF EXISTS "Secure field update truck counts"                   ON disposal_truck_counts;
DROP POLICY IF EXISTS "Secure field delete truck counts"                   ON disposal_truck_counts;

-- Create unified policies using can_access_project()
-- This function checks auth.uid() for office users and
-- validate_field_session() for field users (foremen).

CREATE POLICY "Secure field view truck counts"
  ON disposal_truck_counts FOR SELECT
  USING (can_access_project(project_id));

CREATE POLICY "Secure field create truck counts"
  ON disposal_truck_counts FOR INSERT
  WITH CHECK (can_access_project(project_id));

CREATE POLICY "Secure field update truck counts"
  ON disposal_truck_counts FOR UPDATE
  USING     (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));

CREATE POLICY "Secure field delete truck counts"
  ON disposal_truck_counts FOR DELETE
  USING (can_access_project(project_id));

-- Ensure anon role has necessary grants (already added in
-- 20260306_fix_permissions, but re-assert here for idempotency
-- on databases where that migration hasn't run yet).
GRANT SELECT, INSERT, UPDATE, DELETE ON disposal_truck_counts TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON disposal_truck_counts TO anon;
