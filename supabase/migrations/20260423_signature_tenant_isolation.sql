-- ============================================================
-- SEC-H3: Signature cross-tenant visibility
--
-- PROBLEM:
--   The anon SELECT policies on `signature_requests` and
--   `signatures` only checked that the request row exists and is
--   not expired — the `signature_token` is not enforced by RLS.
--   As a result, any anon caller (e.g. foreman on the field app)
--   could read the signatures / request metadata of any
--   non-expired signature request, across company tenants, given
--   only its UUID.
--
-- FIX:
--   1. Revoke the broad anon SELECT policies on both tables.
--   2. Expose reads through a single SECURITY DEFINER RPC,
--      `public_get_signature_request_by_token(p_token)`, which
--      enforces the token before returning the request plus its
--      signatures.
--   3. Keep anon INSERT on `signatures` so the public signing page
--      can still submit, but route public reads exclusively through
--      the RPC. Authenticated (in-company) access is unchanged and
--      continues to use `user_companies` + company_id policies.
--
-- IDEMPOTENT — safe to re-run.
-- ============================================================

-- 1. Drop the over-permissive anon SELECT policies.
--    (Named in database/migration_signatures.sql and
--    database/migration_signatures_anon_access.sql.)
DROP POLICY IF EXISTS "Public read signature requests by token" ON signature_requests;
DROP POLICY IF EXISTS "Public can view signatures" ON signatures;
DROP POLICY IF EXISTS "Anon can view signatures" ON signatures;
DROP POLICY IF EXISTS "Public can add signatures" ON signatures;

-- Keep only the scoped anon INSERT policy (it still requires the
-- caller to know a real request_id, which comes from the token
-- RPC below).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'signatures'
      AND policyname = 'Anon can add signatures'
  ) THEN
    EXECUTE $POL$
      CREATE POLICY "Anon can add signatures" ON signatures
        FOR INSERT
        TO anon
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM signature_requests sr
            WHERE sr.id = signature_request_id
              AND sr.status IN ('pending', 'partially_signed')
              AND (sr.expires_at IS NULL OR sr.expires_at > NOW())
          )
        )
    $POL$;
  END IF;
END $$;

-- 2. Revoke anon SELECT on the tables. Anon reads go through RPC.
REVOKE SELECT ON signature_requests FROM anon;
REVOKE SELECT ON signatures FROM anon;

-- Keep INSERT on signatures (policy gates to valid open request).
GRANT INSERT ON signatures TO anon;

-- 3. Token-enforced reader RPC.
CREATE OR REPLACE FUNCTION public_get_signature_request_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request signature_requests%ROWTYPE;
  v_signatures JSONB;
  v_result JSONB;
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_request
  FROM signature_requests
  WHERE signature_token = p_token
    AND (expires_at IS NULL OR expires_at > NOW())
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.signed_at), '[]'::jsonb)
  INTO v_signatures
  FROM signatures s
  WHERE s.signature_request_id = v_request.id;

  v_result := to_jsonb(v_request) || jsonb_build_object('signatures', v_signatures);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public_get_signature_request_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_get_signature_request_by_token(TEXT) TO anon, authenticated;

-- Confirm. Run manually:
--   SELECT public_get_signature_request_by_token('sig_someRealToken');
