-- ============================================================
-- TENANT ISOLATION HARDENING
-- ============================================================
-- Generated against the LIVE database as read on 2026-11-11
-- (pg_policies, pg_get_functiondef and the table definitions the
-- owner exported). It closes the cross-company gaps found there:
--
--   1. 114 table policies that let anyone, any signed-in user, a
--      pending or removed member, or anyone who edits the company on
--      their own profile row read or change another company's data.
--      Each is dropped; where the app needs the access, a policy
--      scoped to ACTIVE members or to the caller's field session
--      replaces it.
--   2. RLS switched on for project_assignments and photo_upload_queue.
--   3. 20 storage policies: ticket photos and project documents
--      become readable only by the owning company (or the field
--      session / signing link that needs them); branding uploads only
--      by that company's administrators.
--   4. 27 SECURITY DEFINER functions that trusted an id passed by
--      the caller now check who is calling. repair_legacy_user() no
--      longer creates or re-activates memberships.
--   5. Internal and unused functions are no longer callable through
--      the API; a per-company cap on wrong field PINs.
--   6. Two server lookups for the public pages:
--      public_get_shared_project() and public_get_invitation().
--
-- DEPLOY THE APP FIRST (the build that sends the field session on
-- every field request and uses the two lookups above), then run this.
--
-- One transaction: it applies completely or not at all.
-- Rollback: supabase/rollbacks/20261113_tenant_isolation_hardening_rollback.sql
-- Tests:    supabase/tests/tenant_isolation_tests.sql
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. Preflight: stop before changing anything if this is not the
--    database the migration was written for.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_missing TEXT;
BEGIN
  SELECT string_agg(x, ', ') INTO v_missing
  FROM unnest(ARRAY[
    'public.can_access_project(uuid)', 'public.has_valid_field_session()',
    'public.validate_field_session(uuid)', 'public.is_company_admin(uuid)',
    'public.is_platform_admin()', 'public.user_company_ids()'
  ]) AS x
  WHERE to_regprocedure(x) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'tenant isolation: required function(s) missing: %', v_missing;
  END IF;

  SELECT string_agg(x, ', ') INTO v_missing
  FROM unnest(ARRAY[
    'user_companies', 'companies', 'projects', 'field_sessions', 'change_orders',
    't_and_m_tickets', 'project_shares', 'company_invitations', 'punch_list_items'
  ]) AS x
  WHERE to_regclass('public.' || x) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'tenant isolation: required table(s) missing: %', v_missing;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1. Helper functions
-- ------------------------------------------------------------
-- True when the request comes through the API (PostgREST sets the JWT
-- claims for every request, signed in or not). False in the SQL editor,
-- in cron jobs and for the service role, which are trusted.
CREATE OR REPLACE FUNCTION public.is_api_request()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  BEGIN
    v_role := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role';
  EXCEPTION WHEN OTHERS THEN
    RETURN true;
  END;
  IF v_role IS NULL THEN
    -- no claims at all: not an API request, unless the session role says so
    RETURN session_user IN ('anon', 'authenticated', 'authenticator');
  END IF;
  RETURN v_role <> 'service_role';
END;
$$;

-- The signed-in user is an ACTIVE member of the company.
CREATE OR REPLACE FUNCTION public.is_active_member(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND p_company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
      AND uc.company_id = p_company_id
      AND uc.status = 'active'
  );
$$;

-- An active member of the company, or a field (PIN) session that
-- belongs to one of the company's projects.
CREATE OR REPLACE FUNCTION public.can_access_company(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT p_company_id IS NOT NULL AND (
    public.is_active_member(p_company_id)
    OR (auth.uid() IS NULL AND EXISTS (
      SELECT 1 FROM public.has_valid_field_session() s WHERE s.company_id = p_company_id))
  );
$$;

-- Storage paths are <company id>/<project id>/...: an active member of
-- that company, or a field session for exactly that project.
CREATE OR REPLACE FUNCTION public.can_access_project_path(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  c_uuid CONSTANT TEXT := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_company TEXT := split_part(COALESCE(p_name, ''), '/', 1);
  v_project TEXT := split_part(COALESCE(p_name, ''), '/', 2);
BEGIN
  IF v_company !~ c_uuid OR v_project !~ c_uuid THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = v_project::uuid AND p.company_id = v_company::uuid) THEN
    RETURN false;
  END IF;
  RETURN COALESCE(public.can_access_project(v_project::uuid), false);
END;
$$;

-- Storage paths that start with <company id>/: an active member of that
-- company, or a field session of that company.
CREATE OR REPLACE FUNCTION public.can_access_company_path(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_company TEXT := split_part(COALESCE(p_name, ''), '/', 1);
BEGIN
  IF v_company !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN false;
  END IF;
  RETURN COALESCE(public.can_access_company(v_company::uuid), false);
END;
$$;

-- Branding images live at branding/<company id>/... in the "public"
-- bucket: only that company's administrators may write them.
CREATE OR REPLACE FUNCTION public.can_manage_branding_path(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company TEXT := split_part(COALESCE(p_name, ''), '/', 2);
BEGIN
  IF split_part(COALESCE(p_name, ''), '/', 1) <> 'branding'
     OR v_company !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN false;
  END IF;
  RETURN COALESCE(public.is_company_admin(v_company::uuid), false);
END;
$$;

REVOKE ALL ON FUNCTION public.is_api_request() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_company(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_project_path(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_company_path(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_branding_path(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_api_request() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_active_member(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_company(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_project_path(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_company_path(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_branding_path(TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 2. Public lookups for share links and invitations
-- ------------------------------------------------------------
-- What a share link is allowed to show, and nothing else. Replaces the
-- public page reading projects, areas, tickets and daily reports directly.
CREATE OR REPLACE FUNCTION public.public_get_shared_project(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_share   project_shares%ROWTYPE;
  v_project JSONB;
  v_perm    JSONB;
  v_areas   JSONB := '[]'::jsonb;
  v_reports JSONB := '[]'::jsonb;
  v_tickets JSONB := '[]'::jsonb;
  v_progress INTEGER := 0;
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 OR length(p_token) > 64 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_share FROM project_shares
  WHERE share_token = p_token
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now());
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
           'id', p.id, 'name', p.name, 'address', p.address, 'status', p.status,
           'job_number', p.job_number, 'general_contractor', p.general_contractor,
           'created_at', p.created_at, 'updated_at', p.updated_at)
  INTO v_project
  FROM projects p WHERE p.id = v_share.project_id;
  IF v_project IS NULL THEN
    RETURN NULL;
  END IF;

  v_perm := COALESCE(v_share.permissions, '{}'::jsonb);

  IF COALESCE((v_perm->>'progress')::boolean, false) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', a.id, 'name', a.name, 'group_name', a.group_name, 'status', a.status,
             'weight', a.weight, 'sort_order', a.sort_order) ORDER BY a.sort_order, a.name), '[]'::jsonb),
           COALESCE(round(100.0 * sum(COALESCE(a.weight, 0)) FILTER (WHERE a.status = 'done')
                          / NULLIF(sum(COALESCE(a.weight, 0)), 0)), 0)::int
    INTO v_areas, v_progress
    FROM areas a WHERE a.project_id = v_share.project_id;
  END IF;

  IF COALESCE((v_perm->>'daily_reports')::boolean, false) THEN
    SELECT COALESCE(jsonb_agg(r.o ORDER BY r.report_date DESC), '[]'::jsonb) INTO v_reports
    FROM (
      SELECT d.report_date, jsonb_build_object(
               'id', d.id, 'report_date', d.report_date, 'crew_count', d.crew_count,
               'tasks_completed', d.tasks_completed, 'tasks_total', d.tasks_total,
               'weather', d.weather, 'notes', d.field_notes, 'field_notes', d.field_notes,
               'work_description', d.work_description, 'status', d.status) AS o
      FROM daily_reports d
      WHERE d.project_id = v_share.project_id
      ORDER BY d.report_date DESC
      LIMIT 10
    ) r;
  END IF;

  IF COALESCE((v_perm->>'tm_tickets')::boolean, false) THEN
    SELECT COALESCE(jsonb_agg(t.o ORDER BY t.work_date DESC), '[]'::jsonb) INTO v_tickets
    FROM (
      SELECT k.work_date, jsonb_build_object(
               'id', k.id, 'work_date', k.work_date, 'status', k.status, 'notes', k.notes,
               'ce_pco_number', k.ce_pco_number) AS o
      FROM t_and_m_tickets k
      WHERE k.project_id = v_share.project_id
      ORDER BY k.work_date DESC
      LIMIT 200
    ) t;
  END IF;

  UPDATE project_shares
  SET view_count = COALESCE(view_count, 0) + 1, last_viewed_at = now()
  WHERE id = v_share.id;

  RETURN jsonb_build_object(
    'share', jsonb_build_object('id', v_share.id, 'project_id', v_share.project_id,
                                'permissions', v_perm, 'expires_at', v_share.expires_at),
    'project', v_project,
    'progress', v_progress,
    'areas', v_areas,
    'dailyReports', v_reports,
    'tmTickets', v_tickets
  );
END;
$$;

-- One invitation, looked up by its token. Replaces the policy that let
-- anyone list every active invitation (and so join any company).
CREATE OR REPLACE FUNCTION public.public_get_invitation(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inv  company_invitations%ROWTYPE;
  v_name TEXT;
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 OR length(p_token) > 200 THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_inv FROM company_invitations
  WHERE invite_token = p_token
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR use_count < max_uses);
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT c.name INTO v_name FROM companies c WHERE c.id = v_inv.company_id;
  RETURN jsonb_build_object(
    'id', v_inv.id,
    'company_id', v_inv.company_id,
    'invited_role', v_inv.invited_role,
    'invited_access_level', v_inv.invited_access_level,
    'invited_company_role', v_inv.invited_company_role,
    'invited_email', v_inv.invited_email,
    'status', v_inv.status,
    'expires_at', v_inv.expires_at,
    'max_uses', v_inv.max_uses,
    'use_count', v_inv.use_count,
    'companies', jsonb_build_object('id', v_inv.company_id, 'name', v_name)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.public_get_shared_project(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_get_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_shared_project(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_get_invitation(TEXT) TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 3. Replacement policies (created BEFORE the unsafe ones are dropped,
--    so there is no moment without access)
-- ------------------------------------------------------------
ALTER TABLE public.project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_upload_queue ENABLE ROW LEVEL SECURITY;

-- change_order_labor
DROP POLICY IF EXISTS "tenant: members manage" ON public.change_order_labor;
CREATE POLICY "tenant: members manage" ON public.change_order_labor
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.change_orders co WHERE co.id = change_order_labor.change_order_id AND public.is_active_member(co.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.change_orders co WHERE co.id = change_order_labor.change_order_id AND public.is_active_member(co.company_id)));
-- change_order_materials
DROP POLICY IF EXISTS "tenant: members manage" ON public.change_order_materials;
CREATE POLICY "tenant: members manage" ON public.change_order_materials
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.change_orders co WHERE co.id = change_order_materials.change_order_id AND public.is_active_member(co.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.change_orders co WHERE co.id = change_order_materials.change_order_id AND public.is_active_member(co.company_id)));
-- change_order_equipment
DROP POLICY IF EXISTS "tenant: members manage" ON public.change_order_equipment;
CREATE POLICY "tenant: members manage" ON public.change_order_equipment
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.change_orders co WHERE co.id = change_order_equipment.change_order_id AND public.is_active_member(co.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.change_orders co WHERE co.id = change_order_equipment.change_order_id AND public.is_active_member(co.company_id)));
-- change_order_subcontractors
DROP POLICY IF EXISTS "tenant: members manage" ON public.change_order_subcontractors;
CREATE POLICY "tenant: members manage" ON public.change_order_subcontractors
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.change_orders co WHERE co.id = change_order_subcontractors.change_order_id AND public.is_active_member(co.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.change_orders co WHERE co.id = change_order_subcontractors.change_order_id AND public.is_active_member(co.company_id)));
-- change_order_ticket_associations
DROP POLICY IF EXISTS "tenant: members manage" ON public.change_order_ticket_associations;
CREATE POLICY "tenant: members manage" ON public.change_order_ticket_associations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.change_orders co WHERE co.id = change_order_ticket_associations.change_order_id AND public.is_active_member(co.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.change_orders co WHERE co.id = change_order_ticket_associations.change_order_id AND public.is_active_member(co.company_id)));
-- company_branding
DROP POLICY IF EXISTS "tenant: company can view" ON public.company_branding;
CREATE POLICY "tenant: company can view" ON public.company_branding
  FOR SELECT TO public
  USING (public.can_access_company(company_id));
-- cor_export_jobs
DROP POLICY IF EXISTS "tenant: members view" ON public.cor_export_jobs;
CREATE POLICY "tenant: members view" ON public.cor_export_jobs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.change_orders co WHERE co.id = cor_export_jobs.cor_id AND public.is_active_member(co.company_id)));
DROP POLICY IF EXISTS "tenant: members create" ON public.cor_export_jobs;
CREATE POLICY "tenant: members create" ON public.cor_export_jobs
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.change_orders co WHERE co.id = cor_export_jobs.cor_id AND public.is_active_member(co.company_id)));
-- cor_log_entries
DROP POLICY IF EXISTS "tenant: members view" ON public.cor_log_entries;
CREATE POLICY "tenant: members view" ON public.cor_log_entries
  FOR SELECT TO authenticated
  USING (public.is_active_member(company_id));
DROP POLICY IF EXISTS "tenant: members update" ON public.cor_log_entries;
CREATE POLICY "tenant: members update" ON public.cor_log_entries
  FOR UPDATE TO authenticated
  USING (public.is_active_member(company_id))
  WITH CHECK (public.is_active_member(company_id));
-- cor_status_history
DROP POLICY IF EXISTS "tenant: members view" ON public.cor_status_history;
CREATE POLICY "tenant: members view" ON public.cor_status_history
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.change_orders co WHERE co.id = cor_status_history.change_order_id AND public.is_active_member(co.company_id)));
DROP POLICY IF EXISTS "tenant: members log" ON public.cor_status_history;
CREATE POLICY "tenant: members log" ON public.cor_status_history
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.change_orders co WHERE co.id = cor_status_history.change_order_id AND public.is_active_member(co.company_id)));
-- cost_codes
DROP POLICY IF EXISTS "tenant: members view" ON public.cost_codes;
CREATE POLICY "tenant: members view" ON public.cost_codes
  FOR SELECT TO authenticated
  USING (public.is_active_member(company_id));
