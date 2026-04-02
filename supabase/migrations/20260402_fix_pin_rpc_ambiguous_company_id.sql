-- ============================================================
-- Migration: Fix ambiguous column references in validate_pin_and_create_session
-- Date: 2026-04-02
-- ============================================================
--
-- ROOT CAUSE:
--   The 20260310_field_sessions_security migration recreated the function
--   WITHOUT table aliases, reintroducing the ambiguous column reference bug
--   that was fixed in 20260304_fix_pin_rpc_ambiguous_column.
--
--   The function RETURNS TABLE with columns named "project_id" and
--   "company_id". Inside the function body, bare references to these
--   column names in DELETE and RETURN QUERY statements are ambiguous
--   because PostgreSQL cannot distinguish between the output columns
--   and the field_sessions/record columns.
--
--   This caused 400 errors from PostgREST with the message:
--     "column reference 'company_id' is ambiguous"
--
-- FIX:
--   1. Use table alias "fs" on DELETE FROM field_sessions to qualify columns
--   2. Alias all RETURN QUERY SELECT columns explicitly
--   3. Guard DELETE with NULL check on p_device_id
--
-- This migration is IDEMPOTENT — safe to re-run.
-- ============================================================

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
  is_rate_limited BOOLEAN;
  found_project   RECORD;
  found_company   RECORD;
  new_token       TEXT;
  clean_pin       TEXT;
  clean_code      TEXT;
BEGIN
  -- Clean input: trim whitespace and normalize
  clean_pin  := TRIM(p_pin);
  clean_code := UPPER(TRIM(p_company_code));

  -- Check rate limit first
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

  -- Find company by code (case-insensitive)
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

  -- Find project by PIN within company (trim whitespace from both sides)
  SELECT p.* INTO found_project
  FROM projects p
  WHERE TRIM(p.pin) = clean_pin
    AND p.company_id = found_company.id
    AND p.status = 'active';

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

  -- Generate secure session token
  new_token := encode(gen_random_bytes(32), 'hex');

  -- Revoke any existing sessions for this device/project combo
  -- NOTE: Use table alias "fs" to avoid ambiguity with RETURNS TABLE column names
  IF p_device_id IS NOT NULL THEN
    DELETE FROM field_sessions fs
    WHERE fs.device_id   = p_device_id
      AND fs.project_id  = found_project.id;
  END IF;

  -- Create new session
  INSERT INTO field_sessions (project_id, company_id, session_token, device_id)
  VALUES (found_project.id, found_company.id, new_token, p_device_id);

  -- Log successful attempt
  PERFORM log_auth_attempt(p_ip_address, p_device_id, TRUE, 'pin');

  -- Return success with session token
  -- NOTE: Explicit column aliases prevent ambiguity with RETURNS TABLE definitions
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

GRANT EXECUTE ON FUNCTION validate_pin_and_create_session(TEXT, TEXT, TEXT, TEXT) TO anon;
