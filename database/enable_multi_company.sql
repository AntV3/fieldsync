-- ============================================
-- SIMPLE MULTI-COMPANY SETUP
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Create user_companies junction table
CREATE TABLE IF NOT EXISTS user_companies (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'manager', 'member')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_user_companies_user ON user_companies(user_id);
CREATE INDEX IF NOT EXISTS idx_user_companies_company ON user_companies(company_id);

-- 2. Disable RLS for development
ALTER TABLE user_companies DISABLE ROW LEVEL SECURITY;

-- 3. Migrate existing users
INSERT INTO user_companies (user_id, company_id, role)
SELECT id as user_id, company_id, COALESCE(role, 'owner') as role
FROM users
WHERE company_id IS NOT NULL
ON CONFLICT (user_id, company_id) DO NOTHING;

-- 4. Add your user to BOTH companies
-- IMPORTANT: Replace 'YOUR_EMAIL_HERE' with your actual email address
INSERT INTO user_companies (user_id, company_id, role)
SELECT u.id, c.id, 'owner'
FROM users u
CROSS JOIN companies c
WHERE u.email = 'YOUR_EMAIL_HERE'
  AND c.code IN ('GGG', 'MILLER')
ON CONFLICT (user_id, company_id) DO NOTHING;

-- 5. Verify it worked
SELECT
  u.email,
  c.code,
  c.name,
  uc.role
FROM user_companies uc
JOIN users u ON u.id = uc.user_id
JOIN companies c ON c.id = uc.company_id
ORDER BY u.email, c.code;