DROP POLICY IF EXISTS "tenant: admins manage" ON public.cost_codes;
CREATE POLICY "tenant: admins manage" ON public.cost_codes
  FOR ALL TO authenticated
  USING (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));
-- crew_checkins
DROP POLICY IF EXISTS "tenant: project access" ON public.crew_checkins;
CREATE POLICY "tenant: project access" ON public.crew_checkins
  FOR ALL TO public
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id));
-- custom_field_data
DROP POLICY IF EXISTS "tenant: field session" ON public.custom_field_data;
CREATE POLICY "tenant: field session" ON public.custom_field_data
  FOR ALL TO anon
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id));
-- daily_reports
DROP POLICY IF EXISTS "tenant: members delete" ON public.daily_reports;
CREATE POLICY "tenant: members delete" ON public.daily_reports
  FOR DELETE TO authenticated
  USING (public.can_access_project(project_id));
-- dump_sites
DROP POLICY IF EXISTS "tenant: members manage" ON public.dump_sites;
CREATE POLICY "tenant: members manage" ON public.dump_sites
  FOR ALL TO authenticated
  USING (public.is_active_member(company_id))
  WITH CHECK (public.is_active_member(company_id));
DROP POLICY IF EXISTS "tenant: field view" ON public.dump_sites;
CREATE POLICY "tenant: field view" ON public.dump_sites
  FOR SELECT TO anon
  USING (public.can_access_company(company_id));
-- dump_site_rates
DROP POLICY IF EXISTS "tenant: members manage" ON public.dump_site_rates;
CREATE POLICY "tenant: members manage" ON public.dump_site_rates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dump_sites d WHERE d.id = dump_site_rates.dump_site_id AND public.is_active_member(d.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.dump_sites d WHERE d.id = dump_site_rates.dump_site_id AND public.is_active_member(d.company_id)));
-- haul_offs
DROP POLICY IF EXISTS "tenant: project access" ON public.haul_offs;
CREATE POLICY "tenant: project access" ON public.haul_offs
  FOR ALL TO public
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id));
-- injury_reports
DROP POLICY IF EXISTS "tenant: field report" ON public.injury_reports;
CREATE POLICY "tenant: field report" ON public.injury_reports
  FOR INSERT TO anon
  WITH CHECK (public.can_access_project(project_id) AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = injury_reports.project_id AND p.company_id = injury_reports.company_id));
-- labor_categories
DROP POLICY IF EXISTS "tenant: company can view" ON public.labor_categories;
CREATE POLICY "tenant: company can view" ON public.labor_categories
  FOR SELECT TO public
  USING (public.can_access_company(company_id));
-- labor_classes
DROP POLICY IF EXISTS "tenant: company can view" ON public.labor_classes;
CREATE POLICY "tenant: company can view" ON public.labor_classes
  FOR SELECT TO public
  USING (public.can_access_company(company_id));
-- labor_class_rates
DROP POLICY IF EXISTS "tenant: members view" ON public.labor_class_rates;
CREATE POLICY "tenant: members view" ON public.labor_class_rates
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.labor_classes lc WHERE lc.id = labor_class_rates.labor_class_id AND public.is_active_member(lc.company_id)));
-- labor_rates
DROP POLICY IF EXISTS "tenant: members view" ON public.labor_rates;
CREATE POLICY "tenant: members view" ON public.labor_rates
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR public.is_active_member(company_id));
DROP POLICY IF EXISTS "tenant: members manage" ON public.labor_rates;
CREATE POLICY "tenant: members manage" ON public.labor_rates
  FOR ALL TO authenticated
  USING (public.is_active_member(company_id))
  WITH CHECK (public.is_active_member(company_id));
-- material_requests
DROP POLICY IF EXISTS "tenant: project access" ON public.material_requests;
CREATE POLICY "tenant: project access" ON public.material_requests
  FOR ALL TO public
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id));
-- materials_equipment
DROP POLICY IF EXISTS "tenant: company can view" ON public.materials_equipment;
CREATE POLICY "tenant: company can view" ON public.materials_equipment
  FOR SELECT TO public
  USING (public.can_access_company(company_id));
DROP POLICY IF EXISTS "tenant: members manage" ON public.materials_equipment;
CREATE POLICY "tenant: members manage" ON public.materials_equipment
  FOR ALL TO authenticated
  USING (public.is_active_member(company_id))
  WITH CHECK (public.is_active_member(company_id));
-- messages
DROP POLICY IF EXISTS "tenant: project access" ON public.messages;
CREATE POLICY "tenant: project access" ON public.messages
  FOR ALL TO public
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id));
-- project_assignments
DROP POLICY IF EXISTS "tenant: admins manage" ON public.project_assignments;
CREATE POLICY "tenant: admins manage" ON public.project_assignments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_assignments.project_id AND public.is_company_admin(p.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_assignments.project_id AND public.is_company_admin(p.company_id)));
-- photo_upload_queue
DROP POLICY IF EXISTS "tenant: project access" ON public.photo_upload_queue;
CREATE POLICY "tenant: project access" ON public.photo_upload_queue
  FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM public.t_and_m_tickets t WHERE t.id = photo_upload_queue.ticket_id AND public.can_access_project(t.project_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.t_and_m_tickets t WHERE t.id = photo_upload_queue.ticket_id AND public.can_access_project(t.project_id)));
-- project_costs
DROP POLICY IF EXISTS "tenant: members manage" ON public.project_costs;
CREATE POLICY "tenant: members manage" ON public.project_costs
  FOR ALL TO authenticated
  USING (public.is_active_member(company_id))
  WITH CHECK (public.is_active_member(company_id));
-- projects
DROP POLICY IF EXISTS "tenant: members view" ON public.projects;
CREATE POLICY "tenant: members view" ON public.projects
  FOR SELECT TO authenticated
  USING (public.is_active_member(company_id));
DROP POLICY IF EXISTS "tenant: members create" ON public.projects;
CREATE POLICY "tenant: members create" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_member(company_id));
DROP POLICY IF EXISTS "tenant: members update" ON public.projects;
CREATE POLICY "tenant: members update" ON public.projects
  FOR UPDATE TO authenticated
  USING (public.is_active_member(company_id))
  WITH CHECK (public.is_active_member(company_id));
DROP POLICY IF EXISTS "tenant: admins delete" ON public.projects;
CREATE POLICY "tenant: admins delete" ON public.projects
  FOR DELETE TO authenticated
  USING (public.is_company_admin(company_id));
-- rfis
DROP POLICY IF EXISTS "tenant: members manage" ON public.rfis;
CREATE POLICY "tenant: members manage" ON public.rfis
  FOR ALL TO authenticated
  USING (public.is_active_member(company_id))
  WITH CHECK (public.is_active_member(company_id));
DROP POLICY IF EXISTS "tenant: field view" ON public.rfis;
CREATE POLICY "tenant: field view" ON public.rfis
  FOR SELECT TO anon
  USING (public.can_access_project(project_id));
DROP POLICY IF EXISTS "tenant: field create" ON public.rfis;
CREATE POLICY "tenant: field create" ON public.rfis
  FOR INSERT TO anon
  WITH CHECK (public.can_access_project(project_id) AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = rfis.project_id AND p.company_id = rfis.company_id));
DROP POLICY IF EXISTS "tenant: field update" ON public.rfis;
CREATE POLICY "tenant: field update" ON public.rfis
  FOR UPDATE TO anon
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id) AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = rfis.project_id AND p.company_id = rfis.company_id));
-- rfi_attachments
DROP POLICY IF EXISTS "tenant: members manage" ON public.rfi_attachments;
CREATE POLICY "tenant: members manage" ON public.rfi_attachments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rfis r WHERE r.id = rfi_attachments.rfi_id AND public.is_active_member(r.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.rfis r WHERE r.id = rfi_attachments.rfi_id AND public.is_active_member(r.company_id)));
-- submittals
DROP POLICY IF EXISTS "tenant: members manage" ON public.submittals;
CREATE POLICY "tenant: members manage" ON public.submittals
  FOR ALL TO authenticated
  USING (public.is_active_member(company_id))
  WITH CHECK (public.is_active_member(company_id));
-- submittal_attachments
DROP POLICY IF EXISTS "tenant: members manage" ON public.submittal_attachments;
CREATE POLICY "tenant: members manage" ON public.submittal_attachments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.submittals s WHERE s.id = submittal_attachments.submittal_id AND public.is_active_member(s.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.submittals s WHERE s.id = submittal_attachments.submittal_id AND public.is_active_member(s.company_id)));
-- t_and_m_tickets
DROP POLICY IF EXISTS "tenant: members delete" ON public.t_and_m_tickets;
CREATE POLICY "tenant: members delete" ON public.t_and_m_tickets
  FOR DELETE TO authenticated
  USING (public.can_access_project(project_id));
