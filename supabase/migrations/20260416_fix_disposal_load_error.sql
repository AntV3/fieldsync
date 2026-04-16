-- ============================================================
-- FIX: Disposal loads / truck counts "Database configuration error"
--
-- SYMPTOM (from field foremen on mobile):
--   Toast: "Database configuration error — please contact support"
--   when adding disposal loads or incrementing Trucks Used.
--
-- ROOT CAUSE:
--   The disposal_loads and disposal_truck_counts tables rely on
--   can_access_project(), which in turn calls validate_field_session().
--   An older build of validate_field_session() contained an UPDATE
--   (bumping last_activity) inside a function marked STABLE. PostgreSQL
--   rejects this with error 0A000 ("UPDATE is not allowed in a
--   non-volatile function"), which the UI maps to the message above.
--
--   Several historical migrations (20260227, 20260228, 20260305,
--   20260310) attempt to correct this, but if any old definition
--   survived in a deployed database, every INSERT/UPDATE on
--   disposal_loads / disposal_truck_counts will continue to fail.
--
-- FIX:
--   1. Forcibly drop and recreate validate_field_session() and
--      can_access_project() as truly read-only STABLE functions.
--   2. Re-assert RLS policies on disposal_loads and
--      disposal_truck_counts using can_access_project(), so both
--      office (auth.uid()) and field (PIN session) users can read
--      and write.
--   3. Ensure GRANTs are in place for both roles.
--
-- This migration is IDEMPOTENT — safe to re-run on any database.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Clean slate: drop old function definitions
-- ------------------------------------------------------------
-- CASCADE removes dependent policies; we recreate them below.
DROP FUNCTION IF EXISTS can_access_project(UUID)     CASCADE;
DROP FUNCTION IF EXISTS validate_field_session(UUID) CASCADE;

-- ------------------------------------------------------------
-- 2. Recreate validate_field_session as a pure read-only STABLE
--    function (NO UPDATE / INSERT / DELETE anywhere).
-- ------------------------------------------------------------
CREATE FUNCTION validate_field_session(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_token TEXT;
  valid   BOOLEAN := false;
BEGIN
  BEGIN
    v_token := current_setting('request.headers', true)::json->>'x-field-session';
  EXCEPTION WHEN OTHERS THEN
    v_token := NULL;
  END;

  IF v_token IS NULL OR v_token = '' THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM field_sessions fs
    WHERE fs.session_token = v_token
      AND fs.project_id    = p_project_id
      AND fs.expires_at    > NOW()
  ) INTO valid;

  -- IMPORTANT: Do NOT update last_activity here. This function is
  -- STABLE and any DML triggers PostgreSQL error 0A000, which
  -- cascades into every field-session RLS check on this database.
  -- Session activity is maintained by extend_field_session() instead.

  RETURN valid;
END;
$$;

-- ------------------------------------------------------------
-- 3. Recreate can_access_project: unified check for office users
--    (auth.uid() via user_companies) and field users (session token
--    via validate_field_session).
-- ------------------------------------------------------------
CREATE FUNCTION can_access_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM user_companies uc
      JOIN projects p ON p.company_id = uc.company_id
      WHERE p.id = p_project_id
        AND uc.user_id = auth.uid()
        AND uc.status  = 'active'
    );
  END IF;
  RETURN validate_field_session(p_project_id);
END;
$$;

GRANT EXECUTE ON FUNCTION validate_field_session(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION can_access_project(UUID)     TO anon, authenticated;

-- ------------------------------------------------------------
-- 4. Re-assert disposal_loads RLS policies (dropped by CASCADE).
-- ------------------------------------------------------------
ALTER TABLE disposal_loads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Secure field view disposal loads"   ON disposal_loads;
DROP POLICY IF EXISTS "Secure field create disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Secure field update disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Secure field delete disposal loads" ON disposal_loads;

CREATE POLICY "Secure field view disposal loads"
  ON disposal_loads FOR SELECT
  USING (can_access_project(project_id));

CREATE POLICY "Secure field create disposal loads"
  ON disposal_loads FOR INSERT
  WITH CHECK (can_access_project(project_id));

CREATE POLICY "Secure field update disposal loads"
  ON disposal_loads FOR UPDATE
  USING     (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));

CREATE POLICY "Secure field delete disposal loads"
  ON disposal_loads FOR DELETE
  USING (can_access_project(project_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON disposal_loads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON disposal_loads TO anon;

-- ------------------------------------------------------------
-- 5. Re-assert disposal_truck_counts RLS policies.
-- ------------------------------------------------------------
ALTER TABLE disposal_truck_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view truck counts for their projects"      ON disposal_truck_counts;
DROP POLICY IF EXISTS "Users can insert truck counts for assigned projects" ON disposal_truck_counts;
DROP POLICY IF EXISTS "Users can update truck counts for their projects"    ON disposal_truck_counts;
DROP POLICY IF EXISTS "Users can delete truck counts for their projects"    ON disposal_truck_counts;
DROP POLICY IF EXISTS "Secure field view truck counts"                      ON disposal_truck_counts;
DROP POLICY IF EXISTS "Secure field create truck counts"                    ON disposal_truck_counts;
DROP POLICY IF EXISTS "Secure field update truck counts"                    ON disposal_truck_counts;
DROP POLICY IF EXISTS "Secure field delete truck counts"                    ON disposal_truck_counts;

CREATE POLICY "Secure field view truck counts"
  ON disposal_truck_counts FOR SELECT
  USING (can_access_project(project_id));

CREATE POLICY "Secure field create truck counts"
  ON disposal_truck_counts FOR INSERT
  WITH CHECK (can_access_project(project_id));

CREATE POLICY "Secure field update truck counts"
  ON disposal_truck_counts FOR UPDATE
  USING     (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));

CREATE POLICY "Secure field delete truck counts"
  ON disposal_truck_counts FOR DELETE
  USING (can_access_project(project_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON disposal_truck_counts TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON disposal_truck_counts TO anon;

-- ------------------------------------------------------------
-- 6. Done
-- ------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'FIX APPLIED: 20260416_fix_disposal_load_error';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'validate_field_session: recreated (no DML, truly STABLE)';
  RAISE NOTICE 'can_access_project:     recreated';
  RAISE NOTICE 'disposal_loads RLS:     rebuilt on can_access_project';
  RAISE NOTICE 'disposal_truck_counts:  rebuilt on can_access_project';
  RAISE NOTICE '============================================================';
END $$;
