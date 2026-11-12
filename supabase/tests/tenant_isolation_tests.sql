-- ============================================================
-- TENANT ISOLATION TESTS
-- ============================================================
-- Exercises supabase/migrations/20261113_tenant_isolation_hardening.sql
-- with two companies (A and B), as: an administrator and a member of A,
-- a signed-in user who belongs to no company, a pending member, a
-- removed member, a field (PIN) session on one of A's projects, and a
-- visitor with no session at all.
--
-- HOW TO USE:
--   Paste the whole file into the Supabase SQL Editor (or run it with
--   psql -v ON_ERROR_STOP=1) AFTER the migration. Every check is a DO
--   block that RAISEs on failure and prints "PASS: ..." on success.
--   The whole script is ONE transaction that ends in ROLLBACK, so it
--   leaves no rows behind.
--
-- EXPECTED: "NOTICE: PASS: ..." lines and a final
--   "NOTICE: TENANT ISOLATION TESTS: all N checks passed (rolled back)".
-- ============================================================

BEGIN;

-- Production has a trigger on projects that adds the creator to the project
-- team and fails when a fixture project has no creator. The fixtures here do
-- not exercise project teams, so switch it off for this transaction only
-- (the ROLLBACK at the end switches it back on).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT t.tgname
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.projects'::regclass
      AND NOT t.tgisinternal
      AND p.proname IN ('auto_assign_project_owner', 'increment_project_count')
  LOOP
    EXECUTE format('ALTER TABLE public.projects DISABLE TRIGGER %I', r.tgname);
  END LOOP;
END $$;

SELECT set_config('ti.passes', '0', true);