-- t_and_m_workers
DROP POLICY IF EXISTS "tenant: project access" ON public.t_and_m_workers;
CREATE POLICY "tenant: project access" ON public.t_and_m_workers
  FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM public.t_and_m_tickets t WHERE t.id = t_and_m_workers.ticket_id AND public.can_access_project(t.project_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.t_and_m_tickets t WHERE t.id = t_and_m_workers.ticket_id AND public.can_access_project(t.project_id)));
-- t_and_m_items
DROP POLICY IF EXISTS "tenant: project access" ON public.t_and_m_items;
CREATE POLICY "tenant: project access" ON public.t_and_m_items
  FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM public.t_and_m_tickets t WHERE t.id = t_and_m_items.ticket_id AND public.can_access_project(t.project_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.t_and_m_tickets t WHERE t.id = t_and_m_items.ticket_id AND public.can_access_project(t.project_id)));
-- user_companies
DROP POLICY IF EXISTS "tenant: request to join" ON public.user_companies;
CREATE POLICY "tenant: request to join" ON public.user_companies
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending' AND COALESCE(access_level, 'member') = 'member' AND COALESCE(role, 'member') = 'member' AND NOT (can_approve_tickets OR can_send_cors OR can_sign_for_foreman OR can_manage_client_access));
-- punch_list_items
DROP POLICY IF EXISTS "tenant: project access" ON public.punch_list_items;
CREATE POLICY "tenant: project access" ON public.punch_list_items
  FOR ALL TO public
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id) AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = punch_list_items.project_id AND p.company_id = punch_list_items.company_id));
-- document_audit_log
DROP POLICY IF EXISTS "tenant: project access can log" ON public.document_audit_log;
CREATE POLICY "tenant: project access can log" ON public.document_audit_log
  FOR INSERT TO public
  WITH CHECK (public.can_access_project(project_id));
DROP POLICY IF EXISTS "tenant: members view" ON public.document_audit_log;
CREATE POLICY "tenant: members view" ON public.document_audit_log
  FOR SELECT TO authenticated
  USING (public.is_active_member(company_id));
-- company_trade_config
DROP POLICY IF EXISTS "tenant: field view" ON public.company_trade_config;
CREATE POLICY "tenant: field view" ON public.company_trade_config
  FOR SELECT TO anon
  USING (public.can_access_company(company_id));
-- project_trade_overrides
DROP POLICY IF EXISTS "tenant: field view" ON public.project_trade_overrides;
CREATE POLICY "tenant: field view" ON public.project_trade_overrides
  FOR SELECT TO anon
  USING (public.can_access_project(project_id));
-- external_notification_recipients
DROP POLICY IF EXISTS "tenant: members view" ON public.external_notification_recipients;
CREATE POLICY "tenant: members view" ON public.external_notification_recipients
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.notification_roles r WHERE r.id = external_notification_recipients.role_id AND public.is_active_member(r.company_id)));
-- project_user_permissions
DROP POLICY IF EXISTS "tenant: members view" ON public.project_user_permissions;
CREATE POLICY "tenant: members view" ON public.project_user_permissions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.project_users pu JOIN public.projects p ON p.id = pu.project_id WHERE pu.id = project_user_permissions.project_user_id AND public.is_active_member(p.company_id)));

-- storage.objects
DROP POLICY IF EXISTS "tenant: view ticket photos" ON storage.objects;
CREATE POLICY "tenant: view ticket photos" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'tm-photos' AND public.can_access_project_path(name));
DROP POLICY IF EXISTS "tenant: upload ticket photos" ON storage.objects;
CREATE POLICY "tenant: upload ticket photos" ON storage.objects
  FOR INSERT TO public
  WITH CHECK (bucket_id = 'tm-photos' AND public.can_access_project_path(name) AND name ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/[^/]+/[^/]+$');
DROP POLICY IF EXISTS "tenant: update ticket photos" ON storage.objects;
CREATE POLICY "tenant: update ticket photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'tm-photos' AND public.can_access_project_path(name))
  WITH CHECK (bucket_id = 'tm-photos' AND public.can_access_project_path(name));
DROP POLICY IF EXISTS "tenant: delete ticket photos" ON storage.objects;
CREATE POLICY "tenant: delete ticket photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'tm-photos' AND public.can_access_project_path(name));
DROP POLICY IF EXISTS "tenant: view project documents" ON storage.objects;
CREATE POLICY "tenant: view project documents" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'project-documents' AND public.can_access_company_path(name));
DROP POLICY IF EXISTS "tenant: upload branding" ON storage.objects;
CREATE POLICY "tenant: upload branding" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'public' AND public.can_manage_branding_path(name));
DROP POLICY IF EXISTS "tenant: update branding" ON storage.objects;
CREATE POLICY "tenant: update branding" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'public' AND public.can_manage_branding_path(name))
  WITH CHECK (bucket_id = 'public' AND public.can_manage_branding_path(name));
DROP POLICY IF EXISTS "tenant: delete branding" ON storage.objects;
CREATE POLICY "tenant: delete branding" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'public' AND public.can_manage_branding_path(name));

