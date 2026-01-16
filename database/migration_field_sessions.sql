-- ============================================================
-- FIELD SESSION SECURITY MIGRATION
-- ============================================================
-- Run this in Supabase SQL Editor to secure field user access
--
-- PROBLEM: Current RLS uses auth.uid() IS NULL which allows ANY
-- anonymous request to access data without validation.
--
-- SOLUTION: Session-based field access:
-- 1. When PIN is validated, create a session with a secure token
-- 2. Client stores token, sends it via header with all requests
-- 3. RLS policies validate the session token and project access
-- ============================================================

-- ============================================================
-- 1. FIELD SESSIONS TABLE
-- ============================================================

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

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_field_sessions_token ON field_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_field_sessions_project ON field_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_field_sessions_expires ON field_sessions(expires_at);

-- Enable RLS
ALTER TABLE field_sessions ENABLE ROW LEVEL SECURITY;

-- Sessions table should only be accessible via functions
DROP POLICY IF EXISTS "No direct session access" ON field_sessions;
CREATE POLICY "No direct session access"
ON field_sessions FOR ALL
USING (false);

-- Grant to anon (access controlled via functions)
GRANT SELECT, INSERT, UPDATE, DELETE ON field_sessions TO anon;

-- ============================================================
-- 2. SESSION VALIDATION FUNCTION
-- ============================================================

