-- ============================================================
-- FIX: Punch List Access for Field Users (Foremen)
-- ============================================================
-- Problem: punch_list_items RLS policies only check auth.uid(),
-- which is only set for authenticated office users.
-- Field users (anon role + x-field-session header) are blocked
-- from reading and writing punch list items.
--
-- This migration adds field-session-based policies so foremen
-- can view and update punch list items for their project.
-- ============================================================

-- ============================================================
-- STEP 1: Add SELECT policy for field users
-- ============================================================

DROP POLICY IF EXISTS "Field users can view punch list" ON punch_list_items;

CREATE POLICY "Field users can view punch list"
ON punch_list_items FOR SELECT
TO anon
USING (can_access_project(project_id));

GRANT SELECT ON punch_list_items TO anon;

-- ============================================================
-- STEP 2: Add INSERT policy for field users
-- ============================================================

DROP POLICY IF EXISTS "Field users can create punch list items" ON punch_list_items;

CREATE POLICY "Field users can create punch list items"
ON punch_list_items FOR INSERT
TO anon
WITH CHECK (can_access_project(project_id));

GRANT INSERT ON punch_list_items TO anon;

-- ============================================================
-- STEP 3: Add UPDATE policy for field users
-- ============================================================

DROP POLICY IF EXISTS "Field users can update punch list items" ON punch_list_items;

CREATE POLICY "Field users can update punch list items"
ON punch_list_items FOR UPDATE
TO anon
USING (can_access_project(project_id))
WITH CHECK (can_access_project(project_id));

GRANT UPDATE ON punch_list_items TO anon;

-- ============================================================
-- VERIFICATION
-- ============================================================

DO $$
DECLARE
  field_policies INTEGER;
BEGIN
  SELECT COUNT(*) INTO field_policies
  FROM pg_policies
  WHERE tablename = 'punch_list_items'
    AND policyname LIKE '%Field%';

  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'PUNCH LIST FIELD ACCESS FIX APPLIED';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Field policies on punch_list_items: %', field_policies;
  RAISE NOTICE '';
  RAISE NOTICE 'Field users can now:';
  RAISE NOTICE '  - View punch list items for their project';
  RAISE NOTICE '  - Create new punch list items';
  RAISE NOTICE '  - Update (resolve, reassign) punch list items';
  RAISE NOTICE '============================================================';
END $$;
