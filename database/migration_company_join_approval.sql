-- ============================================
-- COMPANY JOIN APPROVAL LAYER - COMPLETE MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================
-- This migration is ORDERED to handle dependencies correctly:
-- 1. Create base tables if they don't exist
-- 2. Add columns to existing tables
-- 3. Create functions
-- 4. Create RLS policies (which depend on the above)
-- ============================================

-- ============================================
-- PHASE 1: ENSURE BASE TABLES EXIST
-- ============================================

-- 1A. Create companies table if not exists
CREATE TABLE IF NOT EXISTS companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code VARCHAR(6) UNIQUE,
  office_code TEXT,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'business', 'enterprise')),
  owner_user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1B. Create users table if not exists
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  company_id UUID REFERENCES companies(id),
  role TEXT DEFAULT 'member',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1C. Create user_companies junction table if not exists
CREATE TABLE IF NOT EXISTS user_companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  removed_at TIMESTAMPTZ,
  removed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(user_id, company_id)
);

-- ============================================
-- PHASE 2: ADD/ENSURE COLUMNS EXIST
-- ============================================

-- 2A. Add office_code to companies if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'office_code'
  ) THEN
    ALTER TABLE companies ADD COLUMN office_code TEXT;
  END IF;
END $$;

-- 2B. Add status column to user_companies if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_companies' AND column_name = 'status'
  ) THEN
    ALTER TABLE user_companies ADD COLUMN status TEXT DEFAULT 'active';
  END IF;
END $$;

-- 2C. Add approved_at column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_companies' AND column_name = 'approved_at'
  ) THEN
    ALTER TABLE user_companies ADD COLUMN approved_at TIMESTAMPTZ;
  END IF;
END $$;

-- 2D. Add approved_by column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_companies' AND column_name = 'approved_by'
  ) THEN
    ALTER TABLE user_companies ADD COLUMN approved_by UUID REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2E. Add removed_at column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_companies' AND column_name = 'removed_at'
  ) THEN
    ALTER TABLE user_companies ADD COLUMN removed_at TIMESTAMPTZ;
  END IF;
END $$;

-- 2F. Add removed_by column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_companies' AND column_name = 'removed_by'
  ) THEN
    ALTER TABLE user_companies ADD COLUMN removed_by UUID REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2G. Add company_id to projects if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE projects ADD COLUMN company_id UUID REFERENCES companies(id);
  END IF;
END $$;

-- 2H. Add status constraint to user_companies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_companies_status_check'
  ) THEN
    ALTER TABLE user_companies
    ADD CONSTRAINT user_companies_status_check
    CHECK (status IN ('pending', 'active', 'removed'));
  END IF;
END $$;

-- ============================================
-- PHASE 3: GENERATE OFFICE CODES FOR EXISTING COMPANIES
-- ============================================

UPDATE companies
SET office_code = UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 6))
WHERE office_code IS NULL;

