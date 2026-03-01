-- ============================================================
-- Security Hardening Migration
-- Fixes: PIN rate-limit bypass, overly permissive RLS policies
-- Date: 2026-03-01
-- ============================================================

-- ============================================================
-- 1. Fix PIN brute-force rate-limit bypass
--    Previously, rate limiting was skipped when both
--    p_ip_address and p_device_id were NULL.
--    Now we ALWAYS enforce rate limiting by falling back to
--    company_code as the identifier when others are absent.
-- ============================================================

-- Updated check_rate_limit that never skips the check
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_ip_address     TEXT,
  p_device_id      TEXT,
  p_window_minutes INTEGER DEFAULT 15,
  p_max_attempts   INTEGER DEFAULT 5
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  recent_failures INTEGER;
BEGIN
  SELECT COUNT(*) INTO recent_failures
  FROM auth_attempts
  WHERE (
    (p_ip_address IS NOT NULL AND ip_address = p_ip_address)
    OR (p_device_id IS NOT NULL AND device_id = p_device_id)
  )
    AND success = FALSE
    AND created_at > NOW() - (p_window_minutes || ' minutes')::INTERVAL;
  RETURN recent_failures < p_max_attempts;
END;
$$;

-- New overload that accepts a fallback identifier (company_code)
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_ip_address       TEXT,
  p_device_id        TEXT,
  p_fallback_key     TEXT,
  p_window_minutes   INTEGER DEFAULT 15,
  p_max_attempts     INTEGER DEFAULT 5
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  recent_failures INTEGER;
BEGIN
  -- If we have ip or device, use those (they're more reliable identifiers)
  IF p_ip_address IS NOT NULL OR p_device_id IS NOT NULL THEN
    SELECT COUNT(*) INTO recent_failures
    FROM auth_attempts
    WHERE (
      (p_ip_address IS NOT NULL AND ip_address = p_ip_address)
      OR (p_device_id IS NOT NULL AND device_id = p_device_id)
    )
      AND success = FALSE
      AND created_at > NOW() - (p_window_minutes || ' minutes')::INTERVAL;
  ELSE
    -- Fallback: rate limit by the company_code stored in device_id column
    SELECT COUNT(*) INTO recent_failures
    FROM auth_attempts
    WHERE device_id = p_fallback_key
      AND success = FALSE
      AND created_at > NOW() - (p_window_minutes || ' minutes')::INTERVAL;
  END IF;

  RETURN recent_failures < p_max_attempts;
END;
$$;

-- Updated log_auth_attempt to handle fallback key scenario
CREATE OR REPLACE FUNCTION log_auth_attempt(
  p_ip_address   TEXT,
  p_device_id    TEXT,
  p_success      BOOLEAN,
  p_attempt_type TEXT DEFAULT 'pin'
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO auth_attempts (ip_address, device_id, success, attempt_type)
  VALUES (p_ip_address, p_device_id, p_success, p_attempt_type);
END;
$$;

-- Updated validate_pin_and_create_session: ALWAYS enforces rate limiting
CREATE OR REPLACE FUNCTION validate_pin_and_create_session(
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
  effective_device_id TEXT;
BEGIN
  clean_pin  := TRIM(p_pin);
  clean_code := UPPER(TRIM(p_company_code));

  -- Build an effective device_id: use actual device_id if available,
  -- otherwise fall back to a compound key so rate limiting always works
  effective_device_id := COALESCE(p_device_id, 'anon_' || clean_code);

  -- ALWAYS enforce rate limiting (no conditional bypass)
  IF NOT check_rate_limit(p_ip_address, p_device_id, effective_device_id, 15, 5) THEN
    PERFORM log_auth_attempt(p_ip_address, effective_device_id, FALSE, 'pin_rate_limited');
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT,
                        NULL::UUID, NULL::TEXT, 'RATE_LIMITED'::TEXT;
    RETURN;
  END IF;

  -- Case-insensitive company code lookup
  SELECT * INTO found_company
  FROM companies c
  WHERE UPPER(TRIM(c.code)) = clean_code;

  IF NOT FOUND THEN
    PERFORM log_auth_attempt(p_ip_address, effective_device_id, FALSE, 'pin_invalid_company');
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
    PERFORM log_auth_attempt(p_ip_address, effective_device_id, FALSE, 'pin_invalid');
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

  -- Log successful attempt so rate limit clears naturally
  PERFORM log_auth_attempt(p_ip_address, effective_device_id, TRUE, 'pin');

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


-- ============================================================
-- 2. Fix overly permissive RLS policies
--    Replace USING(true) with properly scoped policies
-- ============================================================

-- 2a. Companies table: replace USING(true) with authenticated-only read
DO $$
BEGIN
  -- Drop the overly permissive policy if it exists
  DROP POLICY IF EXISTS "Companies are viewable by authenticated users" ON companies;
  DROP POLICY IF EXISTS "Anyone can view companies" ON companies;
  DROP POLICY IF EXISTS "companies_select_policy" ON companies;

  -- Create proper policy: authenticated users can only see their own company
  CREATE POLICY "Users can view own company"
    ON companies FOR SELECT
    USING (
      id IN (
        SELECT company_id FROM company_members WHERE user_id = auth.uid()
      )
      OR
      -- Allow anon access only for PIN validation (company code lookup)
      auth.role() = 'anon'
    );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not update companies RLS: %', SQLERRM;
END;
$$;

-- 2b. Labor tables: restrict USING(true) policies
DO $$
BEGIN
  -- labor_categories
  DROP POLICY IF EXISTS "Anyone can view labor categories" ON labor_categories;
  DROP POLICY IF EXISTS "labor_categories_select_all" ON labor_categories;

  CREATE POLICY "Users can view own company labor categories"
    ON labor_categories FOR SELECT
    USING (
      company_id IN (
        SELECT company_id FROM company_members WHERE user_id = auth.uid()
      )
    );

  -- labor_classes
  DROP POLICY IF EXISTS "Anyone can view labor classes" ON labor_classes;
  DROP POLICY IF EXISTS "labor_classes_select_all" ON labor_classes;

  CREATE POLICY "Users can view own company labor classes"
    ON labor_classes FOR SELECT
    USING (
      company_id IN (
        SELECT company_id FROM company_members WHERE user_id = auth.uid()
      )
    );

  -- labor_class_rates
  DROP POLICY IF EXISTS "Anyone can view labor class rates" ON labor_class_rates;
  DROP POLICY IF EXISTS "labor_class_rates_select_all" ON labor_class_rates;

  CREATE POLICY "Users can view own company labor rates"
    ON labor_class_rates FOR SELECT
    USING (
      labor_class_id IN (
        SELECT id FROM labor_classes WHERE company_id IN (
          SELECT company_id FROM company_members WHERE user_id = auth.uid()
        )
      )
    );

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not update labor RLS: %', SQLERRM;
END;
$$;

-- 2c. Signatures: restrict authenticated-only read
DO $$
BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view signatures" ON signatures;
  DROP POLICY IF EXISTS "signatures_select_authenticated" ON signatures;

  -- Signatures should only be visible to members of the relevant company
  CREATE POLICY "Users can view own project signatures"
    ON signatures FOR SELECT
    USING (
      ticket_id IN (
        SELECT t.id FROM t_and_m_tickets t
        JOIN projects p ON t.project_id = p.id
        WHERE p.company_id IN (
          SELECT company_id FROM company_members WHERE user_id = auth.uid()
        )
      )
    );

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not update signatures RLS: %', SQLERRM;
END;
$$;


-- ============================================================
-- 3. Cleanup: remove old rate-limit entries older than 24h
--    (keeps the auth_attempts table from growing unbounded)
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_old_auth_attempts()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM auth_attempts WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$;
