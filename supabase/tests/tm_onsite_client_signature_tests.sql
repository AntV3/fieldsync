-- ============================================================
-- ON-SITE CLIENT SIGNATURE TESTS
-- ============================================================
-- Exercises supabase/migrations/20261112_tm_onsite_client_signature.sql.
-- Paste into the Supabase SQL Editor (or psql -v ON_ERROR_STOP=1) AFTER
-- the migration. ONE transaction that ends in ROLLBACK.
--
-- EXPECTED: "NOTICE: PASS: ..." lines and a final
--   "NOTICE: ON-SITE SIGNATURE TESTS: all N checks passed (rolled back)".
-- ============================================================

BEGIN;

SELECT set_config('onsite.passes', '0', true);
CREATE TEMP TABLE onsite_ids (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
GRANT SELECT ON onsite_ids TO anon, authenticated;

DO $$
DECLARE
  v_company UUID := gen_random_uuid();
  v_project UUID := gen_random_uuid();
  v_other   UUID := gen_random_uuid();
  v_ticket  UUID := gen_random_uuid();
  v_foreign UUID := gen_random_uuid();
BEGIN
  DELETE FROM field_sessions WHERE session_token = 'fs_onsite_test_0001';
  INSERT INTO companies (id, name, code, office_code)
  VALUES (v_company, 'Onsite Test Co',
          'ONS' || upper(substr(md5(random()::text), 1, 8)),
          'OFF' || upper(substr(md5(random()::text), 1, 8)));
  INSERT INTO projects (id, company_id, name, job_number, status)
  VALUES (v_project, v_company, 'Onsite Project', 'ONS-001', 'active'),
         (v_other,   v_company, 'Onsite Other',   'ONS-002', 'active');
  INSERT INTO field_sessions (project_id, company_id, session_token, device_id, expires_at)
  VALUES (v_project, v_company, 'fs_onsite_test_0001', 'onsite-test', NOW() + INTERVAL '1 hour');
  INSERT INTO t_and_m_tickets (id, project_id, work_date, notes, status, created_by_name)
  VALUES (v_ticket,  v_project, CURRENT_DATE, 'Sign me',      'foreman_signed', 'Foreman'),
         (v_foreign, v_other,   CURRENT_DATE, 'Other project', 'foreman_signed', 'Foreman');
  INSERT INTO onsite_ids VALUES ('ticket', v_ticket), ('foreign', v_foreign), ('project', v_project);
END $$;

CREATE FUNCTION pg_temp.id(p TEXT) RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT v FROM onsite_ids WHERE k = p $$;
CREATE FUNCTION pg_temp.pass(p TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE 'PASS: %', p;
  PERFORM set_config('onsite.passes', (current_setting('onsite.passes', true)::int + 1)::text, true);
END $$;
CREATE FUNCTION pg_temp.try(p_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN '';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ' ' || SQLERRM;
END $$;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.headers', '{"x-field-session":"fs_onsite_test_0001"}', true);

DO $$
DECLARE
  v TEXT;
  c_sig CONSTANT TEXT := '{"signature":"data:image/png;base64,iVBORw0KGgo=","signerName":"Pat GC","signerTitle":"Super","signerCompany":"GC Inc"}';
BEGIN
  v := pg_temp.try(format('SELECT record_tm_client_signature(%L, %L::jsonb)', pg_temp.id('foreign'), c_sig));
  IF v NOT LIKE '42501%' THEN RAISE EXCEPTION 'FAIL: signed a ticket of another project: "%"', v; END IF;
  v := pg_temp.try(format('SELECT record_tm_client_signature(%L, %L::jsonb)', pg_temp.id('ticket'), '{"signature":"not-an-image","signerName":"Pat"}'));
  IF v NOT LIKE '22023%' THEN RAISE EXCEPTION 'FAIL: bad image gave "%"', v; END IF;
  v := pg_temp.try(format('SELECT record_tm_client_signature(%L, %L::jsonb)', pg_temp.id('ticket'), '{"signature":"data:image/png;base64,iVBORw0KGgo="}'));
  IF v NOT LIKE '22023%' THEN RAISE EXCEPTION 'FAIL: missing name gave "%"', v; END IF;
  PERFORM pg_temp.pass('(1) refuses another project''s ticket, a bad image and a missing name');

  v := pg_temp.try(format('SELECT record_tm_client_signature(%L, %L::jsonb)', pg_temp.id('ticket'), c_sig));
  IF v <> '' THEN RAISE EXCEPTION 'FAIL: on-site signature refused: %', v; END IF;
  v := pg_temp.try(format('SELECT record_tm_client_signature(%L, %L::jsonb)', pg_temp.id('ticket'), c_sig));
  IF v NOT LIKE 'P0001%' THEN RAISE EXCEPTION 'FAIL: signing twice gave "%"', v; END IF;
  RESET ROLE;

  IF (SELECT status FROM t_and_m_tickets WHERE id = pg_temp.id('ticket')) <> 'client_signed'
     OR (SELECT client_signature_name FROM t_and_m_tickets WHERE id = pg_temp.id('ticket')) <> 'Pat GC'
     OR (SELECT client_signature_date FROM t_and_m_tickets WHERE id = pg_temp.id('ticket')) IS NULL THEN
    RAISE EXCEPTION 'FAIL: the ticket was not signed and advanced';
  END IF;
  IF (SELECT count(*) FROM signature_requests sr JOIN signatures s ON s.signature_request_id = sr.id
      WHERE sr.document_type = 'tm_ticket' AND sr.document_id = pg_temp.id('ticket')
        AND sr.status = 'completed' AND s.signature_slot = 2 AND s.signer_name = 'Pat GC') <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected exactly one completed request with one client signature row';
  END IF;
  PERFORM pg_temp.pass('(2) signs once: ticket client_signed with server time, one completed request + signature row');
END $$;

DO $$
BEGIN
  RAISE NOTICE 'ON-SITE SIGNATURE TESTS: all % checks passed (rolled back)', current_setting('onsite.passes', true);
END $$;

ROLLBACK;
