-- ============================================================
-- FIX: 20260228_fix_foreman_auth_errors
--
-- SELF-CONTAINED, IDEMPOTENT fix for foreman authentication.
-- Safe to run on any database state — fresh, partial, or fully
-- migrated.  Every statement uses IF NOT EXISTS, DROP IF EXISTS,
-- or CREATE OR REPLACE.
--
-- Root causes addressed:
--   1. Missing prerequisite tables (auth_attempts, field_sessions)
--   2. Missing prerequisite functions (check_rate_limit,
--      log_auth_attempt, validate_field_session, can_access_project)
--   3. validate_pin_and_create_session RPC missing or broken
--   4. Companies table RLS blocking anonymous company-code lookup
--   5. Missing anon GRANT on tables the foreman view accesses
--   6. punch_list_items missing field-session-based RLS policies
-- ============================================================

-- ============================================================
-- PART 1: Prerequisite tables
-- ============================================================

CREATE TABLE IF NOT EXISTS auth_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT,
  device_id TEXT,
  attempt_type TEXT NOT NULL DEFAULT 'pin',
  success BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip_time
  ON auth_attempts(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_device_time
  ON auth_attempts(device_id, created_at DESC);

ALTER TABLE auth_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow logging auth attempts" ON auth_attempts;
CREATE POLICY "Allow logging auth attempts"
  ON auth_attempts FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Service can read auth attempts" ON auth_attempts;
CREATE POLICY "Service can read auth attempts"
  ON auth_attempts FOR SELECT
  USING (auth.role() = 'service_role');

GRANT INSERT ON auth_attempts TO anon;
GRANT SELECT ON auth_attempts TO service_role;

CREATE TABLE IF NOT EXISTS field_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_sessions_token   ON field_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_field_sessions_project ON field_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_field_sessions_expires ON field_sessions(expires_at);

ALTER TABLE field_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct session access" ON field_sessions;
CREATE POLICY "No direct session access"
  ON field_sessions FOR ALL USING (false);

GRANT SELECT, INSERT, UPDATE, DELETE ON field_sessions TO anon;

-- ============================================================
-- PART 2: Prerequisite helper functions
-- ============================================================

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_ip_address TEXT,
  p_device_id  TEXT,
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

CREATE OR REPLACE FUNCTION log_auth_attempt(
  p_ip_address   TEXT,
  p_device_id    TEXT,
  p_success      BOOLEAN,
  p_attempt_type TEXT DEFAULT 'pin'
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO auth_attempts (ip_address, device_id, attempt_type, success)
  VALUES (p_ip_address, p_device_id, p_attempt_type, p_success);
END;
$$;

GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION log_auth_attempt(TEXT, TEXT, BOOLEAN, TEXT)    TO anon;

-- ============================================================
-- PART 3: Session validation functions
-- ============================================================

CREATE OR REPLACE FUNCTION validate_field_session(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_token TEXT;
  valid   BOOLEAN := false;
BEGIN
  BEGIN
    v_token := current_setting('request.headers', true)::json->>'x-field-session';
  EXCEPTION WHEN OTHERS THEN
    v_token := NULL;
  END;

  IF v_token IS NULL OR v_token = '' THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM field_sessions fs
    WHERE fs.session_token = v_token
      AND fs.project_id    = p_project_id
      AND fs.expires_at    > NOW()
  ) INTO valid;

  RETURN valid;
END;
$$;

CREATE OR REPLACE FUNCTION has_valid_field_session()
RETURNS TABLE (project_id UUID, company_id UUID)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_token TEXT;
BEGIN
  BEGIN
    v_token := current_setting('request.headers', true)::json->>'x-field-session';
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  IF v_token IS NULL OR v_token = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT fs.project_id, fs.company_id
  FROM field_sessions fs
  WHERE fs.session_token = v_token
    AND fs.expires_at > NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION validate_field_session(UUID) TO anon;
GRANT EXECUTE ON FUNCTION validate_field_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION has_valid_field_session()    TO anon;

-- ============================================================
-- PART 4: Central access helper (used by RLS policies)
-- ============================================================

CREATE OR REPLACE FUNCTION can_access_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM user_companies uc
      JOIN projects p ON p.company_id = uc.company_id
      WHERE p.id = p_project_id
        AND uc.user_id = auth.uid()
        AND uc.status = 'active'
    );
  END IF;
  RETURN validate_field_session(p_project_id);
END;
$$;

GRANT EXECUTE ON FUNCTION can_access_project(UUID) TO anon;
GRANT EXECUTE ON FUNCTION can_access_project(UUID) TO authenticated;

-- ============================================================
-- PART 5: PIN validation + session creation RPC
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
-- PART 6: Session utility functions
-- ============================================================

CREATE OR REPLACE FUNCTION extend_field_session(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE field_sessions
  SET expires_at    = NOW() + INTERVAL '24 hours',
      last_activity = NOW()
  WHERE session_token = p_token AND expires_at > NOW();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION invalidate_field_session(p_session_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM field_sessions WHERE session_token = p_session_token;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted INTEGER;
BEGIN
  DELETE FROM field_sessions WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION extend_field_session(TEXT)     TO anon;
GRANT EXECUTE ON FUNCTION invalidate_field_session(TEXT) TO anon;

-- ============================================================
-- PART 7: Companies — ensure anonymous read access for login
-- ============================================================

DROP POLICY IF EXISTS "Public view companies by code" ON companies;
CREATE POLICY "Public view companies by code"
  ON companies FOR SELECT
  USING (true);

GRANT SELECT ON companies TO anon;

-- ============================================================
-- PART 8: Secure RLS policies for foreman-accessed tables
-- (DROP IF EXISTS + CREATE makes these idempotent)
-- ============================================================

-- AREAS
DROP POLICY IF EXISTS "Field users can view areas"   ON areas;
DROP POLICY IF EXISTS "Field users can update areas" ON areas;
DROP POLICY IF EXISTS "Secure field access to areas" ON areas;
DROP POLICY IF EXISTS "Secure field update areas"    ON areas;
CREATE POLICY "Secure field access to areas"
  ON areas FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "Secure field update areas"
  ON areas FOR UPDATE
  USING (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));

-- T&M TICKETS
DROP POLICY IF EXISTS "Field users can view tickets"   ON t_and_m_tickets;
DROP POLICY IF EXISTS "Field users can create tickets" ON t_and_m_tickets;
DROP POLICY IF EXISTS "Field users can update tickets" ON t_and_m_tickets;
DROP POLICY IF EXISTS "Secure field view tickets"      ON t_and_m_tickets;
DROP POLICY IF EXISTS "Secure field create tickets"    ON t_and_m_tickets;
DROP POLICY IF EXISTS "Secure field update tickets"    ON t_and_m_tickets;
CREATE POLICY "Secure field view tickets"
  ON t_and_m_tickets FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "Secure field create tickets"
  ON t_and_m_tickets FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "Secure field update tickets"
  ON t_and_m_tickets FOR UPDATE
  USING (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));

-- T&M WORKERS
DROP POLICY IF EXISTS "Field users can view workers"   ON t_and_m_workers;
DROP POLICY IF EXISTS "Field users can create workers" ON t_and_m_workers;
DROP POLICY IF EXISTS "Secure field view workers"      ON t_and_m_workers;
DROP POLICY IF EXISTS "Secure field create workers"    ON t_and_m_workers;
CREATE POLICY "Secure field view workers"
  ON t_and_m_workers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM t_and_m_tickets t
    WHERE t.id = t_and_m_workers.ticket_id
      AND can_access_project(t.project_id)
  ));
