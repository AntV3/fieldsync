-- ============================================================
-- CREATE_TM_TICKET_FULL TESTS
-- ============================================================
-- Exercises supabase/migrations/20261104_offline_tm_submit.sql:
-- the idempotent, atomic create_tm_ticket_full(p_payload) RPC and
-- the field T&M policies it relies on, as the Postgres anon role
-- (field session header) and the authenticated role (JWT claims).
--
-- HOW TO USE:
--   Paste the whole file into the Supabase SQL Editor (or run it
--   with psql -v ON_ERROR_STOP=1) AFTER the migration. Every check
--   is a DO block that RAISEs on failure and prints "PASS: ..." on
--   success. The whole script is ONE transaction that ends in
--   ROLLBACK, so it leaves no rows behind, including its fixtures
--   (company, projects, field session, users, labor class,
--   material, CORs).
--
-- EXPECTED: a list of "NOTICE: PASS: ..." lines and a final
--   "NOTICE: CREATE_TM_TICKET_FULL TESTS: all N checks passed (rolled back)".
--   Any ERROR means a check failed; the transaction is aborted and
--   nothing is written either way.
--
-- Roles are simulated the way PostgREST does it:
--   anon:          SET LOCAL ROLE anon +
--                  request.headers = {"x-field-session": "<token>"}
--   authenticated: SET LOCAL ROLE authenticated +
--                  request.jwt.claims = {"sub": "<uuid>", "role": "authenticated"}
--   RESET ROLE between cases; row counts are taken as the table
--   owner so RLS cannot hide a row from an assertion.
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

SELECT set_config('tm_full.passes', '0', true);

-- ------------------------------------------------------------
-- (0) The field policies the RPC relies on are live, and the API
--     roles hold the table grants and EXECUTE.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_tbl TEXT;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['t_and_m_tickets', 't_and_m_workers', 't_and_m_items'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = v_tbl AND cmd = 'INSERT'
        AND with_check ILIKE '%can_access_project%'
    ) THEN
      RAISE EXCEPTION 'FAIL: no INSERT policy using can_access_project on %', v_tbl;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = v_tbl AND cmd = 'SELECT'
        AND qual ILIKE '%can_access_project%'
    ) THEN
      RAISE EXCEPTION 'FAIL: no SELECT policy using can_access_project on %', v_tbl;
    END IF;
    IF NOT (has_table_privilege('anon', 'public.' || v_tbl, 'SELECT')
            AND has_table_privilege('anon', 'public.' || v_tbl, 'INSERT')
            AND has_table_privilege('authenticated', 'public.' || v_tbl, 'SELECT')
            AND has_table_privilege('authenticated', 'public.' || v_tbl, 'INSERT')) THEN
      RAISE EXCEPTION 'FAIL: anon/authenticated lack SELECT+INSERT on %', v_tbl;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 't_and_m_tickets' AND cmd = 'UPDATE'
      AND qual ILIKE '%can_access_project%'
  ) THEN
    RAISE EXCEPTION 'FAIL: no UPDATE policy using can_access_project on t_and_m_tickets';
  END IF;

  IF NOT (has_function_privilege('anon', 'public.create_tm_ticket_full(jsonb)', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.create_tm_ticket_full(jsonb)', 'EXECUTE')) THEN
    RAISE EXCEPTION 'FAIL: anon/authenticated cannot EXECUTE create_tm_ticket_full';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'create_tm_ticket_full' AND pronamespace = 'public'::regnamespace
      AND NOT prosecdef
  ) THEN
    RAISE EXCEPTION 'FAIL: create_tm_ticket_full is missing or SECURITY DEFINER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 't_and_m_tickets'
      AND indexname = 'idx_tm_tickets_client_submission_id'
      AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%client_submission_id IS NOT NULL%'
  ) THEN
    RAISE EXCEPTION 'FAIL: partial unique index on client_submission_id missing';
  END IF;

  RAISE NOTICE 'PASS: (0) can_access_project INSERT/SELECT policies on tickets/workers/items (+ UPDATE on tickets), grants, EXECUTE, INVOKER, unique index';
  PERFORM set_config('tm_full.passes', (current_setting('tm_full.passes', true)::int + 1)::text, true);
END $$;

