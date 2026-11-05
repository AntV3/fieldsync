-- ============================================================
-- EMAIL OUTBOX TESTS (launch item 5)
-- ============================================================
-- Exercises 20261104_signature_public_rpcs.sql and
-- 20261104_transactional_email.sql as the API roles: anon (with and
-- without a field session), authenticated (office members of two
-- companies) and the SQL-editor owner standing in for the email
-- worker (service_role).
--
-- HOW TO USE:
--   Run the whole file in the Supabase SQL Editor (staging branch)
--   or with psql, AFTER both migrations. Every check is a DO block
--   that RAISEs on failure and prints "PASS: ..." on success. The
--   script is ONE transaction that ends in ROLLBACK: its fixtures,
--   the outbox rows it creates and every pg_net request it queues
--   are discarded (pg_net only sends after COMMIT).
--
-- EXPECTED: "NOTICE: PASS: ..." lines and a final
--   "NOTICE: EMAIL OUTBOX TESTS: all N checks passed (rolled back)".
--   Any ERROR is a failed check.
--
-- Vault: when email_worker_url / email_worker_secret do not exist the
--   script creates throw-away values inside the transaction so the
--   dispatch path can be asserted. pg_net: dispatches are counted in
--   net.http_request_queue (pg_net's own queue table); without it the
--   dispatch assertions are skipped with a NOTICE.
-- ============================================================

BEGIN;

SELECT set_config('eot.passes', '0', true);

-- ---- helpers (temporary, dropped with the session) ----------------
CREATE FUNCTION pg_temp.eot_id(p_name TEXT) RETURNS UUID
LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('eot.' || p_name, true), '')::uuid $$;

CREATE FUNCTION pg_temp.eot_pass(p_msg TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE 'PASS: %', p_msg;
  PERFORM set_config('eot.passes', (current_setting('eot.passes', true)::int + 1)::text, true);
END $$;

-- Act as an API role. p_uid -> request.jwt.claims.sub (authenticated);
-- p_session -> x-field-session header (anon field app).
CREATE FUNCTION pg_temp.eot_as(p_role TEXT, p_uid UUID, p_session TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_uid IS NULL THEN json_build_object('role', p_role)::text
         ELSE json_build_object('sub', p_uid, 'role', p_role)::text END, true);
  PERFORM set_config('request.headers',
    CASE WHEN p_session IS NULL THEN '{}' ELSE json_build_object('x-field-session', p_session)::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
END $$;

CREATE FUNCTION pg_temp.eot_owner() RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.headers', '', true);
END $$;

-- pg_net requests queued for an outbox id (NULL when pg_net's queue
-- table is not there).
CREATE FUNCTION pg_temp.eot_dispatches(p_outbox UUID) RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE v INTEGER;
BEGIN
  IF to_regclass('net.http_request_queue') IS NULL THEN
    RETURN NULL;
  END IF;
  EXECUTE $q$SELECT count(*) FROM net.http_request_queue q
             WHERE convert_from(q.body, 'UTF8')::jsonb->>'outbox_id' = $1$q$
    INTO v USING p_outbox::text;
  RETURN v;
END $$;

CREATE FUNCTION pg_temp.eot_png() RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
$$;

-- ------------------------------------------------------------
-- FIXTURES (owner role; RLS does not apply)
--   company A: office1 (creator, users.email), office2 (users.email
--     NULL -> auth.users.email), owner, an inactive member;
--     project pA with COR corA (pending_approval), corDraft (draft),
--     tickets tA (+2 workers, 1 item), tS2/tS3/tS4, tBilled (billed)
--   company B: memberB; project pB with ticket tB
--   field session fs for pA
-- ------------------------------------------------------------
DO $$
DECLARE
  v_sfx TEXT := lower(substr(md5(random()::text), 1, 8));
  v_cA UUID := gen_random_uuid();
  v_cB UUID := gen_random_uuid();
  v_pA UUID := gen_random_uuid();
  v_pB UUID := gen_random_uuid();
  v_o1 UUID := gen_random_uuid();
  v_o2 UUID := gen_random_uuid();
  v_ow UUID := gen_random_uuid();
  v_in UUID := gen_random_uuid();
  v_mB UUID := gen_random_uuid();
  v_corA UUID := gen_random_uuid();
  v_corD UUID := gen_random_uuid();
  v_tA UUID := gen_random_uuid();
  v_tS2 UUID := gen_random_uuid();
  v_tS3 UUID := gen_random_uuid();
  v_tS4 UUID := gen_random_uuid();
  v_tBil UUID := gen_random_uuid();
  v_tB UUID := gen_random_uuid();
  v_u RECORD;
BEGIN
  INSERT INTO companies (id, name, code, office_code) VALUES
    (v_cA, 'Email Test Co A', 'EMA' || upper(v_sfx), 'OFA' || upper(v_sfx)),
    (v_cB, 'Email Test Co B', 'EMB' || upper(v_sfx), 'OFB' || upper(v_sfx));

  -- auth.users (Supabase may mirror these into public.users by trigger)
  FOR v_u IN SELECT * FROM (VALUES
      (v_o1, 'office1.' || v_sfx || '@example.com', 'Office One'),
      (v_o2, 'office2.' || v_sfx || '@example.com', 'Office Two'),
      (v_ow, 'owner.'   || v_sfx || '@example.com', 'Owner Person'),
      (v_in, 'inactive.'|| v_sfx || '@example.com', 'Inactive Person'),
      (v_mB, 'memberb.' || v_sfx || '@example.com', 'Member B')
    ) AS x(id, email, name)
  LOOP
    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES (v_u.id, v_u.email, jsonb_build_object('full_name', v_u.name));
    -- office2 has no users.email: the resolver must fall back to auth.users.email
    INSERT INTO users (id, email, name)
    VALUES (v_u.id, CASE WHEN v_u.id = v_o2 THEN NULL ELSE upper(v_u.email) END, v_u.name)
    ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email, name = EXCLUDED.name;
  END LOOP;

  INSERT INTO user_companies (user_id, company_id, status) VALUES
    (v_o1, v_cA, 'active'), (v_o2, v_cA, 'active'), (v_ow, v_cA, 'active'),
    (v_in, v_cA, 'removed'), (v_mB, v_cB, 'active');

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'owner_user_id') THEN
    EXECUTE 'UPDATE companies SET owner_user_id = $1 WHERE id = $2' USING v_ow, v_cA;
  ELSE
    -- no owner column: the resolver falls back to an administrator member
    UPDATE user_companies SET access_level = 'administrator' WHERE user_id = v_ow AND company_id = v_cA;
  END IF;

  INSERT INTO projects (id, company_id, name, job_number, contract_value, status) VALUES
    (v_pA, v_cA, 'Email Project A', 'EM-A-1', 1000, 'active'),
    (v_pB, v_cB, 'Email Project B', 'EM-B-1', 1000, 'active');

  INSERT INTO change_orders (id, company_id, project_id, cor_number, title, scope_of_work, period_start, period_end, status) VALUES
    (v_corA, v_cA, v_pA, 'COR-7', 'Extra trenching', 'Scope', CURRENT_DATE, CURRENT_DATE, 'pending_approval'),
    (v_corD, v_cA, v_pA, 'COR-8', 'Draft work', 'Scope', CURRENT_DATE, CURRENT_DATE, 'draft');
  INSERT INTO change_order_labor (change_order_id, labor_class, regular_hours, regular_rate, regular_total, total, sort_order)
  VALUES (v_corA, 'Laborer', 8, 5000, 40000, 40000, 0);

  IF to_regclass('public.cor_log_entries') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO cor_log_entries (change_order_id, project_id, company_id, log_number)
      SELECT $1, $2, $3, COALESCE((SELECT max(log_number) FROM cor_log_entries WHERE project_id = $2), 0) + 1
      WHERE NOT EXISTS (SELECT 1 FROM cor_log_entries WHERE change_order_id = $1)
    $q$ USING v_corA, v_pA, v_cA;
  END IF;

  INSERT INTO t_and_m_tickets (id, project_id, work_date, ce_pco_number, notes, status, created_by_name) VALUES
    (v_tA,   v_pA, DATE '2026-11-03', 'CE-12', 'Fixture ticket', 'foreman_signed', 'Field Foreman'),
    (v_tS2,  v_pA, DATE '2026-11-03', NULL, NULL, 'pending', 'Field Foreman'),
    (v_tS3,  v_pA, DATE '2026-11-03', NULL, NULL, 'pending', 'Field Foreman'),
    (v_tS4,  v_pA, DATE '2026-11-03', NULL, NULL, 'pending', 'Field Foreman'),
    (v_tBil, v_pA, DATE '2026-11-03', NULL, NULL, 'billed',  'Field Foreman'),
    (v_tB,   v_pB, DATE '2026-11-03', NULL, NULL, 'pending', 'Field Foreman');
  INSERT INTO t_and_m_workers (ticket_id, name, hours, overtime_hours, role) VALUES
    (v_tA, 'Ann Worker', 8, 1, 'Foreman'),
    (v_tA, 'Bob Worker', 6, 0, 'Laborer');
  INSERT INTO t_and_m_items (ticket_id, custom_name, custom_category, quantity)
  VALUES (v_tA, 'Plate compactor', 'equipment', 1);

  INSERT INTO field_sessions (project_id, company_id, session_token, device_id, expires_at)
  VALUES (v_pA, v_cA, 'fs_email_test_' || v_sfx, 'eot-device', now() + interval '1 hour');

  IF to_regclass('public.company_branding') IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO company_branding (company_id, logo_url, primary_color, hide_fieldsync_branding)
      VALUES ($1, 'https://cdn.example.com/a-logo.png', '#123456', false)
      ON CONFLICT (company_id) DO UPDATE
        SET logo_url = EXCLUDED.logo_url, primary_color = EXCLUDED.primary_color,
            hide_fieldsync_branding = EXCLUDED.hide_fieldsync_branding
    $q$ USING v_cA;
  END IF;

  -- Vault: create throw-away worker secrets when missing (rolled back)
  IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'email_worker_url') THEN
      PERFORM vault.create_secret('https://email-test.invalid/functions/v1/send-email', 'email_worker_url');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'email_worker_secret') THEN
      PERFORM vault.create_secret('test-worker-secret-0123456789abcdef', 'email_worker_secret');
    END IF;
  END IF;

  -- The fixture tickets were inserted with no auth.uid(): discard the
  -- "new ticket" rows they queued so every count below starts at 0.
  DELETE FROM email_outbox WHERE company_id IN (v_cA, v_cB);

  PERFORM set_config('eot.sfx', v_sfx, true);
  PERFORM set_config('eot.cA', v_cA::text, true);
  PERFORM set_config('eot.cB', v_cB::text, true);
  PERFORM set_config('eot.pA', v_pA::text, true);
  PERFORM set_config('eot.pB', v_pB::text, true);
  PERFORM set_config('eot.o1', v_o1::text, true);
  PERFORM set_config('eot.o2', v_o2::text, true);
  PERFORM set_config('eot.ow', v_ow::text, true);
  PERFORM set_config('eot.in', v_in::text, true);
  PERFORM set_config('eot.mB', v_mB::text, true);
  PERFORM set_config('eot.corA', v_corA::text, true);
  PERFORM set_config('eot.corD', v_corD::text, true);
  PERFORM set_config('eot.tA', v_tA::text, true);
  PERFORM set_config('eot.tS2', v_tS2::text, true);
  PERFORM set_config('eot.tS3', v_tS3::text, true);
  PERFORM set_config('eot.tS4', v_tS4::text, true);
  PERFORM set_config('eot.tBil', v_tBil::text, true);
  PERFORM set_config('eot.tB', v_tB::text, true);
  PERFORM set_config('eot.fs', 'fs_email_test_' || v_sfx, true);

  PERFORM pg_temp.eot_pass('fixtures: companies A/B, 5 users, 2 projects, 2 CORs, 6 tickets, field session');
