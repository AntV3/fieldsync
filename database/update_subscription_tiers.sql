-- ============================================
-- UPDATE SUBSCRIPTION TIERS FOR GGG AND MILLER
-- Give them enterprise tier for full branding access
-- ============================================

-- Check current subscription tiers
SELECT code, name, subscription_tier
FROM companies
WHERE code IN ('GGG', 'MILLER');

-- Update GGG and MILLER to enterprise tier
UPDATE companies
SET subscription_tier = 'enterprise'
WHERE code IN ('GGG', 'MILLER');

-- Verify the update
SELECT
  code,
  name,
  subscription_tier,
  '✓ Enterprise tier - Full branding access enabled' as status
FROM companies
WHERE code IN ('GGG', 'MILLER');

-- Show what each tier allows:
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== SUBSCRIPTION TIER FEATURES ===';
  RAISE NOTICE 'FREE: Basic features only';
  RAISE NOTICE 'PRO: Custom logo';
  RAISE NOTICE 'BUSINESS: Custom logo + white label';
  RAISE NOTICE 'ENTERPRISE: Everything (logo, white label, custom domain, full branding)';
  RAISE NOTICE '';
  RAISE NOTICE '✓ GGG and MILLER now have ENTERPRISE tier!';
END $$;