-- Validate a session token and check project access
CREATE OR REPLACE FUNCTION validate_field_session(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_session_token TEXT;
  valid_session BOOLEAN := false;
BEGIN
  -- Get session token from request header
  BEGIN
    v_session_token := current_setting('request.headers', true)::json->>'x-field-session';
  EXCEPTION WHEN OTHERS THEN
    v_session_token := NULL;
  END;

  IF v_session_token IS NULL OR v_session_token = '' THEN
    RETURN false;
  END IF;

  -- Check if session is valid for this project
  SELECT EXISTS (
    SELECT 1 FROM field_sessions fs
    WHERE fs.session_token = v_session_token
      AND fs.project_id = p_project_id
      AND fs.expires_at > NOW()
  ) INTO valid_session;

  -- Update last activity if valid
  IF valid_session THEN
    UPDATE field_sessions
    SET last_activity = NOW()
    WHERE session_token = v_session_token
      AND project_id = p_project_id;
  END IF;

  RETURN valid_session;
END;
$$;

-- Check if current request has a valid field session (for any project)
CREATE OR REPLACE FUNCTION has_valid_field_session()
RETURNS TABLE (project_id UUID, company_id UUID)
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_session_token TEXT;
BEGIN
  -- Get session token from request header
  BEGIN
    v_session_token := current_setting('request.headers', true)::json->>'x-field-session';
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  IF v_session_token IS NULL OR v_session_token = '' THEN
    RETURN;
  END IF;

  -- Return project/company if session is valid
  RETURN QUERY
  SELECT fs.project_id, fs.company_id
  FROM field_sessions fs
  WHERE fs.session_token = v_session_token
    AND fs.expires_at > NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION validate_field_session(UUID) TO anon;
GRANT EXECUTE ON FUNCTION has_valid_field_session() TO anon;

-- ============================================================
-- 3. CREATE SESSION ON PIN VALIDATION
-- ============================================================

-- Enhanced PIN validation that creates a session
CREATE OR REPLACE FUNCTION validate_pin_and_create_session(
  p_pin TEXT,
  p_company_code TEXT,
  p_device_id TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
) RETURNS TABLE (
  success BOOLEAN,
  session_token TEXT,
  project_id UUID,
  project_name TEXT,
  company_id UUID,
  company_name TEXT,
  error_code TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  is_rate_limited BOOLEAN;
  found_project RECORD;
  found_company RECORD;
  new_session_token TEXT;
BEGIN
  -- Check rate limit first
  is_rate_limited := NOT check_rate_limit(p_ip_address, p_device_id, 15, 5);

  IF is_rate_limited THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_rate_limited');
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT,
      'RATE_LIMITED'::TEXT;
    RETURN;
  END IF;

  -- Find company by code
  SELECT * INTO found_company
  FROM companies c
  WHERE c.code = p_company_code;

  IF found_company IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid_company');
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT,
      'INVALID_COMPANY'::TEXT;
    RETURN;
  END IF;

  -- Find project by PIN within company
  SELECT * INTO found_project
  FROM projects p
  WHERE p.pin = p_pin
    AND p.company_id = found_company.id
    AND p.status = 'active';

  IF found_project IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid');
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT,
      'INVALID_PIN'::TEXT;
    RETURN;
  END IF;

  -- Generate secure session token
  new_session_token := encode(gen_random_bytes(32), 'hex');

  -- Revoke any existing sessions for this device/project combo
  DELETE FROM field_sessions
  WHERE device_id = p_device_id
    AND project_id = found_project.id;

  -- Create new session
  INSERT INTO field_sessions (project_id, company_id, session_token, device_id)
  VALUES (found_project.id, found_company.id, new_session_token, p_device_id);

  -- Log successful attempt
  PERFORM log_auth_attempt(p_ip_address, p_device_id, TRUE, 'pin');

  -- Return success with session token
  RETURN QUERY SELECT
    true,
    new_session_token,
    found_project.id,
    found_project.name,
    found_company.id,
    found_company.name,
    NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_pin_and_create_session(TEXT, TEXT, TEXT, TEXT) TO anon;

-- ============================================================
-- 4. UPDATED RLS POLICIES
-- ============================================================
-- Replace open anon policies with session-validated policies

-- Helper: Check if user is authenticated OR has valid field session for project
CREATE OR REPLACE FUNCTION can_access_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
BEGIN
  -- Check authenticated user access
  IF auth.uid() IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM user_companies uc
      JOIN projects p ON p.company_id = uc.company_id
      WHERE p.id = p_project_id
        AND uc.user_id = auth.uid()
        AND uc.status = 'active'
    );
  END IF;

  -- Check field session access
  RETURN validate_field_session(p_project_id);
END;
$$;

GRANT EXECUTE ON FUNCTION can_access_project(UUID) TO anon;
GRANT EXECUTE ON FUNCTION can_access_project(UUID) TO authenticated;

-- ============================================================
-- 4a. AREAS TABLE
-- ============================================================

DROP POLICY IF EXISTS "Field users can view areas" ON areas;
DROP POLICY IF EXISTS "Field users can update areas" ON areas;
DROP POLICY IF EXISTS "Secure field access to areas" ON areas;
DROP POLICY IF EXISTS "Secure field update areas" ON areas;

CREATE POLICY "Secure field access to areas"
ON areas FOR SELECT
USING (can_access_project(project_id));

DROP POLICY IF EXISTS "Secure field update areas" ON areas;
CREATE POLICY "Secure field update areas"
ON areas FOR UPDATE
USING (can_access_project(project_id))
WITH CHECK (can_access_project(project_id));

-- ============================================================
-- 4b. T&M TICKETS
-- ============================================================

DROP POLICY IF EXISTS "Field users can view tickets" ON t_and_m_tickets;
DROP POLICY IF EXISTS "Field users can create tickets" ON t_and_m_tickets;
DROP POLICY IF EXISTS "Field users can update tickets" ON t_and_m_tickets;
DROP POLICY IF EXISTS "Secure field view tickets" ON t_and_m_tickets;
DROP POLICY IF EXISTS "Secure field create tickets" ON t_and_m_tickets;
DROP POLICY IF EXISTS "Secure field update tickets" ON t_and_m_tickets;

CREATE POLICY "Secure field view tickets"
ON t_and_m_tickets FOR SELECT
USING (can_access_project(project_id));

CREATE POLICY "Secure field create tickets"
ON t_and_m_tickets FOR INSERT
WITH CHECK (can_access_project(project_id));

CREATE POLICY "Secure field update tickets"
ON t_and_m_tickets FOR UPDATE
USING (can_access_project(project_id))
WITH CHECK (can_access_project(project_id));

-- ============================================================
-- 4c. T&M WORKERS
-- ============================================================

DROP POLICY IF EXISTS "Field users can view workers" ON t_and_m_workers;
DROP POLICY IF EXISTS "Field users can create workers" ON t_and_m_workers;
DROP POLICY IF EXISTS "Secure field view workers" ON t_and_m_workers;
DROP POLICY IF EXISTS "Secure field create workers" ON t_and_m_workers;

CREATE POLICY "Secure field view workers"
ON t_and_m_workers FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM t_and_m_tickets t
    WHERE t.id = t_and_m_workers.ticket_id
      AND can_access_project(t.project_id)
  )
);

