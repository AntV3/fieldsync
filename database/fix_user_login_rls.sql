-- Complete fix for user login and RLS issues
-- This script will fix all RLS policies to allow proper login and user management
-- Run this entire script in Supabase SQL Editor

-- ============================================
-- STEP 1: Verify your user data exists
-- ============================================

-- Check if user exists (you should see your record)
SELECT
  id,
  email,
  name,
  role,
  company_id,
  created_at
FROM users
WHERE email = 'anthony@millerenvironmental.com';

-- If you see your user above, continue to Step 2
-- If NOT, we need to create the user record first (stop and let me know)

-- ============================================
-- STEP 2: Fix RLS policies on USERS table
-- ============================================

-- Drop all existing policies on users table
DROP POLICY IF EXISTS "Users can read own record" ON users;
DROP POLICY IF EXISTS "Users can read company users" ON users;
DROP POLICY IF EXISTS "Admins can update company users" ON users;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON users;
DROP POLICY IF EXISTS "Users can view own data" ON users;

-- Policy 1: Users MUST be able to read their own record (critical for login)
CREATE POLICY "Users can read own record" ON users
  FOR SELECT
  USING (id = auth.uid());

-- Policy 2: Users can read other users in the same company (for user management)
CREATE POLICY "Users can read company users" ON users
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

-- Policy 3: Admins can update users in their company
CREATE POLICY "Admins can update company users" ON users
  FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- STEP 3: Fix RLS policies on COMPANIES table
-- ============================================

-- Drop existing policies on companies
DROP POLICY IF EXISTS "Users can view their company" ON companies;
DROP POLICY IF EXISTS "Enable read access for company members" ON companies;

-- Allow users to read their own company
CREATE POLICY "Users can view their company" ON companies
  FOR SELECT
  USING (
    id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

-- ============================================
-- STEP 4: Verify user role is admin
-- ============================================

-- Check current role
SELECT id, email, name, role FROM users WHERE email = 'anthony@millerenvironmental.com';

-- Update to admin if not already
UPDATE users
SET role = 'admin'
WHERE email = 'anthony@millerenvironmental.com'
AND role != 'admin';

-- ============================================
-- STEP 5: Verify the fix worked
-- ============================================

-- This should return your user record if policies are working
SELECT id, email, name, role, company_id
FROM users
WHERE id = auth.uid();

-- This should return your company if policies are working
SELECT c.id, c.name, c.field_code
FROM companies c
JOIN users u ON u.company_id = c.id
WHERE u.id = auth.uid();

-- ============================================
-- DONE!
-- ============================================
-- After running this script:
-- 1. You should see your user and company data above
-- 2. Refresh your browser (Ctrl+Shift+R)
-- 3. Login should work without 500 errors
-- 4. You should see Company, Branding, and Users tabs
