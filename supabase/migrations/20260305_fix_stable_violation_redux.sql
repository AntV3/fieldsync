-- ============================================================
-- FIX: 20260305_fix_stable_violation_redux
--
-- ROOT CAUSE:
--   validate_field_session() is marked STABLE but some database
--   instances still have the old version that contains:
--     UPDATE field_sessions SET last_activity = NOW() ...
--   PostgreSQL error 0A000: "UPDATE is not allowed in a non-volatile function"
--
--   This blocks ALL RLS policy evaluations that call
--   can_access_project() → validate_field_session(), causing 400
--   errors on disposal_loads, punch_list_items, and every other
--   table secured by field-session RLS.
--
-- FIX:
--   Recreate validate_field_session() as a pure read-only STABLE
--   function (no UPDATE). Session activity tracking is handled
--   separately via extend_field_session().
--
-- This migration is IDEMPOTENT — safe to re-run on any database.
-- ============================================================

-- 1. Recreate validate_field_session WITHOUT the UPDATE
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

-- 2. Recreate can_access_project to pick up fixed validate_field_session
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

-- 3. Ensure grants
GRANT EXECUTE ON FUNCTION validate_field_session(UUID) TO anon;
GRANT EXECUTE ON FUNCTION validate_field_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_access_project(UUID)     TO anon;
GRANT EXECUTE ON FUNCTION can_access_project(UUID)     TO authenticated;

-- ============================================================
-- DONE
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'FIX APPLIED: 20260305_fix_stable_violation_redux';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'validate_field_session: UPDATE removed (now truly STABLE)';
  RAISE NOTICE 'can_access_project: recreated to use fixed function';
  RAISE NOTICE '';
  RAISE NOTICE 'This fixes error 0A000: UPDATE is not allowed in a';
  RAISE NOTICE 'non-volatile function — which was blocking all field';
  RAISE NOTICE 'session RLS checks on disposal_loads, punch_list_items,';
  RAISE NOTICE 'and other foreman-accessed tables.';
  RAISE NOTICE '============================================================';
END $$;