-- ============================================
-- PHASE 4: CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_companies_code ON companies(code);
CREATE INDEX IF NOT EXISTS idx_companies_office_code ON companies(office_code);
CREATE INDEX IF NOT EXISTS idx_user_companies_status ON user_companies(status);
CREATE INDEX IF NOT EXISTS idx_user_companies_company_status ON user_companies(company_id, status);
CREATE INDEX IF NOT EXISTS idx_user_companies_user_status ON user_companies(user_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_company_id ON projects(company_id);

-- ============================================
-- PHASE 5: CREATE RPC FUNCTIONS
-- ============================================

-- Drop existing functions first to allow parameter name changes
DROP FUNCTION IF EXISTS verify_office_code(UUID, TEXT);
DROP FUNCTION IF EXISTS approve_membership_with_role(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS has_active_company_membership(UUID, UUID);

-- 5A. verify_office_code - Securely verifies office code without exposing it
-- Parameter names must match frontend: company_id, code
CREATE OR REPLACE FUNCTION verify_office_code(company_id UUID, code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_code TEXT;
BEGIN
  SELECT c.office_code INTO stored_code
  FROM companies c
  WHERE c.id = company_id;

  IF stored_code IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN UPPER(TRIM(stored_code)) = UPPER(TRIM(code));
END;
$$;

-- 5B. approve_membership_with_role - Approves membership with role assignment
CREATE OR REPLACE FUNCTION approve_membership_with_role(
  membership_id UUID,
  approved_by_user UUID,
  new_role TEXT DEFAULT 'member'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_company_id UUID;
  approver_status TEXT;
  approver_role TEXT;
BEGIN
  -- Get the company_id from the membership being approved
  SELECT company_id INTO target_company_id
  FROM user_companies
  WHERE id = membership_id;

  IF target_company_id IS NULL THEN
    RAISE EXCEPTION 'Membership not found';
  END IF;

  -- Verify the approver is an active admin/owner of this company
  SELECT uc.status, uc.role INTO approver_status, approver_role
  FROM user_companies uc
  WHERE uc.user_id = approved_by_user
  AND uc.company_id = target_company_id;

  IF approver_status != 'active' OR approver_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Unauthorized: Only active admins can approve memberships';
  END IF;

  -- Validate role value
  IF new_role NOT IN ('member', 'admin', 'owner', 'foreman', 'office') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;

  -- Update the membership
  UPDATE user_companies
  SET
    status = 'active',
    role = new_role,
    approved_at = NOW(),
    approved_by = approved_by_user
  WHERE id = membership_id
  AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership not found or already processed';
  END IF;
END;
$$;

-- 5C. has_active_company_membership - Helper to check active membership
CREATE OR REPLACE FUNCTION has_active_company_membership(check_user_id UUID, check_company_id UUID)
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
  );
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION verify_office_code(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_membership_with_role(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION has_active_company_membership(UUID, UUID) TO authenticated;

-- ============================================
-- PHASE 6: ENABLE RLS ON ALL TABLES
-- ============================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PHASE 7: USER_COMPANIES RLS POLICIES
-- ============================================

-- Drop existing policies first
DROP POLICY IF EXISTS "Users view own memberships" ON user_companies;
DROP POLICY IF EXISTS "Admins view company memberships" ON user_companies;
DROP POLICY IF EXISTS "Admins manage company memberships" ON user_companies;
DROP POLICY IF EXISTS "Admins reject pending memberships" ON user_companies;
DROP POLICY IF EXISTS "Users create pending membership" ON user_companies;
DROP POLICY IF EXISTS "Admins create memberships" ON user_companies;

-- Users can view their own memberships (any status)
CREATE POLICY "Users view own memberships"
ON user_companies FOR SELECT
USING (user_id = auth.uid());

-- Active admins/owners can view all memberships in their company
CREATE POLICY "Admins view company memberships"
ON user_companies FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.role IN ('admin', 'owner')
  )
);

-- Active admins/owners can update memberships (approve/remove)
CREATE POLICY "Admins manage company memberships"
ON user_companies FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.role IN ('admin', 'owner')
  )
);

-- Admins can delete pending memberships (reject)
CREATE POLICY "Admins reject pending memberships"
ON user_companies FOR DELETE
USING (
  user_companies.status = 'pending'
  AND EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.role IN ('admin', 'owner')
  )
);

-- Authenticated users can insert their own pending membership
CREATE POLICY "Users create pending membership"
ON user_companies FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND status = 'pending'
);

-- Active admins can create memberships (for manual invites)
CREATE POLICY "Admins create memberships"
ON user_companies FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.role IN ('admin', 'owner')
  )
);

-- ============================================
-- PHASE 8: COMPANIES RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users view companies" ON companies;
DROP POLICY IF EXISTS "Public view companies by code" ON companies;
DROP POLICY IF EXISTS "Admins manage companies" ON companies;

-- Anyone can look up a company by code (for join flow)
CREATE POLICY "Public view companies by code"
ON companies FOR SELECT
USING (true);

-- Active admins can update their company
CREATE POLICY "Admins manage companies"
ON companies FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = companies.id
    AND uc.status = 'active'
    AND uc.role IN ('admin', 'owner')
  )
);

-- ============================================
-- PHASE 9: USERS RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users view own record" ON users;
DROP POLICY IF EXISTS "Users update own record" ON users;
DROP POLICY IF EXISTS "Admins view company users" ON users;
DROP POLICY IF EXISTS "Service role manage users" ON users;

-- Users can view their own record
CREATE POLICY "Users view own record"
ON users FOR SELECT
USING (id = auth.uid());

-- Users can update their own record
CREATE POLICY "Users update own record"
ON users FOR UPDATE
USING (id = auth.uid());

