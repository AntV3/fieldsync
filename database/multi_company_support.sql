-- Multi-Company Support
-- Allows users to belong to multiple companies with different roles

-- Create user_companies junction table
CREATE TABLE IF NOT EXISTS user_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'member', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Ensure a user can only be added to a company once
  UNIQUE(user_id, company_id)
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_companies_user_id ON user_companies(user_id);
CREATE INDEX IF NOT EXISTS idx_user_companies_company_id ON user_companies(company_id);

-- Migrate existing users to user_companies table
-- This preserves current company associations
INSERT INTO user_companies (user_id, company_id, role)
SELECT
  id as user_id,
  company_id,
  CASE
    WHEN role = 'admin' THEN 'owner'
    WHEN role = 'office' THEN 'admin'
    ELSE 'member'
  END as role
FROM users
WHERE company_id IS NOT NULL
ON CONFLICT (user_id, company_id) DO NOTHING;

-- Add active_company_id to users table (for current session)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS active_company_id UUID REFERENCES companies(id);

-- Set active_company_id to their current company_id
UPDATE users
SET active_company_id = company_id
WHERE active_company_id IS NULL AND company_id IS NOT NULL;

-- Keep company_id for backwards compatibility but it will become deprecated
-- We'll use user_companies as the source of truth

-- Function to get all companies for a user
CREATE OR REPLACE FUNCTION get_user_companies(p_user_id UUID)
RETURNS TABLE (
  company_id UUID,
  company_name TEXT,
  company_field_code TEXT,
  user_role TEXT,
  is_active BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.field_code,
    uc.role,
    (c.id = u.active_company_id) as is_active
  FROM user_companies uc
  JOIN companies c ON c.id = uc.company_id
  JOIN users u ON u.id = uc.user_id
  WHERE uc.user_id = p_user_id
  ORDER BY c.name;
END;
$$ LANGUAGE plpgsql;

-- Function to switch active company
CREATE OR REPLACE FUNCTION switch_active_company(p_user_id UUID, p_company_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_has_access BOOLEAN;
BEGIN
  -- Check if user has access to this company
  SELECT EXISTS (
    SELECT 1 FROM user_companies
    WHERE user_id = p_user_id AND company_id = p_company_id
  ) INTO v_has_access;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'User does not have access to this company';
  END IF;

  -- Update active company
  UPDATE users
  SET active_company_id = p_company_id
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to add user to company
CREATE OR REPLACE FUNCTION add_user_to_company(
  p_user_id UUID,
  p_company_id UUID,
  p_role TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO user_companies (user_id, company_id, role)
  VALUES (p_user_id, p_company_id, p_role)
  ON CONFLICT (user_id, company_id)
  DO UPDATE SET role = EXCLUDED.role;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user has access to company
CREATE OR REPLACE FUNCTION user_has_company_access(p_user_id UUID, p_company_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_companies
    WHERE user_id = p_user_id AND company_id = p_company_id
  );
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE user_companies IS 'Junction table for many-to-many relationship between users and companies';
COMMENT ON COLUMN user_companies.role IS 'User role within this specific company: owner, admin, manager, member, viewer';
COMMENT ON COLUMN users.active_company_id IS 'Currently selected company for this user session';
