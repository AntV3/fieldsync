-- ============================================================
-- ROLLBACK for 20261114_secure_link_tokens_and_cleanup.sql
-- ============================================================
-- Restores the token functions exactly as read from production on
-- 2026-11-11 (Postgres random(), 12-character share tokens) and removes
-- the two cleanup jobs. share_token stays VARCHAR(32): links issued
-- since the migration are 24 characters and must keep working.
-- ============================================================

BEGIN;

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
    WHERE jobname IN ('cleanup_expired_field_sessions', 'cleanup_old_auth_attempts');
  END IF;
END $$;

COMMIT;