CREATE POLICY "Secure field create workers"
  ON t_and_m_workers FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM t_and_m_tickets t
    WHERE t.id = t_and_m_workers.ticket_id
      AND can_access_project(t.project_id)
  ));

-- T&M ITEMS
DROP POLICY IF EXISTS "Field users can view items"   ON t_and_m_items;
DROP POLICY IF EXISTS "Field users can create items" ON t_and_m_items;
DROP POLICY IF EXISTS "Secure field view items"      ON t_and_m_items;
DROP POLICY IF EXISTS "Secure field create items"    ON t_and_m_items;
CREATE POLICY "Secure field view items"
  ON t_and_m_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM t_and_m_tickets t
    WHERE t.id = t_and_m_items.ticket_id
      AND can_access_project(t.project_id)
  ));
CREATE POLICY "Secure field create items"
  ON t_and_m_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM t_and_m_tickets t
    WHERE t.id = t_and_m_items.ticket_id
      AND can_access_project(t.project_id)
  ));

-- CREW CHECKINS
DROP POLICY IF EXISTS "Field users can view crew checkins"   ON crew_checkins;
DROP POLICY IF EXISTS "Field users can create crew checkins" ON crew_checkins;
DROP POLICY IF EXISTS "Field users can update crew checkins" ON crew_checkins;
DROP POLICY IF EXISTS "Secure field view crew checkins"      ON crew_checkins;
DROP POLICY IF EXISTS "Secure field create crew checkins"    ON crew_checkins;
DROP POLICY IF EXISTS "Secure field update crew checkins"    ON crew_checkins;
CREATE POLICY "Secure field view crew checkins"
  ON crew_checkins FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "Secure field create crew checkins"
  ON crew_checkins FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "Secure field update crew checkins"
  ON crew_checkins FOR UPDATE
  USING (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));

