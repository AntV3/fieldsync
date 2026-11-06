-- ============================================================
-- TM TICKET OFFICE EDIT TESTS
-- ============================================================
-- Exercises supabase/migrations/20261105_tm_ticket_office_edit.sql:
-- update_tm_ticket_contents(p_ticket_id, p_fields, p_workers,
-- p_items, p_edit_note), the trg_protect_tm_edit_audit guard and the
-- t_and_m_ticket_edits snapshot table, as the Postgres anon role
-- (field session header) and the authenticated role (JWT claims).
--
-- HOW TO USE:
--   Paste the whole file into the Supabase SQL Editor (or run it
--   with psql -v ON_ERROR_STOP=1) AFTER the migration. Every check
--   is a DO block that RAISEs on failure and prints "PASS: ..." on
--   success. The whole script is ONE transaction that ends in
--   ROLLBACK, so it leaves no rows behind, including its fixtures
--   (companies, projects, users, labor classes, materials, CORs,
--   tickets, invoice).
--
-- EXPECTED: a list of "NOTICE: PASS: ..." lines and a final
--   "NOTICE: TM TICKET OFFICE EDIT TESTS: all N checks passed (rolled back)".
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

SELECT set_config('tm_edit.passes', '0', true);

-- ------------------------------------------------------------
-- (0) Objects, privileges and policies
-- ------------------------------------------------------------
DO $$
DECLARE
  v_fn CONSTANT TEXT := 'public.update_tm_ticket_contents(uuid,jsonb,jsonb,jsonb,text)';
BEGIN
  IF to_regprocedure(v_fn) IS NULL THEN
    RAISE EXCEPTION 'FAIL: update_tm_ticket_contents(uuid,jsonb,jsonb,jsonb,text) missing';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(v_fn)) THEN
    RAISE EXCEPTION 'FAIL: update_tm_ticket_contents is not SECURITY DEFINER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p, unnest(COALESCE(p.proconfig, ARRAY[]::TEXT[])) cfg
    WHERE p.oid = to_regprocedure(v_fn) AND cfg = 'search_path=public, extensions, pg_temp'
  ) THEN
    RAISE EXCEPTION 'FAIL: update_tm_ticket_contents search_path not pinned';
  END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon can EXECUTE update_tm_ticket_contents';
  END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: authenticated cannot EXECUTE update_tm_ticket_contents';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.t_and_m_tickets'::regclass
      AND tgname = 'trg_protect_tm_edit_audit' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'FAIL: trg_protect_tm_edit_audit missing on t_and_m_tickets';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.t_and_m_ticket_edits'::regclass) THEN
    RAISE EXCEPTION 'FAIL: RLS not enabled on t_and_m_ticket_edits';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 't_and_m_ticket_edits') <> 1
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 't_and_m_ticket_edits' AND cmd <> 'SELECT') <> 0 THEN
    RAISE EXCEPTION 'FAIL: t_and_m_ticket_edits must have exactly one policy, FOR SELECT';
  END IF;
  IF has_table_privilege('anon', 'public.t_and_m_ticket_edits', 'SELECT')
     OR has_table_privilege('authenticated', 'public.t_and_m_ticket_edits', 'INSERT') THEN
    RAISE EXCEPTION 'FAIL: t_and_m_ticket_edits grants too wide';
  END IF;

  RAISE NOTICE 'PASS: (0) RPC definer + search_path + EXECUTE authenticated only, audit trigger, t_and_m_ticket_edits RLS with one SELECT policy';
  PERFORM set_config('tm_edit.passes', (current_setting('tm_edit.passes', true)::int + 1)::text, true);
END $$;

-- ------------------------------------------------------------
-- FIXTURES (as the SQL-editor role; RLS does not apply to the owner)
-- ------------------------------------------------------------
DO $$
DECLARE
  v_company_id   UUID := gen_random_uuid();
  v_foreign_co   UUID := gen_random_uuid();
  v_project_id   UUID := gen_random_uuid();
  v_foreign_proj UUID := gen_random_uuid();
  v_office_a     UUID := gen_random_uuid();
  v_office_b     UUID := gen_random_uuid();
  v_foreign_user UUID := gen_random_uuid();
  v_class_a      UUID := gen_random_uuid();
  v_class_x      UUID := gen_random_uuid();
  v_material_a   UUID := gen_random_uuid();
  v_material_x   UUID := gen_random_uuid();
  v_cor_draft    UUID := gen_random_uuid();
  v_cor_approved UUID := gen_random_uuid();
  v_t1 UUID := gen_random_uuid();   -- foreman-signed, not COR-linked
  v_t2 UUID := gen_random_uuid();   -- linked to the draft COR, imported
  v_t2b UUID := gen_random_uuid();  -- another ticket on the draft COR
  v_t3 UUID := gen_random_uuid();   -- billed
  v_t4 UUID := gen_random_uuid();   -- approved, on an invoice
  v_t5 UUID := gen_random_uuid();   -- linked to the approved COR
  v_invoice_id UUID := gen_random_uuid();
