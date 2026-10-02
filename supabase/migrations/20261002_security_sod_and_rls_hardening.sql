-- =============================================================
-- 2026-10-02 — Security hardening: SoD, audit-log forgery, RLS
--
-- Context: daily health review (Oct 2, 2026) identified four
-- correctness-plus-security gaps:
--
-- 1. accept_invitation(TEXT, UUID) trusts the caller-supplied
--    p_user_id, so any authenticated attacker with a valid
--    invite token can enroll ANY victim into their company.
--    Fix: ignore the parameter and use auth.uid() inside the
--    function. Keep the old signature callable but reject when
--    p_user_id != auth.uid() so pre-upgrade clients still work.
--
-- 2. cor_status_history INSERT policy for anon has
--    WITH CHECK (true), so any anon caller can forge an audit
--    entry naming any CoR and any other user as the actor.
--    Fix: bind user to auth.uid() (or a valid field session that
--    scopes to the CoR's project), and bind change_order_id to a
--    CoR the caller can actually access.
--
-- 3. change_orders has no DB-side SoD check — the creator can
--    update their own row to status='approved' and set
--    approved_by to themselves. The JS check in corOps.approveCOR
--    never ran because CORDetail.jsx did not pass userId.
--    Fix: BEFORE UPDATE trigger that blocks approval when the
--    approver is the creator or the submitter.
--
-- 4. notification_preferences — write policy's "project_id IN
--    user's companies" branch let any company member edit
--    another user's preferences (including muting a safety
--    officer's injury-report alerts).
--    Fix: write policy restricted to the user's OWN rows.
--
-- Each block is idempotent (DROP IF EXISTS, CREATE OR REPLACE).
-- =============================================================

-- -------------------------------------------------------------
-- 1. accept_invitation: ignore caller-supplied p_user_id
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_invitation(
  p_invite_token TEXT,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID;
  v_invitation RECORD;
  v_existing RECORD;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  -- Pre-fix callers passed their own uid as p_user_id; refuse any
  -- other value rather than silently enrolling someone else.
  IF p_user_id IS NOT NULL AND p_user_id <> v_caller THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invitation can only be accepted by the signed-in user'
    );
  END IF;

  SELECT * INTO v_invitation
  FROM company_invitations
  WHERE invite_token = p_invite_token
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (max_uses IS NULL OR use_count < max_uses);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;

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

-- -------------------------------------------------------------
-- 2. cor_status_history: bind actor + scope writes to accessible CoRs
-- -------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.cor_status_history') IS NULL THEN RETURN; END IF;

  DROP POLICY IF EXISTS "Field users can log COR status changes" ON cor_status_history;

  -- Authenticated office users: actor must be themselves, CoR must
  -- be in their companies.
  DROP POLICY IF EXISTS "Office users log COR status changes" ON cor_status_history;
  CREATE POLICY "Office users log COR status changes"
    ON cor_status_history FOR INSERT
    TO authenticated
    WITH CHECK (
      changed_by = auth.uid()
      AND change_order_id IN (
        SELECT co.id FROM change_orders co
        WHERE co.company_id IN (SELECT user_company_ids())
      )
    );

  -- Field (PIN / anon field session) callers may still log, but only
  -- against a CoR whose project matches an active field session, and
  -- never on behalf of someone else when auth.uid() IS NULL (set
  -- changed_by to NULL so the row shows "field session" not a user).
  DROP POLICY IF EXISTS "Field session logs COR status changes" ON cor_status_history;
  CREATE POLICY "Field session logs COR status changes"
    ON cor_status_history FOR INSERT
    TO anon
    WITH CHECK (
      changed_by IS NULL
      AND change_order_id IN (
        SELECT co.id FROM change_orders co
        JOIN has_valid_field_session() s
          ON s.project_id = co.project_id
      )
    );
END $$;

-- -------------------------------------------------------------
-- 3. change_orders: block self-approval at the DB layer
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_cor_approval_sod()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor UUID;
BEGIN
  -- Only inspect transitions INTO an approved-ish status.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('approved', 'billed', 'closed') THEN
    RETURN NEW;
  END IF;

  v_actor := COALESCE(NEW.approved_by, auth.uid());

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Change order approval requires an authenticated approver'
      USING ERRCODE = '42501';
  END IF;

  IF v_actor = OLD.created_by OR v_actor = OLD.submitted_by THEN
    RAISE EXCEPTION 'Segregation of duties: the submitter or creator of a change order cannot approve it'
      USING ERRCODE = '42501';
  END IF;

  -- Pin approved_by to the real actor and timestamp if the client didn't.
  IF NEW.approved_by IS NULL THEN
    NEW.approved_by := v_actor;
  END IF;
  IF NEW.approved_at IS NULL THEN
    NEW.approved_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_change_orders_sod ON change_orders;
CREATE TRIGGER trg_change_orders_sod
  BEFORE UPDATE ON change_orders
  FOR EACH ROW
  EXECUTE FUNCTION enforce_cor_approval_sod();

-- -------------------------------------------------------------
-- 4. notification_preferences: restrict writes to own rows
-- -------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.notification_preferences') IS NULL THEN RETURN; END IF;

  -- Keep broad SELECT so admins can audit who's muted what, but split
  -- the write-side policies so one member cannot mute another's
  -- safety-incident notifications.
  DROP POLICY IF EXISTS "Manage own or company notification prefs"
    ON notification_preferences;

  DROP POLICY IF EXISTS "Read own or company notification prefs"
    ON notification_preferences;
  CREATE POLICY "Read own or company notification prefs"
    ON notification_preferences FOR SELECT
    USING (
      user_id = auth.uid()
      OR project_id IN (
        SELECT p.id FROM projects p
        WHERE p.company_id IN (SELECT user_company_ids())
      )
    );

  DROP POLICY IF EXISTS "Write own notification prefs"
    ON notification_preferences;
  CREATE POLICY "Write own notification prefs"
    ON notification_preferences FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
END $$;
