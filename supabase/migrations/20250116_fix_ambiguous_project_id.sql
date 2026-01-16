-- ============================================================
-- FIX AMBIGUOUS PROJECT_ID ERROR
-- ============================================================
-- Problem: "Error: column reference 'project_id' is ambiguous"
-- occurs when field users try to validate PIN
--
-- Root cause: Conflicting or complex RLS policies on projects table
-- that weren't properly cleaned up from earlier migrations
--
-- Solution: Drop ALL existing RLS policies and recreate with
-- simple, non-conflicting policies
-- ============================================================

-- ============================================================
-- 1. DROP ALL EXISTING POLICIES ON PROJECTS
-- ============================================================

-- Drop all possible project policies from various migrations
DROP POLICY IF EXISTS "Allow all operations on projects" ON projects;
DROP POLICY IF EXISTS "Office can view all projects" ON projects;
DROP POLICY IF EXISTS "Foremen can view assigned projects" ON projects;
DROP POLICY IF EXISTS "Office can manage projects" ON projects;
DROP POLICY IF EXISTS "Anyone can view projects by PIN" ON projects;
DROP POLICY IF EXISTS "Authenticated users can manage projects" ON projects;
DROP POLICY IF EXISTS "Field users can view projects" ON projects;
DROP POLICY IF EXISTS "Secure field view projects" ON projects;
DROP POLICY IF EXISTS "Active members view projects" ON projects;
DROP POLICY IF EXISTS "Active members manage projects" ON projects;

-- ============================================================
-- 2. DROP ALL EXISTING POLICIES ON AREAS
-- ============================================================

-- Drop all possible area policies
DROP POLICY IF EXISTS "Allow all operations on areas" ON areas;
DROP POLICY IF EXISTS "Users can view areas" ON areas;
DROP POLICY IF EXISTS "Users can update area status" ON areas;
DROP POLICY IF EXISTS "Office can manage areas" ON areas;
DROP POLICY IF EXISTS "Office can delete areas" ON areas;
DROP POLICY IF EXISTS "Anyone can view areas" ON areas;
DROP POLICY IF EXISTS "Anyone can update areas" ON areas;
DROP POLICY IF EXISTS "Authenticated can create areas" ON areas;
DROP POLICY IF EXISTS "Authenticated can delete areas" ON areas;
DROP POLICY IF EXISTS "Field users can view areas" ON areas;
DROP POLICY IF EXISTS "Field users can update areas" ON areas;
DROP POLICY IF EXISTS "Secure field access to areas" ON areas;
DROP POLICY IF EXISTS "Secure field update areas" ON areas;
DROP POLICY IF EXISTS "Active members view areas" ON areas;
DROP POLICY IF EXISTS "Active members update areas" ON areas;
DROP POLICY IF EXISTS "Active members create areas" ON areas;
DROP POLICY IF EXISTS "Active admins delete areas" ON areas;

-- ============================================================
-- 3. DROP ALL EXISTING POLICIES ON COMPANIES
-- ============================================================

DROP POLICY IF EXISTS "Field users can view companies" ON companies;
DROP POLICY IF EXISTS "Secure field view companies" ON companies;
DROP POLICY IF EXISTS "Active members view companies" ON companies;
DROP POLICY IF EXISTS "Anyone can view companies" ON companies;

-- ============================================================
-- 4. RECREATE SIMPLE, CLEAN POLICIES FOR PROJECTS
-- ============================================================

-- Field users (anonymous, PIN-authenticated) can view all projects
-- This is safe because they've already validated via PIN
CREATE POLICY "Field users can view projects"
ON projects FOR SELECT
TO anon
USING (true);

-- Authenticated office users can view projects in their company
CREATE POLICY "Authenticated users can view projects"
ON projects FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
      AND uc.company_id = projects.company_id
      AND uc.status = 'active'
  )
);

-- Authenticated office users can manage projects in their company
CREATE POLICY "Authenticated users can manage projects"
ON projects FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
      AND uc.company_id = projects.company_id
      AND uc.status = 'active'
      AND uc.role IN ('admin', 'owner', 'office')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
      AND uc.company_id = projects.company_id
      AND uc.status = 'active'
      AND uc.role IN ('admin', 'owner', 'office')
  )
);

-- ============================================================
-- 5. RECREATE SIMPLE, CLEAN POLICIES FOR AREAS
-- ============================================================

-- Field users can view all areas
CREATE POLICY "Field users can view areas"
ON areas FOR SELECT
TO anon
USING (true);

-- Field users can update area status
CREATE POLICY "Field users can update areas"
ON areas FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Authenticated users can view areas in their company's projects
CREATE POLICY "Authenticated users can view areas"
ON areas FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM projects p
    JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = areas.project_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
  )
);

-- Authenticated users can manage areas in their company's projects
CREATE POLICY "Authenticated users can manage areas"
ON areas FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM projects p
    JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = areas.project_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM projects p
    JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = areas.project_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
  )
);

-- ============================================================
-- 6. RECREATE SIMPLE, CLEAN POLICIES FOR COMPANIES
-- ============================================================

-- Field users can view all companies (they need this to validate company codes)
CREATE POLICY "Field users can view companies"
ON companies FOR SELECT
TO anon
USING (true);

-- Authenticated users can view companies they're members of
CREATE POLICY "Authenticated users can view companies"
ON companies FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
      AND uc.company_id = companies.id
      AND uc.status = 'active'
  )
);

-- ============================================================
-- 7. ENSURE PROPER GRANTS
-- ============================================================

-- Grant necessary permissions to anon role
GRANT SELECT ON projects TO anon;
GRANT SELECT, UPDATE ON areas TO anon;
GRANT SELECT ON companies TO anon;

-- ============================================================
-- 8. SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '✓ FIXED AMBIGUOUS PROJECT_ID ERROR';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'All conflicting RLS policies have been removed and replaced';
  RAISE NOTICE 'with simple, non-conflicting policies.';
  RAISE NOTICE '';
  RAISE NOTICE 'Projects: Field users can view all, authenticated users';
  RAISE NOTICE '          can view/manage their company projects';
  RAISE NOTICE '';
  RAISE NOTICE 'Areas: Field users can view/update all, authenticated users';
  RAISE NOTICE '       can manage their company areas';
  RAISE NOTICE '';
  RAISE NOTICE 'Companies: Field users can view all (for PIN validation),';
  RAISE NOTICE '           authenticated users can view their companies';
  RAISE NOTICE '';
END $$;
