-- ============================================================
-- MIGRATION: Member permissions + approval guards
-- Date: 2026-11-10
-- ============================================================
--
-- PURPOSE:
-- Until now any active company member could approve or reject a
-- T&M ticket and approve a change order (COR), and a field (PIN)
-- session could UPDATE any column of its project's tickets,
-- including status. This file moves those rules into the database:
--
--   1. Four per-member permissions on user_companies, granted by a
--      company administrator (or the company owner):
--        can_approve_tickets       approve / reject T&M tickets
--        can_send_cors             submit a COR to the client
--        can_sign_for_foreman      sign a ticket the office entered
--                                  on a foreman's behalf
--        can_manage_client_access  invite / remove client contacts
--      Administrators and the company owner always hold all four.
--      Only they can change them (trigger, not just RLS).
--
--   2. has_company_permission(company_id, permission): the single
--      check used by the guards below and callable by the client.
--
--   3. T&M ticket guard (trg_guard_tm_ticket_approval):
--        - approving needs an office user with can_approve_tickets
--          AND a client signature on the ticket;
--        - rejecting needs can_approve_tickets;
--        - a field session can never approve, reject or bill, can
--          never write the approval / rejection / value columns,
--          and a late field write (offline replay, foreman signing
--          after the client) can no longer pull a ticket back from
--          client_signed / approved / rejected / billed: the status
--          is kept, the rest of the write goes through.
--
--   4. COR guard (trg_guard_cor_status):
--        - a COR becomes 'approved' only with a client (GC)
--          signature on it: the office can no longer approve one
--          on the client's behalf;
--        - submitting a COR (draft / rejected -> pending_approval)
--          needs can_send_cors;
--        - a field session cannot change a COR's status.
--
-- The guards apply to the API roles (anon, authenticated) only.
-- SECURITY DEFINER functions (public_add_signature,
-- update_tm_ticket_contents, ...) and the SQL editor are not
-- affected.
--
-- BEHAVIOUR CHANGE ON DEPLOY:
-- Existing members who are not administrators lose the ability to
-- approve tickets and submit CORs until an administrator grants
-- the permission in Team settings. Run the optional backfill at
-- the end of this file first if that is not wanted.
--
-- AFFECTED: user_companies (4 columns, 1 trigger),
--           t_and_m_tickets (1 trigger), change_orders (1 trigger),
--           6 functions.
-- ROLLBACK: supabase/rollbacks/20261110_member_permissions_and_approval_guards_rollback.sql
-- TESTS:    supabase/tests/member_permissions_tests.sql
--
-- IDEMPOTENT - safe to re-run. One transaction.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. Preconditions: stop before changing anything
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.user_companies') IS NULL
     OR to_regclass('public.t_and_m_tickets') IS NULL
     OR to_regclass('public.change_orders') IS NULL
     OR to_regclass('public.projects') IS NULL
     OR to_regclass('public.companies') IS NULL THEN
    RAISE EXCEPTION 'Expected tables are missing; nothing was changed';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1. Permission columns
-- ------------------------------------------------------------
ALTER TABLE user_companies
  ADD COLUMN IF NOT EXISTS can_approve_tickets BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_send_cors BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_sign_for_foreman BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_client_access BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN user_companies.can_approve_tickets IS 'May approve / reject T&M tickets. Granted by an administrator. Administrators and the owner always may.';
COMMENT ON COLUMN user_companies.can_send_cors IS 'May submit a change order to the client. Granted by an administrator.';
COMMENT ON COLUMN user_companies.can_sign_for_foreman IS 'May sign a T&M ticket the office entered on a foreman''s behalf. Granted by an administrator.';
COMMENT ON COLUMN user_companies.can_manage_client_access IS 'May invite / remove client contacts on a project. Granted by an administrator.';