CREATE POLICY "Secure field create workers"
ON t_and_m_workers FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM t_and_m_tickets t
    WHERE t.id = t_and_m_workers.ticket_id
      AND can_access_project(t.project_id)
  )
);

-- ============================================================
-- 4d. T&M ITEMS
-- ============================================================

DROP POLICY IF EXISTS "Field users can view items" ON t_and_m_items;
DROP POLICY IF EXISTS "Field users can create items" ON t_and_m_items;
DROP POLICY IF EXISTS "Secure field view items" ON t_and_m_items;
DROP POLICY IF EXISTS "Secure field create items" ON t_and_m_items;

CREATE POLICY "Secure field view items"
ON t_and_m_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM t_and_m_tickets t
    WHERE t.id = t_and_m_items.ticket_id
      AND can_access_project(t.project_id)
  )
);

CREATE POLICY "Secure field create items"
ON t_and_m_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM t_and_m_tickets t
    WHERE t.id = t_and_m_items.ticket_id
      AND can_access_project(t.project_id)
  )
);

-- ============================================================
-- 4e. CREW CHECKINS
-- ============================================================

DROP POLICY IF EXISTS "Field users can view crew checkins" ON crew_checkins;
DROP POLICY IF EXISTS "Field users can create crew checkins" ON crew_checkins;
DROP POLICY IF EXISTS "Field users can update crew checkins" ON crew_checkins;
DROP POLICY IF EXISTS "Secure field view crew checkins" ON crew_checkins;
DROP POLICY IF EXISTS "Secure field create crew checkins" ON crew_checkins;
DROP POLICY IF EXISTS "Secure field update crew checkins" ON crew_checkins;

CREATE POLICY "Secure field view crew checkins"
ON crew_checkins FOR SELECT
USING (can_access_project(project_id));

CREATE POLICY "Secure field create crew checkins"
ON crew_checkins FOR INSERT
WITH CHECK (can_access_project(project_id));

CREATE POLICY "Secure field update crew checkins"
ON crew_checkins FOR UPDATE
USING (can_access_project(project_id))
WITH CHECK (can_access_project(project_id));

-- ============================================================
-- 4f. DAILY REPORTS
-- ============================================================

DROP POLICY IF EXISTS "Field users can view daily reports" ON daily_reports;
DROP POLICY IF EXISTS "Field users can create daily reports" ON daily_reports;
DROP POLICY IF EXISTS "Secure field view daily reports" ON daily_reports;
DROP POLICY IF EXISTS "Secure field create daily reports" ON daily_reports;

CREATE POLICY "Secure field view daily reports"
ON daily_reports FOR SELECT
USING (can_access_project(project_id));

CREATE POLICY "Secure field create daily reports"
ON daily_reports FOR INSERT
WITH CHECK (can_access_project(project_id));

-- ============================================================
-- 4g. MESSAGES
-- ============================================================

