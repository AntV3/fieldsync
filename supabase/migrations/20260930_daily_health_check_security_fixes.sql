-- ============================================================
-- Daily health-check security batch (2026-09-30)
-- ============================================================
-- Three critical, mutually-independent privilege-escalation
-- gaps found by the daily health-check review:
--
--   1. users.UPDATE lets any authenticated caller rewrite their
--      own row's `role` and `company_id`. The ensure_user_membership
--      trigger (SECURITY DEFINER, added by
--      20241201000230_legacy_user_repair.sql and refined by
--      20260309_auth_flow_fixes.sql) then auto-inserts an active
--      `administrator` `user_companies` row for the new company_id.
--      An attacker escalates to admin of any tenant with:
--
--        UPDATE users SET company_id = '<victim>', role = 'admin'
--        WHERE id = auth.uid();
--
--      Fix: BEFORE UPDATE trigger that rejects `role` and
--      `company_id` changes when the caller is `authenticated` /
--      `anon`. SECURITY DEFINER functions (register_company,
--      accept_invitation, …) run as postgres, so `current_user`
--      switches and their writes are still allowed.
--
--   2. company_invitations has a "Public lookup active invitation
--      by token" SELECT policy granted to anon that has no
--      per-row token predicate, so
--
--        GET /rest/v1/company_invitations?select=*
--
--      returns every live token in the platform. And
--      accept_invitation(p_invite_token, p_user_id) never checks
--      auth.uid() = p_user_id, so any authenticated user can call
--      it against any leaked token and enroll themselves — or any
--      victim user id — into the invited role/access_level.
--
--      Fix: revoke public SELECT and grant only through a new
--      SECURITY DEFINER RPC `get_invitation_by_token(p_token)` that
--      returns the single matching row and its company name. Rewrite
--      accept_invitation to derive the user from auth.uid() and
--      refuse anon callers.
--
--   3. Storage policies for the tm-photos bucket check only
--      `auth.uid() IS NOT NULL` on SELECT and INSERT. The path
--      layout is companyId/projectId/ticketId/filename but the
--      first segment is never compared to the caller's tenants —
--      any authenticated user can download or overwrite photos
--      belonging to another company (fabricated evidence attached
--      to CORs the victim then bills against).
--
--      Fix: scope SELECT and INSERT to
--          companyId ∈ user_company_ids()
--        OR field-session with matching company_id AND project_id.
--
-- IDEMPOTENT — DROP IF EXISTS + CREATE.
-- ============================================================


-- ------------------------------------------------------------
-- 1. users: block direct client role / company_id escalation
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_users_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Direct client writes come in as `authenticated` or `anon`.
  -- SECURITY DEFINER functions (register_company, accept_invitation,
  -- ensure_user_membership, etc.) run as their owner (postgres /
  -- supabase_admin), so current_user is NOT one of those two roles
  -- and their writes bypass this guard.
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'users.role can only be changed through the invitation / approval flow'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      RAISE EXCEPTION 'users.company_id can only be changed through the invitation / approval flow'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_users_privilege_escalation_trigger ON users;
CREATE TRIGGER prevent_users_privilege_escalation_trigger
  BEFORE UPDATE OF role, company_id ON users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_users_privilege_escalation();

COMMENT ON FUNCTION prevent_users_privilege_escalation() IS
'Rejects client-driven UPDATEs to users.role or users.company_id. Only SECURITY DEFINER functions running as postgres/supabase_admin may change these columns.';


-- ------------------------------------------------------------
-- 2. company_invitations: close token enumeration + fix
--    accept_invitation identity binding
-- ------------------------------------------------------------

-- Drop the broad anon lookup policy and the anon SELECT grant.
DROP POLICY IF EXISTS "Public lookup active invitation by token" ON company_invitations;
REVOKE SELECT ON company_invitations FROM anon;

