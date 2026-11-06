-- ============================================================
-- ROLLBACK for 20261104_signature_public_rpcs.sql
--
-- Run AFTER 20261104_transactional_email_rollback.sql (reverse apply
-- order). Deploy the previous client first: the current client
-- creates and resends links only through create_signature_request /
-- resend_signature_request.
--
-- Removes: trg_signature_requests_guard and signature_requests_guard(),
-- create_signature_request(...), resend_signature_request(uuid).
-- Re-creates public_get_signature_request_by_token exactly as
-- 20261105_public_signing_rpcs.sql (launch item 1) left it.
--
-- Deliberately NOT restored: the anon write path ("Anon can create /
-- update signature requests", "Anon can add signatures", anon grants)
-- and the blanket policies ("Company users manage signature requests"
-- FOR ALL on any membership, "Authenticated can view / add
-- signatures"). A signature request row is a signing credential and
-- outside signatures go through public_add_signature.
--
-- Because the previous client creates office links with a direct
-- INSERT, and the guard trigger goes away here, this rollback gives
-- authenticated users back INSERT on signature_requests behind
-- "Company members create signature requests" and re-creates
-- "Company members update signature requests", both pinned: active
-- member (user_company_ids()), the project of that company, the
-- document inside the project, created_by NULL or the caller, INSERT
-- only as 'pending'. The SELECT policies of the migration stay. The
-- field app's "Get signature link" fails until
-- 20261104_signature_public_rpcs.sql is applied again.
--
-- Left in place: the columns recipient_email, recipient_name, sent_at,
-- last_sent_at, send_count, resend_requested_at and their CHECK
-- constraints (data is kept; the previous client ignores them).
--
-- IDEMPOTENT: safe to re-run.
-- ============================================================

BEGIN;

-- 2. guard
DROP TRIGGER IF EXISTS trg_signature_requests_guard ON signature_requests;
DROP FUNCTION IF EXISTS signature_requests_guard();

-- 3, 4. RPCs
DROP FUNCTION IF EXISTS create_signature_request(TEXT, UUID, UUID, TIMESTAMPTZ, TEXT, TEXT);
DROP FUNCTION IF EXISTS resend_signature_request(UUID);

-- 0. Pinned office write policies for the previous client (see header)
GRANT INSERT ON signature_requests TO authenticated;

DROP POLICY IF EXISTS "Company members create signature requests" ON signature_requests;
CREATE POLICY "Company members create signature requests"
  ON signature_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (SELECT user_company_ids())
    AND status = 'pending'
    AND (created_by IS NULL OR created_by = auth.uid())
    AND EXISTS (SELECT 1 FROM projects p
                WHERE p.id = signature_requests.project_id
                  AND p.company_id = signature_requests.company_id)
    AND (
      (document_type = 'tm_ticket' AND EXISTS (
         SELECT 1 FROM t_and_m_tickets t
         WHERE t.id = signature_requests.document_id
           AND t.project_id = signature_requests.project_id))
      OR
      (document_type = 'cor' AND EXISTS (
         SELECT 1 FROM change_orders c
         WHERE c.id = signature_requests.document_id
           AND c.project_id = signature_requests.project_id
           AND c.company_id = signature_requests.company_id))
    )
  );

DROP POLICY IF EXISTS "Company members update signature requests" ON signature_requests;
CREATE POLICY "Company members update signature requests"
  ON signature_requests FOR UPDATE
  TO authenticated
  USING (company_id IN (SELECT user_company_ids()))
  WITH CHECK (
    company_id IN (SELECT user_company_ids())
    AND EXISTS (SELECT 1 FROM projects p
                WHERE p.id = signature_requests.project_id
                  AND p.company_id = signature_requests.company_id)
    AND (
      (document_type = 'tm_ticket' AND EXISTS (
         SELECT 1 FROM t_and_m_tickets t
         WHERE t.id = signature_requests.document_id
           AND t.project_id = signature_requests.project_id))
      OR
      (document_type = 'cor' AND EXISTS (
         SELECT 1 FROM change_orders c
         WHERE c.id = signature_requests.document_id
           AND c.project_id = signature_requests.project_id
           AND c.company_id = signature_requests.company_id))
    )
  );

-- 5. Token reader RPC as item 1 left it
--    (20261105_public_signing_rpcs.sql section 3, verbatim)
CREATE OR REPLACE FUNCTION public_get_signature_request_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_request    signature_requests%ROWTYPE;
  v_signatures JSONB;
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_request
  FROM signature_requests
  WHERE signature_token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- A revoked link discloses nothing beyond its state (no document /
  -- project / company ids that could seed a forged request).
  IF v_request.status = 'revoked' THEN
    RETURN jsonb_build_object(
      'status', 'revoked',
      'document_type', v_request.document_type
    );
  END IF;

  -- Time expiry only closes unsigned links; a completed request keeps
  -- rendering its signed state.
  IF v_request.status <> 'completed'
     AND v_request.expires_at IS NOT NULL AND v_request.expires_at <= NOW() THEN
    RETURN jsonb_build_object(
      'status', 'expired',
      'document_type', v_request.document_type
    );
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.signed_at), '[]'::jsonb)
  INTO v_signatures
  FROM signatures s
  WHERE s.signature_request_id = v_request.id;

  RETURN to_jsonb(v_request) || jsonb_build_object('signatures', v_signatures);
END;
$$;

REVOKE ALL ON FUNCTION public_get_signature_request_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_get_signature_request_by_token(TEXT) TO anon, authenticated;

COMMIT;

-- Verify:
--   SELECT to_regprocedure('public.create_signature_request(text,uuid,uuid,timestamptz,text,text)');  -- NULL
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_signature_requests_guard';                      -- no rows
--   SELECT has_table_privilege('anon', 'signature_requests', 'INSERT');                               -- f (kept)
--   SELECT policyname, cmd FROM pg_policies WHERE tablename IN ('signature_requests', 'signatures');  -- 4 "Company members ..." rows
