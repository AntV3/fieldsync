-- ============================================================
-- ROLLBACK for 20261114_data_protection_hardening.sql
-- ============================================================
-- Restores PIN sign-in as left by 20261113_tenant_isolation_hardening.sql
-- (plain-text fallback, archived projects accepted, no trusted devices),
-- field-session access to the projects table, the token functions as read
-- from production on 2026-11-11, and removes the cleanup jobs.
-- Kept on purpose: share_token stays VARCHAR(32) (links issued since the
-- migration are 24 characters) and PIN hashes added by the backfill stay.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_pin_and_create_session(p_pin text, p_company_code text, p_device_id text DEFAULT NULL::text, p_ip_address text DEFAULT NULL::text, p_remember boolean DEFAULT false)
 RETURNS TABLE(success boolean, session_token text, project_id uuid, project_name text, company_id uuid, company_name text, error_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  is_rate_limited BOOLEAN; found_project RECORD; found_company RECORD;
  new_token TEXT; clean_pin TEXT; clean_code TEXT; session_duration INTERVAL;
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
  -- tenant isolation guard (20261113): cap wrong PINs per company, whatever
  -- device or address the caller claims to be
  IF (SELECT COUNT(*) FROM auth_attempts a
      WHERE a.success = FALSE
        AND a.attempt_type = 'pin_invalid:' || found_company.id::text
        AND a.created_at > NOW() - interval '15 minutes') >= 20 THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_rate_limited');
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, 'RATE_LIMITED'::TEXT; RETURN;
  END IF;
  SELECT p.* INTO found_project FROM projects p
  WHERE p.company_id = found_company.id AND p.pin_hash IS NOT NULL
    AND crypt(clean_pin, p.pin_hash) = p.pin_hash;
  IF found_project IS NULL THEN
    SELECT p.* INTO found_project FROM projects p
    WHERE TRIM(p.pin) = clean_pin AND p.company_id = found_company.id;
  END IF;
  IF found_project IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid:' || found_company.id::text);
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, 'INVALID_PIN'::TEXT; RETURN;
  END IF;
  new_token := encode(gen_random_bytes(32), 'hex');
  IF p_device_id IS NOT NULL THEN
    DELETE FROM field_sessions fs WHERE fs.device_id = p_device_id AND fs.project_id = found_project.id;
  END IF;
  INSERT INTO field_sessions (project_id, company_id, session_token, device_id, expires_at)
  VALUES (found_project.id, found_company.id, new_token, p_device_id, NOW() + session_duration);
  PERFORM log_auth_attempt(p_ip_address, p_device_id, TRUE, 'pin');
  RETURN QUERY SELECT true, new_token, found_project.id, found_project.name, found_company.id, found_company.name, NULL::TEXT;
END;
$function$;

DROP TABLE IF EXISTS public.field_trusted_devices;
REVOKE ALL ON public.projects FROM anon;
GRANT ALL ON public.projects TO anon;
DROP FUNCTION IF EXISTS public.cleanup_old_logs();

CREATE OR REPLACE FUNCTION public.generate_share_token()
 RETURNS character varying
 LANGUAGE plpgsql
AS $function$
  DECLARE
    chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    token VARCHAR(12) := '';
    i INTEGER;
  BEGIN
    FOR i IN 1..12 LOOP
      token := token || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN token;
  END;
  $function$;

CREATE OR REPLACE FUNCTION public.generate_signature_token()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
     DECLARE
       chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
       result TEXT := '';
       i INTEGER;
       token_exists BOOLEAN := true;
     BEGIN
       WHILE token_exists LOOP
         result := 'sig_';
         FOR i IN 1..16 LOOP
           result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
         END LOOP;
         SELECT EXISTS(SELECT 1 FROM signature_requests WHERE signature_token = result) INTO token_exists;
       END LOOP;
       RETURN result;
     END;
     $function$;

GRANT EXECUTE ON FUNCTION public.generate_share_token() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_signature_token() TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.secure_random_token(INTEGER);

DO $$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job
    WHERE jobname IN ('cleanup_expired_field_sessions', 'cleanup_old_auth_attempts', 'cleanup_old_logs');
  END IF;
END $$;

COMMIT;