-- ------------------------------------------------------------
-- FIXTURES (as the SQL-editor role; RLS does not apply to the owner)
-- ------------------------------------------------------------
DO $$
DECLARE
  v_company_id   UUID := gen_random_uuid();
  v_project_id   UUID := gen_random_uuid();
  v_project2_id  UUID := gen_random_uuid();
  v_foreign_co   UUID := gen_random_uuid();
  v_foreign_proj UUID := gen_random_uuid();
  v_office_user  UUID := gen_random_uuid();
  v_foreign_user UUID := gen_random_uuid();
  v_labor_class  UUID := gen_random_uuid();
  v_material_id  UUID := gen_random_uuid();
  v_cor_id       UUID := gen_random_uuid();
  v_cor2_id      UUID := gen_random_uuid();
BEGIN
  DELETE FROM field_sessions WHERE session_token = 'fs_tmfull_test_0001';

  INSERT INTO companies (id, name, code, office_code)
  VALUES (v_company_id, 'TM Full Test Co',
          'TMF' || upper(substr(md5(random()::text), 1, 8)),
          'OFF' || upper(substr(md5(random()::text), 1, 8))),
         (v_foreign_co, 'TM Full Foreign Co',
          'TMX' || upper(substr(md5(random()::text), 1, 8)),
          'OFF' || upper(substr(md5(random()::text), 1, 8)));

  INSERT INTO projects (id, company_id, name, job_number, status)
  VALUES (v_project_id,   v_company_id, 'TM Full Project',        'TMF-001', 'active'),
         (v_project2_id,  v_company_id, 'TM Full Other Project',  'TMF-002', 'active'),
         (v_foreign_proj, v_foreign_co, 'TM Full Foreign Project', 'TMX-001', 'active');

  -- Field session for the project, exactly as validate_pin_and_create_session writes it
  INSERT INTO field_sessions (project_id, company_id, session_token, device_id, expires_at)
  VALUES (v_project_id, v_company_id, 'fs_tmfull_test_0001', 'tmfull-test', NOW() + INTERVAL '1 hour');

  INSERT INTO labor_classes (id, company_id, name, active)
  VALUES (v_labor_class, v_company_id, 'TM Full Journeyman', true);

  INSERT INTO materials_equipment (id, company_id, name, category, unit, cost_per_unit, active)
  VALUES (v_material_id, v_company_id, 'TM Full Material', 'materials', 'each', 12.5, true);

  INSERT INTO change_orders (id, company_id, project_id, cor_number, title, scope_of_work, period_start, period_end, status)
  VALUES (v_cor_id,  v_company_id, v_project_id,  'TMF-COR-1', 'TM Full COR', 'Scope', CURRENT_DATE, CURRENT_DATE, 'draft'),
         (v_cor2_id, v_company_id, v_project2_id, 'TMF-COR-2', 'Other project COR', 'Scope', CURRENT_DATE, CURRENT_DATE, 'draft');

  -- An office user of this company and an office user of another company
  INSERT INTO auth.users (id, email) VALUES
    (v_office_user,  'tmfull-office@example.invalid'),
    (v_foreign_user, 'tmfull-foreign@example.invalid');
  INSERT INTO users (id, email, name, company_id, role)
  VALUES (v_office_user,  'tmfull-office@example.invalid',  'TM Full Office',  v_company_id, 'admin'),
         (v_foreign_user, 'tmfull-foreign@example.invalid', 'TM Full Foreign', v_foreign_co, 'admin')
  ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id;
  INSERT INTO user_companies (user_id, company_id, role, status)
  VALUES (v_office_user,  v_company_id, 'admin', 'active'),
         (v_foreign_user, v_foreign_co, 'admin', 'active')
  ON CONFLICT (user_id, company_id) DO UPDATE SET status = 'active';

  -- A ticket in the foreign project that already carries a known
  -- client_submission_id (case i)
  INSERT INTO t_and_m_tickets (project_id, work_date, notes, status, created_by_name, client_submission_id)
  VALUES (v_foreign_proj, CURRENT_DATE, 'Foreign ticket', 'pending', 'Foreign Foreman',
          '0f0f0f0f-0000-4000-8000-00000000f00d');

  PERFORM set_config('tm_full.company_id',   v_company_id::text, true);
  PERFORM set_config('tm_full.project_id',   v_project_id::text, true);
  PERFORM set_config('tm_full.project2_id',  v_project2_id::text, true);
  PERFORM set_config('tm_full.office_user',  v_office_user::text, true);
  PERFORM set_config('tm_full.foreign_user', v_foreign_user::text, true);
  PERFORM set_config('tm_full.labor_class',  v_labor_class::text, true);
  PERFORM set_config('tm_full.material_id',  v_material_id::text, true);
  PERFORM set_config('tm_full.cor_id',       v_cor_id::text, true);
  PERFORM set_config('tm_full.cor2_id',      v_cor2_id::text, true);
  -- client_submission_ids per case
  PERFORM set_config('tm_full.csid_a', gen_random_uuid()::text, true);
  PERFORM set_config('tm_full.csid_b', gen_random_uuid()::text, true);
  PERFORM set_config('tm_full.csid_c', gen_random_uuid()::text, true);
  PERFORM set_config('tm_full.csid_d', gen_random_uuid()::text, true);
  PERFORM set_config('tm_full.csid_d_bad', gen_random_uuid()::text, true);
  PERFORM set_config('tm_full.csid_e', gen_random_uuid()::text, true);
  PERFORM set_config('tm_full.csid_f', gen_random_uuid()::text, true);
  PERFORM set_config('tm_full.csid_f_bad', gen_random_uuid()::text, true);
  PERFORM set_config('tm_full.csid_g', gen_random_uuid()::text, true);
  PERFORM set_config('tm_full.csid_h', gen_random_uuid()::text, true);

  RAISE NOTICE 'PASS: fixtures created (company %, project %, cor %)', v_company_id, v_project_id, v_cor_id;
  PERFORM set_config('tm_full.passes', (current_setting('tm_full.passes', true)::int + 1)::text, true);
