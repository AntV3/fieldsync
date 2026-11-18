-- ============================================================
-- JOIN REQUEST PROTECTION
-- ============================================================
-- Before this, the office code on the "join company" screen was only
-- checked in the browser: the join request itself was a direct insert
-- into user_companies that the server accepted without the code, and
-- wrong codes were not limited. Anyone could flood a company with
-- join requests, or guess its office code without limit.
--
-- 1. verify_office_code(): at most 10 wrong office codes per company
--    per 15 minutes; after that every attempt is refused until the
--    window passes. Wrong codes are logged in auth_attempts (deleted
--    after 24 hours by the cleanup job).
-- 2. request_company_membership(company, office_code): the only way to
--    ask to join a company. Signed-in users only; checks the office
--    code on the server under the same limit; creates a pending
--    member request (an administrator still approves it).
-- 3. The direct-insert policy on user_companies is removed, so a join
--    request cannot skip the office code. Registering a company and
--    accepting an invitation are unaffected (they use their own
--    functions).
--
-- Apply after 20261113_tenant_isolation_hardening.sql (checked).
-- Deploy the app build that calls request_company_membership first.
-- One transaction.
-- Rollback: supabase/rollbacks/20261118_join_request_protection_rollback.sql
-- Tests:    supabase/tests/join_request_protection_tests.sql
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.is_active_member(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261113_tenant_isolation_hardening.sql first';
  END IF;
END $$;

-- Wrong office codes for a company in the last 15 minutes
CREATE OR REPLACE FUNCTION public.office_code_failures(p_company_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COUNT(*)::int FROM auth_attempts a
  WHERE a.success = FALSE
    AND a.attempt_type = 'office_code_invalid:' || p_company_id::text
    AND a.created_at > NOW() - interval '15 minutes';
$$;
REVOKE ALL ON FUNCTION public.office_code_failures(UUID) FROM PUBLIC, anon, authenticated;

-- True when the code is right and the company is not locked by guessing.
-- Same signature as before, so the app's call is unchanged.
CREATE OR REPLACE FUNCTION public.verify_office_code(company_id uuid, code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_company UUID := verify_office_code.company_id;
  v_stored  TEXT;
BEGIN
  IF v_company IS NULL OR code IS NULL OR length(TRIM(code)) = 0 OR length(code) > 64 THEN
    RETURN FALSE;
  END IF;

  IF office_code_failures(v_company) >= 10 THEN
    RETURN FALSE;
  END IF;

  SELECT c.office_code INTO v_stored FROM companies c WHERE c.id = v_company;
  IF v_stored IS NOT NULL AND UPPER(TRIM(v_stored)) = UPPER(TRIM(code)) THEN
    RETURN TRUE;
  END IF;

  INSERT INTO auth_attempts (attempt_type, success)
  VALUES ('office_code_invalid:' || v_company::text, FALSE);
  RETURN FALSE;
END;
$function$;

REVOKE ALL ON FUNCTION public.verify_office_code(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_office_code(uuid, text) TO anon, authenticated, service_role;

-- The only way to ask to join a company
CREATE OR REPLACE FUNCTION public.request_company_membership(p_company_id UUID, p_office_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_existing TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to ask to join a company' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM companies WHERE id = p_company_id) THEN
    RETURN jsonb_build_object('status', 'invalid_code');
  END IF;

  IF office_code_failures(p_company_id) >= 10 THEN
    RETURN jsonb_build_object('status', 'too_many_attempts');
  END IF;
  IF NOT verify_office_code(p_company_id, p_office_code) THEN
    RETURN jsonb_build_object('status', 'invalid_code');
  END IF;

  SELECT COALESCE(status, 'active') INTO v_existing
  FROM user_companies WHERE user_id = v_uid AND company_id = p_company_id;
  IF FOUND THEN
    RETURN jsonb_build_object('status', v_existing);
  END IF;

  INSERT INTO user_companies (user_id, company_id, role, access_level, status)
  VALUES (v_uid, p_company_id, 'member', 'member', 'pending');

  RETURN jsonb_build_object('status', 'requested');
END;
$$;

REVOKE ALL ON FUNCTION public.request_company_membership(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_company_membership(UUID, TEXT) TO authenticated, service_role;

-- No more direct join requests
DROP POLICY IF EXISTS "tenant: request to join" ON public.user_companies;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'user_companies' AND cmd IN ('INSERT', 'ALL')) THEN
    RAISE EXCEPTION 'an insert policy on user_companies remains';
  END IF;
  RAISE NOTICE 'join request protection applied';
END $$;

COMMIT;
