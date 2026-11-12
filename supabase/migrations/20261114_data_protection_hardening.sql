-- ============================================================
-- DATA PROTECTION HARDENING
-- ============================================================
-- From the data-protection check of 2026-11-12. Apply after
-- 20261113_tenant_isolation_hardening.sql (checked below).
--
-- 1. Project PINs
--    a. A field session (the anon role) can no longer read projects.pin
--       or projects.pin_hash, or write to projects at all. Office users
--       are unchanged. The app asks for named columns (deploy it first).
--    b. Every PIN gets a bcrypt hash (backfill), and field sign-in checks
--       only the hash: the plain-text comparison is removed.
--    c. An archived project no longer accepts its PIN.
--    d. A device that signed in to the company in the last 30 days is not
--       blocked by the company-wide cap on wrong PINs, so someone guessing
--       PINs cannot lock out the company's own foremen. New devices still
--       count against the cap (20 wrong PINs per company per 15 minutes)
--       and every device against its own limit (5 per 15 minutes).
-- 2. Link tokens: share links (/view/...) and signing links (/sign/...)
--    are made with gen_random_bytes() (pgcrypto) instead of random():
--    24 characters (project_shares.share_token widened to VARCHAR(32);
--    links already sent keep working). The generators can no longer be
--    called without signing in.
-- 3. Scheduled cleanup with pg_cron, when installed: expired field
--    sessions (daily), sign-in attempts older than 24 hours (hourly),
--    error reports older than 180 days, slow-query metrics older than 90
--    days, and sent / failed / cancelled emails older than 180 days
--    (daily). Signatures, documents and audit logs are never deleted.
--
-- One transaction.
-- Rollback: supabase/rollbacks/20261114_data_protection_hardening_rollback.sql
-- Tests:    supabase/tests/data_protection_tests.sql
-- ============================================================

BEGIN;

-- pgcrypto (crypt, gen_salt, gen_random_bytes) lives in the extensions schema
SET LOCAL search_path = public, extensions;

