-- Fix PIN Validation Case Sensitivity and Whitespace Issues
-- This fixes potential issues with company code and PIN matching

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
  clean_pin TEXT;
  clean_company_code TEXT;
BEGIN
  -- Clean input: trim whitespace and normalize
  clean_pin := TRIM(p_pin);
  clean_company_code := UPPER(TRIM(p_company_code));

  -- Check rate limit first
  is_rate_limited := NOT check_rate_limit(p_ip_address, p_device_id, 15, 5);

  IF is_rate_limited THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_rate_limited');
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT,
      'RATE_LIMITED'::TEXT;
    RETURN;
  END IF;

  -- Find company by code (case-insensitive)
  SELECT * INTO found_company
  FROM companies c
  WHERE UPPER(c.code) = clean_company_code;

  IF found_company IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid_company');
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT,
      'INVALID_COMPANY'::TEXT;
    RETURN;
  END IF;

  -- Find project by PIN within company (trim whitespace from both sides)
  SELECT * INTO found_project
  FROM projects p
  WHERE TRIM(p.pin) = clean_pin
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

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'PIN validation function updated with case-insensitive matching and whitespace handling';
END $$;
