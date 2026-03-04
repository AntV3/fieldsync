-- ============================================
-- AUTH FLOW FIXES MIGRATION
-- Fixes issues found in login/signup/join audit
-- Run this in Supabase SQL Editor
-- ============================================
-- Issues addressed:
-- 1. approve_membership_with_role doesn't set access_level column
-- 2. No register_company RPC for atomic company registration
-- 3. Missing INSERT policy on companies for registration
-- 4. access_level and role columns can get out of sync
-- ============================================

-- ============================================
-- PHASE 1: FIX approve_membership_with_role
-- Now sets BOTH role and access_level columns
-- ============================================

DROP FUNCTION IF EXISTS approve_membership_with_role(UUID, UUID, TEXT);

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
  computed_access_level TEXT;
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

  -- Also allow company owner to approve
  IF approver_status IS NULL OR approver_status != 'active' THEN
    -- Check if they're the company owner
    IF NOT EXISTS (
      SELECT 1 FROM companies
      WHERE id = target_company_id
      AND owner_user_id = approved_by_user
    ) THEN
      RAISE EXCEPTION 'Unauthorized: Only active admins can approve memberships';
    END IF;
  ELSIF approver_role NOT IN ('admin', 'owner') THEN
    -- Not an admin/owner and not the company owner
    IF NOT EXISTS (
      SELECT 1 FROM companies
      WHERE id = target_company_id
      AND owner_user_id = approved_by_user
    ) THEN
      RAISE EXCEPTION 'Unauthorized: Only active admins can approve memberships';
    END IF;
  END IF;

  -- Validate role value
  IF new_role NOT IN ('member', 'admin', 'owner', 'foreman', 'office') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;

  -- Map role to access_level for frontend consistency
  computed_access_level := CASE
    WHEN new_role IN ('admin', 'owner') THEN 'administrator'
    ELSE 'member'
  END;

  -- Update the membership with both role and access_level
  UPDATE user_companies
  SET
    status = 'active',
    role = new_role,
    access_level = computed_access_level,
    approved_at = NOW(),
    approved_by = approved_by_user
  WHERE id = membership_id
  AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership not found or already processed';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_membership_with_role(UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION approve_membership_with_role IS
'Approves a pending membership with role and access_level assignment. Sets both columns to keep RLS policies and frontend in sync.';

-- ============================================
-- PHASE 2: CREATE register_company RPC
-- Atomic company registration in single transaction
-- ============================================

