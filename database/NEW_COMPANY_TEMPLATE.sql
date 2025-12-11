-- ========================================
-- NEW COMPANY ONBOARDING TEMPLATE
-- ========================================
-- Use this template to onboard any new customer company
--
-- INSTRUCTIONS:
-- 1. Replace [COMPANY_NAME] with the actual company name
-- 2. Replace [COMPANY_CODE] with a unique code (2-10 characters, uppercase)
-- 3. Replace [PROJECT_NAME] with the project name
-- 4. Replace [CONTRACT_VALUE] with the contract amount
-- 5. Replace [PIN] with a unique 4-digit PIN (must be unique across ALL projects)
-- 6. Customize the areas list for the project
-- 7. Run this script in Supabase SQL Editor
--
-- ========================================

-- ========================================
-- STEP 1: CREATE COMPANY
-- ========================================

DO $$
DECLARE
  v_company_id UUID;
  v_project_id UUID;
  v_company_code TEXT := '[COMPANY_CODE]'; -- CHANGE THIS: e.g., 'ACME', 'SMITH', 'ABC123'
  v_company_name TEXT := '[COMPANY_NAME]'; -- CHANGE THIS: e.g., 'ACME Construction'
BEGIN

  -- Check if company code already exists
  IF EXISTS (SELECT 1 FROM companies WHERE code = v_company_code) THEN
    RAISE EXCEPTION 'Company code "%" already exists! Choose a different code.', v_company_code;
  END IF;

  -- Create company
  INSERT INTO companies (name, code, created_at)
  VALUES (v_company_name, v_company_code, NOW())
  RETURNING id INTO v_company_id;

  RAISE NOTICE 'Company created successfully: % (ID: %)', v_company_name, v_company_id;

  -- ========================================
  -- STEP 2: CREATE FIRST PROJECT
  -- ========================================

  -- Project details - CUSTOMIZE THESE
  DECLARE
    v_project_name TEXT := '[PROJECT_NAME]'; -- CHANGE THIS: e.g., 'Main Street Office Building'
    v_contract_value DECIMAL(12, 2) := [CONTRACT_VALUE]; -- CHANGE THIS: e.g., 500000.00
    v_pin TEXT := '[PIN]'; -- CHANGE THIS: Must be exactly 4 digits, e.g., '9876'
  BEGIN

    -- Validate PIN
    IF LENGTH(v_pin) != 4 OR v_pin !~ '^\d{4}$' THEN
      RAISE EXCEPTION 'PIN must be exactly 4 digits. Got: %', v_pin;
    END IF;

    -- Check if PIN already exists
    IF EXISTS (SELECT 1 FROM projects WHERE pin = v_pin) THEN
      RAISE EXCEPTION 'PIN "%" already exists! Choose a different PIN.', v_pin;
    END IF;

    -- Create project
    INSERT INTO projects (name, contract_value, company_id, pin, status, created_at)
    VALUES (v_project_name, v_contract_value, v_company_id, v_pin, 'active', NOW())
    RETURNING id INTO v_project_id;

    RAISE NOTICE 'Project created successfully: % (PIN: %)', v_project_name, v_pin;

    -- ========================================
    -- STEP 3: CREATE AREAS
    -- ========================================
    -- CUSTOMIZE THIS LIST based on the project scope

    INSERT INTO areas (project_id, name, weight, group_name, status, sort_order, created_at)
    VALUES
      -- Site Work
      (v_project_id, 'Site Preparation', 10.00, 'Site Work', 'not_started', 1, NOW()),
      (v_project_id, 'Excavation', 12.00, 'Site Work', 'not_started', 2, NOW()),

      -- Foundation
      (v_project_id, 'Foundation & Footings', 15.00, 'Foundation', 'not_started', 3, NOW()),
      (v_project_id, 'Slab on Grade', 10.00, 'Foundation', 'not_started', 4, NOW()),

      -- Structure
      (v_project_id, 'Structural Framing', 20.00, 'Structure', 'not_started', 5, NOW()),
      (v_project_id, 'Roof Deck', 8.00, 'Structure', 'not_started', 6, NOW()),

      -- MEP
      (v_project_id, 'Electrical Rough-In', 10.00, 'MEP', 'not_started', 7, NOW()),
      (v_project_id, 'Plumbing Rough-In', 10.00, 'MEP', 'not_started', 8, NOW()),
      (v_project_id, 'HVAC Install', 8.00, 'MEP', 'not_started', 9, NOW()),

      -- Finishes
      (v_project_id, 'Drywall', 10.00, 'Finishes', 'not_started', 10, NOW()),
      (v_project_id, 'Flooring', 8.00, 'Finishes', 'not_started', 11, NOW()),
      (v_project_id, 'Paint', 7.00, 'Finishes', 'not_started', 12, NOW()),

      -- Final
      (v_project_id, 'Final Inspections', 5.00, 'Closeout', 'not_started', 13, NOW());

    RAISE NOTICE 'Areas created successfully (13 areas)';

  END;

  -- ========================================
  -- VERIFICATION
  -- ========================================

  RAISE NOTICE '===========================================';
  RAISE NOTICE 'SETUP COMPLETE!';
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Company Code: %', v_company_code;
  RAISE NOTICE 'Company Name: %', v_company_name;
  RAISE NOTICE 'Project PIN: %', (SELECT pin FROM projects WHERE id = v_project_id);
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'TEST FOREMAN ACCESS:';
  RAISE NOTICE '1. Open FieldSync app';
  RAISE NOTICE '2. Enter company code: %', v_company_code;
  RAISE NOTICE '3. Enter PIN: %', (SELECT pin FROM projects WHERE id = v_project_id);
  RAISE NOTICE '===========================================';

END $$;

-- Show results
SELECT
  '=== NEW COMPANY CREATED ===' as section,
  name as "Company Name",
  code as "Company Code",
  id as "Company ID",
  created_at as "Created"
FROM companies
WHERE code = '[COMPANY_CODE]'; -- CHANGE THIS to match your company code

SELECT
  '=== PROJECT CREATED ===' as section,
  p.name as "Project Name",
  p.pin as "PIN (foreman access)",
  p.contract_value as "Contract Value",
  p.status as "Status",
  (SELECT COUNT(*) FROM areas WHERE project_id = p.id) as "# of Areas"
FROM projects p
JOIN companies c ON p.company_id = c.id
WHERE c.code = '[COMPANY_CODE]'; -- CHANGE THIS to match your company code

-- ========================================
-- NEXT STEPS (Optional)
-- ========================================
--
-- 1. CREATE OFFICE USER (if needed):
--    - Go to Supabase: Authentication > Users
--    - Click "Add User" (email)
--    - Enter company admin email and password
--    - Copy the user ID
--    - Run:
--      INSERT INTO users (id, email, name, role, company_id)
--      VALUES ('user-id-here', 'admin@company.com', 'Admin Name', 'office', 'company-id-here');
--
-- 2. ADD MORE PROJECTS:
--    - Copy the "STEP 2: CREATE FIRST PROJECT" section
--    - Change project details and PIN
--    - Run it
--
-- 3. CUSTOMIZE AREAS:
--    - Edit the areas list to match your project scope
--    - Adjust weights to total 100%
--
-- ========================================