END $$;

-- ============================================================
-- AS ANON WITH A VALID FIELD SESSION FOR THE PROJECT
-- ============================================================
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.headers', '{"x-field-session":"fs_tmfull_test_0001"}', true);

-- (a) Same client_submission_id twice: replayed false, then true
DO $$
DECLARE
  v_payload JSONB;
  v_first   JSONB;
  v_second  JSONB;
BEGIN
  v_payload := jsonb_build_object(
    'project_id',           current_setting('tm_full.project_id', true),
    'client_submission_id', current_setting('tm_full.csid_a', true),
    'work_date',            '2026-11-03',
    'ce_pco_number',        'CE-TMF-1',
    'assigned_cor_id',      NULL,
    'notes',                'Offline ticket notes',
    'created_by_name',      'TM Full Foreman',
    'workers', jsonb_build_array(
      jsonb_build_object('name', 'Worker One', 'hours', 8, 'overtime_hours', 2,
                         'time_started', '08:00', 'time_ended', '18:30', 'role', 'Laborer',
                         'labor_class_id', current_setting('tm_full.labor_class', true)),
      jsonb_build_object('name', 'Worker Two', 'hours', '8', 'overtime_hours', 0,
                         'time_started', '', 'time_ended', '', 'role', 'Operator',
                         'labor_class_id', ''),
      jsonb_build_object('name', 'Worker Three', 'hours', 4)
    ),
    'items', jsonb_build_array(
      jsonb_build_object('material_equipment_id', current_setting('tm_full.material_id', true), 'quantity', 3),
      jsonb_build_object('custom_name', 'Rented lift', 'custom_category', 'equipment', 'quantity', '1.5')
    )
  );

  v_first := create_tm_ticket_full(v_payload);
  IF (v_first->>'replayed')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL: (a) first call replayed = % (expected false): %', v_first->>'replayed', v_first::text;
  END IF;
  IF v_first->>'status' <> 'pending'
     OR v_first->>'client_submission_id' <> current_setting('tm_full.csid_a', true)
     OR v_first->>'project_id' <> current_setting('tm_full.project_id', true)
     OR v_first->>'work_date' <> '2026-11-03'
     OR v_first->>'notes' <> 'Offline ticket notes'
     OR v_first->>'created_by_name' <> 'TM Full Foreman'
     OR v_first->>'ce_pco_number' <> 'CE-TMF-1'
     OR v_first->>'foreman_signature_data' IS NOT NULL
     OR NOT (v_first ? 'id') THEN
    RAISE EXCEPTION 'FAIL: (a) first call row unexpected: %', v_first::text;
  END IF;

  v_second := create_tm_ticket_full(v_payload);
  IF (v_second->>'replayed')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL: (a) second call replayed = % (expected true)', v_second->>'replayed';
  END IF;
  IF v_second->>'id' <> v_first->>'id' THEN
    RAISE EXCEPTION 'FAIL: (a) replay returned another ticket (% vs %)', v_second->>'id', v_first->>'id';
  END IF;

  PERFORM set_config('tm_full.ticket_a', v_first->>'id', true);
