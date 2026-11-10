-- ============================================================
-- MIGRATION: COR tracking, client comments, client portal
-- Date: 2026-11-11
-- ============================================================
--
-- APPLY ORDER: after 20261110_member_permissions_and_approval_guards.sql
-- (this file uses has_company_permission(); it stops with an error,
-- changing nothing, if that function is missing).
--
-- PURPOSE:
--   1. COR tracking. New columns on change_orders record when a COR
--      went to the client, when the client returned it for changes,
--      and when (and why) it was voided. sent_to_client_at is stamped
--      by a trigger whenever a signing link is created for the COR.
--      void_change_order() voids a COR with a required reason.
--      A voided COR keeps status 'closed' (the status CHECK constraint
--      is not touched); "voided" is voided_at IS NOT NULL.
--
--   2. Client comments. The client can return a COR for changes
--      instead of signing it (public_request_cor_changes, by signing
--      link). The COR goes to 'rejected' with the client's comment,
--      which is the state the office already revises and resubmits
--      from. Comments from both sides are kept in cor_client_comments.
--
--   3. Client portal. client_portal_access grants one client contact
--      access to one project's change orders, with an optional expiry;
--      it can be revoked at any time. The portal shows every COR that
--      has left draft: with the client, returned, approved, voided.
--      Opening a COR hands the client a signing link for it.
--
-- NEW OBJECTS: 9 columns, 2 tables, 1 trigger, 9 functions.
-- EXISTING OBJECTS CHANGED: none (columns are added; no policy,
-- constraint or function of an existing object is replaced).
--
-- ROLLBACK: supabase/rollbacks/20261111_cor_tracking_and_client_portal_rollback.sql
-- TESTS:    supabase/tests/cor_tracking_and_client_portal_tests.sql
--
-- IDEMPOTENT - safe to re-run. One transaction.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. Preconditions
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.change_orders') IS NULL
     OR to_regclass('public.signature_requests') IS NULL
     OR to_regclass('public.projects') IS NULL
     OR to_regclass('public.companies') IS NULL THEN
    RAISE EXCEPTION 'Expected tables are missing; nothing was changed';
  END IF;
  IF to_regprocedure('public.has_company_permission(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261110_member_permissions_and_approval_guards.sql first; nothing was changed';
  END IF;
  IF to_regprocedure('public.generate_signature_token()') IS NULL THEN
    RAISE EXCEPTION 'generate_signature_token() is missing; nothing was changed';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1. COR tracking columns
-- ------------------------------------------------------------
-- rejected_at / billed_at / closed_at are already written by the app
-- (corOps); they are added here in case this database lacks them.
ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS sent_to_client_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_to_client_by UUID,
  ADD COLUMN IF NOT EXISTS returned_by_client_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID,
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

COMMENT ON COLUMN change_orders.sent_to_client_at IS 'When the COR last went to the client (a signing link was created). Server-set.';
COMMENT ON COLUMN change_orders.returned_by_client_at IS 'When the client last returned the COR for changes. Server-set.';
COMMENT ON COLUMN change_orders.voided_at IS 'Set by void_change_order(). A voided COR has status closed.';

-- Backfill the sent date from the first signing link of each COR
UPDATE change_orders co
SET sent_to_client_at = first_request.created_at
FROM (
  SELECT sr.document_id, min(sr.created_at) AS created_at
  FROM signature_requests sr
  WHERE sr.document_type = 'cor'
  GROUP BY sr.document_id
) first_request
WHERE first_request.document_id = co.id
  AND co.sent_to_client_at IS NULL;

-- ------------------------------------------------------------
-- 2. Stamp the sent date when a signing link is created
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stamp_cor_sent_to_client()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.document_type = 'cor' THEN
    -- First send, or a re-send after the client returned it
    UPDATE change_orders co
    SET sent_to_client_at = now(),
        sent_to_client_by = COALESCE(NEW.created_by, co.sent_to_client_by)
    WHERE co.id = NEW.document_id
      AND (co.sent_to_client_at IS NULL
           OR (co.returned_by_client_at IS NOT NULL AND co.returned_by_client_at > co.sent_to_client_at));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block a signing link over the bookkeeping
  RAISE WARNING 'stamp_cor_sent_to_client: %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_cor_sent_to_client() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_stamp_cor_sent_to_client ON signature_requests;
CREATE TRIGGER trg_stamp_cor_sent_to_client
  AFTER INSERT ON signature_requests
  FOR EACH ROW EXECUTE FUNCTION public.stamp_cor_sent_to_client();

-- ------------------------------------------------------------
-- 3. Void a COR
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_change_order(p_cor_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cor    change_orders%ROWTYPE;
  v_reason TEXT := left(NULLIF(btrim(p_reason), ''), 500);
BEGIN
  SELECT * INTO v_cor FROM change_orders WHERE id = p_cor_id FOR UPDATE;
  IF NOT FOUND OR NOT public.has_company_permission(v_cor.company_id, 'send_cors') THEN
    RAISE EXCEPTION 'You do not have permission to void this change order' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Enter a reason for voiding this change order' USING ERRCODE = 'P0001';
  END IF;
  IF v_cor.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'This change order is already voided' USING ERRCODE = 'P0001';
  END IF;
  IF v_cor.status = 'billed' THEN
    RAISE EXCEPTION 'A billed change order cannot be voided' USING ERRCODE = 'P0001';
  END IF;

  UPDATE change_orders
  SET status = 'closed',
      closed_at = now(),
      voided_at = now(),
      voided_by = auth.uid(),
      void_reason = v_reason
  WHERE id = p_cor_id
  RETURNING * INTO v_cor;

  -- Signing links for a voided COR stop working
  UPDATE signature_requests
  SET status = 'revoked'
  WHERE document_type = 'cor' AND document_id = p_cor_id
    AND status IN ('pending', 'partially_signed');

  IF to_regclass('public.cor_status_history') IS NOT NULL THEN
    INSERT INTO cor_status_history (change_order_id, status, changed_by, notes)
    VALUES (p_cor_id, 'closed', auth.uid(), 'Voided: ' || v_reason);
  END IF;

  RETURN to_jsonb(v_cor);
END;
$$;

REVOKE ALL ON FUNCTION public.void_change_order(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_change_order(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 4. Client comments on a COR
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cor_client_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  project_id UUID NOT NULL,
  author_side TEXT NOT NULL CHECK (author_side IN ('client', 'office')),
  author_name TEXT,
  author_user_id UUID,
  body TEXT NOT NULL CHECK (length(btrim(body)) > 0 AND length(body) <= 4000),
  revision_number INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cor_client_comments_cor
  ON cor_client_comments (change_order_id, created_at);

ALTER TABLE cor_client_comments ENABLE ROW LEVEL SECURITY;

-- Members read their company's comments. All writes go through the
-- functions below, so there is no INSERT / UPDATE / DELETE policy.
DROP POLICY IF EXISTS "Company members view COR comments" ON cor_client_comments;
CREATE POLICY "Company members view COR comments" ON cor_client_comments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
      AND uc.company_id = cor_client_comments.company_id
      AND (uc.status = 'active' OR uc.status IS NULL)
  ));

REVOKE ALL ON cor_client_comments FROM anon, authenticated;
GRANT SELECT ON cor_client_comments TO authenticated;

-- The signing request behind a token, if the token may still be used.
-- p_allow_completed: reading is allowed after signing; acting is not.
CREATE OR REPLACE FUNCTION public.cor_request_for_token(p_token TEXT, p_allow_completed BOOLEAN)
RETURNS signature_requests
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request signature_requests%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN
    RAISE EXCEPTION 'signing_link_invalid';
  END IF;
  SELECT * INTO v_request FROM signature_requests WHERE signature_token = p_token;
  IF NOT FOUND OR v_request.document_type <> 'cor' THEN
    RAISE EXCEPTION 'signing_link_invalid';
  END IF;
  IF v_request.status = 'revoked' THEN
    RAISE EXCEPTION 'signing_link_revoked';
  END IF;
  IF v_request.status = 'completed' THEN
    IF p_allow_completed THEN RETURN v_request; END IF;
    RAISE EXCEPTION 'signing_already_signed';
  END IF;
  IF v_request.status = 'expired'
     OR (v_request.expires_at IS NOT NULL AND v_request.expires_at <= now()) THEN
    RAISE EXCEPTION 'signing_link_expired';
  END IF;
  IF v_request.status NOT IN ('pending', 'partially_signed') THEN
    RAISE EXCEPTION 'signing_link_invalid';
  END IF;
  RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION public.cor_request_for_token(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- The client returns a COR for changes instead of signing it
CREATE OR REPLACE FUNCTION public.public_request_cor_changes(p_token TEXT, p_comment TEXT, p_author_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request signature_requests%ROWTYPE;
  v_cor     change_orders%ROWTYPE;
  v_body    TEXT := NULLIF(btrim(p_comment), '');
  v_name    TEXT := left(NULLIF(btrim(p_author_name), ''), 120);
BEGIN
  v_request := public.cor_request_for_token(p_token, false);

  IF v_body IS NULL OR length(v_body) > 4000 OR v_name IS NULL THEN
    RAISE EXCEPTION 'signing_invalid_payload';
  END IF;

  SELECT * INTO v_cor FROM change_orders WHERE id = v_request.document_id FOR UPDATE;
  IF NOT FOUND OR v_cor.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'cor_not_awaiting_client';
  END IF;

  INSERT INTO cor_client_comments (change_order_id, company_id, project_id, author_side, author_name, body, revision_number)
  VALUES (v_cor.id, v_cor.company_id, v_cor.project_id, 'client', v_name, v_body,
          NULLIF(to_jsonb(v_cor)->>'revision_number', '')::int);

  UPDATE change_orders
  SET status = 'rejected',
      rejection_reason = left(v_name || ': ' || v_body, 500),
      rejected_at = now(),
      returned_by_client_at = now()
  WHERE id = v_cor.id;

  IF to_regclass('public.cor_status_history') IS NOT NULL THEN
    INSERT INTO cor_status_history (change_order_id, status, notes)
    VALUES (v_cor.id, 'rejected', 'Returned by client for changes (' || v_name || ')');
  END IF;

  RETURN jsonb_build_object('document_status', 'rejected');
END;
$$;

REVOKE ALL ON FUNCTION public.public_request_cor_changes(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_request_cor_changes(TEXT, TEXT, TEXT) TO anon, authenticated;

-- The comment thread, for the holder of a signing link
CREATE OR REPLACE FUNCTION public.public_get_cor_comments(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request signature_requests%ROWTYPE;
BEGIN
  v_request := public.cor_request_for_token(p_token, true);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', c.id, 'author_side', c.author_side, 'author_name', c.author_name,
             'body', c.body, 'revision_number', c.revision_number, 'created_at', c.created_at)
           ORDER BY c.created_at)
    FROM cor_client_comments c
    WHERE c.change_order_id = v_request.document_id
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.public_get_cor_comments(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_cor_comments(TEXT) TO anon, authenticated;

-- The office replies on the thread
CREATE OR REPLACE FUNCTION public.add_cor_comment(p_cor_id UUID, p_body TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cor  change_orders%ROWTYPE;
  v_body TEXT := NULLIF(btrim(p_body), '');
  v_name TEXT;
  v_row  cor_client_comments%ROWTYPE;
BEGIN
  SELECT * INTO v_cor FROM change_orders WHERE id = p_cor_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid() AND uc.company_id = v_cor.company_id
      AND (uc.status = 'active' OR uc.status IS NULL)
  ) THEN
    RAISE EXCEPTION 'Not authorized for this change order' USING ERRCODE = '42501';
  END IF;
  IF v_body IS NULL OR length(v_body) > 4000 THEN
    RAISE EXCEPTION 'Enter a comment (up to 4000 characters)' USING ERRCODE = 'P0001';
  END IF;

  IF to_regclass('public.users') IS NOT NULL THEN
    EXECUTE 'SELECT COALESCE(NULLIF(btrim(to_jsonb(u)->>''name''), ''''), to_jsonb(u)->>''email'') FROM users u WHERE u.id = $1'
      INTO v_name USING auth.uid();
  END IF;

  INSERT INTO cor_client_comments (change_order_id, company_id, project_id, author_side, author_name, author_user_id, body, revision_number)
  VALUES (v_cor.id, v_cor.company_id, v_cor.project_id, 'office', COALESCE(v_name, 'Office'), auth.uid(), v_body,
          NULLIF(to_jsonb(v_cor)->>'revision_number', '')::int)
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.add_cor_comment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_cor_comment(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 5. Client portal access (one contact, one project)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_portal_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL CHECK (length(btrim(contact_name)) > 0 AND length(contact_name) <= 200),
  contact_email TEXT CHECK (contact_email IS NULL OR length(contact_email) <= 254),
  access_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_viewed_at TIMESTAMPTZ,
  view_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_client_portal_access_project ON client_portal_access (project_id);

ALTER TABLE client_portal_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members view client portal access" ON client_portal_access;
CREATE POLICY "Company members view client portal access" ON client_portal_access
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
      AND uc.company_id = client_portal_access.company_id
      AND (uc.status = 'active' OR uc.status IS NULL)
  ));

REVOKE ALL ON client_portal_access FROM anon, authenticated;
GRANT SELECT ON client_portal_access TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_client_portal_access(
  p_project_id UUID, p_contact_name TEXT, p_contact_email TEXT, p_expires_at TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_company_id UUID;
  v_name  TEXT := left(NULLIF(btrim(p_contact_name), ''), 200);
  v_email TEXT := lower(NULLIF(btrim(p_contact_email), ''));
  v_row   client_portal_access%ROWTYPE;
BEGIN
  SELECT p.company_id INTO v_company_id FROM projects p WHERE p.id = p_project_id;
  IF v_company_id IS NULL OR NOT public.has_company_permission(v_company_id, 'manage_client_access') THEN
    RAISE EXCEPTION 'You do not have permission to manage client access. Ask a company administrator.'
      USING ERRCODE = '42501';
  END IF;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Enter the client contact''s name' USING ERRCODE = 'P0001';
  END IF;
  IF v_email IS NOT NULL AND (length(v_email) > 254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN
    RAISE EXCEPTION 'Enter a valid email address' USING ERRCODE = 'P0001';
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    RAISE EXCEPTION 'The expiry must be in the future' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO client_portal_access (company_id, project_id, contact_name, contact_email, access_token, expires_at, created_by)
  VALUES (v_company_id, p_project_id, v_name, v_email,
          'cp_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
          p_expires_at, auth.uid())
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.grant_client_portal_access(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_client_portal_access(UUID, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_client_portal_access(p_access_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row client_portal_access%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM client_portal_access WHERE id = p_access_id FOR UPDATE;
  IF NOT FOUND OR NOT public.has_company_permission(v_row.company_id, 'manage_client_access') THEN
    RAISE EXCEPTION 'You do not have permission to manage client access. Ask a company administrator.'
      USING ERRCODE = '42501';
  END IF;
  UPDATE client_portal_access
  SET revoked_at = COALESCE(revoked_at, now()), revoked_by = COALESCE(revoked_by, auth.uid())
  WHERE id = p_access_id
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_client_portal_access(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_client_portal_access(UUID) TO authenticated;

-- The access row behind a portal token, if it may still be used
CREATE OR REPLACE FUNCTION public.client_portal_access_for_token(p_token TEXT)
RETURNS client_portal_access
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row client_portal_access%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RAISE EXCEPTION 'portal_link_invalid';
  END IF;
  SELECT * INTO v_row FROM client_portal_access WHERE access_token = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'portal_link_invalid';
  END IF;
  IF v_row.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'portal_link_revoked';
  END IF;
  IF v_row.expires_at IS NOT NULL AND v_row.expires_at <= now() THEN
    RAISE EXCEPTION 'portal_link_expired';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.client_portal_access_for_token(TEXT) FROM PUBLIC, anon, authenticated;

-- What the client sees: the project and every COR that has left draft
CREATE OR REPLACE FUNCTION public.public_client_portal(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_access client_portal_access%ROWTYPE;
  v_project JSONB;
  v_cors JSONB;
BEGIN
  v_access := public.client_portal_access_for_token(p_token);

  UPDATE client_portal_access
  SET view_count = view_count + 1, last_viewed_at = now()
  WHERE id = v_access.id;

  SELECT jsonb_build_object(
           'id', p.id, 'name', p.name, 'job_number', to_jsonb(p)->>'job_number',
           'company_name', c.name, 'company_logo_url', to_jsonb(c)->>'logo_url')
  INTO v_project
  FROM projects p JOIN companies c ON c.id = p.company_id
  WHERE p.id = v_access.project_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', co.id,
           'cor_number', co.cor_number,
           'title', co.title,
           'cor_total', co.cor_total,
           'status', co.status,
           'stage', CASE
             WHEN co.voided_at IS NOT NULL THEN 'voided'
             WHEN co.status = 'pending_approval' THEN 'with_client'
             WHEN co.status = 'rejected' THEN 'returned'
             WHEN co.status IN ('approved', 'billed') THEN 'approved'
             ELSE 'closed' END,
           'revision_number', NULLIF(to_jsonb(co)->>'revision_number', '')::int,
           'sent_to_client_at', co.sent_to_client_at,
           'returned_by_client_at', co.returned_by_client_at,
           'approved_at', co.approved_at,
           'voided_at', co.voided_at,
           'void_reason', co.void_reason
         ) ORDER BY co.cor_number), '[]'::jsonb)
  INTO v_cors
  FROM change_orders co
  WHERE co.project_id = v_access.project_id
    AND co.status <> 'draft';

  RETURN jsonb_build_object(
    'contact_name', v_access.contact_name,
    'expires_at', v_access.expires_at,
    'project', v_project,
    'change_orders', v_cors);
END;
$$;

REVOKE ALL ON FUNCTION public.public_client_portal(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_client_portal(TEXT) TO anon, authenticated;

-- Open one COR from the portal: returns a signing link token for it.
-- Reuses the newest usable link; creates one when the COR is with the
-- client or approved and has none. Returns NULL for a returned or
-- voided COR (the portal list already says what happened to it).
CREATE OR REPLACE FUNCTION public.public_client_portal_open_cor(p_token TEXT, p_cor_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_access client_portal_access%ROWTYPE;
  v_cor    change_orders%ROWTYPE;
  v_token  TEXT;
BEGIN
  v_access := public.client_portal_access_for_token(p_token);

  SELECT * INTO v_cor FROM change_orders
  WHERE id = p_cor_id AND project_id = v_access.project_id AND status <> 'draft';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'portal_cor_not_found';
  END IF;
  IF v_cor.voided_at IS NOT NULL OR v_cor.status NOT IN ('pending_approval', 'approved', 'billed') THEN
    RETURN NULL;
  END IF;

  SELECT sr.signature_token INTO v_token
  FROM signature_requests sr
  WHERE sr.document_type = 'cor' AND sr.document_id = v_cor.id
    AND (sr.status = 'completed'
         OR (sr.status IN ('pending', 'partially_signed')
             AND (sr.expires_at IS NULL OR sr.expires_at > now())))
  ORDER BY (sr.status = 'completed') DESC, sr.created_at DESC
  LIMIT 1;

  IF v_token IS NULL AND v_cor.status IN ('pending_approval', 'approved') THEN
    INSERT INTO signature_requests (document_type, document_id, company_id, project_id, signature_token, status, expires_at)
    VALUES ('cor', v_cor.id, v_cor.company_id, v_cor.project_id, generate_signature_token(), 'pending', v_access.expires_at)
    RETURNING signature_token INTO v_token;
  END IF;

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.public_client_portal_open_cor(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_client_portal_open_cor(TEXT, UUID) TO anon, authenticated;

COMMIT;
