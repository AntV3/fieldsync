-- ============================================================
-- FIX: 20260227_fix_foreman_load_error
--
-- Two root causes for "Error adding loads" in foreman view:
--
-- 1. validate_field_session() is marked STABLE but contained an
--    UPDATE statement. STABLE functions must not modify the database.
--    In some Supabase/PostgREST configurations this caused the
--    function to fail or return false, blocking both SELECT (silently
--    returns empty list) and INSERT (visible "Error adding loads").
--    Fix: remove the UPDATE; the function now purely reads.
--
-- 2. The disposal_loads policies and grants may not exist or may be
--    stale on instances that did not run prior migrations. This
--    migration is fully idempotent and re-applies everything.
-- ============================================================

-- ============================================================
-- PART 1: FIX validate_field_session (remove the UPDATE)
-- Previously this STABLE function tried to UPDATE field_sessions,
-- violating the STABLE contract. Now it only reads.
-- ============================================================

CREATE OR REPLACE FUNCTION validate_field_session(p_project_id UUID)
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

  -- NOTE: last_activity is intentionally NOT updated here.
  -- This function is STABLE (read-only) and must not execute DML.
  -- Session activity is updated via extend_field_session() instead.

  RETURN valid;
END;
$$;

-- ============================================================
-- PART 2: Recreate can_access_project (unchanged logic, but
-- re-run so it picks up the fixed validate_field_session)
-- ============================================================

CREATE OR REPLACE FUNCTION can_access_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM user_companies uc
      JOIN projects p ON p.company_id = uc.company_id
      WHERE p.id = p_project_id
        AND uc.user_id = auth.uid()
        AND uc.status = 'active'
    );
  END IF;
  RETURN validate_field_session(p_project_id);
END;
$$;

GRANT EXECUTE ON FUNCTION validate_field_session(UUID) TO anon;
GRANT EXECUTE ON FUNCTION validate_field_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_access_project(UUID)     TO anon;
GRANT EXECUTE ON FUNCTION can_access_project(UUID)     TO authenticated;

-- ============================================================
-- PART 3: Re-apply disposal_loads RLS policies (clean slate)
-- Drops every known policy name variant from all prior migrations
-- then recreates the correct set.
-- ============================================================

DROP POLICY IF EXISTS "Field users can view disposal loads"                   ON disposal_loads;
DROP POLICY IF EXISTS "Field users can create disposal loads"                 ON disposal_loads;
DROP POLICY IF EXISTS "Field users can update disposal loads"                 ON disposal_loads;
DROP POLICY IF EXISTS "Field users can delete disposal loads"                 ON disposal_loads;
DROP POLICY IF EXISTS "Secure field view disposal loads"                      ON disposal_loads;
DROP POLICY IF EXISTS "Secure field create disposal loads"                    ON disposal_loads;
DROP POLICY IF EXISTS "Secure field update disposal loads"                    ON disposal_loads;
DROP POLICY IF EXISTS "Secure field delete disposal loads"                    ON disposal_loads;
DROP POLICY IF EXISTS "Users can view disposal loads for their projects"      ON disposal_loads;
DROP POLICY IF EXISTS "Users can insert disposal loads for assigned projects" ON disposal_loads;
DROP POLICY IF EXISTS "Users can update their own disposal loads"             ON disposal_loads;
DROP POLICY IF EXISTS "Users can delete their own disposal loads"             ON disposal_loads;

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

-- Ensure anon role can perform all DML (required for field/PIN sessions)
GRANT SELECT, INSERT, UPDATE, DELETE ON disposal_loads TO anon;

-- ============================================================
-- PART 4: Ensure helper RPC functions are accessible to anon
-- (re-grant in case prior migrations were not applied)
-- ============================================================

DO $$
BEGIN
  -- extend_field_session
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'extend_field_session'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION extend_field_session(TEXT) TO anon';
  END IF;

  -- invalidate_field_session
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'invalidate_field_session'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION invalidate_field_session(TEXT) TO anon';
  END IF;

  -- validate_pin_and_create_session
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'validate_pin_and_create_session'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION validate_pin_and_create_session(TEXT, TEXT, TEXT, TEXT) TO anon';
  END IF;
END $$;

DO $$
BEGIN
  RAISE NOTICE 'FIX APPLIED: 20260227_fix_foreman_load_error';
  RAISE NOTICE '1. validate_field_session: UPDATE removed (now truly STABLE)';
  RAISE NOTICE '2. can_access_project: recreated with fixed validate_field_session';
  RAISE NOTICE '3. disposal_loads: all policies dropped and recreated cleanly';
  RAISE NOTICE '4. Grants re-applied for anon role on disposal_loads and functions';
END $$;