END $$;

-- (b) No x-field-session header -> 42501, nothing written
SELECT set_config('request.headers', '{}', true);
DO $$
DECLARE
  v_state TEXT := 'no error';
BEGIN
  BEGIN
    PERFORM create_tm_ticket_full(jsonb_build_object(
      'project_id',           current_setting('tm_full.project_id', true),
      'client_submission_id', current_setting('tm_full.csid_b', true),
      'work_date',            '2026-11-03',
      'workers',              jsonb_build_array(jsonb_build_object('name', 'Worker', 'hours', 8))));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  IF v_state <> '42501' THEN
    RAISE EXCEPTION 'FAIL: (b) no session header -> % (expected 42501)', v_state;
  END IF;

  -- A replay probe of an existing id without a session is refused the same way
  v_state := 'no error';
  BEGIN
    PERFORM create_tm_ticket_full(jsonb_build_object(
      'project_id',           current_setting('tm_full.project_id', true),
      'client_submission_id', current_setting('tm_full.csid_a', true),
      'workers',              jsonb_build_array(jsonb_build_object('name', 'Worker', 'hours', 8))));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  IF v_state <> '42501' THEN
    RAISE EXCEPTION 'FAIL: (b) replay probe without session -> % (expected 42501)', v_state;
  END IF;
END $$;
SELECT set_config('request.headers', '{"x-field-session":"fs_tmfull_test_0001"}', true);

-- (c) workers = [] -> 22023; missing ids -> 22023
DO $$
DECLARE
  v_state TEXT := 'no error';
BEGIN
  BEGIN
    PERFORM create_tm_ticket_full(jsonb_build_object(
      'project_id',           current_setting('tm_full.project_id', true),
      'client_submission_id', current_setting('tm_full.csid_c', true),
      'work_date',            '2026-11-03',
      'workers',              '[]'::jsonb));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  IF v_state <> '22023' THEN
    RAISE EXCEPTION 'FAIL: (c) workers=[] -> % (expected 22023)', v_state;
  END IF;

  v_state := 'no error';
  BEGIN
    PERFORM create_tm_ticket_full(jsonb_build_object(
      'project_id', current_setting('tm_full.project_id', true),
      'workers',    jsonb_build_array(jsonb_build_object('name', 'Worker', 'hours', 8))));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  IF v_state <> '22023' THEN
    RAISE EXCEPTION 'FAIL: (c) missing client_submission_id -> % (expected 22023)', v_state;
  END IF;

  v_state := 'no error';
  BEGIN
    PERFORM create_tm_ticket_full(jsonb_build_object(
      'client_submission_id', current_setting('tm_full.csid_c', true),
      'workers',              jsonb_build_array(jsonb_build_object('name', 'Worker', 'hours', 8))));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  IF v_state <> '22023' THEN
    RAISE EXCEPTION 'FAIL: (c) missing project_id -> % (expected 22023)', v_state;
  END IF;
END $$;

-- (d) Signature -> foreman_signed; non-PNG / oversize / nameless -> 22023
DO $$
DECLARE
  c_png CONSTANT TEXT := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  v_res   JSONB;
  v_state TEXT;
  v_bad   JSONB;