BEGIN
  DELETE FROM field_sessions WHERE session_token = 'fs_tmedit_test_0001';

  INSERT INTO companies (id, name, code, office_code)
  VALUES (v_company_id, 'TM Edit Test Co',
          'TME' || upper(substr(md5(random()::text), 1, 8)),
          'OFF' || upper(substr(md5(random()::text), 1, 8))),
         (v_foreign_co, 'TM Edit Foreign Co',
          'TMX' || upper(substr(md5(random()::text), 1, 8)),
          'OFF' || upper(substr(md5(random()::text), 1, 8)));

  INSERT INTO projects (id, company_id, name, job_number, status)
  VALUES (v_project_id,   v_company_id, 'TM Edit Project',         'TME-001', 'active'),
         (v_foreign_proj, v_foreign_co, 'TM Edit Foreign Project', 'TMX-001', 'active');

  INSERT INTO field_sessions (project_id, company_id, session_token, device_id, expires_at)
  VALUES (v_project_id, v_company_id, 'fs_tmedit_test_0001', 'tmedit-test', NOW() + INTERVAL '1 hour');

  -- Office user A (has a name in users), office user B (no name: it
  -- falls back to the auth email), and a user of another company
  INSERT INTO auth.users (id, email) VALUES
    (v_office_a,     'tmedit-office-a@example.invalid'),
    (v_office_b,     'tmedit-office-b@example.invalid'),
    (v_foreign_user, 'tmedit-foreign@example.invalid');
  INSERT INTO users (id, email, name, company_id, role)
  VALUES (v_office_a,     'tmedit-office-a@example.invalid', 'Edit Office A',    v_company_id, 'admin'),
         (v_office_b,     'tmedit-office-b@example.invalid', NULL,               v_company_id, 'member'),
         (v_foreign_user, 'tmedit-foreign@example.invalid',  'TM Edit Foreign',  v_foreign_co, 'admin')
  ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id;
  INSERT INTO user_companies (user_id, company_id, role, status)
  VALUES (v_office_a,     v_company_id, 'admin',  'active'),
         (v_office_b,     v_company_id, 'member', 'active'),
         (v_foreign_user, v_foreign_co, 'admin',  'active')
  ON CONFLICT (user_id, company_id) DO UPDATE SET status = 'active';

  INSERT INTO labor_classes (id, company_id, name, active)
  VALUES (v_class_a, v_company_id, 'TM Edit Journeyman', true),
         (v_class_x, v_foreign_co, 'TM Edit Foreign Class', true);

  INSERT INTO materials_equipment (id, company_id, name, category, unit, cost_per_unit, active)
  VALUES (v_material_a, v_company_id, 'TM Edit Material', 'materials', 'each', 12.5, true),
         (v_material_x, v_foreign_co, 'TM Edit Foreign Material', 'materials', 'each', 9, true);

  INSERT INTO change_orders (id, company_id, project_id, cor_number, title, scope_of_work, period_start, period_end, status)
  VALUES (v_cor_draft,    v_company_id, v_project_id, 'EDIT-COR-1', 'Draft COR',    'Scope', CURRENT_DATE, CURRENT_DATE, 'draft'),
         (v_cor_approved, v_company_id, v_project_id, 'EDIT-COR-2', 'Approved COR', 'Scope', CURRENT_DATE, CURRENT_DATE, 'approved');

  -- T1: foreman-signed, 2 workers (8h; 8h + 2h OT), 1 catalog item qty 3
  INSERT INTO t_and_m_tickets (id, project_id, work_date, ce_pco_number, notes, status, created_by_name,
                               change_order_value,
                               foreman_signature_data, foreman_signature_name, foreman_signature_date)
  VALUES (v_t1, v_project_id, DATE '2026-11-03', 'PCO-7', 'Original description', 'foreman_signed', 'TM Edit Foreman',
          500,
          'data:image/png;base64,iVBORw0KGgo=', 'TM Edit Foreman', NOW());
  INSERT INTO t_and_m_workers (ticket_id, name, role, hours, overtime_hours, time_started, time_ended, labor_class_id)
  VALUES (v_t1, 'Worker One', 'Journeyman', 8, 0, '07:00', '15:30', v_class_a),
         (v_t1, 'Worker Two', 'Journeyman', 8, 2, '07:00', '17:30', v_class_a);
  INSERT INTO t_and_m_items (ticket_id, material_equipment_id, quantity)
  VALUES (v_t1, v_material_a, 3);

  -- T2 + T2b on the draft COR (assigned_cor_id fires the junction
  -- trigger), imported: ticket-sourced lines for both tickets plus a
  -- hand-entered line with no source
  INSERT INTO t_and_m_tickets (id, project_id, work_date, ce_pco_number, notes, status, created_by_name, assigned_cor_id)
  VALUES (v_t2,  v_project_id, DATE '2026-11-03', 'PCO-9', 'COR ticket', 'pending', 'TM Edit Foreman', v_cor_draft),
         (v_t2b, v_project_id, DATE '2026-11-03', NULL,    'Other COR ticket', 'pending', 'TM Edit Foreman', v_cor_draft);
  INSERT INTO t_and_m_workers (ticket_id, name, role, hours, overtime_hours, labor_class_id)
  VALUES (v_t2,  'Cor Worker',   'Journeyman', 8, 0, v_class_a),
         (v_t2b, 'Other Worker', 'Journeyman', 4, 0, v_class_a);
  INSERT INTO t_and_m_items (ticket_id, material_equipment_id, custom_name, custom_category, quantity)
  VALUES (v_t2, v_material_a, NULL, NULL, 5),
         (v_t2, NULL, 'Rented lift', 'Equipment', 1);

  INSERT INTO change_order_labor (change_order_id, labor_class, regular_hours, regular_rate, regular_total, total, source_ticket_id)
  VALUES (v_cor_draft, 'TM Edit Journeyman', 8, 10000, 80000, 80000, v_t2),
         (v_cor_draft, 'TM Edit Journeyman', 4, 10000, 40000, 40000, v_t2b),
         (v_cor_draft, 'Hand-entered',       2, 10000, 20000, 20000, NULL);
  INSERT INTO change_order_materials (change_order_id, description, quantity, unit, unit_cost, total, source_type, source_ticket_id)
  VALUES (v_cor_draft, 'TM Edit Material', 5, 'each', 1250, 6250, 'backup_sheet', v_t2);
  INSERT INTO change_order_equipment (change_order_id, description, quantity, unit, unit_cost, total, source_type, source_ticket_id)
  VALUES (v_cor_draft, 'Rented lift', 1, 'day', 30000, 30000, 'backup_sheet', v_t2);
  UPDATE change_order_ticket_associations
  SET data_imported = true, imported_at = NOW(), import_status = 'completed',
      import_failed_at = NULL, import_error = NULL
  WHERE change_order_id = v_cor_draft AND ticket_id IN (v_t2, v_t2b);

  -- T3 billed; T4 approved but on an invoice; T5 on the approved COR
  INSERT INTO t_and_m_tickets (id, project_id, work_date, notes, status, created_by_name, assigned_cor_id)
  VALUES (v_t3, v_project_id, DATE '2026-11-02', 'Billed ticket',   'billed',   'TM Edit Foreman', NULL),
         (v_t4, v_project_id, DATE '2026-11-02', 'Invoiced ticket', 'approved', 'TM Edit Foreman', NULL),
         (v_t5, v_project_id, DATE '2026-11-02', 'Locked ticket',   'pending',  'TM Edit Foreman', v_cor_approved);
  INSERT INTO t_and_m_workers (ticket_id, name, role, hours, overtime_hours)
  VALUES (v_t3, 'Billed Worker', 'Laborer', 8, 0),
         (v_t4, 'Invoiced Worker', 'Laborer', 8, 0),
         (v_t5, 'Locked Worker', 'Laborer', 8, 0);

  INSERT INTO invoices (id, project_id, company_id, invoice_number, status)
  VALUES (v_invoice_id, v_project_id, v_company_id, 'INV-9001', 'draft');
  INSERT INTO invoice_items (invoice_id, item_type, reference_id, description, amount)
  VALUES (v_invoice_id, 'tm_ticket', v_t4, 'Time & Material - 11/2/2026', 80000);

  PERFORM set_config('tm_edit.company_id',   v_company_id::text, true);
  PERFORM set_config('tm_edit.project_id',   v_project_id::text, true);
  PERFORM set_config('tm_edit.office_a',     v_office_a::text, true);
  PERFORM set_config('tm_edit.office_b',     v_office_b::text, true);
  PERFORM set_config('tm_edit.foreign_user', v_foreign_user::text, true);
  PERFORM set_config('tm_edit.class_a',      v_class_a::text, true);
  PERFORM set_config('tm_edit.class_x',      v_class_x::text, true);
  PERFORM set_config('tm_edit.material_a',   v_material_a::text, true);
  PERFORM set_config('tm_edit.material_x',   v_material_x::text, true);
  PERFORM set_config('tm_edit.cor_draft',    v_cor_draft::text, true);
  PERFORM set_config('tm_edit.t1',  v_t1::text, true);
  PERFORM set_config('tm_edit.t2',  v_t2::text, true);
  PERFORM set_config('tm_edit.t2b', v_t2b::text, true);
  PERFORM set_config('tm_edit.t3',  v_t3::text, true);
  PERFORM set_config('tm_edit.t4',  v_t4::text, true);
  PERFORM set_config('tm_edit.t5',  v_t5::text, true);

  RAISE NOTICE 'PASS: fixtures created (company %, project %, draft COR %)', v_company_id, v_project_id, v_cor_draft;
  PERFORM set_config('tm_edit.passes', (current_setting('tm_edit.passes', true)::int + 1)::text, true);
