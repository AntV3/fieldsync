-- ============================================================
-- FIX: 20260227_fix_disposal_api_auth
--
-- Problem: POST /rest/v1/disposal_loads returns 401 with
--   code 42501 "new row violates row-level security policy"
--
-- Root-cause 1 (JS): getFieldClient() used createClient() without
--   auth: { persistSession: false }.  The new client inherited any
--   existing office-user JWT from localStorage, making auth.uid()
--   non-null inside can_access_project().  The function then checked
--   user_companies instead of validate_field_session(), and if the
--   office user was not a member of the project's company the RLS
--   WITH CHECK failed.
--   → Fixed in fieldSession.js (JS change in this PR).
--
-- Root-cause 2 (DB): disposal_loads table was never explicitly
--   GRANTed to the `authenticated` role.  The `anon` grant came from
--   20241230_field_cor_access.sql, but office users (authenticated
--   role) relied on Supabase's default schema-level grants.  If
--   those defaults are missing the INSERT silently fails at the
--   privilege check (same 42501 code) before RLS is even evaluated.
--
-- This migration:
--   1. Ensures both anon and authenticated have full DML on
--      disposal_loads (idempotent - safe to re-run).
--   2. Re-applies the four can_access_project() RLS policies so the
--      database is in a known-good state regardless of which prior
--      migrations have been applied.
--   3. Ensures the validate_field_session / can_access_project
--      helper functions are up-to-date (idempotent CREATE OR REPLACE).
-- ============================================================

-- ============================================================
-- PART 1: TABLE-LEVEL GRANTS
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON disposal_loads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON disposal_loads TO authenticated;

-- ============================================================
-- PART 2: RE-APPLY RLS POLICIES (idempotent)
-- Drop every known variant of the disposal_loads policies so we
-- always end up with exactly the four can_access_project() ones.
-- ============================================================

DROP POLICY IF EXISTS "Field users can view disposal loads"               ON disposal_loads;
DROP POLICY IF EXISTS "Field users can create disposal loads"             ON disposal_loads;
DROP POLICY IF EXISTS "Field users can update disposal loads"             ON disposal_loads;
DROP POLICY IF EXISTS "Field users can delete disposal loads"             ON disposal_loads;
DROP POLICY IF EXISTS "Secure field view disposal loads"                  ON disposal_loads;
DROP POLICY IF EXISTS "Secure field create disposal loads"                ON disposal_loads;
DROP POLICY IF EXISTS "Secure field update disposal loads"                ON disposal_loads;
DROP POLICY IF EXISTS "Secure field delete disposal loads"                ON disposal_loads;
DROP POLICY IF EXISTS "Users can view disposal loads for their projects"  ON disposal_loads;
DROP POLICY IF EXISTS "Users can insert disposal loads for assigned projects" ON disposal_loads;
DROP POLICY IF EXISTS "Users can update their own disposal loads"         ON disposal_loads;
DROP POLICY IF EXISTS "Users can delete their own disposal loads"         ON disposal_loads;

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

-- ============================================================
-- PART 3: ENSURE can_access_project IS UP-TO-DATE
-- ============================================================

-- validate_field_session: reads x-field-session request header and
-- checks the field_sessions table.  Marked VOLATILE (not STABLE) so
-- the planner never caches the result and the UPDATE side-effect
-- (touching last_activity) is always executed.
CREATE OR REPLACE FUNCTION validate_field_session(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER VOLATILE AS $$
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

  IF valid THEN
    UPDATE field_sessions
    SET last_activity = NOW()
    WHERE session_token = v_token AND project_id = p_project_id;
  END IF;

  RETURN valid;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_field_session(UUID) TO anon;
GRANT EXECUTE ON FUNCTION validate_field_session(UUID) TO authenticated;

-- can_access_project: returns true for authenticated office users who
-- belong to the project's company, OR for field workers with a valid
-- x-field-session for that project.
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

GRANT EXECUTE ON FUNCTION can_access_project(UUID) TO anon;
GRANT EXECUTE ON FUNCTION can_access_project(UUID) TO authenticated;

-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '20260227_fix_disposal_api_auth applied:';
  RAISE NOTICE '  - GRANT anon + authenticated on disposal_loads';
  RAISE NOTICE '  - Rebuilt 4 can_access_project() RLS policies';
  RAISE NOTICE '  - validate_field_session now VOLATILE (no caching)';
END $$;