-- SECURITY DEFINER RPC that returns exactly the row matching
-- p_token (if it is still active/unused). Callable by anon and
-- authenticated for the accept-invitation landing page.
DROP FUNCTION IF EXISTS get_invitation_by_token(TEXT);
CREATE OR REPLACE FUNCTION get_invitation_by_token(p_token TEXT)
RETURNS TABLE (
  id UUID,
  company_id UUID,
  invited_role TEXT,
  invited_access_level TEXT,
  invited_company_role TEXT,
  invited_email TEXT,
  status TEXT,
  max_uses INTEGER,
  use_count INTEGER,
  expires_at TIMESTAMPTZ,
  company_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    ci.id,
    ci.company_id,
    ci.invited_role,
    ci.invited_access_level,
    ci.invited_company_role,
    ci.invited_email,
    ci.status,
    ci.max_uses,
    ci.use_count,
    ci.expires_at,
    c.name AS company_name
  FROM company_invitations ci
  JOIN companies c ON c.id = ci.company_id
  WHERE ci.invite_token = p_token
    AND ci.status = 'active'
    AND (ci.expires_at IS NULL OR ci.expires_at > NOW())
    AND (ci.max_uses IS NULL OR ci.use_count < ci.max_uses);
$$;

REVOKE ALL ON FUNCTION get_invitation_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_invitation_by_token(TEXT) TO anon, authenticated;

-- Rewrite accept_invitation to derive the user from auth.uid()
-- (never from a client-supplied parameter). Refuse anon callers.
CREATE OR REPLACE FUNCTION accept_invitation(
  p_invite_token TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_invitation RECORD;
  v_existing RECORD;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be signed in to accept an invitation');
  END IF;

  -- Reject any attempt to enroll a different user.
  IF p_user_id IS NOT NULL AND p_user_id <> v_caller THEN
    RETURN jsonb_build_object('success', false, 'error', 'You may only accept an invitation for your own account');
  END IF;

  -- Look up and validate the invitation.
  SELECT * INTO v_invitation
  FROM company_invitations
  WHERE invite_token = p_invite_token
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (max_uses IS NULL OR use_count < max_uses);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;

  -- If the invitation targets a specific email, enforce it against
  -- the caller (not against a client-supplied id).
  IF v_invitation.invited_email IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM users WHERE id = v_caller AND LOWER(email) = LOWER(v_invitation.invited_email)
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'This invitation is for a different email address');
    END IF;
  END IF;

  SELECT * INTO v_existing
  FROM user_companies
  WHERE user_id = v_caller AND company_id = v_invitation.company_id;

  IF FOUND THEN
    IF v_existing.status = 'active' THEN
      RETURN jsonb_build_object('success', false, 'error', 'You are already a member of this company');
    ELSIF v_existing.status = 'pending' THEN
      UPDATE user_companies SET
        status = 'active',
        role = v_invitation.invited_role,
        access_level = v_invitation.invited_access_level,
        company_role = v_invitation.invited_company_role,
        approved_at = NOW(),
        approved_by = v_invitation.created_by
      WHERE id = v_existing.id;
    ELSIF v_existing.status = 'removed' THEN
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
    INSERT INTO user_companies (
      user_id, company_id, role, access_level, company_role,
      status, approved_at, approved_by
    ) VALUES (
      v_caller, v_invitation.company_id, v_invitation.invited_role,
      v_invitation.invited_access_level, v_invitation.invited_company_role,
      'active', NOW(), v_invitation.created_by
    );
  END IF;

  UPDATE company_invitations SET
    use_count = use_count + 1,
    accepted_by = v_caller,
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
$$;

REVOKE ALL ON FUNCTION accept_invitation(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_invitation(TEXT, UUID) TO authenticated;


-- ------------------------------------------------------------
-- 3. tm-photos storage: scope SELECT and INSERT to caller's tenant
-- ------------------------------------------------------------

-- Path layout: companyId/projectId/ticketId/filename
--   (storage.foldername(name))[1] = companyId
--   (storage.foldername(name))[2] = projectId

DROP POLICY IF EXISTS "Secure read access for tm-photos" ON storage.objects;
CREATE POLICY "Secure read access for tm-photos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'tm-photos'
  AND (
    -- Authenticated users can only read photos in one of their companies.
    (
      auth.uid() IS NOT NULL
      AND (storage.foldername(name))[1]::uuid IN (SELECT user_company_ids())
    )
    -- Field-session holders can read photos for the exact project
    -- their session is pinned to (and only in that project's tenant).
    OR EXISTS (
      SELECT 1 FROM has_valid_field_session() s
      WHERE s.company_id::text = (storage.foldername(name))[1]
        AND s.project_id::text = (storage.foldername(name))[2]
    )
  )
);

DROP POLICY IF EXISTS "Field users can upload tm-photos" ON storage.objects;
CREATE POLICY "Field users can upload tm-photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'tm-photos'
  -- Path layout: companyId/projectId/ticketId/filename
  AND name ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/[^/]+/[^/]+$'
  AND (
    (
      auth.uid() IS NOT NULL
      AND (storage.foldername(name))[1]::uuid IN (SELECT user_company_ids())
    )
    OR EXISTS (
      SELECT 1 FROM has_valid_field_session() s
      WHERE s.company_id::text = (storage.foldername(name))[1]
        AND s.project_id::text = (storage.foldername(name))[2]
    )
  )
);


-- ============================================================
-- VERIFICATION (manual)
-- ============================================================
-- 1. Users cannot self-escalate (should raise 42501):
--
--   UPDATE users SET role = 'admin' WHERE id = auth.uid();
--   UPDATE users SET company_id = '<other tenant uuid>' WHERE id = auth.uid();
--
-- 2. Anon may no longer list invitations (should return 0 rows or 403):
--
--   SELECT * FROM company_invitations;
--
-- 3. accept_invitation refuses cross-user enrollment (should return
--    "You may only accept an invitation for your own account"):
--
--   SELECT accept_invitation('<any token>', '<some other user uuid>');
--
-- 4. tm-photos cross-tenant read is refused. As a user in Company B,
--    signed URL request or `storage.from('tm-photos').download('<A>/...')`
--    now returns "new row violates row-level security policy" or 404.
