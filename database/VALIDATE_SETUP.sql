-- ========================================
-- VALIDATION & TESTING SCRIPT
-- ========================================
-- Run this to verify your database setup is working correctly
-- This checks all critical components for foreman access
-- ========================================

DO $$
DECLARE
  v_errors INTEGER := 0;
  v_warnings INTEGER := 0;
  v_company_count INTEGER;
  v_project_count INTEGER;
  v_area_count INTEGER;
BEGIN

  RAISE NOTICE '========================================';
  RAISE NOTICE 'FieldSync Database Validation';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';

  -- ========================================
  -- CHECK 1: Tables Exist
  -- ========================================
  RAISE NOTICE '1. Checking tables...';

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies') THEN
    RAISE WARNING '  ❌ Table "companies" does not exist!';
    v_errors := v_errors + 1;
  ELSE
    RAISE NOTICE '  ✅ companies table exists';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    RAISE WARNING '  ❌ Table "projects" does not exist!';
    v_errors := v_errors + 1;
  ELSE
    RAISE NOTICE '  ✅ projects table exists';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'areas') THEN
    RAISE WARNING '  ❌ Table "areas" does not exist!';
    v_errors := v_errors + 1;
  ELSE
    RAISE NOTICE '  ✅ areas table exists';
  END IF;

  RAISE NOTICE '';

  -- ========================================
  -- CHECK 2: RLS Policies
  -- ========================================
  RAISE NOTICE '2. Checking RLS policies...';

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'companies' AND policyname = 'Anyone can view companies by code'
  ) THEN
    RAISE WARNING '  ❌ Missing RLS policy: "Anyone can view companies by code" on companies';
    v_errors := v_errors + 1;
  ELSE
    RAISE NOTICE '  ✅ Companies RLS policy exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'projects' AND policyname = 'Anyone can view projects by PIN'
  ) THEN
    RAISE WARNING '  ❌ Missing RLS policy: "Anyone can view projects by PIN" on projects';
    v_errors := v_errors + 1;
  ELSE
    RAISE NOTICE '  ✅ Projects RLS policy exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'areas' AND policyname = 'Anyone can view areas'
  ) THEN
    RAISE WARNING '  ❌ Missing RLS policy: "Anyone can view areas" on areas';
    v_errors := v_errors + 1;
  ELSE
    RAISE NOTICE '  ✅ Areas view RLS policy exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'areas' AND policyname = 'Anyone can update areas'
  ) THEN
    RAISE WARNING '  ❌ Missing RLS policy: "Anyone can update areas" on areas';
    v_errors := v_errors + 1;
  ELSE
    RAISE NOTICE '  ✅ Areas update RLS policy exists';
  END IF;

  RAISE NOTICE '';

  -- ========================================
  -- CHECK 3: Data Exists
  -- ========================================
  RAISE NOTICE '3. Checking data...';

  SELECT COUNT(*) INTO v_company_count FROM companies;
  SELECT COUNT(*) INTO v_project_count FROM projects WHERE status = 'active';
  SELECT COUNT(*) INTO v_area_count FROM areas;

  IF v_company_count = 0 THEN
    RAISE WARNING '  ⚠️  No companies found! Run setup_ggg_miller_companies.sql';
    v_warnings := v_warnings + 1;
  ELSE
    RAISE NOTICE '  ✅ % companies found', v_company_count;
  END IF;

  IF v_project_count = 0 THEN
    RAISE WARNING '  ⚠️  No active projects found! Create projects for your companies';
    v_warnings := v_warnings + 1;
  ELSE
    RAISE NOTICE '  ✅ % active projects found', v_project_count;
  END IF;

  IF v_area_count = 0 THEN
    RAISE WARNING '  ⚠️  No areas found! Create areas for your projects';
    v_warnings := v_warnings + 1;
  ELSE
    RAISE NOTICE '  ✅ % areas found', v_area_count;
  END IF;

  RAISE NOTICE '';

  -- ========================================
  -- CHECK 4: PIN Validation
  -- ========================================
  RAISE NOTICE '4. Checking PINs...';

  -- Check for duplicate PINs
  IF EXISTS (
    SELECT pin, COUNT(*)
    FROM projects
    WHERE pin IS NOT NULL
    GROUP BY pin
    HAVING COUNT(*) > 1
  ) THEN
    RAISE WARNING '  ❌ Duplicate PINs found!';
    v_errors := v_errors + 1;

    FOR rec IN (
      SELECT pin, COUNT(*) as count
      FROM projects
      WHERE pin IS NOT NULL
      GROUP BY pin
      HAVING COUNT(*) > 1
    ) LOOP
      RAISE WARNING '     PIN % is used % times', rec.pin, rec.count;
    END LOOP;
  ELSE
    RAISE NOTICE '  ✅ All PINs are unique';
  END IF;

  -- Check for invalid PINs (not 4 digits)
  IF EXISTS (
    SELECT 1 FROM projects
    WHERE pin IS NOT NULL AND (LENGTH(pin) != 4 OR pin !~ '^\d{4}$')
  ) THEN
    RAISE WARNING '  ❌ Invalid PINs found (must be 4 digits)';
    v_errors := v_errors + 1;

    FOR rec IN (
      SELECT id, name, pin
      FROM projects
      WHERE pin IS NOT NULL AND (LENGTH(pin) != 4 OR pin !~ '^\d{4}$')
    ) LOOP
      RAISE WARNING '     Project "%" has invalid PIN: %', rec.name, rec.pin;
    END LOOP;
  ELSE
    RAISE NOTICE '  ✅ All PINs are valid (4 digits)';
  END IF;

  RAISE NOTICE '';

  -- ========================================
  -- CHECK 5: Company Code Validation
  -- ========================================
  RAISE NOTICE '5. Checking company codes...';

  -- Check for duplicate company codes (should be prevented by UNIQUE constraint)
  IF EXISTS (
    SELECT code, COUNT(*)
    FROM companies
    GROUP BY code
    HAVING COUNT(*) > 1
  ) THEN
    RAISE WARNING '  ❌ Duplicate company codes found!';
    v_errors := v_errors + 1;
  ELSE
    RAISE NOTICE '  ✅ All company codes are unique';
  END IF;

  -- Check for invalid company codes (empty or too long)
  IF EXISTS (
    SELECT 1 FROM companies
    WHERE code IS NULL OR LENGTH(code) < 2 OR LENGTH(code) > 20
  ) THEN
    RAISE WARNING '  ⚠️  Some company codes are invalid (should be 2-20 characters)';
    v_warnings := v_warnings + 1;
  ELSE
    RAISE NOTICE '  ✅ All company codes are valid length';
  END IF;

  RAISE NOTICE '';

  -- ========================================
  -- CHECK 6: Indexes
  -- ========================================
  RAISE NOTICE '6. Checking indexes...';

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'companies' AND indexname = 'idx_companies_code'
  ) THEN
    RAISE WARNING '  ⚠️  Missing index on companies(code)';
    v_warnings := v_warnings + 1;
  ELSE
    RAISE NOTICE '  ✅ Index on companies(code) exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'projects' AND indexname = 'idx_projects_pin'
  ) THEN
    RAISE WARNING '  ⚠️  Missing index on projects(pin)';
    v_warnings := v_warnings + 1;
  ELSE
    RAISE NOTICE '  ✅ Index on projects(pin) exists';
  END IF;

  RAISE NOTICE '';

  -- ========================================
  -- SUMMARY
  -- ========================================
  RAISE NOTICE '========================================';
  RAISE NOTICE 'VALIDATION SUMMARY';
  RAISE NOTICE '========================================';

  IF v_errors = 0 AND v_warnings = 0 THEN
    RAISE NOTICE '✅ ALL CHECKS PASSED!';
    RAISE NOTICE '';
    RAISE NOTICE 'Your database is properly configured for foreman access.';
  ELSIF v_errors = 0 THEN
    RAISE NOTICE '⚠️  PASSED WITH WARNINGS';
    RAISE NOTICE '';
    RAISE NOTICE 'Errors: 0';
    RAISE NOTICE 'Warnings: %', v_warnings;
    RAISE NOTICE '';
    RAISE NOTICE 'The database is functional but has some warnings.';
    RAISE NOTICE 'Review the warnings above.';
  ELSE
    RAISE EXCEPTION 'VALIDATION FAILED! Errors: %, Warnings: %', v_errors, v_warnings;
  END IF;

  RAISE NOTICE '========================================';

