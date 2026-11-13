-- ============================================================
-- DATA PROTECTION TESTS
-- ============================================================
-- Exercises supabase/migrations/20261114_data_protection_hardening.sql:
-- PIN columns hidden from field sessions, hash-only PIN sign-in,
-- archived projects refused, trusted devices not locked out, secure link
-- tokens, log cleanup.
--
-- HOW TO USE: paste the whole file into the Supabase SQL editor AFTER the
-- migration and run it. It is one transaction ending in ROLLBACK, so it
-- leaves nothing behind. A failing check stops the run with an error that
-- starts with "FAIL:"; a run that finishes without an error passed.
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
  FOREACH k IN ARRAY ARRAY['co_a','pr_live','pr_archived','member_a'] LOOP
    PERFORM set_config('ti.' || k, gen_random_uuid()::text, true);
  END LOOP;
  INSERT INTO auth.users (id, email) VALUES (pg_temp.id('member_a'), 'dp-member@example.invalid');
  INSERT INTO users (id, email, name) VALUES (pg_temp.id('member_a'), 'dp-member@example.invalid', 'DP Member')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO companies (id, name, code, office_code)
  VALUES (pg_temp.id('co_a'), 'DP Company', 'DPA' || upper(substr(md5(random()::text), 1, 8)),
          'DO' || upper(substr(md5(random()::text), 1, 8)));
  PERFORM set_config('ti.code_a', (SELECT code FROM companies WHERE id = pg_temp.id('co_a')), true);
  INSERT INTO user_companies (user_id, company_id, role, access_level, status)
  VALUES (pg_temp.id('member_a'), pg_temp.id('co_a'), 'member', 'member', 'active');
  INSERT INTO projects (id, company_id, name, job_number, status, pin) VALUES
    (pg_temp.id('pr_live'), pg_temp.id('co_a'), 'DP Live', 'DP-1', 'active', '5150'),
    (pg_temp.id('pr_archived'), pg_temp.id('co_a'), 'DP Archived', 'DP-2', 'archived', '7272');
  -- the trigger hashes new PINs; make sure both have a hash for the checks
  UPDATE projects SET pin_hash = crypt(TRIM(pin), gen_salt('bf', 4))
  WHERE id IN (pg_temp.id('pr_live'), pg_temp.id('pr_archived')) AND pin_hash IS NULL;
  INSERT INTO field_sessions (project_id, company_id, session_token, device_id, expires_at)
  VALUES (pg_temp.id('pr_live'), pg_temp.id('co_a'), 'fs_dp_test_live01', 'dp-test', now() + interval '1 hour');
END $$;

-- ------------------------------------------------------------
-- 1. A field session cannot read the PIN; the office can
-- ------------------------------------------------------------
DO $$
DECLARE
  v TEXT;
BEGIN
  PERFORM pg_temp.as_anon('fs_dp_test_live01');
  SELECT name INTO v FROM projects WHERE id = pg_temp.id('pr_live');
  IF v IS DISTINCT FROM 'DP Live' THEN RAISE EXCEPTION 'FAIL: a field session cannot read its project'; END IF;
  BEGIN
    SELECT pin INTO v FROM projects WHERE id = pg_temp.id('pr_live');
    RAISE EXCEPTION 'FAIL: a field session read the PIN';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    SELECT pin_hash INTO v FROM projects WHERE id = pg_temp.id('pr_live');
    RAISE EXCEPTION 'FAIL: a field session read the PIN hash';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE projects SET name = 'x' WHERE id = pg_temp.id('pr_live');
    RAISE EXCEPTION 'FAIL: a field session could write to projects';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM pg_temp.as_user('member_a');
  SELECT pin INTO v FROM projects WHERE id = pg_temp.id('pr_live');
  IF v IS DISTINCT FROM '5150' THEN RAISE EXCEPTION 'FAIL: an office member cannot see the PIN'; END IF;
  PERFORM pg_temp.as_owner();
  PERFORM pg_temp.pass('field sessions cannot read or change project PINs; office members still see them');
END $$;