END $$;

-- ------------------------------------------------------------
-- 1. Catalogue: grants, RLS, FK, cron
-- ------------------------------------------------------------
DO $$
DECLARE
  v_fn TEXT;
  v_del "char";
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.email_outbox'::regclass) THEN
    RAISE EXCEPTION 'FAIL: RLS is not enabled on email_outbox';
  END IF;
  IF has_table_privilege('anon', 'public.email_outbox', 'SELECT')
     OR has_table_privilege('anon', 'public.email_outbox', 'INSERT')
     OR has_table_privilege('authenticated', 'public.email_outbox', 'INSERT')
     OR has_table_privilege('authenticated', 'public.email_outbox', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.email_outbox', 'DELETE')
     OR NOT has_table_privilege('authenticated', 'public.email_outbox', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL: email_outbox grants: anon must have none, authenticated SELECT only';
  END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.email_outbox_due(integer)',
    'public.claim_email_outbox(uuid)',
    'public.mark_email_outbox(uuid, text, text, text)',
    'public.email_context(uuid)'
  ] LOOP
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL: service_role cannot execute %', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL: an API role can execute worker RPC %', v_fn;
    END IF;
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.enqueue_email(uuid, uuid, uuid, text, text, text, text, text, jsonb, interval)',
    'public.email_outbox_dispatch(uuid)',
    'public.email_worker_post(jsonb)',
    'public.email_recipients_for_event(uuid, text)',
    'public.email_outbox_sweep()',
    'public.email_user_contact(uuid)',
    'public.email_company_owner(uuid)',
    'public.email_company_member(uuid, uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL: an API role can execute internal function %', v_fn;
    END IF;
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.create_signature_request(text, uuid, uuid, timestamp with time zone, text, text)',
    'public.resend_signature_request(uuid)'
  ] LOOP
    IF NOT has_function_privilege('anon', v_fn, 'EXECUTE') OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL: anon/authenticated cannot execute %', v_fn;
    END IF;
  END LOOP;

  -- signature tables: no client INSERT/DELETE on requests, no client
  -- writes on signatures, anon nothing; exactly the three company policies
  IF has_table_privilege('authenticated', 'public.signature_requests', 'INSERT')
     OR has_table_privilege('authenticated', 'public.signature_requests', 'DELETE')
     OR has_table_privilege('authenticated', 'public.signature_requests', 'TRUNCATE')
     OR NOT has_table_privilege('authenticated', 'public.signature_requests', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.signature_requests', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.signatures', 'INSERT')
     OR has_table_privilege('authenticated', 'public.signatures', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.signatures', 'DELETE')
     OR NOT has_table_privilege('authenticated', 'public.signatures', 'SELECT')
     OR has_table_privilege('anon', 'public.signature_requests', 'SELECT')
     OR has_table_privilege('anon', 'public.signature_requests', 'INSERT')
     OR has_table_privilege('anon', 'public.signature_requests', 'UPDATE')
     OR has_table_privilege('anon', 'public.signatures', 'SELECT')
     OR has_table_privilege('anon', 'public.signatures', 'INSERT') THEN
    RAISE EXCEPTION 'FAIL: signature_requests / signatures grants (authenticated: SELECT+UPDATE / SELECT only; anon: none)';
  END IF;
  IF (SELECT string_agg(tablename || ':' || policyname || ':' || cmd || ':' || array_to_string(roles, ','), ' | ' ORDER BY tablename, policyname)
      FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('signature_requests', 'signatures'))
     IS DISTINCT FROM
     'signature_requests:Company members update signature requests:UPDATE:authenticated | signature_requests:Company members view signature requests:SELECT:authenticated | signatures:Company members view signatures:SELECT:authenticated' THEN
    RAISE EXCEPTION 'FAIL: unexpected policies on signature_requests / signatures: %',
      (SELECT string_agg(tablename || ':' || policyname || ':' || cmd, ' | ') FROM pg_policies
        WHERE schemaname = 'public' AND tablename IN ('signature_requests', 'signatures'));
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('signature_requests', 'signatures')
               AND (COALESCE(qual, '') NOT ILIKE '%user_company_ids()%' OR (cmd = 'UPDATE' AND COALESCE(with_check, '') NOT ILIKE '%user_company_ids()%'))) THEN
    RAISE EXCEPTION 'FAIL: a signature policy is not scoped by user_company_ids()';
  END IF;

  SELECT c.confdeltype INTO v_del
  FROM pg_constraint c
  WHERE c.conrelid = 'public.email_outbox'::regclass AND c.contype = 'f'
    AND c.confrelid = 'public.signature_requests'::regclass;
  IF v_del IS DISTINCT FROM 'n' THEN
    RAISE EXCEPTION 'FAIL: email_outbox.signature_request_id must reference signature_requests ON DELETE SET NULL (got %)', v_del;
  END IF;

  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'SKIP: cron.job not present (pg_cron not enabled); sweep schedule not checked';
  ELSIF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email_outbox_sweep' AND schedule = '* * * * *'
                      AND command ILIKE '%email_outbox_sweep()%') THEN
    RAISE EXCEPTION 'FAIL: cron job email_outbox_sweep missing or wrong';
  END IF;

  PERFORM pg_temp.eot_pass('catalogue: RLS on email_outbox, anon none / authenticated SELECT only, worker RPCs service_role only, internals not executable; signature tables: authenticated SELECT(+UPDATE requests) only, anon none, exactly 3 user_company_ids() policies; FK ON DELETE SET NULL, cron job');
END $$;

-- ------------------------------------------------------------
-- 2. Office creates a COR link with a recipient -> exactly one
--    outbox row sigreq:<id>:0, dispatched once with the secret
-- ------------------------------------------------------------
DO $$
DECLARE
  v_req JSONB;
  v_id  UUID;
  v_o   email_outbox%ROWTYPE;
  v_n   INTEGER;
  v_q   RECORD;
