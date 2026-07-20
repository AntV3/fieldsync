-- =============================================
-- FIX: Document Folders RLS Policies
-- =============================================
-- This migration fixes the RLS policy error:
-- "new row violates row-level security policy for table document_folders"
-- Error code: 42501
--
-- Run this in Supabase SQL Editor
-- =============================================

-- =============================================
-- STEP 1: Ensure table exists with RLS enabled
-- =============================================

-- Create table if not exists (idempotent)
CREATE TABLE IF NOT EXISTS document_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'folder',
  color TEXT DEFAULT 'blue',
  sort_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, name)
);

-- Enable RLS (idempotent)
ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;

-- =============================================
-- STEP 2: Drop all existing policies (clean slate)
-- =============================================

DROP POLICY IF EXISTS "folders_select" ON document_folders;
DROP POLICY IF EXISTS "folders_field_select" ON document_folders;
DROP POLICY IF EXISTS "folders_insert" ON document_folders;
DROP POLICY IF EXISTS "folders_update" ON document_folders;
DROP POLICY IF EXISTS "folders_delete" ON document_folders;
DROP POLICY IF EXISTS "document_folders_select" ON document_folders;
DROP POLICY IF EXISTS "document_folders_insert" ON document_folders;
DROP POLICY IF EXISTS "document_folders_update" ON document_folders;
DROP POLICY IF EXISTS "document_folders_delete" ON document_folders;

-- =============================================
-- STEP 3: Create SELECT policies
-- =============================================

-- Authenticated company members can view folders
CREATE POLICY "folders_select" ON document_folders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
    )
  );

-- Field users can view via project access (if can_access_project function exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'can_access_project') THEN
    EXECUTE '
      CREATE POLICY "folders_field_select" ON document_folders
        FOR SELECT
        TO anon
        USING (can_access_project(project_id))
    ';
  END IF;
END $$;

-- =============================================
-- STEP 4: Create INSERT policy
-- =============================================

-- Office users (member/administrator) can create folders
CREATE POLICY "folders_insert" ON document_folders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
        AND (
          uc.access_level IN ('member', 'administrator')
          OR uc.access_level IS NULL  -- Fallback for legacy users without access_level set
        )
    )
  );

-- =============================================
-- STEP 5: Create UPDATE policy
-- =============================================

-- Office users can update folders
CREATE POLICY "folders_update" ON document_folders
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
        AND (
          uc.access_level IN ('member', 'administrator')
          OR uc.access_level IS NULL
        )
    )
  );

-- =============================================
-- STEP 6: Create DELETE policy
-- =============================================

-- Only administrators can delete folders
CREATE POLICY "folders_delete" ON document_folders
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
        AND uc.access_level = 'administrator'
    )
  );

-- =============================================
-- STEP 7: Grant permissions
-- =============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON document_folders TO authenticated;
GRANT SELECT ON document_folders TO anon;

-- =============================================
-- STEP 8: Create indexes for performance
-- =============================================

CREATE INDEX IF NOT EXISTS idx_folders_project ON document_folders(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_folders_company ON document_folders(company_id);

-- =============================================
-- STEP 9: Fix access_level for any NULL values
-- =============================================

-- Set default access_level for users who have NULL (legacy users)
UPDATE user_companies
SET access_level = 'member'
WHERE access_level IS NULL
  AND status = 'active';

-- Ensure company owners are always administrators
UPDATE user_companies uc
SET access_level = 'administrator'
FROM companies c
WHERE c.owner_user_id = uc.user_id
  AND c.id = uc.company_id
  AND (uc.access_level IS NULL OR uc.access_level != 'administrator');

-- =============================================
-- VERIFICATION
-- =============================================

DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'document_folders';

  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'DOCUMENT FOLDERS RLS FIX APPLIED SUCCESSFULLY';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Policies created: %', policy_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Users can now:';
  RAISE NOTICE '  - VIEW folders: All active company members';
  RAISE NOTICE '  - CREATE folders: Members and Administrators';
  RAISE NOTICE '  - UPDATE folders: Members and Administrators';
  RAISE NOTICE '  - DELETE folders: Administrators only';
  RAISE NOTICE '';
  RAISE NOTICE 'Try creating a folder in your Documents tab now!';
  RAISE NOTICE '============================================================';
END $$;
