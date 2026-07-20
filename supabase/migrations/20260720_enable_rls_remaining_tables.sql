-- ============================================================
-- ENABLE RLS ON ALL REMAINING TABLES
--
-- 26 tables were flagged as having Row Level Security disabled.
-- This migration:
--   1. Creates three SECURITY DEFINER helper functions
--      (is_platform_admin, user_company_ids, user_admin_company_ids)
--      so policies never recurse into RLS-protected tables.
--   2. Enables RLS on every flagged table that exists.
--   3. Adds explicit policies for the five tables the frontend
--      queries directly (activity_log, cor_export_snapshots,
--      notification_preferences, notification_presets,
--      photo_audit_log) so nothing user-facing breaks.
--   4. Adds admin-only policies for platform_admins, promo_codes,
--      templates (+ template_items, role_templates, subscriptions).
--   5. Applies a generic column-aware policy set to the remaining
--      tables: company-scoped if the table has company_id,
--      own-row if it has user_id, project→company-scoped if it
--      has project_id, otherwise platform-admin only.
--   6. Leaves _backup_user_companies_roles with RLS enabled and
--      NO policies (deny-all; service role / SQL editor only).
--
-- Several of these tables were created ad hoc in the Supabase
-- dashboard and are not defined in this repo, so every step is
-- guarded: missing tables are skipped with a NOTICE, and policies
-- that reference a column are only created when the column exists.
--
-- NOTE: SECURITY DEFINER functions and triggers owned by the
-- table owner bypass RLS, so server-side logging paths
-- (field_access_log, field_activity_log, etc.) keep working.
--
-- IDEMPOTENT — safe to re-run in the Supabase SQL Editor.
-- ============================================================

-- ============================================================
-- 1. HELPER FUNCTIONS (SECURITY DEFINER to avoid RLS recursion)
-- ============================================================

-- True when the current auth user is a platform admin.
-- SECURITY DEFINER so the lookup is not blocked by RLS on
-- platform_admins itself (which would otherwise self-recurse).
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_admins pa WHERE pa.user_id = auth.uid()
  );
$$;

-- Companies the current auth user is an active member of.
CREATE OR REPLACE FUNCTION user_company_ids()
RETURNS SETOF UUID
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT uc.company_id
  FROM user_companies uc
  WHERE uc.user_id = auth.uid()
    AND (uc.status = 'active' OR uc.status IS NULL);
$$;

-- Companies the current auth user administers.
CREATE OR REPLACE FUNCTION user_admin_company_ids()
RETURNS SETOF UUID
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT uc.company_id
  FROM user_companies uc
  WHERE uc.user_id = auth.uid()
    AND (uc.status = 'active' OR uc.status IS NULL)
    AND uc.access_level = 'administrator';
$$;

REVOKE ALL ON FUNCTION is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION user_company_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION user_admin_company_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_platform_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION user_company_ids() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION user_admin_company_ids() TO anon, authenticated;

-- ============================================================
-- 2. ENABLE RLS ON EVERY FLAGGED TABLE THAT EXISTS
-- ============================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'activity_log', 'company_categories', 'company_settings',
    'cor_export_snapshots', 'external_notification_recipients',
    'field_access_log', 'field_activity_log',
    'notification_preferences', 'notification_presets',
    'notification_roles', 'notification_settings',
    'notification_types', 'notifications', 'photo_audit_log',
    'platform_admins', 'promo_codes', 'project_user_permissions',
    'project_permissions', 'role_templates', 'subscriptions',
    'template_items', 'templates', 'user_invitations',
    'user_notification_roles', '_backup_user_companies_roles'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    ELSE
      RAISE NOTICE 'Table public.% does not exist — skipped', t;
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- 3. EXPLICIT POLICIES FOR APP-FACING TABLES
-- ============================================================