END $$;

-- ============================================================
-- AS OFFICE USER A (authenticated, member of the ticket's company)
-- ============================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.headers', '{}', true);
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('tm_edit.office_a', true), 'role', 'authenticated')::text, true);

-- (a) Replace workers + items on a signed ticket
DO $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := update_tm_ticket_contents(
    current_setting('tm_edit.t1', true)::uuid,
    jsonb_build_object('ce_pco_number', 'PCO-8'),
    jsonb_build_array(
      jsonb_build_object('name', 'Worker One', 'role', 'Journeyman', 'hours', 8, 'overtime_hours', 0,
                         'time_started', '07:00', 'time_ended', '15:30',
                         'labor_class_id', current_setting('tm_edit.class_a', true)),
      jsonb_build_object('name', 'Worker Two', 'role', 'Journeyman', 'hours', '8', 'overtime_hours', 0,
                         'time_started', '07:00', 'time_ended', '15:30',
                         'labor_class_id', current_setting('tm_edit.class_a', true)),
      jsonb_build_object('name', 'Jane Doe', 'role', 'Laborer', 'hours', 4, 'overtime_hours', '',
                         'time_started', '', 'time_ended', '', 'labor_class_id', '')
    ),
    jsonb_build_array(
      jsonb_build_object('material_equipment_id', current_setting('tm_edit.material_a', true), 'quantity', 5)
    ),
    'Foreman double-counted OT'
  );

  IF (v_res->>'contents_changed')::boolean IS DISTINCT FROM true
     OR (v_res->>'cor_resync_required')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL: (a) flags unexpected: %', v_res - 'ticket';
  END IF;
  IF v_res->'ticket'->>'id' <> current_setting('tm_edit.t1', true)
     OR (v_res->'ticket'->>'edit_count')::int <> 1
     OR (v_res->'ticket'->>'edited_after_signature')::boolean IS DISTINCT FROM true
     OR v_res->'ticket'->>'edited_by_name' <> 'Edit Office A'
     OR v_res->'ticket'->>'ce_pco_number' <> 'PCO-8' THEN
    RAISE EXCEPTION 'FAIL: (a) returned ticket unexpected: %', v_res->'ticket';
  END IF;
END $$;
RESET ROLE;

DO $$
DECLARE
  v_t1 UUID := current_setting('tm_edit.t1', true)::uuid;
  t    RECORD;
  e    RECORD;
  v_n  BIGINT;
  v_ot NUMERIC;
