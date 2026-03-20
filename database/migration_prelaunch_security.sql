-- ============================================================
-- PRE-LAUNCH SECURITY MIGRATION
-- ============================================================
-- Run this in Supabase SQL Editor BEFORE launching to production.
--
-- This migration fixes the rate-limiting NULL bypass and provides
-- verification queries to confirm all critical security policies
-- are correctly applied.
--
-- PREREQUISITES (apply in order):
--   1. supabase/migrations/20260218_secure_field_rls.sql
--      (Removes dangerous auth.uid() IS NULL RLS policies)
--   2. database/migration_launch_security.sql
--      (Fixes photo bucket access policies)
--   3. THIS FILE
-- ============================================================

-- ============================================================
-- 1. FIX: check_rate_limit() NULL bypass
-- ============================================================
-- When both p_ip_address AND p_device_id are NULL, the WHERE clause
-- (ip_address = NULL OR device_id = NULL) never matches any rows,
-- so recent_failures is always 0 and rate limiting is bypassed.
-- Fix: fail-closed when both identifiers are missing.

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_ip_address TEXT,
  p_device_id TEXT,
  p_window_minutes INTEGER DEFAULT 15,
  p_max_attempts INTEGER DEFAULT 5
) RETURNS BOOLEAN AS $$
DECLARE
  recent_failures INTEGER;
BEGIN
  -- Fail-closed: if we have no way to identify the client, deny access
  IF p_ip_address IS NULL AND p_device_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT COUNT(*) INTO recent_failures
  FROM auth_attempts
  WHERE (
    (p_ip_address IS NOT NULL AND ip_address = p_ip_address)
    OR
    (p_device_id IS NOT NULL AND device_id = p_device_id)
  )
    AND success = FALSE
    AND created_at > NOW() - (p_window_minutes || ' minutes')::INTERVAL;

  RETURN recent_failures < p_max_attempts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. VERIFICATION QUERIES
-- ============================================================
-- Run these SELECT statements after applying all migrations to
-- confirm the database is secure. Each should return 0 rows.

-- Check 1: No RLS policies should use auth.uid() IS NULL
-- (This grants anonymous access, which is the primary vulnerability)
DO $$
DECLARE
  bad_policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO bad_policy_count
  FROM pg_policies
  WHERE qual::text ILIKE '%auth.uid()%IS%NULL%'
    AND qual::text NOT ILIKE '%IS NOT NULL%';

  IF bad_policy_count > 0 THEN
    RAISE WARNING 'SECURITY: Found % RLS policies using auth.uid() IS NULL — these grant anonymous access!', bad_policy_count;
  ELSE
    RAISE NOTICE 'OK: No dangerous auth.uid() IS NULL policies found.';
  END IF;
END $$;

-- Check 2: Verify field_sessions table exists (required for session-based auth)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'field_sessions') THEN
    RAISE WARNING 'SECURITY: field_sessions table does not exist — apply migration_field_sessions.sql first!';
  ELSE
    RAISE NOTICE 'OK: field_sessions table exists.';
  END IF;
END $$;

-- Check 3: Verify rate limit function works with NULL identifiers
DO $$
DECLARE
  result BOOLEAN;
BEGIN
  SELECT check_rate_limit(NULL, NULL) INTO result;
  IF result = TRUE THEN
    RAISE WARNING 'SECURITY: check_rate_limit(NULL, NULL) returned TRUE — rate limiting is bypassable!';
  ELSE
    RAISE NOTICE 'OK: check_rate_limit correctly denies NULL identifiers.';
  END IF;
END $$;

-- ============================================================
-- SUCCESS
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'PRE-LAUNCH SECURITY MIGRATION COMPLETE';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Applied:';
  RAISE NOTICE '  1. Fixed check_rate_limit() NULL bypass (fail-closed)';
  RAISE NOTICE '  2. Ran 3 verification checks (see warnings above if any)';
  RAISE NOTICE '';
  RAISE NOTICE 'If any WARNING messages appeared above, resolve them before launch.';
  RAISE NOTICE '';
END $$;