-- ------------------------------------------------------------
-- 2. has_company_permission(company, permission)
-- ------------------------------------------------------------
-- True for an active member of the company who is an administrator,
-- the company owner, or holds the named permission. False for anyone
-- else, including a field (PIN) session, which has no auth.uid().
CREATE OR REPLACE FUNCTION public.has_company_permission(p_company_id UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_member JSONB;
BEGIN
  IF v_uid IS NULL OR p_company_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_permission NOT IN ('approve_tickets', 'send_cors', 'sign_for_foreman', 'manage_client_access') THEN
    RAISE EXCEPTION 'Unknown permission: %', p_permission USING ERRCODE = '22023';
  END IF;

  SELECT to_jsonb(uc) INTO v_member
  FROM user_companies uc
  WHERE uc.user_id = v_uid
    AND uc.company_id = p_company_id
    AND (uc.status = 'active' OR uc.status IS NULL)
  LIMIT 1;

  IF v_member IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_company_admin(p_company_id) THEN
    RETURN true;
  END IF;

  RETURN COALESCE((v_member->>('can_' || p_permission))::boolean, false);
END;
$$;

REVOKE ALL ON FUNCTION public.has_company_permission(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_company_permission(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.has_company_permission(UUID, TEXT) IS
  'True when the signed-in user is an active member of the company and is an administrator, the owner, or holds the permission (approve_tickets, send_cors, sign_for_foreman, manage_client_access).';

-- ------------------------------------------------------------
-- 3. Only administrators / the owner change permissions
-- ------------------------------------------------------------
-- True when the signed-in user administers the company (administrator
-- access level, or the company owner). SECURITY DEFINER so the lookup
-- is not subject to RLS on user_companies.
CREATE OR REPLACE FUNCTION public.is_company_admin(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = p_company_id
        AND (uc.status = 'active' OR uc.status IS NULL)
        AND (to_jsonb(uc)->>'access_level' = 'administrator'
             OR (to_jsonb(uc)->>'access_level' IS NULL
                 AND to_jsonb(uc)->>'role' IN ('owner', 'admin', 'administrator')))
    )
    OR EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = p_company_id AND to_jsonb(c)->>'owner_user_id' = auth.uid()::text
    )
  );
$$;

REVOKE ALL ON FUNCTION public.is_company_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_company_admin(UUID) TO authenticated;

-- SECURITY INVOKER: current_user is the API role for PostgREST requests
-- and the function owner inside SECURITY DEFINER RPCs (membership
-- approval and the like), which are therefore not restricted.
CREATE OR REPLACE FUNCTION public.guard_member_permission_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT (NEW.can_approve_tickets OR NEW.can_send_cors
            OR NEW.can_sign_for_foreman OR NEW.can_manage_client_access) THEN
      RETURN NEW;
    END IF;
  ELSIF NEW.can_approve_tickets IS NOT DISTINCT FROM OLD.can_approve_tickets
     AND NEW.can_send_cors IS NOT DISTINCT FROM OLD.can_send_cors
     AND NEW.can_sign_for_foreman IS NOT DISTINCT FROM OLD.can_sign_for_foreman
     AND NEW.can_manage_client_access IS NOT DISTINCT FROM OLD.can_manage_client_access THEN
    RETURN NEW;
  END IF;

  IF current_user = 'anon' OR NOT public.is_company_admin(NEW.company_id) THEN
    RAISE EXCEPTION 'Only a company administrator can change member permissions'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_member_permission_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_member_permissions ON user_companies;
CREATE TRIGGER trg_guard_member_permissions
  BEFORE INSERT OR UPDATE ON user_companies
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_permission_columns();

-- ------------------------------------------------------------
-- 4. T&M ticket approval guard
-- ------------------------------------------------------------
-- SECURITY INVOKER: current_user is the API role for PostgREST
-- requests and the function owner inside SECURITY DEFINER RPCs,
-- which are therefore not restricted (same convention as
-- protect_tm_edit_audit_columns()).
CREATE OR REPLACE FUNCTION public.guard_tm_ticket_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new JSONB := to_jsonb(NEW);
  v_old JSONB := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_old_status TEXT := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END;
  v_company_id UUID;
  v_col TEXT;
  v_has_client_signature BOOLEAN;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  -- ---- Field (PIN) session -----------------------------------
  IF current_user = 'anon' THEN
    -- A late field write must not move a ticket backwards or out
    -- of an office decision: keep the status, let the rest through.
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
      IF OLD.status IN ('approved', 'rejected', 'billed')
         OR (OLD.status = 'client_signed' AND NEW.status IN ('pending', 'foreman_signed')) THEN
        NEW.status := OLD.status;
      END IF;
    END IF;

    IF NEW.status IN ('approved', 'rejected', 'billed')
       AND NEW.status IS DISTINCT FROM v_old_status THEN
      RAISE EXCEPTION 'Only the office can approve, reject or bill a ticket'
        USING ERRCODE = '42501';
    END IF;

    -- Approval, rejection and value columns belong to the office.
    -- Read through jsonb so a column that does not exist in this
    -- database is simply skipped.
    FOREACH v_col IN ARRAY ARRAY[
      'approved_by_user_id', 'approved_by_name', 'approved_at',
      'rejected_by_user_id', 'rejected_by_name', 'rejected_at', 'rejection_reason',
      'change_order_value'
    ] LOOP
      IF (v_new->v_col) IS DISTINCT FROM (v_old->v_col)
         AND NOT (TG_OP = 'INSERT' AND COALESCE(v_new->>v_col, '') ~ '^(0(\.0+)?)?$') THEN
        RAISE EXCEPTION 'Only the office can change %', v_col USING ERRCODE = '42501';
      END IF;
    END LOOP;

    RETURN NEW;
  END IF;

  -- ---- Office user -------------------------------------------
  IF NEW.status IN ('approved', 'rejected')
     AND NEW.status IS DISTINCT FROM v_old_status THEN
    SELECT p.company_id INTO v_company_id FROM projects p WHERE p.id = NEW.project_id;

    IF NOT public.has_company_permission(v_company_id, 'approve_tickets') THEN
      RAISE EXCEPTION 'You do not have permission to approve or reject tickets. Ask a company administrator.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status = 'approved' THEN
      v_has_client_signature :=
        COALESCE(v_new->>'client_signature_data', '') <> ''
        OR COALESCE(v_new->>'gc_signature_data', '') <> '';
      IF NOT v_has_client_signature THEN
        RAISE EXCEPTION 'A ticket cannot be approved until the client has signed it'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_tm_ticket_approval() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_tm_ticket_approval ON t_and_m_tickets;
CREATE TRIGGER trg_guard_tm_ticket_approval
  BEFORE INSERT OR UPDATE ON t_and_m_tickets
  FOR EACH ROW EXECUTE FUNCTION public.guard_tm_ticket_approval();

-- ------------------------------------------------------------
-- 5. COR status guard
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_cor_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new JSONB := to_jsonb(NEW);
  v_old_status TEXT := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS NOT DISTINCT FROM v_old_status THEN
    RETURN NEW;
  END IF;

  IF current_user = 'anon' THEN
    -- The field may create a draft; every other status is the office's
    IF TG_OP = 'INSERT' AND NEW.status = 'draft' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Only the office can change a change order''s status'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'approved' THEN
    IF COALESCE(v_new->>'gc_signature_data', '') = ''
       AND COALESCE(v_new->>'client_signature_data', '') = '' THEN
      RAISE EXCEPTION 'A change order is approved only when the client signs it'
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF NEW.status = 'pending_approval' THEN
    IF NOT public.has_company_permission(NEW.company_id, 'send_cors') THEN
      RAISE EXCEPTION 'You do not have permission to send change orders to the client. Ask a company administrator.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_cor_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_cor_status ON change_orders;
CREATE TRIGGER trg_guard_cor_status
  BEFORE INSERT OR UPDATE ON change_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_cor_status();

COMMIT;

-- ------------------------------------------------------------
-- OPTIONAL BACKFILL (not run by this file)
-- ------------------------------------------------------------
-- To let every current active member keep approving tickets and
-- sending CORs until an administrator reviews the list, run once:
--
--   ALTER TABLE user_companies DISABLE TRIGGER trg_guard_member_permissions;
--   UPDATE user_companies
--      SET can_approve_tickets = true, can_send_cors = true
--    WHERE status = 'active' OR status IS NULL;
--   ALTER TABLE user_companies ENABLE TRIGGER trg_guard_member_permissions;