BEGIN
  v_res := create_tm_ticket_full(jsonb_build_object(
    'project_id',           current_setting('tm_full.project_id', true),
    'client_submission_id', current_setting('tm_full.csid_d', true),
    'work_date',            '2026-11-03',
    'notes',                'Signed offline',
    'workers',              jsonb_build_array(jsonb_build_object('name', 'Signed Worker', 'hours', 8)),
    'foreman_signature',    jsonb_build_object('data', c_png, 'name', 'Sig Foreman', 'title', 'Foreman',
                                               'date', '2026-11-03T15:04:05Z')));
  IF (v_res->>'replayed')::boolean IS DISTINCT FROM false
     OR v_res->>'status' <> 'foreman_signed'
     OR v_res->>'foreman_signature_data' <> c_png
     OR v_res->>'foreman_signature_name' <> 'Sig Foreman'
     OR v_res->>'foreman_signature_title' <> 'Foreman'
     OR (v_res->>'foreman_signature_date')::timestamptz <> '2026-11-03T15:04:05Z'::timestamptz THEN
    RAISE EXCEPTION 'FAIL: (d) signed ticket unexpected: %', v_res::text;
  END IF;
  PERFORM set_config('tm_full.ticket_d', v_res->>'id', true);

  FOREACH v_bad IN ARRAY ARRAY[
    jsonb_build_object('data', 'data:image/jpeg;base64,AAAAAAAAAAAAAAAA', 'name', 'Sig Foreman'),
    jsonb_build_object('data', 'data:image/png;base64,' || repeat('A', 2000000), 'name', 'Sig Foreman'),
    jsonb_build_object('data', c_png, 'name', '   '),
    jsonb_build_object('name', 'Sig Foreman'),
    to_jsonb('data:image/png;base64,AAAA'::text)
  ] LOOP
    v_state := 'no error';
    BEGIN
      PERFORM create_tm_ticket_full(jsonb_build_object(
        'project_id',           current_setting('tm_full.project_id', true),
        'client_submission_id', current_setting('tm_full.csid_d_bad', true),
        'work_date',            '2026-11-03',
        'workers',              jsonb_build_array(jsonb_build_object('name', 'Signed Worker', 'hours', 8)),
        'foreman_signature',    v_bad));
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    END;
    IF v_state <> '22023' THEN
      RAISE EXCEPTION 'FAIL: (d) malformed signature % -> % (expected 22023)', left(v_bad::text, 60), v_state;
    END IF;
  END LOOP;
END $$;

-- (f) assigned_cor_id -> exactly one junction row via the trigger,
--     none added on replay; a COR of another project -> 22023
DO $$
DECLARE
  v_payload JSONB;
  v_res     JSONB;
  v_res2    JSONB;
  v_state   TEXT := 'no error';
BEGIN
  v_payload := jsonb_build_object(
    'project_id',           current_setting('tm_full.project_id', true),
    'client_submission_id', current_setting('tm_full.csid_f', true),
    'work_date',            '2026-11-03',
    'assigned_cor_id',      current_setting('tm_full.cor_id', true),
    'workers',              jsonb_build_array(jsonb_build_object('name', 'COR Worker', 'hours', 8)));
  v_res := create_tm_ticket_full(v_payload);
  IF (v_res->>'replayed')::boolean IS DISTINCT FROM false
     OR v_res->>'assigned_cor_id' <> current_setting('tm_full.cor_id', true) THEN
    RAISE EXCEPTION 'FAIL: (f) COR ticket unexpected: %', v_res::text;
  END IF;
  v_res2 := create_tm_ticket_full(v_payload);
  IF (v_res2->>'replayed')::boolean IS DISTINCT FROM true OR v_res2->>'id' <> v_res->>'id' THEN
    RAISE EXCEPTION 'FAIL: (f) COR replay unexpected: %', v_res2::text;
  END IF;
  PERFORM set_config('tm_full.ticket_f', v_res->>'id', true);

  BEGIN
    PERFORM create_tm_ticket_full(jsonb_build_object(
      'project_id',           current_setting('tm_full.project_id', true),
      'client_submission_id', current_setting('tm_full.csid_f_bad', true),
      'work_date',            '2026-11-03',
      'assigned_cor_id',      current_setting('tm_full.cor2_id', true),
      'workers',              jsonb_build_array(jsonb_build_object('name', 'COR Worker', 'hours', 8))));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  IF v_state <> '22023' THEN
    RAISE EXCEPTION 'FAIL: (f) COR of another project -> % (expected 22023)', v_state;
  END IF;
END $$;

