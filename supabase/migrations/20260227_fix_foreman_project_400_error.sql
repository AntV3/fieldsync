-- ============================================================
-- FIX: 20260227_fix_foreman_project_400_error
--
-- Root causes for authentication errors in the foreman project
-- login flow and foreman view:
--
-- 1. The companies table may block anonymous reads for the initial
--    company-code lookup if the "Public view companies by code"
--    permissive policy is missing.  We ensure it exists here.
--
-- 2. The punch_list_items table only had office (auth.uid()) RLS
--    policies, completely blocking foreman (anon + x-field-session)
--    users from reading or writing punch-list data.
--
-- 3. The validate_pin_and_create_session RPC must be accessible
--    to the anon role and must handle case-insensitive company code
--    matching to avoid spurious "INVALID_COMPANY" errors.
--
-- 4. All grants required by the foreman flow are re-applied so
--    that a fresh or partially-migrated database still works.
-- ============================================================

-- ============================================================
-- PART 1: Companies — ensure anonymous read access for login
-- The foreman must look up a company by its code BEFORE a field
-- session exists, so the anon role needs SELECT on companies.
-- ============================================================

-- Keep or re-create the permissive "anyone can look up a company
-- by code" policy that the initial onboarding migration added.
-- This coexists with the session-scoped "Secure field view companies"
-- policy; PostgreSQL grants access when ANY permissive policy passes.
DROP POLICY IF EXISTS "Public view companies by code" ON companies;
CREATE POLICY "Public view companies by code"
  ON companies FOR SELECT
  USING (true);

-- Ensure the anon role has the privilege to attempt the SELECT.
GRANT SELECT ON companies TO anon;

-- ============================================================
-- PART 2: Punch list — add field-session-based access policies
-- The original migration_punch_list.sql only checked auth.uid(),
-- which is NULL for foreman users.  We add dedicated anon policies
-- so foremanView can display and update punch-list counts.
-- ============================================================

-- SELECT
DROP POLICY IF EXISTS "Field users can view punch list"          ON punch_list_items;
DROP POLICY IF EXISTS "Secure field view punch list"             ON punch_list_items;
CREATE POLICY "Secure field view punch list"
  ON punch_list_items FOR SELECT
  USING (can_access_project(project_id));

-- INSERT
DROP POLICY IF EXISTS "Field users can create punch list items"  ON punch_list_items;
DROP POLICY IF EXISTS "Secure field create punch list items"     ON punch_list_items;
CREATE POLICY "Secure field create punch list items"
  ON punch_list_items FOR INSERT
  WITH CHECK (can_access_project(project_id));

-- UPDATE
DROP POLICY IF EXISTS "Field users can update punch list items"  ON punch_list_items;
DROP POLICY IF EXISTS "Secure field update punch list items"     ON punch_list_items;
CREATE POLICY "Secure field update punch list items"
  ON punch_list_items FOR UPDATE
  USING     (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));

GRANT SELECT, INSERT, UPDATE ON punch_list_items TO anon;

-- ============================================================
-- PART 3: Re-apply validate_pin_and_create_session with
-- case-insensitive company code matching and safe rate-limit
-- handling when both p_ip_address and p_device_id are NULL.
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
      RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT,
                          NULL::UUID, NULL::TEXT, 'RATE_LIMITED'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Case-insensitive company code lookup
  SELECT * INTO found_company
  FROM companies c
  WHERE UPPER(TRIM(c.code)) = clean_code;

  IF NOT FOUND THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid_company');
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT,
                        NULL::UUID, NULL::TEXT, 'INVALID_COMPANY'::TEXT;
    RETURN;
  END IF;

  -- PIN lookup (case-sensitive, whitespace-trimmed)
  SELECT * INTO found_project
  FROM projects p
  WHERE TRIM(p.pin) = clean_pin
    AND p.company_id = found_company.id
    AND p.status     = 'active';

  IF NOT FOUND THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid');
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT,
                        NULL::UUID, NULL::TEXT, 'INVALID_PIN'::TEXT;
    RETURN;
  END IF;

  new_token := encode(gen_random_bytes(32), 'hex');

  -- Revoke existing sessions for this device+project
  IF p_device_id IS NOT NULL THEN
    DELETE FROM field_sessions
    WHERE device_id   = p_device_id
      AND project_id  = found_project.id;
  END IF;

  INSERT INTO field_sessions (project_id, company_id, session_token, device_id)
  VALUES (found_project.id, found_company.id, new_token, p_device_id);

  PERFORM log_auth_attempt(p_ip_address, p_device_id, TRUE, 'pin');

  RETURN QUERY SELECT
    true,
    new_token,
    found_project.id,
    found_project.name,
    found_company.id,
    found_company.name,
    NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_pin_and_create_session(TEXT, TEXT, TEXT, TEXT) TO anon;

-- ============================================================
-- PART 4: Re-apply grants for all tables foreman accesses
-- (Re-grants are idempotent — safe to run multiple times)
-- ============================================================

GRANT SELECT, INSERT, UPDATE ON t_and_m_tickets TO anon;
GRANT SELECT, INSERT         ON t_and_m_workers  TO anon;
GRANT SELECT, INSERT         ON t_and_m_items    TO anon;
GRANT SELECT, INSERT, UPDATE ON crew_checkins    TO anon;
GRANT SELECT, INSERT, UPDATE ON daily_reports    TO anon;
GRANT SELECT, INSERT, UPDATE,
             DELETE          ON disposal_loads   TO anon;
GRANT SELECT                 ON areas            TO anon;
GRANT SELECT                 ON projects         TO anon;
GRANT SELECT                 ON change_orders    TO anon;
GRANT SELECT                 ON materials_equipment TO anon;

-- ============================================================
-- PART 5: Ensure helper functions are executable by anon
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'extend_field_session') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION extend_field_session(TEXT) TO anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'invalidate_field_session') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION invalidate_field_session(TEXT) TO anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'can_access_project') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION can_access_project(UUID) TO anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION can_access_project(UUID) TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'validate_field_session') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION validate_field_session(UUID) TO anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION validate_field_session(UUID) TO authenticated';
  END IF;
END $$;

DO $$
BEGIN
  RAISE NOTICE 'FIX APPLIED: 20260227_fix_foreman_project_400_error';
  RAISE NOTICE '1. companies: Public view policy ensured for anonymous company-code lookup';
  RAISE NOTICE '2. punch_list_items: Field-session-based SELECT/INSERT/UPDATE policies added';
  RAISE NOTICE '3. validate_pin_and_create_session: Recreated with case-insensitive code match';
  RAISE NOTICE '4. Grants re-applied for all tables accessed in the foreman view';
  RAISE NOTICE '5. Helper function grants re-applied for anon role';
END $$;