-- ------------------------------------------------------------
-- 2. PIN sign-in: hash only, archived projects refused
-- ------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  PERFORM pg_temp.as_anon();
  SELECT * INTO r FROM validate_pin_and_create_session('5150', current_setting('ti.code_a'), 'dp-device-trusted-0001', NULL, false);
  IF NOT r.success OR r.project_id IS DISTINCT FROM pg_temp.id('pr_live') THEN
    RAISE EXCEPTION 'FAIL: right PIN refused (%)', r.error_code;
  END IF;
  SELECT * INTO r FROM validate_pin_and_create_session('7272', current_setting('ti.code_a'), 'dp-device-other-0001', NULL, false);
  IF r.success THEN RAISE EXCEPTION 'FAIL: an archived project accepted its PIN'; END IF;
  PERFORM pg_temp.as_owner();

  -- a PIN with no hash is no longer accepted in plain text
  UPDATE projects SET pin_hash = NULL WHERE id = pg_temp.id('pr_live');
  PERFORM pg_temp.as_anon();
  SELECT * INTO r FROM validate_pin_and_create_session('5150', current_setting('ti.code_a'), 'dp-device-other-0002', NULL, false);
  IF r.success THEN RAISE EXCEPTION 'FAIL: the plain-text PIN is still accepted'; END IF;
  PERFORM pg_temp.as_owner();
  UPDATE projects SET pin_hash = crypt('5150', gen_salt('bf', 4)) WHERE id = pg_temp.id('pr_live');
  PERFORM pg_temp.pass('PIN sign-in checks only the hash and refuses archived projects');
END $$;

-- ------------------------------------------------------------
-- 3. Guessing cannot lock out a device that signed in before
-- ------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  i INTEGER;
BEGIN
  PERFORM pg_temp.as_anon();
  FOR i IN 1..21 LOOP
    SELECT * INTO r FROM validate_pin_and_create_session('0000', current_setting('ti.code_a'), 'dp-attacker-' || lpad(i::text, 8, '0'), NULL, false);
  END LOOP;
  SELECT * INTO r FROM validate_pin_and_create_session('5150', current_setting('ti.code_a'), 'dp-new-device-00001', NULL, false);
  IF r.success OR r.error_code <> 'RATE_LIMITED' THEN
    RAISE EXCEPTION 'FAIL: a new device was not stopped after 20 wrong PINs (%)', r.error_code;
  END IF;
  SELECT * INTO r FROM validate_pin_and_create_session('5150', current_setting('ti.code_a'), 'dp-device-trusted-0001', NULL, false);
  IF NOT r.success THEN
    RAISE EXCEPTION 'FAIL: a device that signed in before was locked out (%)', r.error_code;
  END IF;
  PERFORM pg_temp.as_owner();
  PERFORM pg_temp.pass('wrong PINs block new devices but not the company''s own foremen');
END $$;

-- ------------------------------------------------------------
-- 4. Link tokens
-- ------------------------------------------------------------
DO $$
DECLARE
  v TEXT;
BEGIN
  v := generate_share_token();
  IF length(v) <> 24 OR v !~ '^[A-Za-z0-9]+$' THEN RAISE EXCEPTION 'FAIL: share token %', v; END IF;
  v := generate_signature_token();
  IF v !~ '^sig_[A-Za-z0-9]{24}$' THEN RAISE EXCEPTION 'FAIL: signing token %', v; END IF;
  PERFORM pg_temp.as_anon();
  BEGIN
    v := generate_share_token();
    RAISE EXCEPTION 'FAIL: a visitor generated a share token';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.as_user('member_a');
  v := generate_share_token();
  BEGIN
    v := generate_signature_token();
    RAISE EXCEPTION 'FAIL: a signed-in user called the signing token generator directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.as_owner();
  PERFORM pg_temp.pass('share and signing tokens are 24 random characters and not generated by visitors');
END $$;

-- ------------------------------------------------------------
-- 5. Log cleanup keeps recent rows
-- ------------------------------------------------------------
DO $$
BEGIN
  INSERT INTO error_log (severity, category, message, created_at) VALUES
    ('error', 'dp-test', 'DP old', now() - interval '200 days'),
    ('error', 'dp-test', 'DP recent', now() - interval '1 day');
  PERFORM cleanup_old_logs();
  IF EXISTS (SELECT 1 FROM error_log WHERE message = 'DP old')
     OR NOT EXISTS (SELECT 1 FROM error_log WHERE message = 'DP recent') THEN
    RAISE EXCEPTION 'FAIL: log cleanup removed the wrong rows';
  END IF;
  PERFORM pg_temp.pass('log cleanup removes old error reports only');
END $$;

DO $$
BEGIN
  RAISE NOTICE 'DATA PROTECTION TESTS: all % checks passed (rolled back)', current_setting('ti.passes');
END $$;

ROLLBACK;
