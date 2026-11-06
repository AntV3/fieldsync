-- ============================================================
-- SIGNATURE REQUESTS: close the anon write path, recipient columns,
-- create / resend RPCs (launch item 5, part 1 of 2)
--
-- ************************************************************
-- APPLY ORDER: this file must run AFTER
--   20261105_public_signing_rpcs.sql   (launch item 1)
-- even though its date sorts earlier, and BEFORE
--   20261104_transactional_email.sql   (part 2 of item 5).
-- It replaces item 1's pinned anon policies with an RPC and
-- re-creates item 1's public_get_signature_request_by_token. The
-- first statement below checks that public_add_signature exists
-- and stops with an error if it does not; nothing is changed then.
-- ************************************************************
--
-- PROBLEM:
--   20250101_signature_anon_access.sql let any anon caller INSERT a
--   signature request and UPDATE an open one; item 1 pinned both
--   policies to a field session, but a signature_requests row is now
--   a credential (it unlocks item 1's signing RPCs) and, with item 5,
--   a recipient email. A direct anon write path would let the field
--   app (or anyone holding a field PIN) mint links and email any
--   address with any content the table allows. "Anon can add
--   signatures" on signatures is likewise obsolete: every outside
--   signature goes through public_add_signature (item 1).
--   The authenticated side was as open: "Company users manage
--   signature requests" (FOR ALL, any user_companies row, pending and
--   removed members included) let a member INSERT a request naming
--   another tenant's project / document with a chosen token, status,
--   created_by and created_at, then sign it through
--   public_add_signature; "Authenticated can view signatures" /
--   "Authenticated can add signatures" (USING / WITH CHECK true,
--   20241201000330) let any logged-in user read every tenant's
--   signatures and write signature rows directly.
--
-- FIX:
--   0. Rebuild access to signature_requests and signatures:
--      - every existing policy on the two tables is dropped (known
--        repo names listed below, plus any dashboard-made one, each
--        reported with a NOTICE);
--      - anon: REVOKE ALL on both tables (reads go through the token
--        RPCs, writes through the RPCs below and public_add_signature);
--      - authenticated: REVOKE INSERT, DELETE, TRUNCATE on
--        signature_requests and INSERT, UPDATE, DELETE, TRUNCATE on
--        signatures; it keeps SELECT on both and UPDATE on
--        signature_requests (the client's revoke);
--      - new policies, all on user_company_ids() (ACTIVE memberships
--        only, 20260720):
--          "Company members view signature requests"   SELECT
--          "Company members update signature requests" UPDATE
--          "Company members view signatures"           SELECT (via the
--            request's company)
--      The client creates links only through create_signature_request
--      and never writes signatures; in-person signatures
--      (saveCORSignature / saveTMClientSignature) write the document
--      rows, not signatures. The legacy increment_signature_view_count()
--      has no caller after item 1 and is left as is.
--   1. signature_requests columns: recipient_email, recipient_name,
--      sent_at, last_sent_at, send_count (NOT NULL DEFAULT 0),
--      resend_requested_at; CHECK on the recipient email format.
--   2. signature_requests_guard() BEFORE INSERT OR UPDATE (every role
--      unless noted):
--        - recipient_email / recipient_name never change after insert
--          -> 'Recipient cannot be changed'
--        - anon / authenticated may not write sent_at, last_sent_at,
--          send_count, nor (on INSERT) resend_requested_at -> 42501
--        - anon / authenticated may not re-point a request (document_type,
--          document_id, project_id, company_id, signature_token,
--          created_by) -> 42501
--        - anon / authenticated may change nothing else either except
--          status -> 'revoked' (not from 'completed') and the resend
--          bump: created_at, expires_at, view_count, last_viewed_at and
--          any other status change are refused -> 42501. The definer
--          functions (public_add_signature's 'completed',
--          public_get_document_for_signing's view_count) run as the
--          owner and are not affected.
--        - a resend_requested_at change must be a bump to within 60 s
--          of now(), needs a recipient, an open (pending /
--          partially_signed) and unexpired request, and no send or
--          resend in the last 5 minutes (created_at, sent_at,
--          last_sent_at, previous resend_requested_at)
--          -> 'Please wait a few minutes before resending'
--      The definer RPCs below and item 1's functions run as the
--      function owner, so only the "every role" rules apply to them.
--   3. create_signature_request(p_document_type, p_document_id,
--      p_project_id, p_expires_at, p_recipient_email, p_recipient_name)
--      RETURNS JSONB (the inserted row). Authorizes an active member of
--      the project's company OR validate_field_session(p_project_id);
--      company_id comes from the project, never from the caller; the
--      document must belong to the project (and company) and be
--      signable (COR pending_approval / approved; ticket not billed).
--      Errors: 42501 'Not authorized for this project' (also for an
--      unknown project); 22023 invalid type / email / expiry, document
--      not in project, not signable.
--   4. resend_signature_request(p_request_id) RETURNS JSONB (the
--      updated row). Same authorization against the request's project;
--      readable 22023 pre-checks; then bumps resend_requested_at (the
--      guard throttles, the email trigger of
--      20261104_transactional_email.sql enqueues).
--   5. public_get_signature_request_by_token re-created: item 1's body
--      unchanged, with the recipient / sender bookkeeping keys stripped
--      from the row it returns.
--
--   Every function: SECURITY DEFINER, SET search_path = public,
--   extensions, pg_temp, REVOKE ALL FROM PUBLIC, anon, authenticated
--   (Supabase default privileges grant EXECUTE to the API roles on
--   every new function), then explicit grants.
--
-- ROLLBACK: supabase/rollbacks/20261104_signature_public_rpcs_rollback.sql
--   (does NOT restore the anon write path or the blanket policies;
--   gives office members a pinned INSERT policy back for the previous
--   client; leaves the columns).
--
-- IDEMPOTENT: safe to re-run.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Apply-order check (see header)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.public_add_signature(text, integer, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261105_public_signing_rpcs.sql (launch item 1) before 20261104_signature_public_rpcs.sql: public_add_signature(text, integer, jsonb) does not exist. Nothing was changed.';
  END IF;
  IF to_regclass('public.user_companies') IS NULL THEN
    RAISE EXCEPTION 'public.user_companies is missing: company membership cannot be checked. Nothing was changed.';
  END IF;
END $$;

-- ------------------------------------------------------------
-- Helper: user_company_ids() (companies the caller is an active
-- member of). Normally created by 20260720_enable_rls_remaining_tables
-- .sql; created here only when missing, with the same body. When
-- user_companies has no status column, every membership row counts.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.user_company_ids()') IS NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'user_companies' AND column_name = 'status') THEN
      EXECUTE $F$
        CREATE FUNCTION public.user_company_ids()
        RETURNS SETOF UUID
        LANGUAGE sql SECURITY DEFINER STABLE
        SET search_path = public, pg_temp
        AS $B$
          SELECT uc.company_id
          FROM user_companies uc
          WHERE uc.user_id = auth.uid()
            AND (uc.status = 'active' OR uc.status IS NULL);
        $B$
      $F$;
    ELSE
      EXECUTE $F$
        CREATE FUNCTION public.user_company_ids()
        RETURNS SETOF UUID
        LANGUAGE sql SECURITY DEFINER STABLE
        SET search_path = public, pg_temp
        AS $B$
          SELECT uc.company_id
          FROM user_companies uc
          WHERE uc.user_id = auth.uid();
        $B$
      $F$;
    END IF;
    RAISE NOTICE 'Created user_company_ids() (20260720_enable_rls_remaining_tables.sql had not been applied)';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 0. Rebuild access to signature_requests / signatures
-- ------------------------------------------------------------
-- Known policy names from the repo (20241201000080 / 000240 / 000320 /
-- 000330, 20250101, 20260301, 20260402, 20260423, 20261105):
DROP POLICY IF EXISTS "Anon can create signature requests" ON signature_requests;
DROP POLICY IF EXISTS "Anon can update signature requests" ON signature_requests;
DROP POLICY IF EXISTS "Company users manage signature requests" ON signature_requests;
DROP POLICY IF EXISTS "Active members manage signature requests" ON signature_requests;
DROP POLICY IF EXISTS "Public read signature requests by token" ON signature_requests;
DROP POLICY IF EXISTS "Anon can add signatures" ON signatures;
DROP POLICY IF EXISTS "Anon can view signatures" ON signatures;
DROP POLICY IF EXISTS "Public can add signatures" ON signatures;
DROP POLICY IF EXISTS "Public can view signatures" ON signatures;
DROP POLICY IF EXISTS "Authenticated can add signatures" ON signatures;
DROP POLICY IF EXISTS "Authenticated can view signatures" ON signatures;
DROP POLICY IF EXISTS "Company users view signatures" ON signatures;
DROP POLICY IF EXISTS "Signatures access via signature requests" ON signatures;
DROP POLICY IF EXISTS "Users can view own project signatures" ON signatures;
DROP POLICY IF EXISTS "signatures_company_scoped_select" ON signatures;
DROP POLICY IF EXISTS "Authenticated users can read signatures" ON signatures;
DROP POLICY IF EXISTS "Authenticated users can view signatures" ON signatures;
DROP POLICY IF EXISTS "signatures_authenticated_select" ON signatures;
DROP POLICY IF EXISTS "signatures_select_authenticated" ON signatures;

-- ... and anything else (dashboard-made) except the three created
-- below, so that no unknown permissive policy can widen them.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename, policyname, cmd, roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('signature_requests', 'signatures')
      AND policyname NOT IN ('Company members view signature requests',
                             'Company members update signature requests',
                             'Company members view signatures')
  LOOP
    RAISE NOTICE 'dropping policy "%" on % (% %)', r.policyname, r.tablename, r.cmd, r.roles;
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE signature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON signature_requests FROM anon;
REVOKE ALL ON signatures FROM anon;
REVOKE INSERT, DELETE, TRUNCATE ON signature_requests FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON signatures FROM authenticated;
GRANT SELECT, UPDATE ON signature_requests TO authenticated;
GRANT SELECT ON signatures TO authenticated;

DROP POLICY IF EXISTS "Company members view signature requests" ON signature_requests;
CREATE POLICY "Company members view signature requests"
  ON signature_requests FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT user_company_ids()));

DROP POLICY IF EXISTS "Company members update signature requests" ON signature_requests;
CREATE POLICY "Company members update signature requests"
  ON signature_requests FOR UPDATE
  TO authenticated
  USING (company_id IN (SELECT user_company_ids()))
  WITH CHECK (company_id IN (SELECT user_company_ids()));

DROP POLICY IF EXISTS "Company members view signatures" ON signatures;
CREATE POLICY "Company members view signatures"
  ON signatures FOR SELECT
  TO authenticated
  USING (signature_request_id IN (
    SELECT sr.id FROM signature_requests sr
    WHERE sr.company_id IN (SELECT user_company_ids())
  ));

-- ------------------------------------------------------------
-- 1. Recipient + send bookkeeping columns
-- ------------------------------------------------------------
ALTER TABLE signature_requests
  ADD COLUMN IF NOT EXISTS recipient_email TEXT,
  ADD COLUMN IF NOT EXISTS recipient_name TEXT,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS send_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resend_requested_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.signature_requests'::regclass
      AND conname = 'signature_requests_recipient_email_check'
  ) THEN
    ALTER TABLE signature_requests
      ADD CONSTRAINT signature_requests_recipient_email_check
      CHECK (
        recipient_email IS NULL
        OR (length(recipient_email) <= 254
            AND recipient_email ~ '^[^[:space:]@<>(),;:"\\\[\]]+@[^[:space:]@<>(),;:"\\\[\]]+\.[^[:space:]@<>(),;:"\\\[\]]+$')
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.signature_requests'::regclass
      AND conname = 'signature_requests_recipient_name_check'
  ) THEN
    ALTER TABLE signature_requests
      ADD CONSTRAINT signature_requests_recipient_name_check
      CHECK (recipient_name IS NULL OR length(recipient_name) <= 200);
  END IF;
END $$;

COMMENT ON COLUMN signature_requests.recipient_email IS 'Who the signing link is emailed to (lower-cased). Immutable after insert.';
COMMENT ON COLUMN signature_requests.sent_at IS 'First successful send of the signing email. Written by the email worker only.';
COMMENT ON COLUMN signature_requests.last_sent_at IS 'Latest successful send of the signing email. Written by the email worker only.';
COMMENT ON COLUMN signature_requests.send_count IS 'Successful sends of the signing email. Written by the email worker only.';
COMMENT ON COLUMN signature_requests.resend_requested_at IS 'Bumped by resend_signature_request(); throttled to once per 5 minutes by signature_requests_guard().';

-- ------------------------------------------------------------
-- 2. Guard trigger
--    SECURITY INVOKER on purpose: current_user is the API role for
--    PostgREST requests and the function owner inside the definer
--    RPCs, which is what separates "client wrote it" from "server
--    wrote it".
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION signature_requests_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_api_role BOOLEAN := current_user IN ('anon', 'authenticated');
  v_last     TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF v_api_role AND (
         NEW.sent_at IS NOT NULL
         OR NEW.last_sent_at IS NOT NULL
         OR COALESCE(NEW.send_count, 0) <> 0
         OR NEW.resend_requested_at IS NOT NULL) THEN
      RAISE EXCEPTION 'sent_at, last_sent_at, send_count and resend_requested_at are set by the server'
        USING ERRCODE = '42501';
    END IF;
    NEW.recipient_email := lower(NULLIF(btrim(NEW.recipient_email), ''));
    NEW.recipient_name := NULLIF(btrim(NEW.recipient_name), '');
    RETURN NEW;
  END IF;

  -- UPDATE ---------------------------------------------------------
  IF NEW.recipient_email IS DISTINCT FROM OLD.recipient_email
     OR NEW.recipient_name IS DISTINCT FROM OLD.recipient_name THEN
    RAISE EXCEPTION 'Recipient cannot be changed';
  END IF;

  IF v_api_role THEN
    IF NEW.sent_at IS DISTINCT FROM OLD.sent_at
       OR NEW.last_sent_at IS DISTINCT FROM OLD.last_sent_at
       OR NEW.send_count IS DISTINCT FROM OLD.send_count THEN
      RAISE EXCEPTION 'sent_at, last_sent_at and send_count are set by the email worker'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.document_type IS DISTINCT FROM OLD.document_type
       OR NEW.document_id IS DISTINCT FROM OLD.document_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.signature_token IS DISTINCT FROM OLD.signature_token
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'A signature request cannot be re-pointed; create a new one'
        USING ERRCODE = '42501';
    END IF;
    -- The only client write is a revoke (and the throttled resend bump).
    IF NEW.status IS DISTINCT FROM OLD.status
       AND (NEW.status <> 'revoked' OR OLD.status = 'completed') THEN
      RAISE EXCEPTION 'A signature request can only be revoked'
        USING ERRCODE = '42501';
    END IF;
    IF (to_jsonb(NEW) - 'status' - 'resend_requested_at' - 'updated_at')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'status' - 'resend_requested_at' - 'updated_at') THEN
      RAISE EXCEPTION 'Only status (revoke) can be changed on a signature request'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.resend_requested_at IS DISTINCT FROM OLD.resend_requested_at THEN
    IF NEW.resend_requested_at IS NULL
       OR NEW.resend_requested_at < now() - interval '60 seconds'
       OR NEW.resend_requested_at > now() + interval '60 seconds' THEN
      RAISE EXCEPTION 'resend_requested_at must be the current time'
        USING ERRCODE = '22023';
    END IF;
    IF OLD.recipient_email IS NULL THEN
      RAISE EXCEPTION 'This signature link has no recipient email'
        USING ERRCODE = '22023';
    END IF;
    IF NEW.status NOT IN ('pending', 'partially_signed') THEN
      RAISE EXCEPTION 'This signature link is no longer open'
        USING ERRCODE = '22023';
    END IF;
    IF NEW.expires_at IS NOT NULL AND NEW.expires_at <= now() THEN
      RAISE EXCEPTION 'This signature link has expired'
        USING ERRCODE = '22023';
    END IF;
    v_last := GREATEST(OLD.created_at, OLD.sent_at, OLD.last_sent_at, OLD.resend_requested_at);
    IF v_last IS NOT NULL AND v_last > now() - interval '5 minutes' THEN
      RAISE EXCEPTION 'Please wait a few minutes before resending';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION signature_requests_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_signature_requests_guard ON signature_requests;
