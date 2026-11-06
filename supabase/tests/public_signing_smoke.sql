-- ============================================================
-- PUBLIC SIGNING SMOKE TEST
-- ============================================================
-- Exercises supabase/migrations/20261105_public_signing_rpcs.sql
-- end to end as the Postgres anon role, with no field session and
-- no auth.users row: the signature token is the only credential.
-- The FIELD APP section also covers
-- 20261104_signature_public_rpcs.sql (apply it first): the field app
-- creates links only through create_signature_request.
--
-- HOW TO USE:
--   Paste the whole file into the Supabase SQL Editor (or run it
--   with psql) AFTER the migration. Every check is a DO block that
--   RAISEs on failure and prints "PASS: ..." on success. The whole
--   script is ONE transaction that ends in ROLLBACK, so it leaves
--   no rows behind — including its own fixtures.
--
-- EXPECTED: a list of "NOTICE: PASS: ..." lines and a final
--   "NOTICE: PUBLIC SIGNING SMOKE: all N checks passed (rolled back)".
--   Any ERROR means a check failed; the transaction is aborted and
--   nothing is written either way.
--
-- NOTE: the fixture tokens below (sig_smoketest0001 etc.) are
--   deleted at the start of the transaction if they already exist
--   (founder checklist step 6 creates sig_smoketest0001 by hand).
--   That delete is rolled back with everything else.
-- ============================================================

BEGIN;

-- Transaction-local scratch values shared between DO blocks.
SELECT set_config('signing_smoke.passes', '0', true);

-- ------------------------------------------------------------
-- FIXTURES (run as the SQL-editor role; RLS does not apply to the
-- table owner). Only columns the app itself writes are named.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_company_id UUID := gen_random_uuid();
  v_project_id UUID := gen_random_uuid();
  v_ticket_id  UUID := gen_random_uuid();
  v_ticket2_id UUID := gen_random_uuid();
  v_cor_id     UUID := gen_random_uuid();
  v_material_id UUID := gen_random_uuid();
  v_done_req_id UUID;
  v_photo_path TEXT;
  v_photo_url  TEXT;
  v_foreign_tenant_path TEXT;
  v_photos     JSONB;
BEGIN
  DELETE FROM signature_requests
  WHERE signature_token IN (
    'sig_smoketest0001', 'sig_smoketest_exp1', 'sig_smoketest_rev1',
    'sig_smoketest_2nd1', 'sig_smoketestcor01', 'sig_smoketest_done1',
    'sig_smoketest_fld1', 'sig_smoketest_fld2', 'sig_smoketest_fld3'
  );
  DELETE FROM field_sessions WHERE session_token = 'fs_smoke_session_0001';

  INSERT INTO companies (id, name, code, office_code)
  VALUES (v_company_id, 'Smoke Signing Co',
          'SMK' || upper(substr(md5(random()::text), 1, 8)),
          'OFF' || upper(substr(md5(random()::text), 1, 8)));

  INSERT INTO projects (id, company_id, name, job_number, contract_value, status)
  VALUES (v_project_id, v_company_id, 'Smoke Signing Project', 'SMK-001', 1000, 'active');

  INSERT INTO materials_equipment (id, company_id, name, category, unit, cost_per_unit, active)
  VALUES (v_material_id, v_company_id, 'Smoke Material', 'materials', 'each', 12.5, true);

  -- A COR in pending_approval with one labor line (totals recalc by trigger)
  INSERT INTO change_orders (id, company_id, project_id, cor_number, title, scope_of_work, period_start, period_end, status)
  VALUES (v_cor_id, v_company_id, v_project_id, 'SMK-COR-1', 'Smoke COR', 'Smoke scope of work', CURRENT_DATE, CURRENT_DATE, 'pending_approval');

  INSERT INTO change_order_labor (change_order_id, labor_class, regular_hours, regular_rate, regular_total, total, sort_order)
  VALUES (v_cor_id, 'Laborer', 8, 5000, 40000, 40000, 0);

  INSERT INTO change_order_materials (change_order_id, description, quantity, unit, unit_cost, total, sort_order)
  VALUES (v_cor_id, 'Smoke material line', 2, 'each', 1250, 2500, 0);

  -- Ticket with one stored path, one legacy public URL and one entry that
  -- names ANOTHER tenant's object (as a field user could write via the
  -- ticket UPDATE policy), assigned to the COR. photos is passed through
  -- jsonb_populate_record so the real column type (JSONB or TEXT[]) is
  -- coerced by Postgres.
  v_photo_path := v_company_id::text || '/' || v_project_id::text || '/' || v_ticket_id::text || '/smoke-1.jpg';
  v_photo_url  := 'https://example.supabase.co/storage/v1/object/public/tm-photos/'
                  || v_company_id::text || '/' || v_project_id::text || '/' || v_ticket_id::text || '/smoke-2.jpg';
  v_foreign_tenant_path := gen_random_uuid()::text || '/' || gen_random_uuid()::text || '/' || v_ticket_id::text || '/secret.jpg';
  v_photos := jsonb_build_array(v_photo_path, v_photo_url, v_foreign_tenant_path);

  INSERT INTO t_and_m_tickets (id, project_id, work_date, ce_pco_number, notes, status, created_by_name, assigned_cor_id, photos)
  SELECT v_ticket_id, v_project_id, CURRENT_DATE, 'CE-SMOKE-1', 'Smoke ticket notes', 'foreman_signed', 'Smoke Foreman', v_cor_id,
         (jsonb_populate_record(NULL::t_and_m_tickets, jsonb_build_object('photos', v_photos))).photos;

  UPDATE t_and_m_tickets
  SET foreman_signature_data = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      foreman_signature_name = 'Smoke Foreman',
      foreman_signature_title = 'Foreman',
      foreman_signature_date = NOW(),
      rejection_reason = NULL
  WHERE id = v_ticket_id;

  -- A second, unrelated ticket with a photo (must NOT be readable via the token)
  INSERT INTO t_and_m_tickets (id, project_id, work_date, ce_pco_number, notes, status, created_by_name, photos)
  SELECT v_ticket2_id, v_project_id, CURRENT_DATE, 'CE-SMOKE-2', 'Other ticket', 'pending', 'Smoke Foreman',
         (jsonb_populate_record(NULL::t_and_m_tickets,
            jsonb_build_object('photos', jsonb_build_array(
              v_company_id::text || '/' || v_project_id::text || '/' || v_ticket2_id::text || '/other.jpg')))).photos;

  INSERT INTO t_and_m_workers (ticket_id, name, hours, overtime_hours, time_started, time_ended, role)
  VALUES (v_ticket_id, 'Smoke Worker A', 8, 1.5, '07:00', '16:30', 'Laborer'),
         (v_ticket_id, 'Smoke Worker B', 8, 0, '07:00', '15:00', 'Operator');

  INSERT INTO t_and_m_items (ticket_id, material_equipment_id, custom_name, custom_category, quantity)
  VALUES (v_ticket_id, v_material_id, NULL, NULL, 3),
         (v_ticket_id, NULL, 'Smoke custom item', 'equipment', 1);

  -- Signature requests: valid, time-expired, revoked, a second link for the
  -- same ticket, and one for the COR. created_by stays NULL (no auth.users).
  INSERT INTO signature_requests (document_type, document_id, company_id, project_id, signature_token, status, expires_at)
  VALUES
    ('tm_ticket', v_ticket_id, v_company_id, v_project_id, 'sig_smoketest0001', 'pending', NOW() + INTERVAL '7 days'),
    ('tm_ticket', v_ticket_id, v_company_id, v_project_id, 'sig_smoketest_exp1', 'pending', NOW() - INTERVAL '1 hour'),
    ('tm_ticket', v_ticket_id, v_company_id, v_project_id, 'sig_smoketest_rev1', 'revoked', NULL),
    ('tm_ticket', v_ticket_id, v_company_id, v_project_id, 'sig_smoketest_2nd1', 'pending', NULL),
    ('cor',       v_cor_id,    v_company_id, v_project_id, 'sig_smoketestcor01', 'pending', NULL);

  -- A request on the second ticket that was signed and whose expires_at has
  -- since passed: the signed state must stay readable. (Insert the
  -- signature first: the AFTER INSERT trigger on signatures rewrites the
  -- request status, so the final status/expiry are set afterwards.)
  INSERT INTO signature_requests (document_type, document_id, company_id, project_id, signature_token, status, expires_at)
  VALUES ('tm_ticket', v_ticket2_id, v_company_id, v_project_id, 'sig_smoketest_done1', 'pending', NOW() + INTERVAL '1 day')
  RETURNING id INTO v_done_req_id;
  INSERT INTO signatures (signature_request_id, signature_slot, signature_image, signer_name, signer_title, signer_company, signed_at, user_agent)
  VALUES (v_done_req_id, 1, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
          'Done GC', 'PM', 'GC Co', NOW() - INTERVAL '10 days', 'smoke-done');
  UPDATE signature_requests SET status = 'completed', expires_at = NOW() - INTERVAL '3 days' WHERE id = v_done_req_id;
  UPDATE t_and_m_tickets
  SET gc_signature_data = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      gc_signature_name = 'Done GC', status = 'client_signed'
  WHERE id = v_ticket2_id;

  PERFORM set_config('signing_smoke.company_id', v_company_id::text, true);
  PERFORM set_config('signing_smoke.project_id', v_project_id::text, true);
  PERFORM set_config('signing_smoke.ticket_id', v_ticket_id::text, true);
  PERFORM set_config('signing_smoke.ticket2_id', v_ticket2_id::text, true);
  PERFORM set_config('signing_smoke.cor_id', v_cor_id::text, true);
  PERFORM set_config('signing_smoke.photo_path', v_photo_path, true);
  PERFORM set_config('signing_smoke.photo2_path',
    v_company_id::text || '/' || v_project_id::text || '/' || v_ticket_id::text || '/smoke-2.jpg', true);
  PERFORM set_config('signing_smoke.foreign_path',
    v_company_id::text || '/' || v_project_id::text || '/' || v_ticket2_id::text || '/other.jpg', true);
  PERFORM set_config('signing_smoke.foreign_tenant_path', v_foreign_tenant_path, true);

  RAISE NOTICE 'PASS: fixtures created (company %, ticket %, cor %)', v_company_id, v_ticket_id, v_cor_id;
  PERFORM set_config('signing_smoke.passes', (current_setting('signing_smoke.passes', true)::int + 1)::text, true);
