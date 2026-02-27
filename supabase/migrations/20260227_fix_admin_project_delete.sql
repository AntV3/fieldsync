-- ============================================================
-- FIX: Projects DELETE policy checks legacy 'role' column
-- ============================================================
-- The "Active admins delete company projects" policy checks:
--   uc.role IN ('admin', 'owner', 'office')
-- But migration_access_levels.sql deprecated 'role' in favour of
-- 'access_level'. Users created/updated via the new system have
-- access_level = 'administrator' but role may not match, causing
-- the RLS check to silently block deletion (returns count = 0).
--
-- Fix: replace the DELETE policy to check access_level = 'administrator'
-- which is the canonical field going forward.
-- ============================================================

DROP POLICY IF EXISTS "Active admins delete company projects" ON projects;

CREATE POLICY "Active admins delete company projects"
ON projects FOR DELETE
USING (
  (company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
      AND uc.company_id = projects.company_id
      AND uc.status = 'active'
      AND (
        uc.access_level = 'administrator'
        OR uc.role IN ('admin', 'owner', 'office')  -- legacy fallback
      )
  ))
  OR company_id IS NULL
);

DO $$
BEGIN
  RAISE NOTICE 'APPLIED: 20260227_fix_admin_project_delete';
  RAISE NOTICE '  - projects DELETE policy now checks access_level = ''administrator''';
  RAISE NOTICE '  - legacy role check kept as fallback for older accounts';
END $$;