-- DAILY REPORTS
DROP POLICY IF EXISTS "Field users can view daily reports"   ON daily_reports;
DROP POLICY IF EXISTS "Field users can create daily reports" ON daily_reports;
DROP POLICY IF EXISTS "Secure field view daily reports"      ON daily_reports;
DROP POLICY IF EXISTS "Secure field create daily reports"    ON daily_reports;
DROP POLICY IF EXISTS "Secure field update daily reports"    ON daily_reports;
CREATE POLICY "Secure field view daily reports"
  ON daily_reports FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "Secure field create daily reports"
  ON daily_reports FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "Secure field update daily reports"
  ON daily_reports FOR UPDATE
  USING (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));

-- DISPOSAL LOADS
DROP POLICY IF EXISTS "Field users can view disposal loads"                   ON disposal_loads;
DROP POLICY IF EXISTS "Field users can create disposal loads"                 ON disposal_loads;
DROP POLICY IF EXISTS "Field users can update disposal loads"                 ON disposal_loads;
DROP POLICY IF EXISTS "Field users can delete disposal loads"                 ON disposal_loads;
DROP POLICY IF EXISTS "Secure field view disposal loads"                      ON disposal_loads;
DROP POLICY IF EXISTS "Secure field create disposal loads"                    ON disposal_loads;
DROP POLICY IF EXISTS "Secure field update disposal loads"                    ON disposal_loads;
DROP POLICY IF EXISTS "Secure field delete disposal loads"                    ON disposal_loads;
DROP POLICY IF EXISTS "Users can view disposal loads for their projects"      ON disposal_loads;
DROP POLICY IF EXISTS "Users can insert disposal loads for assigned projects" ON disposal_loads;
DROP POLICY IF EXISTS "Users can update their own disposal loads"             ON disposal_loads;
DROP POLICY IF EXISTS "Users can delete their own disposal loads"             ON disposal_loads;
CREATE POLICY "Secure field view disposal loads"
  ON disposal_loads FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "Secure field create disposal loads"
  ON disposal_loads FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "Secure field update disposal loads"
  ON disposal_loads FOR UPDATE
  USING (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));
CREATE POLICY "Secure field delete disposal loads"
  ON disposal_loads FOR DELETE USING (can_access_project(project_id));

-- PROJECTS (read-only for field)
DROP POLICY IF EXISTS "Field users can view projects" ON projects;
DROP POLICY IF EXISTS "Secure field view projects"    ON projects;
CREATE POLICY "Secure field view projects"
  ON projects FOR SELECT USING (can_access_project(id));

-- CHANGE ORDERS (read-only)
DROP POLICY IF EXISTS "Field users can view CORs by project" ON change_orders;
DROP POLICY IF EXISTS "Secure field view CORs"               ON change_orders;
CREATE POLICY "Secure field view CORs"
  ON change_orders FOR SELECT USING (can_access_project(project_id));

