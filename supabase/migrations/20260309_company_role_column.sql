-- ============================================
-- ADD COMPANY_ROLE COLUMN TO USER_COMPANIES
-- Run this in Supabase SQL Editor
-- ============================================
-- This migration adds the company_role column which stores the
-- user's job title within the company (e.g., Project Manager,
-- Superintendent, etc.). This is separate from access_level
-- which controls security permissions.
-- ============================================

-- Add company_role column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_companies' AND column_name = 'company_role'
  ) THEN
    ALTER TABLE user_companies ADD COLUMN company_role TEXT;
  END IF;
END $$;

-- Add comment
COMMENT ON COLUMN user_companies.company_role IS 'Job title within the company: Project Manager, Superintendent, Job Costing, Accounting, etc.';

-- ============================================
-- UPDATE approve_membership_with_role FUNCTION
-- Ensure it uses new_access_level parameter and sets access_level
-- (Idempotent - safe to run if already up to date)
-- ============================================

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
  approver_role TEXT;
BEGIN
  -- Get the company_id from the membership being approved
  SELECT company_id INTO target_company_id
  FROM user_companies
  WHERE id = membership_id;

  IF target_company_id IS NULL THEN
    RAISE EXCEPTION 'Membership not found';
  END IF;

  -- Verify the approver is an active administrator of this company
  -- Check both access_level (new) and role (legacy) for compatibility
  SELECT uc.status, uc.access_level, uc.role
  INTO approver_status, approver_access, approver_role
  FROM user_companies uc
  WHERE uc.user_id = approved_by_user
  AND uc.company_id = target_company_id;

  IF approver_status != 'active' OR (
    approver_access != 'administrator' AND approver_role NOT IN ('admin', 'owner')
  ) THEN
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

-- Ensure execute permission is granted
GRANT EXECUTE ON FUNCTION approve_membership_with_role(UUID, UUID, TEXT) TO authenticated;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
