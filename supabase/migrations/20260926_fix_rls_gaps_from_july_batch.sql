-- ============================================================
-- Tighten three RLS policies from 20260720_enable_rls_remaining_tables.sql
-- ============================================================
-- The July batch enabled RLS on 26 tables and paired most of them with
-- explicit policies. Three of those policies were wider than intended:
--
--   1. notification_preferences  — "Manage own or company notification prefs"
--        A FOR ALL policy allowed any active member of the project's company
--        to UPDATE or DELETE another user's row via the project_id branch.
--        Only the owner should be able to change their own row; the office
--        bulk-configure flow (setProjectNotificationPreferences) legitimately
--        writes rows for other users, so we still allow that — but restrict
--        the cross-user write to company administrators, matching how the
--        codebase treats other cross-user management (invitations, presets).
--
--   2. photo_audit_log  — "Authed callers write photo audit log"
--        INSERT WITH CHECK only required "authenticated OR has a field
--        session". The tamper-evident log has no company_id column, so any
--        authenticated user (from any tenant) could forge rows against
--        another company's ticket_id / cor_id / user_id. Add tenant scope
--        to the WITH CHECK so the row's parent must belong to a company the
--        caller is a member of, and any stamped user_id must be the caller.
--
--   3. notification_presets  — "Company members manage notification presets"
--        A FOR ALL policy scoped to user_company_ids() let any active member
--        (not just admins) create/edit/delete company-wide notification
--        role presets. The sibling policy for templates / template_items /
--        role_templates on the same migration correctly restricts management
--        to user_admin_company_ids(); align presets with that.
--
-- IDEMPOTENT — DROP IF EXISTS + CREATE.
-- Safe to re-run in the Supabase SQL Editor.
-- ============================================================


-- ------------------------------------------------------------
-- 1. notification_preferences
-- ------------------------------------------------------------
-- Replace the single FOR ALL policy with:
--   (a) an owner FOR ALL policy — a user always manages their own row
--   (b) a company-admin FOR ALL policy — office admins may set / clear
--       preferences for any user on their company's projects (used by
--       setProjectNotificationPreferences in src/lib/db/financialOps.js).
-- The read-side policy "View own or company notification prefs" is left
-- untouched: any project company member can still see who is subscribed.

DO $$
BEGIN
  IF to_regclass('public.notification_preferences') IS NULL THEN RETURN; END IF;

  DROP POLICY IF EXISTS "Manage own or company notification prefs" ON notification_preferences;

  DROP POLICY IF EXISTS "Owners manage own notification prefs" ON notification_preferences;
  CREATE POLICY "Owners manage own notification prefs"
    ON notification_preferences FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

  DROP POLICY IF EXISTS "Company admins manage project notification prefs" ON notification_preferences;
  CREATE POLICY "Company admins manage project notification prefs"
    ON notification_preferences FOR ALL
    USING (
      project_id IN (
        SELECT p.id FROM projects p
        WHERE p.company_id IN (SELECT user_admin_company_ids())
      )
    )
    WITH CHECK (
      project_id IN (
        SELECT p.id FROM projects p
        WHERE p.company_id IN (SELECT user_admin_company_ids())
      )
    );
END $$;


-- ------------------------------------------------------------
-- 2. photo_audit_log
-- ------------------------------------------------------------
-- Rewrite the INSERT WITH CHECK so every row's parent (ticket_id / cor_id)
-- resolves to a project whose company the caller belongs to, or — for the
-- anon field-mode branch — to the exact project the field session is
-- pinned to. If a user_id column is stamped, it must be the caller's own.
--
-- has_valid_field_session() is SECURITY DEFINER and returns rows only
-- when the request carries a valid x-field-session header. Field-mode
-- writes are correlated to a single project, so we require the ticket
-- (or CoR) to belong to that same project.

