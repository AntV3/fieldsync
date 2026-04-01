-- ============================================================
-- Migration: Fix ambiguous project_id in validate_pin_and_create_session
-- Date: 2026-03-04
-- ============================================================
--
-- ROOT CAUSE:
--   The function RETURNS TABLE includes a column named "project_id".
--   Inside the function body, bare references to "project_id" in
--   DELETE ... WHERE and INSERT ... VALUES clauses are ambiguous
--   because PostgreSQL cannot distinguish between the output column
--   and the field_sessions table column.
--
--   This caused a 400 (Bad Request) from PostgREST, which triggered
--   the JS fallback. The fallback tried a direct INSERT into
--   field_sessions, which was blocked by the "No direct session
--   access" RLS policy (USING false). Without a valid server-side
--   session token, all subsequent RLS checks via
--   validate_field_session() failed, producing 42501 errors on
--   disposal_loads and other tables.
--
-- FIX:
--   1. Qualify all column references in DML statements with table
--      aliases to eliminate ambiguity.
--   2. Alias the RETURN QUERY SELECT columns explicitly.
--
-- This migration is IDEMPOTENT — safe to re-run.
-- ============================================================

-- Drop existing function (exact signature match required)
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
      RETURN QUERY SELECT
        false AS success,
        NULL::TEXT AS session_token,
        NULL::UUID AS project_id,
        NULL::TEXT AS project_name,
        NULL::UUID AS company_id,
        NULL::TEXT AS company_name,
        'RATE_LIMITED'::TEXT AS error_code;
      RETURN;
    END IF;
  END IF;

  -- Case-insensitive company code lookup
  SELECT c.* INTO found_company
  FROM companies c
  WHERE UPPER(TRIM(c.code)) = clean_code;

  IF NOT FOUND THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid_company');
    RETURN QUERY SELECT
      false AS success,
      NULL::TEXT AS session_token,
      NULL::UUID AS project_id,
      NULL::TEXT AS project_name,
      NULL::UUID AS company_id,
      NULL::TEXT AS company_name,
      'INVALID_COMPANY'::TEXT AS error_code;
    RETURN;
  END IF;

  -- PIN lookup (case-sensitive, whitespace-trimmed)
  SELECT p.* INTO found_project
  FROM projects p
  WHERE TRIM(p.pin) = clean_pin
    AND p.company_id = found_company.id
    AND p.status     = 'active';

  IF NOT FOUND THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid');
    RETURN QUERY SELECT
      false AS success,
      NULL::TEXT AS session_token,
      NULL::UUID AS project_id,
      NULL::TEXT AS project_name,
      NULL::UUID AS company_id,
      NULL::TEXT AS company_name,
      'INVALID_PIN'::TEXT AS error_code;
    RETURN;
  END IF;

  new_token := encode(gen_random_bytes(32), 'hex');

  -- Revoke existing sessions for this device+project
  -- NOTE: Use table alias "fs" to avoid ambiguity with output column names
  IF p_device_id IS NOT NULL THEN
    DELETE FROM field_sessions fs
    WHERE fs.device_id   = p_device_id
      AND fs.project_id  = found_project.id;
  END IF;

  INSERT INTO field_sessions (project_id, company_id, session_token, device_id)
  VALUES (found_project.id, found_company.id, new_token, p_device_id);

  PERFORM log_auth_attempt(p_ip_address, p_device_id, TRUE, 'pin');

  RETURN QUERY SELECT
    true            AS success,
    new_token       AS session_token,
    found_project.id   AS project_id,
    found_project.name AS project_name,
    found_company.id   AS company_id,
    found_company.name AS company_name,
    NULL::TEXT       AS error_code;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_pin_and_create_session(TEXT, TEXT, TEXT, TEXT) TO anon;

-- ============================================================
-- DONE
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'FIX APPLIED: 20260304_fix_pin_rpc_ambiguous_column';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Fixed: Ambiguous "project_id" column reference in';
  RAISE NOTICE '       validate_pin_and_create_session() that caused 400';
  RAISE NOTICE '       errors, cascading to field_session and disposal_loads';
  RAISE NOTICE '       failures.';
  RAISE NOTICE '';
END $$;
