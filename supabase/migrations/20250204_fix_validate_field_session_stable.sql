-- Fix: Remove UPDATE from validate_field_session() STABLE function
--
-- Problem: validate_field_session() was marked STABLE (required for RLS policy
-- functions) but performed an UPDATE on field_sessions.last_activity. PostgreSQL
-- does not allow writes inside STABLE functions, causing:
--   "UPDATE is not allowed in a non-volatile function" (code 0A000)
--
-- This broke all INSERT/UPDATE/DELETE operations on tables with RLS policies
-- using can_access_project() -> validate_field_session(), including:
--   disposal_loads, areas, t_and_m_tickets, crew_checkins, daily_reports, etc.
--
-- Fix: Remove the UPDATE from validate_field_session() so it is a pure read-only
-- check. Session activity tracking is handled by extend_field_session() which is
-- called separately from the client.

CREATE OR REPLACE FUNCTION validate_field_session(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_session_token TEXT;
  valid_session BOOLEAN := false;
BEGIN
  -- Get session token from request header
  BEGIN
    v_session_token := current_setting('request.headers', true)::json->>'x-field-session';
  EXCEPTION WHEN OTHERS THEN
    v_session_token := NULL;
  END;

  IF v_session_token IS NULL OR v_session_token = '' THEN
    RETURN false;
  END IF;

  -- Check if session is valid for this project (read-only, no side effects)
  SELECT EXISTS (
    SELECT 1 FROM field_sessions fs
    WHERE fs.session_token = v_session_token
      AND fs.project_id = p_project_id
      AND fs.expires_at > NOW()
  ) INTO valid_session;

  RETURN valid_session;
END;
$$;