-- ------------------------------------------------------------
-- 4. Drop the unsafe policies
--    (reason: TRUE = open to everyone, ANYAUTH = any signed-in user,
--     NOSTATUS = pending/removed members count, USERSTBL = trusts the
--     company on the user's own editable profile row, NULLCO = rows
--     with no company are open)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Office can view activity" ON public."activity_log";  -- SELECT TRUE
DROP POLICY IF EXISTS "Users can log activity" ON public."activity_log";  -- INSERT TRUE
DROP POLICY IF EXISTS "areas_via_project_modify" ON public."areas";  -- ALL NOSTATUS
DROP POLICY IF EXISTS "areas_via_project_select" ON public."areas";  -- SELECT NOSTATUS
DROP POLICY IF EXISTS "public_all_areas" ON public."areas";  -- ALL TRUE
DROP POLICY IF EXISTS "Allow logging auth attempts" ON public."auth_attempts";  -- INSERT TRUE
DROP POLICY IF EXISTS "Authenticated users full access to equipment items" ON public."change_order_equipment";  -- ALL NOSTATUS
DROP POLICY IF EXISTS "Authenticated users full access to labor items" ON public."change_order_labor";  -- ALL NOSTATUS
DROP POLICY IF EXISTS "Authenticated users full access to material items" ON public."change_order_materials";  -- ALL NOSTATUS
DROP POLICY IF EXISTS "Authenticated users full access to subcontractor items" ON public."change_order_subcontractors";  -- ALL NOSTATUS
DROP POLICY IF EXISTS "Authenticated users full access to ticket associations" ON public."change_order_ticket_associations";  -- ALL NOSTATUS
DROP POLICY IF EXISTS "Secure field view companies" ON public."companies";  -- SELECT ANYAUTH
DROP POLICY IF EXISTS "Users create companies" ON public."companies";  -- INSERT ANYAUTH
DROP POLICY IF EXISTS "companies_select_authenticated" ON public."companies";  -- SELECT TRUE
DROP POLICY IF EXISTS "public_read_companies" ON public."companies";  -- SELECT TRUE
DROP POLICY IF EXISTS "Anyone can read company branding" ON public."company_branding";  -- SELECT TRUE
DROP POLICY IF EXISTS "Company admins can delete branding" ON public."company_branding";  -- DELETE USERSTBL
DROP POLICY IF EXISTS "Company admins can insert branding" ON public."company_branding";  -- INSERT USERSTBL
DROP POLICY IF EXISTS "Field users can read branding" ON public."company_branding";  -- SELECT TRUE
DROP POLICY IF EXISTS "Secure field view company branding" ON public."company_branding";  -- SELECT ANYAUTH
DROP POLICY IF EXISTS "Public lookup active invitation by token" ON public."company_invitations";  -- SELECT REPLACED
DROP POLICY IF EXISTS "Users can create export jobs for their company CORs" ON public."cor_export_jobs";  -- INSERT NOSTATUS
DROP POLICY IF EXISTS "Users can view export jobs for their company CORs" ON public."cor_export_jobs";  -- SELECT NOSTATUS
DROP POLICY IF EXISTS "Authenticated users can update cor log entries" ON public."cor_log_entries";  -- UPDATE TRUE
DROP POLICY IF EXISTS "Authenticated users can view cor log entries" ON public."cor_log_entries";  -- SELECT TRUE
DROP POLICY IF EXISTS "Users can update company cor log entries" ON public."cor_log_entries";  -- UPDATE USERSTBL
DROP POLICY IF EXISTS "Users can view company cor log entries" ON public."cor_log_entries";  -- SELECT USERSTBL
DROP POLICY IF EXISTS "Users can log status changes for their company CORs" ON public."cor_status_history";  -- INSERT NOSTATUS
DROP POLICY IF EXISTS "Users can view their company COR status history" ON public."cor_status_history";  -- SELECT NOSTATUS
DROP POLICY IF EXISTS "Admins can manage cost codes" ON public."cost_codes";  -- ALL NOSTATUS
DROP POLICY IF EXISTS "Users can view their company cost codes" ON public."cost_codes";  -- SELECT NOSTATUS
DROP POLICY IF EXISTS "Anyone can view crew checkins" ON public."crew_checkins";  -- SELECT TRUE
DROP POLICY IF EXISTS "Authenticated users can manage checkins" ON public."crew_checkins";  -- ALL ANYAUTH
DROP POLICY IF EXISTS "public_all_crew_checkins" ON public."crew_checkins";  -- ALL TRUE
DROP POLICY IF EXISTS "Anyone can view reports" ON public."daily_reports";  -- SELECT TRUE
DROP POLICY IF EXISTS "Authenticated users can manage reports" ON public."daily_reports";  -- ALL ANYAUTH
DROP POLICY IF EXISTS "Users can create daily reports" ON public."daily_reports";  -- INSERT NOSTATUS
DROP POLICY IF EXISTS "Users can view their company daily reports" ON public."daily_reports";  -- SELECT NOSTATUS
DROP POLICY IF EXISTS "documents_visibility_select" ON public."documents";  -- SELECT NOSTATUS
DROP POLICY IF EXISTS "dump_site_rates_company" ON public."dump_site_rates";  -- ALL USERSTBL
DROP POLICY IF EXISTS "Secure field view dump sites" ON public."dump_sites";  -- SELECT ANYAUTH
DROP POLICY IF EXISTS "dump_sites_company" ON public."dump_sites";  -- ALL USERSTBL
DROP POLICY IF EXISTS "Authenticated view external_notification_recipients" ON public."external_notification_recipients";  -- SELECT ANYAUTH
DROP POLICY IF EXISTS "haul_offs_project" ON public."haul_offs";  -- ALL USERSTBL
DROP POLICY IF EXISTS "Allow company users to manage injury reports" ON public."injury_reports";  -- ALL USERSTBL
DROP POLICY IF EXISTS "Users can manage company injury reports" ON public."injury_reports";  -- ALL USERSTBL
DROP POLICY IF EXISTS "Field users can read labor categories" ON public."labor_categories";  -- SELECT TRUE
DROP POLICY IF EXISTS "Field users can view labor categories" ON public."labor_categories";  -- SELECT TRUE
DROP POLICY IF EXISTS "Only authenticated users can view rates" ON public."labor_class_rates";  -- SELECT ANYAUTH
DROP POLICY IF EXISTS "Field users can read labor classes" ON public."labor_classes";  -- SELECT TRUE
DROP POLICY IF EXISTS "Field users can view labor classes" ON public."labor_classes";  -- SELECT TRUE
DROP POLICY IF EXISTS "Secure field view labor classes" ON public."labor_classes";  -- SELECT ANYAUTH
DROP POLICY IF EXISTS "Field users can view labor rates" ON public."labor_rates";  -- SELECT ANYAUTH
DROP POLICY IF EXISTS "allow_all_labor_rates" ON public."labor_rates";  -- ALL TRUE
DROP POLICY IF EXISTS "Anyone can view requests" ON public."material_requests";  -- SELECT TRUE
DROP POLICY IF EXISTS "Authenticated can manage requests" ON public."material_requests";  -- UPDATE ANYAUTH
DROP POLICY IF EXISTS "Authenticated users can manage requests" ON public."material_requests";  -- ALL ANYAUTH
DROP POLICY IF EXISTS "Users can create material requests" ON public."material_requests";  -- INSERT NOSTATUS
DROP POLICY IF EXISTS "Users can update material requests" ON public."material_requests";  -- UPDATE NOSTATUS
DROP POLICY IF EXISTS "Users can view their company material requests" ON public."material_requests";  -- SELECT NOSTATUS
DROP POLICY IF EXISTS "Authenticated can manage materials" ON public."materials_equipment";  -- ALL ANYAUTH
DROP POLICY IF EXISTS "Authenticated users can manage materials" ON public."materials_equipment";  -- ALL ANYAUTH
DROP POLICY IF EXISTS "Secure field view materials equipment" ON public."materials_equipment";  -- SELECT ANYAUTH
DROP POLICY IF EXISTS "allow_all_materials" ON public."materials_equipment";  -- ALL TRUE
DROP POLICY IF EXISTS "Anyone can create messages" ON public."messages";  -- INSERT TRUE
DROP POLICY IF EXISTS "Anyone can update messages" ON public."messages";  -- UPDATE TRUE
DROP POLICY IF EXISTS "Anyone can view messages" ON public."messages";  -- SELECT TRUE
DROP POLICY IF EXISTS "Authenticated users can manage messages" ON public."messages";  -- ALL ANYAUTH
DROP POLICY IF EXISTS "Users can create messages" ON public."messages";  -- INSERT NOSTATUS
DROP POLICY IF EXISTS "Users can update messages" ON public."messages";  -- UPDATE NOSTATUS
DROP POLICY IF EXISTS "Users can view their company messages" ON public."messages";  -- SELECT NOSTATUS
DROP POLICY IF EXISTS "notification_settings_delete_policy" ON public."notification_settings";  -- DELETE USERSTBL
DROP POLICY IF EXISTS "notification_settings_insert_policy" ON public."notification_settings";  -- INSERT USERSTBL
DROP POLICY IF EXISTS "notification_settings_select_policy" ON public."notification_settings";  -- SELECT USERSTBL
DROP POLICY IF EXISTS "notification_settings_update_policy" ON public."notification_settings";  -- UPDATE USERSTBL
DROP POLICY IF EXISTS "Office/Admin can manage assignments" ON public."project_assignments";  -- ALL ANYAUTH
DROP POLICY IF EXISTS "Allow company users to manage project costs" ON public."project_costs";  -- ALL USERSTBL
DROP POLICY IF EXISTS "Public can view active shares by token" ON public."project_shares";  -- SELECT REPLACED
DROP POLICY IF EXISTS "Users can manage their company shares" ON public."project_shares";  -- ALL USERSTBL
DROP POLICY IF EXISTS "Authenticated view project_user_permissions" ON public."project_user_permissions";  -- SELECT ANYAUTH
DROP POLICY IF EXISTS "Active admins delete company projects" ON public."projects";  -- DELETE NULLCO
DROP POLICY IF EXISTS "Active members create company projects" ON public."projects";  -- INSERT NULLCO
DROP POLICY IF EXISTS "Active members update company projects" ON public."projects";  -- UPDATE NULLCO
DROP POLICY IF EXISTS "Active members view company projects" ON public."projects";  -- SELECT NULLCO
DROP POLICY IF EXISTS "projects_company_member_delete" ON public."projects";  -- DELETE NOSTATUS
DROP POLICY IF EXISTS "projects_company_member_insert" ON public."projects";  -- INSERT NOSTATUS
DROP POLICY IF EXISTS "projects_company_member_select" ON public."projects";  -- SELECT NOSTATUS
DROP POLICY IF EXISTS "projects_company_member_update" ON public."projects";  -- UPDATE NOSTATUS
DROP POLICY IF EXISTS "public_read_projects" ON public."projects";  -- SELECT TRUE
DROP POLICY IF EXISTS "Users can manage RFI attachments" ON public."rfi_attachments";  -- ALL NOSTATUS
DROP POLICY IF EXISTS "Users can view RFI attachments" ON public."rfi_attachments";  -- SELECT NOSTATUS
DROP POLICY IF EXISTS "Users can manage project RFIs" ON public."rfis";  -- ALL NOSTATUS
DROP POLICY IF EXISTS "Users can view project RFIs" ON public."rfis";  -- SELECT NOSTATUS
DROP POLICY IF EXISTS "Users can manage submittal attachments" ON public."submittal_attachments";  -- ALL NOSTATUS
DROP POLICY IF EXISTS "Users can view submittal attachments" ON public."submittal_attachments";  -- SELECT NOSTATUS
DROP POLICY IF EXISTS "Users can manage project submittals" ON public."submittals";  -- ALL NOSTATUS
DROP POLICY IF EXISTS "Users can view project submittals" ON public."submittals";  -- SELECT NOSTATUS
DROP POLICY IF EXISTS "Anyone can create items" ON public."t_and_m_items";  -- INSERT TRUE
DROP POLICY IF EXISTS "Anyone can view items" ON public."t_and_m_items";  -- SELECT TRUE
DROP POLICY IF EXISTS "Authenticated users can manage items" ON public."t_and_m_items";  -- ALL ANYAUTH
DROP POLICY IF EXISTS "public_all_tm_items" ON public."t_and_m_items";  -- ALL TRUE
DROP POLICY IF EXISTS "Anyone can view tickets" ON public."t_and_m_tickets";  -- SELECT TRUE
DROP POLICY IF EXISTS "Authenticated can delete tickets" ON public."t_and_m_tickets";  -- DELETE ANYAUTH
DROP POLICY IF EXISTS "Authenticated can manage tickets" ON public."t_and_m_tickets";  -- UPDATE ANYAUTH
DROP POLICY IF EXISTS "Authenticated users can manage tickets" ON public."t_and_m_tickets";  -- ALL ANYAUTH
DROP POLICY IF EXISTS "public_all_tm_tickets" ON public."t_and_m_tickets";  -- ALL TRUE
DROP POLICY IF EXISTS "Anyone can create workers" ON public."t_and_m_workers";  -- INSERT TRUE
DROP POLICY IF EXISTS "Anyone can view workers" ON public."t_and_m_workers";  -- SELECT TRUE
DROP POLICY IF EXISTS "Authenticated users can manage workers" ON public."t_and_m_workers";  -- ALL ANYAUTH
DROP POLICY IF EXISTS "public_all_tm_workers" ON public."t_and_m_workers";  -- ALL TRUE
DROP POLICY IF EXISTS "users_insert_pending" ON public."user_companies";  -- INSERT REPLACED
DROP POLICY IF EXISTS "Admins can manage invitations" ON public."user_invitations";  -- ALL USERSTBL
DROP POLICY IF EXISTS "Anyone can view invitation by token" ON public."user_invitations";  -- SELECT TRUE
DROP POLICY IF EXISTS "Users can view company invitations" ON public."user_invitations";  -- SELECT USERSTBL

-- storage.objects
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow deletes from branding" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow updates to branding" ON storage.objects;
DROP POLICY IF EXISTS "Allow uploads to branding" ON storage.objects;
DROP POLICY IF EXISTS "Anonymous users can upload tm-photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete tm-photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update tm-photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload tm-photos" ON storage.objects;
DROP POLICY IF EXISTS "Companies can upload assets" ON storage.objects;
DROP POLICY IF EXISTS "Company users can delete photos" ON storage.objects;
DROP POLICY IF EXISTS "Company users can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Field users can delete tm-photos" ON storage.objects;
DROP POLICY IF EXISTS "Field users can update tm-photos" ON storage.objects;
DROP POLICY IF EXISTS "Field users can upload tm-photos" ON storage.objects;
DROP POLICY IF EXISTS "Public can view photos" ON storage.objects;
DROP POLICY IF EXISTS "document_storage_select" ON storage.objects;

