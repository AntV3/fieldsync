-- Multi-Tenant Enhancements for FieldSync
-- Adds user invitations, company settings, and subscription tracking
-- Run this in your Supabase SQL Editor

-- ================================================
-- ENHANCE COMPANIES TABLE
-- ================================================

-- Add subscription and settings fields to companies
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial'
  CHECK (subscription_status IN ('trial', 'active', 'past_due', 'canceled', 'inactive')),
ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'starter'
  CHECK (subscription_plan IN ('trial', 'starter', 'professional', 'enterprise')),
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '14 days'),
ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS max_projects INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#4299e1',
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create index for active companies
CREATE INDEX IF NOT EXISTS idx_companies_active ON companies(is_active);
CREATE INDEX IF NOT EXISTS idx_companies_subscription ON companies(subscription_status);

-- ================================================
-- USER INVITATIONS TABLE
-- ================================================

CREATE TABLE IF NOT EXISTS user_invitations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'office', 'foreman', 'field')),

  -- Invitation details
  invited_by_id UUID REFERENCES users(id),
  invited_by_name TEXT,
  token TEXT UNIQUE NOT NULL, -- Random token for invitation link
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),

  -- Projects they'll be assigned to (optional)
  project_ids UUID[] DEFAULT ARRAY[]::UUID[],

  -- Timestamps
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  message TEXT,

  UNIQUE(company_id, email, status) -- Prevent duplicate pending invitations
);

CREATE INDEX IF NOT EXISTS idx_invitations_company ON user_invitations(company_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON user_invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON user_invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON user_invitations(status);

-- ================================================
-- ACTIVITY LOG ENHANCEMENTS
-- ================================================

-- Add company_id to activity_log if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'activity_log' AND column_name = 'company_id') THEN
    ALTER TABLE activity_log ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
    CREATE INDEX idx_activity_company ON activity_log(company_id);
  END IF;
END $$;

-- Add action types for team management
COMMENT ON TABLE activity_log IS 'Tracks all user actions including team management, invitations, settings changes';

-- ================================================
-- COMPANY SETTINGS HELPERS
-- ================================================

-- Function to check if company is within limits
CREATE OR REPLACE FUNCTION check_company_limits(company_uuid UUID)
RETURNS TABLE(
  can_add_project BOOLEAN,
  can_add_user BOOLEAN,
  current_projects INTEGER,
  max_projects INTEGER,
  current_users INTEGER,
  max_users INTEGER,
  subscription_status TEXT,
  trial_expired BOOLEAN
) AS $$
DECLARE
  company_record RECORD;
  project_count INTEGER;
  user_count INTEGER;
BEGIN
  -- Get company info
  SELECT * INTO company_record FROM companies WHERE id = company_uuid;

  -- Count projects
  SELECT COUNT(*) INTO project_count FROM projects WHERE company_id = company_uuid AND status = 'active';

  -- Count users
  SELECT COUNT(*) INTO user_count FROM users WHERE company_id = company_uuid;

  -- Return limits check
  RETURN QUERY SELECT
    project_count < company_record.max_projects AS can_add_project,
    user_count < company_record.max_users AS can_add_user,
    project_count AS current_projects,
    company_record.max_projects AS max_projects,
    user_count AS current_users,
    company_record.max_users AS max_users,
    company_record.subscription_status AS subscription_status,
    (company_record.subscription_status = 'trial' AND company_record.trial_ends_at < NOW()) AS trial_expired;
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- INVITATION FUNCTIONS
-- ================================================

