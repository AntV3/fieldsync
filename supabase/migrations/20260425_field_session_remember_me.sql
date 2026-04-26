-- ============================================================
-- Foreman "remember me" — 30-day field sessions
--
-- BEFORE:
--   field_sessions.expires_at defaulted to NOW() + 24 hours, and
--   validate_pin_and_create_session relied on that default. The
--   client now persists the session token to localStorage when the
--   foreman opts in to "Remember me on this device", but the server
--   token still died after 24 hours, so every read/write started
--   silently failing under RLS the next day.
--
-- AFTER:
--   validate_pin_and_create_session accepts a new p_remember
--   BOOLEAN parameter. When TRUE the inserted session row is given
--   an explicit 30-day expires_at; otherwise the existing 24-hour
--   default is preserved. The function signature is updated, so the
--   anon GRANT is re-issued for the new arity.
--
-- The previous 4-arg signature is dropped so callers fail fast
-- instead of silently picking a stale binary.
--
-- IDEMPOTENT — safe to re-run.
-- ============================================================

DROP FUNCTION IF EXISTS validate_pin_and_create_session(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS validate_pin_and_create_session(TEXT, TEXT, TEXT, TEXT, BOOLEAN);

CREATE FUNCTION validate_pin_and_create_session(
  p_pin          TEXT,
  p_company_code TEXT,
  p_device_id    TEXT DEFAULT NULL,
  p_ip_address   TEXT DEFAULT NULL,
  p_remember     BOOLEAN DEFAULT FALSE
) RETURNS TABLE (
  success       BOOLEAN,
  session_token TEXT,
  project_id    UUID,
  project_name  TEXT,
  company_id    UUID,
  company_name  TEXT,
  error_code    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
-- `extensions` is required so crypt()/gen_random_bytes() from pgcrypto
-- resolve under the hardened search_path set by
-- 20260423_harden_definer_search_path.
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  is_rate_limited BOOLEAN;
  found_project   RECORD;
  found_company   RECORD;
  new_token       TEXT;
  clean_pin       TEXT;
  clean_code      TEXT;
  v_expires_at    TIMESTAMPTZ;
BEGIN
  clean_pin  := TRIM(p_pin);
  clean_code := UPPER(TRIM(p_company_code));

  is_rate_limited := NOT check_rate_limit(p_ip_address, p_device_id, 15, 5);

  IF is_rate_limited THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_rate_limited');
    RETURN QUERY SELECT
      false       AS success,
      NULL::TEXT  AS session_token,
      NULL::UUID  AS project_id,
      NULL::TEXT  AS project_name,
      NULL::UUID  AS company_id,
      NULL::TEXT  AS company_name,
      'RATE_LIMITED'::TEXT AS error_code;
    RETURN;
  END IF;

  SELECT c.* INTO found_company
  FROM companies c
  WHERE UPPER(c.code) = clean_code;

  IF found_company IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid_company');
    RETURN QUERY SELECT
      false       AS success,
      NULL::TEXT  AS session_token,
      NULL::UUID  AS project_id,
      NULL::TEXT  AS project_name,
      NULL::UUID  AS company_id,
      NULL::TEXT  AS company_name,
      'INVALID_COMPANY'::TEXT AS error_code;
    RETURN;
  END IF;

  -- Match on pin_hash via bcrypt. Fall through to plaintext match
  -- only for rows that haven't been backfilled yet (defensive; the
  -- backfill step in 20260423_pin_hashing should have covered every row).
  SELECT p.* INTO found_project
  FROM projects p
  WHERE p.company_id = found_company.id
    AND p.status = 'active'
    AND (
      (p.pin_hash IS NOT NULL AND crypt(clean_pin, p.pin_hash) = p.pin_hash)
      OR (p.pin_hash IS NULL AND p.pin IS NOT NULL AND TRIM(p.pin) = clean_pin)
    );

  IF found_project IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid');
    RETURN QUERY SELECT
      false       AS success,
      NULL::TEXT  AS session_token,
      NULL::UUID  AS project_id,
      NULL::TEXT  AS project_name,
      NULL::UUID  AS company_id,
      NULL::TEXT  AS company_name,
      'INVALID_PIN'::TEXT AS error_code;
    RETURN;
  END IF;

  new_token := encode(gen_random_bytes(32), 'hex');

  IF p_device_id IS NOT NULL THEN
    DELETE FROM field_sessions fs
    WHERE fs.device_id  = p_device_id
      AND fs.project_id = found_project.id;
  END IF;

  -- Long-lived session for opt-in remember-me, otherwise inherit the
  -- table default (24h).
  IF p_remember THEN
    v_expires_at := NOW() + INTERVAL '30 days';
    INSERT INTO field_sessions (project_id, company_id, session_token, device_id, expires_at)
    VALUES (found_project.id, found_company.id, new_token, p_device_id, v_expires_at);
  ELSE
    INSERT INTO field_sessions (project_id, company_id, session_token, device_id)
    VALUES (found_project.id, found_company.id, new_token, p_device_id);
  END IF;

  PERFORM log_auth_attempt(p_ip_address, p_device_id, TRUE, 'pin');

  RETURN QUERY SELECT
    true               AS success,
    new_token          AS session_token,
    found_project.id   AS project_id,
    found_project.name AS project_name,
    found_company.id   AS company_id,
    found_company.name AS company_name,
    NULL::TEXT          AS error_code;
END;
$$;

GRANT EXECUTE ON FUNCTION
  validate_pin_and_create_session(TEXT, TEXT, TEXT, TEXT, BOOLEAN)
  TO anon;

COMMENT ON FUNCTION validate_pin_and_create_session(TEXT, TEXT, TEXT, TEXT, BOOLEAN) IS
  'Validates a foreman PIN under rate limiting, creates a field_sessions row, and returns the session token. When p_remember is TRUE the session is given a 30-day expires_at instead of the default 24h, supporting the client-side "Remember me on this device" option in the foreman login flow.';
