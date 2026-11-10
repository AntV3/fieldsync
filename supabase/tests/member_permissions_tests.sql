-- ============================================================
-- MEMBER PERMISSIONS + APPROVAL GUARD TESTS
-- ============================================================
-- Exercises supabase/migrations/20261110_member_permissions_and_approval_guards.sql:
-- has_company_permission(), trg_guard_member_permissions,
-- trg_guard_tm_ticket_approval and trg_guard_cor_status, as the
-- Postgres anon role (field session header) and the authenticated
-- role (JWT claims).
--
-- HOW TO USE:
--   Paste the whole file into the Supabase SQL Editor (or run it
--   with psql -v ON_ERROR_STOP=1) AFTER the migration. Every check
--   is a DO block that RAISEs on failure and prints "PASS: ..." on
--   success. The whole script is ONE transaction that ends in
--   ROLLBACK, so it leaves no rows behind.
--
-- EXPECTED: "NOTICE: PASS: ..." lines and a final
--   "NOTICE: MEMBER PERMISSIONS TESTS: all N checks passed (rolled back)".
-- ============================================================

BEGIN;

SELECT set_config('perm.passes', '0', true);

CREATE TEMP TABLE perm_ids (k TEXT PRIMARY KEY, v UUID) ON COMMIT DROP;
GRANT SELECT ON perm_ids TO anon, authenticated;

-- ------------------------------------------------------------
-- FIXTURES (as the SQL-editor role)
-- ------------------------------------------------------------
DO $$
DECLARE
  v_company UUID := gen_random_uuid();
  v_project UUID := gen_random_uuid();
  v_admin   UUID := gen_random_uuid();
  v_member  UUID := gen_random_uuid();
  v_t_unsigned UUID := gen_random_uuid();
  v_t_signed   UUID := gen_random_uuid();
  v_t_approved UUID := gen_random_uuid();
  v_cor UUID := gen_random_uuid();
BEGIN
  DELETE FROM field_sessions WHERE session_token = 'fs_perm_test_0001';

  INSERT INTO companies (id, name, code, office_code)
  VALUES (v_company, 'Perm Test Co',
          'PRM' || upper(substr(md5(random()::text), 1, 8)),
          'OFF' || upper(substr(md5(random()::text), 1, 8)));
  INSERT INTO projects (id, company_id, name, job_number, status)
  VALUES (v_project, v_company, 'Perm Test Project', 'PRM-001', 'active');
  INSERT INTO field_sessions (project_id, company_id, session_token, device_id, expires_at)
  VALUES (v_project, v_company, 'fs_perm_test_0001', 'perm-test', NOW() + INTERVAL '1 hour');

  INSERT INTO auth.users (id, email) VALUES
    (v_admin,  'perm-admin@example.invalid'),
    (v_member, 'perm-member@example.invalid');
  INSERT INTO users (id, email, name, company_id, role)
  VALUES (v_admin,  'perm-admin@example.invalid',  'Perm Admin',  v_company, 'admin'),
         (v_member, 'perm-member@example.invalid', 'Perm Member', v_company, 'member')
  ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id;
  INSERT INTO user_companies (user_id, company_id, role, access_level, status)
  VALUES (v_admin,  v_company, 'admin',  'administrator', 'active'),
         (v_member, v_company, 'member', 'member',        'active')
  ON CONFLICT (user_id, company_id) DO UPDATE SET status = 'active';

  INSERT INTO t_and_m_tickets (id, project_id, work_date, notes, status, created_by_name)
  VALUES (v_t_unsigned, v_project, CURRENT_DATE, 'Unsigned', 'foreman_signed', 'Perm Foreman');
  INSERT INTO t_and_m_tickets (id, project_id, work_date, notes, status, created_by_name,
                               client_signature_data, client_signature_name, client_signature_date)
  VALUES (v_t_signed, v_project, CURRENT_DATE, 'Signed', 'client_signed', 'Perm Foreman',
          'data:image/png;base64,iVBORw0KGgo=', 'Client', NOW()),
         (v_t_approved, v_project, CURRENT_DATE, 'Approved', 'approved', 'Perm Foreman',
          'data:image/png;base64,iVBORw0KGgo=', 'Client', NOW());

  INSERT INTO change_orders (id, company_id, project_id, cor_number, title, scope_of_work, period_start, period_end, status)
  VALUES (v_cor, v_company, v_project, 'PERM-COR-1', 'Perm COR', 'Scope', CURRENT_DATE, CURRENT_DATE, 'draft');

  INSERT INTO perm_ids VALUES
    ('company', v_company), ('project', v_project), ('admin', v_admin), ('member', v_member),
    ('t_unsigned', v_t_unsigned), ('t_signed', v_t_signed), ('t_approved', v_t_approved), ('cor', v_cor);
