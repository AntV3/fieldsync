-- ============================================================
-- MIGRATION: Record on-site client signatures on the server
-- Date: 2026-11-12
-- ============================================================
--
-- PURPOSE:
-- When a client signs a T&M ticket on the foreman's device, the app
-- wrote the signature straight onto the ticket row. Nothing told the
-- office, the time came from the phone, and there was no audit row.
-- A signature through an emailed link, by contrast, is recorded in
-- `signatures` and the office is emailed (trg_email_document_signed).
--
-- record_tm_client_signature(ticket, signature) gives the on-site
-- signature the same treatment, by the same means:
--   - a completed signature_requests row and a signatures row
--     (slot 2, the client), so the existing "document signed" email
--     goes to the office with no change to the email system;
--   - the ticket's client_signature_* columns, stamped with the
--     server's time, and status -> client_signed.
--
-- Callable by a field session for the ticket's project, or by an
-- active office member of its company (can_access_project()).
--
-- The app calls this function when it exists and falls back to the
-- previous direct write when it does not, so the app works before
-- and after this migration.
--
-- NEW OBJECTS: 1 function. EXISTING OBJECTS CHANGED: none.
-- ROLLBACK: supabase/rollbacks/20261112_tm_onsite_client_signature_rollback.sql
-- TESTS:    supabase/tests/tm_onsite_client_signature_tests.sql
--
-- IDEMPOTENT - safe to re-run. One transaction.
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.t_and_m_tickets') IS NULL
     OR to_regclass('public.signature_requests') IS NULL
     OR to_regclass('public.signatures') IS NULL THEN
    RAISE EXCEPTION 'Expected tables are missing; nothing was changed';
  END IF;
  IF to_regprocedure('public.can_access_project(uuid)') IS NULL
     OR to_regprocedure('public.generate_signature_token()') IS NULL THEN
    RAISE EXCEPTION 'can_access_project() or generate_signature_token() is missing; nothing was changed';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.record_tm_client_signature(p_ticket_id UUID, p_signature JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_ticket   t_and_m_tickets%ROWTYPE;
  v_company  UUID;
  v_image    TEXT := p_signature->>'signature';
  v_name     TEXT := left(NULLIF(btrim(p_signature->>'signerName'), ''), 120);
  v_title    TEXT := left(NULLIF(btrim(p_signature->>'signerTitle'), ''), 120);
  v_org      TEXT := left(NULLIF(btrim(p_signature->>'signerCompany'), ''), 200);
  v_agent    TEXT := left(NULLIF(btrim(p_signature->>'userAgent'), ''), 500);
  v_now      TIMESTAMPTZ := now();
  v_request_id UUID;
  v_signature_id UUID;
BEGIN
  SELECT * INTO v_ticket FROM t_and_m_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND OR NOT COALESCE(public.can_access_project(v_ticket.project_id), false) THEN
    RAISE EXCEPTION 'Not authorized for this ticket' USING ERRCODE = '42501';
  END IF;

  IF v_image IS NULL OR v_image !~ '^data:image/png;base64,' OR length(v_image) > 2000000 OR v_name IS NULL THEN
    RAISE EXCEPTION 'A signature and the signer''s name are required' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(v_ticket.client_signature_data, '') <> '' THEN
    RAISE EXCEPTION 'This ticket already has a client signature' USING ERRCODE = 'P0001';
  END IF;
  IF v_ticket.status = 'billed' THEN
    RAISE EXCEPTION 'This ticket has been billed and can no longer be signed' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.company_id INTO v_company FROM projects p WHERE p.id = v_ticket.project_id;

  -- Same records as a signature through a link: a completed request and a
  -- signatures row. The signatures insert is what emails the office.
  INSERT INTO signature_requests (document_type, document_id, company_id, project_id, signature_token, status, created_by)
  VALUES ('tm_ticket', v_ticket.id, v_company, v_ticket.project_id, generate_signature_token(), 'completed', auth.uid())
  RETURNING id INTO v_request_id;

  INSERT INTO signatures (signature_request_id, signature_slot, signature_image, signer_name, signer_title, signer_company, signed_at, user_agent)
  VALUES (v_request_id, 2, v_image, v_name, v_title, v_org, v_now, v_agent)
  RETURNING id INTO v_signature_id;

  -- signatures.company_id exists from 20261105 on; set it when it is there
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'signatures' AND column_name = 'company_id') THEN
    EXECUTE 'UPDATE signatures SET company_id = $1 WHERE id = $2' USING v_company, v_signature_id;
  END IF;

  UPDATE t_and_m_tickets
  SET client_signature_data = v_image,
      client_signature_name = v_name,
      client_signature_title = v_title,
      client_signature_company = v_org,
      client_signature_date = v_now,
      status = CASE WHEN status IN ('pending', 'foreman_signed') THEN 'client_signed' ELSE status END
  WHERE id = v_ticket.id
  RETURNING * INTO v_ticket;

  RETURN jsonb_build_object(
    'id', v_ticket.id,
    'status', v_ticket.status,
    'client_signature_name', v_ticket.client_signature_name,
    'client_signature_date', v_ticket.client_signature_date
  );
END;
$$;

COMMENT ON FUNCTION public.record_tm_client_signature(UUID, JSONB) IS
  'Records a client signature captured on the foreman''s device: completed signature_requests row + signatures row (slot 2, which emails the office through trg_email_document_signed), ticket client_signature_* with server time, status -> client_signed. Field session for the project or office member. Errors: 42501 not authorized, 22023 invalid payload, P0001 already signed / billed.';

REVOKE ALL ON FUNCTION public.record_tm_client_signature(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_tm_client_signature(UUID, JSONB) TO anon, authenticated;

COMMIT;