BEGIN
  SELECT * INTO t FROM t_and_m_tickets WHERE id = v_t1;
  IF t.edit_count <> 1
     OR NOT t.edited_after_signature
     OR t.edited_by_user_id <> current_setting('tm_edit.office_a', true)::uuid
     OR t.edited_by_name <> 'Edit Office A'
     OR t.last_edit_note <> 'Foreman double-counted OT'
     OR t.edited_at IS NULL
     OR t.ce_pco_number <> 'PCO-8'
     OR t.notes <> 'Original description'          -- key absent: unchanged
     OR t.work_date <> DATE '2026-11-03'           -- key absent: unchanged
     OR t.change_order_value <> 500                -- key absent: unchanged
     OR t.status <> 'foreman_signed'               -- status untouched
     OR t.foreman_signature_data IS NULL THEN      -- signature untouched
    RAISE EXCEPTION 'FAIL: (a) ticket row unexpected: %', to_jsonb(t) - 'foreman_signature_data';
  END IF;

  SELECT count(*), sum(overtime_hours) INTO v_n, v_ot FROM t_and_m_workers WHERE ticket_id = v_t1;
  IF v_n <> 3 OR v_ot <> 0 THEN
    RAISE EXCEPTION 'FAIL: (a) workers: % rows, % OT (expected 3, 0)', v_n, v_ot;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM t_and_m_workers WHERE ticket_id = v_t1 AND name = 'Jane Doe'
                 AND hours = 4 AND overtime_hours = 0 AND labor_class_id IS NULL AND time_started IS NULL) THEN
    RAISE EXCEPTION 'FAIL: (a) Jane Doe not inserted with empty strings as NULL / 0';
  END IF;
  IF (SELECT count(*) FROM t_and_m_items WHERE ticket_id = v_t1) <> 1
     OR (SELECT quantity FROM t_and_m_items WHERE ticket_id = v_t1) <> 5 THEN
    RAISE EXCEPTION 'FAIL: (a) items not replaced (expected one item, qty 5)';
  END IF;

  SELECT count(*) INTO v_n FROM t_and_m_ticket_edits WHERE ticket_id = v_t1;
  SELECT * INTO e FROM t_and_m_ticket_edits WHERE ticket_id = v_t1;
  IF v_n <> 1
     OR NOT e.contents_changed
     OR NOT e.had_signature
     OR e.edited_by_user_id <> current_setting('tm_edit.office_a', true)::uuid
     OR e.edited_by_name <> 'Edit Office A'
     OR e.note <> 'Foreman double-counted OT'
     OR jsonb_array_length(e.before_snapshot->'workers') <> 2
     OR jsonb_array_length(e.after_snapshot->'workers') <> 3
     OR (e.before_snapshot->'items'->0->>'quantity')::numeric <> 3
     OR (e.after_snapshot->'items'->0->>'quantity')::numeric <> 5
     OR e.before_snapshot->>'ce_pco_number' <> 'PCO-7'
     OR e.after_snapshot->>'ce_pco_number' <> 'PCO-8' THEN
    RAISE EXCEPTION 'FAIL: (a) edit row unexpected (% rows): %', v_n, to_jsonb(e);
  END IF;

  RAISE NOTICE 'PASS: (a) signed ticket: workers/items replaced, audit columns (edit_count 1, edited_after_signature, editor from users), edit row (contents_changed, 2 workers before / 3 after)';
  PERFORM set_config('tm_edit.passes', (current_setting('tm_edit.passes', true)::int + 1)::text, true);
END $$;

-- (b) Second edit, description (and value) only -> contents_changed false
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := update_tm_ticket_contents(
    current_setting('tm_edit.t1', true)::uuid,
    jsonb_build_object('notes', 'Corrected description', 'change_order_value', '430.50'),
    jsonb_build_array(
      jsonb_build_object('name', 'Jane Doe', 'role', 'Laborer', 'hours', 4, 'overtime_hours', 0),
      jsonb_build_object('name', 'Worker Two', 'role', 'Journeyman', 'hours', 8, 'overtime_hours', 0,
                         'time_started', '07:00', 'time_ended', '15:30',
                         'labor_class_id', current_setting('tm_edit.class_a', true)),
      jsonb_build_object('name', 'Worker One', 'role', 'Journeyman', 'hours', 8.00, 'overtime_hours', 0,
                         'time_started', '07:00', 'time_ended', '15:30',
                         'labor_class_id', current_setting('tm_edit.class_a', true))
    ),
    jsonb_build_array(
      jsonb_build_object('material_equipment_id', current_setting('tm_edit.material_a', true), 'quantity', '5')
    ),
    '   '
  );
  IF (v_res->>'contents_changed')::boolean IS DISTINCT FROM false
     OR (v_res->>'cor_resync_required')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL: (b) flags unexpected: %', v_res - 'ticket';
  END IF;
END $$;
RESET ROLE;

DO $$
DECLARE
  v_t1 UUID := current_setting('tm_edit.t1', true)::uuid;
  t    RECORD;
BEGIN
  SELECT * INTO t FROM t_and_m_tickets WHERE id = v_t1;
  IF t.edit_count <> 2 OR NOT t.edited_after_signature
     OR t.notes <> 'Corrected description'
     OR t.change_order_value <> 430.50
     OR t.last_edit_note IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: (b) ticket row unexpected: %', to_jsonb(t) - 'foreman_signature_data';
  END IF;
  IF (SELECT count(*) FROM t_and_m_ticket_edits WHERE ticket_id = v_t1) <> 2
     OR (SELECT count(*) FROM t_and_m_ticket_edits WHERE ticket_id = v_t1 AND NOT contents_changed) <> 1 THEN
    RAISE EXCEPTION 'FAIL: (b) expected 2 edit rows, exactly one with contents_changed = false';
  END IF;
  RAISE NOTICE 'PASS: (b) notes + value only, workers in another order: contents_changed false, edit_count 2, second edit row';
  PERFORM set_config('tm_edit.passes', (current_setting('tm_edit.passes', true)::int + 1)::text, true);
END $$;

-- ------------------------------------------------------------
-- (c) COR-linked ticket. First a description-only edit: no COR side
--     effect at all. Then an hours/quantity edit by office user B
--     (no profile row): only this ticket's ticket-sourced lines on the
--     COR are deleted, the association is flagged for re-sync, a
--     cor_status_history note is written.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_cor UUID := current_setting('tm_edit.cor_draft', true)::uuid;
BEGIN
  PERFORM set_config('tm_edit.cor_total_before',
    (SELECT cor_total::text FROM change_orders WHERE id = v_cor), true);
  PERFORM set_config('tm_edit.history_before',
    (SELECT count(*)::text FROM cor_status_history WHERE change_order_id = v_cor), true);
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := update_tm_ticket_contents(
    current_setting('tm_edit.t2', true)::uuid,
    jsonb_build_object('notes', 'COR ticket, clearer description'),
    jsonb_build_array(
      jsonb_build_object('name', 'Cor Worker', 'role', 'Journeyman', 'hours', 8, 'overtime_hours', 0,
                         'labor_class_id', current_setting('tm_edit.class_a', true))),
    jsonb_build_array(
      jsonb_build_object('custom_name', 'Rented lift', 'custom_category', 'Equipment', 'quantity', 1),
      jsonb_build_object('material_equipment_id', current_setting('tm_edit.material_a', true), 'quantity', 5)),
    NULL
  );
  IF (v_res->>'contents_changed')::boolean IS DISTINCT FROM false
     OR (v_res->>'cor_resync_required')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL: (c1) flags unexpected: %', v_res - 'ticket';
  END IF;