-- (g) Bogus material_equipment_id -> error, and (checked below as
--     owner) zero ticket rows for that id: the call is atomic
DO $$
DECLARE
  v_state TEXT := 'no error';
BEGIN
  BEGIN
    PERFORM create_tm_ticket_full(jsonb_build_object(
      'project_id',           current_setting('tm_full.project_id', true),
      'client_submission_id', current_setting('tm_full.csid_g', true),
      'work_date',            '2026-11-03',
      'workers',              jsonb_build_array(jsonb_build_object('name', 'Atomic Worker', 'hours', 8)),
      'items',                jsonb_build_array(
                                jsonb_build_object('custom_name', 'Fine item', 'quantity', 1),
                                jsonb_build_object('material_equipment_id', gen_random_uuid(), 'quantity', 2))));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  IF v_state = 'no error' THEN
    RAISE EXCEPTION 'FAIL: (g) bogus material_equipment_id was accepted';
  END IF;
  PERFORM set_config('tm_full.g_state', v_state, true);
END $$;

-- (i) A client_submission_id already used by a ticket the caller
--     cannot see (another company's project) -> unique violation,
--     nothing of the other ticket returned
DO $$
DECLARE
  v_state TEXT := 'no error';
  v_res   JSONB;
BEGIN
  BEGIN
    v_res := create_tm_ticket_full(jsonb_build_object(
      'project_id',           current_setting('tm_full.project_id', true),
      'client_submission_id', '0f0f0f0f-0000-4000-8000-00000000f00d',
      'work_date',            '2026-11-03',
      'workers',              jsonb_build_array(jsonb_build_object('name', 'Probe Worker', 'hours', 8))));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  IF v_state <> '23505' THEN
    RAISE EXCEPTION 'FAIL: (i) id of an invisible ticket -> % (expected 23505), result %', v_state, v_res::text;
  END IF;
END $$;

RESET ROLE;
SELECT set_config('request.headers', '', true);

-- Owner-side assertions for (a), (b), (c), (d), (f), (g), (i)
DO $$
DECLARE
  v_ticket_a UUID := current_setting('tm_full.ticket_a', true)::uuid;
  v_ticket_f UUID := current_setting('tm_full.ticket_f', true)::uuid;
  v_n        BIGINT;
BEGIN
  -- (a)
  SELECT count(*) INTO v_n FROM t_and_m_tickets
  WHERE client_submission_id = current_setting('tm_full.csid_a', true)::uuid;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: (a) % ticket rows for one client_submission_id (expected 1)', v_n; END IF;

  SELECT count(*) INTO v_n FROM t_and_m_workers WHERE ticket_id = v_ticket_a;
  IF v_n <> 3 THEN RAISE EXCEPTION 'FAIL: (a) % worker rows (expected 3)', v_n; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM t_and_m_workers
    WHERE ticket_id = v_ticket_a AND name = 'Worker One'
      AND time_started::text LIKE '08:00%' AND time_ended::text LIKE '18:30%'
      AND hours = 8 AND overtime_hours = 2 AND role = 'Laborer'
      AND labor_class_id = current_setting('tm_full.labor_class', true)::uuid
  ) THEN
    RAISE EXCEPTION 'FAIL: (a) Worker One not stored with 08:00-18:30, 8h + 2h OT, labor class';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM t_and_m_workers
    WHERE ticket_id = v_ticket_a AND name = 'Worker Two'
      AND time_started IS NULL AND time_ended IS NULL AND labor_class_id IS NULL
      AND hours = 8 AND role = 'Operator'
  ) THEN
    RAISE EXCEPTION 'FAIL: (a) Worker Two empty strings not stored as NULL';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM t_and_m_workers
    WHERE ticket_id = v_ticket_a AND name = 'Worker Three'
      AND hours = 4 AND overtime_hours = 0 AND role = 'Laborer'
  ) THEN
    RAISE EXCEPTION 'FAIL: (a) Worker Three defaults (0 OT, Laborer) not applied';
  END IF;

  SELECT count(*) INTO v_n FROM t_and_m_items WHERE ticket_id = v_ticket_a;
  IF v_n <> 2 THEN RAISE EXCEPTION 'FAIL: (a) % item rows (expected 2)', v_n; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM t_and_m_items
    WHERE ticket_id = v_ticket_a
      AND material_equipment_id = current_setting('tm_full.material_id', true)::uuid AND quantity = 3
  ) OR NOT EXISTS (
    SELECT 1 FROM t_and_m_items
    WHERE ticket_id = v_ticket_a AND material_equipment_id IS NULL
      AND custom_name = 'Rented lift' AND custom_category = 'equipment' AND quantity = 1.5
  ) THEN
    RAISE EXCEPTION 'FAIL: (a) items not stored as sent';
  END IF;
  IF EXISTS (
    SELECT 1 FROM t_and_m_tickets
    WHERE id = v_ticket_a
      AND NOT (to_jsonb(t_and_m_tickets)->'photos' IN ('[]'::jsonb, '{}'::jsonb))
  ) THEN
    RAISE EXCEPTION 'FAIL: (a) photos is not empty on the new ticket';
  END IF;
  RAISE NOTICE 'PASS: (a) same client_submission_id twice -> replayed false then true; 1 ticket, 3 workers (08:00 start, empty strings -> NULL, defaults), 2 items, no photos';
  PERFORM set_config('tm_full.passes', (current_setting('tm_full.passes', true)::int + 1)::text, true);

  -- (b)
  SELECT count(*) INTO v_n FROM t_and_m_tickets
  WHERE client_submission_id = current_setting('tm_full.csid_b', true)::uuid;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: (b) a ticket was written without a session'; END IF;
  RAISE NOTICE 'PASS: (b) anon without x-field-session -> 42501 (new id and replay probe), nothing written';
  PERFORM set_config('tm_full.passes', (current_setting('tm_full.passes', true)::int + 1)::text, true);

  -- (c)
  SELECT count(*) INTO v_n FROM t_and_m_tickets
  WHERE client_submission_id = current_setting('tm_full.csid_c', true)::uuid;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: (c) a ticket was written with workers=[]'; END IF;
  RAISE NOTICE 'PASS: (c) workers=[] / missing client_submission_id / missing project_id -> 22023, nothing written';
  PERFORM set_config('tm_full.passes', (current_setting('tm_full.passes', true)::int + 1)::text, true);

  -- (d)
  SELECT count(*) INTO v_n FROM t_and_m_tickets
  WHERE client_submission_id = current_setting('tm_full.csid_d_bad', true)::uuid;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: (d) a ticket was written with a malformed signature'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM t_and_m_tickets
    WHERE id = current_setting('tm_full.ticket_d', true)::uuid
      AND status = 'foreman_signed' AND foreman_signature_name = 'Sig Foreman'
  ) THEN
    RAISE EXCEPTION 'FAIL: (d) signed ticket not stored as foreman_signed';
  END IF;
  RAISE NOTICE 'PASS: (d) signature -> foreman_signed with data/name/title/date; non-PNG, > 2,000,000 chars, blank name, no data, non-object -> 22023';
  PERFORM set_config('tm_full.passes', (current_setting('tm_full.passes', true)::int + 1)::text, true);

  -- (f)
  SELECT count(*) INTO v_n FROM change_order_ticket_associations WHERE ticket_id = v_ticket_f;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: (f) % junction rows for the COR ticket (expected 1)', v_n; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM change_order_ticket_associations
    WHERE ticket_id = v_ticket_f AND change_order_id = current_setting('tm_full.cor_id', true)::uuid
  ) THEN
    RAISE EXCEPTION 'FAIL: (f) junction row does not point at the COR';
  END IF;
  SELECT count(*) INTO v_n FROM t_and_m_tickets
  WHERE client_submission_id IN (current_setting('tm_full.csid_f', true)::uuid,
                                 current_setting('tm_full.csid_f_bad', true)::uuid);
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: (f) % tickets for the COR ids (expected 1)', v_n; END IF;
  RAISE NOTICE 'PASS: (f) assigned_cor_id -> exactly one change_order_ticket_associations row (trigger), none added on replay; COR of another project -> 22023';
  PERFORM set_config('tm_full.passes', (current_setting('tm_full.passes', true)::int + 1)::text, true);

  -- (g)
  SELECT count(*) INTO v_n FROM t_and_m_tickets
  WHERE client_submission_id = current_setting('tm_full.csid_g', true)::uuid;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: (g) % ticket rows after a failed item insert (expected 0)', v_n; END IF;
  SELECT count(*) INTO v_n FROM t_and_m_workers WHERE name = 'Atomic Worker';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: (g) % orphan worker rows (expected 0)', v_n; END IF;
  SELECT count(*) INTO v_n FROM t_and_m_items WHERE custom_name = 'Fine item';
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: (g) % orphan item rows (expected 0)', v_n; END IF;
  RAISE NOTICE 'PASS: (g) bogus material_equipment_id -> error % and zero ticket/worker/item rows (atomic)',
    current_setting('tm_full.g_state', true);
  PERFORM set_config('tm_full.passes', (current_setting('tm_full.passes', true)::int + 1)::text, true);

  -- (i)
  SELECT count(*) INTO v_n FROM t_and_m_tickets
  WHERE client_submission_id = '0f0f0f0f-0000-4000-8000-00000000f00d'::uuid;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: (i) % rows carry the foreign id (expected 1)', v_n; END IF;
  RAISE NOTICE 'PASS: (i) id already used by a ticket the caller cannot see -> 23505, the other ticket is not returned';
  PERFORM set_config('tm_full.passes', (current_setting('tm_full.passes', true)::int + 1)::text, true);
