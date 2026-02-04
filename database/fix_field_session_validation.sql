-- FieldSync Database Fix: Correct Field Session Validation Functions
-- This fixes variable reference issues in the field session validation functions
-- Run this in your Supabase SQL Editor

-- Fix validate_field_session function
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

  -- Check if session is valid for this project
  -- NOTE: Do NOT update last_activity here. This function is STABLE (required by
  -- PostgreSQL for RLS policies) and STABLE functions cannot perform writes.
  -- Session activity is tracked via extend_field_session() called from the client.
  SELECT EXISTS (
    SELECT 1 FROM field_sessions fs
    WHERE fs.session_token = v_session_token
      AND fs.project_id = p_project_id
      AND fs.expires_at > NOW()
  ) INTO valid_session;

  RETURN valid_session;
END;
$$;

-- Fix has_valid_field_session function
CREATE OR REPLACE FUNCTION has_valid_field_session()
RETURNS TABLE (project_id UUID, company_id UUID)
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_session_token TEXT;
BEGIN
  -- Get session token from request header
  BEGIN
    v_session_token := current_setting('request.headers', true)::json->>'x-field-session';
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  IF v_session_token IS NULL OR v_session_token = '' THEN
    RETURN;
  END IF;

  -- Return project/company if session is valid
  RETURN QUERY
  SELECT fs.project_id, fs.company_id
  FROM field_sessions fs
  WHERE fs.session_token = v_session_token
    AND fs.expires_at > NOW();
END;
$$;
