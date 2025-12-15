-- ============================================
-- MULTI-COMPANY SETUP - RUN THIS IN SUPABASE
-- ============================================

-- STEP 1: Create user_companies junction table
-- (Skip if already exists)
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

-- Disable RLS for development
ALTER TABLE user_companies DISABLE ROW LEVEL SECURITY;

-- STEP 2: Migrate existing users to user_companies table
INSERT INTO user_companies (user_id, company_id, role)
SELECT
  id as user_id,
  company_id,
  COALESCE(role, 'owner') as role
FROM users
WHERE company_id IS NOT NULL
ON CONFLICT (user_id, company_id) DO NOTHING;

-- STEP 3: Show your current user and companies
SELECT
  '=== YOUR USER INFO ===' as info,
  u.id as user_id,
  u.email,
  u.company_id as current_company_id
FROM users u
ORDER BY u.email;

SELECT
  '=== AVAILABLE COMPANIES ===' as info,
  c.id as company_id,
  c.code,
  c.name
FROM companies c
ORDER BY c.code;

SELECT
  '=== CURRENT USER-COMPANY MAPPINGS ===' as info,
  u.email,
  c.code as company_code,
  c.name as company_name,
  uc.role
FROM user_companies uc
JOIN users u ON u.id = uc.user_id
JOIN companies c ON c.id = uc.company_id
ORDER BY u.email, c.code;

-- STEP 4: Add your user to BOTH companies
-- REPLACE 'your-email@example.com' with your actual email
-- This will give you access to both GGG and MILLER

INSERT INTO user_companies (user_id, company_id, role)
SELECT
  u.id as user_id,
  c.id as company_id,
  'owner' as role
FROM users u
CROSS JOIN companies c
WHERE u.email = 'your-email@example.com'  -- CHANGE THIS TO YOUR EMAIL!
  AND c.code IN ('GGG', 'MILLER')
ON CONFLICT (user_id, company_id) DO NOTHING;

-- STEP 5: Verify the setup
SELECT
  '=== VERIFICATION: Your Companies ===' as info,
  u.email,
  c.code as company_code,
  c.name as company_name,
  uc.role
FROM user_companies uc
JOIN users u ON u.id = uc.user_id
JOIN companies c ON c.id = uc.company_id
WHERE u.email = 'your-email@example.com'  -- CHANGE THIS TO YOUR EMAIL!
ORDER BY c.code;

-- Success!
DO $$
BEGIN
  RAISE NOTICE '✓ user_companies table created';
  RAISE NOTICE '✓ Existing users migrated';
  RAISE NOTICE '✓ Multi-company support is ready!';
  RAISE NOTICE '';
  RAISE NOTICE 'IMPORTANT: Update line 35 and 51 with YOUR email address';
  RAISE NOTICE 'Then run this script in Supabase SQL Editor';
END $$;
