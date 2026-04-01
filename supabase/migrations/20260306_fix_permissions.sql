-- ============================================================
-- FIX PERMISSIONS
-- Adds missing GRANT statements for disposal_truck_counts,
-- grants log_error/log_query_metric to anon role, and
-- ensures labor_class_rates SELECT works for non-admin members
-- ============================================================

-- 1. disposal_truck_counts: Missing GRANT statements entirely
-- Authenticated users need full CRUD, anon (field workers) need SELECT/INSERT/UPDATE
GRANT SELECT, INSERT, UPDATE, DELETE ON disposal_truck_counts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON disposal_truck_counts TO anon;

-- 2. log_error & log_query_metric: Only granted to authenticated, not anon
-- When a session expires the user falls to anon and the RPC returns 404
GRANT EXECUTE ON FUNCTION log_error TO anon;
GRANT EXECUTE ON FUNCTION log_query_metric TO anon;

-- 3. labor_class_rates: SELECT policy is open (USING true) and GRANT SELECT
-- exists for anon, but the management policy requires 'administrator' access_level.
-- Regular authenticated members (non-admin) who belong to the company should be
-- able to read rates. The SELECT policy already uses USING(true) so SELECT works,
-- but the FOR ALL policy's USING clause also applies to SELECT for authenticated
-- users. Add an explicit policy for authenticated member SELECT access.
DROP POLICY IF EXISTS "Company members can view labor class rates" ON labor_class_rates;
CREATE POLICY "Company members can view labor class rates"
ON labor_class_rates FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM labor_classes lc
    JOIN user_companies uc ON uc.company_id = lc.company_id
    WHERE lc.id = labor_class_rates.labor_class_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
  )
);

-- Also add explicit SELECT policies for labor_categories and labor_classes
-- for authenticated members (not just administrators)
DROP POLICY IF EXISTS "Company members can view labor categories" ON labor_categories;
CREATE POLICY "Company members can view labor categories"
ON labor_categories FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = labor_categories.company_id
    AND uc.status = 'active'
  )
);

DROP POLICY IF EXISTS "Company members can view labor classes" ON labor_classes;
CREATE POLICY "Company members can view labor classes"
ON labor_classes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = labor_classes.company_id
    AND uc.status = 'active'
  )
);