END $$;

CREATE FUNCTION pg_temp.id(p TEXT) RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT v FROM perm_ids WHERE k = p $$;
CREATE FUNCTION pg_temp.pass(p TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE 'PASS: %', p;
  PERFORM set_config('perm.passes', (current_setting('perm.passes', true)::int + 1)::text, true);
END $$;
-- Run a statement and return the SQLSTATE it raised ('' when it succeeded)
CREATE FUNCTION pg_temp.try(p_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN '';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END $$;
CREATE FUNCTION pg_temp.as_user(p TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.headers', '{}', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.id(p), 'role', 'authenticated')::text, true);
END $$;

-- ------------------------------------------------------------
-- (1) A member has no permissions by default; an admin has all
-- ------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('member');
DO $$
BEGIN
  IF has_company_permission(pg_temp.id('company'), 'approve_tickets')
     OR has_company_permission(pg_temp.id('company'), 'send_cors') THEN
    RAISE EXCEPTION 'FAIL: a member holds a permission by default';
  END IF;
  PERFORM pg_temp.as_user('admin');
  IF NOT (has_company_permission(pg_temp.id('company'), 'approve_tickets')
          AND has_company_permission(pg_temp.id('company'), 'send_cors')
          AND has_company_permission(pg_temp.id('company'), 'sign_for_foreman')
          AND has_company_permission(pg_temp.id('company'), 'manage_client_access')) THEN
    RAISE EXCEPTION 'FAIL: an administrator is missing a permission';
  END IF;
  PERFORM pg_temp.pass('(1) member has none by default, administrator has all four');
END $$;

-- ------------------------------------------------------------
-- (2) A member cannot grant themselves a permission; an admin can
-- ------------------------------------------------------------
SELECT pg_temp.as_user('member');
DO $$
DECLARE v TEXT;
BEGIN
  v := pg_temp.try(format('UPDATE user_companies SET can_approve_tickets = true WHERE user_id = %L AND company_id = %L',
                          pg_temp.id('member'), pg_temp.id('company')));
  RESET ROLE;
  IF (SELECT can_approve_tickets FROM user_companies
      WHERE user_id = pg_temp.id('member') AND company_id = pg_temp.id('company')) THEN
    RAISE EXCEPTION 'FAIL: a member granted themselves can_approve_tickets (sqlstate %)', v;
  END IF;
  PERFORM pg_temp.pass('(2a) member cannot grant themselves a permission');
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('admin');
DO $$
DECLARE v TEXT;
BEGIN
  v := pg_temp.try(format('UPDATE user_companies SET can_approve_tickets = true WHERE user_id = %L AND company_id = %L',
                          pg_temp.id('member'), pg_temp.id('company')));
  IF v <> '' THEN RAISE EXCEPTION 'FAIL: admin could not grant a permission (sqlstate %)', v; END IF;
  PERFORM pg_temp.as_user('member');
  IF NOT has_company_permission(pg_temp.id('company'), 'approve_tickets')
     OR has_company_permission(pg_temp.id('company'), 'send_cors') THEN
    RAISE EXCEPTION 'FAIL: grant did not take effect, or leaked to another permission';
  END IF;
  PERFORM pg_temp.pass('(2b) administrator grants one permission, and only that one');
END $$;

-- ------------------------------------------------------------
-- (3) Ticket approval: needs the permission AND a client signature
-- ------------------------------------------------------------
SELECT pg_temp.as_user('member');   -- now holds approve_tickets, not send_cors
DO $$
DECLARE v TEXT;
BEGIN
  v := pg_temp.try(format('UPDATE t_and_m_tickets SET status = ''approved'' WHERE id = %L', pg_temp.id('t_unsigned')));
  IF v <> 'P0001' THEN RAISE EXCEPTION 'FAIL: unsigned ticket approval gave sqlstate "%", expected P0001', v; END IF;
  v := pg_temp.try(format('UPDATE t_and_m_tickets SET status = ''approved'' WHERE id = %L', pg_temp.id('t_signed')));
  IF v <> '' THEN RAISE EXCEPTION 'FAIL: signed ticket approval refused (sqlstate %)', v; END IF;
  v := pg_temp.try(format('UPDATE t_and_m_tickets SET status = ''rejected'', rejection_reason = ''hours'' WHERE id = %L', pg_temp.id('t_unsigned')));
  IF v <> '' THEN RAISE EXCEPTION 'FAIL: rejection refused (sqlstate %)', v; END IF;
  PERFORM pg_temp.pass('(3a) with permission: unsigned ticket refused, signed ticket approved, rejection allowed');
END $$;

RESET ROLE;
UPDATE t_and_m_tickets SET status = 'client_signed' WHERE id = pg_temp.id('t_signed');
UPDATE t_and_m_tickets SET status = 'foreman_signed', rejection_reason = NULL WHERE id = pg_temp.id('t_unsigned');
UPDATE user_companies SET can_approve_tickets = false
 WHERE user_id = pg_temp.id('member') AND company_id = pg_temp.id('company');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('member');
DO $$
DECLARE v TEXT;
BEGIN
  v := pg_temp.try(format('UPDATE t_and_m_tickets SET status = ''approved'' WHERE id = %L', pg_temp.id('t_signed')));
  IF v <> '42501' THEN RAISE EXCEPTION 'FAIL: approval without permission gave "%", expected 42501', v; END IF;
  v := pg_temp.try(format('UPDATE t_and_m_tickets SET status = ''rejected'' WHERE id = %L', pg_temp.id('t_signed')));
  IF v <> '42501' THEN RAISE EXCEPTION 'FAIL: rejection without permission gave "%", expected 42501', v; END IF;
  v := pg_temp.try(format('UPDATE t_and_m_tickets SET notes = ''office note'' WHERE id = %L', pg_temp.id('t_signed')));
  IF v <> '' THEN RAISE EXCEPTION 'FAIL: an ordinary edit was refused (sqlstate %)', v; END IF;
  PERFORM pg_temp.pass('(3b) without permission: approve and reject refused, ordinary edit allowed');
END $$;

-- ------------------------------------------------------------
-- (4) Field session: cannot approve, cannot pull a ticket back
-- ------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.headers', '{"x-field-session":"fs_perm_test_0001"}', true);
DO $$
DECLARE v TEXT; s TEXT;
BEGIN
  v := pg_temp.try(format('UPDATE t_and_m_tickets SET status = ''approved'' WHERE id = %L', pg_temp.id('t_signed')));
  IF v <> '42501' THEN RAISE EXCEPTION 'FAIL: field approval gave "%", expected 42501', v; END IF;
  v := pg_temp.try(format('UPDATE t_and_m_tickets SET change_order_value = 999 WHERE id = %L', pg_temp.id('t_signed')));
  IF v <> '42501' THEN RAISE EXCEPTION 'FAIL: field value write gave "%", expected 42501', v; END IF;
  v := pg_temp.try(format('INSERT INTO t_and_m_tickets (project_id, work_date, notes, status, created_by_name) VALUES (%L, CURRENT_DATE, ''x'', ''approved'', ''F'')', pg_temp.id('project')));
  IF v <> '42501' THEN RAISE EXCEPTION 'FAIL: field insert of an approved ticket gave "%", expected 42501', v; END IF;
  v := pg_temp.try(format('INSERT INTO t_and_m_tickets (project_id, work_date, notes, status, created_by_name) VALUES (%L, CURRENT_DATE, ''ok'', ''pending'', ''F'')', pg_temp.id('project')));
  IF v <> '' THEN RAISE EXCEPTION 'FAIL: an ordinary field insert was refused (sqlstate %)', v; END IF;

  -- Foreman signs after the client: the write lands, the status stays
  v := pg_temp.try(format('UPDATE t_and_m_tickets SET status = ''foreman_signed'', foreman_signature_name = ''Late'' WHERE id = %L', pg_temp.id('t_signed')));
  IF v <> '' THEN RAISE EXCEPTION 'FAIL: late foreman signature refused (sqlstate %)', v; END IF;
  -- Offline replay onto an approved ticket
  v := pg_temp.try(format('UPDATE t_and_m_tickets SET status = ''foreman_signed'', foreman_signature_name = ''Late'' WHERE id = %L', pg_temp.id('t_approved')));
  IF v <> '' THEN RAISE EXCEPTION 'FAIL: late write onto an approved ticket refused (sqlstate %)', v; END IF;
  RESET ROLE;
  SELECT status INTO s FROM t_and_m_tickets WHERE id = pg_temp.id('t_signed');
  IF s <> 'client_signed' THEN RAISE EXCEPTION 'FAIL: client_signed ticket was pulled back to %', s; END IF;
  SELECT status INTO s FROM t_and_m_tickets WHERE id = pg_temp.id('t_approved');
  IF s <> 'approved' THEN RAISE EXCEPTION 'FAIL: approved ticket was pulled back to %', s; END IF;
  IF (SELECT foreman_signature_name FROM t_and_m_tickets WHERE id = pg_temp.id('t_approved')) <> 'Late' THEN
    RAISE EXCEPTION 'FAIL: the rest of the late field write was lost';
  END IF;
  PERFORM pg_temp.pass('(4) field session cannot approve / price / insert approved; late writes keep the status');
END $$;

-- ------------------------------------------------------------
-- (5) COR: approval needs the client signature; submit needs send_cors
-- ------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('member');
DO $$
DECLARE v TEXT;
BEGIN
  v := pg_temp.try(format('UPDATE change_orders SET status = ''pending_approval'' WHERE id = %L', pg_temp.id('cor')));
  IF v <> '42501' THEN RAISE EXCEPTION 'FAIL: submit without send_cors gave "%", expected 42501', v; END IF;
  PERFORM pg_temp.as_user('admin');
  v := pg_temp.try(format('UPDATE change_orders SET status = ''pending_approval'' WHERE id = %L', pg_temp.id('cor')));
  IF v <> '' THEN RAISE EXCEPTION 'FAIL: administrator could not submit a COR (sqlstate %)', v; END IF;
  v := pg_temp.try(format('UPDATE change_orders SET status = ''approved'' WHERE id = %L', pg_temp.id('cor')));
  IF v <> 'P0001' THEN RAISE EXCEPTION 'FAIL: approval without a client signature gave "%", expected P0001', v; END IF;
  v := pg_temp.try(format('UPDATE change_orders SET status = ''approved'', gc_signature_data = ''data:image/png;base64,iVBORw0KGgo='', gc_signature_name = ''GC'' WHERE id = %L', pg_temp.id('cor')));
  IF v <> '' THEN RAISE EXCEPTION 'FAIL: approval with the client signature refused (sqlstate %)', v; END IF;
  PERFORM pg_temp.pass('(5a) COR: submit needs send_cors; approved only together with the client signature');
END $$;

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.headers', '{"x-field-session":"fs_perm_test_0001"}', true);
DO $$
DECLARE v TEXT;
BEGIN
  v := pg_temp.try(format('UPDATE change_orders SET status = ''billed'' WHERE id = %L', pg_temp.id('cor')));
  IF v = '' THEN
    RESET ROLE;
    IF (SELECT status FROM change_orders WHERE id = pg_temp.id('cor')) = 'billed' THEN
      RAISE EXCEPTION 'FAIL: a field session changed a COR status';
    END IF;
  END IF;
  RESET ROLE;
  PERFORM pg_temp.pass('(5b) field session cannot change a COR status');
END $$;

DO $$
BEGIN
  RAISE NOTICE 'MEMBER PERMISSIONS TESTS: all % checks passed (rolled back)', current_setting('perm.passes', true);
END $$;

ROLLBACK;