END $$;
RESET ROLE;

DO $$
DECLARE
  v_cor UUID := current_setting('tm_edit.cor_draft', true)::uuid;
  v_t2  UUID := current_setting('tm_edit.t2', true)::uuid;
  a     RECORD;
BEGIN
  IF (SELECT count(*) FROM change_order_labor     WHERE change_order_id = v_cor AND source_ticket_id = v_t2) <> 1
     OR (SELECT count(*) FROM change_order_materials WHERE change_order_id = v_cor AND source_ticket_id = v_t2) <> 1
     OR (SELECT count(*) FROM change_order_equipment WHERE change_order_id = v_cor AND source_ticket_id = v_t2) <> 1 THEN
    RAISE EXCEPTION 'FAIL: (c1) a description-only edit removed COR lines';
  END IF;
  SELECT * INTO a FROM change_order_ticket_associations WHERE change_order_id = v_cor AND ticket_id = v_t2;
  IF NOT a.data_imported OR a.import_status <> 'completed' OR a.import_error IS NOT NULL OR a.import_failed_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: (c1) association changed by a description-only edit: %', to_jsonb(a);
  END IF;
  IF (SELECT count(*) FROM cor_status_history WHERE change_order_id = v_cor)::text
     <> current_setting('tm_edit.history_before', true) THEN
    RAISE EXCEPTION 'FAIL: (c1) a description-only edit wrote cor_status_history';
  END IF;
  IF (SELECT cor_total::text FROM change_orders WHERE id = v_cor) <> current_setting('tm_edit.cor_total_before', true) THEN
    RAISE EXCEPTION 'FAIL: (c1) COR total changed on a description-only edit';
  END IF;
  RAISE NOTICE 'PASS: (c1) description-only edit of a COR-linked ticket: contents_changed false, COR lines / association / history / total untouched';
  PERFORM set_config('tm_edit.passes', (current_setting('tm_edit.passes', true)::int + 1)::text, true);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('tm_edit.office_b', true), 'role', 'authenticated')::text, true);
DO $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := update_tm_ticket_contents(
    current_setting('tm_edit.t2', true)::uuid,
    '{}'::jsonb,
    jsonb_build_array(
      jsonb_build_object('name', 'Cor Worker', 'role', 'Journeyman', 'hours', 6, 'overtime_hours', 0,
                         'labor_class_id', current_setting('tm_edit.class_a', true))),
    jsonb_build_array(
      jsonb_build_object('custom_name', 'Rented lift', 'custom_category', 'Equipment', 'quantity', 1),
      jsonb_build_object('material_equipment_id', current_setting('tm_edit.material_a', true), 'quantity', 2)),
    'Hours and quantity corrected'
  );
  IF (v_res->>'contents_changed')::boolean IS DISTINCT FROM true
     OR (v_res->>'cor_resync_required')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL: (c2) flags unexpected: %', v_res - 'ticket';
  END IF;
  IF (v_res->'ticket'->>'edited_after_signature')::boolean IS DISTINCT FROM false
     OR v_res->'ticket'->>'edited_by_name' <> 'tmedit-office-b@example.invalid' THEN
    RAISE EXCEPTION 'FAIL: (c2) unsigned ticket flagged, or editor name not the auth email fallback: %', v_res->'ticket';
  END IF;
END $$;
RESET ROLE;

DO $$
DECLARE
  v_cor  UUID := current_setting('tm_edit.cor_draft', true)::uuid;
  v_t2   UUID := current_setting('tm_edit.t2', true)::uuid;
  v_t2b  UUID := current_setting('tm_edit.t2b', true)::uuid;
  a      RECORD;
  b      RECORD;
  h      RECORD;
BEGIN
  IF (SELECT count(*) FROM change_order_labor     WHERE change_order_id = v_cor AND source_ticket_id = v_t2) <> 0
     OR (SELECT count(*) FROM change_order_materials WHERE change_order_id = v_cor AND source_ticket_id = v_t2) <> 0
     OR (SELECT count(*) FROM change_order_equipment WHERE change_order_id = v_cor AND source_ticket_id = v_t2) <> 0 THEN
    RAISE EXCEPTION 'FAIL: (c2) ticket-sourced COR lines of the edited ticket not deleted';
  END IF;
  IF (SELECT count(*) FROM change_order_labor WHERE change_order_id = v_cor AND source_ticket_id = v_t2b) <> 1
     OR (SELECT count(*) FROM change_order_labor WHERE change_order_id = v_cor AND source_ticket_id IS NULL) <> 1 THEN
    RAISE EXCEPTION 'FAIL: (c2) lines of another ticket or hand-entered lines were deleted';
  END IF;
  IF (SELECT cor_total FROM change_orders WHERE id = v_cor) >= current_setting('tm_edit.cor_total_before', true)::int THEN
    RAISE EXCEPTION 'FAIL: (c2) COR total not recalculated down (before %, after %)',
      current_setting('tm_edit.cor_total_before', true), (SELECT cor_total FROM change_orders WHERE id = v_cor);
  END IF;

  SELECT * INTO a FROM change_order_ticket_associations WHERE change_order_id = v_cor AND ticket_id = v_t2;
  IF NOT a.data_imported OR a.import_status <> 'failed' OR a.import_failed_at IS NULL
     OR a.import_error IS DISTINCT FROM 'Ticket edited - COR cost lines must be re-synced' THEN
    RAISE EXCEPTION 'FAIL: (c2) association not flagged for re-sync: %', to_jsonb(a);
  END IF;
  SELECT * INTO b FROM change_order_ticket_associations WHERE change_order_id = v_cor AND ticket_id = v_t2b;
  IF NOT b.data_imported OR b.import_status <> 'completed' THEN
    RAISE EXCEPTION 'FAIL: (c2) the other ticket''s association changed: %', to_jsonb(b);
  END IF;

  IF (SELECT count(*) FROM cor_status_history WHERE change_order_id = v_cor)
     <> current_setting('tm_edit.history_before', true)::int + 1 THEN
    RAISE EXCEPTION 'FAIL: (c2) expected exactly one new cor_status_history row';
  END IF;
  SELECT * INTO h FROM cor_status_history WHERE change_order_id = v_cor ORDER BY changed_at DESC LIMIT 1;
  IF h.status <> 'draft'
     OR h.changed_by IS DISTINCT FROM current_setting('tm_edit.office_b', true)::uuid
     OR h.notes NOT LIKE 'T&M ticket 2026-11-03 (PCO-9) edited by tmedit-office-b@example.invalid - Hours and quantity corrected.%' THEN
    RAISE EXCEPTION 'FAIL: (c2) history row unexpected: %', to_jsonb(h);
  END IF;

  IF (SELECT hours FROM t_and_m_workers WHERE ticket_id = v_t2) <> 6
     OR (SELECT quantity FROM t_and_m_items WHERE ticket_id = v_t2 AND material_equipment_id IS NOT NULL) <> 2 THEN
    RAISE EXCEPTION 'FAIL: (c2) ticket contents not replaced';
  END IF;

  RAISE NOTICE 'PASS: (c2) COR-linked crew/material edit: only this ticket''s ticket-sourced lines deleted, COR re-priced, association data_imported/failed/error set, one history note';
  PERFORM set_config('tm_edit.passes', (current_setting('tm_edit.passes', true)::int + 1)::text, true);
