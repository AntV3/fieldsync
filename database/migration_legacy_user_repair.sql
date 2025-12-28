-- ============================================
-- LEGACY USER REPAIR MIGRATION
-- Fixes users created before membership system
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- PHASE 1: IDENTIFY LEGACY USERS
-- ============================================
-- Legacy users have:
-- - A record in `users` table with `company_id` set
-- - NO corresponding record in `user_companies` table

-- First, let's see how many legacy users we have (diagnostic query)
-- SELECT
--   u.id,
--   u.email,
--   u.name,
--   u.company_id,
--   u.role
-- FROM users u
-- LEFT JOIN user_companies uc ON uc.user_id = u.id
-- WHERE u.company_id IS NOT NULL
-- AND uc.id IS NULL;

-- ============================================
-- PHASE 2: CREATE MEMBERSHIP RECORDS FOR LEGACY USERS
-- ============================================

-- Insert user_companies records for all legacy users
-- Status = 'active' (they were already using the system)
-- Role = inherited from users.role, defaulting to 'member'
INSERT INTO user_companies (
  id,
  user_id,
  company_id,
  role,
  status,
  created_at,
  approved_at,
  approved_by
)
SELECT
  gen_random_uuid(),
  u.id,
  u.company_id,
  COALESCE(
    CASE
      WHEN u.role IN ('admin', 'owner', 'office', 'foreman', 'member') THEN u.role
      ELSE 'member'
    END,
    'member'
  ),
  'active',
  COALESCE(u.created_at, NOW()),
  NOW(),  -- Mark as approved now (retroactively)
  NULL    -- No approver (system migration)
FROM users u
LEFT JOIN user_companies uc ON uc.user_id = u.id AND uc.company_id = u.company_id
WHERE u.company_id IS NOT NULL
AND uc.id IS NULL
ON CONFLICT (user_id, company_id) DO NOTHING;

-- ============================================
-- PHASE 3: HANDLE COMPANY OWNERS
-- ============================================

-- Ensure company owners have 'owner' role in user_companies
UPDATE user_companies uc
SET role = 'owner'
FROM companies c
WHERE c.owner_user_id = uc.user_id
AND c.id = uc.company_id
AND uc.role != 'owner';

-- ============================================
-- PHASE 4: VERIFY MIGRATION
-- ============================================

-- After running, verify no legacy users remain:
-- SELECT COUNT(*) as remaining_legacy_users
-- FROM users u
-- LEFT JOIN user_companies uc ON uc.user_id = u.id
-- WHERE u.company_id IS NOT NULL
-- AND uc.id IS NULL;

-- Should return 0

-- ============================================
-- PHASE 5: RPC FUNCTION FOR RUNTIME LEGACY REPAIR
-- ============================================

-- Create RPC function that can be called from JavaScript
-- Uses SECURITY DEFINER to bypass RLS for legacy user repair
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
BEGIN
  -- Verify this is actually a legacy user scenario
  -- User must own this request (auth.uid() = p_user_id)
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

  -- Check if membership already exists
  SELECT id, status INTO existing_id, existing_status
  FROM user_companies
  WHERE user_id = p_user_id
  AND company_id = p_company_id;

  IF existing_id IS NOT NULL THEN
    -- Membership exists
    IF existing_status != 'active' THEN
      -- Reactivate if not active
      UPDATE user_companies
      SET status = 'active',
          approved_at = NOW()
      WHERE id = existing_id;
    END IF;
    RETURN TRUE;
  END IF;

  -- Create new active membership for legacy user
  INSERT INTO user_companies (
    id,
    user_id,
    company_id,
    role,
    status,
    created_at,
    approved_at
  ) VALUES (
    gen_random_uuid(),
    p_user_id,
    p_company_id,
    CASE
      WHEN p_role IN ('admin', 'owner', 'office', 'foreman', 'member') THEN p_role
      ELSE 'member'
    END,
    'active',
    NOW(),
    NOW()
  );

  RETURN TRUE;
EXCEPTION
  WHEN unique_violation THEN
    -- Already exists, that's fine
    RETURN TRUE;
  WHEN OTHERS THEN
    RAISE;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION repair_legacy_user(UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION repair_legacy_user IS
'Repairs legacy user accounts by creating missing user_companies record. Only works for users with matching company_id in their user record.';

-- ============================================
-- PHASE 6: ADD TRIGGER FOR FUTURE SAFETY
-- ============================================

-- Create trigger to auto-create membership when users.company_id is set
-- This handles any code paths that might still set company_id directly

CREATE OR REPLACE FUNCTION ensure_user_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If company_id is being set and no membership exists, create one
  IF NEW.company_id IS NOT NULL THEN
    INSERT INTO user_companies (
      id,
      user_id,
      company_id,
      role,
      status,
      created_at,
      approved_at
    )
    VALUES (
      gen_random_uuid(),
      NEW.id,
      NEW.company_id,
      COALESCE(NEW.role, 'member'),
      'active',
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id, company_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS ensure_user_membership_trigger ON users;

-- Create trigger on users table
CREATE TRIGGER ensure_user_membership_trigger
AFTER INSERT OR UPDATE OF company_id ON users
FOR EACH ROW
EXECUTE FUNCTION ensure_user_membership();

-- ============================================
-- PHASE 6: DOCUMENTATION
-- ============================================

COMMENT ON FUNCTION ensure_user_membership() IS
'Auto-creates user_companies record when users.company_id is set. Ensures backwards compatibility with legacy code paths.';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- Summary:
-- 1. Created user_companies records for all legacy users
-- 2. Set status = 'active' for immediate access
-- 3. Preserved existing role from users table
-- 4. Ensured company owners have 'owner' role
-- 5. Added trigger for future safety
-- ============================================