BEGIN
  PERFORM pg_temp.eot_as('authenticated', pg_temp.eot_id('o1'), NULL);
  v_req := create_signature_request('cor', pg_temp.eot_id('corA'), pg_temp.eot_id('pA'),
                                    now() + interval '7 days', '  GC.Person@Example.COM ', ' Gina GC ');
  PERFORM pg_temp.eot_owner();

  v_id := (v_req->>'id')::uuid;
  IF v_req->>'recipient_email' <> 'gc.person@example.com' OR v_req->>'recipient_name' <> 'Gina GC'
     OR v_req->>'company_id' <> pg_temp.eot_id('cA')::text
     OR v_req->>'created_by' <> pg_temp.eot_id('o1')::text
     OR v_req->>'status' <> 'pending' OR (v_req->>'send_count')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL: create_signature_request row unexpected: %', v_req;
  END IF;

  SELECT count(*) INTO v_n FROM email_outbox WHERE signature_request_id = v_id;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected 1 outbox row for the new request, found %', v_n;
  END IF;
  SELECT * INTO v_o FROM email_outbox WHERE signature_request_id = v_id;
  IF v_o.dedupe_key <> 'sigreq:' || v_id || ':0'
     OR v_o.event_type <> 'signature_request'
     OR v_o.to_email <> 'gc.person@example.com' OR v_o.to_name <> 'Gina GC'
     OR v_o.reply_to IS DISTINCT FROM 'office1.' || current_setting('eot.sfx') || '@example.com'
     OR v_o.status <> 'pending' OR v_o.attempts <> 0
     OR v_o.scheduled_for <> now()
     OR v_o.company_id <> pg_temp.eot_id('cA') OR v_o.project_id <> pg_temp.eot_id('pA')
     OR v_o.payload <> jsonb_build_object('signature_request_id', v_id, 'document_type', 'cor', 'document_id', pg_temp.eot_id('corA')) THEN
    RAISE EXCEPTION 'FAIL: outbox row unexpected: %', to_jsonb(v_o);
  END IF;

  v_n := pg_temp.eot_dispatches(v_o.id);
  IF v_n IS NULL THEN
    RAISE NOTICE 'SKIP: net.http_request_queue not present; dispatch not asserted';
  ELSE
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'FAIL: expected 1 pg_net dispatch for outbox %, found %', v_o.id, v_n;
    END IF;
    SELECT q.* INTO v_q FROM net.http_request_queue q
    WHERE convert_from(q.body, 'UTF8')::jsonb->>'outbox_id' = v_o.id::text;
    IF v_q.method <> 'POST'
       OR v_q.url <> (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_worker_url' ORDER BY created_at DESC LIMIT 1)
       OR v_q.headers->>'x-email-worker-secret' <> (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_worker_secret' ORDER BY created_at DESC LIMIT 1)
       OR convert_from(v_q.body, 'UTF8')::jsonb <> jsonb_build_object('outbox_id', v_o.id) THEN
      RAISE EXCEPTION 'FAIL: dispatch request unexpected: url=% headers=% body=%', v_q.url, v_q.headers, convert_from(v_q.body, 'UTF8');
    END IF;
  END IF;

  PERFORM set_config('eot.reqA', v_id::text, true);
  PERFORM set_config('eot.tokA', v_req->>'signature_token', true);
  PERFORM set_config('eot.outA', v_o.id::text, true);
  PERFORM pg_temp.eot_pass('office create_signature_request: recipient normalised, one outbox row sigreq:<id>:0 (reply-to requester), one pg_net POST {outbox_id} with x-email-worker-secret');
END $$;

-- ------------------------------------------------------------
-- 3. create_signature_request refusals (cross-tenant, invalid)
-- ------------------------------------------------------------
DO $$
DECLARE
  v_before INTEGER;
  v_after  INTEGER;
  v_ok     INTEGER := 0;
  v_state  TEXT;
  r RECORD;
BEGIN
  SELECT count(*) INTO v_before FROM signature_requests WHERE company_id IN (pg_temp.eot_id('cA'), pg_temp.eot_id('cB'));

  PERFORM pg_temp.eot_as('authenticated', pg_temp.eot_id('o1'), NULL);
  FOR r IN SELECT * FROM (VALUES
      ('tm_ticket', pg_temp.eot_id('tB'),   pg_temp.eot_id('pB'), NULL::timestamptz, NULL::text, '42501', 'another company''s project'),
      ('tm_ticket', pg_temp.eot_id('tB'),   pg_temp.eot_id('pA'), NULL, NULL, '22023', 'another company''s ticket under own project'),
      ('cor',       pg_temp.eot_id('tA'),   pg_temp.eot_id('pA'), NULL, NULL, '22023', 'ticket id passed as a COR'),
      ('invoice',   pg_temp.eot_id('tA'),   pg_temp.eot_id('pA'), NULL, NULL, '22023', 'invalid document type'),
      ('cor',       pg_temp.eot_id('corD'), pg_temp.eot_id('pA'), NULL, NULL, '22023', 'draft COR (not signable)'),
      ('tm_ticket', pg_temp.eot_id('tBil'), pg_temp.eot_id('pA'), NULL, NULL, '22023', 'billed ticket'),
      ('tm_ticket', pg_temp.eot_id('tA'),   pg_temp.eot_id('pA'), NULL, 'not-an-email', '22023', 'invalid email'),
      ('tm_ticket', pg_temp.eot_id('tA'),   pg_temp.eot_id('pA'), NULL, 'a@b.com, c@d.com', '22023', 'two addresses'),
      ('tm_ticket', pg_temp.eot_id('tA'),   pg_temp.eot_id('pA'), now() - interval '1 day', NULL, '22023', 'expiry in the past'),
      ('tm_ticket', pg_temp.eot_id('tA'),   gen_random_uuid(),     NULL, NULL, '42501', 'unknown project')
    ) AS x(doc_type, doc_id, project_id, expires, email, expect, label)
  LOOP
    v_state := 'none';
    BEGIN
      PERFORM create_signature_request(r.doc_type, r.doc_id, r.project_id, r.expires, r.email, NULL);
    EXCEPTION WHEN OTHERS THEN
      v_state := SQLSTATE;
    END;
    IF v_state <> r.expect THEN
      PERFORM pg_temp.eot_owner();
      RAISE EXCEPTION 'FAIL: % -> expected %, got %', r.label, r.expect, v_state;
    END IF;
    v_ok := v_ok + 1;
  END LOOP;
  PERFORM pg_temp.eot_owner();

  SELECT count(*) INTO v_after FROM signature_requests WHERE company_id IN (pg_temp.eot_id('cA'), pg_temp.eot_id('cB'));
  IF v_after <> v_before THEN
    RAISE EXCEPTION 'FAIL: refused calls wrote % signature_requests row(s)', v_after - v_before;
  END IF;
  PERFORM pg_temp.eot_pass(format('create_signature_request refuses %s cases (foreign project 42501, foreign/mismatched document, type, draft COR, billed ticket, bad email, past expiry 22023); nothing written', v_ok));
END $$;

-- ------------------------------------------------------------
-- 4. Anon: no email_outbox, no direct writes; the field session
--    creates its own link (reply-to = company owner) and its
--    immediate resend is throttled
-- ------------------------------------------------------------
DO $$
DECLARE
  v_ok  INTEGER := 0;
  v_req JSONB;
  v_o   email_outbox%ROWTYPE;
  v_msg TEXT;
BEGIN
  PERFORM pg_temp.eot_as('anon', NULL, current_setting('eot.fs'));

  BEGIN
    PERFORM count(*) FROM email_outbox;
    RAISE EXCEPTION 'FAIL: anon can SELECT email_outbox';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok + 1;
  END;
  BEGIN
    INSERT INTO email_outbox (company_id, event_type, dedupe_key, to_email)
    VALUES (pg_temp.eot_id('cA'), 'signature_request', 'anon-forged', 'x@example.com');
    RAISE EXCEPTION 'FAIL: anon can INSERT email_outbox';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok + 1;
  END;
  BEGIN
    INSERT INTO signature_requests (document_type, document_id, company_id, project_id, signature_token, recipient_email)
    VALUES ('tm_ticket', pg_temp.eot_id('tA'), pg_temp.eot_id('cA'), pg_temp.eot_id('pA'), 'sig_eot_forged01', 'victim@example.com');
    RAISE EXCEPTION 'FAIL: anon (field session) can INSERT signature_requests';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok + 1;
  END;
  BEGIN
    UPDATE signature_requests SET resend_requested_at = now();
    RAISE EXCEPTION 'FAIL: anon (field session) can UPDATE signature_requests';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok + 1;
  END;
  BEGIN
    INSERT INTO signatures (signature_request_id, signature_slot, signature_image, signer_name)
    VALUES (pg_temp.eot_id('reqA'), 1, pg_temp.eot_png(), 'Forged');
    RAISE EXCEPTION 'FAIL: anon can INSERT signatures';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok + 1;
  END;

  -- Field "Email signing link" (ReviewStep)
  v_req := create_signature_request('tm_ticket', pg_temp.eot_id('tA'), pg_temp.eot_id('pA'),
                                    NULL, 'gc.field@example.com', 'Field GC');

  -- Immediate resend from the field: throttled by the guard
  BEGIN
    PERFORM resend_signature_request((v_req->>'id')::uuid);
    RAISE EXCEPTION 'FAIL: immediate field resend was not throttled';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'Please wait a few minutes before resending' THEN
      RAISE;
    END IF;
    v_ok := v_ok + 1;
  END;
  PERFORM pg_temp.eot_owner();

  IF v_req->>'created_by' IS NOT NULL OR v_req->>'company_id' <> pg_temp.eot_id('cA')::text THEN
    RAISE EXCEPTION 'FAIL: field request row unexpected: %', v_req;
  END IF;
  SELECT * INTO v_o FROM email_outbox WHERE signature_request_id = (v_req->>'id')::uuid;
  IF NOT FOUND OR v_o.dedupe_key <> 'sigreq:' || (v_req->>'id') || ':0'
     OR v_o.reply_to IS DISTINCT FROM 'owner.' || current_setting('eot.sfx') || '@example.com' THEN
    RAISE EXCEPTION 'FAIL: field request outbox row unexpected: %', to_jsonb(v_o);
  END IF;
  IF (SELECT count(*) FROM email_outbox WHERE signature_request_id = (v_req->>'id')::uuid) <> 1 THEN
    RAISE EXCEPTION 'FAIL: the throttled resend queued a row';
  END IF;

  PERFORM set_config('eot.reqF', v_req->>'id', true);
  PERFORM set_config('eot.tokF', v_req->>'signature_token', true);
  PERFORM pg_temp.eot_pass(format('anon: %s refusals (email_outbox SELECT/INSERT, signature_requests INSERT/UPDATE, signatures INSERT, throttled resend); field session link queued with reply-to = owner', v_ok));
END $$;

-- ------------------------------------------------------------
-- 5. RLS on email_outbox: each company sees only its own rows
-- ------------------------------------------------------------
DO $$
DECLARE
  v_reqB JSONB;
  v_a_as_o1 INTEGER;
  v_b_as_o1 INTEGER;
  v_a_as_mb INTEGER;
  v_b_as_mb INTEGER;
  v_a_total INTEGER;
  v_embed   INTEGER;
  v_ok INTEGER := 0;
BEGIN
  PERFORM pg_temp.eot_as('authenticated', pg_temp.eot_id('mB'), NULL);
  v_reqB := create_signature_request('tm_ticket', pg_temp.eot_id('tB'), pg_temp.eot_id('pB'),
                                     NULL, 'gc.b@example.com', NULL);
  SELECT count(*) INTO v_a_as_mb FROM email_outbox WHERE company_id = pg_temp.eot_id('cA');
  SELECT count(*) INTO v_b_as_mb FROM email_outbox WHERE company_id = pg_temp.eot_id('cB');
  BEGIN
    UPDATE email_outbox SET status = 'sent';
    RAISE EXCEPTION 'FAIL: authenticated can UPDATE email_outbox';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok + 1;
  END;
  BEGIN
    DELETE FROM email_outbox;
    RAISE EXCEPTION 'FAIL: authenticated can DELETE email_outbox';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok + 1;
  END;
  PERFORM pg_temp.eot_owner();

  PERFORM pg_temp.eot_as('authenticated', pg_temp.eot_id('o1'), NULL);
  SELECT count(*) INTO v_a_as_o1 FROM email_outbox WHERE company_id = pg_temp.eot_id('cA');
  SELECT count(*) INTO v_b_as_o1 FROM email_outbox WHERE company_id = pg_temp.eot_id('cB');
  -- the client's embed: signature_requests -> email_outbox
  SELECT count(*) INTO v_embed
  FROM signature_requests sr JOIN email_outbox o ON o.signature_request_id = sr.id
  WHERE sr.id = pg_temp.eot_id('reqA');
  PERFORM pg_temp.eot_owner();

  SELECT count(*) INTO v_a_total FROM email_outbox WHERE company_id = pg_temp.eot_id('cA');
  IF v_a_total < 2 OR v_a_as_o1 <> v_a_total OR v_b_as_o1 <> 0 OR v_a_as_mb <> 0 OR v_b_as_mb <> 1 OR v_embed <> 1 OR v_ok <> 2 THEN
    RAISE EXCEPTION 'FAIL: RLS counts A-as-A=%/% B-as-A=% A-as-B=% B-as-B=% embed=% writes-refused=%',
      v_a_as_o1, v_a_total, v_b_as_o1, v_a_as_mb, v_b_as_mb, v_embed, v_ok;
  END IF;
  PERFORM pg_temp.eot_pass('email_outbox RLS: members see only their company''s rows (and the signature_requests embed); no UPDATE/DELETE');
END $$;

-- ------------------------------------------------------------
-- 6. Guard trigger as an authenticated member (FOR ALL policy)
-- ------------------------------------------------------------
DO $$
DECLARE
  v_ok  INTEGER := 0;
  v_msg TEXT;
  v_st  TEXT;
  v_id  UUID := pg_temp.eot_id('reqA');
  v_row JSONB;
  v_n   INTEGER;
  v_epoch TEXT;
BEGIN
  PERFORM pg_temp.eot_as('authenticated', pg_temp.eot_id('o1'), NULL);

  BEGIN
    UPDATE signature_requests SET recipient_email = 'attacker@example.com' WHERE id = v_id;
    RAISE EXCEPTION 'FAIL: recipient_email changed';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'Recipient cannot be changed' THEN RAISE; END IF;
    v_ok := v_ok + 1;
  END;
  BEGIN
    UPDATE signature_requests SET recipient_name = 'Someone Else' WHERE id = v_id;
    RAISE EXCEPTION 'FAIL: recipient_name changed';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'Recipient cannot be changed' THEN RAISE; END IF;
    v_ok := v_ok + 1;
  END;
  BEGIN
    UPDATE signature_requests SET sent_at = now() WHERE id = v_id;
    RAISE EXCEPTION 'FAIL: sent_at writable by authenticated';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok + 1;
  END;
  BEGIN
    UPDATE signature_requests SET last_sent_at = now() WHERE id = v_id;
    RAISE EXCEPTION 'FAIL: last_sent_at writable by authenticated';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok + 1;
  END;
  BEGIN
    UPDATE signature_requests SET send_count = 99 WHERE id = v_id;
    RAISE EXCEPTION 'FAIL: send_count writable by authenticated';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok + 1;
  END;
  BEGIN
    UPDATE signature_requests SET document_id = pg_temp.eot_id('corD') WHERE id = v_id;
    RAISE EXCEPTION 'FAIL: request re-pointed to another document';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok + 1;
  END;
  BEGIN
    INSERT INTO signature_requests (document_type, document_id, company_id, project_id, signature_token, send_count)
    VALUES ('cor', pg_temp.eot_id('corA'), pg_temp.eot_id('cA'), pg_temp.eot_id('pA'), 'sig_eot_sendcount', 3);
    RAISE EXCEPTION 'FAIL: authenticated inserted a request with send_count';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok + 1;
  END;
  -- direct resend bump right after creation: throttled
  BEGIN
    UPDATE signature_requests SET resend_requested_at = now() WHERE id = v_id;
    RAISE EXCEPTION 'FAIL: immediate resend not throttled';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'Please wait a few minutes before resending' THEN RAISE; END IF;
    v_ok := v_ok + 1;
  END;
  -- a back-dated bump is refused
  BEGIN
    UPDATE signature_requests SET resend_requested_at = now() - interval '1 hour' WHERE id = v_id;
    RAISE EXCEPTION 'FAIL: back-dated resend_requested_at accepted';
  EXCEPTION WHEN invalid_parameter_value THEN v_ok := v_ok + 1;
  END;
  -- nothing else is writable by a member: created_at (throttle bypass),
  -- expires_at, view_count, a status other than 'revoked'
  BEGIN
    UPDATE signature_requests SET created_at = now() - interval '1 day' WHERE id = v_id;
    RAISE EXCEPTION 'FAIL: created_at writable by authenticated';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok + 1;
  END;
  BEGIN
    UPDATE signature_requests SET expires_at = now() + interval '30 days' WHERE id = v_id;
    RAISE EXCEPTION 'FAIL: expires_at writable by authenticated';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok + 1;
  END;
  BEGIN
    UPDATE signature_requests SET view_count = view_count + 1 WHERE id = v_id;
    RAISE EXCEPTION 'FAIL: view_count writable by authenticated';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok + 1;
  END;
  BEGIN
    UPDATE signature_requests SET status = 'completed' WHERE id = v_id;
    RAISE EXCEPTION 'FAIL: status -> completed writable by authenticated';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok + 1;
  END;
  PERFORM pg_temp.eot_owner();

  -- recipient is immutable for the owner role too
  BEGIN
    UPDATE signature_requests SET recipient_email = 'other@example.com' WHERE id = v_id;
    RAISE EXCEPTION 'FAIL: owner changed recipient_email';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'Recipient cannot be changed' THEN RAISE; END IF;
    v_ok := v_ok + 1;
  END;

  -- 6 minutes later (created_at back-dated by the owner): resend works,
  -- queues sigreq:<id>:<epoch>, and a second resend is throttled
  UPDATE signature_requests SET created_at = now() - interval '6 minutes' WHERE id = v_id;
  PERFORM pg_temp.eot_as('authenticated', pg_temp.eot_id('o1'), NULL);
  v_row := resend_signature_request(v_id);
  BEGIN
    PERFORM resend_signature_request(v_id);
    RAISE EXCEPTION 'FAIL: second resend within 5 minutes not throttled';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'Please wait a few minutes before resending' THEN RAISE; END IF;
    v_ok := v_ok + 1;
  END;
  PERFORM pg_temp.eot_owner();

  v_epoch := floor(extract(epoch FROM (v_row->>'resend_requested_at')::timestamptz))::bigint::text;
  SELECT count(*) INTO v_n FROM email_outbox WHERE signature_request_id = v_id;
  IF v_n <> 2
     OR NOT EXISTS (SELECT 1 FROM email_outbox WHERE dedupe_key = 'sigreq:' || v_id || ':' || v_epoch AND status = 'pending')
     OR (v_row->>'resend_requested_at')::timestamptz NOT BETWEEN now() AND clock_timestamp() THEN
    RAISE EXCEPTION 'FAIL: resend did not queue sigreq:%:% (rows for request: %)', v_id, v_epoch, v_n;
  END IF;
  IF pg_temp.eot_dispatches((SELECT id FROM email_outbox WHERE dedupe_key = 'sigreq:' || v_id || ':' || v_epoch)) = 0 THEN
    RAISE EXCEPTION 'FAIL: resend row was not dispatched';
  END IF;

  IF v_ok <> 15 THEN
    RAISE EXCEPTION 'FAIL: expected 15 guard refusals, got %', v_ok;
  END IF;
  PERFORM set_config('eot.outA2', (SELECT id FROM email_outbox WHERE dedupe_key = 'sigreq:' || v_id || ':' || v_epoch)::text, true);
  PERFORM pg_temp.eot_pass('guard: recipient immutable (all roles); sent_at/last_sent_at/send_count, re-pointing, created_at, expires_at, view_count and status other than revoked refused to authenticated; resend throttled / back-dated refused; resend after 5 min queues sigreq:<id>:<epoch>');
END $$;

-- ------------------------------------------------------------
-- 7. Resend pre-checks: revoked / expired / no recipient
-- ------------------------------------------------------------
DO $$
DECLARE
  v_plain JSONB;
  v_exp   JSONB;
  v_state TEXT;
  v_msg   TEXT;
  v_ok    INTEGER := 0;
BEGIN
  PERFORM pg_temp.eot_as('authenticated', pg_temp.eot_id('o1'), NULL);
  v_plain := create_signature_request('tm_ticket', pg_temp.eot_id('tS2'), pg_temp.eot_id('pA'), NULL, NULL, 'ignored without email');
  v_exp := create_signature_request('tm_ticket', pg_temp.eot_id('tS3'), pg_temp.eot_id('pA'), now() + interval '1 hour', 'exp@example.com', NULL);
  PERFORM pg_temp.eot_owner();

  IF v_plain->>'recipient_name' IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: recipient_name stored without an email';
  END IF;
  IF EXISTS (SELECT 1 FROM email_outbox WHERE signature_request_id = (v_plain->>'id')::uuid) THEN
    RAISE EXCEPTION 'FAIL: a link without recipient queued an email';
  END IF;

  UPDATE signature_requests SET expires_at = now() - interval '1 minute', created_at = now() - interval '1 hour'
  WHERE id = (v_exp->>'id')::uuid;

  PERFORM pg_temp.eot_as('authenticated', pg_temp.eot_id('o1'), NULL);
  BEGIN
    PERFORM resend_signature_request((v_plain->>'id')::uuid);
  EXCEPTION WHEN invalid_parameter_value THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg = 'This signature link has no recipient email' THEN v_ok := v_ok + 1; END IF;
  END;
  BEGIN
    PERFORM resend_signature_request((v_exp->>'id')::uuid);
  EXCEPTION WHEN invalid_parameter_value THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg = 'This signature link has expired' THEN v_ok := v_ok + 1; END IF;
  END;
  UPDATE signature_requests SET status = 'revoked' WHERE id = (v_exp->>'id')::uuid;
  BEGIN
    PERFORM resend_signature_request((v_exp->>'id')::uuid);
  EXCEPTION WHEN invalid_parameter_value THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg = 'This signature link is no longer open' THEN v_ok := v_ok + 1; END IF;
  END;
  -- another company's member cannot resend A's request
  PERFORM pg_temp.eot_as('authenticated', pg_temp.eot_id('mB'), NULL);
  v_state := 'none';
  BEGIN
    PERFORM resend_signature_request(pg_temp.eot_id('reqA'));
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  IF v_state = '42501' THEN v_ok := v_ok + 1; END IF;
  PERFORM pg_temp.eot_owner();

  IF v_ok <> 4 THEN
    RAISE EXCEPTION 'FAIL: expected 4 resend refusals (no recipient / expired / revoked / foreign 42501), got %', v_ok;
  END IF;
  PERFORM set_config('eot.reqExp', v_exp->>'id', true);
  PERFORM pg_temp.eot_pass('resend refused with readable 22023 messages (no recipient / expired / revoked) and 42501 for another company; a link without email queues nothing');
END $$;

-- ------------------------------------------------------------
-- 8. Signed emails: per-type recipients
--    S1 no preference rows       -> all active members (creator once)
--    S2 office2 has 'signature'  -> office2 + creator (office1)
--    S3 rows exist, none lists 'signature' -> all active members
--    S4 office2 has 'signature', field-created -> office2 + owner
-- ------------------------------------------------------------
DO $$
DECLARE
  v_sfx TEXT := current_setting('eot.sfx');
  v_o1e TEXT := 'office1.' || current_setting('eot.sfx') || '@example.com';
  v_o2e TEXT := 'office2.' || current_setting('eot.sfx') || '@example.com';
  v_owe TEXT := 'owner.'   || current_setting('eot.sfx') || '@example.com';
  v_req JSONB;
  v_res JSONB;
  v_got TEXT[];
  v_sig UUID;
  r RECORD;
BEGIN
  DELETE FROM notification_preferences WHERE project_id = pg_temp.eot_id('pA');

  FOR r IN SELECT * FROM (VALUES
      (1, 'cor',       'corA', 'o1',  NULL::text[],                ARRAY[v_o1e, v_o2e, v_owe]),
      (2, 'tm_ticket', 'tS2',  'o1',  ARRAY['signature'],          ARRAY[v_o1e, v_o2e]),
      (3, 'tm_ticket', 'tS3',  'o1',  ARRAY['tm_ticket','message'], ARRAY[v_o1e, v_o2e, v_owe]),
      (4, 'tm_ticket', 'tS4',  NULL,  ARRAY['signature'],          ARRAY[v_o2e, v_owe])
    ) AS x(n, doc_type, doc, creator, o2_types, expect)
  LOOP
    DELETE FROM notification_preferences WHERE project_id = pg_temp.eot_id('pA');
    IF r.o2_types IS NOT NULL THEN
      INSERT INTO notification_preferences (project_id, user_id, notification_types)
      VALUES (pg_temp.eot_id('pA'), pg_temp.eot_id('o2'), r.o2_types),
             -- the inactive member opting in must still get nothing
             (pg_temp.eot_id('pA'), pg_temp.eot_id('in'), r.o2_types);
    END IF;

    IF r.creator IS NULL THEN
      PERFORM pg_temp.eot_as('anon', NULL, current_setting('eot.fs'));
    ELSE
      PERFORM pg_temp.eot_as('authenticated', pg_temp.eot_id(r.creator), NULL);
    END IF;
    v_req := create_signature_request(r.doc_type, pg_temp.eot_id(r.doc), pg_temp.eot_id('pA'), NULL, NULL, NULL);

    -- the outside signer: anon, token only
    PERFORM pg_temp.eot_as('anon', NULL, NULL);
    v_res := public_add_signature(v_req->>'signature_token', 1,
      jsonb_build_object('signature', pg_temp.eot_png(), 'signerName', 'Greg Signer',
                         'signerTitle', 'PM', 'signerCompany', 'GC Builders'));
    PERFORM pg_temp.eot_owner();

    v_sig := (v_res->'signature'->>'id')::uuid;
    SELECT array_agg(o.to_email ORDER BY o.to_email) INTO v_got
    FROM email_outbox o
    WHERE o.event_type = 'document_signed' AND o.payload->>'signature_id' = v_sig::text;

    IF v_got IS DISTINCT FROM (SELECT array_agg(e ORDER BY e) FROM unnest(r.expect) e) THEN
      RAISE EXCEPTION 'FAIL: S% recipients % (expected %)', r.n, v_got, r.expect;
    END IF;
    IF EXISTS (SELECT 1 FROM email_outbox o
               WHERE o.event_type = 'document_signed' AND o.payload->>'signature_id' = v_sig::text
                 AND (o.dedupe_key <> 'signed:' || v_sig || ':' || o.to_email
                      OR o.signature_request_id <> (v_req->>'id')::uuid
                      OR o.status <> 'pending'
                      OR o.scheduled_for <> now())) THEN
      RAISE EXCEPTION 'FAIL: S% document_signed rows have an unexpected key / request / status', r.n;
    END IF;
    IF r.n = 1 THEN
      PERFORM set_config('eot.sigA', v_sig::text, true);
    END IF;
  END LOOP;

  -- auth.users fallback: office2 has users.email NULL
  IF NOT EXISTS (SELECT 1 FROM email_outbox WHERE event_type = 'document_signed'
                   AND payload->>'signature_id' = current_setting('eot.sigA') AND to_email = v_o2e
                   AND to_name = 'Office Two') THEN
    RAISE EXCEPTION 'FAIL: office2 (no users.email) did not get the auth.users address';
  END IF;
  -- users.email is stored upper-case for office1: normalised
  IF EXISTS (SELECT 1 FROM email_outbox WHERE company_id = pg_temp.eot_id('cA') AND to_email <> lower(to_email)) THEN
    RAISE EXCEPTION 'FAIL: an outbox address is not lower-cased';
  END IF;
  -- company B never receives A's mail
  IF EXISTS (SELECT 1 FROM email_outbox WHERE company_id = pg_temp.eot_id('cA')
               AND to_email = 'memberb.' || v_sfx || '@example.com') THEN
    RAISE EXCEPTION 'FAIL: a company B member received company A email';
  END IF;

  PERFORM pg_temp.eot_pass('document_signed recipients: fallback to all active members, preference filter + creator, type-mismatch fallback, preference + owner for field-created; auth.users.email fallback; inactive / other company excluded');
END $$;

-- ------------------------------------------------------------
-- 9. Field ticket submitted -> office, 3 minutes later; office
--    insert -> nothing; offline replay -> nothing new
-- ------------------------------------------------------------
DO $$
DECLARE
  v_o1e TEXT := 'office1.' || current_setting('eot.sfx') || '@example.com';
  v_o2e TEXT := 'office2.' || current_setting('eot.sfx') || '@example.com';
  v_owe TEXT := 'owner.'   || current_setting('eot.sfx') || '@example.com';
  v_csid UUID := gen_random_uuid();
  v_t1 JSONB;
  v_t2 JSONB;
  v_t3 JSONB;
  v_rep JSONB;
  v_got TEXT[];
  v_payload JSONB;
BEGIN
  DELETE FROM notification_preferences WHERE project_id = pg_temp.eot_id('pA');

  v_payload := jsonb_build_object(
    'project_id', pg_temp.eot_id('pA'),
    'client_submission_id', v_csid,
    'work_date', '2026-11-04',
    'ce_pco_number', 'CE-77',
    'notes', 'Hand dig at gas line',
    'created_by_name', 'Field Foreman',
    'workers', jsonb_build_array(
      jsonb_build_object('name', 'Carl Crew', 'role', 'Foreman', 'hours', 8, 'overtime_hours', 2),
      jsonb_build_object('name', 'Dana Crew', 'role', 'Laborer', 'hours', 7.5)),
    'items', jsonb_build_array(jsonb_build_object('custom_name', 'Shoring', 'quantity', 2)));

  PERFORM pg_temp.eot_as('anon', NULL, current_setting('eot.fs'));
  v_t1 := create_tm_ticket_full(v_payload);
  -- offline replay of the same submission
  v_rep := create_tm_ticket_full(v_payload);
  PERFORM pg_temp.eot_owner();

  IF (v_rep->>'replayed')::boolean IS NOT TRUE OR v_rep->>'id' <> v_t1->>'id' THEN
    RAISE EXCEPTION 'FAIL: replay did not return the original ticket';
  END IF;

  SELECT array_agg(o.to_email ORDER BY o.to_email) INTO v_got
  FROM email_outbox o WHERE o.event_type = 'tm_ticket_submitted' AND o.payload->>'ticket_id' = v_t1->>'id';
  IF v_got IS DISTINCT FROM (SELECT array_agg(e ORDER BY e) FROM unnest(ARRAY[v_o1e, v_o2e, v_owe]) e) THEN
    RAISE EXCEPTION 'FAIL: field ticket recipients % (expected all three active members)', v_got;
  END IF;
  IF EXISTS (SELECT 1 FROM email_outbox o
             WHERE o.event_type = 'tm_ticket_submitted' AND o.payload->>'ticket_id' = v_t1->>'id'
               AND (o.scheduled_for <> now() + interval '3 minutes'
                    OR o.status <> 'pending'
                    OR o.dedupe_key <> 'tm_submitted:' || (v_t1->>'id') || ':' || o.to_email
                    OR o.signature_request_id IS NOT NULL
                    OR pg_temp.eot_dispatches(o.id) <> 0)) THEN
    RAISE EXCEPTION 'FAIL: field ticket rows must be pending, +3 min, keyed tm_submitted:<ticket>:<email>, not dispatched yet';
  END IF;
  IF EXISTS (SELECT 1 FROM email_outbox_due(100) d JOIN email_outbox o ON o.id = d
             WHERE o.payload->>'ticket_id' = v_t1->>'id') THEN
    RAISE EXCEPTION 'FAIL: a delayed row is already due';
  END IF;

  -- preferences: only the owner wants 'tm_ticket'
  INSERT INTO notification_preferences (project_id, user_id, notification_types)
  VALUES (pg_temp.eot_id('pA'), pg_temp.eot_id('ow'), ARRAY['tm_ticket']),
         (pg_temp.eot_id('pA'), pg_temp.eot_id('o1'), ARRAY['message']);
  PERFORM pg_temp.eot_as('anon', NULL, current_setting('eot.fs'));
  v_t2 := create_tm_ticket_full(v_payload || jsonb_build_object('client_submission_id', gen_random_uuid()));
  PERFORM pg_temp.eot_owner();
  SELECT array_agg(o.to_email ORDER BY o.to_email) INTO v_got
  FROM email_outbox o WHERE o.event_type = 'tm_ticket_submitted' AND o.payload->>'ticket_id' = v_t2->>'id';
  IF v_got IS DISTINCT FROM ARRAY[v_owe] THEN
    RAISE EXCEPTION 'FAIL: with tm_ticket preferences expected only the owner, got %', v_got;
  END IF;

  -- an office user creating a ticket sends nothing
  PERFORM pg_temp.eot_as('authenticated', pg_temp.eot_id('o1'), NULL);
  v_t3 := create_tm_ticket_full(v_payload || jsonb_build_object('client_submission_id', gen_random_uuid()));
  PERFORM pg_temp.eot_owner();
  IF EXISTS (SELECT 1 FROM email_outbox o WHERE o.payload->>'ticket_id' = v_t3->>'id') THEN
    RAISE EXCEPTION 'FAIL: an office-created ticket queued an email';
  END IF;

  PERFORM set_config('eot.tF', v_t1->>'id', true);
  PERFORM pg_temp.eot_pass('field ticket (create_tm_ticket_full as anon): one row per recipient, +3 min, not dispatched; replay adds nothing; tm_ticket preferences honoured; office-created ticket sends nothing');
END $$;

-- ------------------------------------------------------------
-- 10. Token RPC no longer exposes recipient / sender bookkeeping
-- ------------------------------------------------------------
DO $$
DECLARE
  v_doc JSONB;
  v_key TEXT;
BEGIN
  PERFORM pg_temp.eot_as('anon', NULL, NULL);
  v_doc := public_get_signature_request_by_token(current_setting('eot.tokF'));
  PERFORM pg_temp.eot_owner();
  IF v_doc IS NULL OR v_doc->>'id' IS NULL OR v_doc->'signatures' IS NULL OR v_doc->>'status' <> 'pending' THEN
    RAISE EXCEPTION 'FAIL: token RPC did not return the open request: %', v_doc;
  END IF;
  FOREACH v_key IN ARRAY ARRAY['recipient_email', 'recipient_name', 'created_by', 'send_count',
                               'sent_at', 'last_sent_at', 'resend_requested_at'] LOOP
    IF v_doc ? v_key THEN
      RAISE EXCEPTION 'FAIL: token RPC exposes %', v_key;
    END IF;
  END LOOP;
  IF position('gc.field@example.com' IN v_doc::text) > 0 THEN
    RAISE EXCEPTION 'FAIL: token RPC output contains the recipient address';
  END IF;
  PERFORM pg_temp.eot_pass('public_get_signature_request_by_token: no recipient_email/recipient_name/created_by/send_count/sent_at/last_sent_at/resend_requested_at');
END $$;

-- ------------------------------------------------------------
-- 11. email_context: shapes, defer, cancel
-- ------------------------------------------------------------
DO $$
DECLARE
  v_ctx JSONB;
  v_cor RECORD;
  v_out UUID;
  v_tid UUID := gen_random_uuid();
  v_hollow_out UUID;
BEGIN
  -- signature_request (COR)
  v_ctx := email_context(pg_temp.eot_id('outA'));
  SELECT cor_number, title, cor_total INTO v_cor FROM change_orders WHERE id = pg_temp.eot_id('corA');
  IF v_ctx->>'event_type' <> 'signature_request'
     OR v_ctx->>'to_email' <> 'gc.person@example.com' OR v_ctx->>'to_name' <> 'Gina GC'
     OR v_ctx->>'reply_to' <> 'office1.' || current_setting('eot.sfx') || '@example.com'
     OR v_ctx->'brand'->>'company_name' <> 'Email Test Co A'
     OR jsonb_typeof(v_ctx->'brand'->'hide_fieldsync_branding') <> 'boolean'
     OR NOT (v_ctx->'brand' ?& ARRAY['company_name', 'logo_url', 'primary_color', 'hide_fieldsync_branding'])
     OR v_ctx->'project' <> jsonb_build_object('name', 'Email Project A', 'job_number', 'EM-A-1')
     OR v_ctx->'document'->>'document_type' <> 'cor'
     OR v_ctx->'document'->>'document_label' <> 'COR ' || v_cor.cor_number || ' — ' || v_cor.title
     OR v_ctx->'document'->>'signature_token' <> current_setting('eot.tokA')
     OR v_ctx->'document'->>'expires_at' IS NULL
     OR v_ctx->'document'->>'requested_by_name' <> 'Office One'
     OR jsonb_typeof(v_ctx->'document'->'cor_total_cents') <> 'number'
     OR (v_ctx->'document'->>'cor_total_cents')::bigint <> v_cor.cor_total
     OR v_cor.cor_total <= 0 THEN
    RAISE EXCEPTION 'FAIL: signature_request context unexpected: %', v_ctx;
  END IF;
  IF to_regclass('public.company_branding') IS NOT NULL
     AND (v_ctx->'brand'->>'logo_url' <> 'https://cdn.example.com/a-logo.png'
          OR v_ctx->'brand'->>'primary_color' <> '#123456'
          OR (v_ctx->'brand'->>'hide_fieldsync_branding')::boolean) THEN
    RAISE EXCEPTION 'FAIL: brand not taken from company_branding: %', v_ctx->'brand';
  END IF;

  -- signature_request (T&M, field-created): label with CE/PCO, requester = ticket creator
  SELECT id INTO v_out FROM email_outbox WHERE signature_request_id = pg_temp.eot_id('reqF') AND event_type = 'signature_request';
  v_ctx := email_context(v_out);
  IF v_ctx->'document'->>'document_label' <> 'T&M ticket 2026-11-03 (CE-12)'
     OR v_ctx->'document'->>'document_type' <> 'tm_ticket'
     OR v_ctx->'document'->>'requested_by_name' <> 'Field Foreman'
     OR v_ctx->'document'->'cor_total_cents' <> 'null'::jsonb
     OR v_ctx->>'reply_to' <> 'owner.' || current_setting('eot.sfx') || '@example.com' THEN
    RAISE EXCEPTION 'FAIL: T&M signature_request context unexpected: %', v_ctx;
  END IF;

  -- document_signed (S1 on the COR; COR is approved by the signature)
  SELECT id INTO v_out FROM email_outbox
  WHERE event_type = 'document_signed' AND payload->>'signature_id' = current_setting('eot.sigA') LIMIT 1;
  v_ctx := email_context(v_out);
  IF v_ctx->>'event_type' <> 'document_signed'
     OR v_ctx->>'reply_to' IS NOT NULL
     OR v_ctx->'document'->>'document_type' <> 'cor'
     OR v_ctx->'document'->>'document_label' <> 'COR ' || v_cor.cor_number || ' — ' || v_cor.title
     OR v_ctx->'document'->>'signer_name' <> 'Greg Signer'
     OR v_ctx->'document'->>'signer_title' <> 'PM'
     OR v_ctx->'document'->>'signer_company' <> 'GC Builders'
     OR v_ctx->'document'->>'signed_at' IS NULL
     OR v_ctx->'document'->>'document_status' <> 'approved' THEN
    RAISE EXCEPTION 'FAIL: document_signed context unexpected: %', v_ctx;
  END IF;

  -- tm_ticket_submitted: workers in entry order, counts
  SELECT id INTO v_out FROM email_outbox
  WHERE event_type = 'tm_ticket_submitted' AND payload->>'ticket_id' = current_setting('eot.tF') LIMIT 1;
  v_ctx := email_context(v_out);
  IF v_ctx->>'event_type' <> 'tm_ticket_submitted'
     OR v_ctx->'document'->>'ticket_id' <> current_setting('eot.tF')
     OR v_ctx->'document'->>'work_date' <> '2026-11-04'
     OR v_ctx->'document'->>'ce_pco_number' <> 'CE-77'
     OR v_ctx->'document'->>'notes' <> 'Hand dig at gas line'
     OR v_ctx->'document'->>'created_by_name' <> 'Field Foreman'
     OR jsonb_array_length(v_ctx->'document'->'workers') <> 2
     OR v_ctx->'document'->'workers'->0->>'name' <> 'Carl Crew'
     OR v_ctx->'document'->'workers'->0->>'role' <> 'Foreman'
     OR (v_ctx->'document'->'workers'->0->>'hours')::numeric <> 8
     OR (v_ctx->'document'->'workers'->0->>'overtime_hours')::numeric <> 2
     OR v_ctx->'document'->'workers'->1->>'name' <> 'Dana Crew'
     OR (v_ctx->'document'->'workers'->1->>'overtime_hours')::numeric <> 0
     OR (v_ctx->'document'->>'item_count')::int <> 1
     OR (v_ctx->'document'->>'photo_count')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL: tm_ticket_submitted context unexpected: %', v_ctx;
  END IF;

  -- defer: a legacy field insert (ticket first, workers later) has no crew yet
  PERFORM pg_temp.eot_as('anon', NULL, current_setting('eot.fs'));
  INSERT INTO t_and_m_tickets (id, project_id, work_date, status, created_by_name)
  VALUES (v_tid, pg_temp.eot_id('pA'), CURRENT_DATE, 'pending', 'Legacy Foreman');
  PERFORM pg_temp.eot_owner();
  SELECT id INTO v_hollow_out FROM email_outbox
  WHERE event_type = 'tm_ticket_submitted' AND payload->>'ticket_id' = v_tid::text LIMIT 1;
  IF v_hollow_out IS NULL THEN
    RAISE EXCEPTION 'FAIL: legacy direct field insert queued nothing';
  END IF;
  IF email_context(v_hollow_out) <> '{"defer": true}'::jsonb THEN
    RAISE EXCEPTION 'FAIL: ticket without workers (< 30 min) should defer, got %', email_context(v_hollow_out);
  END IF;
  -- older than 30 minutes: sent as is (empty crew list)
  UPDATE t_and_m_tickets SET created_at = now() - interval '31 minutes' WHERE id = v_tid;
  v_ctx := email_context(v_hollow_out);
  IF v_ctx ? 'defer' OR v_ctx->'document'->'workers' <> '[]'::jsonb THEN
    RAISE EXCEPTION 'FAIL: ticket without workers (> 30 min) should render with no workers, got %', v_ctx;
  END IF;
  -- ticket gone -> cancel
  DELETE FROM t_and_m_tickets WHERE id = v_tid;
  IF email_context(v_hollow_out) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: deleted ticket should cancel (NULL)';
  END IF;

  -- request expired / revoked -> cancel; unknown id -> NULL
  SELECT id INTO v_out FROM email_outbox WHERE signature_request_id = pg_temp.eot_id('reqExp') AND event_type = 'signature_request';
  IF email_context(v_out) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: revoked request should cancel (NULL)';
  END IF;
  UPDATE signature_requests SET expires_at = now() - interval '1 second' WHERE id = pg_temp.eot_id('reqF');
  IF email_context((SELECT id FROM email_outbox WHERE signature_request_id = pg_temp.eot_id('reqF') AND event_type = 'signature_request')) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: expired request should cancel (NULL)';
  END IF;
  UPDATE signature_requests SET expires_at = NULL WHERE id = pg_temp.eot_id('reqF');
  IF email_context(gen_random_uuid()) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: unknown outbox id should give NULL';
  END IF;

  -- white-label flag
  IF to_regclass('public.company_branding') IS NOT NULL THEN
    EXECUTE 'UPDATE company_branding SET hide_fieldsync_branding = true WHERE company_id = $1' USING pg_temp.eot_id('cA');
    IF (email_context(pg_temp.eot_id('outA'))->'brand'->>'hide_fieldsync_branding')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'FAIL: hide_fieldsync_branding not reported';
    END IF;
    EXECUTE 'UPDATE company_branding SET hide_fieldsync_branding = false WHERE company_id = $1' USING pg_temp.eot_id('cA');
  END IF;

  PERFORM pg_temp.eot_pass('email_context: COR / T&M signature_request, document_signed and tm_ticket_submitted shapes (labels, cents, workers order, counts, brand); defer < 30 min without workers; cancel when ticket gone / request revoked or expired');
END $$;

-- ------------------------------------------------------------
-- 12. Worker: claim once, stuck reclaim, backoff, dead, sent side
--     effects, late reports
-- ------------------------------------------------------------
DO $$
DECLARE
  v_a   UUID := pg_temp.eot_id('outA');
  v_c   JSONB;
  v_o   email_outbox%ROWTYPE;
  v_req signature_requests%ROWTYPE;
  v_x   UUID;
  v_i   INTEGER;
  v_exp INTERVAL[] := ARRAY[interval '1 minute', interval '5 minutes', interval '30 minutes', interval '2 hours'];
  v_state TEXT;
  v_log DATE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM email_outbox_due(100) d WHERE d = v_a) THEN
    RAISE EXCEPTION 'FAIL: pending row not listed by email_outbox_due';
  END IF;

  -- claim once, NULL twice
  v_c := claim_email_outbox(v_a);
  IF v_c IS NULL OR v_c->>'status' <> 'sending' OR (v_c->>'attempts')::int <> 1 OR v_c->>'locked_at' IS NULL
     OR v_c->>'id' <> v_a::text THEN
    RAISE EXCEPTION 'FAIL: first claim unexpected: %', v_c;
  END IF;
  IF claim_email_outbox(v_a) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: second claim of a sending row succeeded';
  END IF;
  IF EXISTS (SELECT 1 FROM email_outbox_due(100) d WHERE d = v_a) THEN
    RAISE EXCEPTION 'FAIL: a freshly claimed row is still due';
  END IF;
  IF claim_email_outbox(gen_random_uuid()) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: unknown id claimed';
  END IF;

  -- stuck: locked 11 minutes ago -> due and reclaimable
  UPDATE email_outbox SET locked_at = now() - interval '11 minutes' WHERE id = v_a;
  IF NOT EXISTS (SELECT 1 FROM email_outbox_due(100) d WHERE d = v_a) THEN
    RAISE EXCEPTION 'FAIL: stuck sending row not due';
  END IF;
  v_c := claim_email_outbox(v_a);
  IF v_c IS NULL OR (v_c->>'attempts')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL: stuck row not reclaimed: %', v_c;
  END IF;

  -- sent: side effects on the request and the COR log
  PERFORM mark_email_outbox(v_a, 'sent', 're_msg_123', NULL);
  SELECT * INTO v_o FROM email_outbox WHERE id = v_a;
  SELECT * INTO v_req FROM signature_requests WHERE id = pg_temp.eot_id('reqA');
  IF v_o.status <> 'sent' OR v_o.provider_message_id <> 're_msg_123' OR v_o.sent_at IS NULL OR v_o.locked_at IS NOT NULL
     OR v_req.sent_at IS NULL OR v_req.last_sent_at IS NULL OR v_req.send_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: sent side effects: outbox % / request sent_at % last_sent_at % send_count %',
      to_jsonb(v_o), v_req.sent_at, v_req.last_sent_at, v_req.send_count;
  END IF;
  IF to_regclass('public.cor_log_entries') IS NOT NULL THEN
    EXECUTE 'SELECT date_sent_to_client FROM cor_log_entries WHERE change_order_id = $1' INTO v_log USING pg_temp.eot_id('corA');
    IF v_log IS DISTINCT FROM CURRENT_DATE THEN
      RAISE EXCEPTION 'FAIL: cor_log_entries.date_sent_to_client = % (expected today)', v_log;
    END IF;
  END IF;
  -- late / duplicate reports never change a sent row
  PERFORM mark_email_outbox(v_a, 'sent', 're_msg_dup', NULL);
  PERFORM mark_email_outbox(v_a, 'failed', NULL, 'late failure');
  SELECT * INTO v_o FROM email_outbox WHERE id = v_a;
  SELECT * INTO v_req FROM signature_requests WHERE id = pg_temp.eot_id('reqA');
  IF v_o.status <> 'sent' OR v_o.provider_message_id <> 're_msg_123' OR v_req.send_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: a sent row was changed by a late report';
  END IF;
  IF claim_email_outbox(v_a) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: a sent row was claimable';
  END IF;

  -- the resend row: idempotent replay is recorded as sent with a note
  v_x := pg_temp.eot_id('outA2');
  PERFORM claim_email_outbox(v_x);
  PERFORM mark_email_outbox(v_x, 'sent', NULL, 'idempotent_replay');
  SELECT * INTO v_o FROM email_outbox WHERE id = v_x;
  SELECT * INTO v_req FROM signature_requests WHERE id = pg_temp.eot_id('reqA');
  IF v_o.status <> 'sent' OR v_o.last_error <> 'idempotent_replay' OR v_req.send_count <> 2
     OR v_req.last_sent_at < v_req.sent_at THEN
    RAISE EXCEPTION 'FAIL: second send: status % note % send_count %', v_o.status, v_o.last_error, v_req.send_count;
  END IF;

  -- backoff 1 min / 5 min / 30 min / 2 h, then dead at attempt 5
  SELECT id INTO v_x FROM email_outbox
  WHERE event_type = 'document_signed' AND payload->>'signature_id' = current_setting('eot.sigA') LIMIT 1;
  FOR v_i IN 1..5 LOOP
    UPDATE email_outbox SET scheduled_for = now() WHERE id = v_x;
    v_c := claim_email_outbox(v_x);
    IF v_c IS NULL OR (v_c->>'attempts')::int <> v_i THEN
      RAISE EXCEPTION 'FAIL: attempt % not claimable: %', v_i, v_c;
    END IF;
    PERFORM mark_email_outbox(v_x, 'failed', NULL, 'resend 500 #' || v_i);
    SELECT * INTO v_o FROM email_outbox WHERE id = v_x;
    IF v_i < 5 AND (v_o.status <> 'failed' OR v_o.scheduled_for <> now() + v_exp[v_i]
                    OR v_o.last_error <> 'resend 500 #' || v_i OR v_o.locked_at IS NOT NULL) THEN
      RAISE EXCEPTION 'FAIL: after failure % expected failed at +%, got % at %', v_i, v_exp[v_i], v_o.status, v_o.scheduled_for - now();
    END IF;
    IF v_i < 5 AND claim_email_outbox(v_x) IS NOT NULL THEN
      RAISE EXCEPTION 'FAIL: a failed row was claimable before its backoff elapsed';
    END IF;
  END LOOP;
  IF v_o.status <> 'dead' OR v_o.attempts <> 5 THEN
    RAISE EXCEPTION 'FAIL: 5th failure should be dead, got % (attempts %)', v_o.status, v_o.attempts;
  END IF;
  UPDATE email_outbox SET scheduled_for = now() - interval '1 day' WHERE id = v_x;
  IF claim_email_outbox(v_x) IS NOT NULL OR EXISTS (SELECT 1 FROM email_outbox_due(100) d WHERE d = v_x) THEN
    RAISE EXCEPTION 'FAIL: a dead row is claimable / due';
  END IF;

  -- dead / cancelled directly; bad status
  SELECT id INTO v_x FROM email_outbox
  WHERE event_type = 'document_signed' AND payload->>'signature_id' = current_setting('eot.sigA') AND status = 'pending' LIMIT 1;
  PERFORM claim_email_outbox(v_x);
  PERFORM mark_email_outbox(v_x, 'dead', NULL, '422 validation_error');
  IF (SELECT status FROM email_outbox WHERE id = v_x) <> 'dead' THEN
    RAISE EXCEPTION 'FAIL: mark dead';
  END IF;
  SELECT id INTO v_x FROM email_outbox
  WHERE event_type = 'document_signed' AND payload->>'signature_id' = current_setting('eot.sigA') AND status = 'pending' LIMIT 1;
  PERFORM claim_email_outbox(v_x);
  PERFORM mark_email_outbox(v_x, 'cancelled');
  IF (SELECT status FROM email_outbox WHERE id = v_x) <> 'cancelled' THEN
    RAISE EXCEPTION 'FAIL: mark cancelled';
  END IF;
  v_state := 'none';
  BEGIN
    PERFORM mark_email_outbox(v_x, 'bogus');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  IF v_state <> '22023' THEN
    RAISE EXCEPTION 'FAIL: mark_email_outbox with a bad status -> % (expected 22023)', v_state;
  END IF;

  PERFORM pg_temp.eot_pass('worker: due/claim once/NULL twice, stuck (>10 min) reclaim, sent stamps sent_at/last_sent_at/send_count + COR log date, late reports ignored, idempotent_replay note, backoff 1m/5m/30m/2h then dead, dead/cancelled, bad status 22023');
END $$;

-- ------------------------------------------------------------
-- 13. Sweep: retires a row stuck on its last attempt and wakes the
--     worker with {"drain": true} when anything is due
-- ------------------------------------------------------------
DO $$
DECLARE
  v_x UUID;
  v_due INTEGER;
  v_before INTEGER;
  v_after INTEGER;
BEGIN
  SELECT id INTO v_x FROM email_outbox
  WHERE event_type = 'tm_ticket_submitted' AND payload->>'ticket_id' = current_setting('eot.tF') LIMIT 1;
  UPDATE email_outbox SET status = 'sending', attempts = 5, locked_at = now() - interval '11 minutes' WHERE id = v_x;

  IF to_regclass('net.http_request_queue') IS NOT NULL THEN
    EXECUTE $q$SELECT count(*) FROM net.http_request_queue WHERE convert_from(body, 'UTF8')::jsonb = '{"drain": true}'::jsonb$q$ INTO v_before;
  END IF;
  v_due := email_outbox_sweep();
  IF (SELECT status FROM email_outbox WHERE id = v_x) <> 'dead' THEN
    RAISE EXCEPTION 'FAIL: sweep did not retire a row stuck on its 5th attempt';
  END IF;
  IF v_due < 1 THEN
    RAISE EXCEPTION 'FAIL: sweep saw no due rows (pending company A rows exist)';
  END IF;
  IF to_regclass('net.http_request_queue') IS NOT NULL THEN
    EXECUTE $q$SELECT count(*) FROM net.http_request_queue WHERE convert_from(body, 'UTF8')::jsonb = '{"drain": true}'::jsonb$q$ INTO v_after;
    IF v_after <> v_before + 1 THEN
      RAISE EXCEPTION 'FAIL: sweep did not POST {"drain": true} (before %, after %)', v_before, v_after;
    END IF;
  END IF;
  PERFORM pg_temp.eot_pass('email_outbox_sweep: stuck last attempt -> dead; due rows -> one POST {"drain": true}');
END $$;

-- ------------------------------------------------------------
-- 14. Safety: dedupe, per-company cap, tenant re-check, unconfigured
--     mode, a failing enqueue never blocks the business write
-- ------------------------------------------------------------
DO $$
DECLARE
  v_n     INTEGER;
  v_id    UUID;
  v_req   JSONB;
  v_probe TEXT;
BEGIN
  -- dedupe: the same key twice -> NULL, no second row
  IF enqueue_email(pg_temp.eot_id('cA'), pg_temp.eot_id('pA'), pg_temp.eot_id('reqA'), 'signature_request',
                   'sigreq:' || pg_temp.eot_id('reqA') || ':0', 'gc.person@example.com', NULL, NULL, '{}'::jsonb) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: duplicate dedupe_key queued a row';
  END IF;
  -- invalid address -> NULL
  IF enqueue_email(pg_temp.eot_id('cA'), pg_temp.eot_id('pA'), NULL, 'tm_ticket_submitted',
                   'eot:bad-address', 'bad address@example.com', NULL, NULL, '{}'::jsonb) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: invalid address queued a row';
  END IF;

  -- cap: 300 rows in 24 h for company B -> the next one is refused
  INSERT INTO email_outbox (company_id, project_id, event_type, dedupe_key, to_email, status, created_at)
  SELECT pg_temp.eot_id('cB'), pg_temp.eot_id('pB'), 'tm_ticket_submitted', 'eot:cap:' || g, 'cap' || g || '@example.com', 'sent', now() - interval '1 hour'
  FROM generate_series(1, 300 - (SELECT count(*) FROM email_outbox WHERE company_id = pg_temp.eot_id('cB'))::int) g;
  v_id := enqueue_email(pg_temp.eot_id('cB'), pg_temp.eot_id('pB'), NULL, 'tm_ticket_submitted',
                        'eot:cap:over', 'over@example.com', NULL, NULL, '{}'::jsonb, interval '3 minutes');
  IF v_id IS NOT NULL OR EXISTS (SELECT 1 FROM email_outbox WHERE dedupe_key = 'eot:cap:over') THEN
    RAISE EXCEPTION 'FAIL: the 301st email in 24 h was queued';
  END IF;
  -- rows older than 24 h do not count
  UPDATE email_outbox SET created_at = now() - interval '25 hours' WHERE dedupe_key LIKE 'eot:cap:%';
  v_id := enqueue_email(pg_temp.eot_id('cB'), pg_temp.eot_id('pB'), NULL, 'tm_ticket_submitted',
                        'eot:cap:after', 'after@example.com', NULL, NULL, '{}'::jsonb, interval '3 minutes');
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'FAIL: cap did not reset after 24 h';
  END IF;

  -- tenant re-check: a request written directly (owner) whose company
  -- is not the project's, or whose document is not in the project, is
  -- stored but never emailed
  INSERT INTO signature_requests (document_type, document_id, company_id, project_id, signature_token, recipient_email)
  VALUES ('cor', pg_temp.eot_id('corA'), pg_temp.eot_id('cB'), pg_temp.eot_id('pA'), 'sig_eot_mismatch1', 'x1@example.com'),
         ('tm_ticket', pg_temp.eot_id('tB'), pg_temp.eot_id('cA'), pg_temp.eot_id('pA'), 'sig_eot_mismatch2', 'x2@example.com');
  SELECT count(*) INTO v_n FROM email_outbox o
  JOIN signature_requests sr ON sr.id = o.signature_request_id
  WHERE sr.signature_token IN ('sig_eot_mismatch1', 'sig_eot_mismatch2');
  IF v_n <> 0 OR (SELECT count(*) FROM signature_requests WHERE signature_token IN ('sig_eot_mismatch1', 'sig_eot_mismatch2')) <> 2 THEN
    RAISE EXCEPTION 'FAIL: tenant mismatch queued % row(s) or blocked the insert', v_n;
  END IF;

  -- unconfigured mode: without the Vault secrets the link is still
  -- created and its row waits as pending (probe rolled back)
  BEGIN
    DELETE FROM vault.secrets WHERE name IN ('email_worker_url', 'email_worker_secret');
    PERFORM pg_temp.eot_as('authenticated', pg_temp.eot_id('o1'), NULL);
    v_req := create_signature_request('tm_ticket', pg_temp.eot_id('tA'), pg_temp.eot_id('pA'), NULL, 'noconfig@example.com', NULL);
    PERFORM pg_temp.eot_owner();
    SELECT id INTO v_id FROM email_outbox WHERE signature_request_id = (v_req->>'id')::uuid;
    IF v_id IS NULL OR (SELECT status FROM email_outbox WHERE id = v_id) <> 'pending'
       OR COALESCE(pg_temp.eot_dispatches(v_id), 0) <> 0 THEN
      RAISE EXCEPTION 'FAIL: unconfigured mode: row % dispatched or missing', v_id;
    END IF;
    RAISE EXCEPTION 'eot_probe_ok';
  EXCEPTION
    WHEN insufficient_privilege OR undefined_table THEN
      PERFORM pg_temp.eot_owner();
      v_probe := 'skipped (' || SQLERRM || ')';
    WHEN raise_exception THEN
      PERFORM pg_temp.eot_owner();
      IF SQLERRM <> 'eot_probe_ok' THEN RAISE; END IF;
      v_probe := 'ok';
  END;
  IF v_probe <> 'ok' THEN
    RAISE NOTICE 'SKIP: unconfigured-mode probe %', v_probe;
  END IF;

  -- a broken outbox never blocks the business write (probe rolled back)
  BEGIN
    ALTER TABLE email_outbox RENAME TO email_outbox_eot_probe;
    PERFORM pg_temp.eot_as('authenticated', pg_temp.eot_id('o1'), NULL);
    v_req := create_signature_request('tm_ticket', pg_temp.eot_id('tA'), pg_temp.eot_id('pA'), NULL, 'blocked@example.com', NULL);
    PERFORM pg_temp.eot_owner();
    IF v_req IS NULL OR NOT EXISTS (SELECT 1 FROM signature_requests WHERE id = (v_req->>'id')::uuid) THEN
      RAISE EXCEPTION 'FAIL: the request was not created while the outbox was broken';
    END IF;
    RAISE EXCEPTION 'eot_probe_ok';
  EXCEPTION WHEN raise_exception THEN
    PERFORM pg_temp.eot_owner();
    IF SQLERRM <> 'eot_probe_ok' THEN RAISE; END IF;
  END;

  PERFORM pg_temp.eot_pass('safety: dedupe and bad address -> NULL; 300/24 h company cap (older rows ignored); tenant mismatch stored but not emailed; unconfigured Vault -> pending, no dispatch; trigger failure -> WARNING, write commits');
END $$;

-- ------------------------------------------------------------
-- 15. Security review findings (each failed before the fix)
--   a. direct INSERT of a request by a member (own or another
--      tenant's project / document, forged created_by) is denied
--   b. removed and pending members read and write nothing
--   c. company B cannot read company A's signatures
--   d. a member cannot INSERT a signatures row
--   e. 6th signing email to one address in 24 h is not queued, the
--      request is still created
--   f. office members still read requests with embedded signatures
--      and email_outbox, and revoke an open request
-- ------------------------------------------------------------
DO $$
DECLARE
  v_pp    UUID := gen_random_uuid();
  v_state TEXT;
  v_n     BIGINT;
  v_uid   UUID;
  v_req   JSONB;
  v_ids   UUID[] := ARRAY[]::UUID[];
  v_i     INTEGER;
  v_sigs  BIGINT;
  v_out   BIGINT;
  v_s1req UUID;
BEGIN
  -- a pending (unapproved) member of A
  INSERT INTO auth.users (id, email) VALUES (v_pp, 'pending.' || current_setting('eot.sfx') || '@example.com');
  INSERT INTO users (id, email, name) VALUES (v_pp, 'pending.' || current_setting('eot.sfx') || '@example.com', 'Pending P')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO user_companies (user_id, company_id, status) VALUES (v_pp, pg_temp.eot_id('cA'), 'pending');

  -- a. direct INSERT (E1 / E2 / E3 / E4 of the review)
  PERFORM pg_temp.eot_as('authenticated', pg_temp.eot_id('o1'), NULL);
  v_state := 'none';
  BEGIN
    INSERT INTO signature_requests (document_type, document_id, company_id, project_id, signature_token)
    VALUES ('tm_ticket', pg_temp.eot_id('tB'), pg_temp.eot_id('cA'), pg_temp.eot_id('pB'), 'tok_xtenant_' || current_setting('eot.sfx'));
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  IF v_state <> '42501' THEN
    PERFORM pg_temp.eot_owner();
    RAISE EXCEPTION 'FAIL: member INSERTed a request for another tenant''s project (state %)', v_state;
  END IF;
  v_state := 'none';
  BEGIN
    INSERT INTO signature_requests (document_type, document_id, company_id, project_id, signature_token, recipient_email, created_by)
    VALUES ('cor', pg_temp.eot_id('corA'), pg_temp.eot_id('cA'), pg_temp.eot_id('pA'), 'tok_cb_' || current_setting('eot.sfx'),
            'attacker@evil.test', pg_temp.eot_id('mB'));
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  IF v_state <> '42501' THEN
    PERFORM pg_temp.eot_owner();
    RAISE EXCEPTION 'FAIL: member INSERTed a request directly with a forged created_by (state %)', v_state;
  END IF;

  -- d. direct INSERT into signatures on an own open request (E10)
  v_state := 'none';
  BEGIN
    INSERT INTO signatures (signature_request_id, signature_slot, signature_image, signer_name)
    VALUES (pg_temp.eot_id('reqF'), 1, 'not-an-image', 'Fake Client');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.eot_owner();
  IF v_state <> '42501' THEN
    RAISE EXCEPTION 'FAIL: member INSERTed a signatures row directly (state %)', v_state;
  END IF;
  IF EXISTS (SELECT 1 FROM signature_requests WHERE signature_token IN ('tok_xtenant_' || current_setting('eot.sfx'), 'tok_cb_' || current_setting('eot.sfx')))
     OR EXISTS (SELECT 1 FROM signatures WHERE signature_request_id = pg_temp.eot_id('reqF'))
     OR EXISTS (SELECT 1 FROM email_outbox WHERE to_email = 'attacker@evil.test') THEN
    RAISE EXCEPTION 'FAIL: a refused direct write left a row behind';
  END IF;

  -- b. removed (E1) and pending (E1b) members of A
  FOREACH v_uid IN ARRAY ARRAY[pg_temp.eot_id('in'), v_pp] LOOP
    PERFORM pg_temp.eot_as('authenticated', v_uid, NULL);
    SELECT count(*) INTO v_n FROM signature_requests WHERE company_id = pg_temp.eot_id('cA');
    IF v_n <> 0 THEN
      PERFORM pg_temp.eot_owner();
      RAISE EXCEPTION 'FAIL: non-active member % reads % company A request(s)', v_uid, v_n;
    END IF;
    SELECT count(*) INTO v_n FROM signatures WHERE company_id = pg_temp.eot_id('cA');
    IF v_n <> 0 THEN
      PERFORM pg_temp.eot_owner();
      RAISE EXCEPTION 'FAIL: non-active member reads % company A signature(s)', v_n;
    END IF;
    SELECT count(*) INTO v_n FROM email_outbox WHERE company_id = pg_temp.eot_id('cA');
    IF v_n <> 0 THEN
      PERFORM pg_temp.eot_owner();
      RAISE EXCEPTION 'FAIL: non-active member reads % company A outbox row(s)', v_n;
    END IF;
    UPDATE signature_requests SET status = 'revoked' WHERE id = pg_temp.eot_id('reqF');
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 0 THEN
      PERFORM pg_temp.eot_owner();
      RAISE EXCEPTION 'FAIL: non-active member revoked a company A request';
    END IF;
    v_state := 'none';
    BEGIN
      INSERT INTO signature_requests (document_type, document_id, company_id, project_id, signature_token, recipient_email)
      VALUES ('cor', pg_temp.eot_id('corA'), pg_temp.eot_id('cA'), pg_temp.eot_id('pA'), 'tok_nonmember_' || current_setting('eot.sfx'), 'victim@phish.test');
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
    END;
    IF v_state <> '42501' THEN
      PERFORM pg_temp.eot_owner();
      RAISE EXCEPTION 'FAIL: non-active member INSERTed a request (state %)', v_state;
    END IF;
    v_state := 'none';
    BEGIN
      PERFORM create_signature_request('cor', pg_temp.eot_id('corA'), pg_temp.eot_id('pA'), NULL, 'victim@phish.test', NULL);
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
    END;
    IF v_state <> '42501' THEN
      PERFORM pg_temp.eot_owner();
      RAISE EXCEPTION 'FAIL: non-active member passed create_signature_request (state %)', v_state;
    END IF;
    v_state := 'none';
    BEGIN
      PERFORM resend_signature_request(pg_temp.eot_id('reqF'));
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
    END;
    IF v_state <> '42501' THEN
      PERFORM pg_temp.eot_owner();
      RAISE EXCEPTION 'FAIL: non-active member passed resend_signature_request (state %)', v_state;
    END IF;
    PERFORM pg_temp.eot_owner();
  END LOOP;
  IF (SELECT status FROM signature_requests WHERE id = pg_temp.eot_id('reqF')) <> 'pending'
     OR EXISTS (SELECT 1 FROM email_outbox WHERE to_email = 'victim@phish.test') THEN
    RAISE EXCEPTION 'FAIL: a non-active member changed or queued something';
  END IF;

  -- c. company B cannot read company A's signatures (E6)
  SELECT count(*) INTO v_sigs FROM signatures s JOIN signature_requests sr ON sr.id = s.signature_request_id
  WHERE sr.company_id = pg_temp.eot_id('cA');
  PERFORM pg_temp.eot_as('authenticated', pg_temp.eot_id('mB'), NULL);
  SELECT count(*) INTO v_n FROM signatures;
  PERFORM pg_temp.eot_owner();
  IF v_sigs < 4 OR v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL: company B member sees % signature(s) (company A has %, B has none)', v_n, v_sigs;
  END IF;

  -- e. per-recipient cap (E7 insert-spam): six links to one address
  PERFORM pg_temp.eot_as('authenticated', pg_temp.eot_id('o1'), NULL);
  FOR v_i IN 1..6 LOOP
    v_req := create_signature_request('tm_ticket', pg_temp.eot_id('tS2'), pg_temp.eot_id('pA'), NULL, 'Cap.Victim@Example.com', NULL);
    v_ids := v_ids || (v_req->>'id')::uuid;
  END LOOP;
  PERFORM pg_temp.eot_owner();
  SELECT count(*) INTO v_n FROM signature_requests WHERE id = ANY (v_ids) AND recipient_email = 'cap.victim@example.com';
  SELECT count(*) INTO v_out FROM email_outbox WHERE to_email = 'cap.victim@example.com' AND event_type = 'signature_request';
  IF v_n <> 6 OR v_out <> 5
     OR EXISTS (SELECT 1 FROM email_outbox WHERE signature_request_id = v_ids[6]) THEN
    RAISE EXCEPTION 'FAIL: per-recipient cap: % request(s) created, % email(s) queued (expected 6 / 5)', v_n, v_out;
  END IF;
  -- members' own mail is not capped per address (company cap only)
  IF (SELECT count(*) FROM email_outbox WHERE company_id = pg_temp.eot_id('cA') AND event_type = 'document_signed'
        AND to_email = 'office2.' || current_setting('eot.sfx') || '@example.com') < 4 THEN
    RAISE EXCEPTION 'FAIL: document_signed mail to a member was capped per address';
  END IF;

  -- f. office members: requests + embedded signatures + email_outbox; revoke
  SELECT sr.id INTO v_s1req FROM signatures s JOIN signature_requests sr ON sr.id = s.signature_request_id
  WHERE s.id = pg_temp.eot_id('sigA');
  FOREACH v_uid IN ARRAY ARRAY[pg_temp.eot_id('o1'), pg_temp.eot_id('o2')] LOOP
    PERFORM pg_temp.eot_as('authenticated', v_uid, NULL);
    SELECT count(*) INTO v_n FROM signature_requests WHERE company_id = pg_temp.eot_id('cA');
    SELECT count(*) INTO v_sigs FROM signature_requests sr JOIN signatures s ON s.signature_request_id = sr.id WHERE sr.id = v_s1req;
    SELECT count(*) INTO v_out FROM signature_requests sr JOIN email_outbox o ON o.signature_request_id = sr.id WHERE sr.id = v_s1req;
    PERFORM pg_temp.eot_owner();
    IF v_n <> (SELECT count(*) FROM signature_requests WHERE company_id = pg_temp.eot_id('cA')) OR v_sigs <> 1 OR v_out < 1 THEN
      RAISE EXCEPTION 'FAIL: office member % sees requests % / embedded signatures % / outbox %', v_uid, v_n, v_sigs, v_out;
    END IF;
  END LOOP;
  PERFORM pg_temp.eot_as('authenticated', pg_temp.eot_id('o2'), NULL);
  UPDATE signature_requests SET status = 'revoked' WHERE id = pg_temp.eot_id('reqF');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_state := 'none';
  BEGIN
    UPDATE signature_requests SET status = 'revoked' WHERE id = v_s1req;  -- completed: not revocable
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  PERFORM pg_temp.eot_owner();
  IF v_n <> 1 OR (SELECT status FROM signature_requests WHERE id = pg_temp.eot_id('reqF')) <> 'revoked'
     OR v_state <> '42501' OR (SELECT status FROM signature_requests WHERE id = v_s1req) <> 'completed' THEN
    RAISE EXCEPTION 'FAIL: revoke: open request rows % (status %), completed request state %',
      v_n, (SELECT status FROM signature_requests WHERE id = pg_temp.eot_id('reqF')), v_state;
  END IF;

  PERFORM pg_temp.eot_pass('review findings: direct request INSERT (cross-tenant, forged created_by) and signatures INSERT denied; removed / pending members read and write nothing; company B reads none of A''s signatures; 6th signing email to one address not queued (request created); office members read requests + signatures + outbox and revoke open links only');
END $$;

-- ------------------------------------------------------------
-- SUMMARY
-- ------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'EMAIL OUTBOX TESTS: all % checks passed (rolled back)', current_setting('eot.passes', true);
END $$;

ROLLBACK;
