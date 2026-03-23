-- ============================================================
-- FIX: punch_list_items RLS policies for field users (foremen)
--
-- ROOT CAUSE:
--   The original punch_list_items policies only check auth.uid(),
--   which is NULL for field users (anon role with x-field-session).
--   A later migration (20260228) added can_access_project() policies
--   alongside the originals, but the original policies may not have
--   been present on all database instances, or may have conflicted.
--
-- FIX:
--   Replace ALL policies with unified ones using can_access_project(),
--   which handles both authenticated (office) and anon (field) users.
--   This matches the pattern used for disposal_loads and daily_reports.
--
-- This migration is IDEMPOTENT — safe to re-run on any database.
-- ============================================================

-- Drop ALL existing policies (original auth.uid()-based + field session ones)
DROP POLICY IF EXISTS "punch_list_select" ON punch_list_items;
DROP POLICY IF EXISTS "punch_list_insert" ON punch_list_items;
DROP POLICY IF EXISTS "punch_list_update" ON punch_list_items;
DROP POLICY IF EXISTS "punch_list_delete" ON punch_list_items;
DROP POLICY IF EXISTS "Field users can view punch list" ON punch_list_items;
DROP POLICY IF EXISTS "Field users can create punch list items" ON punch_list_items;
DROP POLICY IF EXISTS "Field users can update punch list items" ON punch_list_items;
DROP POLICY IF EXISTS "Secure field view punch list" ON punch_list_items;
DROP POLICY IF EXISTS "Secure field create punch list items" ON punch_list_items;
DROP POLICY IF EXISTS "Secure field update punch list items" ON punch_list_items;

-- Create unified policies using can_access_project()
-- This function checks auth.uid() for office users and
-- validate_field_session() for field users (foremen).

CREATE POLICY "punch_list_select"
  ON punch_list_items FOR SELECT
  USING (can_access_project(project_id));

CREATE POLICY "punch_list_insert"
  ON punch_list_items FOR INSERT
  WITH CHECK (can_access_project(project_id));

CREATE POLICY "punch_list_update"
  ON punch_list_items FOR UPDATE
  USING (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));

CREATE POLICY "punch_list_delete"
  ON punch_list_items FOR DELETE
  USING (can_access_project(project_id));

-- Ensure anon role has necessary grants
GRANT SELECT, INSERT, UPDATE, DELETE ON punch_list_items TO anon;
