-- Fix: "column reference 'project_id' is ambiguous" in validate_pin_and_create_session
--
-- The RETURNS TABLE clause declares 'project_id' as an output column, which
-- creates a PL/pgSQL variable in the function scope.  The DELETE statement on
-- the old line 273 used an unqualified 'project_id', making PostgreSQL unable
-- to distinguish between the field_sessions table column and the output
-- parameter.  This migration recreates the function with the column reference
-- properly qualified as field_sessions.project_id.

DROP FUNCTION IF EXISTS validate_pin_and_create_session(TEXT, TEXT, TEXT, TEXT);

CREATE FUNCTION validate_pin_and_create_session(
  p_pin          TEXT,
  p_company_code TEXT,
  p_device_id    TEXT DEFAULT NULL,
  p_ip_address   TEXT DEFAULT NULL
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
  found_project RECORD;
  found_company RECORD;
  new_token     TEXT;
  clean_pin     TEXT;
  clean_code    TEXT;
BEGIN
  clean_pin  := TRIM(p_pin);
  clean_code := UPPER(TRIM(p_company_code));

  -- Rate-limit check (only when at least one identifier is available)
  IF p_ip_address IS NOT NULL OR p_device_id IS NOT NULL THEN
    IF NOT check_rate_limit(p_ip_address, p_device_id, 15, 5) THEN
      PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_rate_limited');
      RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT,
                          NULL::UUID, NULL::TEXT, 'RATE_LIMITED'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Case-insensitive company code lookup
  SELECT * INTO found_company
  FROM companies c
  WHERE UPPER(TRIM(c.code)) = clean_code;

  IF NOT FOUND THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid_company');
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT,
                        NULL::UUID, NULL::TEXT, 'INVALID_COMPANY'::TEXT;
    RETURN;
  END IF;

  -- PIN lookup (case-sensitive, whitespace-trimmed)
  SELECT * INTO found_project
  FROM projects p
  WHERE TRIM(p.pin) = clean_pin
    AND p.company_id = found_company.id
    AND p.status     = 'active';

  IF NOT FOUND THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid');
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT,
                        NULL::UUID, NULL::TEXT, 'INVALID_PIN'::TEXT;
    RETURN;
  END IF;

  new_token := encode(gen_random_bytes(32), 'hex');

  -- Revoke existing sessions for this device+project
  IF p_device_id IS NOT NULL THEN
    DELETE FROM field_sessions
    WHERE field_sessions.device_id   = p_device_id
      AND field_sessions.project_id  = found_project.id;
  END IF;

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