CREATE TRIGGER trg_signature_requests_guard
  BEFORE INSERT OR UPDATE ON signature_requests
  FOR EACH ROW EXECUTE FUNCTION signature_requests_guard();

-- ------------------------------------------------------------
-- 3. create_signature_request
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_signature_request(
  p_document_type   TEXT,
  p_document_id     UUID,
  p_project_id      UUID,
  p_expires_at      TIMESTAMPTZ,
  p_recipient_email TEXT,
  p_recipient_name  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  c_email_re CONSTANT TEXT := '^[^[:space:]@<>(),;:"\\\[\]]+@[^[:space:]@<>(),;:"\\\[\]]+\.[^[:space:]@<>(),;:"\\\[\]]+$';
  v_company_id UUID;
  v_status     TEXT;
  v_doc_company UUID;
  v_email      TEXT;
  v_name       TEXT;
  v_row        signature_requests%ROWTYPE;
BEGIN
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized for this project' USING ERRCODE = '42501';
  END IF;

  -- company from the project, never from the caller
  SELECT p.company_id INTO v_company_id FROM projects p WHERE p.id = p_project_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized for this project' USING ERRCODE = '42501';
  END IF;

  -- active member of the project's company (user_company_ids(): status
  -- 'active' only, 20260720), or the field session of this project
  IF NOT (
    (auth.uid() IS NOT NULL AND v_company_id IN (SELECT user_company_ids()))
    OR COALESCE(validate_field_session(p_project_id), false)
  ) THEN
    RAISE EXCEPTION 'Not authorized for this project' USING ERRCODE = '42501';
  END IF;

  IF p_document_type IS NULL OR p_document_type NOT IN ('cor', 'tm_ticket') THEN
    RAISE EXCEPTION 'Invalid document type' USING ERRCODE = '22023';
  END IF;
  IF p_document_id IS NULL THEN
    RAISE EXCEPTION 'Document not found in this project' USING ERRCODE = '22023';
  END IF;

  IF p_document_type = 'cor' THEN
    SELECT co.status, co.company_id INTO v_status, v_doc_company
    FROM change_orders co
    WHERE co.id = p_document_id AND co.project_id = p_project_id;
    IF NOT FOUND OR v_doc_company IS DISTINCT FROM v_company_id THEN
      RAISE EXCEPTION 'Document not found in this project' USING ERRCODE = '22023';
    END IF;
    IF v_status NOT IN ('pending_approval', 'approved') THEN
      RAISE EXCEPTION 'This change order cannot be sent for signature (status %)', v_status
        USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT t.status INTO v_status
    FROM t_and_m_tickets t
    WHERE t.id = p_document_id AND t.project_id = p_project_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Document not found in this project' USING ERRCODE = '22023';
    END IF;
    IF v_status = 'billed' THEN
      RAISE EXCEPTION 'This ticket has been billed and cannot be sent for signature'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    RAISE EXCEPTION 'Expiry must be in the future' USING ERRCODE = '22023';
  END IF;

  v_email := lower(NULLIF(btrim(p_recipient_email), ''));
  IF v_email IS NOT NULL AND (length(v_email) > 254 OR v_email !~ c_email_re) THEN
    RAISE EXCEPTION 'Invalid recipient email' USING ERRCODE = '22023';
  END IF;
  v_name := CASE WHEN v_email IS NULL THEN NULL ELSE left(NULLIF(btrim(p_recipient_name), ''), 200) END;

  INSERT INTO signature_requests (
    document_type, document_id, company_id, project_id,
    signature_token, status, expires_at, created_by,
    recipient_email, recipient_name
  ) VALUES (
    p_document_type, p_document_id, v_company_id, p_project_id,
    generate_signature_token(), 'pending', p_expires_at, auth.uid(),
    v_email, v_name
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

COMMENT ON FUNCTION create_signature_request(TEXT, UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) IS
  'Creates a signing link for a COR or T&M ticket. Office member of the project''s company or a field session for the project. company_id is derived from the project. With a recipient email the signing email is queued by trg_email_signature_request. Errors: 42501 not authorized, 22023 invalid input.';

REVOKE ALL ON FUNCTION create_signature_request(TEXT, UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_signature_request(TEXT, UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------
-- 4. resend_signature_request
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION resend_signature_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_row signature_requests%ROWTYPE;
  v_project_company UUID;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized for this project' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM signature_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized for this project' USING ERRCODE = '42501';
  END IF;

  SELECT p.company_id INTO v_project_company FROM projects p WHERE p.id = v_row.project_id;

  IF v_project_company IS DISTINCT FROM v_row.company_id OR NOT (
    (auth.uid() IS NOT NULL AND v_row.company_id IN (SELECT user_company_ids()))
    OR COALESCE(validate_field_session(v_row.project_id), false)
  ) THEN
    RAISE EXCEPTION 'Not authorized for this project' USING ERRCODE = '42501';
  END IF;

  IF v_row.recipient_email IS NULL THEN
    RAISE EXCEPTION 'This signature link has no recipient email' USING ERRCODE = '22023';
  END IF;
  IF v_row.status NOT IN ('pending', 'partially_signed') THEN
    RAISE EXCEPTION 'This signature link is no longer open' USING ERRCODE = '22023';
  END IF;
  IF v_row.expires_at IS NOT NULL AND v_row.expires_at <= now() THEN
    RAISE EXCEPTION 'This signature link has expired' USING ERRCODE = '22023';
  END IF;

  -- signature_requests_guard enforces the 5-minute throttle;
  -- trg_email_signature_request (20261104_transactional_email.sql)
  -- queues the email. clock_timestamp(): two calls in one
  -- transaction are still two distinct bumps (and the second is
  -- throttled).
  UPDATE signature_requests
  SET resend_requested_at = clock_timestamp(),
      updated_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

COMMENT ON FUNCTION resend_signature_request(UUID) IS
  'Emails an open signing link again (office member or field session of the request''s project). Throttled to once per 5 minutes: ''Please wait a few minutes before resending''.';

REVOKE ALL ON FUNCTION resend_signature_request(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION resend_signature_request(UUID) TO anon, authenticated;

-- ------------------------------------------------------------
-- 5. Token reader RPC: item 1's body (20261105_public_signing_rpcs.sql
--    section 3), with the recipient / send bookkeeping keys stripped
--    from the request row before it is returned.
-- ------------------------------------------------------------
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

  RETURN (to_jsonb(v_request)
            - 'recipient_email' - 'recipient_name' - 'created_by' - 'send_count'
            - 'sent_at' - 'last_sent_at' - 'resend_requested_at')
         || jsonb_build_object('signatures', v_signatures);
END;
$$;

REVOKE ALL ON FUNCTION public_get_signature_request_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_get_signature_request_by_token(TEXT) TO anon, authenticated;

COMMIT;

-- Verify manually:
--   SELECT policyname, cmd, roles FROM pg_policies
--    WHERE tablename IN ('signature_requests', 'signatures') ORDER BY 1;    -- no "Anon can ..." rows
--   SELECT has_table_privilege('anon', 'signature_requests', 'INSERT'),
--          has_table_privilege('anon', 'signature_requests', 'UPDATE'),
--          has_table_privilege('anon', 'signatures', 'INSERT');              -- f, f, f
-- Then apply 20261104_transactional_email.sql and run
-- supabase/tests/email_outbox_tests.sql and public_signing_smoke.sql.