-- Active admins can view users in their company
CREATE POLICY "Admins view company users"
ON users FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc1
    WHERE uc1.user_id = auth.uid()
    AND uc1.status = 'active'
    AND uc1.role IN ('admin', 'owner')
    AND EXISTS (
      SELECT 1 FROM user_companies uc2
      WHERE uc2.user_id = users.id
      AND uc2.company_id = uc1.company_id
    )
  )
);

-- Allow inserts for new user signup
CREATE POLICY "Users can insert own record"
ON users FOR INSERT
WITH CHECK (id = auth.uid());

-- ============================================
-- PHASE 10: PROJECTS RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Allow all operations on projects" ON projects;
DROP POLICY IF EXISTS "Office can view all projects" ON projects;
DROP POLICY IF EXISTS "Foremen can view assigned projects" ON projects;
DROP POLICY IF EXISTS "Office can manage projects" ON projects;
DROP POLICY IF EXISTS "Active members view company projects" ON projects;
DROP POLICY IF EXISTS "Active members create company projects" ON projects;
DROP POLICY IF EXISTS "Active members update company projects" ON projects;
DROP POLICY IF EXISTS "Active admins delete company projects" ON projects;

-- Only active members can view their company's projects
CREATE POLICY "Active members view company projects"
ON projects FOR SELECT
USING (
  -- If project has company_id, check membership
  (company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = projects.company_id
    AND uc.status = 'active'
  ))
  OR
  -- Legacy: projects without company_id (backwards compatibility)
  company_id IS NULL
);

-- Active members can insert projects for their company
CREATE POLICY "Active members create company projects"
ON projects FOR INSERT
WITH CHECK (
  (company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = projects.company_id
    AND uc.status = 'active'
  ))
  OR company_id IS NULL
);

-- Active members can update projects
CREATE POLICY "Active members update company projects"
ON projects FOR UPDATE
USING (
  (company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = projects.company_id
    AND uc.status = 'active'
  ))
  OR company_id IS NULL
);

-- Only active admins can delete projects
CREATE POLICY "Active admins delete company projects"
ON projects FOR DELETE
USING (
  (company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = projects.company_id
    AND uc.status = 'active'
    AND uc.role IN ('admin', 'owner', 'office')
  ))
  OR company_id IS NULL
);

-- ============================================
-- PHASE 11: AREAS RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Allow all operations on areas" ON areas;
DROP POLICY IF EXISTS "Users can view areas" ON areas;
DROP POLICY IF EXISTS "Users can update area status" ON areas;
DROP POLICY IF EXISTS "Office can manage areas" ON areas;
DROP POLICY IF EXISTS "Office can delete areas" ON areas;
DROP POLICY IF EXISTS "Active members view areas" ON areas;
DROP POLICY IF EXISTS "Active members update areas" ON areas;
DROP POLICY IF EXISTS "Active members create areas" ON areas;
DROP POLICY IF EXISTS "Active admins delete areas" ON areas;

-- Active members can view areas via project->company
CREATE POLICY "Active members view areas"
ON areas FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM projects p
    LEFT JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = areas.project_id
    AND (
      p.company_id IS NULL
      OR (uc.user_id = auth.uid() AND uc.status = 'active')
    )
  )
);

-- Active members can update area status
CREATE POLICY "Active members update areas"
ON areas FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM projects p
    LEFT JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = areas.project_id
    AND (
      p.company_id IS NULL
      OR (uc.user_id = auth.uid() AND uc.status = 'active')
    )
  )
);

-- Active members can insert areas
CREATE POLICY "Active members create areas"
ON areas FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects p
    LEFT JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = areas.project_id
    AND (
      p.company_id IS NULL
      OR (uc.user_id = auth.uid() AND uc.status = 'active')
    )
  )
);

-- Active admins can delete areas
CREATE POLICY "Active admins delete areas"
ON areas FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM projects p
    LEFT JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = areas.project_id
    AND (
      p.company_id IS NULL
      OR (
        uc.user_id = auth.uid()
        AND uc.status = 'active'
        AND uc.role IN ('admin', 'owner', 'office')
      )
    )
  )
);

