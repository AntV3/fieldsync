-- ============================================================
-- COR TRACKING + CLIENT PORTAL TESTS
-- ============================================================
-- Exercises supabase/migrations/20261111_cor_tracking_and_client_portal.sql
-- as the anon role (client, by token) and the authenticated role
-- (office, JWT claims).
--
-- HOW TO USE: paste the whole file into the Supabase SQL Editor (or
-- psql -v ON_ERROR_STOP=1) AFTER both 20261110 and 20261111. Every
-- check RAISEs on failure and prints "PASS: ..." on success. ONE
-- transaction that ends in ROLLBACK: no rows are left behind.
--
-- EXPECTED: "NOTICE: PASS: ..." lines and a final
--   "NOTICE: COR TRACKING TESTS: all N checks passed (rolled back)".
-- ============================================================

BEGIN;

SELECT set_config('cort.passes', '0', true);

CREATE TEMP TABLE cort_ids (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
CREATE TEMP TABLE cort_text (k TEXT PRIMARY KEY, v TEXT) ON COMMIT DROP;
GRANT SELECT ON cort_ids, cort_text TO anon, authenticated;
GRANT INSERT, UPDATE ON cort_ids, cort_text TO anon, authenticated;

DO $$
DECLARE
  v_company UUID := gen_random_uuid();
  v_project UUID := gen_random_uuid();
  v_other_project UUID := gen_random_uuid();
  v_admin   UUID := gen_random_uuid();
  v_member  UUID := gen_random_uuid();
  v_cor UUID := gen_random_uuid();
  v_draft UUID := gen_random_uuid();
  v_other_cor UUID := gen_random_uuid();
BEGIN
  INSERT INTO companies (id, name, code, office_code)
  VALUES (v_company, 'COR Track Co',
          'CTR' || upper(substr(md5(random()::text), 1, 8)),
          'OFF' || upper(substr(md5(random()::text), 1, 8)));
  INSERT INTO projects (id, company_id, name, job_number, status)
  VALUES (v_project, v_company, 'COR Track Project', 'CTR-001', 'active'),
         (v_other_project, v_company, 'COR Track Other', 'CTR-002', 'active');

  INSERT INTO auth.users (id, email) VALUES
    (v_admin,  'cort-admin@example.invalid'),
    (v_member, 'cort-member@example.invalid');
  INSERT INTO users (id, email, name, company_id, role)
  VALUES (v_admin,  'cort-admin@example.invalid',  'Cort Admin',  v_company, 'admin'),
         (v_member, 'cort-member@example.invalid', 'Cort Member', v_company, 'member')
  ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id;
  INSERT INTO user_companies (user_id, company_id, role, access_level, status)
  VALUES (v_admin,  v_company, 'admin',  'administrator', 'active'),
         (v_member, v_company, 'member', 'member',        'active')
  ON CONFLICT (user_id, company_id) DO UPDATE SET status = 'active';

  INSERT INTO change_orders (id, company_id, project_id, cor_number, title, scope_of_work, period_start, period_end, status)
  VALUES (v_cor,       v_company, v_project,       'CTR-COR-1', 'Tracked COR', 'Scope', CURRENT_DATE, CURRENT_DATE, 'pending_approval'),
         (v_draft,     v_company, v_project,       'CTR-COR-2', 'Draft COR',   'Scope', CURRENT_DATE, CURRENT_DATE, 'draft'),
         (v_other_cor, v_company, v_other_project, 'CTR-COR-9', 'Other COR',   'Scope', CURRENT_DATE, CURRENT_DATE, 'pending_approval');

  INSERT INTO cort_ids VALUES
    ('company', v_company), ('project', v_project), ('other_project', v_other_project),
    ('admin', v_admin), ('member', v_member),
    ('cor', v_cor), ('draft', v_draft), ('other_cor', v_other_cor);
END $$;

CREATE FUNCTION pg_temp.id(p TEXT) RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT v FROM cort_ids WHERE k = p $$;
CREATE FUNCTION pg_temp.txt(p TEXT) RETURNS TEXT LANGUAGE sql STABLE AS $$ SELECT v FROM cort_text WHERE k = p $$;
CREATE FUNCTION pg_temp.pass(p TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE 'PASS: %', p;
  PERFORM set_config('cort.passes', (current_setting('cort.passes', true)::int + 1)::text, true);
END $$;
-- Run a statement; return '' on success, else the error message
CREATE FUNCTION pg_temp.try(p_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN '';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ' ' || SQLERRM;
END $$;
CREATE FUNCTION pg_temp.as_user(p TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.headers', '{}', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id(p), 'role', 'authenticated')::text, true);
END $$;
CREATE FUNCTION pg_temp.as_client() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.headers', '{}', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- ------------------------------------------------------------
-- (1) A signing link stamps the sent date
-- ------------------------------------------------------------
DO $$
DECLARE v_token TEXT;
BEGIN
  IF (SELECT sent_to_client_at FROM change_orders WHERE id = pg_temp.id('cor')) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: sent date set before any link';
  END IF;
  INSERT INTO signature_requests (document_type, document_id, company_id, project_id, signature_token, status)
  VALUES ('cor', pg_temp.id('cor'), pg_temp.id('company'), pg_temp.id('project'), generate_signature_token(), 'pending')
  RETURNING signature_token INTO v_token;
  INSERT INTO cort_text VALUES ('sig_token', v_token);
  IF (SELECT sent_to_client_at FROM change_orders WHERE id = pg_temp.id('cor')) IS NULL THEN
    RAISE EXCEPTION 'FAIL: creating a signing link did not stamp sent_to_client_at';
  END IF;
  PERFORM pg_temp.pass('(1) creating a signing link stamps sent_to_client_at');
END $$;

-- ------------------------------------------------------------
-- (2) The client returns the COR for changes; the office replies
-- ------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT pg_temp.as_client();
DO $$
DECLARE v TEXT; j JSONB;
BEGIN
  v := pg_temp.try(format('SELECT public_request_cor_changes(%L, %L, %L)', 'not-a-real-token', 'x', 'GC'));
  IF v NOT LIKE '%signing_link_invalid%' THEN RAISE EXCEPTION 'FAIL: bad token gave "%"', v; END IF;
  v := pg_temp.try(format('SELECT public_request_cor_changes(%L, %L, %L)', pg_temp.txt('sig_token'), '   ', 'GC'));
  IF v NOT LIKE '%signing_invalid_payload%' THEN RAISE EXCEPTION 'FAIL: empty comment gave "%"', v; END IF;
  v := pg_temp.try(format('SELECT public_request_cor_changes(%L, %L, %L)', pg_temp.txt('sig_token'), 'Hours on ticket 3 look high', 'Pat GC'));
  IF v <> '' THEN RAISE EXCEPTION 'FAIL: request changes refused: %', v; END IF;
  j := public_get_cor_comments(pg_temp.txt('sig_token'));
  IF jsonb_array_length(j) <> 1 OR j->0->>'author_side' <> 'client' OR j->0->>'author_name' <> 'Pat GC' THEN
    RAISE EXCEPTION 'FAIL: comment thread is %', j;
  END IF;
  v := pg_temp.try('SELECT count(*) FROM cor_client_comments');
  IF v = '' THEN RAISE EXCEPTION 'FAIL: anon can read cor_client_comments directly'; END IF;
  RESET ROLE;
  IF (SELECT status FROM change_orders WHERE id = pg_temp.id('cor')) <> 'rejected'
     OR (SELECT returned_by_client_at FROM change_orders WHERE id = pg_temp.id('cor')) IS NULL
     OR (SELECT rejection_reason FROM change_orders WHERE id = pg_temp.id('cor')) NOT LIKE 'Pat GC: Hours%' THEN
    RAISE EXCEPTION 'FAIL: COR was not returned with the client comment';
  END IF;
  PERFORM pg_temp.pass('(2a) client returns the COR: comment kept, COR rejected with the reason, no direct table read');
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('member');
DO $$
DECLARE v TEXT;
BEGIN
  v := pg_temp.try(format('SELECT add_cor_comment(%L, %L)', pg_temp.id('cor'), 'Corrected to 6 hours'));
  IF v <> '' THEN RAISE EXCEPTION 'FAIL: office reply refused: %', v; END IF;
  IF (SELECT count(*) FROM cor_client_comments WHERE change_order_id = pg_temp.id('cor')) <> 2 THEN
    RAISE EXCEPTION 'FAIL: member cannot read both comments';
  END IF;
  IF (SELECT author_name FROM cor_client_comments WHERE author_side = 'office' AND change_order_id = pg_temp.id('cor')) <> 'Cort Member' THEN
    RAISE EXCEPTION 'FAIL: office reply is not attributed to the member';
  END IF;
  v := pg_temp.try(format('INSERT INTO cor_client_comments (change_order_id, company_id, project_id, author_side, body) VALUES (%L, %L, %L, ''client'', ''forged'')',
                          pg_temp.id('cor'), pg_temp.id('company'), pg_temp.id('project')));
  IF v = '' THEN RAISE EXCEPTION 'FAIL: a member wrote a comment directly'; END IF;
  PERFORM pg_temp.pass('(2b) office replies through add_cor_comment; no direct writes');
END $$;

-- A second signing link after the return moves the sent date forward
RESET ROLE;
DO $$
DECLARE v_before TIMESTAMPTZ; v_token TEXT;
BEGIN
  UPDATE change_orders SET status = 'pending_approval',
         sent_to_client_at = now() - INTERVAL '3 days',
         returned_by_client_at = now() - INTERVAL '1 day'
  WHERE id = pg_temp.id('cor');
  SELECT sent_to_client_at INTO v_before FROM change_orders WHERE id = pg_temp.id('cor');
  INSERT INTO signature_requests (document_type, document_id, company_id, project_id, signature_token, status)
  VALUES ('cor', pg_temp.id('cor'), pg_temp.id('company'), pg_temp.id('project'), generate_signature_token(), 'pending')
  RETURNING signature_token INTO v_token;
  IF (SELECT sent_to_client_at FROM change_orders WHERE id = pg_temp.id('cor')) <= v_before THEN
    RAISE EXCEPTION 'FAIL: re-sending after a return did not move sent_to_client_at';
  END IF;
  PERFORM pg_temp.pass('(2c) re-sending after a return restarts the sent date');
END $$;

-- ------------------------------------------------------------
-- (3) Client portal: grant, view, open, revoke
-- ------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('member');
DO $$
DECLARE v TEXT; j JSONB;
BEGIN
  v := pg_temp.try(format('SELECT grant_client_portal_access(%L, %L, %L, NULL)', pg_temp.id('project'), 'Pat GC', 'pat@example.invalid'));
  IF v NOT LIKE '42501%' THEN RAISE EXCEPTION 'FAIL: member without permission granted portal access: "%"', v; END IF;
  PERFORM pg_temp.as_user('admin');
  j := grant_client_portal_access(pg_temp.id('project'), 'Pat GC', 'Pat@Example.invalid', now() + INTERVAL '30 days');
  IF j->>'contact_email' <> 'pat@example.invalid' OR length(j->>'access_token') < 32 THEN
    RAISE EXCEPTION 'FAIL: grant returned %', j;
  END IF;
  INSERT INTO cort_text VALUES ('portal_token', j->>'access_token');
  INSERT INTO cort_ids VALUES ('access', (j->>'id')::uuid);
  PERFORM pg_temp.pass('(3a) only a permitted user grants portal access; token returned');
END $$;

RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.as_client();
DO $$
DECLARE v TEXT; j JSONB; t TEXT;
BEGIN
  j := public_client_portal(pg_temp.txt('portal_token'));
  IF j->'project'->>'name' <> 'COR Track Project' OR jsonb_array_length(j->'change_orders') <> 1
     OR j->'change_orders'->0->>'cor_number' <> 'CTR-COR-1' OR j->'change_orders'->0->>'stage' <> 'with_client' THEN
    RAISE EXCEPTION 'FAIL: portal shows % (expected the one non-draft COR of this project)', j;
  END IF;
  t := public_client_portal_open_cor(pg_temp.txt('portal_token'), pg_temp.id('cor'));
  IF t IS NULL OR length(t) < 8 THEN RAISE EXCEPTION 'FAIL: opening a COR returned no signing link'; END IF;
  v := pg_temp.try(format('SELECT public_client_portal_open_cor(%L, %L)', pg_temp.txt('portal_token'), pg_temp.id('other_cor')));
  IF v NOT LIKE '%portal_cor_not_found%' THEN RAISE EXCEPTION 'FAIL: portal opened another project''s COR: "%"', v; END IF;
  v := pg_temp.try(format('SELECT public_client_portal_open_cor(%L, %L)', pg_temp.txt('portal_token'), pg_temp.id('draft')));
  IF v NOT LIKE '%portal_cor_not_found%' THEN RAISE EXCEPTION 'FAIL: portal opened a draft: "%"', v; END IF;
  v := pg_temp.try('SELECT count(*) FROM client_portal_access');
  IF v = '' THEN RAISE EXCEPTION 'FAIL: anon can read client_portal_access directly'; END IF;
  PERFORM pg_temp.pass('(3b) portal lists this project''s released CORs only, opens one, refuses drafts and other projects');
END $$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('admin');
SELECT revoke_client_portal_access(pg_temp.id('access'));
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.as_client();
DO $$
DECLARE v TEXT;
BEGIN
  v := pg_temp.try(format('SELECT public_client_portal(%L)', pg_temp.txt('portal_token')));
  IF v NOT LIKE '%portal_link_revoked%' THEN RAISE EXCEPTION 'FAIL: revoked portal still opens: "%"', v; END IF;
  PERFORM pg_temp.pass('(3c) revoked access stops working at once');
END $$;

-- ------------------------------------------------------------
-- (4) Void
-- ------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('member');
DO $$
DECLARE v TEXT;
BEGIN
  v := pg_temp.try(format('SELECT void_change_order(%L, %L)', pg_temp.id('cor'), 'Scope cancelled'));
  IF v NOT LIKE '42501%' THEN RAISE EXCEPTION 'FAIL: member without permission voided a COR: "%"', v; END IF;
  PERFORM pg_temp.as_user('admin');
  v := pg_temp.try(format('SELECT void_change_order(%L, %L)', pg_temp.id('cor'), '  '));
  IF v NOT LIKE 'P0001%' THEN RAISE EXCEPTION 'FAIL: void without a reason gave "%"', v; END IF;
  v := pg_temp.try(format('SELECT void_change_order(%L, %L)', pg_temp.id('cor'), 'Scope cancelled by owner'));
  IF v <> '' THEN RAISE EXCEPTION 'FAIL: void refused: %', v; END IF;
  v := pg_temp.try(format('SELECT void_change_order(%L, %L)', pg_temp.id('cor'), 'again'));
  IF v NOT LIKE 'P0001%' THEN RAISE EXCEPTION 'FAIL: voiding twice gave "%"', v; END IF;
  RESET ROLE;
  IF (SELECT status FROM change_orders WHERE id = pg_temp.id('cor')) <> 'closed'
     OR (SELECT void_reason FROM change_orders WHERE id = pg_temp.id('cor')) <> 'Scope cancelled by owner'
     OR EXISTS (SELECT 1 FROM signature_requests WHERE document_id = pg_temp.id('cor') AND status IN ('pending', 'partially_signed')) THEN
    RAISE EXCEPTION 'FAIL: void did not close the COR and revoke its links';
  END IF;
  PERFORM pg_temp.pass('(4) void needs the permission and a reason, closes the COR and revokes its signing links');
END $$;

DO $$
BEGIN
  RAISE NOTICE 'COR TRACKING TESTS: all % checks passed (rolled back)', current_setting('cort.passes', true);
END $$;

ROLLBACK;