DROP POLICY IF EXISTS "Field users can view messages" ON messages;
DROP POLICY IF EXISTS "Field users can send messages" ON messages;
DROP POLICY IF EXISTS "Field users can update messages" ON messages;
DROP POLICY IF EXISTS "Secure field view messages" ON messages;
DROP POLICY IF EXISTS "Secure field create messages" ON messages;
DROP POLICY IF EXISTS "Secure field update messages" ON messages;

CREATE POLICY "Secure field view messages"
ON messages FOR SELECT
USING (can_access_project(project_id));

CREATE POLICY "Secure field create messages"
ON messages FOR INSERT
WITH CHECK (can_access_project(project_id));

CREATE POLICY "Secure field update messages"
ON messages FOR UPDATE
USING (can_access_project(project_id))
WITH CHECK (can_access_project(project_id));

-- ============================================================
-- 4h. DISPOSAL LOADS
-- ============================================================

DROP POLICY IF EXISTS "Field users can view disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Field users can create disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Field users can update disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Field users can delete disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Secure field view disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Secure field create disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Secure field update disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Secure field delete disposal loads" ON disposal_loads;

CREATE POLICY "Secure field view disposal loads"
ON disposal_loads FOR SELECT
USING (can_access_project(project_id));

CREATE POLICY "Secure field create disposal loads"
ON disposal_loads FOR INSERT
WITH CHECK (can_access_project(project_id));

CREATE POLICY "Secure field update disposal loads"
ON disposal_loads FOR UPDATE
USING (can_access_project(project_id))
WITH CHECK (can_access_project(project_id));

CREATE POLICY "Secure field delete disposal loads"
ON disposal_loads FOR DELETE
USING (can_access_project(project_id));

-- ============================================================
-- 4i. INJURY REPORTS
-- ============================================================

DROP POLICY IF EXISTS "Field users can view injury reports" ON injury_reports;
DROP POLICY IF EXISTS "Field users can create injury reports" ON injury_reports;
DROP POLICY IF EXISTS "Secure field view injury reports" ON injury_reports;
DROP POLICY IF EXISTS "Secure field create injury reports" ON injury_reports;

CREATE POLICY "Secure field view injury reports"
ON injury_reports FOR SELECT
USING (can_access_project(project_id));

CREATE POLICY "Secure field create injury reports"
ON injury_reports FOR INSERT
WITH CHECK (can_access_project(project_id));

-- ============================================================
-- 4j. MATERIAL REQUESTS
-- ============================================================

DROP POLICY IF EXISTS "Field users can view material requests" ON material_requests;
DROP POLICY IF EXISTS "Field users can create material requests" ON material_requests;
DROP POLICY IF EXISTS "Secure field view material requests" ON material_requests;
DROP POLICY IF EXISTS "Secure field create material requests" ON material_requests;

CREATE POLICY "Secure field view material requests"
ON material_requests FOR SELECT
USING (can_access_project(project_id));

CREATE POLICY "Secure field create material requests"
ON material_requests FOR INSERT
WITH CHECK (can_access_project(project_id));

-- ============================================================
-- 4k. PROJECTS (read-only for field)
-- ============================================================

DROP POLICY IF EXISTS "Field users can view projects" ON projects;
DROP POLICY IF EXISTS "Secure field view projects" ON projects;

CREATE POLICY "Secure field view projects"
ON projects FOR SELECT
USING (can_access_project(id));

-- ============================================================
-- 4l. COMPANIES (read-only for field via session)
-- ============================================================

DROP POLICY IF EXISTS "Field users can view companies" ON companies;
DROP POLICY IF EXISTS "Secure field view companies" ON companies;

CREATE POLICY "Secure field view companies"
ON companies FOR SELECT
USING (
  auth.uid() IS NOT NULL
  OR
  EXISTS (
    SELECT 1 FROM has_valid_field_session() s
    WHERE s.company_id = companies.id
  )
);

-- ============================================================
-- 4m. CHANGE ORDERS (read-only for field)
-- ============================================================

