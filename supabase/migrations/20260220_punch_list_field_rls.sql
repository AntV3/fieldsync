-- ============================================================
-- Add field session (foreman) RLS policies to punch_list_items
-- ============================================================
-- The original punch_list_items migration only added office-user
-- policies (auth.uid()). This migration updates them to also
-- allow authenticated field workers with a valid session token
-- to read, add, and update punch list items.
--
-- Relies on can_access_project() from 20260218_secure_field_rls.sql
-- which handles both authenticated office users and field sessions.
-- ============================================================

-- Drop the original office-only policies
DROP POLICY IF EXISTS punch_list_select ON punch_list_items;
DROP POLICY IF EXISTS punch_list_insert ON punch_list_items;
DROP POLICY IF EXISTS punch_list_update ON punch_list_items;
DROP POLICY IF EXISTS punch_list_delete ON punch_list_items;

-- SELECT: office users and foreman with valid session can read
CREATE POLICY "punch_list_select"
  ON punch_list_items FOR SELECT
  USING (can_access_project(project_id));

-- INSERT: office users and foreman with valid session can add items
CREATE POLICY "punch_list_insert"
  ON punch_list_items FOR INSERT
  WITH CHECK (can_access_project(project_id));

-- UPDATE: office users and foreman with valid session can update
--         (e.g. foreman marks items in_progress or complete)
CREATE POLICY "punch_list_update"
  ON punch_list_items FOR UPDATE
  USING (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));

-- DELETE: office users only (requires authenticated session)
CREATE POLICY "punch_list_delete"
  ON punch_list_items FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND company_id IN (
      SELECT uc.company_id FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.status = 'active'
    )
  );

DO $$
BEGIN
  RAISE NOTICE 'punch_list_items: field session RLS policies applied';
  RAISE NOTICE 'Foreman can now SELECT, INSERT, and UPDATE punch list items';
END $$;