-- ------------------------------------------------------------
-- 5. Functions: check the caller
--    Each body below is the live definition with a guard added.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_invitation(p_invite_token text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_invitation RECORD;
  v_existing RECORD;
BEGIN
  -- tenant isolation guard (20261113)
  IF public.is_api_request() AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please sign in to accept this invitation');
  END IF;

  -- Look up and validate invitation
  SELECT * INTO v_invitation
  FROM company_invitations
  WHERE invite_token = p_invite_token
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (max_uses IS NULL OR use_count < max_uses);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;

  -- If invitation targets a specific email, validate it
  IF v_invitation.invited_email IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM users WHERE id = p_user_id AND LOWER(email) = LOWER(v_invitation.invited_email)
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'This invitation is for a different email address');
    END IF;
  END IF;

  -- Check if user already has a membership for this company
  SELECT * INTO v_existing
  FROM user_companies
  WHERE user_id = p_user_id AND company_id = v_invitation.company_id;

  IF FOUND THEN
    IF v_existing.status = 'active' THEN
      RETURN jsonb_build_object('success', false, 'error', 'You are already a member of this company');
    ELSIF v_existing.status = 'pending' THEN
      -- Auto-approve the pending membership
      UPDATE user_companies SET
        status = 'active',
        role = v_invitation.invited_role,
        access_level = v_invitation.invited_access_level,
        company_role = v_invitation.invited_company_role,
        approved_at = NOW(),
        approved_by = v_invitation.created_by
      WHERE id = v_existing.id;
    ELSIF v_existing.status = 'removed' THEN
      -- Reactivate removed membership
      UPDATE user_companies SET
        status = 'active',
        role = v_invitation.invited_role,
        access_level = v_invitation.invited_access_level,
        company_role = v_invitation.invited_company_role,
        approved_at = NOW(),
        approved_by = v_invitation.created_by,
        removed_at = NULL,
        removed_by = NULL
      WHERE id = v_existing.id;
    END IF;
  ELSE
    -- Create new auto-approved membership
    INSERT INTO user_companies (
      user_id, company_id, role, access_level, company_role,
      status, approved_at, approved_by
    ) VALUES (
      p_user_id, v_invitation.company_id, v_invitation.invited_role,
      v_invitation.invited_access_level, v_invitation.invited_company_role,
      'active', NOW(), v_invitation.created_by
    );
  END IF;

  -- Update invitation usage
  UPDATE company_invitations SET
    use_count = use_count + 1,
    accepted_by = p_user_id,
    accepted_at = NOW(),
    status = CASE
      WHEN max_uses IS NOT NULL AND use_count + 1 >= max_uses THEN 'accepted'
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = v_invitation.id;

  RETURN jsonb_build_object(
    'success', true,
    'company_id', v_invitation.company_id,
    'company_role', v_invitation.invited_company_role
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.accept_invite_token(invite_token text, accepting_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  invite_record company_invites%ROWTYPE;
  membership_id UUID;
  result JSON;
BEGIN
  -- tenant isolation guard (20261113)
  IF public.is_api_request() AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM accepting_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Please sign in to accept this invitation');
  END IF;

  -- Find the invite
  SELECT * INTO invite_record
  FROM company_invites
  WHERE token = invite_token
  AND accepted_at IS NULL
  AND expires_at > NOW();

  IF invite_record.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired invite token');
  END IF;

  -- Check if user already has membership in this company
  IF EXISTS (
    SELECT 1 FROM user_companies
    WHERE user_id = accepting_user_id
    AND company_id = invite_record.company_id
    AND status = 'active'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Already a member of this company');
  END IF;

  -- Remove any existing pending/removed membership for this user+company
  DELETE FROM user_companies
  WHERE user_id = accepting_user_id
  AND company_id = invite_record.company_id
  AND status IN ('pending', 'removed');

  -- Create the membership
  INSERT INTO user_companies (
    user_id,
    company_id,
    status,
    access_level,
    company_role,
    approved_at,
    approved_by
  ) VALUES (
    accepting_user_id,
    invite_record.company_id,
    'active',
    invite_record.access_level,
    invite_record.role,
    NOW(),
    invite_record.invited_by
  )
  RETURNING id INTO membership_id;

  -- Mark invite as accepted
  UPDATE company_invites
  SET accepted_at = NOW(),
      accepted_by = accepting_user_id
  WHERE id = invite_record.id;

  RETURN json_build_object(
    'success', true,
    'membership_id', membership_id,
    'company_id', invite_record.company_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_membership_with_role(membership_id uuid, approved_by_user uuid, new_role text DEFAULT 'member'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  target_company_id UUID;
  approver_status TEXT;
  approver_role TEXT;
  computed_access_level TEXT;
BEGIN
  -- tenant isolation guard (20261113)
  IF public.is_api_request() AND NOT COALESCE((auth.uid() IS NOT NULL AND auth.uid() = approved_by_user), false) THEN
    RAISE EXCEPTION 'Unauthorized: Only active admins can approve memberships' USING ERRCODE = '42501';
  END IF;

  -- Get the company_id from the membership being approved
  SELECT company_id INTO target_company_id
  FROM user_companies
  WHERE id = membership_id;

  IF target_company_id IS NULL THEN
    RAISE EXCEPTION 'Membership not found';
  END IF;

  -- Verify the approver is an active admin/owner of this company
  SELECT uc.status, uc.role INTO approver_status, approver_role
  FROM user_companies uc
  WHERE uc.user_id = approved_by_user
  AND uc.company_id = target_company_id;

  -- Also allow company owner to approve
  IF approver_status IS NULL OR approver_status != 'active' THEN
    -- Check if they're the company owner
    IF NOT EXISTS (
      SELECT 1 FROM companies
      WHERE id = target_company_id
      AND owner_user_id = approved_by_user
    ) THEN
      RAISE EXCEPTION 'Unauthorized: Only active admins can approve memberships';
    END IF;
  ELSIF approver_role NOT IN ('admin', 'owner') THEN
    -- Not an admin/owner and not the company owner
    IF NOT EXISTS (
      SELECT 1 FROM companies
      WHERE id = target_company_id
      AND owner_user_id = approved_by_user
    ) THEN
      RAISE EXCEPTION 'Unauthorized: Only active admins can approve memberships';
    END IF;
  END IF;

  -- Validate role value
  IF new_role NOT IN ('member', 'admin', 'owner', 'foreman', 'office') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;

  -- Map role to access_level for frontend consistency
  computed_access_level := CASE
    WHEN new_role IN ('admin', 'owner') THEN 'administrator'
    ELSE 'member'
  END;

  -- Update the membership with both role and access_level
  UPDATE user_companies
  SET
    status = 'active',
    role = new_role,
    access_level = computed_access_level,
    approved_at = NOW(),
    approved_by = approved_by_user
  WHERE id = membership_id
  AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership not found or already processed';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_ticket_to_cor(p_ticket_id uuid, p_cor_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$                                                                                                                                                                               
  BEGIN                                                                                                                                                                               
  -- tenant isolation guard (20261113)
  IF public.is_api_request() AND NOT COALESCE((EXISTS (
      SELECT 1 FROM change_orders co
      JOIN t_and_m_tickets t ON t.id = p_ticket_id
      JOIN projects p ON p.id = t.project_id
      WHERE co.id = p_cor_id AND p.company_id = co.company_id
        AND public.is_active_member(co.company_id))), false) THEN
    RAISE EXCEPTION 'Not authorized for this change order' USING ERRCODE = '42501';
  END IF;

    -- Insert into junction table (ignore if already exists)                                                                                                                          
    INSERT INTO change_order_ticket_associations (change_order_id, ticket_id, data_imported)                                                                                          
    VALUES (p_cor_id, p_ticket_id, false)                                                                                                                                             
    ON CONFLICT (change_order_id, ticket_id) DO NOTHING;                                                                                                                              
                                                                                                                                                                                      
    -- Update ticket's assigned_cor_id                                                                                                                                                
    UPDATE t_and_m_tickets                                                                                                                                                            
    SET assigned_cor_id = p_cor_id                                                                                                                                                    
    WHERE id = p_ticket_id;                                                                                                                                                           
                                                                                                                                                                                      
    -- Both succeed or both fail - transaction guarantees atomicity                                                                                                                   
  END;                                                                                                                                                                                
  $function$;

CREATE OR REPLACE FUNCTION public.unassign_ticket_from_cor(p_ticket_id uuid, p_cor_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$                                                                                                                                                                               
  BEGIN                                                                                                                                                                               
  -- tenant isolation guard (20261113)
  IF public.is_api_request() AND NOT COALESCE((EXISTS (
      SELECT 1 FROM change_orders co
      JOIN t_and_m_tickets t ON t.id = p_ticket_id
      JOIN projects p ON p.id = t.project_id
      WHERE co.id = p_cor_id AND p.company_id = co.company_id
        AND public.is_active_member(co.company_id))), false) THEN
    RAISE EXCEPTION 'Not authorized for this change order' USING ERRCODE = '42501';
  END IF;

    -- Delete from junction table                                                                                                                                                     
    DELETE FROM change_order_ticket_associations                                                                                                                                      
    WHERE ticket_id = p_ticket_id                                                                                                                                                     
      AND change_order_id = p_cor_id;                                                                                                                                                 
                                                                                                                                                                                      
    -- Clear ticket's assigned_cor_id (only if it matches this COR)                                                                                                                   
    UPDATE t_and_m_tickets                                                                                                                                                            
    SET assigned_cor_id = NULL                                                                                                                                                        
    WHERE id = p_ticket_id                                                                                                                                                            
      AND assigned_cor_id = p_cor_id;                                                                                                                                                 
  END;                                                                                                                                                                                
  $function$;

CREATE OR REPLACE FUNCTION public.recalculate_cor_totals(cor_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  DECLARE
    v_labor_subtotal INTEGER := 0;
    v_materials_subtotal INTEGER := 0;
    v_equipment_subtotal INTEGER := 0;
    v_subcontractors_subtotal INTEGER := 0;
    v_labor_markup_percent INTEGER;
    v_materials_markup_percent INTEGER;
    v_equipment_markup_percent INTEGER;
    v_subcontractors_markup_percent INTEGER;
    v_labor_markup_amount INTEGER;
    v_materials_markup_amount INTEGER;
    v_equipment_markup_amount INTEGER;
    v_subcontractors_markup_amount INTEGER;
    v_liability_insurance_percent INTEGER;
    v_bond_percent INTEGER;
    v_license_fee_percent INTEGER;
    v_cor_subtotal INTEGER;
    v_liability_insurance_amount INTEGER;
    v_bond_amount INTEGER;
    v_license_fee_amount INTEGER;
    v_additional_fees_total INTEGER;
    v_cor_total INTEGER;
  BEGIN
  -- tenant isolation guard (20261113)
  IF pg_trigger_depth() = 0 AND public.is_api_request() AND NOT COALESCE((EXISTS (SELECT 1 FROM change_orders c WHERE c.id = recalculate_cor_totals.cor_id AND public.is_active_member(c.company_id))), false) THEN
    RAISE EXCEPTION 'Not authorized for this change order' USING ERRCODE = '42501';
  END IF;

    -- Get markup and fee percentages from the COR
    SELECT
      labor_markup_percent,
      materials_markup_percent,
      equipment_markup_percent,
      subcontractors_markup_percent,
      liability_insurance_percent,
      bond_percent,
      license_fee_percent
    INTO
      v_labor_markup_percent,
      v_materials_markup_percent,
      v_equipment_markup_percent,
      v_subcontractors_markup_percent,
      v_liability_insurance_percent,
      v_bond_percent,
      v_license_fee_percent
    FROM change_orders
    WHERE id = cor_id;

    -- Calculate labor subtotal
    SELECT COALESCE(SUM(total), 0)
    INTO v_labor_subtotal
    FROM change_order_labor
    WHERE change_order_id = cor_id;

    -- Calculate materials subtotal
    SELECT COALESCE(SUM(total), 0)
    INTO v_materials_subtotal
    FROM change_order_materials
    WHERE change_order_id = cor_id;

    -- Calculate equipment subtotal
    SELECT COALESCE(SUM(total), 0)
    INTO v_equipment_subtotal
    FROM change_order_equipment
    WHERE change_order_id = cor_id;

    -- Calculate subcontractors subtotal
    SELECT COALESCE(SUM(total), 0)
    INTO v_subcontractors_subtotal
    FROM change_order_subcontractors
    WHERE change_order_id = cor_id;

    -- Calculate markup amounts (basis points / 10000)
    v_labor_markup_amount := ROUND((v_labor_subtotal * v_labor_markup_percent)::NUMERIC / 10000);
    v_materials_markup_amount := ROUND((v_materials_subtotal * v_materials_markup_percent)::NUMERIC / 10000);
    v_equipment_markup_amount := ROUND((v_equipment_subtotal * v_equipment_markup_percent)::NUMERIC / 10000);
    v_subcontractors_markup_amount := ROUND((v_subcontractors_subtotal * v_subcontractors_markup_percent)::NUMERIC / 10000);

    -- Calculate COR subtotal (all costs + all markups)
    v_cor_subtotal := v_labor_subtotal + v_materials_subtotal + v_equipment_subtotal + v_subcontractors_subtotal
                    + v_labor_markup_amount + v_materials_markup_amount + v_equipment_markup_amount + v_subcontractors_markup_amount;

    -- Calculate additional fees
    v_liability_insurance_amount := ROUND((v_cor_subtotal * v_liability_insurance_percent)::NUMERIC / 10000);
    v_bond_amount := ROUND((v_cor_subtotal * v_bond_percent)::NUMERIC / 10000);
    v_license_fee_amount := ROUND((v_cor_subtotal * v_license_fee_percent)::NUMERIC / 10000);

    v_additional_fees_total := v_liability_insurance_amount + v_bond_amount + v_license_fee_amount;

    -- Calculate final COR total
    v_cor_total := v_cor_subtotal + v_additional_fees_total;

    -- Update the change_orders table
    UPDATE change_orders
    SET
      labor_subtotal = v_labor_subtotal,
      materials_subtotal = v_materials_subtotal,
      equipment_subtotal = v_equipment_subtotal,
      subcontractors_subtotal = v_subcontractors_subtotal,
      labor_markup_amount = v_labor_markup_amount,
      materials_markup_amount = v_materials_markup_amount,
      equipment_markup_amount = v_equipment_markup_amount,
      subcontractors_markup_amount = v_subcontractors_markup_amount,
      liability_insurance_amount = v_liability_insurance_amount,
      bond_amount = v_bond_amount,
      license_fee_amount = v_license_fee_amount,
      cor_subtotal = v_cor_subtotal,
      additional_fees_total = v_additional_fees_total,
      cor_total = v_cor_total,
      updated_at = NOW()
    WHERE id = cor_id;
  END;
  $function$;

CREATE OR REPLACE FUNCTION public.update_cor_aggregated_stats(p_cor_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$                                                                                                                                                                                                       
  DECLARE                                                                                                                                                                                                                                                    
    v_labor_hours DECIMAL(10,2) := 0;                                                                                                                                                                                                                        
    v_ot_hours DECIMAL(10,2) := 0;                                                                                                                                                                                                                           
    v_ticket_count INTEGER := 0;                                                                                                                                                                                                                             
    v_photo_count INTEGER := 0;                                                                                                                                                                                                                              
    v_verified_count INTEGER := 0;                                                                                                                                                                                                                           
  BEGIN                                                                                                                                                                                                                                                      
  -- tenant isolation guard (20261113)
  IF pg_trigger_depth() = 0 AND public.is_api_request() AND NOT COALESCE((EXISTS (SELECT 1 FROM change_orders c WHERE c.id = p_cor_id AND public.is_active_member(c.company_id))), false) THEN
    RAISE EXCEPTION 'Not authorized for this change order' USING ERRCODE = '42501';
  END IF;

    SELECT COALESCE(SUM(regular_hours), 0), COALESCE(SUM(overtime_hours), 0)                                                                                                                                                                                 
    INTO v_labor_hours, v_ot_hours FROM change_order_labor WHERE change_order_id = p_cor_id;                                                                                                                                                                 
                                                                                                                                                                                                                                                             
    SELECT COUNT(DISTINCT t.id), COALESCE(SUM(COALESCE(array_length(t.photos, 1), 0)), 0),                                                                                                                                                                   
           COUNT(DISTINCT CASE WHEN t.client_signature_data IS NOT NULL THEN t.id END)                                                                                                                                                                       
    INTO v_ticket_count, v_photo_count, v_verified_count                                                                                                                                                                                                     
    FROM change_order_ticket_associations cota                                                                                                                                                                                                               
    JOIN t_and_m_tickets t ON t.id = cota.ticket_id                                                                                                                                                                                                          
    WHERE cota.change_order_id = p_cor_id;                                                                                                                                                                                                                   
                                                                                                                                                                                                                                                             
    UPDATE change_orders SET total_labor_hours = v_labor_hours, total_overtime_hours = v_ot_hours,                                                                                                                                                           
      ticket_count = v_ticket_count, photo_count = v_photo_count, verified_ticket_count = v_verified_count                                                                                                                                                   
    WHERE id = p_cor_id;                                                                                                                                                                                                                                     
  END;                                                                                                                                                                                                                                                       
  $function$;

CREATE OR REPLACE FUNCTION public.check_ticket_cor_integrity()
 RETURNS TABLE(ticket_id uuid, assigned_cor_id uuid, junction_cor_id uuid, issue text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$                                                                                                                                                                               
  BEGIN                                                                                                                                                                               
  -- tenant isolation guard (20261113)
  IF public.is_api_request() AND NOT COALESCE((public.is_platform_admin()), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

    RETURN QUERY                                                                                                                                                                      
    -- Find tickets where assigned_cor_id is set but no junction record exists                                                                                                        
    SELECT                                                                                                                                                                            
      t.id as ticket_id,                                                                                                                                                              
      t.assigned_cor_id,                                                                                                                                                              
      NULL::UUID as junction_cor_id,                                                                                                                                                  
      'Missing junction record'::TEXT as issue                                                                                                                                        
    FROM t_and_m_tickets t                                                                                                                                                            
    WHERE t.assigned_cor_id IS NOT NULL                                                                                                                                               
      AND NOT EXISTS (                                                                                                                                                                
        SELECT 1 FROM change_order_ticket_associations a                                                                                                                              
        WHERE a.ticket_id = t.id AND a.change_order_id = t.assigned_cor_id                                                                                                            
      )                                                                                                                                                                               
                                                                                                                                                                                      
    UNION ALL                                                                                                                                                                         
                                                                                                                                                                                      
    -- Find junction records where ticket's assigned_cor_id doesn't match                                                                                                             
    SELECT                                                                                                                                                                            
      a.ticket_id,                                                                                                                                                                    
      t.assigned_cor_id,                                                                                                                                                              
      a.change_order_id as junction_cor_id,                                                                                                                                           
      'Mismatched assigned_cor_id'::TEXT as issue                                                                                                                                     
    FROM change_order_ticket_associations a                                                                                                                                           
    JOIN t_and_m_tickets t ON t.id = a.ticket_id                                                                                                                                      
    WHERE t.assigned_cor_id IS NULL OR t.assigned_cor_id != a.change_order_id;                                                                                                        
  END;                                                                                                                                                                                
  $function$;

CREATE OR REPLACE FUNCTION public.fix_ticket_cor_integrity()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$                                                                                                                                                                               
  DECLARE                                                                                                                                                                             
    fixed_count INTEGER := 0;                                                                                                                                                         
  BEGIN                                                                                                                                                                               
  -- tenant isolation guard (20261113)
  IF public.is_api_request() AND NOT COALESCE((public.is_platform_admin()), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

    -- Fix tickets with assigned_cor_id but no junction record                                                                                                                        
    INSERT INTO change_order_ticket_associations (change_order_id, ticket_id, data_imported)                                                                                          
    SELECT t.assigned_cor_id, t.id, false                                                                                                                                             
    FROM t_and_m_tickets t                                                                                                                                                            
    WHERE t.assigned_cor_id IS NOT NULL                                                                                                                                               
      AND NOT EXISTS (                                                                                                                                                                
        SELECT 1 FROM change_order_ticket_associations a                                                                                                                              
        WHERE a.ticket_id = t.id AND a.change_order_id = t.assigned_cor_id                                                                                                            
      )                                                                                                                                                                               
    ON CONFLICT (change_order_id, ticket_id) DO NOTHING;                                                                                                                              
                                                                                                                                                                                      
    GET DIAGNOSTICS fixed_count = ROW_COUNT;                                                                                                                                          
                                                                                                                                                                                      
    -- Fix junction records where ticket's assigned_cor_id doesn't match                                                                                                              
    UPDATE t_and_m_tickets t                                                                                                                                                          
    SET assigned_cor_id = a.change_order_id                                                                                                                                           
    FROM change_order_ticket_associations a                                                                                                                                           
    WHERE a.ticket_id = t.id                                                                                                                                                          
      AND (t.assigned_cor_id IS NULL OR t.assigned_cor_id != a.change_order_id);                                                                                                      
                                                                                                                                                                                      
    RETURN fixed_count;                                                                                                                                                               
  END;                                                                                                                                                                                
  $function$;

CREATE OR REPLACE FUNCTION public.get_project_dashboard_summary(p_company_id uuid)
 RETURNS TABLE(project_id uuid, project_name text, project_status text, project_number text, project_address text, project_pin text, contract_value numeric, work_type text, job_type text, general_contractor text, total_areas bigint, completed_areas bigint, in_progress_areas bigint, pending_areas bigint, total_tickets bigint, pending_tickets bigint, submitted_tickets bigint, approved_tickets bigint, total_labor_hours numeric, today_labor_hours numeric, today_worker_count bigint, last_activity_at timestamp with time zone, daily_reports_this_week bigint, cor_count bigint, pending_cor_count bigint, disposal_loads_today bigint, created_at timestamp with time zone, start_date date, end_date date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id AS project_id,
    p.name AS project_name,
    p.status AS project_status,
    p.job_number AS project_number,
    p.address AS project_address,
    p.pin AS project_pin,
    COALESCE(p.contract_value, 0) AS contract_value,
    COALESCE(p.work_type, 'demolition') AS work_type,
    COALESCE(p.job_type, 'standard') AS job_type,
    COALESCE(p.general_contractor, '') AS general_contractor,
    COALESCE(a.total, 0) AS total_areas,
    COALESCE(a.completed, 0) AS completed_areas,
    COALESCE(a.in_progress, 0) AS in_progress_areas,
    COALESCE(a.pending, 0) AS pending_areas,
    COALESCE(t.total, 0) AS total_tickets,
    COALESCE(t.pending, 0) AS pending_tickets,
    COALESCE(t.submitted, 0) AS submitted_tickets,
    COALESCE(t.approved, 0) AS approved_tickets,
    COALESCE(c.total_hours, 0) AS total_labor_hours,
    COALESCE(c.today_hours, 0) AS today_labor_hours,
    COALESCE(c.today_workers, 0) AS today_worker_count,
    GREATEST(p.updated_at, a.last_update, t.last_update, c.last_checkin, dr.last_report) AS last_activity_at,
    COALESCE(dr.this_week, 0) AS daily_reports_this_week,
    COALESCE(cor.total, 0) AS cor_count,
    COALESCE(cor.pending, 0) AS pending_cor_count,
    COALESCE(disp.today_count, 0) AS disposal_loads_today,
    p.created_at,
    p.start_date,
    p.end_date
  FROM projects p
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'done' OR status = 'completed') AS completed,
      COUNT(*) FILTER (WHERE status = 'in_progress' OR status = 'active') AS in_progress,
      COUNT(*) FILTER (WHERE status = 'pending' OR status = 'not_started') AS pending,
      MAX(updated_at) AS last_update
    FROM areas
    WHERE project_id = p.id
  ) a ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status IN ('pending', 'foreman_signed', 'client_signed')) AS pending,
      COUNT(*) FILTER (WHERE status IN ('foreman_signed', 'client_signed')) AS submitted,
      COUNT(*) FILTER (WHERE status = 'approved') AS approved,
      MAX(updated_at) AS last_update
    FROM t_and_m_tickets
    WHERE project_id = p.id
  ) t ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      SUM(jsonb_array_length(COALESCE(workers, '[]'::jsonb))) AS total_hours,
      SUM(CASE WHEN check_in_date = CURRENT_DATE THEN jsonb_array_length(COALESCE(workers, '[]'::jsonb)) ELSE 0 END) AS today_hours,
      SUM(CASE WHEN check_in_date = CURRENT_DATE THEN jsonb_array_length(COALESCE(workers, '[]'::jsonb)) ELSE 0 END) AS today_workers,
      MAX(check_in_date) AS last_checkin
    FROM crew_checkins
    WHERE project_id = p.id
  ) c ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS this_week,
      MAX(report_date) AS last_report
    FROM daily_reports
    WHERE project_id = p.id
      AND report_date >= CURRENT_DATE - INTERVAL '7 days'
  ) dr ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'pending_approval') AS pending
    FROM change_orders
    WHERE project_id = p.id
  ) cor ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS today_count
    FROM disposal_loads
    WHERE project_id = p.id
      AND work_date = CURRENT_DATE
  ) disp ON TRUE
  WHERE p.company_id = p_company_id
    -- tenant isolation guard (20261113)
    AND (public.is_active_member(p_company_id) OR NOT public.is_api_request())
  ORDER BY
    CASE p.status
      WHEN 'active' THEN 0
      WHEN 'on_hold' THEN 1
      ELSE 2
    END,
    p.name;
$function$;

CREATE OR REPLACE FUNCTION public.get_project_storage_bytes(p_project_id uuid)
 RETURNS TABLE(total_bytes bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT COALESCE(SUM(file_size_bytes), 0)::BIGINT AS total_bytes
  FROM documents
  WHERE project_id = p_project_id
    AND archived_at IS NULL
    -- tenant isolation guard (20261113)
    AND (public.can_access_project(p_project_id) OR NOT public.is_api_request());
$function$;

CREATE OR REPLACE FUNCTION public.get_company_settings(p_company_id uuid)
 RETURNS TABLE(id uuid, name text, code character varying, office_code text, subscription_tier text, trade text, company_type text, field_supervisor_label text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  -- tenant isolation guard (20261113)
  IF public.is_api_request() AND NOT COALESCE((public.is_active_member(p_company_id)), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    companies.id,
    companies.name,
    companies.code,
    companies.office_code,
    companies.subscription_tier,
    companies.trade,
    companies.company_type,
    companies.field_supervisor_label
  FROM companies
  WHERE companies.id = p_company_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_unbilled_work_summary(p_company_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  result JSON;
BEGIN
  -- tenant isolation guard (20261113)
  IF public.is_api_request() AND NOT COALESCE((public.is_active_member(p_company_id)), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT json_build_object(
    'cor_count', (SELECT COUNT(*) FROM unbilled_cors WHERE company_id = p_company_id),
    'cor_total', COALESCE((SELECT SUM(cor_total) FROM unbilled_cors WHERE company_id = p_company_id), 0),
    'ticket_count', (SELECT COUNT(*) FROM unbilled_tickets WHERE company_id = p_company_id),
    'ticket_total', COALESCE((SELECT SUM(change_order_value * 100) FROM unbilled_tickets WHERE company_id = p_company_id), 0),
    'total_unbilled', COALESCE((SELECT SUM(cor_total) FROM unbilled_cors WHERE company_id = p_company_id), 0) +
                      COALESCE((SELECT SUM(change_order_value * 100) FROM unbilled_tickets WHERE company_id = p_company_id), 0)
  ) INTO result;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_injury_statistics(comp_id uuid, start_date date DEFAULT NULL::date, end_date date DEFAULT NULL::date)
 RETURNS TABLE(total_incidents bigint, minor_injuries bigint, serious_injuries bigint, critical_injuries bigint, near_misses bigint, first_aid bigint, osha_recordable bigint, total_days_away bigint, total_restricted_days bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  BEGIN
  -- tenant isolation guard (20261113)
  IF public.is_api_request() AND NOT COALESCE((public.is_active_member(comp_id)), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

    RETURN QUERY
    SELECT
      COUNT(*)::BIGINT as total_incidents,
      COUNT(*) FILTER (WHERE injury_type = 'minor')::BIGINT as minor_injuries,
      COUNT(*) FILTER (WHERE injury_type = 'serious')::BIGINT as serious_injuries,
      COUNT(*) FILTER (WHERE injury_type = 'critical')::BIGINT as critical_injuries,
      COUNT(*) FILTER (WHERE injury_type = 'near_miss')::BIGINT as near_misses,
      COUNT(*) FILTER (WHERE injury_type = 'first_aid')::BIGINT as first_aid,
      COUNT(*) FILTER (WHERE ir.osha_recordable = true)::BIGINT as osha_recordable,
      COALESCE(SUM(days_away_from_work), 0)::BIGINT as total_days_away,
      COALESCE(SUM(restricted_work_days), 0)::BIGINT as total_restricted_days
    FROM injury_reports ir
    WHERE ir.company_id = comp_id
      AND (start_date IS NULL OR ir.incident_date >= start_date)
      AND (end_date IS NULL OR ir.incident_date <= end_date);
  END;
  $function$;

CREATE OR REPLACE FUNCTION public.get_user_companies(p_user_id uuid)
 RETURNS TABLE(company_id uuid, company_name text, company_field_code text, user_role text, is_active boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  -- tenant isolation guard (20261113)
  IF public.is_api_request() AND NOT COALESCE((auth.uid() IS NOT NULL AND auth.uid() = p_user_id), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.field_code,
    uc.role,
    (c.id = u.active_company_id) as is_active
  FROM user_companies uc
  JOIN companies c ON c.id = uc.company_id
  JOIN users u ON u.id = uc.user_id
  WHERE uc.user_id = p_user_id
  ORDER BY c.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_cor_log(p_project_id uuid)
 RETURNS TABLE(id uuid, log_number integer, date_sent_to_client date, ce_number character varying, comments text, created_at timestamp with time zone, updated_at timestamp with time zone, cor_id uuid, cor_number character varying, cor_title text, cor_total numeric, cor_status character varying, cor_created_at timestamp with time zone, cor_approved_at timestamp with time zone, cor_approved_by text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$                                                                                                                                                                                                                                                    
  BEGIN                                                                                                                                                                                                                                                      
  -- tenant isolation guard (20261113)
  IF public.is_api_request() AND NOT COALESCE((auth.uid() IS NOT NULL AND public.can_access_project(p_project_id)), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

    RETURN QUERY                                                                                                                                                                                                                                             
    SELECT                                                                                                                                                                                                                                                   
      cle.id,                                                                                                                                                                                                                                                
      cle.log_number,                                                                                                                                                                                                                                        
      cle.date_sent_to_client,                                                                                                                                                                                                                               
      cle.ce_number,                                                                                                                                                                                                                                         
      cle.comments,                                                                                                                                                                                                                                          
      cle.created_at,                                                                                                                                                                                                                                        
      cle.updated_at,                                                                                                                                                                                                                                        
      co.id AS cor_id,                                                                                                                                                                                                                                       
      co.cor_number,                                                                                                                                                                                                                                         
      co.title AS cor_title,                                                                                                                                                                                                                                 
      co.cor_total,                                                                                                                                                                                                                                          
      co.status AS cor_status,                                                                                                                                                                                                                               
      co.created_at AS cor_created_at,                                                                                                                                                                                                                       
      co.approved_at AS cor_approved_at,                                                                                                                                                                                                                     
      co.approved_by_name AS cor_approved_by                                                                                                                                                                                                                 
    FROM cor_log_entries cle                                                                                                                                                                                                                                 
    INNER JOIN change_orders co ON cle.change_order_id = co.id                                                                                                                                                                                               
    WHERE cle.project_id = p_project_id                                                                                                                                                                                                                      
    ORDER BY cle.log_number ASC;                                                                                                                                                                                                                             
  END;                                                                                                                                                                                                                                                       
  $function$;

CREATE OR REPLACE FUNCTION public.get_daily_disposal_loads(p_project_id uuid, p_date date)
 RETURNS TABLE(id uuid, load_type disposal_load_type, load_count integer, notes text, user_id uuid, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$                                                                                                                                                                               
  BEGIN                                                                                                                                                                               
  -- tenant isolation guard (20261113)
  IF public.is_api_request() AND NOT COALESCE((public.can_access_project(p_project_id)), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

    RETURN QUERY                                                                                                                                                                      
    SELECT                                                                                                                                                                            
      dl.id,                                                                                                                                                                          
      dl.load_type,                                                                                                                                                                   
      dl.load_count,                                                                                                                                                                  
      dl.notes,                                                                                                                                                                       
      dl.user_id,                                                                                                                                                                     
      dl.created_at                                                                                                                                                                   
    FROM disposal_loads dl                                                                                                                                                            
    WHERE dl.project_id = p_project_id                                                                                                                                                
      AND dl.work_date = p_date                                                                                                                                                       
    ORDER BY dl.created_at DESC;                                                                                                                                                      
  END;                                                                                                                                                                                
  $function$;

CREATE OR REPLACE FUNCTION public.get_disposal_summary(p_project_id uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
 RETURNS TABLE(load_type disposal_load_type, total_loads bigint, days_with_activity bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$                                                                                                                                                                               
  BEGIN                                                                                                                                                                               
  -- tenant isolation guard (20261113)
  IF public.is_api_request() AND NOT COALESCE((public.can_access_project(p_project_id)), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

    RETURN QUERY                                                                                                                                                                      
    SELECT                                                                                                                                                                            
      dl.load_type,                                                                                                                                                                   
      SUM(dl.load_count)::BIGINT as total_loads,                                                                                                                                      
      COUNT(DISTINCT dl.work_date)::BIGINT as days_with_activity                                                                                                                      
    FROM disposal_loads dl                                                                                                                                                            
    WHERE dl.project_id = p_project_id                                                                                                                                                
      AND (p_start_date IS NULL OR dl.work_date >= p_start_date)                                                                                                                      
      AND (p_end_date IS NULL OR dl.work_date <= p_end_date)                                                                                                                          
    GROUP BY dl.load_type                                                                                                                                                             
    ORDER BY total_loads DESC;                                                                                                                                                        
  END;                                                                                                                                                                                
  $function$;

CREATE OR REPLACE FUNCTION public.get_next_cor_number(p_project_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  max_num INTEGER := 0;
  cur_num INTEGER;
  rec RECORD;
BEGIN
  -- tenant isolation guard (20261113)
  IF public.is_api_request() AND NOT COALESCE((public.can_access_project(p_project_id)), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Lock the project row to serialize concurrent COR creation
  PERFORM id FROM projects WHERE id = p_project_id FOR UPDATE;

  FOR rec IN
    SELECT cor_number FROM change_orders WHERE project_id = p_project_id
  LOOP
    IF rec.cor_number ~ '^COR #(\d+)$' THEN
      cur_num := (regexp_match(rec.cor_number, '^COR #(\d+)$'))[1]::INTEGER;
      IF cur_num > max_num THEN
        max_num := cur_num;
      END IF;
    END IF;
  END LOOP;

  RETURN 'COR #' || (max_num + 1);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_labor_classes_for_field(p_company_id uuid)
 RETURNS TABLE(id uuid, name text, category_id uuid, category_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  -- tenant isolation guard (20261113)
  IF public.is_api_request() AND NOT COALESCE((public.can_access_company(p_company_id)), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    lc.id,
    lc.name,
    lc.category_id,
    cat.name as category_name
  FROM labor_classes lc
  LEFT JOIN labor_categories cat ON cat.id = lc.category_id
  WHERE lc.company_id = p_company_id
    AND lc.active = true
  ORDER BY cat.name NULLS LAST, lc.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_cor_log_entry(p_entry_id uuid, p_date_sent_to_client date DEFAULT NULL::date, p_ce_number character varying DEFAULT NULL::character varying, p_comments text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$                                                                                                                                                                                                                                       
  DECLARE                                                                                                                                                                                                                                                    
    v_entry cor_log_entries%ROWTYPE;                                                                                                                                                                                                                         
  BEGIN                                                                                                                                                                                                                                                      
  -- tenant isolation guard (20261113)
  IF public.is_api_request() AND NOT COALESCE((EXISTS (SELECT 1 FROM cor_log_entries e WHERE e.id = p_entry_id AND public.is_active_member(e.company_id))), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

    SELECT * INTO v_entry FROM cor_log_entries WHERE id = p_entry_id;                                                                                                                                                                                        
                                                                                                                                                                                                                                                             
    IF v_entry.id IS NULL THEN                                                                                                                                                                                                                               
      RETURN json_build_object('success', false, 'error', 'Entry not found');                                                                                                                                                                                
    END IF;                                                                                                                                                                                                                                                  
                                                                                                                                                                                                                                                             
    UPDATE cor_log_entries SET                                                                                                                                                                                                                               
      date_sent_to_client = COALESCE(p_date_sent_to_client, date_sent_to_client),                                                                                                                                                                            
      ce_number = COALESCE(p_ce_number, ce_number),                                                                                                                                                                                                          
      comments = COALESCE(p_comments, comments),                                                                                                                                                                                                             
      updated_at = NOW()                                                                                                                                                                                                                                     
    WHERE id = p_entry_id;                                                                                                                                                                                                                                   
                                                                                                                                                                                                                                                             
    SELECT * INTO v_entry FROM cor_log_entries WHERE id = p_entry_id;                                                                                                                                                                                        
                                                                                                                                                                                                                                                             
    RETURN json_build_object('success', true, 'entry', row_to_json(v_entry));                                                                                                                                                                                
  END;                                                                                                                                                                                                                                                       
  $function$;

CREATE OR REPLACE FUNCTION public.request_cor_export(p_cor_id uuid, p_idempotency_key text, p_options jsonb DEFAULT '{}'::jsonb, p_requested_by uuid DEFAULT NULL::uuid)
 RETURNS TABLE(job_id uuid, status text, is_new boolean, snapshot_id uuid, pdf_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$                                                                                                                                                                                                                    
  DECLARE                                                                                                                                                                                                                                                    
    v_existing_job cor_export_jobs%ROWTYPE;                                                                                                                                                                                                                  
    v_new_job_id UUID;                                                                                                                                                                                                                                       
  BEGIN                                                                                                                                                                                                                                                      
  -- tenant isolation guard (20261113)
  IF public.is_api_request() AND NOT COALESCE((EXISTS (SELECT 1 FROM change_orders c WHERE c.id = p_cor_id AND public.is_active_member(c.company_id))), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

    SELECT * INTO v_existing_job FROM cor_export_jobs WHERE cor_export_jobs.idempotency_key = p_idempotency_key;                                                                                                                                             
    IF FOUND THEN                                                                                                                                                                                                                                            
      RETURN QUERY SELECT v_existing_job.id, v_existing_job.status, FALSE, v_existing_job.snapshot_id, v_existing_job.pdf_url;                                                                                                                               
      RETURN;                                                                                                                                                                                                                                                
    END IF;                                                                                                                                                                                                                                                  
    INSERT INTO cor_export_jobs (cor_id, idempotency_key, options, requested_by, status)                                                                                                                                                                     
    VALUES (p_cor_id, p_idempotency_key, p_options, p_requested_by, 'pending')                                                                                                                                                                               
    RETURNING id INTO v_new_job_id;                                                                                                                                                                                                                          
    RETURN QUERY SELECT v_new_job_id, 'pending'::TEXT, TRUE, NULL::UUID, NULL::TEXT;                                                                                                                                                                         
  END;                                                                                                                                                                                                                                                       
  $function$;

CREATE OR REPLACE FUNCTION public.save_cor_snapshot(p_snapshot_id uuid, p_cor_id uuid, p_job_id text, p_cor_version integer, p_cor_data jsonb, p_tickets_data jsonb, p_photos_manifest jsonb, p_totals jsonb, p_checksum text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  result JSONB;
  user_id UUID;
BEGIN
  -- tenant isolation guard (20261113)
  IF public.is_api_request() AND NOT COALESCE((EXISTS (SELECT 1 FROM change_orders c WHERE c.id = p_cor_id AND public.is_active_member(c.company_id))), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Get current user
  user_id := auth.uid();

  -- Step 1: Mark all previous snapshots as not current
  UPDATE cor_export_snapshots
    SET is_current = FALSE
    WHERE cor_id = p_cor_id;

  -- Step 2: Insert new snapshot
  INSERT INTO cor_export_snapshots (
    id, cor_id, job_id, cor_version, cor_data, tickets_data,
    photos_manifest, totals_snapshot, checksum, is_current, exported_by
  ) VALUES (
    p_snapshot_id, p_cor_id, p_job_id, p_cor_version, p_cor_data, p_tickets_data,
    p_photos_manifest, p_totals, p_checksum, TRUE, user_id
  );

  -- Step 3: Update COR's last snapshot version
  UPDATE change_orders
    SET last_snapshot_version = p_cor_version
    WHERE id = p_cor_id;

  -- Return the new snapshot as JSON
  SELECT to_jsonb(s.*) INTO result
    FROM cor_export_snapshots s
    WHERE s.id = p_snapshot_id;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_export_job_status(p_job_id uuid, p_status text, p_snapshot_id uuid DEFAULT NULL::uuid, p_pdf_url text DEFAULT NULL::text, p_error text DEFAULT NULL::text, p_error_details jsonb DEFAULT NULL::jsonb, p_metrics jsonb DEFAULT NULL::jsonb)
 RETURNS cor_export_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$                                                                                                                                                                                          
  DECLARE v_job cor_export_jobs%ROWTYPE;                                                                                                                                                                                                                     
  BEGIN                                                                                                                                                                                                                                                      
  -- tenant isolation guard (20261113)
  IF public.is_api_request() AND NOT COALESCE((EXISTS (SELECT 1 FROM cor_export_jobs j JOIN change_orders c ON c.id = j.cor_id WHERE j.id = p_job_id AND public.is_active_member(c.company_id))), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

    UPDATE cor_export_jobs SET                                                                                                                                                                                                                               
      status = p_status, snapshot_id = COALESCE(p_snapshot_id, snapshot_id), pdf_url = COALESCE(p_pdf_url, pdf_url),                                                                                                                                         
      last_error = COALESCE(p_error, last_error), error_details = COALESCE(p_error_details, error_details),                                                                                                                                                  
      started_at = CASE WHEN p_status = 'generating' THEN NOW() ELSE started_at END,                                                                                                                                                                         
      completed_at = CASE WHEN p_status IN ('completed', 'failed') THEN NOW() ELSE completed_at END,                                                                                                                                                         
      generation_time_ms = CASE WHEN p_status = 'completed' AND started_at IS NOT NULL THEN EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000 ELSE generation_time_ms END,                                                                                     
      photo_count = COALESCE((p_metrics->>'photo_count')::INTEGER, photo_count),                                                                                                                                                                             
      ticket_count = COALESCE((p_metrics->>'ticket_count')::INTEGER, ticket_count),                                                                                                                                                                          
      page_count = COALESCE((p_metrics->>'page_count')::INTEGER, page_count),                                                                                                                                                                                
      pdf_size_bytes = COALESCE((p_metrics->>'pdf_size_bytes')::INTEGER, pdf_size_bytes),                                                                                                                                                                    
      retry_count = CASE WHEN p_status = 'failed' THEN retry_count + 1 ELSE retry_count END,                                                                                                                                                                 
      updated_at = NOW()                                                                                                                                                                                                                                     
    WHERE id = p_job_id RETURNING * INTO v_job;                                                                                                                                                                                                              
    RETURN v_job;                                                                                                                                                                                                                                            
  END;                                                                                                                                                                                                                                                       
  $function$;

CREATE OR REPLACE FUNCTION public.switch_active_company(p_user_id uuid, p_company_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  -- tenant isolation guard (20261113)
  IF public.is_api_request() AND NOT COALESCE((auth.uid() IS NOT NULL AND auth.uid() = p_user_id AND public.is_active_member(p_company_id)), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE users SET active_company_id = p_company_id WHERE id = p_user_id;
  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_pin_and_create_session(p_pin text, p_company_code text, p_device_id text DEFAULT NULL::text, p_ip_address text DEFAULT NULL::text, p_remember boolean DEFAULT false)
 RETURNS TABLE(success boolean, session_token text, project_id uuid, project_name text, company_id uuid, company_name text, error_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  is_rate_limited BOOLEAN; found_project RECORD; found_company RECORD;
  new_token TEXT; clean_pin TEXT; clean_code TEXT; session_duration INTERVAL;
BEGIN
  clean_pin := TRIM(p_pin); clean_code := UPPER(TRIM(p_company_code));
  session_duration := CASE WHEN p_remember THEN interval '30 days' ELSE interval '12 hours' END;
  is_rate_limited := NOT check_rate_limit(p_ip_address, p_device_id, 15, 5);
  IF is_rate_limited THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_rate_limited');
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, 'RATE_LIMITED'::TEXT; RETURN;
  END IF;
  SELECT c.* INTO found_company FROM companies c WHERE UPPER(c.code) = clean_code;
  IF found_company IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid_company');
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, 'INVALID_COMPANY'::TEXT; RETURN;
  END IF;
  -- tenant isolation guard (20261113): cap wrong PINs per company, whatever
  -- device or address the caller claims to be
  IF (SELECT COUNT(*) FROM auth_attempts a
      WHERE a.success = FALSE
        AND a.attempt_type = 'pin_invalid:' || found_company.id::text
        AND a.created_at > NOW() - interval '15 minutes') >= 20 THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_rate_limited');
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, 'RATE_LIMITED'::TEXT; RETURN;
  END IF;
  SELECT p.* INTO found_project FROM projects p
  WHERE p.company_id = found_company.id AND p.pin_hash IS NOT NULL
    AND crypt(clean_pin, p.pin_hash) = p.pin_hash;
  IF found_project IS NULL THEN
    SELECT p.* INTO found_project FROM projects p
    WHERE TRIM(p.pin) = clean_pin AND p.company_id = found_company.id;
  END IF;
  IF found_project IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid:' || found_company.id::text);
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, 'INVALID_PIN'::TEXT; RETURN;
  END IF;
  new_token := encode(gen_random_bytes(32), 'hex');
  IF p_device_id IS NOT NULL THEN
    DELETE FROM field_sessions fs WHERE fs.device_id = p_device_id AND fs.project_id = found_project.id;
  END IF;
  INSERT INTO field_sessions (project_id, company_id, session_token, device_id, expires_at)
  VALUES (found_project.id, found_company.id, new_token, p_device_id, NOW() + session_duration);
  PERFORM log_auth_attempt(p_ip_address, p_device_id, TRUE, 'pin');
  RETURN QUERY SELECT true, new_token, found_project.id, found_project.name, found_company.id, found_company.name, NULL::TEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.repair_legacy_user(p_user_id uuid, p_company_id uuid, p_role text DEFAULT 'member'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  -- Tenant isolation (20261113): this function used to turn the company on a
  -- user's own profile row into an ACTIVE membership, with the role the caller
  -- asked for. A user can edit that row, so anyone could join any company as
  -- an administrator, a pending request was approved without an admin, and a
  -- removed member was let back in. Memberships now come only from
  -- register_company, an invitation, or an administrator's approval.
  -- It reports whether an active membership already exists and changes nothing.
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: Can only repair own account';
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM user_companies
    WHERE user_id = p_user_id
      AND company_id = p_company_id
      AND status = 'active'
  );
END;
$function$;

-- ------------------------------------------------------------
-- 6. Function access
-- ------------------------------------------------------------
-- Internal helpers and unused legacy functions: not callable through the API
REVOKE ALL ON FUNCTION public.check_rate_limit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_auth_attempt(text, text, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_expired_sessions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_old_auth_attempts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_project_by_pin_secure(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_invitation(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_user_to_company(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upgrade_subscription(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_demo_company(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_invitation(uuid, text, text, uuid, text, text, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_company_office_pin(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_field_access(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_old_invitations() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_notifications_for_event(uuid, uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_default_notification_settings(uuid) FROM PUBLIC, anon, authenticated;

-- Office functions: signed-in users only
REVOKE ALL ON FUNCTION public.approve_membership_with_role(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_membership_with_role(uuid, uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.assign_ticket_to_cor(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_ticket_to_cor(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.unassign_ticket_from_cor(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unassign_ticket_from_cor(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_project_dashboard_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_project_dashboard_summary(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_company_settings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_settings(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_unbilled_work_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_unbilled_work_summary(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_injury_statistics(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_injury_statistics(uuid, date, date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_user_companies(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_companies(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_cor_log(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cor_log(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_cor_log_entry(uuid, date, character varying, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_cor_log_entry(uuid, date, character varying, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.request_cor_export(uuid, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_cor_export(uuid, text, jsonb, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_cor_snapshot(uuid, uuid, text, integer, jsonb, jsonb, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_cor_snapshot(uuid, uuid, text, integer, jsonb, jsonb, jsonb, jsonb, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_export_job_status(uuid, text, uuid, text, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_export_job_status(uuid, text, uuid, text, text, jsonb, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.switch_active_company(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.switch_active_company(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.check_ticket_cor_integrity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_ticket_cor_integrity() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fix_ticket_cor_integrity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fix_ticket_cor_integrity() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.repair_legacy_user(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repair_legacy_user(uuid, uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_invitation(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_invite_token(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invite_token(text, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.register_company(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_company(uuid, text, text, text, text, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 7. Verify
-- ------------------------------------------------------------
DO $$
DECLARE
  v_bad TEXT;
BEGIN
  SELECT string_agg(tablename || ': ' || policyname, '; ') INTO v_bad
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (qual = 'true' OR with_check = 'true')
    AND (tablename, policyname) NOT IN (
      ('error_log', 'Platform admins can insert error_log'),
      ('query_metrics', 'Platform admins can insert query_metrics'));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'tenant isolation: open policies remain: %', v_bad;
  END IF;

  SELECT string_agg(c.relname, ', ') INTO v_bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'tenant isolation: tables without row security: %', v_bad;
  END IF;

  RAISE NOTICE 'tenant isolation hardening applied';
END $$;

COMMIT;