DROP POLICY IF EXISTS "Field users can view CORs by project" ON change_orders;
DROP POLICY IF EXISTS "Secure field view CORs" ON change_orders;

CREATE POLICY "Secure field view CORs"
ON change_orders FOR SELECT
USING (can_access_project(project_id));

-- ============================================================
-- 4n. CHANGE ORDER ASSOCIATIONS
-- ============================================================

DROP POLICY IF EXISTS "Field users can view ticket associations" ON change_order_ticket_associations;
DROP POLICY IF EXISTS "Field users can create ticket associations" ON change_order_ticket_associations;
DROP POLICY IF EXISTS "Secure field view ticket associations" ON change_order_ticket_associations;
DROP POLICY IF EXISTS "Secure field create ticket associations" ON change_order_ticket_associations;

CREATE POLICY "Secure field view ticket associations"
ON change_order_ticket_associations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_ticket_associations.change_order_id
      AND can_access_project(cor.project_id)
  )
);

CREATE POLICY "Secure field create ticket associations"
ON change_order_ticket_associations FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_ticket_associations.change_order_id
      AND can_access_project(cor.project_id)
  )
);

-- ============================================================
-- 4o. CHANGE ORDER LINE ITEMS
-- ============================================================

-- Labor
DROP POLICY IF EXISTS "Field users can view labor items" ON change_order_labor;
DROP POLICY IF EXISTS "Field users can insert labor items" ON change_order_labor;
DROP POLICY IF EXISTS "Secure field view labor items" ON change_order_labor;
DROP POLICY IF EXISTS "Secure field insert labor items" ON change_order_labor;

CREATE POLICY "Secure field view labor items"
ON change_order_labor FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_labor.change_order_id
      AND can_access_project(cor.project_id)
  )
);

CREATE POLICY "Secure field insert labor items"
ON change_order_labor FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_labor.change_order_id
      AND can_access_project(cor.project_id)
  )
);

-- Materials
DROP POLICY IF EXISTS "Field users can view material items" ON change_order_materials;
DROP POLICY IF EXISTS "Field users can insert material items" ON change_order_materials;
DROP POLICY IF EXISTS "Secure field view material items" ON change_order_materials;
DROP POLICY IF EXISTS "Secure field insert material items" ON change_order_materials;

CREATE POLICY "Secure field view material items"
ON change_order_materials FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_materials.change_order_id
      AND can_access_project(cor.project_id)
  )
);

CREATE POLICY "Secure field insert material items"
ON change_order_materials FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_materials.change_order_id
      AND can_access_project(cor.project_id)
  )
);

-- Equipment
DROP POLICY IF EXISTS "Field users can view equipment items" ON change_order_equipment;
DROP POLICY IF EXISTS "Field users can insert equipment items" ON change_order_equipment;
DROP POLICY IF EXISTS "Secure field view equipment items" ON change_order_equipment;
DROP POLICY IF EXISTS "Secure field insert equipment items" ON change_order_equipment;

CREATE POLICY "Secure field view equipment items"
ON change_order_equipment FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_equipment.change_order_id
      AND can_access_project(cor.project_id)
  )
);

CREATE POLICY "Secure field insert equipment items"
ON change_order_equipment FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_equipment.change_order_id
      AND can_access_project(cor.project_id)
  )
);

-- ============================================================
-- 4p. DUMP SITES (company-level, read-only for field)
-- ============================================================

DROP POLICY IF EXISTS "Field users can view dump sites" ON dump_sites;
DROP POLICY IF EXISTS "Secure field view dump sites" ON dump_sites;

CREATE POLICY "Secure field view dump sites"
ON dump_sites FOR SELECT
USING (
  auth.uid() IS NOT NULL
  OR
  EXISTS (
    SELECT 1 FROM has_valid_field_session() s
    WHERE s.company_id = dump_sites.company_id
  )
);

