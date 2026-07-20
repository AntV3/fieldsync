-- ============================================================
-- DIAGNOSTIC: Check if all required objects exist for field sessions
-- Run this in Supabase SQL Editor to see what's missing
-- ============================================================

DO $$
DECLARE
    missing_items TEXT := '';
BEGIN
    -- Check tables
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'field_sessions') THEN
        missing_items := missing_items || E'\n  - TABLE: field_sessions';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'auth_attempts') THEN
        missing_items := missing_items || E'\n  - TABLE: auth_attempts (from security_hardening migration)';
    END IF;

    -- Check functions
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_rate_limit') THEN
        missing_items := missing_items || E'\n  - FUNCTION: check_rate_limit (from security_hardening migration)';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'log_auth_attempt') THEN
        missing_items := missing_items || E'\n  - FUNCTION: log_auth_attempt (from security_hardening migration)';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'validate_pin_and_create_session') THEN
        missing_items := missing_items || E'\n  - FUNCTION: validate_pin_and_create_session';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'validate_field_session') THEN
        missing_items := missing_items || E'\n  - FUNCTION: validate_field_session';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'can_access_project') THEN
        missing_items := missing_items || E'\n  - FUNCTION: can_access_project';
    END IF;

    -- Report results
    IF missing_items = '' THEN
        RAISE NOTICE E'\n============================================================';
        RAISE NOTICE 'ALL REQUIRED OBJECTS EXIST!';
        RAISE NOTICE E'============================================================\n';
    ELSE
        RAISE NOTICE E'\n============================================================';
        RAISE NOTICE 'MISSING OBJECTS DETECTED:%', missing_items;
        RAISE NOTICE E'\n============================================================';
        RAISE NOTICE 'Run migration_security_hardening.sql first, then migration_field_sessions.sql';
        RAISE NOTICE E'============================================================\n';
    END IF;
END $$;

-- Also show if validate_pin_and_create_session exists and its parameters
SELECT
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'validate_pin_and_create_session'
AND n.nspname = 'public';
