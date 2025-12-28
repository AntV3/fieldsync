-- ============================================
-- ACCESS LEVELS & PROJECT ROLES MIGRATION
-- Separates security (access_level) from visibility (project_role)
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- PHASE 1: BACKUP CURRENT DATA
-- ============================================

-- Create backup of current roles (for rollback if needed)
CREATE TABLE IF NOT EXISTS _backup_user_companies_roles AS
SELECT id, user_id, company_id, role, status
FROM user_companies;

-- ============================================
-- PHASE 2: ADD ACCESS_LEVEL COLUMN
-- ============================================

-- Add new access_level column (keep role for now during transition)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_companies' AND column_name = 'access_level'
  ) THEN
    ALTER TABLE user_companies ADD COLUMN access_level TEXT DEFAULT 'member';
  END IF;
END $$;

-- ============================================
-- PHASE 3: MIGRATE DATA
-- ============================================

-- Map existing roles to access levels
-- owner, admin → administrator
-- office, member, foreman, anything else → member
UPDATE user_companies
SET access_level = CASE
  WHEN role IN ('owner', 'admin') THEN 'administrator'
  ELSE 'member'
END
WHERE access_level IS NULL OR access_level = 'member';

-- Ensure company owners are always administrators
UPDATE user_companies uc
SET access_level = 'administrator'
FROM companies c
WHERE c.owner_user_id = uc.user_id
AND c.id = uc.company_id;

-- ============================================
-- PHASE 4: ADD CONSTRAINT
-- ============================================

-- Add constraint for access_level values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_companies_access_level_check'
  ) THEN
    ALTER TABLE user_companies
    ADD CONSTRAINT user_companies_access_level_check
    CHECK (access_level IN ('administrator', 'member'));
  END IF;
END $$;

-- ============================================
-- PHASE 5: CREATE PROJECT_USERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS project_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_role TEXT NOT NULL DEFAULT 'Team Member',
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  UNIQUE(project_id, user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_users_project ON project_users(project_id);
CREATE INDEX IF NOT EXISTS idx_project_users_user ON project_users(user_id);

-- Add composite index for RLS performance
CREATE INDEX IF NOT EXISTS idx_user_companies_lookup
ON user_companies(user_id, company_id, status, access_level);

-- ============================================
-- PHASE 6: ENABLE RLS ON PROJECT_USERS
-- ============================================

ALTER TABLE project_users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "View project team" ON project_users;
DROP POLICY IF EXISTS "Administrators manage project team" ON project_users;

-- Active company members can view project team
CREATE POLICY "View project team"
ON project_users FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects p
    JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = project_users.project_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
  )
);

-- Only administrators can insert/update/delete project team members
CREATE POLICY "Administrators manage project team"
ON project_users FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects p
    JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = project_users.project_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
    AND uc.access_level = 'administrator'
  )
);

CREATE POLICY "Administrators update project team"
ON project_users FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects p
    JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = project_users.project_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
    AND uc.access_level = 'administrator'
  )
);

CREATE POLICY "Administrators delete project team"
ON project_users FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects p
    JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = project_users.project_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
    AND uc.access_level = 'administrator'
  )
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON project_users TO authenticated;

-- ============================================
-- PHASE 7: UPDATE EXISTING RLS POLICIES
-- ============================================

-- Update user_companies policies to use access_level
DROP POLICY IF EXISTS "Admins view company memberships" ON user_companies;
DROP POLICY IF EXISTS "Admins manage company memberships" ON user_companies;
DROP POLICY IF EXISTS "Admins reject pending memberships" ON user_companies;
DROP POLICY IF EXISTS "Admins create memberships" ON user_companies;

-- Administrators can view all memberships in their company
CREATE POLICY "Admins view company memberships"
ON user_companies FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.access_level = 'administrator'
  )
);

-- Administrators can update memberships (approve/change access level)
CREATE POLICY "Admins manage company memberships"
ON user_companies FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.access_level = 'administrator'
  )
);

-- Administrators can delete pending memberships (reject)
CREATE POLICY "Admins reject pending memberships"
ON user_companies FOR DELETE
TO authenticated
USING (
  user_companies.status = 'pending'
  AND EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.access_level = 'administrator'
  )
);

-- Administrators can create memberships (for invites)
CREATE POLICY "Admins create memberships"
ON user_companies FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.access_level = 'administrator'
  )
);