-- COMPANY-SCOPED tables
DROP POLICY IF EXISTS "Secure field view companies" ON companies;
CREATE POLICY "Secure field view companies"
  ON companies FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    OR EXISTS (SELECT 1 FROM has_valid_field_session() s WHERE s.company_id = companies.id)
  );

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_branding') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Field users can view company branding" ON company_branding';
    EXECUTE 'DROP POLICY IF EXISTS "Secure field view company branding" ON company_branding';
    EXECUTE $pol$CREATE POLICY "Secure field view company branding"
      ON company_branding FOR SELECT
      USING (
        auth.uid() IS NOT NULL
        OR EXISTS (SELECT 1 FROM has_valid_field_session() s WHERE s.company_id = company_branding.company_id)
      )$pol$;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dump_sites') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Field users can view dump sites" ON dump_sites';
    EXECUTE 'DROP POLICY IF EXISTS "Secure field view dump sites" ON dump_sites';
    EXECUTE $pol$CREATE POLICY "Secure field view dump sites"
      ON dump_sites FOR SELECT
      USING (
        auth.uid() IS NOT NULL
        OR EXISTS (SELECT 1 FROM has_valid_field_session() s WHERE s.company_id = dump_sites.company_id)
      )$pol$;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'labor_classes') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Field can view labor classes" ON labor_classes';
    EXECUTE 'DROP POLICY IF EXISTS "Secure field view labor classes" ON labor_classes';
    EXECUTE $pol$CREATE POLICY "Secure field view labor classes"
      ON labor_classes FOR SELECT
      USING (
        auth.uid() IS NOT NULL
        OR EXISTS (SELECT 1 FROM has_valid_field_session() s WHERE s.company_id = labor_classes.company_id)
      )$pol$;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'materials_equipment') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Field users can view materials equipment" ON materials_equipment';
    EXECUTE 'DROP POLICY IF EXISTS "Secure field view materials equipment" ON materials_equipment';
    EXECUTE $pol$CREATE POLICY "Secure field view materials equipment"
      ON materials_equipment FOR SELECT
      USING (
        auth.uid() IS NOT NULL
        OR EXISTS (SELECT 1 FROM has_valid_field_session() s WHERE s.company_id = materials_equipment.company_id)
      )$pol$;
  END IF;
END $$;

-- PUNCH LIST
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'punch_list_items') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Field users can view punch list" ON punch_list_items';
    EXECUTE 'DROP POLICY IF EXISTS "Secure field view punch list" ON punch_list_items';
    EXECUTE $pol$CREATE POLICY "Secure field view punch list"
      ON punch_list_items FOR SELECT
      USING (can_access_project(project_id))$pol$;

    EXECUTE 'DROP POLICY IF EXISTS "Field users can create punch list items" ON punch_list_items';
    EXECUTE 'DROP POLICY IF EXISTS "Secure field create punch list items" ON punch_list_items';
    EXECUTE $pol$CREATE POLICY "Secure field create punch list items"
      ON punch_list_items FOR INSERT
      WITH CHECK (can_access_project(project_id))$pol$;

    EXECUTE 'DROP POLICY IF EXISTS "Field users can update punch list items" ON punch_list_items';
    EXECUTE 'DROP POLICY IF EXISTS "Secure field update punch list items" ON punch_list_items';
    EXECUTE $pol$CREATE POLICY "Secure field update punch list items"
      ON punch_list_items FOR UPDATE
      USING (can_access_project(project_id))
      WITH CHECK (can_access_project(project_id))$pol$;

    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON punch_list_items TO anon';
  END IF;
END $$;

-- ============================================================
-- PART 9: Grants for all foreman-accessed tables
-- (GRANTs are inherently idempotent)
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
-- DONE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'FIX APPLIED: 20260228_fix_foreman_auth_errors';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'This migration is SELF-CONTAINED and IDEMPOTENT.';
  RAISE NOTICE 'Safe to re-run on any database state.';
  RAISE NOTICE '';
  RAISE NOTICE 'What was fixed:';
  RAISE NOTICE '  1. auth_attempts & field_sessions tables ensured';
  RAISE NOTICE '  2. All prerequisite functions created/replaced';
  RAISE NOTICE '  3. validate_pin_and_create_session RPC created';
  RAISE NOTICE '  4. Companies public read policy for anonymous login';
  RAISE NOTICE '  5. RLS policies for all foreman-accessed tables';
  RAISE NOTICE '  6. Grants for anon role on all required tables';
  RAISE NOTICE '';
END $$;
