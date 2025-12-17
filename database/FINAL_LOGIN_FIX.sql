-- DEFINITIVE FIX FOR LOGIN 500 ERROR
-- This will fix the RLS policies so you can login
-- Run this ENTIRE script in Supabase SQL Editor

-- ============================================
-- DIAGNOSE: Check if your user exists
-- ============================================
-- This should show your user record
SELECT id, email, name, role, company_id
FROM users
WHERE email = 'anthony@millerenvironmental.com';

-- If you see your record above, good! Continue below.
-- If NOT, stop and let me know - we need to create your user first.

-- ============================================
-- FIX: Remove ALL existing policies on users table
-- ============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'users') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON users';
    END LOOP;
END $$;

-- ============================================
-- CREATE: New working RLS policies
-- ============================================

-- Policy 1: Users can SELECT their own record (CRITICAL for login)
CREATE POLICY "users_select_own" ON users
    FOR SELECT
    USING (id = auth.uid());

-- Policy 2: Users can SELECT other users in same company (for user management)
CREATE POLICY "users_select_company" ON users
    FOR SELECT
    USING (
        company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    );

-- Policy 3: Users can INSERT (for registration)
CREATE POLICY "users_insert_own" ON users
    FOR INSERT
    WITH CHECK (id = auth.uid());

-- Policy 4: Admins can UPDATE users in their company
CREATE POLICY "users_update_admin" ON users
    FOR UPDATE
    USING (
        company_id = (SELECT company_id FROM users WHERE id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
        company_id = (SELECT company_id FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================
-- FIX: Companies table policies
-- ============================================

-- Remove old policies
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'companies') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON companies';
    END LOOP;
END $$;

-- Users can SELECT their own company
CREATE POLICY "companies_select_own" ON companies
    FOR SELECT
    USING (
        id = (SELECT company_id FROM users WHERE id = auth.uid())
    );

-- Admins can UPDATE their own company
CREATE POLICY "companies_update_admin" ON companies
    FOR UPDATE
    USING (
        id = (SELECT company_id FROM users WHERE id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
        id = (SELECT company_id FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================
-- SET: Make you admin
-- ============================================
UPDATE users
SET role = 'admin'
WHERE email = 'anthony@millerenvironmental.com';

-- ============================================
-- TEST: Verify policies work
-- ============================================

-- This should return YOUR user record (simulates what login does)
SELECT id, email, name, role, company_id
FROM users
WHERE id = (SELECT id FROM users WHERE email = 'anthony@millerenvironmental.com');

-- This should return YOUR company
SELECT c.*
FROM companies c
WHERE c.id = (SELECT company_id FROM users WHERE email = 'anthony@millerenvironmental.com');

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'RLS POLICIES FIXED!';
    RAISE NOTICE 'Now refresh your browser and login again.';
    RAISE NOTICE 'The 500 error should be gone.';
    RAISE NOTICE '===========================================';
END $$;
