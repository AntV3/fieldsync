-- ============================================================
-- COMBINED FIELD AUTH MIGRATION (All-in-One)
-- ============================================================
-- This combines security_hardening + field_sessions into one file
-- Run this if you're having issues with the separate migrations
-- ============================================================

-- ============================================================
-- PART 1: AUTH ATTEMPTS TABLE (for rate limiting)
-- ============================================================

CREATE TABLE IF NOT EXISTS auth_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT,
  device_id TEXT,
  attempt_type TEXT NOT NULL DEFAULT 'pin',
  pin_attempted TEXT,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip_time
ON auth_attempts(ip_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_attempts_device_time
ON auth_attempts(device_id, created_at DESC);

ALTER TABLE auth_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow logging auth attempts" ON auth_attempts;
CREATE POLICY "Allow logging auth attempts"
ON auth_attempts FOR INSERT WITH CHECK (true);

GRANT INSERT ON auth_attempts TO anon;

-- ============================================================
-- PART 2: RATE LIMITING FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_ip_address TEXT,
  p_device_id TEXT,
  p_window_minutes INTEGER DEFAULT 15,
  p_max_attempts INTEGER DEFAULT 5
) RETURNS BOOLEAN AS $$
DECLARE
  recent_failures INTEGER;
BEGIN
  SELECT COUNT(*) INTO recent_failures
  FROM auth_attempts
  WHERE (ip_address = p_ip_address OR device_id = p_device_id)
    AND success = FALSE
    AND created_at > NOW() - (p_window_minutes || ' minutes')::INTERVAL;

  RETURN recent_failures < p_max_attempts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION log_auth_attempt(
  p_ip_address TEXT,
  p_device_id TEXT,
  p_success BOOLEAN,
  p_attempt_type TEXT DEFAULT 'pin'
) RETURNS VOID AS $$
BEGIN
  INSERT INTO auth_attempts (ip_address, device_id, attempt_type, success)
  VALUES (p_ip_address, p_device_id, p_attempt_type, p_success);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION log_auth_attempt(TEXT, TEXT, BOOLEAN, TEXT) TO anon;

-- ============================================================
-- PART 3: FIELD SESSIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS field_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_sessions_token ON field_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_field_sessions_project ON field_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_field_sessions_expires ON field_sessions(expires_at);

ALTER TABLE field_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct session access" ON field_sessions;
CREATE POLICY "No direct session access"
ON field_sessions FOR ALL USING (false);

GRANT SELECT, INSERT, UPDATE, DELETE ON field_sessions TO anon;

-- ============================================================
-- PART 4: SESSION VALIDATION FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION validate_field_session(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_session_token TEXT;
  valid_session BOOLEAN := false;
BEGIN
  BEGIN
    v_session_token := current_setting('request.headers', true)::json->>'x-field-session';
  EXCEPTION WHEN OTHERS THEN
    v_session_token := NULL;
  END;

  IF v_session_token IS NULL OR v_session_token = '' THEN
    RETURN false;
  END IF;

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

CREATE OR REPLACE FUNCTION has_valid_field_session()
RETURNS TABLE (project_id UUID, company_id UUID)
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_session_token TEXT;
BEGIN
  BEGIN
    v_session_token := current_setting('request.headers', true)::json->>'x-field-session';
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  IF v_session_token IS NULL OR v_session_token = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT fs.project_id, fs.company_id
  FROM field_sessions fs
  WHERE fs.session_token = v_session_token
    AND fs.expires_at > NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION validate_field_session(UUID) TO anon;
GRANT EXECUTE ON FUNCTION has_valid_field_session() TO anon;

-- ============================================================
-- PART 5: PIN VALIDATION WITH SESSION CREATION
-- ============================================================

CREATE OR REPLACE FUNCTION validate_pin_and_create_session(
  p_pin TEXT,
  p_company_code TEXT,
  p_device_id TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
) RETURNS TABLE (
  success BOOLEAN,
  session_token TEXT,
  project_id UUID,
  project_name TEXT,
  company_id UUID,
  company_name TEXT,
  error_code TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  is_rate_limited BOOLEAN;
  found_project RECORD;
  found_company RECORD;
  new_session_token TEXT;
BEGIN
  -- Check rate limit first
  is_rate_limited := NOT check_rate_limit(p_ip_address, p_device_id, 15, 5);

  IF is_rate_limited THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_rate_limited');
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT,
      'RATE_LIMITED'::TEXT;
    RETURN;
  END IF;

  -- Find company by code
  SELECT * INTO found_company
  FROM companies c
  WHERE c.code = p_company_code;

  IF found_company IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid_company');
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT,
      'INVALID_COMPANY'::TEXT;
    RETURN;
  END IF;

  -- Find project by PIN within company
  SELECT * INTO found_project
  FROM projects p
  WHERE p.pin = p_pin
    AND p.company_id = found_company.id
    AND p.status = 'active';

  IF found_project IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid');
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT,
      'INVALID_PIN'::TEXT;
    RETURN;
  END IF;

  -- Generate secure session token
  new_session_token := encode(gen_random_bytes(32), 'hex');

  -- Revoke any existing sessions for this device/project combo
  DELETE FROM field_sessions
  WHERE device_id = p_device_id
    AND project_id = found_project.id;

  -- Create new session
  INSERT INTO field_sessions (project_id, company_id, session_token, device_id)
  VALUES (found_project.id, found_company.id, new_session_token, p_device_id);

  -- Log successful attempt
  PERFORM log_auth_attempt(p_ip_address, p_device_id, TRUE, 'pin');

  -- Return success with session token
  RETURN QUERY SELECT
    true,
    new_session_token,
    found_project.id,
    found_project.name,
    found_company.id,
    found_company.name,
    NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_pin_and_create_session(TEXT, TEXT, TEXT, TEXT) TO anon;

-- ============================================================
-- PART 6: CAN_ACCESS_PROJECT HELPER
-- ============================================================

CREATE OR REPLACE FUNCTION can_access_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
BEGIN
  -- Check authenticated user access
  IF auth.uid() IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM user_companies uc
      JOIN projects p ON p.company_id = uc.company_id
      WHERE p.id = p_project_id
        AND uc.user_id = auth.uid()
        AND uc.status = 'active'
    );
  END IF;

  -- Check field session access
  RETURN validate_field_session(p_project_id);
END;
$$;

GRANT EXECUTE ON FUNCTION can_access_project(UUID) TO anon;
GRANT EXECUTE ON FUNCTION can_access_project(UUID) TO authenticated;

-- ============================================================
-- PART 7: SESSION MANAGEMENT FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION extend_field_session(p_session_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE field_sessions
  SET expires_at = NOW() + INTERVAL '24 hours',
      last_activity = NOW()
  WHERE session_token = p_session_token
    AND expires_at > NOW();

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION invalidate_field_session(p_session_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM field_sessions
  WHERE session_token = p_session_token;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION extend_field_session(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION invalidate_field_session(TEXT) TO anon;

-- ============================================================
-- SUCCESS!
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'COMBINED FIELD AUTH MIGRATION COMPLETE!';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - auth_attempts table (rate limiting)';
  RAISE NOTICE '  - field_sessions table (session tracking)';
  RAISE NOTICE '  - check_rate_limit() function';
  RAISE NOTICE '  - log_auth_attempt() function';
  RAISE NOTICE '  - validate_pin_and_create_session() function';
  RAISE NOTICE '  - validate_field_session() function';
  RAISE NOTICE '  - can_access_project() function';
  RAISE NOTICE '';
  RAISE NOTICE 'Field users can now log in with PIN!';
  RAISE NOTICE '============================================================';
END $$;