CREATE OR REPLACE FUNCTION register_company(
  p_user_id UUID,
  p_user_email TEXT,
  p_user_name TEXT,
  p_company_name TEXT,
  p_company_code TEXT,
  p_office_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_company_id UUID;
BEGIN
  -- Verify the caller is the user being registered
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: Can only register own account';
  END IF;

  -- Verify user doesn't already own a company
  IF EXISTS (
    SELECT 1 FROM companies WHERE owner_user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'User already owns a company';
  END IF;

  -- Create company
  INSERT INTO companies (id, name, code, office_code, subscription_tier, owner_user_id)
  VALUES (gen_random_uuid(), p_company_name, p_company_code, p_office_code, 'free', p_user_id)
  RETURNING id INTO new_company_id;

  -- Create or update user record
  INSERT INTO users (id, email, name, company_id, role, is_active)
  VALUES (p_user_id, p_user_email, p_user_name, new_company_id, 'admin', true)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    company_id = EXCLUDED.company_id,
    role = EXCLUDED.role,
    is_active = true;

  -- Create user_companies membership (active admin)
  -- ON CONFLICT handles the case where the ensure_user_membership trigger
  -- already created a record from the users INSERT above
  INSERT INTO user_companies (id, user_id, company_id, role, access_level, status, created_at, approved_at)
  VALUES (gen_random_uuid(), p_user_id, new_company_id, 'admin', 'administrator', 'active', NOW(), NOW())
  ON CONFLICT (user_id, company_id) DO UPDATE SET
    role = 'admin',
    access_level = 'administrator',
    status = 'active',
    approved_at = NOW();

  RETURN TRUE;
EXCEPTION
  WHEN unique_violation THEN
    -- Company code collision — caller should retry with a different code
    RAISE EXCEPTION 'Company code already in use. Please try again.';
END;
$$;

GRANT EXECUTE ON FUNCTION register_company(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION register_company IS
'Atomically creates a company, user record, and active admin membership in a single transaction. Bypasses RLS to allow the first user of a new company to be created as active admin.';

-- ============================================
-- PHASE 3: ADD INSERT POLICY FOR COMPANIES
-- Allows authenticated users to create companies
-- ============================================

DROP POLICY IF EXISTS "Authenticated users create companies" ON companies;

CREATE POLICY "Authenticated users create companies"
ON companies FOR INSERT
WITH CHECK (
  -- Only allow creating a company where the caller is the owner
  owner_user_id = auth.uid()
);

-- ============================================
-- PHASE 4: FIX repair_legacy_user TO SET access_level
-- ============================================

CREATE OR REPLACE FUNCTION repair_legacy_user(
  p_user_id UUID,
  p_company_id UUID,
  p_role TEXT DEFAULT 'member'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_id UUID;
  existing_status TEXT;
  user_company_id UUID;
  computed_access_level TEXT;
BEGIN
  -- Verify this is actually a legacy user scenario
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: Can only repair own account';
  END IF;

  -- Check if user actually has this company_id set
  SELECT company_id INTO user_company_id
  FROM users
  WHERE id = p_user_id;

  IF user_company_id IS NULL OR user_company_id != p_company_id THEN
    RAISE EXCEPTION 'Invalid: company_id does not match user record';
  END IF;

  -- Map role to access_level
  computed_access_level := CASE
    WHEN p_role IN ('admin', 'owner') THEN 'administrator'
    ELSE 'member'
  END;

  -- Check if membership already exists
  SELECT id, status INTO existing_id, existing_status
  FROM user_companies
  WHERE user_id = p_user_id
  AND company_id = p_company_id;

  IF existing_id IS NOT NULL THEN
    -- Membership exists — reactivate and fix access_level if needed
    IF existing_status != 'active' THEN
      UPDATE user_companies
      SET status = 'active',
          access_level = computed_access_level,
          approved_at = NOW()
      WHERE id = existing_id;
    ELSIF (SELECT access_level FROM user_companies WHERE id = existing_id) IS NULL THEN
      -- Fix missing access_level
      UPDATE user_companies
      SET access_level = computed_access_level
      WHERE id = existing_id;
    END IF;
    RETURN TRUE;
  END IF;

  -- Create new active membership for legacy user
  INSERT INTO user_companies (
    id, user_id, company_id, role, access_level, status, created_at, approved_at
  ) VALUES (
    gen_random_uuid(),
    p_user_id,
    p_company_id,
    CASE
      WHEN p_role IN ('admin', 'owner', 'office', 'foreman', 'member') THEN p_role
      ELSE 'member'
    END,
    computed_access_level,
    'active',
    NOW(),
    NOW()
  );

  RETURN TRUE;
EXCEPTION
  WHEN unique_violation THEN
    RETURN TRUE;
  WHEN OTHERS THEN
    RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION repair_legacy_user(UUID, UUID, TEXT) TO authenticated;

-- ============================================
-- PHASE 5: FIX ensure_user_membership TRIGGER
-- Now also sets access_level based on role
-- ============================================

CREATE OR REPLACE FUNCTION ensure_user_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NOT NULL THEN
    INSERT INTO user_companies (
      id, user_id, company_id, role, access_level, status, created_at, approved_at
    )
    VALUES (
      gen_random_uuid(),
      NEW.id,
      NEW.company_id,
      COALESCE(NEW.role, 'member'),
      CASE
        WHEN NEW.role IN ('admin', 'owner') THEN 'administrator'
        ELSE 'member'
      END,
      'active',
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id, company_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- Summary:
-- 1. Fixed approve_membership_with_role to set both role and access_level
-- 2. Added register_company RPC for atomic company registration
-- 3. Added INSERT policy on companies for registration
-- 4. Fixed repair_legacy_user to set access_level
-- 5. Fixed ensure_user_membership trigger to set access_level
-- ============================================
