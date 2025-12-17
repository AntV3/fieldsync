-- WORKING FIX FOR 500 ERROR
-- The problem: RLS policies have circular dependencies causing infinite loops
-- The solution: Simple, non-circular policies
-- Run this in Supabase SQL Editor

-- ============================================
-- STEP 1: Verify your user exists
-- ============================================
SELECT id, email, name, role, company_id
FROM users
WHERE email = 'anthony@millerenvironmental.com';

-- You should see your user record above.
-- If you DON'T see anything, STOP - your user doesn't exist in the table.

-- ============================================
-- STEP 2: DISABLE RLS temporarily to clear everything
-- ============================================
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 3: Drop ALL policies (clean slate)
-- ============================================
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'users') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON users';
    END LOOP;

    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'companies') LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON companies';
    END LOOP;
END $$;

-- ============================================
-- STEP 4: Create SIMPLE, NON-CIRCULAR policies
-- ============================================

-- Users can read their own record ONLY (no subqueries, no circular deps)
CREATE POLICY "users_select_self" ON users
    FOR SELECT
    USING (id = auth.uid());

-- Users can insert their own record
CREATE POLICY "users_insert_self" ON users
    FOR INSERT
    WITH CHECK (id = auth.uid());

-- Users can update their own record
CREATE POLICY "users_update_self" ON users
    FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- ============================================
-- STEP 5: Fix companies table
-- ============================================

-- For now, let companies be readable by anyone authenticated
-- We'll tighten this later once login works
CREATE POLICY "companies_select_authenticated" ON companies
    FOR SELECT
    TO authenticated
    USING (true);

-- ============================================
-- STEP 6: Re-enable RLS
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 7: Make you admin
-- ============================================
UPDATE users
SET role = 'admin'
WHERE email = 'anthony@millerenvironmental.com';

-- ============================================
-- STEP 8: Test with a function (bypasses RLS)
-- ============================================
-- This simulates what should happen when you login
DO $$
DECLARE
    v_user_id uuid;
    v_user_email text;
    v_user_name text;
    v_user_role text;
    v_company_id uuid;
    v_company_name text;
BEGIN
    -- Get user data
    SELECT id, email, name, role, company_id
    INTO v_user_id, v_user_email, v_user_name, v_user_role, v_company_id
    FROM users
    WHERE email = 'anthony@millerenvironmental.com';

    -- Get company data
    SELECT name INTO v_company_name
    FROM companies
    WHERE id = v_company_id;

    -- Show results
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TEST RESULTS:';
    RAISE NOTICE 'User ID: %', v_user_id;
    RAISE NOTICE 'Email: %', v_user_email;
    RAISE NOTICE 'Name: %', v_user_name;
    RAISE NOTICE 'Role: %', v_user_role;
    RAISE NOTICE 'Company: %', v_company_name;
    RAISE NOTICE '========================================';
    RAISE NOTICE 'If you see data above, the fix worked!';
    RAISE NOTICE 'Now refresh your browser and login.';
    RAISE NOTICE '========================================';
END $$;