END $$;

-- ------------------------------------------------------------
-- (d) billed, (e) invoiced, (f) COR approved -> P0001, verbatim text
-- ------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('tm_edit.office_a', true), 'role', 'authenticated')::text, true);
DO $$
DECLARE
  r       RECORD;
  v_state TEXT;
  v_msg   TEXT;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('d', current_setting('tm_edit.t3', true), 'This ticket has been billed and can no longer be edited.'),
      ('e', current_setting('tm_edit.t4', true), 'This ticket is on invoice INV-9001 and can no longer be edited.'),
      ('f', current_setting('tm_edit.t5', true), 'This ticket is locked: linked to EDIT-COR-2 which is approved')
    ) AS c(label, ticket, expected)
  LOOP
    v_state := 'no error';
    v_msg := NULL;
    BEGIN
      PERFORM update_tm_ticket_contents(
        r.ticket::uuid,
        jsonb_build_object('notes', 'Should not save'),
        '[{"name":"Someone","hours":1}]'::jsonb,
        '[]'::jsonb,
        NULL);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    END;
    IF v_state <> 'P0001' OR v_msg IS DISTINCT FROM r.expected THEN
      RAISE EXCEPTION 'FAIL: (%) expected P0001 "%", got % "%"', r.label, r.expected, v_state, v_msg;
    END IF;
  END LOOP;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM t_and_m_tickets
    WHERE id IN (current_setting('tm_edit.t3', true)::uuid,
                 current_setting('tm_edit.t4', true)::uuid,
                 current_setting('tm_edit.t5', true)::uuid)
      AND (edit_count <> 0 OR notes = 'Should not save')
  ) OR EXISTS (
    SELECT 1 FROM t_and_m_workers
    WHERE ticket_id IN (current_setting('tm_edit.t3', true)::uuid,
                        current_setting('tm_edit.t4', true)::uuid,
                        current_setting('tm_edit.t5', true)::uuid)
      AND name = 'Someone'
  ) THEN
    RAISE EXCEPTION 'FAIL: (d-f) a refused ticket was changed';
  END IF;
  RAISE NOTICE 'PASS: (d) billed -> P0001 "This ticket has been billed and can no longer be edited."';
  RAISE NOTICE 'PASS: (e) approved but on invoice INV-9001 -> P0001 naming the invoice';
  RAISE NOTICE 'PASS: (f) linked to an approved COR -> P0001 "This ticket is locked: linked to EDIT-COR-2 which is approved"; nothing changed';
  PERFORM set_config('tm_edit.passes', (current_setting('tm_edit.passes', true)::int + 3)::text, true);
END $$;

-- ------------------------------------------------------------
-- (g) Invalid payloads -> 22023, nothing changed. Includes a labor
--     class of another company.
-- ------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('tm_edit.t1_workers_before',
    (SELECT string_agg(name || ':' || hours || ':' || overtime_hours, ',' ORDER BY name)
     FROM t_and_m_workers WHERE ticket_id = current_setting('tm_edit.t1', true)::uuid), true);
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  r       RECORD;
  v_state TEXT;
  v_msg   TEXT;
  c_ok_workers CONSTANT JSONB := '[{"name":"Worker One","hours":8}]';
  c_ok_items   CONSTANT JSONB := '[]';
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('foreign labor class', '{}'::jsonb,
         jsonb_build_array(jsonb_build_object('name', 'Worker One', 'hours', 8,
                           'labor_class_id', current_setting('tm_edit.class_x', true))),
         c_ok_items, 'Labor class does not belong to this company'),
      ('foreign material', '{}'::jsonb, c_ok_workers,
         jsonb_build_array(jsonb_build_object('material_equipment_id', current_setting('tm_edit.material_x', true),
                           'quantity', 1)),
         'Material or equipment does not belong to this company'),
      ('blank description', '{"notes":"   "}'::jsonb, c_ok_workers, c_ok_items, 'Description is required'),
      ('no workers', '{}'::jsonb, '[]'::jsonb, c_ok_items, 'At least one worker is required'),
      ('no hours', '{}'::jsonb, '[{"name":"Idle","hours":0,"overtime_hours":0}]'::jsonb, c_ok_items,
         'At least one worker needs hours or overtime hours'),
      ('negative hours', '{}'::jsonb, '[{"name":"Neg","hours":8,"overtime_hours":-1}]'::jsonb, c_ok_items,
         'Hours cannot be negative (Neg)'),
      ('item qty 0', '{}'::jsonb, c_ok_workers, '[{"custom_name":"Thing","quantity":0}]'::jsonb,
         'Item quantity must be greater than 0'),
      ('item without name or id', '{}'::jsonb, c_ok_workers, '[{"quantity":2}]'::jsonb,
         'Every item needs a name or a catalog material'),
      ('bad work date', '{"work_date":"2026-13-45"}'::jsonb, c_ok_workers, c_ok_items, 'Work date is not a valid date'),
      ('negative value', '{"change_order_value":-5}'::jsonb, c_ok_workers, c_ok_items, 'Change order value cannot be negative')
    ) AS c(label, fields, workers, items, expected)
  LOOP
    v_state := 'no error';
    v_msg := NULL;
    BEGIN
      PERFORM update_tm_ticket_contents(
        current_setting('tm_edit.t1', true)::uuid, r.fields, r.workers, r.items, 'should not save');
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    END;
    IF v_state <> '22023' OR v_msg IS DISTINCT FROM r.expected THEN
      RAISE EXCEPTION 'FAIL: (g) % expected 22023 "%", got % "%"', r.label, r.expected, v_state, v_msg;
    END IF;
  END LOOP;
