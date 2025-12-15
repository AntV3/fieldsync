-- ============================================
-- ADD SUBSCRIPTION TIER COLUMN TO COMPANIES
-- Then update GGG and MILLER to enterprise tier
-- ============================================

-- 1. Add subscription_tier column to companies table
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free'
CHECK (subscription_tier IN ('free', 'pro', 'business', 'enterprise'));

-- 2. Update existing companies to free tier (if null)
UPDATE companies
SET subscription_tier = 'free'
WHERE subscription_tier IS NULL;

-- 3. Update GGG and MILLER to enterprise tier
UPDATE companies
SET subscription_tier = 'enterprise'
WHERE code IN ('GGG', 'MILLER');

-- 4. Verify the setup
SELECT
  code,
  name,
  subscription_tier,
  CASE
    WHEN subscription_tier = 'enterprise' THEN '✓ Full branding access'
    WHEN subscription_tier = 'business' THEN '○ Logo + white label'
    WHEN subscription_tier = 'pro' THEN '○ Custom logo only'
    ELSE '○ Basic features'
  END as features
FROM companies
ORDER BY code;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== SUBSCRIPTION TIERS ===';
  RAISE NOTICE 'FREE: Basic features only';
  RAISE NOTICE 'PRO: Custom logo';
  RAISE NOTICE 'BUSINESS: Logo + white label';
  RAISE NOTICE 'ENTERPRISE: Full branding (logo, white label, custom domain)';
  RAISE NOTICE '';
  RAISE NOTICE '✓ subscription_tier column added to companies table';
  RAISE NOTICE '✓ GGG and MILLER upgraded to ENTERPRISE tier';
  RAISE NOTICE '✓ Branding features now available!';
END $$;