-- ------------------------------------------------------------
-- 1. Project PINs
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.is_active_member(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261113_tenant_isolation_hardening.sql first';
  END IF;
END $$;

-- a. Field sessions: every project column except the PIN and its hash
DO $$
DECLARE
  v_cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO v_cols
  FROM pg_attribute a
  WHERE a.attrelid = 'public.projects'::regclass
    AND a.attnum > 0 AND NOT a.attisdropped
    AND a.attname NOT IN ('pin', 'pin_hash');
  EXECUTE 'REVOKE ALL ON public.projects FROM anon';
  EXECUTE format('GRANT SELECT (%s) ON public.projects TO anon', v_cols);
END $$;

-- b. Every PIN has a hash
UPDATE public.projects
SET pin_hash = crypt(TRIM(pin), gen_salt('bf', 10))
WHERE pin IS NOT NULL AND TRIM(pin) <> '' AND pin_hash IS NULL;

-- d. Devices that signed in successfully, per company (server-only)
CREATE TABLE IF NOT EXISTS public.field_trusted_devices (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  last_success_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, device_id)
);
ALTER TABLE public.field_trusted_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.field_trusted_devices FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.validate_pin_and_create_session(p_pin text, p_company_code text, p_device_id text DEFAULT NULL::text, p_ip_address text DEFAULT NULL::text, p_remember boolean DEFAULT false)
 RETURNS TABLE(success boolean, session_token text, project_id uuid, project_name text, company_id uuid, company_name text, error_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  is_rate_limited BOOLEAN; found_project RECORD; found_company RECORD;
  new_token TEXT; clean_pin TEXT; clean_code TEXT; session_duration INTERVAL;
  v_trusted BOOLEAN := false;
BEGIN
  clean_pin := TRIM(p_pin); clean_code := UPPER(TRIM(p_company_code));
  session_duration := CASE WHEN p_remember THEN interval '30 days' ELSE interval '12 hours' END;
  is_rate_limited := NOT check_rate_limit(p_ip_address, p_device_id, 15, 5);
  IF is_rate_limited THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_rate_limited');
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, 'RATE_LIMITED'::TEXT; RETURN;
  END IF;
  SELECT c.* INTO found_company FROM companies c WHERE UPPER(c.code) = clean_code;
  IF found_company IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid_company');
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, 'INVALID_COMPANY'::TEXT; RETURN;
  END IF;

  -- A device that signed in to this company in the last 30 days is not
  -- subject to the company-wide cap, so guessing cannot lock foremen out.
  -- Device ids are random values kept on the device, not guessable.
  IF p_device_id IS NOT NULL AND length(p_device_id) >= 16 THEN
    SELECT EXISTS (
      SELECT 1 FROM field_trusted_devices d
      WHERE d.company_id = found_company.id
        AND d.device_id = p_device_id
        AND d.last_success_at > NOW() - interval '30 days'
    ) INTO v_trusted;
  END IF;

  -- Cap wrong PINs per company, whatever device or address a new caller
  -- claims to be
  IF NOT v_trusted AND (SELECT COUNT(*) FROM auth_attempts a
      WHERE a.success = FALSE
        AND a.attempt_type = 'pin_invalid:' || found_company.id::text
        AND a.created_at > NOW() - interval '15 minutes') >= 20 THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_rate_limited');
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, 'RATE_LIMITED'::TEXT; RETURN;
  END IF;

  -- Only the hash is checked, and archived projects do not accept a PIN
  SELECT p.* INTO found_project FROM projects p
  WHERE p.company_id = found_company.id
    AND p.pin_hash IS NOT NULL
    AND COALESCE(p.status, 'active') <> 'archived'
    AND crypt(clean_pin, p.pin_hash) = p.pin_hash
  LIMIT 1;
  IF found_project IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid:' || found_company.id::text);
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, 'INVALID_PIN'::TEXT; RETURN;
  END IF;

  new_token := encode(gen_random_bytes(32), 'hex');
  IF p_device_id IS NOT NULL THEN
    DELETE FROM field_sessions fs WHERE fs.device_id = p_device_id AND fs.project_id = found_project.id;
    IF length(p_device_id) >= 16 THEN
      INSERT INTO field_trusted_devices (company_id, device_id, last_success_at)
      VALUES (found_company.id, p_device_id, NOW())
      ON CONFLICT ON CONSTRAINT field_trusted_devices_pkey DO UPDATE SET last_success_at = EXCLUDED.last_success_at;
    END IF;
  END IF;
  INSERT INTO field_sessions (project_id, company_id, session_token, device_id, expires_at)
  VALUES (found_project.id, found_company.id, new_token, p_device_id, NOW() + session_duration);
  PERFORM log_auth_attempt(p_ip_address, p_device_id, TRUE, 'pin');
  RETURN QUERY SELECT true, new_token, found_project.id, found_project.name, found_company.id, found_company.name, NULL::TEXT;
END;
$function$;

-- ------------------------------------------------------------
-- 2. Link tokens
-- ------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('extensions.gen_random_bytes(integer)') IS NULL
     AND to_regprocedure('public.gen_random_bytes(integer)') IS NULL THEN
    RAISE EXCEPTION 'pgcrypto gen_random_bytes() is not installed';
  END IF;
END $$;

-- Base62 string of p_length characters from cryptographic random bytes.
-- Rejection sampling (bytes >= 248 are skipped) keeps every character
-- equally likely.
CREATE OR REPLACE FUNCTION public.secure_random_token(p_length INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  c_chars CONSTANT TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  v_bytes BYTEA;
  v_byte INTEGER;
  v_out TEXT := '';
  i INTEGER;
BEGIN
  IF p_length IS NULL OR p_length < 8 OR p_length > 128 THEN
    RAISE EXCEPTION 'secure_random_token: length must be 8..128';
  END IF;
  WHILE length(v_out) < p_length LOOP
    v_bytes := gen_random_bytes(p_length * 2);
    FOR i IN 0 .. length(v_bytes) - 1 LOOP
      v_byte := get_byte(v_bytes, i);
      IF v_byte < 248 THEN
        v_out := v_out || substr(c_chars, (v_byte % 62) + 1, 1);
        EXIT WHEN length(v_out) = p_length;
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.secure_random_token(INTEGER) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.project_shares ALTER COLUMN share_token TYPE VARCHAR(32);

CREATE OR REPLACE FUNCTION public.generate_share_token()
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_token TEXT;
BEGIN
  LOOP
    v_token := secure_random_token(24);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM project_shares WHERE share_token = v_token);
  END LOOP;
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_signature_token()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_token TEXT;
BEGIN
  LOOP
    v_token := 'sig_' || secure_random_token(24);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM signature_requests WHERE signature_token = v_token);
  END LOOP;
  RETURN v_token;