-- ============================================
-- PHASE 8: UPDATE COMPANIES POLICIES
-- ============================================

DROP POLICY IF EXISTS "Admins manage companies" ON companies;

CREATE POLICY "Admins manage companies"
ON companies FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = companies.id
    AND uc.status = 'active'
    AND uc.access_level = 'administrator'
  )
);

-- ============================================
-- PHASE 9: UPDATE COMPANY_BRANDING POLICIES
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_branding') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins update company branding" ON company_branding';
    EXECUTE 'DROP POLICY IF EXISTS "Admins insert company branding" ON company_branding';

    EXECUTE '
    CREATE POLICY "Admins update company branding"
    ON company_branding FOR UPDATE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
        AND uc.company_id = company_branding.company_id
        AND uc.status = ''active''
        AND uc.access_level = ''administrator''
      )
    )';

    EXECUTE '
    CREATE POLICY "Admins insert company branding"
    ON company_branding FOR INSERT
    TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
        AND uc.company_id = company_branding.company_id
        AND uc.status = ''active''
        AND uc.access_level = ''administrator''
      )
    )';
  END IF;
END $$;

-- ============================================
-- PHASE 10: UPDATE RPC FUNCTIONS
-- ============================================

-- Update approve_membership function to use access_level
CREATE OR REPLACE FUNCTION approve_membership_with_role(
  membership_id UUID,
  approved_by_user UUID,
  new_access_level TEXT DEFAULT 'member'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_company_id UUID;
  approver_status TEXT;
  approver_access TEXT;
BEGIN
  -- Get the company_id from the membership being approved
  SELECT company_id INTO target_company_id
  FROM user_companies
  WHERE id = membership_id;

  IF target_company_id IS NULL THEN
    RAISE EXCEPTION 'Membership not found';
  END IF;

  -- Verify the approver is an active administrator of this company
  SELECT uc.status, uc.access_level INTO approver_status, approver_access
  FROM user_companies uc
  WHERE uc.user_id = approved_by_user
  AND uc.company_id = target_company_id;

  IF approver_status != 'active' OR approver_access != 'administrator' THEN
    RAISE EXCEPTION 'Unauthorized: Only active administrators can approve memberships';
  END IF;

  -- Validate access_level value
  IF new_access_level NOT IN ('member', 'administrator') THEN
    RAISE EXCEPTION 'Invalid access level: %. Must be member or administrator', new_access_level;
  END IF;

  -- Update the membership
  UPDATE user_companies
  SET
    status = 'active',
    access_level = new_access_level,
    approved_at = NOW(),
    approved_by = approved_by_user
  WHERE id = membership_id
  AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership not found or already processed';
  END IF;
END;
$$;

-- Update has_active_company_membership to optionally check access level
CREATE OR REPLACE FUNCTION has_admin_access(check_user_id UUID, check_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_companies
    WHERE user_id = check_user_id
    AND company_id = check_company_id
    AND status = 'active'
    AND access_level = 'administrator'
  );
$$;

GRANT EXECUTE ON FUNCTION has_admin_access(UUID, UUID) TO authenticated;

-- ============================================
-- PHASE 11: ADD COMMENTS
-- ============================================

COMMENT ON COLUMN user_companies.access_level IS 'Security level: administrator (full control) or member (standard access)';
COMMENT ON COLUMN user_companies.role IS 'DEPRECATED: Use access_level instead. Kept for backwards compatibility.';
COMMENT ON TABLE project_users IS 'Associates users with projects and their project-specific role (informational only, not security)';
COMMENT ON COLUMN project_users.project_role IS 'Display role for project context (PM, Foreman, etc). Not used for authorization.';

-- ============================================
-- PHASE 12: VERIFICATION QUERIES
-- ============================================

-- Run these to verify migration:
-- SELECT access_level, COUNT(*) FROM user_companies GROUP BY access_level;
-- SELECT * FROM project_users LIMIT 5;
-- SELECT policyname FROM pg_policies WHERE tablename = 'project_users';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- Summary:
-- 1. Added access_level column to user_companies
-- 2. Migrated existing roles to access levels
-- 3. Created project_users table for project team
-- 4. Updated all RLS policies to use access_level
-- 5. Updated RPC functions
-- 6. Added performance indexes
-- ============================================
