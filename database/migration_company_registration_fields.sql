-- ============================================
-- COMPANY REGISTRATION FIELDS MIGRATION
-- Adds phone and trade columns to companies table
-- and updates register_company RPC to accept them
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- PHASE 1: ADD NEW COLUMNS TO COMPANIES TABLE
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'phone'
  ) THEN
    ALTER TABLE companies ADD COLUMN phone TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'trade'
  ) THEN
    ALTER TABLE companies ADD COLUMN trade TEXT;
  END IF;
END $$;

-- ============================================
-- PHASE 2: UPDATE register_company RPC
-- Now accepts phone and trade parameters
-- ============================================

DROP FUNCTION IF EXISTS register_company(UUID, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS register_company(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION register_company(
  p_user_id UUID,
  p_user_email TEXT,
  p_user_name TEXT,
  p_company_name TEXT,
  p_company_code TEXT,
  p_office_code TEXT,
  p_phone TEXT DEFAULT NULL,
  p_trade TEXT DEFAULT NULL
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
  INSERT INTO companies (id, name, code, office_code, phone, trade, subscription_tier, owner_user_id)
  VALUES (gen_random_uuid(), p_company_name, p_company_code, p_office_code, p_phone, p_trade, 'free', p_user_id)
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
    RAISE EXCEPTION 'Company code already in use. Please try again.';
END;
$$;

GRANT EXECUTE ON FUNCTION register_company(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION register_company IS
'Atomically creates a company with phone and trade info, user record, and active admin membership in a single transaction.';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
