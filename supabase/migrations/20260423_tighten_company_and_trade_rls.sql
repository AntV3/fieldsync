-- ============================================================
-- SEC-C1 (scoped): Tighten the remaining USING (true) RLS
-- policies that still grant anon unrestricted SELECT.
--
-- REMAINING LEAKS (after prior migrations tightened projects,
-- areas, field tables):
--
--   1. companies "Public view companies by code" — USING (true).
--      Pre-login anon lookup of a company by its code. Currently
--      lets any anon caller enumerate every company row.
--
--   2. trade_templates "Anyone can read trade templates" —
--      USING (true). Shared template catalogue, not company-
--      scoped, but readable by fully-unauthenticated callers.
--
-- FIX:
--   1. Replace the permissive anon read on `companies` with a
--      SECURITY DEFINER RPC `get_company_by_code(p_code)` that
--      returns only the matching row. Drop the permissive policy.
--      Anon direct SELECT on companies is revoked; authenticated
--      and field-session callers still go through the existing
--      "Secure field view companies" policy (see
--      20260310_field_sessions_security.sql:501-510).
--
--   2. Scope trade_templates SELECT to callers that either have
--      an authenticated user or a valid field session. The table
--      itself is a shared preset catalogue (not company data) so
--      a broad read is acceptable for any legitimate app user —
--      we just close the anonymous-reconnaissance path.
--
-- IDEMPOTENT — safe to re-run.
-- ============================================================

-- 1. Companies: replace USING (true) with RPC-gated access.
DROP POLICY IF EXISTS "Public view companies by code" ON companies;

CREATE OR REPLACE FUNCTION get_company_by_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code TEXT;
  v_row  companies%ROWTYPE;
BEGIN
  IF p_code IS NULL THEN
    RETURN NULL;
  END IF;

  v_code := TRIM(p_code);
  IF length(v_code) < 2 OR length(v_code) > 32 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row
  FROM companies c
  WHERE UPPER(c.code) = UPPER(v_code)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Return a minimal, non-sensitive projection. Branding fields
  -- (name, logo) are needed for the login UX; anything else
  -- should stay behind the authenticated policy.
  RETURN jsonb_build_object(
    'id',       v_row.id,
    'name',     v_row.name,
    'code',     v_row.code,
    'logo_url', v_row.logo_url
  );
END;
$$;

REVOKE ALL ON FUNCTION get_company_by_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_company_by_code(TEXT) TO anon, authenticated;

-- Revoke the blanket anon SELECT on companies. The authenticated
-- and field-session policies from 20260310_field_sessions_security
-- continue to grant legitimate access.
REVOKE SELECT ON companies FROM anon;

-- 2. Trade templates: tighten USING (true) → require any auth signal.
DROP POLICY IF EXISTS "Anyone can read trade templates"         ON trade_templates;
DROP POLICY IF EXISTS "Authed callers can read trade templates" ON trade_templates;
CREATE POLICY "Authed callers can read trade templates"
  ON trade_templates FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    OR EXISTS (SELECT 1 FROM has_valid_field_session())
  );

-- Verification (manual):
--   SELECT polname FROM pg_policies
--   WHERE tablename IN ('companies','trade_templates')
--     AND qual = 'true';
--   -- Should be empty after this migration.