END $$;
RESET ROLE;

DO $$
DECLARE
  v_t1 UUID := current_setting('tm_edit.t1', true)::uuid;
BEGIN
  IF (SELECT edit_count FROM t_and_m_tickets WHERE id = v_t1) <> 2
     OR (SELECT count(*) FROM t_and_m_ticket_edits WHERE ticket_id = v_t1) <> 2
     OR (SELECT string_agg(name || ':' || hours || ':' || overtime_hours, ',' ORDER BY name)
         FROM t_and_m_workers WHERE ticket_id = v_t1) IS DISTINCT FROM current_setting('tm_edit.t1_workers_before', true)
     OR (SELECT count(*) FROM t_and_m_workers WHERE ticket_id = v_t1 AND labor_class_id = current_setting('tm_edit.class_x', true)::uuid) <> 0 THEN
    RAISE EXCEPTION 'FAIL: (g) a rejected payload changed the ticket';
  END IF;
  RAISE NOTICE 'PASS: (g) labor class of another company -> 22023 and nothing changed (also: foreign material, blank description, no workers, no hours, negative hours, qty 0, nameless item, bad date, negative value)';
  PERFORM set_config('tm_edit.passes', (current_setting('tm_edit.passes', true)::int + 1)::text, true);
END $$;

-- ------------------------------------------------------------
-- (h) anon (field PIN session) has no EXECUTE
-- ------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.headers', '{"x-field-session":"fs_tmedit_test_0001"}', true);
DO $$
DECLARE
  v_state TEXT := 'no error';
  v_msg   TEXT;
BEGIN
  BEGIN
    PERFORM update_tm_ticket_contents(
      current_setting('tm_edit.t1', true)::uuid, '{}'::jsonb,
      '[{"name":"Field","hours":1}]'::jsonb, '[]'::jsonb, NULL);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  IF v_state <> '42501' OR v_msg NOT LIKE 'permission denied for function update_tm_ticket_contents%' THEN
    RAISE EXCEPTION 'FAIL: (h) anon with a field session: expected 42501 permission denied, got % "%"', v_state, v_msg;
  END IF;
END $$;
RESET ROLE;
SELECT set_config('request.headers', '{}', true);

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.update_tm_ticket_contents(uuid,jsonb,jsonb,jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: (h) anon holds EXECUTE';
  END IF;
  RAISE NOTICE 'PASS: (h) anon with a valid field session -> permission denied for function (no EXECUTE)';
  PERFORM set_config('tm_edit.passes', (current_setting('tm_edit.passes', true)::int + 1)::text, true);
END $$;

-- ------------------------------------------------------------
-- (i) authenticated of another company, no JWT subject, unknown
--     ticket -> 42501 'Not authorized for this project'
-- ------------------------------------------------------------
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  r       RECORD;
  v_state TEXT;
  v_msg   TEXT;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('foreign company user', current_setting('tm_edit.foreign_user', true), current_setting('tm_edit.t1', true)),
      ('no JWT subject',       NULL,                                         current_setting('tm_edit.t1', true)),
      ('unknown ticket',       current_setting('tm_edit.office_a', true),     gen_random_uuid()::text)
    ) AS c(label, sub, ticket)
  LOOP
    PERFORM set_config('request.jwt.claims',
      CASE WHEN r.sub IS NULL THEN json_build_object('role', 'authenticated')::text
           ELSE json_build_object('sub', r.sub, 'role', 'authenticated')::text END, true);
    v_state := 'no error';
    v_msg := NULL;
    BEGIN
      PERFORM update_tm_ticket_contents(
        r.ticket::uuid, '{"notes":"Hijacked"}'::jsonb,
        '[{"name":"Intruder","hours":1}]'::jsonb, '[]'::jsonb, NULL);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    END;
    IF v_state <> '42501' OR v_msg IS DISTINCT FROM 'Not authorized for this project' THEN
      RAISE EXCEPTION 'FAIL: (i) % expected 42501 "Not authorized for this project", got % "%"', r.label, v_state, v_msg;
    END IF;
  END LOOP;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM t_and_m_tickets WHERE notes = 'Hijacked')
     OR EXISTS (SELECT 1 FROM t_and_m_workers WHERE name = 'Intruder') THEN
    RAISE EXCEPTION 'FAIL: (i) an unauthorized call changed data';
  END IF;
  RAISE NOTICE 'PASS: (i) office user of another company / no auth.uid() / unknown ticket -> 42501 "Not authorized for this project", nothing written';
  PERFORM set_config('tm_edit.passes', (current_setting('tm_edit.passes', true)::int + 1)::text, true);
END $$;

-- ------------------------------------------------------------
-- (j) Audit trigger: same-company authenticated cannot forge the
--     audit columns with a direct UPDATE (or INSERT), but a normal
--     status UPDATE still works
-- ------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('tm_edit.office_a', true), 'role', 'authenticated')::text, true);
DO $$
DECLARE
  v_state TEXT;
  v_msg   TEXT;
  v_rows  BIGINT;
