-- ============================================================
-- SEC-H1: Harden every SECURITY DEFINER function with an explicit
-- search_path to prevent shadow-schema / search_path attacks.
--
-- Postgres advisory: every SECURITY DEFINER function should set a
-- deterministic search_path. Without one, a caller can prepend a
-- writable schema (e.g. pg_temp) to search_path and shadow built-in
-- or public objects, tricking the DEFINER function into calling
-- attacker-controlled code with elevated privileges.
--
-- Fix: set search_path = public, pg_temp on every SECURITY DEFINER
-- function in the public schema. This is metadata-only: no function
-- bodies are rewritten and no data is touched.
--
-- IDEMPOTENT — safe to re-run. Re-applies the same ALTER each time.
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
      pg_get_function_identity_arguments(p.oid) AS args,
      p.oid AS fn_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = TRUE  -- SECURITY DEFINER
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_temp',
      fn.schema_name, fn.function_name, fn.args
    );
    altered_count := altered_count + 1;
  END LOOP;

  RAISE NOTICE 'Hardened % SECURITY DEFINER function(s) with SET search_path = public, pg_temp', altered_count;
END $$;

-- Verification query (run manually):
--   SELECT n.nspname, p.proname,
--          pg_get_function_identity_arguments(p.oid) AS args,
--          p.proconfig
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.prosecdef = TRUE
--     AND (p.proconfig IS NULL OR NOT EXISTS (
--       SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'
--     ));
--   -- Should return zero rows after this migration.