END $$;

-- ------------------------------------------------------------
-- AS ANON, NO FIELD SESSION: only the token is sent
-- ------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.headers',
  '{"x-forwarded-for":"203.0.113.9, 10.0.0.1","user-agent":"smoke","x-signing-token":"sig_smoketest0001"}',
  true);

-- Base tables are closed to a session-less anon caller
DO $$
DECLARE
  v_count BIGINT;
BEGIN
  BEGIN
    EXECUTE 'SELECT count(*) FROM t_and_m_tickets WHERE id = $1'
      INTO v_count USING current_setting('signing_smoke.ticket_id', true)::uuid;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'FAIL: anon can read t_and_m_tickets directly (count = %)', v_count;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- permission denied is equally fine
  END;

  BEGIN
    EXECUTE 'SELECT count(*) FROM signature_requests' INTO v_count;
    RAISE EXCEPTION 'FAIL: anon can SELECT signature_requests (count = %)', v_count;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- A request row is a credential: a session-less anon must not mint one
  -- (ids copied from a legitimate projection), nor re-point an open one.
  BEGIN
    EXECUTE 'INSERT INTO signature_requests (document_type, document_id, company_id, project_id, signature_token, status) VALUES ($1, $2, $3, $4, $5, $6)'
      USING 'cor', current_setting('signing_smoke.cor_id', true)::uuid,
            current_setting('signing_smoke.company_id', true)::uuid,
            current_setting('signing_smoke.project_id', true)::uuid,
            'sig_attackermint1', 'pending';
    RAISE EXCEPTION 'FAIL: anon without a field session can INSERT signature_requests';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- RLS violation or missing grant
  END;

  BEGIN
    EXECUTE 'UPDATE signature_requests SET document_type = $1, document_id = $2'
      USING 'cor', current_setting('signing_smoke.cor_id', true)::uuid;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'FAIL: anon without a field session re-pointed % signature_requests row(s)', v_count;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM public_signing_ticket_json(current_setting('signing_smoke.ticket_id', true)::uuid);
    RAISE EXCEPTION 'FAIL: anon can execute public_signing_ticket_json';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM public_signing_pick('{}'::jsonb, ARRAY['a']);
    RAISE EXCEPTION 'FAIL: anon can execute public_signing_pick';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  RAISE NOTICE 'PASS: anon cannot read t_and_m_tickets / signature_requests, mint or re-point a signature request, or call the helpers';
  PERFORM set_config('signing_smoke.passes', (current_setting('signing_smoke.passes', true)::int + 1)::text, true);
END $$;

