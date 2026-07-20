-- ============================================
-- CRITICAL SECURITY FIXES
-- ============================================
-- Fixes: S3 (USING(true) RLS), S6 (signup trigger role injection),
--         S9 (cross-tenant signatures), S16 (office_only docs)
--
-- Run this migration AFTER schema.sql and schema_v2.sql.
-- Always test in a staging environment first.
-- ============================================

BEGIN;

-- ============================================
-- S6: Fix signup trigger to ignore user-supplied role
-- The old trigger reads raw_user_meta_data->>'role' from client metadata,
-- allowing attackers to self-assign admin/elevated roles at signup.
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'member'  -- SECURITY: Always default to 'member'. Role elevation requires admin action.
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- S3: Replace USING(true) RLS policies on projects and areas
-- These open policies allow ANY role (including anon) unrestricted access.
-- Replace with company-scoped policies.
-- ============================================

-- Projects: only company members can access
DROP POLICY IF EXISTS "Allow all operations on projects" ON projects;
DROP POLICY IF EXISTS "Allow project view for field" ON projects;

CREATE POLICY "projects_company_member_select" ON projects
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM field_sessions
      WHERE field_sessions.project_id = projects.id
        AND field_sessions.token = current_setting('request.headers', true)::json->>'x-field-session'
        AND field_sessions.is_active = true
        AND field_sessions.expires_at > now()
    )
  );

CREATE POLICY "projects_company_member_insert" ON projects
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "projects_company_member_update" ON projects
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "projects_company_member_delete" ON projects
  FOR DELETE USING (
    company_id IN (
      SELECT company_id FROM user_companies
      WHERE user_id = auth.uid() AND access_level = 'administrator'
    )
  );

-- Areas: only company members can access (via project)
DROP POLICY IF EXISTS "Allow all operations on areas" ON areas;

CREATE POLICY "areas_via_project_select" ON areas
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM projects WHERE company_id IN (
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM field_sessions
      WHERE field_sessions.project_id = areas.project_id
        AND field_sessions.token = current_setting('request.headers', true)::json->>'x-field-session'
        AND field_sessions.is_active = true
        AND field_sessions.expires_at > now()
    )
  );

CREATE POLICY "areas_via_project_modify" ON areas
  FOR ALL USING (
    project_id IN (
      SELECT id FROM projects WHERE company_id IN (
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM field_sessions
      WHERE field_sessions.project_id = areas.project_id
        AND field_sessions.token = current_setting('request.headers', true)::json->>'x-field-session'
        AND field_sessions.is_active = true
        AND field_sessions.expires_at > now()
    )
  );

-- ============================================
-- S9: Fix cross-tenant signature leakage
-- Signatures should only be visible to members of the same company.
-- ============================================

DROP POLICY IF EXISTS "Authenticated users can read signatures" ON signatures;
DROP POLICY IF EXISTS "signatures_authenticated_select" ON signatures;

CREATE POLICY "signatures_company_scoped_select" ON signatures
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM field_sessions
      WHERE field_sessions.company_id = signatures.company_id
        AND field_sessions.token = current_setting('request.headers', true)::json->>'x-field-session'
        AND field_sessions.is_active = true
        AND field_sessions.expires_at > now()
    )
  );

-- ============================================
-- S16: Fix office_only document visibility
-- Current check is: access_level IN ('member', 'administrator') OR IS NULL
-- which is equivalent to true. Fix to require administrator only.
-- ============================================

DROP POLICY IF EXISTS "documents_office_only_select" ON documents;

-- Recreate: office_only documents require administrator access level
CREATE POLICY "documents_visibility_select" ON documents
  FOR SELECT USING (
    -- Non-office-only documents: any company member
    (
      NOT COALESCE(office_only, false)
      AND project_id IN (
        SELECT id FROM projects WHERE company_id IN (
          SELECT company_id FROM user_companies WHERE user_id = auth.uid()
        )
      )
    )
    OR
    -- Office-only documents: administrators only
    (
      COALESCE(office_only, false)
      AND project_id IN (
        SELECT id FROM projects WHERE company_id IN (
          SELECT company_id FROM user_companies
          WHERE user_id = auth.uid() AND access_level = 'administrator'
        )
      )
    )
  );

-- ============================================
-- S2: Make project-documents bucket private
-- Documents should only be accessible via signed URLs.
-- ============================================

UPDATE storage.buckets
SET public = false
WHERE name = 'project-documents';

COMMIT;
