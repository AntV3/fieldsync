-- ============================================
-- COMPANY INVITES MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================
-- This migration adds:
-- 1. company_invites table for token-based team invitations
-- 2. RPC function for accepting invites atomically
-- 3. RLS policies for invite management
-- ============================================

-- ============================================
-- PHASE 1: CREATE COMPANY_INVITES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS company_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'field' CHECK (role IN ('field', 'office', 'admin')),
  access_level TEXT DEFAULT 'field' CHECK (access_level IN ('field', 'office', 'administrator')),
  token TEXT UNIQUE NOT NULL,
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PHASE 2: CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_company_invites_token ON company_invites(token);
CREATE INDEX IF NOT EXISTS idx_company_invites_email ON company_invites(email);
CREATE INDEX IF NOT EXISTS idx_company_invites_company ON company_invites(company_id);
CREATE INDEX IF NOT EXISTS idx_company_invites_expires ON company_invites(expires_at);

-- ============================================
-- PHASE 3: CREATE RPC FUNCTIONS
-- ============================================

-- Drop existing function if exists
DROP FUNCTION IF EXISTS accept_invite_token(TEXT, UUID);

-- 3A. accept_invite_token - Atomically accepts an invite and creates membership
CREATE OR REPLACE FUNCTION accept_invite_token(
  invite_token TEXT,
  accepting_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record company_invites%ROWTYPE;
  membership_id UUID;
  result JSON;
BEGIN
  -- Find the invite
  SELECT * INTO invite_record
  FROM company_invites
  WHERE token = invite_token
  AND accepted_at IS NULL
  AND expires_at > NOW();

  IF invite_record.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired invite token');
  END IF;

  -- Check if user already has membership in this company
  IF EXISTS (
    SELECT 1 FROM user_companies
    WHERE user_id = accepting_user_id
    AND company_id = invite_record.company_id
    AND status = 'active'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Already a member of this company');
  END IF;

  -- Remove any existing pending/removed membership for this user+company
  DELETE FROM user_companies
  WHERE user_id = accepting_user_id
  AND company_id = invite_record.company_id
  AND status IN ('pending', 'removed');

  -- Create the membership
  INSERT INTO user_companies (
    user_id,
    company_id,
    status,
    access_level,
    company_role,
    approved_at,
    approved_by
  ) VALUES (
    accepting_user_id,
    invite_record.company_id,
    'active',
    invite_record.access_level,
    invite_record.role,
    NOW(),
    invite_record.invited_by
  )
  RETURNING id INTO membership_id;

  -- Mark invite as accepted
  UPDATE company_invites
  SET accepted_at = NOW(),
      accepted_by = accepting_user_id
  WHERE id = invite_record.id;

  RETURN json_build_object(
    'success', true,
    'membership_id', membership_id,
    'company_id', invite_record.company_id
  );
END;
$$;

-- 3B. get_invite_by_token - Get invite details for display (public info only)
CREATE OR REPLACE FUNCTION get_invite_by_token(invite_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record RECORD;
BEGIN
  SELECT
    ci.id,
    ci.email,
    ci.role,
    ci.access_level,
    ci.expires_at,
    ci.accepted_at,
    c.name as company_name,
    c.id as company_id
  INTO invite_record
  FROM company_invites ci
  JOIN companies c ON c.id = ci.company_id
  WHERE ci.token = invite_token;

  IF invite_record.id IS NULL THEN
    RETURN json_build_object('valid', false, 'error', 'Invite not found');
  END IF;

  IF invite_record.accepted_at IS NOT NULL THEN
    RETURN json_build_object('valid', false, 'error', 'Invite already used');
  END IF;

  IF invite_record.expires_at < NOW() THEN
    RETURN json_build_object('valid', false, 'error', 'Invite expired');
  END IF;

  RETURN json_build_object(
    'valid', true,
    'email', invite_record.email,
    'role', invite_record.role,
    'access_level', invite_record.access_level,
    'company_name', invite_record.company_name,
    'company_id', invite_record.company_id,
    'expires_at', invite_record.expires_at
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION accept_invite_token(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_invite_by_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_invite_by_token(TEXT) TO authenticated;

-- ============================================
-- PHASE 4: ENABLE RLS
-- ============================================

ALTER TABLE company_invites ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PHASE 5: RLS POLICIES
-- ============================================

-- Drop existing policies first
DROP POLICY IF EXISTS "Admins view company invites" ON company_invites;
DROP POLICY IF EXISTS "Admins create company invites" ON company_invites;
DROP POLICY IF EXISTS "Admins delete company invites" ON company_invites;

-- Active admins/owners can view invites for their company
CREATE POLICY "Admins view company invites"
ON company_invites FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = company_invites.company_id
    AND uc.status = 'active'
    AND uc.access_level IN ('administrator', 'office')
  )
);

-- Active admins/owners can create invites for their company
CREATE POLICY "Admins create company invites"
ON company_invites FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = company_invites.company_id
    AND uc.status = 'active'
    AND uc.access_level IN ('administrator', 'office')
  )
);

-- Active admins/owners can delete (revoke) invites
CREATE POLICY "Admins delete company invites"
ON company_invites FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = company_invites.company_id
    AND uc.status = 'active'
    AND uc.access_level IN ('administrator', 'office')
  )
);

-- ============================================
-- PHASE 6: GRANT PERMISSIONS
-- ============================================

GRANT SELECT, INSERT, DELETE ON company_invites TO authenticated;

-- ============================================
-- PHASE 7: ADD INDUSTRY AND TIMEZONE TO COMPANIES
-- ============================================

-- Add industry column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'industry'
  ) THEN
    ALTER TABLE companies ADD COLUMN industry TEXT;
  END IF;
END $$;

-- Add timezone column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'timezone'
  ) THEN
    ALTER TABLE companies ADD COLUMN timezone TEXT DEFAULT 'America/Los_Angeles';
  END IF;
END $$;

-- ============================================
-- PHASE 8: ALLOW COMPANY CREATION
-- ============================================

-- Allow authenticated users to create companies (for onboarding)
DROP POLICY IF EXISTS "Users create companies" ON companies;

CREATE POLICY "Users create companies"
ON companies FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Grant insert permission on companies
GRANT INSERT ON companies TO authenticated;

-- ============================================
-- PHASE 9: DOCUMENTATION
-- ============================================

COMMENT ON TABLE company_invites IS 'Token-based invitations for team members to join a company';
COMMENT ON COLUMN company_invites.token IS 'Unique invite token for URL (e.g., /join/{token})';
COMMENT ON COLUMN company_invites.role IS 'Role to assign upon acceptance: field, office, admin';
COMMENT ON COLUMN company_invites.access_level IS 'Access level to assign: field, office, administrator';
COMMENT ON COLUMN company_invites.expires_at IS 'Invite expiration timestamp (default 7 days)';
COMMENT ON FUNCTION accept_invite_token IS 'Atomically accepts an invite and creates active membership';
COMMENT ON FUNCTION get_invite_by_token IS 'Gets invite details for display (public info, no auth required)';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
