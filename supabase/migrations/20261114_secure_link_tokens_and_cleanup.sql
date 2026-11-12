-- ============================================================
-- SECURE LINK TOKENS AND SCHEDULED CLEANUP
-- ============================================================
-- From the data-protection check of 2026-11-12.
--
-- 1. Share links (/view/...) and signing links (/sign/...) were made
--    with Postgres random(), which is not a cryptographic generator,
--    and share links were only 12 characters. New links now use
--    gen_random_bytes() (pgcrypto): 24 characters for share links,
--    'sig_' + 24 characters for signing links. Links already sent keep
--    working. project_shares.share_token is widened from 12 to 32
--    characters to fit (widening a varchar rewrites nothing).
-- 2. The existing cleanup functions are scheduled with pg_cron when it
--    is installed: expired field sessions daily, sign-in attempt rows
--    older than 24 hours hourly.
--
-- No policy or table data changes. One transaction.
-- Rollback: supabase/rollbacks/20261114_secure_link_tokens_and_cleanup_rollback.sql
-- ============================================================

BEGIN;

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

-- Scheduled cleanup (only when pg_cron is installed)
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
  RAISE NOTICE 'secure link tokens applied';
END $$;

COMMIT;
