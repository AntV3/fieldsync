-- ============================================================
-- JOIN REQUEST PROTECTION TESTS
-- ============================================================
-- Exercises supabase/migrations/20261118_join_request_protection.sql.
-- Paste into the Supabase SQL editor AFTER the migration and run it.
-- One transaction ending in ROLLBACK: it leaves nothing behind. A failing
-- check stops the run with an error starting "FAIL:"; a run that finishes
-- without an error passed.
-- ============================================================

BEGIN;

-- pgcrypto (crypt, gen_salt, gen_random_bytes) lives in the extensions schema
SET LOCAL search_path = public, extensions;

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
-- FIXTURES
-- ------------------------------------------------------------
DO $$
DECLARE
  k TEXT;
BEGIN
  FOREACH k IN ARRAY ARRAY['co_a','joiner','member_a'] LOOP
    PERFORM set_config('ti.' || k, gen_random_uuid()::text, true);
  END LOOP;
  INSERT INTO auth.users (id, email) VALUES
    (pg_temp.id('joiner'), 'jr-joiner@example.invalid'), (pg_temp.id('member_a'), 'jr-member@example.invalid');
  INSERT INTO users (id, email, name) VALUES
    (pg_temp.id('joiner'), 'jr-joiner@example.invalid', 'JR Joiner'), (pg_temp.id('member_a'), 'jr-member@example.invalid', 'JR Member')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO companies (id, name, code, office_code)
  VALUES (pg_temp.id('co_a'), 'JR Company', 'JRA' || upper(substr(md5(random()::text), 1, 8)), 'JROFFICE1');
  INSERT INTO user_companies (user_id, company_id, role, access_level, status)
  VALUES (pg_temp.id('member_a'), pg_temp.id('co_a'), 'member', 'member', 'active');
END $$;

-- ------------------------------------------------------------
-- 1. A join request can no longer skip the office code
-- ------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.as_user('joiner');
  BEGIN
    INSERT INTO user_companies (user_id, company_id, role, status)
    VALUES (pg_temp.id('joiner'), pg_temp.id('co_a'), 'member', 'pending');
    RAISE EXCEPTION 'FAIL: a join request was inserted directly, without the office code';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.as_owner();
  PERFORM pg_temp.pass('direct join requests are refused');
END $$;

-- ------------------------------------------------------------
-- 2. The right code creates one pending request; members are reported
-- ------------------------------------------------------------
DO $$
DECLARE
  v JSONB;
BEGIN
  PERFORM pg_temp.as_user('joiner');
  v := request_company_membership(pg_temp.id('co_a'), 'wrong-code');
  IF v->>'status' <> 'invalid_code' THEN RAISE EXCEPTION 'FAIL: wrong code answered %', v; END IF;
  v := request_company_membership(pg_temp.id('co_a'), ' jroffice1 ');
  IF v->>'status' <> 'requested' THEN RAISE EXCEPTION 'FAIL: right code answered %', v; END IF;
  v := request_company_membership(pg_temp.id('co_a'), 'JROFFICE1');
  IF v->>'status' <> 'pending' THEN RAISE EXCEPTION 'FAIL: a second request answered %', v; END IF;
  IF pg_temp.visible('SELECT 1 FROM projects WHERE company_id = pg_temp.id(''co_a'')') <> 0 THEN
    RAISE EXCEPTION 'FAIL: a pending request can read company data';
  END IF;

  PERFORM pg_temp.as_user('member_a');
  v := request_company_membership(pg_temp.id('co_a'), 'JROFFICE1');
  IF v->>'status' <> 'active' THEN RAISE EXCEPTION 'FAIL: an existing member answered %', v; END IF;
  PERFORM pg_temp.as_owner();

  IF (SELECT count(*) FROM user_companies WHERE user_id = pg_temp.id('joiner') AND company_id = pg_temp.id('co_a')
        AND status = 'pending' AND access_level = 'member') <> 1 THEN
    RAISE EXCEPTION 'FAIL: the request was not stored as one pending member request';
  END IF;
  PERFORM pg_temp.pass('the right office code creates one pending request for an administrator to approve');
END $$;

-- ------------------------------------------------------------
-- 3. Signed-out callers cannot request; wrong codes are capped
-- ------------------------------------------------------------
DO $$
DECLARE
  i INTEGER;
  v JSONB;
BEGIN
  PERFORM pg_temp.as_anon();
  BEGIN
    v := request_company_membership(pg_temp.id('co_a'), 'JROFFICE1');
    RAISE EXCEPTION 'FAIL: a visitor without an account sent a join request';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- 1 wrong code was used in check 2; 9 more reach the cap of 10
  FOR i IN 1..9 LOOP
    IF verify_office_code(pg_temp.id('co_a'), 'guess' || i) THEN
      RAISE EXCEPTION 'FAIL: a wrong code was accepted';
    END IF;
  END LOOP;
  IF verify_office_code(pg_temp.id('co_a'), 'JROFFICE1') THEN
    RAISE EXCEPTION 'FAIL: guessing was not capped (the right code still worked after 10 wrong ones)';
  END IF;
  PERFORM pg_temp.as_user('joiner');
  v := request_company_membership(pg_temp.id('co_a'), 'JROFFICE1');
  IF v->>'status' <> 'too_many_attempts' THEN RAISE EXCEPTION 'FAIL: locked company answered %', v; END IF;
  PERFORM pg_temp.as_owner();

  -- the lock lifts once the attempts are older than 15 minutes
  UPDATE auth_attempts SET created_at = now() - interval '16 minutes'
  WHERE attempt_type = 'office_code_invalid:' || pg_temp.id('co_a')::text;
  PERFORM pg_temp.as_anon();
  IF NOT verify_office_code(pg_temp.id('co_a'), 'JROFFICE1') THEN
    RAISE EXCEPTION 'FAIL: the right code was refused after the lock expired';
  END IF;
  PERFORM pg_temp.as_owner();
  PERFORM pg_temp.pass('signed-out callers cannot request; 10 wrong office codes lock the company for 15 minutes');
END $$;

DO $$
BEGIN
  RAISE NOTICE 'JOIN REQUEST TESTS: all % checks passed (rolled back)', current_setting('ti.passes');
END $$;

ROLLBACK;