-- ---- activity_log (user_id, project_id, area_id) -----------
-- Read: members of the project's company. Write: authenticated
-- users logging their own actions on their companies' projects.
DO $$
BEGIN
  IF to_regclass('public.activity_log') IS NULL THEN RETURN; END IF;

  DROP POLICY IF EXISTS "Company members view activity" ON activity_log;
  CREATE POLICY "Company members view activity"
    ON activity_log FOR SELECT
    USING (
      is_platform_admin()
      OR project_id IN (
        SELECT p.id FROM projects p
        WHERE p.company_id IN (SELECT user_company_ids())
      )
    );

  DROP POLICY IF EXISTS "Company members log own activity" ON activity_log;
  CREATE POLICY "Company members log own activity"
    ON activity_log FOR INSERT
    WITH CHECK (
      user_id = auth.uid()
      AND project_id IN (
        SELECT p.id FROM projects p
        WHERE p.company_id IN (SELECT user_company_ids())
      )
    );
END $$;

-- ---- cor_export_snapshots (cor_id → change_orders → projects)
-- Read/write for members of the company that owns the COR.
DO $$
BEGIN
  IF to_regclass('public.cor_export_snapshots') IS NULL THEN RETURN; END IF;

  DROP POLICY IF EXISTS "Company members view cor snapshots" ON cor_export_snapshots;
  CREATE POLICY "Company members view cor snapshots"
    ON cor_export_snapshots FOR SELECT
    USING (
      is_platform_admin()
      OR cor_id IN (
        SELECT co.id FROM change_orders co
        JOIN projects p ON p.id = co.project_id
        WHERE p.company_id IN (SELECT user_company_ids())
      )
    );

  DROP POLICY IF EXISTS "Company members create cor snapshots" ON cor_export_snapshots;
  CREATE POLICY "Company members create cor snapshots"
    ON cor_export_snapshots FOR INSERT
    WITH CHECK (
      cor_id IN (
        SELECT co.id FROM change_orders co
        JOIN projects p ON p.id = co.project_id
        WHERE p.company_id IN (SELECT user_company_ids())
      )
    );

  -- The export pipeline flips is_current on older snapshots.
  DROP POLICY IF EXISTS "Company members update cor snapshots" ON cor_export_snapshots;
  CREATE POLICY "Company members update cor snapshots"
    ON cor_export_snapshots FOR UPDATE
    USING (
      cor_id IN (
        SELECT co.id FROM change_orders co
        JOIN projects p ON p.id = co.project_id
        WHERE p.company_id IN (SELECT user_company_ids())
      )
    )
    WITH CHECK (
      cor_id IN (
        SELECT co.id FROM change_orders co
        JOIN projects p ON p.id = co.project_id
        WHERE p.company_id IN (SELECT user_company_ids())
      )
    );
END $$;

