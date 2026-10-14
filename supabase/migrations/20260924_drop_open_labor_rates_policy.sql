-- ============================================================
-- Drop legacy wide-open SELECT policy on labor_class_rates
-- ============================================================
-- 20241201000310_security_hardening.sql created:
--
--   CREATE POLICY "Only authenticated users can view rates"
--   ON labor_class_rates FOR SELECT
--   USING (auth.uid() IS NOT NULL);
--
-- The intent at the time was to shut out anon field users, but the policy
-- was never scoped to the caller's company. 20260306_fix_permissions.sql
-- added a proper company-scoped SELECT policy alongside it. Postgres OR-
-- combines permissive policies, so the wider one wins and any authenticated
-- user can still read every tenant's hourly labor rates -- a cross-tenant
-- data leak of sensitive labor-cost intelligence.
--
-- Drop the legacy policy so the remaining company-scoped policy is the only
-- SELECT rule on the table.

DROP POLICY IF EXISTS "Only authenticated users can view rates" ON labor_class_rates;

-- Confirm the company-scoped policy from 20260306_fix_permissions.sql is
-- still in place; if it was removed we do NOT want the table to fall back
-- to unrestricted SELECT.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'labor_class_rates'
      AND policyname = 'Company members can view labor class rates'
      AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION
      'labor_class_rates has no company-scoped SELECT policy after dropping '
      'the legacy one. Re-run 20260306_fix_permissions.sql before applying '
      'this migration.';
  END IF;
END $$;