END;
$$;

-- The office app asks for a share token; signing tokens are made inside
-- the signing functions. Nobody without an account needs either.
REVOKE ALL ON FUNCTION public.generate_share_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_share_token() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.generate_signature_token() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_signature_token() TO service_role;

-- ------------------------------------------------------------
-- 3. Scheduled cleanup (only when pg_cron is installed)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_old_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF to_regclass('public.error_log') IS NOT NULL THEN
    DELETE FROM error_log WHERE created_at < now() - interval '180 days';
  END IF;
  IF to_regclass('public.query_metrics') IS NOT NULL THEN
    DELETE FROM query_metrics WHERE created_at < now() - interval '90 days';
  END IF;
  IF to_regclass('public.email_outbox') IS NOT NULL THEN
    DELETE FROM email_outbox
    WHERE status IN ('sent', 'dead', 'cancelled') AND created_at < now() - interval '180 days';
  END IF;
  DELETE FROM field_trusted_devices WHERE last_success_at < now() - interval '90 days';
END;
$$;
REVOKE ALL ON FUNCTION public.cleanup_old_logs() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    RAISE NOTICE 'pg_cron is not installed: cleanup jobs not scheduled';
    RETURN;
  END IF;
  IF to_regprocedure('public.cleanup_expired_sessions()') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup_expired_field_sessions';
    PERFORM cron.schedule('cleanup_expired_field_sessions', '17 3 * * *', 'SELECT public.cleanup_expired_sessions()');
  END IF;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup_old_logs';
  PERFORM cron.schedule('cleanup_old_logs', '41 4 * * *', 'SELECT public.cleanup_old_logs()');
  IF to_regprocedure('public.cleanup_old_auth_attempts()') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup_old_auth_attempts';
    PERFORM cron.schedule('cleanup_old_auth_attempts', '23 * * * *', 'SELECT public.cleanup_old_auth_attempts()');
  END IF;
END $$;

-- Check
DO $$
DECLARE
  v_share TEXT := public.generate_share_token();
  v_sig TEXT := public.generate_signature_token();
BEGIN
  IF length(v_share) <> 24 OR v_share !~ '^[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'generate_share_token returned %', v_share;
  END IF;
  IF length(v_sig) <> 28 OR v_sig !~ '^sig_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'generate_signature_token returned %', v_sig;
  END IF;
  IF has_column_privilege('anon', 'public.projects', 'pin', 'SELECT')
     OR has_column_privilege('anon', 'public.projects', 'pin_hash', 'SELECT') THEN
    RAISE EXCEPTION 'field sessions can still read project PINs';
  END IF;
  IF EXISTS (SELECT 1 FROM projects WHERE pin IS NOT NULL AND TRIM(pin) <> '' AND pin_hash IS NULL) THEN
    RAISE EXCEPTION 'a project PIN has no hash';
  END IF;
  RAISE NOTICE 'data protection hardening applied';
END $$;

COMMIT;