END $$;

-- ============================================================
-- AS AUTHENTICATED
-- ============================================================

-- (e) Office user of ANOTHER company -> 42501
SET LOCAL ROLE authenticated;
SELECT set_config('request.headers', '{}', true);
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('tm_full.foreign_user', true), 'role', 'authenticated')::text, true);
DO $$
DECLARE
  v_state TEXT := 'no error';
BEGIN
  BEGIN
    PERFORM create_tm_ticket_full(jsonb_build_object(
      'project_id',           current_setting('tm_full.project_id', true),
      'client_submission_id', current_setting('tm_full.csid_e', true),
      'work_date',            '2026-11-03',
      'workers',              jsonb_build_array(jsonb_build_object('name', 'Foreign Worker', 'hours', 8))));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  IF v_state <> '42501' THEN
    RAISE EXCEPTION 'FAIL: (e) foreign-company user -> % (expected 42501)', v_state;
  END IF;
END $$;
RESET ROLE;

-- (h) Office user of THIS company -> created (office path unchanged)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('tm_full.office_user', true), 'role', 'authenticated')::text, true);
DO $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := create_tm_ticket_full(jsonb_build_object(
    'project_id',           current_setting('tm_full.project_id', true),
    'client_submission_id', current_setting('tm_full.csid_h', true),
    'work_date',            '2026-11-03',
    'created_by_name',      'Office User',
    'workers',              jsonb_build_array(jsonb_build_object('name', 'Office Worker', 'hours', 6))));
  IF (v_res->>'replayed')::boolean IS DISTINCT FROM false OR v_res->>'status' <> 'pending' THEN
    RAISE EXCEPTION 'FAIL: (h) office user create unexpected: %', v_res::text;
  END IF;
  PERFORM set_config('tm_full.ticket_h', v_res->>'id', true);
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

DO $$
DECLARE
  v_n BIGINT;
BEGIN
  SELECT count(*) INTO v_n FROM t_and_m_tickets
  WHERE client_submission_id = current_setting('tm_full.csid_e', true)::uuid;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL: (e) a ticket was written by a foreign-company user'; END IF;
  RAISE NOTICE 'PASS: (e) authenticated user of another company -> 42501, nothing written';
  PERFORM set_config('tm_full.passes', (current_setting('tm_full.passes', true)::int + 1)::text, true);

  SELECT count(*) INTO v_n FROM t_and_m_workers
  WHERE ticket_id = current_setting('tm_full.ticket_h', true)::uuid AND name = 'Office Worker';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: (h) office ticket has % workers (expected 1)', v_n; END IF;
  RAISE NOTICE 'PASS: (h) authenticated user of the project''s company -> ticket + worker created';
  PERFORM set_config('tm_full.passes', (current_setting('tm_full.passes', true)::int + 1)::text, true);
END $$;

-- ------------------------------------------------------------
-- SUMMARY
-- ------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'CREATE_TM_TICKET_FULL TESTS: all % checks passed (rolled back)',
    current_setting('tm_full.passes', true);
END $$;

ROLLBACK;