-- ============================================
-- PHASE 12: CHANGE ORDERS RLS (if table exists)
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'change_orders') THEN
    -- Drop existing policies
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users full access to CORs" ON change_orders';

    -- Create new policy with active membership check
    EXECUTE '
    CREATE POLICY "Active members access CORs"
    ON change_orders FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
        AND uc.company_id = change_orders.company_id
        AND uc.status = ''active''
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
        AND uc.company_id = change_orders.company_id
        AND uc.status = ''active''
      )
    )';
  END IF;
END $$;

-- ============================================
-- PHASE 13: SIGNATURE_REQUESTS RLS (if table exists)
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'signature_requests') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Company users manage signature requests" ON signature_requests';

    EXECUTE '
    CREATE POLICY "Active members manage signature requests"
    ON signature_requests FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
        AND uc.company_id = signature_requests.company_id
        AND uc.status = ''active''
      )
    )';
  END IF;
END $$;

-- ============================================
-- PHASE 14: INJURY_REPORTS RLS (if table exists)
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'injury_reports') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view injury reports" ON injury_reports';
    EXECUTE 'DROP POLICY IF EXISTS "Users can manage injury reports" ON injury_reports';
    EXECUTE 'DROP POLICY IF EXISTS "Active members view injury reports" ON injury_reports';
    EXECUTE 'DROP POLICY IF EXISTS "Active members manage injury reports" ON injury_reports';

    EXECUTE '
    CREATE POLICY "Active members access injury reports"
    ON injury_reports FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
        AND uc.company_id = injury_reports.company_id
        AND uc.status = ''active''
      )
    )';
  END IF;
END $$;

-- ============================================
-- PHASE 15: COMPANY_BRANDING RLS (if table exists)
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_branding') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view their company branding" ON company_branding';
    EXECUTE 'DROP POLICY IF EXISTS "Company admins can update branding" ON company_branding';
    EXECUTE 'DROP POLICY IF EXISTS "Public can view branding by domain" ON company_branding';
    EXECUTE 'DROP POLICY IF EXISTS "Active members view company branding" ON company_branding';
    EXECUTE 'DROP POLICY IF EXISTS "Active admins update company branding" ON company_branding';

    -- Allow viewing branding (for login page custom domains)
    EXECUTE '
    CREATE POLICY "View company branding"
    ON company_branding FOR SELECT
    USING (
      custom_domain IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
        AND uc.company_id = company_branding.company_id
        AND uc.status = ''active''
      )
    )';

    -- Only active admins can modify branding
    EXECUTE '
    CREATE POLICY "Admins update company branding"
    ON company_branding FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
        AND uc.company_id = company_branding.company_id
        AND uc.status = ''active''
        AND uc.role IN (''admin'', ''owner'', ''office'')
      )
    )';

    EXECUTE '
    CREATE POLICY "Admins insert company branding"
    ON company_branding FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
        AND uc.company_id = company_branding.company_id
        AND uc.status = ''active''
        AND uc.role IN (''admin'', ''owner'', ''office'')
      )
    )';
  END IF;
END $$;

-- ============================================
-- PHASE 16: GRANT PERMISSIONS
-- ============================================

GRANT SELECT ON companies TO authenticated;
GRANT SELECT ON companies TO anon;
GRANT SELECT, INSERT, UPDATE ON users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_companies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON areas TO authenticated;

-- ============================================
-- PHASE 17: DOCUMENTATION
-- ============================================

COMMENT ON FUNCTION verify_office_code IS 'Securely verifies office code without exposing it. Returns true if code matches.';
COMMENT ON FUNCTION approve_membership_with_role IS 'Approves a pending membership with role assignment. Only callable by active admins.';
COMMENT ON FUNCTION has_active_company_membership IS 'Helper to check if user has active membership in a company.';
COMMENT ON COLUMN user_companies.status IS 'Membership status: pending (awaiting approval), active (approved), removed (soft-deleted)';
COMMENT ON COLUMN user_companies.approved_at IS 'Timestamp when membership was approved';
COMMENT ON COLUMN user_companies.approved_by IS 'User ID of admin who approved';
COMMENT ON COLUMN user_companies.removed_at IS 'Timestamp when membership was removed';
COMMENT ON COLUMN user_companies.removed_by IS 'User ID of admin who removed';
COMMENT ON COLUMN companies.office_code IS 'Secret code for office staff to join company (verified server-side only)';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