-- ---- notification_preferences (project_id, user_id) --------
-- Users manage their own rows; office users (any active member
-- of the project's company) view and manage prefs for a project.
DO $$
BEGIN
  IF to_regclass('public.notification_preferences') IS NULL THEN RETURN; END IF;

  DROP POLICY IF EXISTS "View own or company notification prefs" ON notification_preferences;
  CREATE POLICY "View own or company notification prefs"
    ON notification_preferences FOR SELECT
    USING (
      user_id = auth.uid()
      OR project_id IN (
        SELECT p.id FROM projects p
        WHERE p.company_id IN (SELECT user_company_ids())
      )
    );

  DROP POLICY IF EXISTS "Manage own or company notification prefs" ON notification_preferences;
  CREATE POLICY "Manage own or company notification prefs"
    ON notification_preferences FOR ALL
    USING (
      user_id = auth.uid()
      OR project_id IN (
        SELECT p.id FROM projects p
        WHERE p.company_id IN (SELECT user_company_ids())
      )
    )
    WITH CHECK (
      user_id = auth.uid()
      OR project_id IN (
        SELECT p.id FROM projects p
        WHERE p.company_id IN (SELECT user_company_ids())
      )
    );
END $$;

-- ---- notification_presets (company_id) ---------------------
-- Company-wide notification role presets managed from the
-- office notification settings screen.
DO $$
BEGIN
  IF to_regclass('public.notification_presets') IS NULL THEN RETURN; END IF;

  DROP POLICY IF EXISTS "Company members view notification presets" ON notification_presets;
  CREATE POLICY "Company members view notification presets"
    ON notification_presets FOR SELECT
    USING (company_id IN (SELECT user_company_ids()));

  DROP POLICY IF EXISTS "Company members manage notification presets" ON notification_presets;
  CREATE POLICY "Company members manage notification presets"
    ON notification_presets FOR ALL
    USING (company_id IN (SELECT user_company_ids()))
    WITH CHECK (company_id IN (SELECT user_company_ids()));
END $$;

-- ---- photo_audit_log (ticket_id, cor_id, user_id) ----------
-- Written from both office (authenticated) and field (anon +
-- valid field session) photo flows; read by company members.
DO $$
BEGIN
  IF to_regclass('public.photo_audit_log') IS NULL THEN RETURN; END IF;

  DROP POLICY IF EXISTS "Company members view photo audit log" ON photo_audit_log;
  CREATE POLICY "Company members view photo audit log"
    ON photo_audit_log FOR SELECT
    USING (
      is_platform_admin()
      OR ticket_id IN (
        SELECT t.id FROM t_and_m_tickets t
        JOIN projects p ON p.id = t.project_id
        WHERE p.company_id IN (SELECT user_company_ids())
      )
    );

  DROP POLICY IF EXISTS "Authed callers write photo audit log" ON photo_audit_log;
  CREATE POLICY "Authed callers write photo audit log"
    ON photo_audit_log FOR INSERT
    WITH CHECK (
      auth.uid() IS NOT NULL
      OR EXISTS (SELECT 1 FROM has_valid_field_session())
    );
END $$;

-- ============================================================
-- 4. ADMIN-ONLY TABLES
-- ============================================================

-- ---- platform_admins ---------------------------------------
-- Self-referential: only platform admins may see the roster.
-- is_platform_admin() is SECURITY DEFINER, so no recursion.
DO $$
BEGIN
  IF to_regclass('public.platform_admins') IS NULL THEN RETURN; END IF;
  DROP POLICY IF EXISTS "Platform admins manage platform_admins" ON platform_admins;
  CREATE POLICY "Platform admins manage platform_admins"
    ON platform_admins FOR ALL
    USING (is_platform_admin())
    WITH CHECK (is_platform_admin());
END $$;

-- ---- promo_codes -------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.promo_codes') IS NULL THEN RETURN; END IF;
  DROP POLICY IF EXISTS "Platform admins manage promo_codes" ON promo_codes;
  CREATE POLICY "Platform admins manage promo_codes"
    ON promo_codes FOR ALL
    USING (is_platform_admin())
    WITH CHECK (is_platform_admin());
END $$;

-- ---- templates / template_items / role_templates -----------
-- Admin-only management. If the table is company-scoped
-- (has company_id), active company members may also read
-- their own company's rows and company admins manage them.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['templates', 'template_items', 'role_templates'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    EXECUTE format('DROP POLICY IF EXISTS "Platform admins manage %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Platform admins manage %s" ON public.%I FOR ALL
         USING (is_platform_admin()) WITH CHECK (is_platform_admin())', t, t);

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'company_id'
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS "Company members view %s" ON public.%I', t, t);
      EXECUTE format(
        'CREATE POLICY "Company members view %s" ON public.%I FOR SELECT
           USING (company_id IN (SELECT user_company_ids()))', t, t);

      EXECUTE format('DROP POLICY IF EXISTS "Company admins manage %s" ON public.%I', t, t);
      EXECUTE format(
        'CREATE POLICY "Company admins manage %s" ON public.%I FOR ALL
           USING (company_id IN (SELECT user_admin_company_ids()))
           WITH CHECK (company_id IN (SELECT user_admin_company_ids()))', t, t);
    END IF;
  END LOOP;
END $$;

-- ---- subscriptions -----------------------------------------
-- Billing data: readable by company admins, managed by the
-- platform (service role bypasses RLS; platform admins full).
DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NULL THEN RETURN; END IF;

  DROP POLICY IF EXISTS "Platform admins manage subscriptions" ON subscriptions;
  CREATE POLICY "Platform admins manage subscriptions"
    ON subscriptions FOR ALL
    USING (is_platform_admin())
    WITH CHECK (is_platform_admin());

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions'
      AND column_name = 'company_id'
  ) THEN
    DROP POLICY IF EXISTS "Company admins view subscription" ON subscriptions;
    CREATE POLICY "Company admins view subscription"
      ON subscriptions FOR SELECT
      USING (company_id IN (SELECT user_admin_company_ids()));
  END IF;
END $$;

-- ---- user_invitations --------------------------------------
-- Rows carry invite tokens, so regular company members must NOT
-- be able to read them: company admins + platform admins only.
-- (Invite acceptance flows run through SECURITY DEFINER RPCs /
-- the service role, which bypass RLS.)
DO $$
BEGIN
  IF to_regclass('public.user_invitations') IS NULL THEN RETURN; END IF;

  DROP POLICY IF EXISTS "Platform admins manage user_invitations" ON user_invitations;
  CREATE POLICY "Platform admins manage user_invitations"
    ON user_invitations FOR ALL
    USING (is_platform_admin())
    WITH CHECK (is_platform_admin());

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_invitations'
      AND column_name = 'company_id'
  ) THEN
    DROP POLICY IF EXISTS "Company admins manage user_invitations" ON user_invitations;
    CREATE POLICY "Company admins manage user_invitations"
      ON user_invitations FOR ALL
      USING (company_id IN (SELECT user_admin_company_ids()))
      WITH CHECK (company_id IN (SELECT user_admin_company_ids()));
  END IF;
END $$;

-- ============================================================
-- 5. GENERIC COLUMN-AWARE POLICIES FOR THE REMAINING TABLES
--
-- For each table (skipped if missing), pick the first scope
-- whose column actually exists on the table:
--
--   'company' → company_id: active company members SELECT,
--               company admins ALL (+ own-row ALL if user_id
--               also exists, e.g. per-user notification rows)
--   'user'    → user_id: owner (user_id = auth.uid()) ALL
--   'project' → project_id: members of the project's company
--               SELECT, company admins of it ALL
--   none      → reference/config table: authenticated SELECT,
--               platform-admin writes only
--
-- Platform admins always get full access. Per-user tables try
-- user-scope before project-scope (privacy: a notification
-- belongs to its recipient, not to everyone on the project);
-- permission/log tables try project-scope first (visibility:
-- company members may see who has access to their projects).
-- ============================================================

CREATE OR REPLACE FUNCTION _fs_apply_generic_policies(t TEXT, scope_priority TEXT[])
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  scope TEXT := NULL;
  s TEXT;
  scope_col TEXT;
  has_user BOOLEAN;
BEGIN
  IF to_regclass('public.' || t) IS NULL THEN
    RAISE NOTICE 'Table public.% does not exist — no policies created', t;
    RETURN;
  END IF;

  -- First scope in priority order whose column exists on the table
  FOREACH s IN ARRAY scope_priority LOOP
    scope_col := CASE s WHEN 'company' THEN 'company_id'
                        WHEN 'user'    THEN 'user_id'
                        WHEN 'project' THEN 'project_id' END;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = scope_col
    ) THEN
      scope := s;
      EXIT;
    END IF;
  END LOOP;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = t AND column_name = 'user_id'
  ) INTO has_user;

  EXECUTE format('DROP POLICY IF EXISTS "Platform admins manage %s" ON public.%I', t, t);
  EXECUTE format(
    'CREATE POLICY "Platform admins manage %s" ON public.%I FOR ALL
       USING (is_platform_admin()) WITH CHECK (is_platform_admin())', t, t);

  IF scope = 'company' THEN
    EXECUTE format('DROP POLICY IF EXISTS "Company members view %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Company members view %s" ON public.%I FOR SELECT
         USING (company_id IN (SELECT user_company_ids()))', t, t);

    EXECUTE format('DROP POLICY IF EXISTS "Company admins manage %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Company admins manage %s" ON public.%I FOR ALL
         USING (company_id IN (SELECT user_admin_company_ids()))
         WITH CHECK (company_id IN (SELECT user_admin_company_ids()))', t, t);

    -- Rows that also carry user_id stay manageable by their owner
    IF has_user THEN
      EXECUTE format('DROP POLICY IF EXISTS "Owners manage own %s" ON public.%I', t, t);
      EXECUTE format(
        'CREATE POLICY "Owners manage own %s" ON public.%I FOR ALL
           USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t, t);
    END IF;

  ELSIF scope = 'user' THEN
    EXECUTE format('DROP POLICY IF EXISTS "Owners manage own %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Owners manage own %s" ON public.%I FOR ALL
         USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t, t);

  ELSIF scope = 'project' THEN
    EXECUTE format('DROP POLICY IF EXISTS "Company members view %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Company members view %s" ON public.%I FOR SELECT
         USING (project_id IN (
           SELECT p.id FROM projects p
           WHERE p.company_id IN (SELECT user_company_ids())))', t, t);

    EXECUTE format('DROP POLICY IF EXISTS "Company admins manage %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Company admins manage %s" ON public.%I FOR ALL
         USING (project_id IN (
           SELECT p.id FROM projects p
           WHERE p.company_id IN (SELECT user_admin_company_ids())))
         WITH CHECK (project_id IN (
           SELECT p.id FROM projects p
           WHERE p.company_id IN (SELECT user_admin_company_ids())))', t, t);

  ELSE
    -- No scoping column: reference/config table. Any signed-in
    -- user may read; only platform admins (above) may write.
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated view %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Authenticated view %s" ON public.%I FOR SELECT
         USING (auth.uid() IS NOT NULL)', t, t);
  END IF;
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  -- Company/config tables and per-user tables: prefer company,
  -- then own-row, then project scope.
  FOREACH t IN ARRAY ARRAY[
    'company_categories', 'company_settings',
    'notification_roles', 'notification_settings',
    'notification_types', 'notifications',
    'user_notification_roles'
  ] LOOP
    PERFORM _fs_apply_generic_policies(t, ARRAY['company', 'user', 'project']);
  END LOOP;

  -- Permission/log/recipient tables: prefer project scope, then
  -- company, so rows are visible to the project's whole company
  -- rather than locked to whichever user_id happens to be on them.
  FOREACH t IN ARRAY ARRAY[
    'project_user_permissions', 'project_permissions',
    'field_access_log', 'field_activity_log',
    'external_notification_recipients'
  ] LOOP
    PERFORM _fs_apply_generic_policies(t, ARRAY['project', 'company', 'user']);
  END LOOP;
END $$;

DROP FUNCTION _fs_apply_generic_policies(TEXT, TEXT[]);

-- ---- _backup_user_companies_roles --------------------------
-- One-off rollback snapshot from the access-levels migration.
-- RLS enabled (step 2) with NO policies: deny-all for anon and
-- authenticated. Reachable only via service role / SQL editor.

-- ============================================================
-- VERIFICATION (manual)
-- ============================================================
-- 1. Every flagged table now has RLS enabled:
--   SELECT relname FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind = 'r'
--     AND NOT c.relrowsecurity;
--   -- Should return no rows from the list above.
--
-- 2. Review generated policies:
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE tablename IN (
--     'activity_log','company_categories','company_settings',
--     'cor_export_snapshots','external_notification_recipients',
--     'field_access_log','field_activity_log',
--     'notification_preferences','notification_presets',
--     'notification_roles','notification_settings',
--     'notification_types','notifications','photo_audit_log',
--     'platform_admins','promo_codes','project_user_permissions',
--     'project_permissions','role_templates','subscriptions',
--     'template_items','templates','user_invitations',
--     'user_notification_roles','_backup_user_companies_roles')
--   ORDER BY tablename, policyname;