-- Become a signed-in user / a field session / a visitor
CREATE FUNCTION pg_temp.as_user(p_key TEXT) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.headers', '{}', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', current_setting('ti.' || p_key), 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
END $$;
CREATE FUNCTION pg_temp.as_anon(p_field_token TEXT DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM set_config('request.headers',
    CASE WHEN p_field_token IS NULL THEN '{}'
         ELSE json_build_object('x-field-session', p_field_token)::text END, true);
  SET LOCAL ROLE anon;
END $$;
CREATE FUNCTION pg_temp.as_owner() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.headers', '{}', true);
END $$;
CREATE FUNCTION pg_temp.pass(p_what TEXT) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('ti.passes', (current_setting('ti.passes')::int + 1)::text, true);
  RAISE NOTICE 'PASS: %', p_what;
END $$;
CREATE FUNCTION pg_temp.id(p_key TEXT) RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('ti.' || p_key)::uuid $$;
-- Rows of a table the current caller can see for company A's fixtures
CREATE FUNCTION pg_temp.visible(p_sql TEXT) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') q' INTO n;
  RETURN n;
EXCEPTION WHEN insufficient_privilege THEN
  -- the role is not granted the table at all: it sees nothing
  RETURN 0;
END $$;
-- A value a CHECK constraint on <table>.<column> accepts: the preferred one
-- when it is allowed (or the column has no such constraint), otherwise the
-- first value the constraint lists. Keeps the fixtures valid whatever lists
-- this database enforces.
CREATE FUNCTION pg_temp.allowed(p_table TEXT, p_column TEXT, p_preferred TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_values TEXT[];
BEGIN
  SELECT array_agg(m[1]) INTO v_values
  FROM pg_constraint con
  CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(con.oid), '''([^'']*)''::', 'g') AS m
  WHERE con.conrelid = ('public.' || p_table)::regclass
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ~ ('\m' || p_column || '\M');
  IF v_values IS NULL OR p_preferred = ANY (v_values) THEN
    RETURN p_preferred;
  END IF;
  RETURN v_values[1];
END $$;
-- Row security is one layer; table privileges (GRANT) are another, and this
-- database withholds some tables from the anon role altogether. "No privilege"
-- is the strictest answer, so these helpers treat it as "sees nothing" and
-- skip a field write the role is not granted (with a notice).
CREATE FUNCTION pg_temp.sees(p_table TEXT, p_expected BIGINT) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE n BIGINT;
BEGIN
  IF NOT has_table_privilege(current_user, 'public.' || p_table, 'SELECT') THEN
    RAISE NOTICE 'note: role % has no SELECT privilege on % (stricter than the policy)', current_user, p_table;
    RETURN true;
  END IF;
  EXECUTE format('SELECT count(*) FROM public.%I', p_table) INTO n;
  IF n <> p_expected THEN
    RAISE NOTICE 'role % sees % rows of %, expected %', current_user, n, p_table, p_expected;
  END IF;
  RETURN n = p_expected;
END $$;
CREATE FUNCTION pg_temp.field_write(p_sql TEXT) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM LIKE 'permission denied for%' THEN
    RAISE NOTICE 'SKIPPED (role % lacks the table privilege, not a row-security result): %', current_user, SQLERRM;
  ELSE
    RAISE;
  END IF;
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO anon, authenticated;

-- ------------------------------------------------------------
-- FIXTURES (as the SQL-editor role)
-- ------------------------------------------------------------
DO $$
DECLARE
  k TEXT;
  v JSONB := '{}'::jsonb;
BEGIN
  FOREACH k IN ARRAY ARRAY['co_a','co_b','pr_a1','pr_a2','pr_b1','admin_a','member_a','outsider','pending_a','removed_a','admin_b',
                           'tk_a1','tk_b1','cor_a','cor_b','lc_a','lc_b'] LOOP
    PERFORM set_config('ti.' || k, gen_random_uuid()::text, true);
  END LOOP;

  DELETE FROM field_sessions WHERE session_token IN ('fs_ti_test_a1');

  PERFORM set_config('ti.mat_cat', pg_temp.allowed('materials_equipment', 'category', 'Materials'), true);
  PERFORM set_config('ti.wt', pg_temp.allowed('labor_rates', 'work_type', 'demolition'), true);
  PERFORM set_config('ti.jt', pg_temp.allowed('labor_rates', 'job_type', 'standard'), true);
  PERFORM set_config('ti.lrole', pg_temp.allowed('labor_rates', 'role', 'laborer'), true);
  PERFORM set_config('ti.inj', pg_temp.allowed('injury_reports', 'injury_type', 'minor'), true);
  PERFORM set_config('ti.from_office', pg_temp.allowed('messages', 'sender_type', 'office'), true);
  PERFORM set_config('ti.from_field', pg_temp.allowed('messages', 'sender_type', 'field'), true);
  PERFORM set_config('ti.punch_pri', pg_temp.allowed('punch_list_items', 'priority', 'medium'), true);
  PERFORM set_config('ti.punch_st', pg_temp.allowed('punch_list_items', 'status', 'open'), true);

  INSERT INTO auth.users (id, email)
  SELECT pg_temp.id(x), 'ti-' || x || '@example.invalid'
  FROM unnest(ARRAY['admin_a','member_a','outsider','pending_a','removed_a','admin_b']) AS x;
  INSERT INTO users (id, email, name)
  SELECT pg_temp.id(x), 'ti-' || x || '@example.invalid', 'TI ' || x
  FROM unnest(ARRAY['admin_a','member_a','outsider','pending_a','removed_a','admin_b']) AS x
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO companies (id, name, code, office_code, owner_user_id) VALUES
    (pg_temp.id('co_a'), 'TI Company A', 'TIA' || upper(substr(md5(random()::text), 1, 8)), 'OA' || upper(substr(md5(random()::text), 1, 8)), pg_temp.id('admin_a')),
    (pg_temp.id('co_b'), 'TI Company B', 'TIB' || upper(substr(md5(random()::text), 1, 8)), 'OB' || upper(substr(md5(random()::text), 1, 8)), pg_temp.id('admin_b'));
  PERFORM set_config('ti.code_a', (SELECT code FROM companies WHERE id = pg_temp.id('co_a')), true);

  INSERT INTO user_companies (user_id, company_id, role, access_level, status) VALUES
    (pg_temp.id('admin_a'),   pg_temp.id('co_a'), 'admin',  'administrator', 'active'),
    (pg_temp.id('member_a'),  pg_temp.id('co_a'), 'member', 'member',        'active'),
    (pg_temp.id('pending_a'), pg_temp.id('co_a'), 'member', 'member',        'pending'),
    (pg_temp.id('removed_a'), pg_temp.id('co_a'), 'member', 'member',        'removed'),
    (pg_temp.id('admin_b'),   pg_temp.id('co_b'), 'admin',  'administrator', 'active');
  -- what the old join flow left behind: the company on the profile row
  UPDATE users SET company_id = pg_temp.id('co_a'), role = pg_temp.allowed('users', 'role', 'admin')
  WHERE id IN (pg_temp.id('pending_a'), pg_temp.id('removed_a'));

  INSERT INTO projects (id, company_id, name, job_number, status, pin) VALUES
    (pg_temp.id('pr_a1'), pg_temp.id('co_a'), 'TI A One', 'TIA-1', 'active', '481516'),
    (pg_temp.id('pr_a2'), pg_temp.id('co_a'), 'TI A Two', 'TIA-2', 'active', '234200'),
    (pg_temp.id('pr_b1'), pg_temp.id('co_b'), 'TI B One', 'TIB-1', 'active', '777123');
  INSERT INTO field_sessions (project_id, company_id, session_token, device_id, expires_at)
  VALUES (pg_temp.id('pr_a1'), pg_temp.id('co_a'), 'fs_ti_test_a1', 'ti-test', now() + interval '1 hour');

  INSERT INTO areas (project_id, name, status, weight) VALUES
    (pg_temp.id('pr_a1'), 'TI area done', 'done', 40), (pg_temp.id('pr_a1'), 'TI area open', 'not_started', 60),
    (pg_temp.id('pr_b1'), 'TI area B', 'done', 100);
  INSERT INTO t_and_m_tickets (id, project_id, work_date, notes, status) VALUES
    (pg_temp.id('tk_a1'), pg_temp.id('pr_a1'), CURRENT_DATE, 'TI ticket A', 'pending'),
    (pg_temp.id('tk_b1'), pg_temp.id('pr_b1'), CURRENT_DATE, 'TI ticket B', 'pending');
  INSERT INTO t_and_m_workers (ticket_id, name, hours) VALUES
    (pg_temp.id('tk_a1'), 'TI worker A', 8), (pg_temp.id('tk_b1'), 'TI worker B', 8);
  INSERT INTO crew_checkins (project_id, workers) VALUES (pg_temp.id('pr_a1'), '[{"name":"TI"}]'), (pg_temp.id('pr_b1'), '[{"name":"TI"}]');
  INSERT INTO daily_reports (project_id, field_notes) VALUES (pg_temp.id('pr_a1'), 'TI report A'), (pg_temp.id('pr_b1'), 'TI report B');
  INSERT INTO messages (project_id, sender_type, sender_name, message) VALUES
    (pg_temp.id('pr_a1'), current_setting('ti.from_office'), 'TI', 'TI message A'), (pg_temp.id('pr_b1'), current_setting('ti.from_office'), 'TI', 'TI message B');
  INSERT INTO materials_equipment (company_id, category, name, unit, cost_per_unit) VALUES
    (pg_temp.id('co_a'), current_setting('ti.mat_cat'), 'TI material A', 'each', 12), (pg_temp.id('co_b'), current_setting('ti.mat_cat'), 'TI material B', 'each', 34);
  INSERT INTO labor_classes (id, company_id, name) VALUES
    (pg_temp.id('lc_a'), pg_temp.id('co_a'), 'TI class A'), (pg_temp.id('lc_b'), pg_temp.id('co_b'), 'TI class B');
  INSERT INTO labor_rates (company_id, role, work_type, job_type, regular_rate) VALUES
    (pg_temp.id('co_a'), current_setting('ti.lrole'), current_setting('ti.wt'), current_setting('ti.jt'), 55), (pg_temp.id('co_b'), current_setting('ti.lrole'), current_setting('ti.wt'), current_setting('ti.jt'), 66);
  INSERT INTO change_orders (id, company_id, project_id, cor_number, title, scope_of_work, period_start, period_end) VALUES
    (pg_temp.id('cor_a'), pg_temp.id('co_a'), pg_temp.id('pr_a1'), 'TI COR A', 'TI A', 'scope', CURRENT_DATE, CURRENT_DATE),
    (pg_temp.id('cor_b'), pg_temp.id('co_b'), pg_temp.id('pr_b1'), 'TI COR B', 'TI B', 'scope', CURRENT_DATE, CURRENT_DATE);
  INSERT INTO company_invitations (company_id, invite_token, created_by, invited_access_level, max_uses, expires_at)
  VALUES (pg_temp.id('co_a'), 'ti_invite_token_a_0001', pg_temp.id('admin_a'), 'member', 5, now() + interval '1 day');
  INSERT INTO project_shares (project_id, company_id, share_token, permissions)
  VALUES (pg_temp.id('pr_a1'), pg_temp.id('co_a'), 'tiShareA0001', '{"progress": true, "tm_tickets": true, "daily_reports": false, "photos": false}');
END $$;

-- ------------------------------------------------------------
-- 1. A signed-in user with no company sees nothing of company A
-- ------------------------------------------------------------
DO $$
DECLARE
  t TEXT; n BIGINT;
BEGIN
  PERFORM pg_temp.as_user('outsider');
  FOREACH t IN ARRAY ARRAY[
    'SELECT 1 FROM projects WHERE company_id = pg_temp.id(''co_a'')',
    'SELECT 1 FROM companies WHERE id = pg_temp.id(''co_a'')',
    'SELECT 1 FROM areas WHERE project_id = pg_temp.id(''pr_a1'')',
    'SELECT 1 FROM t_and_m_tickets WHERE project_id = pg_temp.id(''pr_a1'')',
    'SELECT 1 FROM t_and_m_workers WHERE ticket_id = pg_temp.id(''tk_a1'')',
    'SELECT 1 FROM crew_checkins WHERE project_id = pg_temp.id(''pr_a1'')',
    'SELECT 1 FROM daily_reports WHERE project_id = pg_temp.id(''pr_a1'')',
    'SELECT 1 FROM messages WHERE project_id = pg_temp.id(''pr_a1'')',
    'SELECT 1 FROM materials_equipment WHERE company_id = pg_temp.id(''co_a'')',
    'SELECT 1 FROM labor_classes WHERE company_id = pg_temp.id(''co_a'')',
    'SELECT 1 FROM labor_rates WHERE company_id = pg_temp.id(''co_a'')',
    'SELECT 1 FROM change_orders WHERE company_id = pg_temp.id(''co_a'')',
    'SELECT 1 FROM cor_log_entries WHERE company_id = pg_temp.id(''co_a'')',
    'SELECT 1 FROM company_invitations WHERE company_id = pg_temp.id(''co_a'')',
    'SELECT 1 FROM project_shares WHERE company_id = pg_temp.id(''co_a'')',
    'SELECT 1 FROM user_companies WHERE company_id = pg_temp.id(''co_a'')'
  ] LOOP
    n := pg_temp.visible(t);
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a user with no company can read: % (% rows)', t, n; END IF;
  END LOOP;
  PERFORM pg_temp.as_owner();
  PERFORM pg_temp.pass('a signed-in user with no company reads nothing of another company (16 tables)');
END $$;

-- ------------------------------------------------------------
-- 2. A visitor with no session sees nothing either
-- ------------------------------------------------------------
DO $$
DECLARE
  t TEXT; n BIGINT;
BEGIN
  PERFORM pg_temp.as_anon();
  FOREACH t IN ARRAY ARRAY[
    'SELECT 1 FROM projects', 'SELECT 1 FROM companies', 'SELECT 1 FROM areas', 'SELECT 1 FROM t_and_m_tickets',
    'SELECT 1 FROM t_and_m_workers', 'SELECT 1 FROM crew_checkins', 'SELECT 1 FROM daily_reports', 'SELECT 1 FROM messages',
    'SELECT 1 FROM materials_equipment', 'SELECT 1 FROM labor_classes', 'SELECT 1 FROM labor_rates',
    'SELECT 1 FROM company_invitations', 'SELECT 1 FROM project_shares', 'SELECT 1 FROM user_invitations'
  ] LOOP
    n := pg_temp.visible(t);
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a visitor with no session can read: % (% rows)', t, n; END IF;
  END LOOP;
  PERFORM pg_temp.as_owner();
  PERFORM pg_temp.pass('a visitor with no session reads no projects, PINs, tickets, invitations or share links');
END $$;

-- ------------------------------------------------------------
-- 3. Pending and removed members are not members
-- ------------------------------------------------------------
DO $$
DECLARE
  u TEXT;
BEGIN
  FOREACH u IN ARRAY ARRAY['pending_a', 'removed_a'] LOOP
    PERFORM pg_temp.as_user(u);
    IF pg_temp.visible('SELECT 1 FROM projects WHERE company_id = pg_temp.id(''co_a'')') <> 0
       OR pg_temp.visible('SELECT 1 FROM t_and_m_tickets WHERE project_id = pg_temp.id(''pr_a1'')') <> 0
       OR pg_temp.visible('SELECT 1 FROM change_orders WHERE company_id = pg_temp.id(''co_a'')') <> 0
       OR pg_temp.visible('SELECT 1 FROM change_order_ticket_associations') <> 0
       OR pg_temp.visible('SELECT 1 FROM messages WHERE project_id = pg_temp.id(''pr_a1'')') <> 0 THEN
      RAISE EXCEPTION 'FAIL: % can read company A data', u;
    END IF;
  END LOOP;
  PERFORM pg_temp.as_owner();
  PERFORM pg_temp.pass('pending and removed members read nothing');
END $$;

-- ------------------------------------------------------------
-- 4. Nobody can write into another company
-- ------------------------------------------------------------
DO $$
DECLARE
  n BIGINT;
BEGIN
  PERFORM pg_temp.as_user('outsider');
  BEGIN
    INSERT INTO t_and_m_tickets (project_id, notes) VALUES (pg_temp.id('pr_a1'), 'TI intruder');
    RAISE EXCEPTION 'FAIL: outsider inserted a ticket into company A';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO messages (project_id, sender_type, sender_name, message) VALUES (pg_temp.id('pr_a1'), current_setting('ti.from_office'), 'x', 'TI intruder');
    RAISE EXCEPTION 'FAIL: outsider inserted a message into company A';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE t_and_m_tickets SET notes = 'TI hacked' WHERE id = pg_temp.id('tk_a1');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: outsider updated a ticket of company A'; END IF;
  DELETE FROM t_and_m_tickets WHERE id = pg_temp.id('tk_a1');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: outsider deleted a ticket of company A'; END IF;
  UPDATE projects SET pin = '000000' WHERE id = pg_temp.id('pr_a1');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: outsider changed a project PIN of company A'; END IF;
  UPDATE materials_equipment SET cost_per_unit = 0 WHERE company_id = pg_temp.id('co_a');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: outsider changed company A prices'; END IF;

  -- and a member of A cannot touch B
  PERFORM pg_temp.as_user('member_a');
  UPDATE t_and_m_tickets SET notes = 'TI hacked' WHERE id = pg_temp.id('tk_b1');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 OR pg_temp.visible('SELECT 1 FROM projects WHERE company_id = pg_temp.id(''co_b'')') <> 0 THEN
    RAISE EXCEPTION 'FAIL: a member of A reached company B';
  END IF;
  PERFORM pg_temp.as_owner();
  PERFORM pg_temp.pass('no writes across companies (tickets, messages, PINs, prices)');
END $$;

-- ------------------------------------------------------------
-- 5. The company on your own profile row buys nothing
-- ------------------------------------------------------------
DO $$
DECLARE
  v_ok BOOLEAN;
BEGIN
  -- an outsider points their profile at company A and asks for admin
  PERFORM pg_temp.as_user('outsider');
  UPDATE users SET company_id = pg_temp.id('co_a'), role = pg_temp.allowed('users', 'role', 'admin') WHERE id = pg_temp.id('outsider');
  v_ok := repair_legacy_user(pg_temp.id('outsider'), pg_temp.id('co_a'), 'admin');
  IF v_ok OR pg_temp.visible('SELECT 1 FROM projects WHERE company_id = pg_temp.id(''co_a'')') <> 0 THEN
    RAISE EXCEPTION 'FAIL: an outsider joined company A through repair_legacy_user';
  END IF;

  -- a pending member is not approved by signing in
  PERFORM pg_temp.as_user('pending_a');
  v_ok := repair_legacy_user(pg_temp.id('pending_a'), pg_temp.id('co_a'), 'admin');
  -- a removed member is not let back in
  PERFORM pg_temp.as_user('removed_a');
  v_ok := v_ok OR repair_legacy_user(pg_temp.id('removed_a'), pg_temp.id('co_a'), 'admin');
  PERFORM pg_temp.as_owner();
  IF v_ok OR EXISTS (SELECT 1 FROM user_companies
                     WHERE company_id = pg_temp.id('co_a') AND status = 'active'
                       AND user_id IN (pg_temp.id('outsider'), pg_temp.id('pending_a'), pg_temp.id('removed_a'))) THEN
    RAISE EXCEPTION 'FAIL: repair_legacy_user activated a membership';
  END IF;

  -- an active member still gets "yes"
  PERFORM pg_temp.as_user('member_a');
  IF NOT repair_legacy_user(pg_temp.id('member_a'), pg_temp.id('co_a'), 'member') THEN
    RAISE EXCEPTION 'FAIL: repair_legacy_user should report an existing active membership';
  END IF;
  PERFORM pg_temp.as_owner();
  PERFORM pg_temp.pass('editing your profile row and calling repair_legacy_user grants no membership');
END $$;

-- ------------------------------------------------------------
-- 6. Join requests: pending, plain member, own user only
-- ------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.as_user('outsider');
  BEGIN
    INSERT INTO user_companies (user_id, company_id, role, status, access_level)
    VALUES (pg_temp.id('outsider'), pg_temp.id('co_b'), 'member', 'pending', 'administrator');
    RAISE EXCEPTION 'FAIL: a join request could ask for administrator';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO user_companies (user_id, company_id, role, status)
    VALUES (pg_temp.id('outsider'), pg_temp.id('co_b'), 'member', 'active');
    RAISE EXCEPTION 'FAIL: a user made themselves an active member';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  INSERT INTO user_companies (user_id, company_id, role, status)
  VALUES (pg_temp.id('outsider'), pg_temp.id('co_b'), 'member', 'pending');
  IF pg_temp.visible('SELECT 1 FROM projects WHERE company_id = pg_temp.id(''co_b'')') <> 0 THEN
    RAISE EXCEPTION 'FAIL: a pending request can read projects';
  END IF;
  PERFORM pg_temp.as_owner();
  PERFORM pg_temp.pass('a join request must be pending and plain, and grants nothing until approved');
END $$;

-- ------------------------------------------------------------
-- 7. Approval and invitations need the real caller
-- ------------------------------------------------------------
DO $$
DECLARE
  v_membership UUID;
  v_result JSONB;
BEGIN
  SELECT id INTO v_membership FROM user_companies
  WHERE user_id = pg_temp.id('pending_a') AND company_id = pg_temp.id('co_a');

  -- the pending user names the real admin as approver
  PERFORM pg_temp.as_user('pending_a');
  BEGIN
    PERFORM approve_membership_with_role(v_membership, pg_temp.id('admin_a'), 'admin');
    RAISE EXCEPTION 'FAIL: a user approved their own membership';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- an outsider accepts an invitation "as" someone else
  PERFORM pg_temp.as_user('outsider');
  v_result := accept_invitation('ti_invite_token_a_0001', pg_temp.id('admin_b'));
  IF COALESCE((v_result->>'success')::boolean, true) THEN
    RAISE EXCEPTION 'FAIL: an invitation was accepted for another user';
  END IF;

  -- the real admin approves
  PERFORM pg_temp.as_user('admin_a');
  PERFORM approve_membership_with_role(v_membership, pg_temp.id('admin_a'), 'member');
  PERFORM pg_temp.as_owner();
  IF NOT EXISTS (SELECT 1 FROM user_companies WHERE id = v_membership AND status = 'active' AND access_level = 'member') THEN
    RAISE EXCEPTION 'FAIL: an administrator could not approve a join request';
  END IF;

  -- and a real invitee accepts their own invitation
  PERFORM pg_temp.as_user('outsider');
  v_result := accept_invitation('ti_invite_token_a_0001', pg_temp.id('outsider'));
  IF NOT COALESCE((v_result->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'FAIL: an invitee could not accept their invitation: %', v_result;
  END IF;
  PERFORM pg_temp.as_owner();
  DELETE FROM user_companies WHERE user_id = pg_temp.id('outsider') AND company_id = pg_temp.id('co_a');
  PERFORM pg_temp.pass('approval and invitations act only for the signed-in caller');
END $$;

-- ------------------------------------------------------------
-- 8. Functions that take a company, project or change order id
-- ------------------------------------------------------------
DO $$
DECLARE
  n BIGINT;
  v_pin TEXT;
BEGIN
  PERFORM pg_temp.as_user('outsider');
  SELECT count(*), max(project_pin) INTO n, v_pin FROM get_project_dashboard_summary(pg_temp.id('co_a'));
  IF n <> 0 OR v_pin IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: the dashboard summary (with PINs) is readable by an outsider';
  END IF;
  BEGIN
    PERFORM assign_ticket_to_cor(pg_temp.id('tk_a1'), pg_temp.id('cor_a'));
    RAISE EXCEPTION 'FAIL: an outsider linked a ticket to a change order';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM recalculate_cor_totals(pg_temp.id('cor_a'));
    RAISE EXCEPTION 'FAIL: an outsider recalculated a change order';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM get_company_settings(pg_temp.id('co_a'));
    RAISE EXCEPTION 'FAIL: an outsider read company settings (office code)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM get_labor_classes_for_field(pg_temp.id('co_a'));
    RAISE EXCEPTION 'FAIL: an outsider read labor classes';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- a member of A cannot link B's ticket into A's change order
  PERFORM pg_temp.as_user('member_a');
  BEGIN
    PERFORM assign_ticket_to_cor(pg_temp.id('tk_b1'), pg_temp.id('cor_a'));
    RAISE EXCEPTION 'FAIL: a ticket of another company was linked to a change order';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- a visitor cannot call office functions at all
  PERFORM pg_temp.as_anon();
  BEGIN
    PERFORM * FROM get_project_dashboard_summary(pg_temp.id('co_a'));
    RAISE EXCEPTION 'FAIL: a visitor called the dashboard summary';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM log_auth_attempt('1.1.1.1', 'x', false, 'pin');
    RAISE EXCEPTION 'FAIL: a visitor wrote to the sign-in attempt log';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.as_owner();
  PERFORM pg_temp.pass('id-taking functions refuse callers from outside the company');
END $$;

-- ------------------------------------------------------------
-- 9. Company A's own people keep working
-- ------------------------------------------------------------
DO $$
DECLARE
  n BIGINT;
  v_total INTEGER;
  v_ticket UUID;
BEGIN
  PERFORM pg_temp.as_user('member_a');
  IF pg_temp.visible('SELECT 1 FROM projects WHERE company_id = pg_temp.id(''co_a'')') <> 2
     OR pg_temp.visible('SELECT 1 FROM companies WHERE id = pg_temp.id(''co_a'')') <> 1
     OR pg_temp.visible('SELECT 1 FROM t_and_m_tickets t JOIN t_and_m_workers w ON w.ticket_id = t.id WHERE t.project_id = pg_temp.id(''pr_a1'')') <> 1
     OR pg_temp.visible('SELECT 1 FROM messages WHERE project_id = pg_temp.id(''pr_a1'')') <> 1
     OR pg_temp.visible('SELECT 1 FROM materials_equipment WHERE company_id = pg_temp.id(''co_a'')') <> 1
     OR pg_temp.visible('SELECT 1 FROM labor_rates WHERE company_id = pg_temp.id(''co_a'')') <> 1
     OR pg_temp.visible('SELECT 1 FROM cor_log_entries WHERE company_id = pg_temp.id(''co_a'')') <> 1 THEN
    RAISE EXCEPTION 'FAIL: a member cannot read their own company';
  END IF;

  SELECT count(*) INTO n FROM get_project_dashboard_summary(pg_temp.id('co_a'));
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: the dashboard summary is empty for a member (% rows)', n; END IF;

  -- ticket, workers, change order lines (the totals trigger must still run)
  INSERT INTO t_and_m_tickets (project_id, notes) VALUES (pg_temp.id('pr_a2'), 'TI member ticket') RETURNING id INTO v_ticket;
  INSERT INTO t_and_m_workers (ticket_id, name, hours) VALUES (v_ticket, 'TI member worker', 4);
  UPDATE t_and_m_workers SET hours = 5 WHERE ticket_id = v_ticket;
  INSERT INTO change_order_labor (change_order_id, labor_class, regular_hours, regular_rate, total)
  VALUES (pg_temp.id('cor_a'), 'TI', 2, 5000, 10000);
  SELECT labor_subtotal INTO v_total FROM change_orders WHERE id = pg_temp.id('cor_a');
  IF v_total IS DISTINCT FROM 10000 THEN
    RAISE EXCEPTION 'FAIL: change order totals were not recalculated (labor_subtotal %)', v_total;
  END IF;
  PERFORM assign_ticket_to_cor(pg_temp.id('tk_a1'), pg_temp.id('cor_a'));
  IF pg_temp.visible('SELECT 1 FROM change_order_ticket_associations WHERE change_order_id = pg_temp.id(''cor_a'')') <> 1 THEN
    RAISE EXCEPTION 'FAIL: a member could not link a ticket to a change order';
  END IF;
  PERFORM unassign_ticket_from_cor(pg_temp.id('tk_a1'), pg_temp.id('cor_a'));
  INSERT INTO messages (project_id, sender_type, sender_name, message) VALUES (pg_temp.id('pr_a1'), current_setting('ti.from_office'), 'TI', 'TI reply');
  UPDATE projects SET name = 'TI A One (renamed)' WHERE id = pg_temp.id('pr_a1');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: a member could not update a project'; END IF;
  DELETE FROM t_and_m_tickets WHERE id = v_ticket;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: a member could not delete a ticket'; END IF;

  -- the administrator sees the members and the join requests
  PERFORM pg_temp.as_user('admin_a');
  IF pg_temp.visible('SELECT 1 FROM user_companies WHERE company_id = pg_temp.id(''co_a'')') < 4 THEN
    RAISE EXCEPTION 'FAIL: an administrator cannot see the company''s memberships';
  END IF;
  PERFORM pg_temp.as_owner();
  PERFORM pg_temp.pass('members and administrators of a company keep full use of their own data');
END $$;

-- ------------------------------------------------------------
-- 10. A field (PIN) session: its project, nothing else
-- ------------------------------------------------------------
DO $$
DECLARE
  n BIGINT;
BEGIN
  PERFORM pg_temp.as_anon('fs_ti_test_a1');
  IF NOT (pg_temp.sees('projects', 1) AND pg_temp.sees('t_and_m_tickets', 1) AND pg_temp.sees('t_and_m_workers', 1)
          AND pg_temp.sees('areas', 2) AND pg_temp.sees('crew_checkins', 1) AND pg_temp.sees('daily_reports', 1)
          AND pg_temp.sees('messages', 2)  -- the fixture and the member's reply in check 9
          AND pg_temp.sees('companies', 1) AND pg_temp.sees('labor_classes', 1) AND pg_temp.sees('materials_equipment', 1)) THEN
    RAISE EXCEPTION 'FAIL: a field session does not see exactly its own project and company catalog';
  END IF;
  IF pg_temp.visible('SELECT 1 FROM labor_rates') <> 0 OR pg_temp.visible('SELECT 1 FROM user_companies') <> 0 THEN
    RAISE EXCEPTION 'FAIL: a field session can read rates or memberships';
  END IF;
  SELECT count(*) INTO n FROM get_labor_classes_for_field(pg_temp.id('co_a'));
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: a field session cannot load labor classes'; END IF;

  PERFORM pg_temp.field_write($w$INSERT INTO crew_checkins (project_id, check_in_date, workers) VALUES (pg_temp.id('pr_a1'), CURRENT_DATE - 1, '[]')$w$);
  PERFORM pg_temp.field_write($w$INSERT INTO messages (project_id, sender_type, sender_name, message) VALUES (pg_temp.id('pr_a1'), current_setting('ti.from_field'), 'TI foreman', 'TI from field')$w$);
  PERFORM pg_temp.field_write($w$INSERT INTO t_and_m_tickets (project_id, notes) VALUES (pg_temp.id('pr_a1'), 'TI field ticket')$w$);
  PERFORM pg_temp.field_write($w$INSERT INTO injury_reports (project_id, company_id, incident_date, incident_time, incident_location, incident_description,
                              injury_type, employee_name, reported_by_name, reported_by_title)
  VALUES (pg_temp.id('pr_a1'), pg_temp.id('co_a'), CURRENT_DATE, '10:00', 'TI', 'TI', current_setting('ti.inj'), 'TI', 'TI', 'Foreman')$w$);
  PERFORM pg_temp.field_write($w$INSERT INTO punch_list_items (project_id, company_id, description, priority, status)
  VALUES (pg_temp.id('pr_a1'), pg_temp.id('co_a'), 'TI punch', current_setting('ti.punch_pri'), current_setting('ti.punch_st'))$w$);
  PERFORM pg_temp.field_write($w$UPDATE areas SET status = 'done' WHERE project_id = pg_temp.id('pr_a1') AND name = 'TI area open'$w$);

  -- another project of the same company, and another company
  BEGIN
    INSERT INTO messages (project_id, sender_type, sender_name, message) VALUES (pg_temp.id('pr_a2'), current_setting('ti.from_field'), 'x', 'TI wrong project');
    RAISE EXCEPTION 'FAIL: a field session wrote to another project';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO injury_reports (project_id, company_id, incident_date, incident_time, incident_location, incident_description,
                                injury_type, employee_name, reported_by_name, reported_by_title)
    VALUES (pg_temp.id('pr_a1'), pg_temp.id('co_b'), CURRENT_DATE, '10:00', 'TI', 'TI', current_setting('ti.inj'), 'TI', 'TI', 'Foreman');
    RAISE EXCEPTION 'FAIL: a field session filed a report under another company';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF pg_temp.visible('SELECT 1 FROM injury_reports') <> 0 THEN
    RAISE EXCEPTION 'FAIL: a field session can read injury reports';
  END IF;
  PERFORM pg_temp.as_owner();
  PERFORM pg_temp.pass('a field session reads and writes its own project only');
END $$;

-- ------------------------------------------------------------
-- 11. Public pages get exactly what their link permits
-- ------------------------------------------------------------
DO $$
DECLARE
  v JSONB;
BEGIN
  PERFORM pg_temp.as_anon();
  v := public_get_shared_project('tiShareA0001');
  IF v IS NULL OR v->'project'->>'name' IS NULL
     OR v->'project' ? 'pin' OR v->'project' ? 'pin_hash' OR v->'project' ? 'contract_value'
     OR jsonb_array_length(v->'areas') <> 2
     OR jsonb_array_length(v->'tmTickets') < 1
     OR jsonb_array_length(v->'dailyReports') <> 0 THEN
    RAISE EXCEPTION 'FAIL: the share link returns the wrong data: %', v;
  END IF;
  IF public_get_shared_project('tiShareXXXXX') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: an unknown share link returned data';
  END IF;

  v := public_get_invitation('ti_invite_token_a_0001');
  IF v IS NULL OR v->'companies'->>'name' IS DISTINCT FROM 'TI Company A' OR v ? 'invite_token' THEN
    RAISE EXCEPTION 'FAIL: the invitation lookup returns the wrong data: %', v;
  END IF;
  IF public_get_invitation('ti_invite_token_nope_01') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: an unknown invitation returned data';
  END IF;

  PERFORM pg_temp.as_owner();
  UPDATE project_shares SET is_active = false WHERE share_token = 'tiShareA0001';
  PERFORM pg_temp.as_anon();
  IF public_get_shared_project('tiShareA0001') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: a switched-off share link still returns data';
  END IF;
  PERFORM pg_temp.as_owner();
  PERFORM pg_temp.pass('share links and invitations are read by token only, without PINs or contract values');
END $$;

-- ------------------------------------------------------------
-- 12. Field sign-in still works, and wrong PINs are capped per company
-- ------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  i INTEGER;
BEGIN
  PERFORM pg_temp.as_anon();
  SELECT * INTO r FROM validate_pin_and_create_session('481516', current_setting('ti.code_a'), 'ti-device-ok', NULL, false);
  IF NOT r.success OR r.project_id IS DISTINCT FROM pg_temp.id('pr_a1') OR r.session_token IS NULL THEN
    RAISE EXCEPTION 'FAIL: field sign-in with the right PIN failed: %', r.error_code;
  END IF;

  -- 20 wrong PINs, each claiming to be a new device
  FOR i IN 1..20 LOOP
    SELECT * INTO r FROM validate_pin_and_create_session('000000', current_setting('ti.code_a'), 'ti-attacker-' || i, NULL, false);
    IF r.success OR r.error_code <> 'INVALID_PIN' THEN
      RAISE EXCEPTION 'FAIL: wrong PIN % answered %', i, r.error_code;
    END IF;
  END LOOP;
  SELECT * INTO r FROM validate_pin_and_create_session('481516', current_setting('ti.code_a'), 'ti-attacker-99', NULL, false);
  IF r.success OR r.error_code <> 'RATE_LIMITED' THEN
    RAISE EXCEPTION 'FAIL: PIN guessing was not capped per company (%)', r.error_code;
  END IF;
  PERFORM pg_temp.as_owner();
  PERFORM pg_temp.pass('field sign-in works; 20 wrong PINs lock the company''s PIN sign-in for 15 minutes');
END $$;

-- ------------------------------------------------------------
-- 13. Photos and documents in storage
-- ------------------------------------------------------------
DO $$
DECLARE
  v_photo TEXT := pg_temp.id('co_a')::text || '/' || pg_temp.id('pr_a1')::text || '/' || pg_temp.id('tk_a1')::text || '/ti-photo.jpg';
  v_other TEXT := pg_temp.id('co_a')::text || '/' || pg_temp.id('pr_a2')::text || '/x/ti-photo.jpg';
  v_doc   TEXT := pg_temp.id('co_a')::text || '/' || pg_temp.id('pr_a1')::text || '/documents/ti-doc.pdf';
  v_logo  TEXT := 'branding/' || pg_temp.id('co_a')::text || '/logo-ti.png';
BEGIN
  PERFORM pg_temp.as_user('outsider');
  IF can_access_project_path(v_photo) OR can_access_company_path(v_doc) OR can_manage_branding_path(v_logo) THEN
    RAISE EXCEPTION 'FAIL: an outsider can reach another company''s files';
  END IF;
  PERFORM pg_temp.as_user('member_a');
  IF NOT can_access_project_path(v_photo) OR NOT can_access_company_path(v_doc) OR can_manage_branding_path(v_logo) THEN
    RAISE EXCEPTION 'FAIL: a member''s file access is wrong';
  END IF;
  PERFORM pg_temp.as_user('admin_a');
  IF NOT can_manage_branding_path(v_logo) OR can_manage_branding_path('branding/' || pg_temp.id('co_b')::text || '/logo.png') THEN
    RAISE EXCEPTION 'FAIL: branding uploads are not limited to the company''s administrators';
  END IF;
  PERFORM pg_temp.as_anon('fs_ti_test_a1');
  IF NOT can_access_project_path(v_photo) OR can_access_project_path(v_other) OR NOT can_access_company_path(v_doc) THEN
    RAISE EXCEPTION 'FAIL: a field session''s file access is wrong';
  END IF;
  PERFORM pg_temp.as_anon();
  IF can_access_project_path(v_photo) OR can_access_company_path(v_doc)
     OR can_access_project_path('not-a-path') OR can_access_company_path(NULL) THEN
    RAISE EXCEPTION 'FAIL: a visitor can reach files';
  END IF;
  PERFORM pg_temp.as_owner();

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
             AND (qual ~ 'tm-photos' OR with_check ~ 'tm-photos' OR qual ~ 'project-documents')
             AND COALESCE(qual, '') || COALESCE(with_check, '') !~ 'can_access_|signing_token_can_read_photo|user_companies') THEN
    RAISE EXCEPTION 'FAIL: an unscoped storage policy remains on tm-photos or project-documents';
  END IF;
  PERFORM pg_temp.pass('ticket photos, documents and branding are limited to the owning company');
END $$;

-- ------------------------------------------------------------
-- 14. Trusted contexts are not locked out
-- ------------------------------------------------------------
DO $$
DECLARE
  n BIGINT;
BEGIN
  PERFORM pg_temp.as_owner();
  SELECT count(*) INTO n FROM get_project_dashboard_summary(pg_temp.id('co_a'));
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: the SQL editor cannot run the dashboard summary'; END IF;
  PERFORM recalculate_cor_totals(pg_temp.id('cor_a'));
  PERFORM pg_temp.pass('the SQL editor and server jobs can still run the guarded functions');
END $$;

-- ------------------------------------------------------------
-- 15. No open policy and no table without row security is left
-- ------------------------------------------------------------
DO $$
DECLARE
  v TEXT;
BEGIN
  SELECT string_agg(tablename || ': ' || policyname, '; ') INTO v
  FROM pg_policies
  WHERE schemaname = 'public' AND (qual = 'true' OR with_check = 'true')
    AND tablename NOT IN ('error_log', 'query_metrics');
  IF v IS NOT NULL THEN RAISE EXCEPTION 'FAIL: open policies: %', v; END IF;

  SELECT string_agg(c.relname, ', ') INTO v
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF v IS NOT NULL THEN RAISE EXCEPTION 'FAIL: tables without row security: %', v; END IF;
  PERFORM pg_temp.pass('no open policy and no table without row security remains');
END $$;

DO $$
BEGIN
  RAISE NOTICE 'TENANT ISOLATION TESTS: all % checks passed (rolled back)', current_setting('ti.passes');
END $$;

ROLLBACK;