-- Unknown / short tokens -> NULL
DO $$
BEGIN
  IF public_get_signature_request_by_token('sig_nope') IS NOT NULL
     OR public_get_signature_request_by_token('sig_doesnotexist') IS NOT NULL
     OR public_get_signature_request_by_token(NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: token RPC returned a row for an unknown token';
  END IF;
  IF public_get_document_for_signing('sig_nope') IS NOT NULL
     OR public_get_document_for_signing('sig_doesnotexist') IS NOT NULL
     OR public_get_document_for_signing(NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: document RPC returned a document for an unknown token';
  END IF;
  RAISE NOTICE 'PASS: unknown token -> NULL from both RPCs';
  PERFORM set_config('signing_smoke.passes', (current_setting('signing_smoke.passes', true)::int + 1)::text, true);
END $$;

-- Token RPC: pending request, same shape as before
DO $$
DECLARE
  v_req JSONB;
BEGIN
  v_req := public_get_signature_request_by_token('sig_smoketest0001');
  IF v_req IS NULL THEN
    RAISE EXCEPTION 'FAIL: token RPC returned NULL for the valid token';
  END IF;
  IF v_req->>'status' <> 'pending'
     OR v_req->>'document_type' <> 'tm_ticket'
     OR (v_req->>'document_id')::uuid <> current_setting('signing_smoke.ticket_id', true)::uuid
     OR NOT (v_req ? 'id')
     OR NOT (v_req ? 'signature_token')
     OR NOT (v_req ? 'expires_at')
     OR NOT (v_req ? 'view_count')
     OR NOT (v_req ? 'created_at')
     OR jsonb_typeof(v_req->'signatures') <> 'array'
     OR jsonb_array_length(v_req->'signatures') <> 0 THEN
    RAISE EXCEPTION 'FAIL: token RPC shape unexpected: %', v_req::text;
  END IF;
  RAISE NOTICE 'PASS: token RPC returns the pending request with id/status/document_type/document_id/signatures';
  PERFORM set_config('signing_smoke.passes', (current_setting('signing_smoke.passes', true)::int + 1)::text, true);
END $$;

-- Document RPC: T&M projection
DO $$
DECLARE
  v_doc JSONB;
  v_txt TEXT;
  v_item JSONB;
  v_bad TEXT;
BEGIN
  v_doc := public_get_document_for_signing('sig_smoketest0001');
  IF v_doc IS NULL THEN
    RAISE EXCEPTION 'FAIL: document RPC returned NULL for the valid T&M token';
  END IF;

  IF (v_doc->>'id')::uuid <> current_setting('signing_smoke.ticket_id', true)::uuid
     OR v_doc->>'status' <> 'foreman_signed'
     OR v_doc->>'ce_pco_number' <> 'CE-SMOKE-1'
     OR v_doc->>'notes' <> 'Smoke ticket notes'
     OR v_doc->>'foreman_signature_name' <> 'Smoke Foreman'
     OR NOT (v_doc ? 'work_date')
     OR NOT (v_doc ? 'created_by_name')
     OR jsonb_typeof(v_doc->'photos') <> 'array'
     OR jsonb_array_length(v_doc->'photos') <> 3 THEN
    RAISE EXCEPTION 'FAIL: ticket keys unexpected: %', v_doc::text;
  END IF;

  IF jsonb_typeof(v_doc->'t_and_m_workers') <> 'array'
     OR jsonb_array_length(v_doc->'t_and_m_workers') <> 2
     OR NOT (v_doc->'t_and_m_workers'->0 ? 'hours')
     OR NOT (v_doc->'t_and_m_workers'->0 ? 'overtime_hours')
     OR NOT (v_doc->'t_and_m_workers'->0 ? 'name')
     OR NOT (v_doc->'t_and_m_workers'->0 ? 'role')
     OR NOT (v_doc->'t_and_m_workers'->0 ? 'time_started')
     OR NOT (v_doc->'t_and_m_workers'->0 ? 'time_ended') THEN
    RAISE EXCEPTION 'FAIL: t_and_m_workers unexpected: %', (v_doc->'t_and_m_workers')::text;
  END IF;

  IF jsonb_typeof(v_doc->'t_and_m_items') <> 'array'
     OR jsonb_array_length(v_doc->'t_and_m_items') <> 2 THEN
    RAISE EXCEPTION 'FAIL: t_and_m_items unexpected: %', (v_doc->'t_and_m_items')::text;
  END IF;

  SELECT e INTO v_item
  FROM jsonb_array_elements(v_doc->'t_and_m_items') e
  WHERE e->'materials_equipment' IS NOT NULL AND jsonb_typeof(e->'materials_equipment') = 'object'
  LIMIT 1;
  IF v_item IS NULL
     OR v_item->'materials_equipment'->>'name' <> 'Smoke Material'
     OR v_item->'materials_equipment'->>'unit' <> 'each'
     OR NOT (v_item->'materials_equipment' ? 'category')
     OR NOT (v_item ? 'quantity')
     OR NOT (v_item ? 'custom_name') THEN
    RAISE EXCEPTION 'FAIL: materials_equipment embed unexpected: %', v_item::text;
  END IF;

  IF v_doc->'projects'->>'name' <> 'Smoke Signing Project'
     OR v_doc->'projects'->>'job_number' <> 'SMK-001'
     OR v_doc->'projects'->'companies'->>'name' <> 'Smoke Signing Co'
     OR NOT (v_doc->'projects'->'companies' ? 'logo_url')
     OR NOT (v_doc->'projects'->'companies' ? 'id') THEN
    RAISE EXCEPTION 'FAIL: projects.companies embed unexpected: %', (v_doc->'projects')::text;
  END IF;

  v_txt := v_doc::text;
  FOREACH v_bad IN ARRAY ARRAY[
    '"rejection_reason"', '"rejected_at"', '"rejected_by_name"', '"approved_by"', '"approved_by_name"',
    '"approved_at"', '"photo_locations"', '"photos_verified_at"', '"photos_verification_status"',
    '"cost_per_unit"', '"gc_signature_ip"', '"client_signature_ip"', '"cost_code_id"', '"import_status"',
    '"company_id"', '"labor_class_id"', '"code"'
  ] LOOP
    IF position(v_bad IN v_txt) > 0 THEN
      RAISE EXCEPTION 'FAIL: excluded key % leaked in T&M projection', v_bad;
    END IF;
  END LOOP;

  RAISE NOTICE 'PASS: T&M projection has workers/items/materials_equipment/projects.companies and no excluded keys';
  PERFORM set_config('signing_smoke.passes', (current_setting('signing_smoke.passes', true)::int + 1)::text, true);
END $$;

-- Storage helper: only the token's own photos
DO $$
BEGIN
  IF NOT signing_token_can_read_photo(current_setting('signing_smoke.photo_path', true)) THEN
    RAISE EXCEPTION 'FAIL: signing_token_can_read_photo false for the ticket''s stored path';
  END IF;
  IF NOT signing_token_can_read_photo(current_setting('signing_smoke.photo2_path', true)) THEN
    RAISE EXCEPTION 'FAIL: signing_token_can_read_photo false for a legacy public URL entry';
  END IF;
  IF signing_token_can_read_photo(current_setting('signing_smoke.foreign_path', true)) THEN
    RAISE EXCEPTION 'FAIL: signing_token_can_read_photo true for another ticket''s photo';
  END IF;
  -- Listed in the ticket's own photos array, but under another tenant's prefix
  IF signing_token_can_read_photo(current_setting('signing_smoke.foreign_tenant_path', true)) THEN
    RAISE EXCEPTION 'FAIL: signing_token_can_read_photo true for a photos entry under another company/project prefix';
  END IF;
  IF signing_token_can_read_photo('nope/' || current_setting('signing_smoke.photo_path', true)) THEN
    RAISE EXCEPTION 'FAIL: signing_token_can_read_photo true for a prefixed path';
  END IF;
  IF signing_token_can_read_photo(NULL) OR signing_token_can_read_photo('') THEN
    RAISE EXCEPTION 'FAIL: signing_token_can_read_photo true for NULL / empty name';
  END IF;
  RAISE NOTICE 'PASS: signing_token_can_read_photo true for the ticket''s photos (path + legacy URL), false for another ticket, another tenant prefix, prefixed/NULL/empty names';
  PERFORM set_config('signing_smoke.passes', (current_setting('signing_smoke.passes', true)::int + 1)::text, true);
END $$;

-- Payload validation never writes
DO $$
DECLARE
  v_msg TEXT;
BEGIN
  BEGIN
    PERFORM public_add_signature('sig_smoketest0001', 3, jsonb_build_object('signature', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'signerName', 'QA GC'));
    RAISE EXCEPTION 'FAIL: slot 3 accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'signing_invalid_payload' THEN RAISE EXCEPTION 'FAIL: slot 3 -> % (expected signing_invalid_payload)', v_msg; END IF;
  END;
  BEGIN
    PERFORM public_add_signature('sig_smoketest0001', 1, jsonb_build_object('signature', 'data:image/jpeg;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'signerName', 'QA GC'));
    RAISE EXCEPTION 'FAIL: non-PNG image accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'signing_invalid_payload' THEN RAISE EXCEPTION 'FAIL: non-PNG -> % (expected signing_invalid_payload)', v_msg; END IF;
  END;
  BEGIN
    PERFORM public_add_signature('sig_smoketest0001', 1, jsonb_build_object('signature', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'signerName', '   '));
    RAISE EXCEPTION 'FAIL: blank signer name accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'signing_invalid_payload' THEN RAISE EXCEPTION 'FAIL: blank name -> % (expected signing_invalid_payload)', v_msg; END IF;
  END;
  BEGIN
    PERFORM public_add_signature('sig_smoketest0001', 1, '"not an object"'::jsonb);
    RAISE EXCEPTION 'FAIL: non-object payload accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'signing_invalid_payload' THEN RAISE EXCEPTION 'FAIL: non-object -> % (expected signing_invalid_payload)', v_msg; END IF;
  END;
  BEGIN
    PERFORM public_add_signature('sig_nope', 1, jsonb_build_object('signature', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'signerName', 'QA GC'));
    RAISE EXCEPTION 'FAIL: unknown token accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'signing_link_invalid' THEN RAISE EXCEPTION 'FAIL: unknown token -> % (expected signing_link_invalid)', v_msg; END IF;
  END;
  RAISE NOTICE 'PASS: bad slot / non-PNG / blank name / non-object payload -> signing_invalid_payload; unknown token -> signing_link_invalid';
  PERFORM set_config('signing_smoke.passes', (current_setting('signing_smoke.passes', true)::int + 1)::text, true);
END $$;

-- Happy path: sign slot 1 with a real 1x1 PNG
DO $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := public_add_signature(
    'sig_smoketest0001',
    1,
    jsonb_build_object(
      'signature', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'signerName', 'QA GC',
      'signerTitle', 'PM',
      'signerCompany', 'GC Co',
      'signedAt', NOW()::text,
      'userAgent', 'SmokeAgent/1.0'
    )
  );
  IF v_res IS NULL THEN
    RAISE EXCEPTION 'FAIL: public_add_signature returned NULL';
  END IF;
  IF v_res->>'document_status' <> 'client_signed' THEN
    RAISE EXCEPTION 'FAIL: document_status = % (expected client_signed)', v_res->>'document_status';
  END IF;
  IF v_res->>'request_status' <> 'completed' THEN
    RAISE EXCEPTION 'FAIL: request_status = % (expected completed)', v_res->>'request_status';
  END IF;
  IF jsonb_typeof(v_res->'signature') <> 'object'
     OR (v_res->'signature'->>'signature_slot')::int <> 1
     OR v_res->'signature'->>'signer_name' <> 'QA GC'
     OR NOT (v_res->'signature' ? 'id')
     OR NOT (v_res->'signature' ? 'signature_image')
     OR NOT (v_res->'signature' ? 'signed_at') THEN
    RAISE EXCEPTION 'FAIL: returned signature unexpected: %', (v_res->'signature')::text;
  END IF;
  RAISE NOTICE 'PASS: public_add_signature slot 1 -> document_status client_signed, request_status completed';
  PERFORM set_config('signing_smoke.passes', (current_setting('signing_smoke.passes', true)::int + 1)::text, true);
END $$;

-- Second submit on the same link (stale tab) and a second link for the same ticket
DO $$
DECLARE
  v_msg TEXT;
  v_req JSONB;
  v_doc JSONB;
BEGIN
  BEGIN
    PERFORM public_add_signature('sig_smoketest0001', 1, jsonb_build_object('signature', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'signerName', 'Second GC'));
    RAISE EXCEPTION 'FAIL: second signature on a completed request was accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'signing_already_signed' THEN RAISE EXCEPTION 'FAIL: second submit -> % (expected signing_already_signed)', v_msg; END IF;
  END;
  BEGIN
    PERFORM public_add_signature('sig_smoketest0001', 2, jsonb_build_object('signature', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'signerName', 'Second Client'));
    RAISE EXCEPTION 'FAIL: slot 2 on a completed request was accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'signing_already_signed' THEN RAISE EXCEPTION 'FAIL: slot 2 after completion -> % (expected signing_already_signed)', v_msg; END IF;
  END;
  -- A different, still-pending link for the same ticket: the GC slot on the
  -- document is already filled, so the per-slot guard rejects it.
  BEGIN
    PERFORM public_add_signature('sig_smoketest_2nd1', 1, jsonb_build_object('signature', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'signerName', 'Second GC'));
    RAISE EXCEPTION 'FAIL: second link for an already-signed ticket was accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'signing_already_signed' THEN RAISE EXCEPTION 'FAIL: second link -> % (expected signing_already_signed)', v_msg; END IF;
  END;

  -- Completed request still loads (page renders the signed state)
  v_req := public_get_signature_request_by_token('sig_smoketest0001');
  IF v_req->>'status' <> 'completed' OR jsonb_array_length(v_req->'signatures') <> 1 THEN
    RAISE EXCEPTION 'FAIL: completed request not readable: %', v_req::text;
  END IF;
  v_doc := public_get_document_for_signing('sig_smoketest0001');
  IF v_doc IS NULL OR v_doc->>'status' <> 'client_signed' OR v_doc->>'gc_signature_name' <> 'QA GC' THEN
    RAISE EXCEPTION 'FAIL: completed document not readable or not mirrored: %', COALESCE(v_doc::text, 'NULL');
  END IF;

  RAISE NOTICE 'PASS: double sign (same link, other slot, second link) -> signing_already_signed; completed link still loads';
  PERFORM set_config('signing_smoke.passes', (current_setting('signing_smoke.passes', true)::int + 1)::text, true);
END $$;

-- Expired link
SELECT set_config('request.headers',
  '{"x-forwarded-for":"203.0.113.9, 10.0.0.1","user-agent":"smoke","x-signing-token":"sig_smoketest_exp1"}',
  true);
DO $$
DECLARE
  v_msg TEXT;
  v_req JSONB;
BEGIN
  v_req := public_get_signature_request_by_token('sig_smoketest_exp1');
  IF v_req IS NULL OR v_req->>'status' <> 'expired' OR v_req->>'document_type' <> 'tm_ticket' OR (v_req ? 'id') OR (v_req ? 'signatures') THEN
    RAISE EXCEPTION 'FAIL: expired token RPC shape unexpected: %', COALESCE(v_req::text, 'NULL');
  END IF;
  IF public_get_document_for_signing('sig_smoketest_exp1') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: document RPC returned a document for an expired link';
  END IF;
  IF signing_token_can_read_photo(current_setting('signing_smoke.photo_path', true)) THEN
    RAISE EXCEPTION 'FAIL: expired token can read photos';
  END IF;
  BEGIN
    PERFORM public_add_signature('sig_smoketest_exp1', 1, jsonb_build_object('signature', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'signerName', 'Late GC'));
    RAISE EXCEPTION 'FAIL: expired link accepted a signature';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'signing_link_expired' THEN RAISE EXCEPTION 'FAIL: expired add -> % (expected signing_link_expired)', v_msg; END IF;
  END;
  RAISE NOTICE 'PASS: expired link -> token RPC {status: expired, document_type} without id, document NULL, photo false, add raises signing_link_expired';
  PERFORM set_config('signing_smoke.passes', (current_setting('signing_smoke.passes', true)::int + 1)::text, true);
END $$;

-- Revoked link
SELECT set_config('request.headers',
  '{"x-forwarded-for":"203.0.113.9, 10.0.0.1","user-agent":"smoke","x-signing-token":"sig_smoketest_rev1"}',
  true);
DO $$
DECLARE
  v_msg TEXT;
  v_req JSONB;
BEGIN
  v_req := public_get_signature_request_by_token('sig_smoketest_rev1');
  IF v_req IS NULL OR v_req->>'status' <> 'revoked' OR v_req->>'document_type' <> 'tm_ticket'
     OR (v_req ? 'id') OR (v_req ? 'document_id') OR (v_req ? 'project_id') OR (v_req ? 'company_id')
     OR (v_req ? 'signatures') THEN
    RAISE EXCEPTION 'FAIL: revoked token RPC unexpected (must be only status + document_type): %', COALESCE(v_req::text, 'NULL');
  END IF;
  IF public_get_document_for_signing('sig_smoketest_rev1') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: document RPC returned a document for a revoked link';
  END IF;
  IF signing_token_can_read_photo(current_setting('signing_smoke.photo_path', true)) THEN
    RAISE EXCEPTION 'FAIL: revoked token can read photos';
  END IF;
  BEGIN
    PERFORM public_add_signature('sig_smoketest_rev1', 1, jsonb_build_object('signature', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'signerName', 'Late GC'));
    RAISE EXCEPTION 'FAIL: revoked link accepted a signature';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'signing_link_revoked' THEN RAISE EXCEPTION 'FAIL: revoked add -> % (expected signing_link_revoked)', v_msg; END IF;
  END;
  RAISE NOTICE 'PASS: revoked link -> token RPC {status: revoked, document_type} without ids, document NULL, photo false, add raises signing_link_revoked';
  PERFORM set_config('signing_smoke.passes', (current_setting('signing_smoke.passes', true)::int + 1)::text, true);
END $$;

-- Completed link whose expires_at has passed: the signed state stays readable
SELECT set_config('request.headers',
  '{"x-forwarded-for":"203.0.113.9, 10.0.0.1","user-agent":"smoke","x-signing-token":"sig_smoketest_done1"}',
  true);
DO $$
DECLARE
  v_msg TEXT;
  v_req JSONB;
  v_doc JSONB;
BEGIN
  v_req := public_get_signature_request_by_token('sig_smoketest_done1');
  IF v_req IS NULL OR v_req->>'status' <> 'completed' OR NOT (v_req ? 'id')
     OR jsonb_array_length(v_req->'signatures') <> 1
     OR v_req->'signatures'->0->>'signer_name' <> 'Done GC' THEN
    RAISE EXCEPTION 'FAIL: completed+expired token RPC unexpected: %', COALESCE(v_req::text, 'NULL');
  END IF;
  v_doc := public_get_document_for_signing('sig_smoketest_done1');
  IF v_doc IS NULL
     OR (v_doc->>'id')::uuid <> current_setting('signing_smoke.ticket2_id', true)::uuid
     OR v_doc->>'gc_signature_name' <> 'Done GC' THEN
    RAISE EXCEPTION 'FAIL: completed+expired document not readable: %', COALESCE(v_doc::text, 'NULL');
  END IF;
  IF NOT signing_token_can_read_photo(current_setting('signing_smoke.foreign_path', true)) THEN
    RAISE EXCEPTION 'FAIL: completed+expired token cannot read its own ticket''s photo';
  END IF;
  IF signing_token_can_read_photo(current_setting('signing_smoke.photo_path', true)) THEN
    RAISE EXCEPTION 'FAIL: completed+expired token can read another ticket''s photo';
  END IF;
  BEGIN
    PERFORM public_add_signature('sig_smoketest_done1', 2, jsonb_build_object('signature', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'signerName', 'Late Client'));
    RAISE EXCEPTION 'FAIL: completed+expired link accepted a signature';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'signing_already_signed' THEN RAISE EXCEPTION 'FAIL: completed+expired add -> % (expected signing_already_signed)', v_msg; END IF;
  END;
  RAISE NOTICE 'PASS: completed link past expires_at -> token RPC completed with its signature, document readable, own photo readable, add raises signing_already_signed';
  PERFORM set_config('signing_smoke.passes', (current_setting('signing_smoke.passes', true)::int + 1)::text, true);
END $$;

-- COR happy path
SELECT set_config('request.headers',
  '{"cf-connecting-ip":"198.51.100.7","x-forwarded-for":"203.0.113.9, 10.0.0.1","user-agent":"smoke-cor","x-signing-token":"sig_smoketestcor01"}',
  true);
DO $$
DECLARE
  v_doc JSONB;
  v_txt TEXT;
  v_bad TEXT;
  v_res JSONB;
BEGIN
  v_doc := public_get_document_for_signing('sig_smoketestcor01');
  IF v_doc IS NULL THEN
    RAISE EXCEPTION 'FAIL: document RPC returned NULL for the COR token';
  END IF;
  IF (v_doc->>'id')::uuid <> current_setting('signing_smoke.cor_id', true)::uuid
     OR v_doc->>'cor_number' <> 'SMK-COR-1'
     OR v_doc->>'status' <> 'pending_approval'
     OR v_doc->>'scope_of_work' <> 'Smoke scope of work'
     OR NOT (v_doc ? 'labor_markup_percent')
     OR NOT (v_doc ? 'cor_total')
     OR NOT (v_doc ? 'period_start')
     OR jsonb_typeof(v_doc->'change_order_labor') <> 'array'
     OR jsonb_array_length(v_doc->'change_order_labor') <> 1
     OR v_doc->'change_order_labor'->0->>'labor_class' <> 'Laborer'
     OR jsonb_array_length(v_doc->'change_order_materials') <> 1
     OR jsonb_typeof(v_doc->'change_order_equipment') <> 'array'
     OR jsonb_typeof(v_doc->'change_order_subcontractors') <> 'array'
     OR v_doc->'projects'->'companies'->>'name' <> 'Smoke Signing Co' THEN
    RAISE EXCEPTION 'FAIL: COR projection unexpected: %', v_doc::text;
  END IF;
  IF jsonb_typeof(v_doc->'backup_tickets') <> 'array'
     OR jsonb_array_length(v_doc->'backup_tickets') <> 1
     OR (v_doc->'backup_tickets'->0->>'id')::uuid <> current_setting('signing_smoke.ticket_id', true)::uuid
     OR jsonb_array_length(v_doc->'backup_tickets'->0->'photos') <> 3
     OR jsonb_array_length(v_doc->'backup_tickets'->0->'t_and_m_workers') <> 2 THEN
    RAISE EXCEPTION 'FAIL: backup_tickets unexpected: %', (v_doc->'backup_tickets')::text;
  END IF;

  v_txt := v_doc::text;
  FOREACH v_bad IN ARRAY ARRAY[
    '"company_id"', '"area_id"', '"rejection_reason"', '"created_by"', '"approved_by"', '"submitted_by"',
    '"version"', '"last_snapshot_version"', '"gc_signature_ip"', '"client_signature_ip"',
    '"photo_locations"', '"cost_per_unit"', '"cost_code_id"'
  ] LOOP
    IF position(v_bad IN v_txt) > 0 THEN
      RAISE EXCEPTION 'FAIL: excluded key % leaked in COR projection', v_bad;
    END IF;
  END LOOP;

  -- The COR token may read the backup ticket's photos, not the other ticket's
  IF NOT signing_token_can_read_photo(current_setting('signing_smoke.photo_path', true)) THEN
    RAISE EXCEPTION 'FAIL: COR token cannot read its backup ticket photo';
  END IF;
  IF signing_token_can_read_photo(current_setting('signing_smoke.foreign_path', true)) THEN
    RAISE EXCEPTION 'FAIL: COR token can read an unassigned ticket''s photo';
  END IF;

  v_res := public_add_signature(
    'sig_smoketestcor01',
    1,
    jsonb_build_object(
      'signature', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'signerName', 'QA GC',
      'signerTitle', 'PM',
      'signerCompany', 'GC Co'
    )
  );
  IF v_res->>'document_status' <> 'approved' OR v_res->>'request_status' <> 'completed' THEN
    RAISE EXCEPTION 'FAIL: COR sign result unexpected: %', v_res::text;
  END IF;
  RAISE NOTICE 'PASS: COR projection (lines, totals, backup_tickets with photos, no excluded keys); GC signature -> approved';
  PERFORM set_config('signing_smoke.passes', (current_setting('signing_smoke.passes', true)::int + 1)::text, true);
END $$;

-- ------------------------------------------------------------
-- FIELD APP (anon WITH a valid x-field-session for the project).
-- 20261104_signature_public_rpcs.sql closed the direct anon write
-- path: even with a session, INSERT / UPDATE on signature_requests
-- and INSERT on signatures are denied. The field app creates its
-- link through create_signature_request, which accepts a document
-- of its own project and refuses a foreign document or project.
-- ------------------------------------------------------------
RESET ROLE;
INSERT INTO field_sessions (project_id, company_id, session_token, device_id, expires_at)
VALUES (current_setting('signing_smoke.project_id', true)::uuid,
        current_setting('signing_smoke.company_id', true)::uuid,
        'fs_smoke_session_0001', 'smoke-device', NOW() + INTERVAL '1 hour');

-- Another tenant's project and ticket (the session must not reach them)
DO $$
DECLARE
  v_fc UUID := gen_random_uuid();
  v_fp UUID := gen_random_uuid();
  v_ft UUID := gen_random_uuid();
BEGIN
  INSERT INTO companies (id, name, code, office_code)
  VALUES (v_fc, 'Smoke Foreign Co',
          'SMF' || upper(substr(md5(random()::text), 1, 8)),
          'OFF' || upper(substr(md5(random()::text), 1, 8)));
  INSERT INTO projects (id, company_id, name, job_number, contract_value, status)
  VALUES (v_fp, v_fc, 'Smoke Foreign Project', 'SMF-001', 1000, 'active');
  INSERT INTO t_and_m_tickets (id, project_id, work_date, notes, status, created_by_name)
  VALUES (v_ft, v_fp, CURRENT_DATE, 'Foreign ticket', 'pending', 'Foreign Foreman');
  PERFORM set_config('signing_smoke.foreign_project_id', v_fp::text, true);
  PERFORM set_config('signing_smoke.foreign_ticket_id', v_ft::text, true);
END $$;

SET LOCAL ROLE anon;
SELECT set_config('request.headers', '{"x-field-session":"fs_smoke_session_0001"}', true);
-- Positive case first, unguarded: the field app must still be able to
-- create a link for a document in its own project (through the RPC).
DO $$
DECLARE
  v_row JSONB;
BEGIN
  v_row := create_signature_request(
    'tm_ticket',
    current_setting('signing_smoke.ticket2_id', true)::uuid,
    current_setting('signing_smoke.project_id', true)::uuid,
    NULL, NULL, NULL);
  IF v_row IS NULL
     OR v_row->>'company_id' IS DISTINCT FROM current_setting('signing_smoke.company_id', true)
     OR v_row->>'status' IS DISTINCT FROM 'pending'
     OR left(v_row->>'signature_token', 4) IS DISTINCT FROM 'sig_'
     OR v_row->>'created_by' IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: create_signature_request returned an unexpected row: %', v_row;
  END IF;
  PERFORM set_config('signing_smoke.field_request_id', v_row->>'id', true);
END $$;

DO $$
DECLARE
  v_ok INTEGER := 0;
  v_count BIGINT;
BEGIN
  -- Direct INSERT is denied even for the session's own project
  BEGIN
    EXECUTE 'INSERT INTO signature_requests (document_type, document_id, company_id, project_id, signature_token, status) VALUES ($1, $2, $3, $4, $5, $6)'
      USING 'tm_ticket', current_setting('signing_smoke.ticket2_id', true)::uuid,
            current_setting('signing_smoke.company_id', true)::uuid,
            current_setting('signing_smoke.project_id', true)::uuid,
            'sig_smoketest_fld2', 'pending';
    RAISE EXCEPTION 'FAIL: field session can INSERT signature_requests directly';
  EXCEPTION WHEN insufficient_privilege THEN
    v_ok := v_ok + 1;
  END;

  -- Direct UPDATE is denied, even one the old pinned policy allowed
  -- (an open request of the session's own project, no column read)
  BEGIN
    EXECUTE 'UPDATE signature_requests SET expires_at = $1'
      USING NOW() + INTERVAL '2 days';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE EXCEPTION 'FAIL: field session can UPDATE signature_requests directly (% row(s))', v_count;
  EXCEPTION WHEN insufficient_privilege THEN
    v_ok := v_ok + 1;
  END;

  -- Direct INSERT on signatures is denied (public_add_signature is the only path)
  BEGIN
    EXECUTE 'INSERT INTO signatures (signature_request_id, signature_slot, signature_image, signer_name) VALUES ($1, $2, $3, $4)'
      USING current_setting('signing_smoke.field_request_id', true)::uuid, 1,
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            'Forged Signer';
    RAISE EXCEPTION 'FAIL: field session can INSERT signatures directly';
  EXCEPTION WHEN insufficient_privilege THEN
    v_ok := v_ok + 1;
  END;

  -- RPC: a document that is not in the session's project
  BEGIN
    PERFORM create_signature_request('cor', gen_random_uuid(),
      current_setting('signing_smoke.project_id', true)::uuid, NULL, NULL, NULL);
    RAISE EXCEPTION 'FAIL: create_signature_request accepted a document outside the project';
  EXCEPTION WHEN invalid_parameter_value THEN
    v_ok := v_ok + 1;
  END;

  -- RPC: another tenant's ticket named under the session's own project
  BEGIN
    PERFORM create_signature_request('tm_ticket',
      current_setting('signing_smoke.foreign_ticket_id', true)::uuid,
      current_setting('signing_smoke.project_id', true)::uuid, NULL, NULL, NULL);
    RAISE EXCEPTION 'FAIL: create_signature_request accepted a foreign ticket under its own project';
  EXCEPTION WHEN invalid_parameter_value THEN
    v_ok := v_ok + 1;
  END;

  -- RPC: another tenant's project
  BEGIN
    PERFORM create_signature_request('tm_ticket',
      current_setting('signing_smoke.foreign_ticket_id', true)::uuid,
      current_setting('signing_smoke.foreign_project_id', true)::uuid, NULL, NULL, NULL);
    RAISE EXCEPTION 'FAIL: create_signature_request accepted a project the session does not belong to';
  EXCEPTION WHEN insufficient_privilege THEN
    v_ok := v_ok + 1;
  END;

  -- RPC without any session
  PERFORM set_config('request.headers', '{}', true);
  BEGIN
    PERFORM create_signature_request('tm_ticket',
      current_setting('signing_smoke.ticket2_id', true)::uuid,
      current_setting('signing_smoke.project_id', true)::uuid, NULL, NULL, NULL);
    RAISE EXCEPTION 'FAIL: create_signature_request accepted a caller without a session';
  EXCEPTION WHEN insufficient_privilege THEN
    v_ok := v_ok + 1;
  END;
  PERFORM set_config('request.headers', '{"x-field-session":"fs_smoke_session_0001"}', true);

  IF v_ok <> 7 THEN
    RAISE EXCEPTION 'FAIL: expected 7 refusals, got %', v_ok;
  END IF;

  -- ... and not merely by RLS: the table privileges are gone
  IF has_table_privilege('anon', 'public.signature_requests', 'INSERT')
     OR has_table_privilege('anon', 'public.signature_requests', 'UPDATE')
     OR has_table_privilege('anon', 'public.signatures', 'INSERT') THEN
    RAISE EXCEPTION 'FAIL: anon still holds INSERT/UPDATE on signature_requests or INSERT on signatures';
  END IF;
  RAISE NOTICE 'PASS: field session creates its own project''s link via create_signature_request; direct INSERT/UPDATE on signature_requests and INSERT on signatures denied; foreign document / project / no session refused';
  PERFORM set_config('signing_smoke.passes', (current_setting('signing_smoke.passes', true)::int + 1)::text, true);
END $$;

-- ------------------------------------------------------------
-- BACK TO THE OWNER ROLE: verify what landed in the tables
-- ------------------------------------------------------------
RESET ROLE;

DO $$
DECLARE
  v_ticket_id UUID := current_setting('signing_smoke.ticket_id', true)::uuid;
  v_cor_id    UUID := current_setting('signing_smoke.cor_id', true)::uuid;
  v_company_id UUID := current_setting('signing_smoke.company_id', true)::uuid;
  v_sig RECORD;
  v_t   RECORD;
  v_co  RECORD;
  v_n   INTEGER;
BEGIN
  -- T&M signature row
  SELECT s.* INTO v_sig
  FROM signatures s
  JOIN signature_requests sr ON sr.id = s.signature_request_id
  WHERE sr.signature_token = 'sig_smoketest0001';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL: no signatures row for sig_smoketest0001';
  END IF;
  IF v_sig.signature_slot <> 1
     OR v_sig.signer_name <> 'QA GC'
     OR v_sig.signer_title <> 'PM'
     OR v_sig.signer_company <> 'GC Co'
     OR v_sig.user_agent <> 'SmokeAgent/1.0'
     OR v_sig.ip_address IS DISTINCT FROM '203.0.113.9'::inet
     OR v_sig.company_id IS DISTINCT FROM v_company_id
     OR left(v_sig.signature_image, 22) <> 'data:image/png;base64,' THEN
    RAISE EXCEPTION 'FAIL: signatures row unexpected: slot=% name=% ua=% ip=% company=%',
      v_sig.signature_slot, v_sig.signer_name, v_sig.user_agent, v_sig.ip_address, v_sig.company_id;
  END IF;

  SELECT count(*) INTO v_n FROM signatures s
  JOIN signature_requests sr ON sr.id = s.signature_request_id
  WHERE sr.signature_token IN ('sig_smoketest0001', 'sig_smoketest_exp1', 'sig_smoketest_rev1', 'sig_smoketest_2nd1');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected exactly 1 T&M signatures row, found %', v_n;
  END IF;

  -- Ticket mirror + status
  SELECT t.* INTO v_t FROM t_and_m_tickets t WHERE t.id = v_ticket_id;
  IF v_t.status <> 'client_signed'
     OR v_t.gc_signature_name <> 'QA GC'
     OR v_t.gc_signature_title <> 'PM'
     OR v_t.gc_signature_company <> 'GC Co'
     OR v_t.gc_signature_date IS NULL
     OR v_t.gc_signature_data IS NULL
     OR v_t.gc_signature_ip IS DISTINCT FROM '203.0.113.9'::inet THEN
    RAISE EXCEPTION 'FAIL: ticket mirror unexpected: status=% gc_name=% gc_ip=%', v_t.status, v_t.gc_signature_name, v_t.gc_signature_ip;
  END IF;

  -- Request status + view count (1 open view before signing, then completed view not counted)
  SELECT sr.status, sr.view_count, sr.last_viewed_at INTO v_co
  FROM signature_requests sr WHERE sr.signature_token = 'sig_smoketest0001';
  IF v_co.status <> 'completed' OR v_co.view_count <> 1 OR v_co.last_viewed_at IS NULL THEN
    RAISE EXCEPTION 'FAIL: request row unexpected: status=% view_count=%', v_co.status, v_co.view_count;
  END IF;
  SELECT sr.status INTO v_co FROM signature_requests sr WHERE sr.signature_token = 'sig_smoketest_2nd1';
  IF v_co.status <> 'pending' THEN
    RAISE EXCEPTION 'FAIL: rejected second link changed status to %', v_co.status;
  END IF;

  -- Field-session link (create_signature_request) landed with the
  -- project's company and no creator; the refused ones did not
  SELECT count(*) INTO v_n FROM signature_requests sr
  WHERE sr.id = current_setting('signing_smoke.field_request_id', true)::uuid
    AND sr.company_id = v_company_id
    AND sr.project_id = current_setting('signing_smoke.project_id', true)::uuid
    AND sr.document_id = current_setting('signing_smoke.ticket2_id', true)::uuid
    AND sr.status = 'pending'
    AND sr.created_by IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL: field-session link from create_signature_request missing (found %)', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM signature_requests sr
  WHERE sr.signature_token IN ('sig_smoketest_fld2', 'sig_smoketest_fld3', 'sig_attackermint1')
     OR sr.document_id = current_setting('signing_smoke.foreign_ticket_id', true)::uuid;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL: % refused signature_requests row(s) were written', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM signatures s
  WHERE s.signature_request_id = current_setting('signing_smoke.field_request_id', true)::uuid;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL: a directly inserted signatures row was written (% row(s))', v_n;
  END IF;

  -- COR: approved, approved_at, mirror, one history row, request completed
  SELECT co.* INTO v_co FROM change_orders co WHERE co.id = v_cor_id;
  IF v_co.status <> 'approved'
     OR v_co.approved_at IS NULL
     OR v_co.gc_signature_name <> 'QA GC'
     OR v_co.gc_signature_data IS NULL
     OR v_co.gc_signature_ip IS DISTINCT FROM '198.51.100.7'::inet THEN
    RAISE EXCEPTION 'FAIL: COR row unexpected: status=% approved_at=% gc_name=% gc_ip=%', v_co.status, v_co.approved_at, v_co.gc_signature_name, v_co.gc_signature_ip;
  END IF;
  SELECT count(*) INTO v_n FROM cor_status_history h
  WHERE h.change_order_id = v_cor_id AND h.status = 'approved' AND h.notes = 'GC signed via signature link' AND h.changed_by IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected 1 cor_status_history row, found %', v_n;
  END IF;
  SELECT sr.status INTO v_co FROM signature_requests sr WHERE sr.signature_token = 'sig_smoketestcor01';
  IF v_co.status <> 'completed' THEN
    RAISE EXCEPTION 'FAIL: COR request status = % (expected completed)', v_co.status;
  END IF;
  SELECT count(*) INTO v_n FROM signatures s
  JOIN signature_requests sr ON sr.id = s.signature_request_id
  WHERE sr.signature_token = 'sig_smoketestcor01' AND s.user_agent = 'smoke-cor' AND s.company_id = v_company_id;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FAIL: COR signature row missing or user_agent not taken from the request header';
  END IF;

  RAISE NOTICE 'PASS: tables verified — signatures (slot 1, QA GC, UA, ip 203.0.113.9, company_id), ticket client_signed + gc_* mirror, request completed/view_count 1, COR approved + approved_at + 1 history row';
  PERFORM set_config('signing_smoke.passes', (current_setting('signing_smoke.passes', true)::int + 1)::text, true);
END $$;

-- Projection as owner contains none of the excluded keys (acceptance check)
DO $$
DECLARE
  v_txt TEXT;
  v_bad TEXT;
BEGIN
  v_txt := public_get_document_for_signing('sig_smoketest0001')::text;
  IF v_txt IS NULL THEN
    RAISE EXCEPTION 'FAIL: owner cannot load the completed document';
  END IF;
  FOREACH v_bad IN ARRAY ARRAY['rejection_reason', 'approved_by', 'photo_locations', 'cost_per_unit', 'signature_ip'] LOOP
    IF position(v_bad IN v_txt) > 0 THEN
      RAISE EXCEPTION 'FAIL: excluded key % present in the owner projection', v_bad;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS: owner projection contains none of rejection_reason / approved_by / photo_locations / cost_per_unit / signature_ip';
  PERFORM set_config('signing_smoke.passes', (current_setting('signing_smoke.passes', true)::int + 1)::text, true);
END $$;

DO $$
BEGIN
  RAISE NOTICE 'PUBLIC SIGNING SMOKE: all % checks passed (rolled back)', current_setting('signing_smoke.passes', true);
END $$;

ROLLBACK;
