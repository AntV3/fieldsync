-- ============================================================
-- ROLLBACK for 20261105_public_signing_rpcs.sql
--
-- Drops the signing-token storage policy and the new functions,
-- then re-creates public_get_signature_request_by_token exactly as
-- 20260423_signature_tenant_isolation.sql:70-106 defined it (with
-- its REVOKE/GRANT), so the currently deployed client keeps working.
--
-- signatures.company_id and its index are left in place: the
-- column is referenced by the signatures_company_scoped_select
-- policy from 20260402_security_critical_fixes.sql and dropping it
-- would remove real audit data.
--
-- The pinned anon policies on signature_requests (migration section
-- 9: a field session for the request's project, the project's company
-- and a document inside the project) are also left in place. The
-- deployed client always creates links with a field session or an
-- office login, so they keep working, and the 20250101 blanket
-- policies would let a session-less caller mint requests again.
--
-- IDEMPOTENT — safe to re-run.
-- ============================================================

-- 8. Storage policy (depends on signing_token_can_read_photo, so first)
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage.objects not present in this database; nothing to drop';
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS "Signing link can read document photos" ON storage.objects';
END $$;

-- 7, 5, 4, 2, 1
DROP FUNCTION IF EXISTS signing_token_can_read_photo(TEXT);
DROP FUNCTION IF EXISTS public_add_signature(TEXT, INTEGER, JSONB);
DROP FUNCTION IF EXISTS public_get_document_for_signing(TEXT);
DROP FUNCTION IF EXISTS public_signing_ticket_json(UUID);
DROP FUNCTION IF EXISTS public_signing_pick(JSONB, TEXT[]);

-- 3. Token-enforced reader RPC, verbatim from 20260423:70-106
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

-- Re-apply 20260423_harden_definer_search_path.sql to this function so the
-- production search_path (public, extensions, pg_temp) is restored too.
ALTER FUNCTION public_get_signature_request_by_token(TEXT)
  SET search_path = public, extensions, pg_temp;

-- The deployed client (before this change) calls
-- increment_signature_view_count(TEXT) from 20241201000320_signatures.sql;
-- it was never dropped, so nothing to restore here.