DO $$
BEGIN
  IF to_regclass('public.photo_audit_log') IS NULL THEN RETURN; END IF;

  DROP POLICY IF EXISTS "Authed callers write photo audit log" ON photo_audit_log;

  CREATE POLICY "Tenant-scoped callers write photo audit log"
    ON photo_audit_log FOR INSERT
    WITH CHECK (
      -- If a user_id is stamped it must be the caller (anon field-mode
      -- writes have no auth.uid(), so user_id must be NULL there).
      (user_id IS NULL OR user_id = auth.uid())
      AND (
        -- Office / authenticated: ticket and CoR (when present) must
        -- belong to a project whose company the caller is a member of.
        (
          auth.uid() IS NOT NULL
          AND (
            ticket_id IS NULL OR ticket_id IN (
              SELECT t.id FROM t_and_m_tickets t
              JOIN projects p ON p.id = t.project_id
              WHERE p.company_id IN (SELECT user_company_ids())
            )
          )
          AND (
            cor_id IS NULL OR cor_id IN (
              SELECT co.id FROM change_orders co
              JOIN projects p ON p.id = co.project_id
              WHERE p.company_id IN (SELECT user_company_ids())
            )
          )
        )
        -- Field-mode: caller has a valid field session; the referenced
        -- ticket/CoR must belong to that same project.
        OR (
          EXISTS (
            SELECT 1 FROM has_valid_field_session() s
            WHERE
              (
                ticket_id IS NULL OR ticket_id IN (
                  SELECT t.id FROM t_and_m_tickets t
                  WHERE t.project_id = s.project_id
                )
              )
              AND (
                cor_id IS NULL OR cor_id IN (
                  SELECT co.id FROM change_orders co
                  WHERE co.project_id = s.project_id
                )
              )
          )
        )
      )
    );
END $$;


-- ------------------------------------------------------------
-- 3. notification_presets
-- ------------------------------------------------------------
-- Restrict manage (INSERT/UPDATE/DELETE) to company administrators,
-- matching the templates / role_templates / template_items pattern in
-- the July batch. The existing SELECT policy for company members is
-- left intact so non-admins can still see and apply presets.

DO $$
BEGIN
  IF to_regclass('public.notification_presets') IS NULL THEN RETURN; END IF;

  DROP POLICY IF EXISTS "Company members manage notification presets" ON notification_presets;

  CREATE POLICY "Company admins manage notification presets"
    ON notification_presets FOR ALL
    USING (company_id IN (SELECT user_admin_company_ids()))
    WITH CHECK (company_id IN (SELECT user_admin_company_ids()));
END $$;


-- ============================================================
-- VERIFICATION (manual)
-- ============================================================
-- 1. Only the intended policies remain on each table:
--
--   SELECT tablename, policyname, cmd
--   FROM pg_policies
--   WHERE tablename IN (
--     'notification_preferences','photo_audit_log','notification_presets')
--   ORDER BY tablename, policyname;
--
--   Expect:
--     notification_preferences  Company admins manage project notification prefs   ALL
--     notification_preferences  Owners manage own notification prefs               ALL
--     notification_preferences  View own or company notification prefs             SELECT
--     notification_presets      Company admins manage notification presets         ALL
--     notification_presets      Company members view notification presets          SELECT
--     photo_audit_log           Company members view photo audit log               SELECT
--     photo_audit_log           Tenant-scoped callers write photo audit log        INSERT
--
-- 2. Cross-tenant probe (should fail with RLS violation as user in Company B):
--
--   INSERT INTO photo_audit_log (ticket_id, operation, user_id, triggered_by)
--   VALUES ('<Company A ticket uuid>', 'deleted', '<Company A user uuid>', 'user');
--
-- 3. Own-project probe (should succeed):
--
--   INSERT INTO photo_audit_log (ticket_id, operation, user_id, triggered_by)
--   VALUES ('<my Company ticket uuid>', 'created', auth.uid(), 'user');