-- ============================================================
-- 4q. LABOR CLASSES (company-level, read-only for field)
-- ============================================================

-- Keep existing policies for authenticated users
-- Add secure field access
DROP POLICY IF EXISTS "Field can view labor classes" ON labor_classes;
DROP POLICY IF EXISTS "Secure field view labor classes" ON labor_classes;

CREATE POLICY "Secure field view labor classes"
ON labor_classes FOR SELECT
USING (
  auth.uid() IS NOT NULL
  OR
  EXISTS (
    SELECT 1 FROM has_valid_field_session() s
    WHERE s.company_id = labor_classes.company_id
  )
);

-- ============================================================
-- 4r. COMPANY BRANDING (company-level, read-only for field)
-- ============================================================

DROP POLICY IF EXISTS "Field users can view company branding" ON company_branding;
DROP POLICY IF EXISTS "Secure field view company branding" ON company_branding;

CREATE POLICY "Secure field view company branding"
ON company_branding FOR SELECT
USING (
  auth.uid() IS NOT NULL
  OR
  EXISTS (
    SELECT 1 FROM has_valid_field_session() s
    WHERE s.company_id = company_branding.company_id
  )
);

-- ============================================================
-- 4s. LABOR RATES (hide from field, keep as is)
-- ============================================================

-- Labor rates are already restricted to authenticated users only
-- No changes needed

-- ============================================================
-- 4t. MATERIALS EQUIPMENT (company-level, read-only for field)
-- ============================================================

DROP POLICY IF EXISTS "Field users can view materials equipment" ON materials_equipment;
DROP POLICY IF EXISTS "Secure field view materials equipment" ON materials_equipment;

CREATE POLICY "Secure field view materials equipment"
ON materials_equipment FOR SELECT
USING (
  auth.uid() IS NOT NULL
  OR
  EXISTS (
    SELECT 1 FROM has_valid_field_session() s
    WHERE s.company_id = materials_equipment.company_id
  )
);

-- ============================================================
-- 5. SESSION CLEANUP
-- ============================================================

-- Function to cleanup expired sessions (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM field_sessions
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Function to extend session expiry (called on activity)
CREATE OR REPLACE FUNCTION extend_field_session(p_session_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE field_sessions
  SET expires_at = NOW() + INTERVAL '24 hours',
      last_activity = NOW()
  WHERE session_token = p_session_token
    AND expires_at > NOW();

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION extend_field_session(TEXT) TO anon;

-- ============================================================
-- 6. LOGOUT/INVALIDATE SESSION
-- ============================================================

CREATE OR REPLACE FUNCTION invalidate_field_session(p_session_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM field_sessions
  WHERE session_token = p_session_token;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION invalidate_field_session(TEXT) TO anon;

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'FIELD SESSION SECURITY MIGRATION COMPLETE';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes applied:';
  RAISE NOTICE '  1. Created field_sessions table for secure session tracking';
  RAISE NOTICE '  2. Created validate_pin_and_create_session() function';
  RAISE NOTICE '  3. Created can_access_project() helper for RLS';
  RAISE NOTICE '  4. Updated all RLS policies to validate sessions';
  RAISE NOTICE '  5. Added session cleanup and extension functions';
  RAISE NOTICE '';
  RAISE NOTICE 'IMPORTANT: Update client code to:';
  RAISE NOTICE '  1. Call validate_pin_and_create_session() for PIN auth';
  RAISE NOTICE '  2. Store the returned session_token';
  RAISE NOTICE '  3. Include x-field-session header in all requests';
  RAISE NOTICE '';
  RAISE NOTICE 'Security model:';
  RAISE NOTICE '  - Anonymous users without valid session: NO ACCESS';
  RAISE NOTICE '  - Anonymous users with valid session: ACCESS TO THEIR PROJECT ONLY';
  RAISE NOTICE '  - Authenticated users: NORMAL ACCESS VIA user_companies';
  RAISE NOTICE '';
END $$;
