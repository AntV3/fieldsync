-- ============================================================
-- HOTFIX: Restore pgcrypto access for SECURITY DEFINER functions.
--
-- BUG:
--   20260423_harden_definer_search_path.sql set
--     search_path = public, pg_temp
--   on every SECURITY DEFINER function in the public schema.
--   Supabase installs pgcrypto in the `extensions` schema, so the
--   hardened search_path can no longer resolve crypt(), gen_salt(),
--   or gen_random_bytes(). PostgREST surfaces the Postgres 42883
--   error as HTTP 404 on the RPC endpoint, which is why PIN login
--   fails in production with:
--
--     POST /rest/v1/rpc/validate_pin_and_create_session  404
--     [PIN Auth] validate_pin_and_create_session RPC failed:
--       function crypt(text, text) does not exist
--     [Foreman Auth] PIN validation failed: Field login is
--       temporarily unavailable.
--
-- FIX:
--   Re-harden every SECURITY DEFINER function in the public schema
--   with search_path = public, extensions, pg_temp. Including
--   `extensions` lets pgcrypto (crypt, gen_salt, gen_random_bytes)
--   and any other Supabase-managed extension resolve, while keeping
--   the search_path deterministic and still shielded from pg_temp
--   shadowing (pg_temp stays last).
--
-- SAFETY:
--   - Metadata-only (no function bodies, no data rewritten).
--   - Idempotent; safe to re-run.
--   - `extensions` schema is created and managed by Supabase and is
--     always present on Supabase-hosted and CLI-based installs.
-- ============================================================

DO $$
DECLARE
  fn RECORD;
  altered_count INT := 0;
BEGIN
  FOR fn IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = TRUE  -- SECURITY DEFINER
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, extensions, pg_temp',
      fn.schema_name, fn.function_name, fn.args
    );
    altered_count := altered_count + 1;
  END LOOP;

  RAISE NOTICE 'Re-hardened % SECURITY DEFINER function(s) with SET search_path = public, extensions, pg_temp', altered_count;
END $$;

-- Verification query (run manually after apply):
--   SELECT n.nspname, p.proname,
--          pg_get_function_identity_arguments(p.oid) AS args,
--          p.proconfig
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.prosecdef = TRUE
--     AND (p.proconfig IS NULL OR NOT EXISTS (
--       SELECT 1 FROM unnest(p.proconfig) cfg
--       WHERE cfg = 'search_path=public, extensions, pg_temp'
--     ));
--   -- Should return zero rows after this migration.
--
-- Smoke test (should return success=false with INVALID_COMPANY, NOT
-- a 404 / crypt error):
--   SELECT * FROM validate_pin_and_create_session(
--     '0000', '__SMOKE_TEST__', 'smoke-device', NULL
--   );