BEGIN
  -- the row is visible and updatable through RLS for this user
  v_state := 'no error';
  BEGIN
    UPDATE t_and_m_tickets SET edited_after_signature = false, edit_count = 0
    WHERE id = current_setting('tm_edit.t1', true)::uuid;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  IF v_state <> '42501'
     OR v_msg IS DISTINCT FROM 'Edit audit columns can only be changed through update_tm_ticket_contents()' THEN
    RAISE EXCEPTION 'FAIL: (j) direct audit UPDATE: expected 42501 from the trigger, got % "%"', v_state, v_msg;
  END IF;

  v_state := 'no error';
  BEGIN
    UPDATE t_and_m_tickets SET edited_by_name = 'Somebody else'
    WHERE id = current_setting('tm_edit.t1', true)::uuid;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  IF v_state <> '42501' THEN
    RAISE EXCEPTION 'FAIL: (j) direct edited_by_name UPDATE: expected 42501, got % "%"', v_state, v_msg;
  END IF;

  v_state := 'no error';
  BEGIN
    INSERT INTO t_and_m_tickets (project_id, work_date, notes, status, created_by_name, edited_after_signature, edit_count)
    VALUES (current_setting('tm_edit.project_id', true)::uuid, CURRENT_DATE, 'Forged', 'pending', 'Forger', true, 3);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  IF v_state <> '42501' THEN
    RAISE EXCEPTION 'FAIL: (j) INSERT with audit values: expected 42501, got % "%"', v_state, v_msg;
  END IF;

  UPDATE t_and_m_tickets SET status = 'approved'
  WHERE id = current_setting('tm_edit.t1', true)::uuid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'FAIL: (j) normal status UPDATE affected % rows (expected 1)', v_rows;
  END IF;

  -- a plain INSERT (defaults) still works for the API role
  INSERT INTO t_and_m_tickets (project_id, work_date, notes, status, created_by_name)
  VALUES (current_setting('tm_edit.project_id', true)::uuid, CURRENT_DATE, 'Plain insert', 'pending', 'Office');
END $$;
RESET ROLE;

DO $$
DECLARE
  t RECORD;
BEGIN
  SELECT * INTO t FROM t_and_m_tickets WHERE id = current_setting('tm_edit.t1', true)::uuid;
  IF t.status <> 'approved' OR NOT t.edited_after_signature OR t.edit_count <> 2
     OR t.edited_by_name <> 'Edit Office A' THEN
    RAISE EXCEPTION 'FAIL: (j) ticket after direct writes unexpected: %', to_jsonb(t) - 'foreman_signature_data';
  END IF;
  IF EXISTS (SELECT 1 FROM t_and_m_tickets WHERE notes = 'Forged')
     OR NOT EXISTS (SELECT 1 FROM t_and_m_tickets WHERE notes = 'Plain insert' AND edit_count = 0) THEN
    RAISE EXCEPTION 'FAIL: (j) forged insert stored, or plain insert missing';
  END IF;
  RAISE NOTICE 'PASS: (j) authenticated direct UPDATE of edited_after_signature / edit_count / edited_by_name -> 42501 from trg_protect_tm_edit_audit; forged INSERT refused; normal status UPDATE and plain INSERT still work';
  PERFORM set_config('tm_edit.passes', (current_setting('tm_edit.passes', true)::int + 1)::text, true);
END $$;

-- ------------------------------------------------------------
-- (k) Approved ticket stays editable (founder default); the RPC keeps
--     the status and may set change_order_value
-- ------------------------------------------------------------
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := update_tm_ticket_contents(
    current_setting('tm_edit.t1', true)::uuid,
    '{"change_order_value": 512.25}'::jsonb,
    '[{"name":"Worker One","role":"Journeyman","hours":7}]'::jsonb,
    '[]'::jsonb,
    'Approved ticket correction');
  IF v_res->'ticket'->>'status' <> 'approved'
     OR (v_res->'ticket'->>'change_order_value')::numeric <> 512.25
     OR (v_res->>'contents_changed')::boolean IS DISTINCT FROM true
     OR (v_res->'ticket'->>'edit_count')::int <> 3 THEN
    RAISE EXCEPTION 'FAIL: (k) approved ticket edit unexpected: %', v_res;
  END IF;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM t_and_m_items WHERE ticket_id = current_setting('tm_edit.t1', true)::uuid) <> 0 THEN
    RAISE EXCEPTION 'FAIL: (k) items not cleared by an empty items list';
  END IF;
  RAISE NOTICE 'PASS: (k) approved ticket editable: status stays approved, change_order_value applied, empty items list clears items';
  PERFORM set_config('tm_edit.passes', (current_setting('tm_edit.passes', true)::int + 1)::text, true);
END $$;

-- ------------------------------------------------------------
-- (l) t_and_m_ticket_edits: readable by project members only, not
--     writable by the API roles
-- ------------------------------------------------------------
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_n     BIGINT;
  v_state TEXT := 'no error';
BEGIN
  SELECT count(*) INTO v_n FROM t_and_m_ticket_edits
  WHERE ticket_id = current_setting('tm_edit.t1', true)::uuid;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'FAIL: (l) office user A sees % edit rows of T1 (expected 3)', v_n;
  END IF;

  BEGIN
    INSERT INTO t_and_m_ticket_edits (ticket_id, before_snapshot, after_snapshot)
    VALUES (current_setting('tm_edit.t1', true)::uuid, '{}', '{}');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  IF v_state <> '42501' THEN
    RAISE EXCEPTION 'FAIL: (l) direct INSERT into t_and_m_ticket_edits: expected 42501, got %', v_state;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', current_setting('tm_edit.foreign_user', true), 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_n FROM t_and_m_ticket_edits;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL: (l) user of another company sees % edit rows', v_n;
  END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

DO $$
BEGIN
  RAISE NOTICE 'PASS: (l) t_and_m_ticket_edits: project member reads, other company reads nothing, direct INSERT denied';
  PERFORM set_config('tm_edit.passes', (current_setting('tm_edit.passes', true)::int + 1)::text, true);
END $$;

-- ------------------------------------------------------------
-- SUMMARY
-- ------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'TM TICKET OFFICE EDIT TESTS: all % checks passed (rolled back)',
    current_setting('tm_edit.passes', true);
END $$;

ROLLBACK;
