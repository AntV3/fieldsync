-- ============================================================
-- FIX: Punch List Access for Field Users (Foremen)
-- ============================================================
-- Problem: punch_list_items RLS policies only check auth.uid(),
-- which is only set for authenticated office users.
-- Field users (anon role + x-field-session header) are blocked
-- from reading and writing punch list items.
--
-- Fix: Replace ALL policies with unified ones using
-- can_access_project(), which handles both office and field users.
-- ============================================================

-- Drop ALL existing policies
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

-- Create unified policies
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

GRANT SELECT, INSERT, UPDATE, DELETE ON punch_list_items TO anon;