END $$;

-- ========================================
-- DETAILED DATA REPORT
-- ========================================

SELECT '=== COMPANIES ===' as report;
SELECT
  name as "Company Name",
  code as "Code (foreman entry)",
  id as "ID",
  (SELECT COUNT(*) FROM projects WHERE company_id = companies.id) as "# Projects",
  created_at as "Created"
FROM companies
ORDER BY created_at DESC;

SELECT '=== PROJECTS ===' as report;
SELECT
  c.name as "Company",
  p.name as "Project Name",
  p.pin as "PIN",
  p.status as "Status",
  p.contract_value as "Contract $",
  (SELECT COUNT(*) FROM areas WHERE project_id = p.id) as "# Areas",
  p.created_at as "Created"
FROM projects p
JOIN companies c ON p.company_id = c.id
ORDER BY c.name, p.name;

SELECT '=== ACTIVE PROJECTS FOR FOREMAN ACCESS ===' as report;
SELECT
  c.code as "Company Code",
  c.name as "Company Name",
  p.pin as "PIN",
  p.name as "Project Name",
  (SELECT COUNT(*) FROM areas WHERE project_id = p.id) as "# Areas"
FROM projects p
JOIN companies c ON p.company_id = c.id
WHERE p.status = 'active' AND p.pin IS NOT NULL
ORDER BY c.code, p.pin;

-- ========================================
-- TEST INSTRUCTIONS
-- ========================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'READY TO TEST FOREMAN ACCESS!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Use the "ACTIVE PROJECTS FOR FOREMAN ACCESS" table above';
  RAISE NOTICE 'to find company codes and PINs for testing.';
  RAISE NOTICE '';
  RAISE NOTICE 'Example:';
  RAISE NOTICE '1. Open FieldSync app';
  RAISE NOTICE '2. Select "Foreman"';
  RAISE NOTICE '3. Enter a company code from the table';
  RAISE NOTICE '4. Enter the corresponding PIN';
  RAISE NOTICE '5. You should see the project with areas!';
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
END $$;
