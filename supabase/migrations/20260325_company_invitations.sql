-- Migration: Company Invitations
-- Allows admins to generate invite links for new users to join their company
-- Invited users are auto-approved (no pending state)

-- ============================================
-- Table: company_invitations
-- ============================================
CREATE TABLE IF NOT EXISTS company_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invite_token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,

  -- Pre-assigned role/access for the invitee
  invited_role TEXT DEFAULT 'member',
  invited_access_level TEXT DEFAULT 'member',
  invited_company_role TEXT,

  -- Optional: restrict to a specific email
  invited_email TEXT,

  -- Status tracking
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'accepted', 'revoked')),

  -- Usage limits
  max_uses INTEGER DEFAULT 1,
  use_count INTEGER DEFAULT 0,

  -- Expiration
  expires_at TIMESTAMPTZ NOT NULL,

  -- Acceptance tracking
  accepted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_company_invitations_token ON company_invitations(invite_token);
CREATE INDEX IF NOT EXISTS idx_company_invitations_company ON company_invitations(company_id);
CREATE INDEX IF NOT EXISTS idx_company_invitations_status ON company_invitations(status);

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE company_invitations ENABLE ROW LEVEL SECURITY;

-- Admins can view all invitations for their company
CREATE POLICY "Admins view company invitations"
ON company_invitations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = company_invitations.company_id
    AND uc.status = 'active'
    AND uc.access_level = 'administrator'
  )
);

-- Anyone can look up an active invitation by token (needed for accept flow)
CREATE POLICY "Public lookup active invitation by token"
ON company_invitations FOR SELECT
USING (
  status = 'active'
  AND (expires_at IS NULL OR expires_at > NOW())
  AND (max_uses IS NULL OR use_count < max_uses)
);

-- Admins can create invitations for their company
CREATE POLICY "Admins create invitations"
ON company_invitations FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = company_invitations.company_id
    AND uc.status = 'active'
    AND uc.access_level = 'administrator'
  )
);

-- Admins can update invitations (revoke)
CREATE POLICY "Admins update invitations"
ON company_invitations FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = company_invitations.company_id
    AND uc.status = 'active'
    AND uc.access_level = 'administrator'
  )
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON company_invitations TO authenticated;
GRANT SELECT ON company_invitations TO anon;

-- ============================================
-- RPC: accept_invitation
-- ============================================
CREATE OR REPLACE FUNCTION accept_invitation(
  p_invite_token TEXT,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation RECORD;
  v_existing RECORD;
BEGIN
  -- Look up and validate invitation
  SELECT * INTO v_invitation
  FROM company_invitations
  WHERE invite_token = p_invite_token
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (max_uses IS NULL OR use_count < max_uses);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;

  -- If invitation targets a specific email, validate it
  IF v_invitation.invited_email IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM users WHERE id = p_user_id AND LOWER(email) = LOWER(v_invitation.invited_email)
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'This invitation is for a different email address');
    END IF;
  END IF;

  -- Check if user already has a membership for this company
  SELECT * INTO v_existing
  FROM user_companies
  WHERE user_id = p_user_id AND company_id = v_invitation.company_id;

  IF FOUND THEN
    IF v_existing.status = 'active' THEN
      RETURN jsonb_build_object('success', false, 'error', 'You are already a member of this company');
    ELSIF v_existing.status = 'pending' THEN
      -- Auto-approve the pending membership
      UPDATE user_companies SET
        status = 'active',
        role = v_invitation.invited_role,
        access_level = v_invitation.invited_access_level,
        company_role = v_invitation.invited_company_role,
        approved_at = NOW(),
        approved_by = v_invitation.created_by
      WHERE id = v_existing.id;
    ELSIF v_existing.status = 'removed' THEN
      -- Reactivate removed membership
      UPDATE user_companies SET
        status = 'active',
        role = v_invitation.invited_role,
        access_level = v_invitation.invited_access_level,
        company_role = v_invitation.invited_company_role,
        approved_at = NOW(),
        approved_by = v_invitation.created_by,
        removed_at = NULL,
        removed_by = NULL
      WHERE id = v_existing.id;
    END IF;
  ELSE
    -- Create new auto-approved membership
    INSERT INTO user_companies (
      user_id, company_id, role, access_level, company_role,
      status, approved_at, approved_by
    ) VALUES (
      p_user_id, v_invitation.company_id, v_invitation.invited_role,
      v_invitation.invited_access_level, v_invitation.invited_company_role,
      'active', NOW(), v_invitation.created_by
    );
  END IF;

  -- Update invitation usage
  UPDATE company_invitations SET
    use_count = use_count + 1,
    accepted_by = p_user_id,
    accepted_at = NOW(),
    status = CASE
      WHEN max_uses IS NOT NULL AND use_count + 1 >= max_uses THEN 'accepted'
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = v_invitation.id;

  RETURN jsonb_build_object(
    'success', true,
    'company_id', v_invitation.company_id,
    'company_role', v_invitation.invited_company_role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION accept_invitation(TEXT, UUID) TO authenticated;