-- Function to create invitation
CREATE OR REPLACE FUNCTION create_invitation(
  p_company_id UUID,
  p_email TEXT,
  p_role TEXT,
  p_invited_by_id UUID,
  p_invited_by_name TEXT,
  p_message TEXT DEFAULT NULL,
  p_project_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS UUID AS $$
DECLARE
  v_token TEXT;
  v_invitation_id UUID;
  v_company_limits RECORD;
BEGIN
  -- Check company limits
  SELECT * INTO v_company_limits FROM check_company_limits(p_company_id);

  IF NOT v_company_limits.can_add_user THEN
    RAISE EXCEPTION 'Company has reached maximum user limit (% / %)',
      v_company_limits.current_users, v_company_limits.max_users;
  END IF;

  -- Check if user already exists in company
  IF EXISTS (SELECT 1 FROM users WHERE company_id = p_company_id AND email = p_email) THEN
    RAISE EXCEPTION 'User % already exists in this company', p_email;
  END IF;

  -- Revoke any existing pending invitations for this email
  UPDATE user_invitations
  SET status = 'revoked'
  WHERE company_id = p_company_id
    AND email = p_email
    AND status = 'pending';

  -- Generate random token
  v_token := encode(gen_random_bytes(32), 'hex');

  -- Create invitation
  INSERT INTO user_invitations (
    company_id, email, role, invited_by_id, invited_by_name, token, message, project_ids
  )
  VALUES (
    p_company_id, p_email, p_role, p_invited_by_id, p_invited_by_name, v_token, p_message, p_project_ids
  )
  RETURNING id INTO v_invitation_id;

  -- Log activity
  INSERT INTO activity_log (company_id, user_id, action, new_value)
  VALUES (
    p_company_id,
    p_invited_by_id,
    'user_invited',
    json_build_object('email', p_email, 'role', p_role)::text
  );

  RETURN v_invitation_id;
END;
$$ LANGUAGE plpgsql;

-- Function to accept invitation
CREATE OR REPLACE FUNCTION accept_invitation(
  p_token TEXT,
  p_user_id UUID,
  p_full_name TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_invitation RECORD;
BEGIN
  -- Get invitation
  SELECT * INTO v_invitation
  FROM user_invitations
  WHERE token = p_token
    AND status = 'pending'
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invitation token';
  END IF;

  -- Update user with company info
  UPDATE users
  SET
    company_id = v_invitation.company_id,
    role = v_invitation.role,
    full_name = p_full_name
  WHERE id = p_user_id;

  -- Assign to projects if specified
  IF array_length(v_invitation.project_ids, 1) > 0 THEN
    INSERT INTO project_assignments (user_id, project_id)
    SELECT p_user_id, unnest(v_invitation.project_ids)
    ON CONFLICT (user_id, project_id) DO NOTHING;
  END IF;

  -- Mark invitation as accepted
  UPDATE user_invitations
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = v_invitation.id;

  -- Log activity
  INSERT INTO activity_log (company_id, user_id, action, new_value)
  VALUES (
    v_invitation.company_id,
    p_user_id,
    'user_joined',
    json_build_object('email', v_invitation.email, 'role', v_invitation.role)::text
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- ROW LEVEL SECURITY POLICIES
-- ================================================

-- Enable RLS on new tables
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

-- Companies RLS (if not already enabled)
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Users can view invitations for their company
CREATE POLICY "Users can view company invitations" ON user_invitations
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- Admins can manage invitations
CREATE POLICY "Admins can manage invitations" ON user_invitations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND company_id = user_invitations.company_id
        AND role IN ('admin', 'office')
    )
  );

-- Anyone can view their own invitation by token (for acceptance)
CREATE POLICY "Anyone can view invitation by token" ON user_invitations
  FOR SELECT USING (true);

-- Users can view their own company
CREATE POLICY "Users can view their company" ON companies
  FOR SELECT USING (
    id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- Admins can update their company
CREATE POLICY "Admins can update company" ON companies
  FOR UPDATE USING (
    id IN (
      SELECT company_id FROM users
      WHERE id = auth.uid() AND role IN ('admin', 'office')
    )
  );

-- ================================================
-- SUBSCRIPTION PLAN LIMITS
-- ================================================

-- Helper function to upgrade subscription
CREATE OR REPLACE FUNCTION upgrade_subscription(
  p_company_id UUID,
  p_plan TEXT,
  p_subscription_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_max_projects INTEGER;
  v_max_users INTEGER;
BEGIN
  -- Set limits based on plan
  CASE p_plan
    WHEN 'starter' THEN
      v_max_projects := 10;
      v_max_users := 10;
    WHEN 'professional' THEN
      v_max_projects := 50;
      v_max_users := 25;
    WHEN 'enterprise' THEN
      v_max_projects := 999;
      v_max_users := 100;
    ELSE
      v_max_projects := 3;
      v_max_users := 5;
  END CASE;

  -- Update company
  UPDATE companies
  SET
    subscription_plan = p_plan,
    subscription_status = 'active',
    subscription_started_at = NOW(),
    max_projects = v_max_projects,
    max_users = v_max_users,
    updated_at = NOW()
  WHERE id = p_company_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- SAMPLE DATA / TESTING
-- ================================================

-- Function to create demo company with users
CREATE OR REPLACE FUNCTION create_demo_company(
  p_company_name TEXT,
  p_company_code TEXT,
  p_admin_email TEXT,
  p_admin_name TEXT
)
RETURNS UUID AS $$
DECLARE
  v_company_id UUID;
BEGIN
  -- Create company
  INSERT INTO companies (name, code, subscription_status, subscription_plan)
  VALUES (p_company_name, p_company_code, 'trial', 'trial')
  RETURNING id INTO v_company_id;

  RETURN v_company_id;
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- EXPIRE OLD INVITATIONS (RUN PERIODICALLY)
-- ================================================

-- Function to expire old invitations
CREATE OR REPLACE FUNCTION expire_old_invitations()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE user_invitations
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- You can run this periodically via pg_cron or a scheduled job:
-- SELECT expire_old_invitations();

COMMENT ON FUNCTION expire_old_invitations IS 'Expires pending invitations that are past their expiration date. Run periodically via cron or scheduled job.';
