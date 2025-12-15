-- ============================================
-- MULTI-COMPANY SUPPORT FOR USERS
-- Allows users to belong to multiple companies
-- ============================================

-- 1. Create user_companies junction table (many-to-many)
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

-- 2. Disable RLS on user_companies (for development)
ALTER TABLE user_companies DISABLE ROW LEVEL SECURITY;

-- 3. Migrate existing users to user_companies table
-- This copies the current user->company relationship to the junction table
INSERT INTO user_companies (user_id, company_id, role)
SELECT
  id as user_id,
  company_id,
  COALESCE(role, 'member') as role
FROM users
WHERE company_id IS NOT NULL
ON CONFLICT (user_id, company_id) DO NOTHING;

-- 4. Show what was migrated
SELECT
  u.email,
  c.code as company_code,
  c.name as company_name,
  uc.role
FROM user_companies uc
JOIN users u ON u.id = uc.user_id
JOIN companies c ON c.id = uc.company_id
ORDER BY u.email, c.code;

-- 5. Success message
DO $$
BEGIN
  RAISE NOTICE '✓ user_companies table created';
  RAISE NOTICE '✓ Existing users migrated to junction table';
  RAISE NOTICE '✓ Users can now belong to multiple companies';
  RAISE NOTICE '';
  RAISE NOTICE 'NEXT: Add users to additional companies with:';
  RAISE NOTICE 'INSERT INTO user_companies (user_id, company_id, role)';
  RAISE NOTICE 'VALUES (''user-uuid'', ''company-uuid'', ''owner'');';
END $$;
