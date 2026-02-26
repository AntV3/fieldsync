-- ============================================================
-- FIX FOREMAN ERRORS (2026-02-19)
-- ============================================================
-- Fixes three issues causing foreman 42501 RLS violations:
--
-- 1. daily_reports missing UPDATE policy (upsert fails when
--    a report for today already exists — INSERT ON CONFLICT
--    DO UPDATE needs both INSERT and UPDATE policies).
--
-- 2. disposal_loads UPDATE policy was scoped by user_id only,
--    so a PIN-session user without a user_id couldn't update
--    or decrement loads they just created.
--
-- 3. validate_pin_and_create_session may conflict with an
--    older version (different body) in the database/ folder.
--    Drop and recreate cleanly so field sessions are always
--    created reliably.
-- ============================================================

-- ============================================================
-- PART 1: PREREQUISITES — ensure rate-limit helpers exist
-- (idempotent: safe to run even if already present)
-- ============================================================

CREATE TABLE IF NOT EXISTS auth_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address    TEXT,
  device_id     TEXT,
  attempt_type  TEXT NOT NULL DEFAULT 'pin',
  success       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip_time
  ON auth_attempts(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_device_time
  ON auth_attempts(device_id, created_at DESC);

ALTER TABLE auth_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow logging auth attempts" ON auth_attempts;
CREATE POLICY "Allow logging auth attempts"
  ON auth_attempts FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Service can read auth attempts" ON auth_attempts;
CREATE POLICY "Service can read auth attempts"
  ON auth_attempts FOR SELECT
  USING (auth.role() = 'service_role');

GRANT INSERT ON auth_attempts TO anon;
GRANT SELECT ON auth_attempts TO service_role;

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_ip_address    TEXT,
  p_device_id     TEXT,
  p_window_minutes INTEGER DEFAULT 15,
  p_max_attempts  INTEGER DEFAULT 5
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  recent_failures INTEGER;
BEGIN
  SELECT COUNT(*) INTO recent_failures
  FROM auth_attempts
  WHERE (
      (p_ip_address IS NOT NULL AND ip_address = p_ip_address)
      OR device_id = p_device_id
    )
    AND success = FALSE
    AND created_at > NOW() - (p_window_minutes || ' minutes')::INTERVAL;
  RETURN recent_failures < p_max_attempts;
END;
$$;

CREATE OR REPLACE FUNCTION log_auth_attempt(
  p_ip_address  TEXT,
  p_device_id   TEXT,
  p_success     BOOLEAN,
  p_attempt_type TEXT DEFAULT 'pin'
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO auth_attempts (ip_address, device_id, attempt_type, success)
  VALUES (p_ip_address, p_device_id, p_attempt_type, p_success);
END;
$$;

GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION log_auth_attempt(TEXT, TEXT, BOOLEAN, TEXT)    TO anon;

-- ============================================================
-- PART 2: FIELD SESSIONS TABLE
-- (idempotent)
-- ============================================================

CREATE TABLE IF NOT EXISTS field_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  device_id     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_sessions_token   ON field_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_field_sessions_project ON field_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_field_sessions_expires ON field_sessions(expires_at);

ALTER TABLE field_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct session access" ON field_sessions;
CREATE POLICY "No direct session access"
  ON field_sessions FOR ALL USING (false);

GRANT SELECT, INSERT, UPDATE, DELETE ON field_sessions TO anon;

-- ============================================================
-- PART 3: VALIDATE SESSION HELPERS
-- (idempotent)
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

  IF valid THEN
    UPDATE field_sessions
    SET last_activity = NOW()
    WHERE session_token = v_token AND project_id = p_project_id;
  END IF;

  RETURN valid;
END;
$$;

CREATE OR REPLACE FUNCTION has_valid_field_session()
RETURNS TABLE (project_id UUID, company_id UUID)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_token TEXT;
BEGIN
  BEGIN
    v_token := current_setting('request.headers', true)::json->>'x-field-session';
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  IF v_token IS NULL OR v_token = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT fs.project_id, fs.company_id
  FROM field_sessions fs
  WHERE fs.session_token = v_token
    AND fs.expires_at    > NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION validate_field_session(UUID) TO anon;
GRANT EXECUTE ON FUNCTION has_valid_field_session()     TO anon;

-- ============================================================
-- PART 4: RECREATE validate_pin_and_create_session CLEANLY
-- Drop by full signature first to avoid "cannot change return
-- type" errors caused by old versions in database/ folder.
-- ============================================================

DROP FUNCTION IF EXISTS validate_pin_and_create_session(TEXT, TEXT, TEXT, TEXT);

CREATE FUNCTION validate_pin_and_create_session(
  p_pin           TEXT,
  p_company_code  TEXT,
  p_device_id     TEXT DEFAULT NULL,
  p_ip_address    TEXT DEFAULT NULL
) RETURNS TABLE (
  success       BOOLEAN,
  session_token TEXT,
  project_id    UUID,
  project_name  TEXT,
  company_id    UUID,
  company_name  TEXT,
  error_code    TEXT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  found_project  RECORD;
  found_company  RECORD;
  new_token      TEXT;
  clean_pin      TEXT;
  clean_code     TEXT;
BEGIN
  clean_pin  := TRIM(p_pin);
  clean_code := UPPER(TRIM(p_company_code));

  -- Server-side rate limit
  IF NOT check_rate_limit(p_ip_address, p_device_id, 15, 5) THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_rate_limited');
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::UUID, NULL::TEXT,
      NULL::UUID, NULL::TEXT, 'RATE_LIMITED'::TEXT;
    RETURN;
  END IF;

  -- Look up company (case-insensitive)
  SELECT * INTO found_company
  FROM companies c
  WHERE UPPER(c.code) = clean_code;

  IF found_company IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid_company');
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::UUID, NULL::TEXT,
      NULL::UUID, NULL::TEXT, 'INVALID_COMPANY'::TEXT;
    RETURN;
  END IF;

  -- Look up active project by PIN within company
  SELECT * INTO found_project
  FROM projects p
  WHERE TRIM(p.pin) = clean_pin
    AND p.company_id  = found_company.id
    AND p.status      = 'active';

  IF found_project IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid');
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::UUID, NULL::TEXT,
      NULL::UUID, NULL::TEXT, 'INVALID_PIN'::TEXT;
    RETURN;
  END IF;

  -- Generate a cryptographically secure session token
  new_token := encode(gen_random_bytes(32), 'hex');

  -- Revoke any existing sessions for this device + project
  IF p_device_id IS NOT NULL THEN
    DELETE FROM field_sessions
    WHERE device_id   = p_device_id
      AND project_id  = found_project.id;
  END IF;

  -- Create the new session (24-hour expiry)
  INSERT INTO field_sessions (project_id, company_id, session_token, device_id)
  VALUES (found_project.id, found_company.id, new_token, p_device_id);

  PERFORM log_auth_attempt(p_ip_address, p_device_id, TRUE, 'pin');

  RETURN QUERY SELECT
    true,
    new_token,
    found_project.id,
    found_project.name,
    found_company.id,
    found_company.name,
    NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_pin_and_create_session(TEXT, TEXT, TEXT, TEXT) TO anon;

-- ============================================================
-- PART 5: can_access_project HELPER
-- (idempotent)
-- ============================================================

CREATE OR REPLACE FUNCTION can_access_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1
      FROM user_companies uc
      JOIN projects p ON p.company_id = uc.company_id
      WHERE p.id        = p_project_id
        AND uc.user_id  = auth.uid()
        AND uc.status   = 'active'
    );
  END IF;
  RETURN validate_field_session(p_project_id);
END;
$$;

GRANT EXECUTE ON FUNCTION can_access_project(UUID) TO anon;
GRANT EXECUTE ON FUNCTION can_access_project(UUID) TO authenticated;

-- ============================================================
-- PART 6: FIX daily_reports POLICIES
-- Add the missing UPDATE policy required by the upsert
-- (INSERT ON CONFLICT DO UPDATE needs UPDATE permission).
-- ============================================================

-- Drop all existing field policies so we can recreate cleanly
DROP POLICY IF EXISTS "Field users can view daily reports"   ON daily_reports;
DROP POLICY IF EXISTS "Field users can create daily reports" ON daily_reports;
DROP POLICY IF EXISTS "Secure field view daily reports"      ON daily_reports;
DROP POLICY IF EXISTS "Secure field create daily reports"    ON daily_reports;
DROP POLICY IF EXISTS "Secure field update daily reports"    ON daily_reports;

CREATE POLICY "Secure field view daily reports"
  ON daily_reports FOR SELECT
  USING (can_access_project(project_id));

CREATE POLICY "Secure field create daily reports"
  ON daily_reports FOR INSERT
  WITH CHECK (can_access_project(project_id));

-- THIS WAS MISSING — upsert ON CONFLICT DO UPDATE requires it
CREATE POLICY "Secure field update daily reports"
  ON daily_reports FOR UPDATE
  USING  (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));

-- Ensure the anon role has table-level privilege
-- (RLS will still restrict actual row access)
GRANT SELECT, INSERT, UPDATE ON daily_reports TO anon;

-- ============================================================
-- PART 7: FIX disposal_loads UPDATE POLICY
-- The old update policy was scoped to user_id = auth.uid(),
-- which never matches for PIN-session users (no auth.uid()).
-- ============================================================

DROP POLICY IF EXISTS "Field users can view disposal loads"   ON disposal_loads;
DROP POLICY IF EXISTS "Field users can create disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Field users can update disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Field users can delete disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Secure field view disposal loads"      ON disposal_loads;
DROP POLICY IF EXISTS "Secure field create disposal loads"    ON disposal_loads;
DROP POLICY IF EXISTS "Secure field update disposal loads"    ON disposal_loads;
DROP POLICY IF EXISTS "Secure field delete disposal loads"    ON disposal_loads;
DROP POLICY IF EXISTS "Users can view disposal loads for their projects"     ON disposal_loads;
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
  USING  (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));

CREATE POLICY "Secure field delete disposal loads"
  ON disposal_loads FOR DELETE
  USING (can_access_project(project_id));

-- Ensure anon can exercise these (RLS gates the rows)
GRANT SELECT, INSERT, UPDATE, DELETE ON disposal_loads TO anon;

-- ============================================================
-- PART 8: SESSION UTILITY FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION invalidate_field_session(p_session_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM field_sessions WHERE session_token = p_session_token;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION extend_field_session(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE field_sessions
  SET expires_at    = NOW() + INTERVAL '24 hours',
      last_activity = NOW()
  WHERE session_token = p_token AND expires_at > NOW();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted INTEGER;
BEGIN
  DELETE FROM field_sessions WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION invalidate_field_session(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION extend_field_session(TEXT)     TO anon;

-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '====================================================';
  RAISE NOTICE 'FIX APPLIED: 20260219_fix_foreman_rls';
  RAISE NOTICE '  1. validate_pin_and_create_session recreated cleanly';
  RAISE NOTICE '  2. daily_reports UPDATE policy added (upsert fix)';
  RAISE NOTICE '  3. disposal_loads policies unified under can_access_project';
  RAISE NOTICE '====================================================';
END $$;
