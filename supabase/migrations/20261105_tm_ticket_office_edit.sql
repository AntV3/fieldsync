-- ============================================================
-- MIGRATION: Office corrects a T&M ticket without deleting it
-- Date: 2026-11-05
-- Author: FieldSync engineering
-- ============================================================
--
-- PURPOSE:
--   There is no edit path for a T&M ticket. Fixing a wrong hour
--   count means Delete + re-create, which loses signatures, approval,
--   change_order_value, the COR association and photos. This adds one
--   atomic, server-enforced edit RPC for office users:
--
--   update_tm_ticket_contents(p_ticket_id, p_fields, p_workers,
--                             p_items, p_edit_note) RETURNS JSONB
--     SECURITY DEFINER, search_path pinned, EXECUTE for authenticated
--     only (no anon, so a field PIN session cannot call it).
--
--     1. auth.uid() required and can_access_project(ticket's project)
--        -> otherwise 42501 'Not authorized for this project' (an
--        unknown ticket id answers the same, so ids cannot be probed).
--     2. The ticket row is locked (FOR UPDATE); every linked COR row
--        is locked FOR NO KEY UPDATE so it cannot be approved while
--        the edit commits.
--     3. Refusals (P0001, messages shown verbatim by the UI):
--          status 'billed'
--            'This ticket has been billed and can no longer be edited.'
--          on an invoice (invoice_items.item_type = 'tm_ticket',
--          reference_id = ticket, invoice not 'void')
--            'This ticket is on invoice <invoice_number> and can no
--             longer be edited.'
--          linked COR (assigned_cor_id or an association row) whose
--          status is not draft / pending_approval
--            'This ticket is locked: linked to <cor_number> which is
--             <status>'
--     4. Payload validation (22023): p_fields keys work_date,
--        ce_pco_number, notes (non-blank when present),
--        change_order_value (applied only when the key is present;
--        null clears it); p_workers a non-empty array (<= 200), every
--        worker named, no negative hours, at least one worker with
--        hours or overtime > 0, labor_class_id of the ticket's
--        company; p_items an array (<= 200, may be empty), quantity
--        > 0, a custom_name or a material_equipment_id of the ticket's
--        company. Values are coerced through jsonb_populate_record(set)
--        against the live row types.
--     5. Workers and items are replaced (DELETE + INSERT); the ticket's
--        fields and the six audit columns are updated; status,
--        signatures, approval and photos are untouched.
--     6. contents_changed = the worker + item content (order-free)
--        differs before vs after. When it does and the ticket is
--        COR-linked, for each linked COR: the ticket-sourced
--        change_order_labor / _materials / _equipment rows
--        (source_ticket_id = ticket) are deleted (the recalc triggers
--        re-price the COR at once), the association is set to
--        data_imported = true, import_status = 'failed',
--        import_failed_at = NOW(), import_error = 'Ticket edited - COR
--        cost lines must be re-synced' (so the existing Import Failed +
--        Retry Sync UI shows and CORDetail's auto-import stays out),
--        and a cor_status_history note is written. The client then
--        re-imports with importTicketDataToCOR, exactly like Retry
--        Sync. A fields-only edit touches no COR row.
--     7. One t_and_m_ticket_edits row per call with content-ordered
--        before / after snapshots (the record of what a signer signed).
--     Returns {ticket: to_jsonb(row), contents_changed,
--              cor_resync_required}.
--
--   Audit columns are server-derived. The UPDATE policy on
--   t_and_m_tickets is column-unrestricted and column REVOKE cannot
--   subtract from a table grant, so trg_protect_tm_edit_audit raises
--   42501 when the anon or authenticated role changes any of the six
--   columns (on UPDATE) or supplies a non-default value (on INSERT).
--   The definer RPC (runs as the owner), service_role and the SQL
--   editor are not affected.
--
--   Compatible with 20261104_offline_tm_submit.sql (client_submission_id
--   is neither read nor written here; create_tm_ticket_full inserts
--   defaults for the new columns) and 20261105_public_signing_rpcs.sql
--   (its ticket projection is an allowlist, so the new columns are not
--   exposed to outside signers).
--
-- AFFECTED TABLES:
-- - t_and_m_tickets: + edited_at, edited_by_user_id, edited_by_name,
--   edit_count, edited_after_signature, last_edit_note;
--   + trigger trg_protect_tm_edit_audit
-- - t_and_m_ticket_edits: NEW (RLS, one SELECT policy, no client write)
-- - t_and_m_workers / t_and_m_items / change_order_labor /
--   change_order_materials / change_order_equipment /
--   change_order_ticket_associations / cor_status_history: written only
--   by the RPC (no DDL)
--
-- ROLLBACK AVAILABLE: Yes
--   supabase/rollbacks/20261105_tm_ticket_office_edit_rollback.sql
--
-- IDEMPOTENT — safe to re-run.
-- ============================================================

-- ============================================================
-- PRE-FLIGHT CHECKS
-- ============================================================
-- Fails the migration loudly if a table, column or column type the
-- RPC depends on differs from what it was written against, and prints
-- the live policies and grants on the three T&M tables (the base T&M
-- tables are not defined in the repo; this output is the record).
DO $$
DECLARE
  r       RECORD;
  v_type  TEXT;
  v_ok    BOOLEAN;
BEGIN
  -- Tables
  FOR r IN
    SELECT t FROM unnest(ARRAY[
      't_and_m_tickets', 't_and_m_workers', 't_and_m_items',
      'projects', 'labor_classes', 'materials_equipment',
      'change_orders', 'change_order_labor', 'change_order_materials', 'change_order_equipment',
      'change_order_ticket_associations', 'cor_status_history',
      'invoices', 'invoice_items', 'profiles'
    ]) AS u(t)
  LOOP
    IF to_regclass('public.' || r.t) IS NULL THEN
      RAISE EXCEPTION 'Precondition failed: table public.% does not exist', r.t;
    END IF;
  END LOOP;

  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Precondition failed: auth.users does not exist';
  END IF;

  IF to_regprocedure('public.can_access_project(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Precondition failed: function can_access_project(uuid) does not exist';
  END IF;

  -- Columns and type families the RPC reads, writes or coerces into
  FOR r IN
    SELECT * FROM (VALUES
      ('t_and_m_tickets', 'id', 'uuid'),
      ('t_and_m_tickets', 'project_id', 'uuid'),
      ('t_and_m_tickets', 'work_date', 'date'),
      ('t_and_m_tickets', 'ce_pco_number', 'text'),
      ('t_and_m_tickets', 'notes', 'text'),
      ('t_and_m_tickets', 'status', 'text'),
      ('t_and_m_tickets', 'change_order_value', 'numeric'),
      ('t_and_m_tickets', 'assigned_cor_id', 'uuid'),
      ('t_and_m_workers', 'id', 'uuid'),
      ('t_and_m_workers', 'ticket_id', 'uuid'),
      ('t_and_m_workers', 'name', 'text'),
      ('t_and_m_workers', 'role', 'text'),
      ('t_and_m_workers', 'hours', 'numeric'),
      ('t_and_m_workers', 'overtime_hours', 'numeric'),
      ('t_and_m_workers', 'time_started', 'time'),
      ('t_and_m_workers', 'time_ended', 'time'),
      ('t_and_m_workers', 'labor_class_id', 'uuid'),
      ('t_and_m_items', 'id', 'uuid'),
      ('t_and_m_items', 'ticket_id', 'uuid'),
      ('t_and_m_items', 'material_equipment_id', 'uuid'),
      ('t_and_m_items', 'custom_name', 'text'),
      ('t_and_m_items', 'custom_category', 'text'),
      ('t_and_m_items', 'quantity', 'numeric'),
      ('projects', 'id', 'uuid'),
      ('projects', 'company_id', 'uuid'),
      ('labor_classes', 'id', 'uuid'),
      ('labor_classes', 'company_id', 'uuid'),
      ('materials_equipment', 'id', 'uuid'),
      ('materials_equipment', 'company_id', 'uuid'),
      ('change_orders', 'id', 'uuid'),
      ('change_orders', 'cor_number', 'text'),
      ('change_orders', 'status', 'text'),
      ('change_order_labor', 'change_order_id', 'uuid'),
      ('change_order_labor', 'source_ticket_id', 'uuid'),
      ('change_order_materials', 'change_order_id', 'uuid'),
      ('change_order_materials', 'source_ticket_id', 'uuid'),
      ('change_order_equipment', 'change_order_id', 'uuid'),
      ('change_order_equipment', 'source_ticket_id', 'uuid'),
      ('change_order_ticket_associations', 'change_order_id', 'uuid'),
      ('change_order_ticket_associations', 'ticket_id', 'uuid'),
      ('change_order_ticket_associations', 'data_imported', 'bool'),
      ('change_order_ticket_associations', 'import_status', 'text'),
      ('change_order_ticket_associations', 'import_failed_at', 'ts'),
      ('change_order_ticket_associations', 'import_error', 'text'),
      ('cor_status_history', 'change_order_id', 'uuid'),
      ('cor_status_history', 'status', 'text'),
      ('cor_status_history', 'changed_by', 'uuid'),
      ('cor_status_history', 'notes', 'text'),
      ('cor_status_history', 'changed_at', 'ts'),
      ('invoices', 'id', 'uuid'),
      ('invoices', 'invoice_number', 'text'),
      ('invoices', 'status', 'text'),
      ('invoice_items', 'invoice_id', 'uuid'),
      ('invoice_items', 'item_type', 'text'),
      ('invoice_items', 'reference_id', 'uuid'),
      ('profiles', 'id', 'uuid')
    ) AS c(tbl, col, family)
  LOOP
    SELECT data_type INTO v_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = r.col;

    IF v_type IS NULL THEN
      RAISE EXCEPTION 'Precondition failed: column %.% does not exist', r.tbl, r.col;
    END IF;

    v_ok := CASE r.family
      WHEN 'uuid'    THEN v_type = 'uuid'
      WHEN 'text'    THEN v_type IN ('text', 'character varying', 'character')
      WHEN 'numeric' THEN v_type IN ('numeric', 'real', 'double precision')
      WHEN 'time'    THEN v_type IN ('text', 'character varying', 'time without time zone', 'time with time zone')
      WHEN 'date'    THEN v_type = 'date'
      WHEN 'bool'    THEN v_type = 'boolean'
      WHEN 'ts'      THEN v_type IN ('timestamp with time zone', 'timestamp without time zone')
      ELSE false
    END;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Precondition failed: %.% is % (expected a % type)', r.tbl, r.col, v_type, r.family;
    END IF;
  END LOOP;

  -- Workers and items are replaced (DELETE + INSERT) on every edit.
  -- A required column the RPC does not fill would make every edit
  -- fail; any other extra column is not carried across an edit.
  FOR r IN
    SELECT c.table_name, c.column_name, c.is_nullable, c.column_default
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND ((c.table_name = 't_and_m_workers' AND c.column_name NOT IN
             ('id', 'ticket_id', 'name', 'role', 'hours', 'overtime_hours',
              'time_started', 'time_ended', 'labor_class_id', 'created_at'))
        OR (c.table_name = 't_and_m_items' AND c.column_name NOT IN
             ('id', 'ticket_id', 'material_equipment_id', 'custom_name',
              'custom_category', 'quantity', 'created_at')))
    ORDER BY 1, 2
  LOOP
    IF r.is_nullable = 'NO' AND r.column_default IS NULL THEN
      RAISE EXCEPTION 'Precondition failed: %.% is NOT NULL without a default; update_tm_ticket_contents() cannot re-insert rows',
        r.table_name, r.column_name;
    END IF;
    RAISE NOTICE 'PRE-FLIGHT: %.% is not carried across an edit (workers/items are re-inserted)', r.table_name, r.column_name;
  END LOOP;

  -- Live state of the three T&M tables, for the migration log
  FOR r IN
    SELECT tablename, policyname, cmd, roles::text AS roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('t_and_m_tickets', 't_and_m_workers', 't_and_m_items')
    ORDER BY 1, 2
  LOOP
    RAISE NOTICE 'PRE-FLIGHT policy: % | % | % | % | using=% | check=%',
      r.tablename, r.policyname, r.cmd, r.roles, r.qual, r.with_check;
  END LOOP;

  FOR r IN
    SELECT table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('t_and_m_tickets', 't_and_m_workers', 't_and_m_items')
      AND grantee IN ('anon', 'authenticated')
    GROUP BY 1, 2
    ORDER BY 1, 2
  LOOP
    RAISE NOTICE 'PRE-FLIGHT grant: % | % | %', r.table_name, r.grantee, r.privs;
  END LOOP;

  -- Risk 1 of LAUNCH_READINESS item 4: a client-writable UPDATE/DELETE
  -- path on workers/items makes the RPC's refusals advisory for
  -- hand-written client writes (the office app makes none).
  FOR r IN
    SELECT tablename, policyname, cmd, roles::text AS roles
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('t_and_m_workers', 't_and_m_items')
      AND cmd IN ('UPDATE', 'DELETE', 'ALL')
      AND (roles && ARRAY['authenticated', 'anon', 'public']::name[])
    ORDER BY 1, 2
  LOOP
    RAISE NOTICE 'PRE-FLIGHT risk: % policy "%" (%) lets API roles change workers/items directly; update_tm_ticket_contents() checks do not bind those writes',
      r.tablename, r.policyname, r.cmd;
  END LOOP;
END $$;

-- ============================================================
-- MIGRATION
-- ============================================================

-- ------------------------------------------------------------
-- 1. Audit columns on t_and_m_tickets (server-derived)
-- ------------------------------------------------------------
ALTER TABLE t_and_m_tickets
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edited_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edited_by_name TEXT,
  ADD COLUMN IF NOT EXISTS edit_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS edited_after_signature BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_edit_note TEXT;

COMMENT ON COLUMN t_and_m_tickets.edited_at IS 'Last office edit (update_tm_ticket_contents). Server-set.';
COMMENT ON COLUMN t_and_m_tickets.edited_by_user_id IS 'auth.users id of the last editor. Server-set.';
COMMENT ON COLUMN t_and_m_tickets.edited_by_name IS 'Display name of the last editor (profiles / auth.users). Server-set.';
COMMENT ON COLUMN t_and_m_tickets.edit_count IS 'Number of office edits. Server-set.';
COMMENT ON COLUMN t_and_m_tickets.edited_after_signature IS 'Sticky: true once any edit happened while a foreman / client / GC signature was present. Server-set.';
COMMENT ON COLUMN t_and_m_tickets.last_edit_note IS 'Reason given with the last edit (may be NULL). Server-set.';

-- ------------------------------------------------------------
-- 2. Audit-column guard for the API roles
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_tm_edit_audit_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  -- current_user is the API role for PostgREST requests and the
  -- function owner inside update_tm_ticket_contents() (definer).
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.edited_at IS NOT NULL
         OR NEW.edited_by_user_id IS NOT NULL
         OR NEW.edited_by_name IS NOT NULL
         OR NEW.edit_count IS DISTINCT FROM 0
         OR NEW.edited_after_signature IS DISTINCT FROM false
         OR NEW.last_edit_note IS NOT NULL THEN
        RAISE EXCEPTION 'Edit audit columns can only be changed through update_tm_ticket_contents()'
          USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.edited_at IS DISTINCT FROM OLD.edited_at
       OR NEW.edited_by_user_id IS DISTINCT FROM OLD.edited_by_user_id
       OR NEW.edited_by_name IS DISTINCT FROM OLD.edited_by_name
       OR NEW.edit_count IS DISTINCT FROM OLD.edit_count
       OR NEW.edited_after_signature IS DISTINCT FROM OLD.edited_after_signature
       OR NEW.last_edit_note IS DISTINCT FROM OLD.last_edit_note THEN
      RAISE EXCEPTION 'Edit audit columns can only be changed through update_tm_ticket_contents()'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION protect_tm_edit_audit_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_tm_edit_audit ON t_and_m_tickets;
CREATE TRIGGER trg_protect_tm_edit_audit
  BEFORE INSERT OR UPDATE ON t_and_m_tickets
  FOR EACH ROW EXECUTE FUNCTION protect_tm_edit_audit_columns();

-- ------------------------------------------------------------
-- 3. Edit snapshots (write-only from the RPC; readable by the
--    ticket's project members; no client write path)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS t_and_m_ticket_edits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id         UUID NOT NULL REFERENCES t_and_m_tickets(id) ON DELETE CASCADE,
  edited_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  edited_by_name    TEXT,
  edited_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note              TEXT,
  had_signature     BOOLEAN NOT NULL DEFAULT false,
  contents_changed  BOOLEAN NOT NULL DEFAULT false,
  before_snapshot   JSONB NOT NULL,
  after_snapshot    JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tm_ticket_edits_ticket
  ON t_and_m_ticket_edits (ticket_id, edited_at DESC);

COMMENT ON TABLE t_and_m_ticket_edits IS
  'One row per update_tm_ticket_contents() call: who, when, why, whether a signature was present, and the ticket content before / after. Written only by that SECURITY DEFINER function.';

ALTER TABLE t_and_m_ticket_edits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Project members can view ticket edits" ON t_and_m_ticket_edits;
CREATE POLICY "Project members can view ticket edits"
  ON t_and_m_ticket_edits FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM t_and_m_tickets t
    WHERE t.id = t_and_m_ticket_edits.ticket_id
      AND can_access_project(t.project_id)
  ));

-- Supabase default privileges grant ALL on new tables to anon and
-- authenticated; take that back and leave authenticated SELECT only.
REVOKE ALL ON t_and_m_ticket_edits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON t_and_m_ticket_edits TO authenticated;

-- ------------------------------------------------------------
-- 4. update_tm_ticket_contents
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_tm_ticket_contents(
  p_ticket_id UUID,
  p_fields    JSONB,
  p_workers   JSONB,
  p_items     JSONB,
  p_edit_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  c_max_rows   CONSTANT INTEGER := 200;
  c_uuid_re    CONSTANT TEXT := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  c_num_re     CONSTANT TEXT := '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$';
  c_cor_edit   CONSTANT TEXT[] := ARRAY['draft', 'pending_approval'];
  c_resync_err CONSTANT TEXT := 'Ticket edited - COR cost lines must be re-synced';
  v_uid        UUID := auth.uid();
  v_project_id UUID;
  v_company_id UUID;
  v_ticket     t_and_m_tickets%ROWTYPE;
  v_new        t_and_m_tickets%ROWTYPE;
  v_row        t_and_m_tickets%ROWTYPE;
  v_fields     JSONB;
  v_workers    JSONB := '[]'::jsonb;
  v_items      JSONB := '[]'::jsonb;
  v_elem       JSONB;
  v_val        JSONB;
  v_ord        BIGINT;
  v_key        TEXT;
  v_txt        TEXT;
  v_num        NUMERIC;
  v_hours      NUMERIC;
  v_ot         NUMERIC;
  v_any_hours  BOOLEAN := false;
  v_name       TEXT;
  v_class_txt  TEXT;
  v_mat_txt    TEXT;
  v_invoice    TEXT;
  v_cor        RECORD;
  v_cor_ids    UUID[];
  v_had_sig    BOOLEAN;
  v_editor     TEXT;
  v_note       TEXT;
  v_before     JSONB;
  v_after      JSONB;
  v_changed    BOOLEAN;
  v_resync     BOOLEAN := false;
  v_label      TEXT;
BEGIN
  -- ---- 1. Caller and access -------------------------------------------
  IF v_uid IS NULL OR p_ticket_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized for this project' USING ERRCODE = '42501';
  END IF;

  SELECT t.project_id INTO v_project_id FROM t_and_m_tickets t WHERE t.id = p_ticket_id;
  IF NOT FOUND OR NOT COALESCE(can_access_project(v_project_id), false) THEN
    RAISE EXCEPTION 'Not authorized for this project' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ticket FROM t_and_m_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND
     OR v_ticket.project_id IS DISTINCT FROM v_project_id THEN
    RAISE EXCEPTION 'Not authorized for this project' USING ERRCODE = '42501';
  END IF;

  SELECT p.company_id INTO v_company_id FROM projects p WHERE p.id = v_ticket.project_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized for this project' USING ERRCODE = '42501';
  END IF;

  -- ---- 2. Billed / invoiced / COR lock --------------------------------
  IF v_ticket.status = 'billed' THEN
    RAISE EXCEPTION 'This ticket has been billed and can no longer be edited.' USING ERRCODE = 'P0001';
  END IF;

  SELECT i.invoice_number INTO v_invoice
  FROM invoice_items ii
  JOIN invoices i ON i.id = ii.invoice_id
  WHERE ii.item_type = 'tm_ticket'
    AND ii.reference_id = p_ticket_id
    AND i.status IS DISTINCT FROM 'void'
  ORDER BY i.invoice_number
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'This ticket is on invoice % and can no longer be edited.', v_invoice USING ERRCODE = 'P0001';
  END IF;

  SELECT array_agg(DISTINCT x.cor_id) INTO v_cor_ids
  FROM (
    SELECT v_ticket.assigned_cor_id AS cor_id
    UNION
    SELECT a.change_order_id FROM change_order_ticket_associations a WHERE a.ticket_id = p_ticket_id
  ) x
  WHERE x.cor_id IS NOT NULL;
  v_cor_ids := COALESCE(v_cor_ids, ARRAY[]::UUID[]);

  FOR v_cor IN
    SELECT c.id, c.cor_number, c.status
    FROM change_orders c
    WHERE c.id = ANY (v_cor_ids)
    ORDER BY c.id
    FOR NO KEY UPDATE
  LOOP
    IF NOT (v_cor.status = ANY (c_cor_edit)) THEN
      RAISE EXCEPTION 'This ticket is locked: linked to % which is %',
        v_cor.cor_number, replace(v_cor.status, '_', ' ')
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  -- ---- 3. Fields -----------------------------------------------------
  v_fields := COALESCE(p_fields, '{}'::jsonb);
  IF jsonb_typeof(v_fields) = 'null' THEN
    v_fields := '{}'::jsonb;
  END IF;
  IF jsonb_typeof(v_fields) <> 'object' THEN
    RAISE EXCEPTION 'Ticket fields must be an object' USING ERRCODE = '22023';
  END IF;

  v_new := v_ticket;

  IF v_fields ? 'work_date' THEN
    v_txt := NULLIF(btrim(v_fields->>'work_date'), '');
    IF v_txt IS NULL THEN
      RAISE EXCEPTION 'Work date is required' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_new := jsonb_populate_record(v_new, jsonb_build_object('work_date', v_txt));
    EXCEPTION WHEN data_exception THEN
      RAISE EXCEPTION 'Work date is not a valid date' USING ERRCODE = '22023';
    END;
  END IF;

  IF v_fields ? 'ce_pco_number' THEN
    v_new.ce_pco_number := left(NULLIF(btrim(v_fields->>'ce_pco_number'), ''), 100);
  END IF;

  IF v_fields ? 'notes' THEN
    IF jsonb_typeof(v_fields->'notes') IS DISTINCT FROM 'string'
       OR btrim(v_fields->>'notes') = '' THEN
      RAISE EXCEPTION 'Description is required' USING ERRCODE = '22023';
    END IF;
    v_new.notes := left(v_fields->>'notes', 10000);
  END IF;

  IF v_fields ? 'change_order_value' THEN
    v_val := v_fields->'change_order_value';
    IF jsonb_typeof(v_val) = 'null'
       OR (jsonb_typeof(v_val) = 'string' AND btrim(v_val #>> '{}') = '') THEN
      v_new.change_order_value := NULL;
    ELSE
      IF jsonb_typeof(v_val) = 'number' THEN
        v_num := (v_val #>> '{}')::numeric;
      ELSIF jsonb_typeof(v_val) = 'string' AND btrim(v_val #>> '{}') ~ c_num_re THEN
        v_num := btrim(v_val #>> '{}')::numeric;
      ELSE
        RAISE EXCEPTION 'Change order value must be a number' USING ERRCODE = '22023';
      END IF;
      IF v_num < 0 THEN
        RAISE EXCEPTION 'Change order value cannot be negative' USING ERRCODE = '22023';
      END IF;
      BEGIN
        v_new := jsonb_populate_record(v_new, jsonb_build_object('change_order_value', v_num));
      EXCEPTION WHEN data_exception THEN
        RAISE EXCEPTION 'Change order value is too large' USING ERRCODE = '22023';
      END;
    END IF;
  END IF;

  -- ---- 4. Workers ----------------------------------------------------
  IF p_workers IS NULL OR jsonb_typeof(p_workers) <> 'array' OR jsonb_array_length(p_workers) = 0 THEN
    RAISE EXCEPTION 'At least one worker is required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_workers) > c_max_rows THEN
    RAISE EXCEPTION 'A ticket can have at most % workers', c_max_rows USING ERRCODE = '22023';
  END IF;

  FOR v_elem, v_ord IN
    SELECT e, o FROM jsonb_array_elements(p_workers) WITH ORDINALITY AS t(e, o)
  LOOP
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RAISE EXCEPTION 'Worker % is not valid', v_ord USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_elem->'name') IS DISTINCT FROM 'string' OR btrim(v_elem->>'name') = '' THEN
      RAISE EXCEPTION 'Every worker needs a name' USING ERRCODE = '22023';
    END IF;
    v_name := left(btrim(v_elem->>'name'), 200);

    FOREACH v_key IN ARRAY ARRAY['hours', 'overtime_hours'] LOOP
      v_val := v_elem->v_key;
      IF v_val IS NULL OR jsonb_typeof(v_val) = 'null'
         OR (jsonb_typeof(v_val) = 'string' AND btrim(v_val #>> '{}') = '') THEN
        v_num := 0;
      ELSIF jsonb_typeof(v_val) = 'number' THEN
        v_num := (v_val #>> '{}')::numeric;
      ELSIF jsonb_typeof(v_val) = 'string' AND btrim(v_val #>> '{}') ~ c_num_re THEN
        v_num := btrim(v_val #>> '{}')::numeric;
      ELSE
        RAISE EXCEPTION 'Hours for % must be a number', v_name USING ERRCODE = '22023';
      END IF;
      IF v_num < 0 THEN
        RAISE EXCEPTION 'Hours cannot be negative (%)', v_name USING ERRCODE = '22023';
      END IF;
      IF v_key = 'hours' THEN v_hours := v_num; ELSE v_ot := v_num; END IF;
    END LOOP;
    IF v_hours > 0 OR v_ot > 0 THEN
      v_any_hours := true;
    END IF;

    v_class_txt := NULLIF(btrim(v_elem->>'labor_class_id'), '');
    IF v_class_txt IS NOT NULL AND v_class_txt !~ c_uuid_re THEN
      RAISE EXCEPTION 'Labor class for % is not valid', v_name USING ERRCODE = '22023';
    END IF;

    v_workers := v_workers || jsonb_build_array(jsonb_build_object(
      'name',           v_name,
      'role',           left(NULLIF(btrim(v_elem->>'role'), ''), 100),
      'hours',          v_hours,
      'overtime_hours', v_ot,
      'time_started',   left(NULLIF(btrim(v_elem->>'time_started'), ''), 50),
      'time_ended',     left(NULLIF(btrim(v_elem->>'time_ended'), ''), 50),
      'labor_class_id', v_class_txt
    ));
  END LOOP;

  IF NOT v_any_hours THEN
    RAISE EXCEPTION 'At least one worker needs hours or overtime hours' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_workers) AS w(e)
    WHERE w.e->>'labor_class_id' IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM labor_classes lc
        WHERE lc.id = (w.e->>'labor_class_id')::uuid
          AND lc.company_id = v_company_id
      )
  ) THEN
    RAISE EXCEPTION 'Labor class does not belong to this company' USING ERRCODE = '22023';
  END IF;

  -- Coerce to the live column types before anything is written
  BEGIN
    PERFORM 1 FROM jsonb_populate_recordset(NULL::t_and_m_workers, v_workers);
  EXCEPTION WHEN data_exception THEN
    RAISE EXCEPTION 'Worker hours or start/end times are not valid' USING ERRCODE = '22023';
  END;

  -- ---- 5. Items ------------------------------------------------------
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Items must be a list' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) > c_max_rows THEN
    RAISE EXCEPTION 'A ticket can have at most % items', c_max_rows USING ERRCODE = '22023';
  END IF;

  FOR v_elem, v_ord IN
    SELECT e, o FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(e, o)
  LOOP
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RAISE EXCEPTION 'Item % is not valid', v_ord USING ERRCODE = '22023';
    END IF;

    v_mat_txt := NULLIF(btrim(v_elem->>'material_equipment_id'), '');
    IF v_mat_txt IS NOT NULL AND v_mat_txt !~ c_uuid_re THEN
      RAISE EXCEPTION 'Item % has an invalid material', v_ord USING ERRCODE = '22023';
    END IF;
    v_name := left(NULLIF(btrim(v_elem->>'custom_name'), ''), 200);
    IF v_mat_txt IS NULL AND v_name IS NULL THEN
      RAISE EXCEPTION 'Every item needs a name or a catalog material' USING ERRCODE = '22023';
    END IF;

    v_val := v_elem->'quantity';
    IF jsonb_typeof(v_val) = 'number' THEN
      v_num := (v_val #>> '{}')::numeric;
    ELSIF jsonb_typeof(v_val) = 'string' AND btrim(v_val #>> '{}') ~ c_num_re THEN
      v_num := btrim(v_val #>> '{}')::numeric;
    ELSE
      v_num := NULL;
    END IF;
    IF v_num IS NULL OR v_num <= 0 THEN
      RAISE EXCEPTION 'Item quantity must be greater than 0' USING ERRCODE = '22023';
    END IF;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'material_equipment_id', v_mat_txt,
      'custom_name',           v_name,
      'custom_category',       left(NULLIF(btrim(v_elem->>'custom_category'), ''), 100),
      'quantity',              v_num
    ));
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_items) AS i(e)
    WHERE i.e->>'material_equipment_id' IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM materials_equipment me
        WHERE me.id = (i.e->>'material_equipment_id')::uuid
          AND me.company_id = v_company_id
      )
  ) THEN
    RAISE EXCEPTION 'Material or equipment does not belong to this company' USING ERRCODE = '22023';
  END IF;

  BEGIN
    PERFORM 1 FROM jsonb_populate_recordset(NULL::t_and_m_items, v_items);
  EXCEPTION WHEN data_exception THEN
    RAISE EXCEPTION 'Item quantity is not valid' USING ERRCODE = '22023';
  END;

  -- ---- 6. Editor, signature state, before snapshot -------------------
  v_had_sig := EXISTS (
    SELECT 1 FROM jsonb_each_text(to_jsonb(v_ticket)) AS s(k, v)
    WHERE s.k IN ('foreman_signature_data', 'client_signature_data', 'gc_signature_data')
      AND NULLIF(btrim(s.v), '') IS NOT NULL
  );

  SELECT COALESCE(NULLIF(btrim(to_jsonb(p)->>'full_name'), ''),
                  NULLIF(btrim(to_jsonb(p)->>'name'), ''))
  INTO v_editor
  FROM profiles p WHERE p.id = v_uid;

  IF v_editor IS NULL THEN
    SELECT COALESCE(NULLIF(btrim(to_jsonb(u)->'raw_user_meta_data'->>'full_name'), ''),
                    NULLIF(btrim(to_jsonb(u)->'raw_user_meta_data'->>'name'), ''),
                    NULLIF(btrim(u.email), ''))
    INTO v_editor
    FROM auth.users u WHERE u.id = v_uid;
  END IF;
  v_editor := left(COALESCE(v_editor, 'Office user'), 200);

  v_note := left(NULLIF(btrim(p_edit_note), ''), 1000);

  v_before := jsonb_build_object(
    'work_date',          v_ticket.work_date,
    'ce_pco_number',      v_ticket.ce_pco_number,
    'notes',              v_ticket.notes,
    'change_order_value', v_ticket.change_order_value,
    'status',             v_ticket.status,
    'workers', (SELECT COALESCE(jsonb_agg(o ORDER BY o->>'name', o::text), '[]'::jsonb)
                FROM (SELECT jsonb_build_object(
                               'name', w.name, 'role', w.role,
                               'hours', w.hours, 'overtime_hours', w.overtime_hours,
                               'time_started', w.time_started, 'time_ended', w.time_ended,
                               'labor_class_id', w.labor_class_id) AS o
                      FROM t_and_m_workers w WHERE w.ticket_id = p_ticket_id) s),
    'items',   (SELECT COALESCE(jsonb_agg(o ORDER BY COALESCE(o->>'custom_name', o->>'material_equipment_id'), o::text), '[]'::jsonb)
                FROM (SELECT jsonb_build_object(
                               'material_equipment_id', i.material_equipment_id,
                               'custom_name', i.custom_name,
                               'custom_category', i.custom_category,
                               'quantity', i.quantity) AS o
                      FROM t_and_m_items i WHERE i.ticket_id = p_ticket_id) s)
  );

  -- ---- 7. Write ------------------------------------------------------
  UPDATE t_and_m_tickets
  SET work_date              = v_new.work_date,
      ce_pco_number          = v_new.ce_pco_number,
      notes                  = v_new.notes,
      change_order_value     = v_new.change_order_value,
      edited_at              = NOW(),
      edited_by_user_id      = v_uid,
      edited_by_name         = v_editor,
      edit_count             = COALESCE(edit_count, 0) + 1,
      edited_after_signature = COALESCE(edited_after_signature, false) OR v_had_sig,
      last_edit_note         = v_note
  WHERE id = p_ticket_id
  RETURNING * INTO v_row;

  DELETE FROM t_and_m_workers WHERE ticket_id = p_ticket_id;
  INSERT INTO t_and_m_workers (
    ticket_id, name, role, hours, overtime_hours, time_started, time_ended, labor_class_id
  )
  SELECT p_ticket_id, w.name, w.role, w.hours, w.overtime_hours, w.time_started, w.time_ended, w.labor_class_id
  FROM jsonb_populate_recordset(NULL::t_and_m_workers, v_workers) AS w;

  DELETE FROM t_and_m_items WHERE ticket_id = p_ticket_id;
  IF jsonb_array_length(v_items) > 0 THEN
    INSERT INTO t_and_m_items (
      ticket_id, material_equipment_id, custom_name, custom_category, quantity
    )
    SELECT p_ticket_id, i.material_equipment_id, i.custom_name, i.custom_category, i.quantity
    FROM jsonb_populate_recordset(NULL::t_and_m_items, v_items) AS i;
  END IF;

  -- ---- 8. After snapshot, change detection ---------------------------
  v_after := jsonb_build_object(
    'work_date',          v_row.work_date,
    'ce_pco_number',      v_row.ce_pco_number,
    'notes',              v_row.notes,
    'change_order_value', v_row.change_order_value,
    'status',             v_row.status,
    'workers', (SELECT COALESCE(jsonb_agg(o ORDER BY o->>'name', o::text), '[]'::jsonb)
                FROM (SELECT jsonb_build_object(
                               'name', w.name, 'role', w.role,
                               'hours', w.hours, 'overtime_hours', w.overtime_hours,
                               'time_started', w.time_started, 'time_ended', w.time_ended,
                               'labor_class_id', w.labor_class_id) AS o
                      FROM t_and_m_workers w WHERE w.ticket_id = p_ticket_id) s),
    'items',   (SELECT COALESCE(jsonb_agg(o ORDER BY COALESCE(o->>'custom_name', o->>'material_equipment_id'), o::text), '[]'::jsonb)
                FROM (SELECT jsonb_build_object(
                               'material_equipment_id', i.material_equipment_id,
                               'custom_name', i.custom_name,
                               'custom_category', i.custom_category,
                               'quantity', i.quantity) AS o
                      FROM t_and_m_items i WHERE i.ticket_id = p_ticket_id) s)
  );

  v_changed := (v_before->'workers') IS DISTINCT FROM (v_after->'workers')
            OR (v_before->'items')   IS DISTINCT FROM (v_after->'items');

  -- ---- 9. COR consequences (crew / material changes only) ------------
  IF v_changed AND cardinality(v_cor_ids) > 0 THEN
    v_label := to_char(v_row.work_date, 'YYYY-MM-DD')
            || COALESCE(' (' || v_row.ce_pco_number || ')', '');

    FOR v_cor IN
      SELECT c.id, c.status FROM change_orders c WHERE c.id = ANY (v_cor_ids) ORDER BY c.id
    LOOP
      DELETE FROM change_order_labor
       WHERE change_order_id = v_cor.id AND source_ticket_id = p_ticket_id;
      DELETE FROM change_order_materials
       WHERE change_order_id = v_cor.id AND source_ticket_id = p_ticket_id;
      DELETE FROM change_order_equipment
       WHERE change_order_id = v_cor.id AND source_ticket_id = p_ticket_id;

      UPDATE change_order_ticket_associations
      SET data_imported    = true,
          import_status    = 'failed',
          import_failed_at = NOW(),
          import_error     = c_resync_err
      WHERE change_order_id = v_cor.id
        AND ticket_id = p_ticket_id;

      INSERT INTO cor_status_history (change_order_id, status, changed_by, notes, changed_at)
      VALUES (
        v_cor.id,
        v_cor.status,
        v_uid,
        'T&M ticket ' || v_label || ' edited by ' || v_editor
          || COALESCE(' - ' || v_note, '')
          || '. Its cost lines were removed from this COR and must be re-synced.',
        NOW()
      );

      v_resync := true;
    END LOOP;
  END IF;

  -- ---- 10. Edit record -----------------------------------------------
  INSERT INTO t_and_m_ticket_edits (
    ticket_id, edited_by_user_id, edited_by_name, edited_at, note,
    had_signature, contents_changed, before_snapshot, after_snapshot
  ) VALUES (
    p_ticket_id, v_uid, v_editor, NOW(), v_note,
    v_had_sig, v_changed, v_before, v_after
  );

  RETURN jsonb_build_object(
    'ticket',              to_jsonb(v_row),
    'contents_changed',    v_changed,
    'cor_resync_required', v_resync
  );
END;
$$;

COMMENT ON FUNCTION update_tm_ticket_contents(UUID, JSONB, JSONB, JSONB, TEXT) IS
  'Office edit of a T&M ticket: replaces workers and items, updates work_date / ce_pco_number / notes / change_order_value, stamps the audit columns, records a t_and_m_ticket_edits snapshot and, when crew or materials changed on a COR-linked ticket, removes the ticket-sourced COR lines and marks the association for re-sync. Errors: 42501 not authorized; P0001 billed / invoiced / COR-locked; 22023 invalid payload.';

-- Supabase default privileges grant EXECUTE to anon; revoke it
-- explicitly (REVOKE ... FROM PUBLIC alone leaves anon's own grant).
REVOKE ALL ON FUNCTION update_tm_ticket_contents(UUID, JSONB, JSONB, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_tm_ticket_contents(UUID, JSONB, JSONB, JSONB, TEXT) TO authenticated;

-- ============================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================
DO $$
DECLARE
  r        RECORD;
  v_type   TEXT;
  v_null   TEXT;
  v_fn     CONSTANT TEXT := 'public.update_tm_ticket_contents(uuid,jsonb,jsonb,jsonb,text)';
  v_oid    OID;
  v_count  INTEGER;
BEGIN
  -- Columns
  FOR r IN
    SELECT * FROM (VALUES
      ('edited_at',              'timestamp with time zone', 'YES'),
      ('edited_by_user_id',      'uuid',                     'YES'),
      ('edited_by_name',         'text',                     'YES'),
      ('edit_count',             'integer',                  'NO'),
      ('edited_after_signature', 'boolean',                  'NO'),
      ('last_edit_note',         'text',                     'YES')
    ) AS c(col, typ, nullable)
  LOOP
    SELECT data_type, is_nullable INTO v_type, v_null
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 't_and_m_tickets' AND column_name = r.col;
    IF v_type IS DISTINCT FROM r.typ OR v_null IS DISTINCT FROM r.nullable THEN
      RAISE EXCEPTION 'Migration verification failed: t_and_m_tickets.% is % / nullable=% (expected % / %)',
        r.col, v_type, v_null, r.typ, r.nullable;
    END IF;
  END LOOP;

  -- Trigger
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.t_and_m_tickets'::regclass
      AND tgname = 'trg_protect_tm_edit_audit'
      AND NOT tgisinternal
      AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'Migration verification failed: trg_protect_tm_edit_audit missing or disabled';
  END IF;

  -- Snapshot table: RLS on, exactly one policy (SELECT), no anon access,
  -- authenticated read-only
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.t_and_m_ticket_edits'::regclass) THEN
    RAISE EXCEPTION 'Migration verification failed: RLS not enabled on t_and_m_ticket_edits';
  END IF;
  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 't_and_m_ticket_edits';
  IF v_count <> 1 OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 't_and_m_ticket_edits' AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Migration verification failed: t_and_m_ticket_edits must have exactly one (SELECT) policy, found %', v_count;
  END IF;
  IF has_table_privilege('anon', 'public.t_and_m_ticket_edits', 'SELECT')
     OR has_table_privilege('anon', 'public.t_and_m_ticket_edits', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.t_and_m_ticket_edits', 'SELECT')
     OR has_table_privilege('authenticated', 'public.t_and_m_ticket_edits', 'INSERT')
     OR has_table_privilege('authenticated', 'public.t_and_m_ticket_edits', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.t_and_m_ticket_edits', 'DELETE') THEN
    RAISE EXCEPTION 'Migration verification failed: t_and_m_ticket_edits grants (anon none, authenticated SELECT only)';
  END IF;

  -- Function: definer, pinned search_path, EXECUTE for authenticated only
  v_oid := to_regprocedure(v_fn);
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'Migration verification failed: % not created', v_fn;
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN
    RAISE EXCEPTION 'Migration verification failed: update_tm_ticket_contents is not SECURITY DEFINER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p, unnest(COALESCE(p.proconfig, ARRAY[]::TEXT[])) cfg
    WHERE p.oid = v_oid AND cfg = 'search_path=public, extensions, pg_temp'
  ) THEN
    RAISE EXCEPTION 'Migration verification failed: update_tm_ticket_contents search_path not pinned';
  END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'Migration verification failed: anon can EXECUTE update_tm_ticket_contents';
  END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'Migration verification failed: authenticated cannot EXECUTE update_tm_ticket_contents';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
    WHERE p.oid = v_oid AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Migration verification failed: PUBLIC can EXECUTE update_tm_ticket_contents';
  END IF;

  RAISE NOTICE '✅ 20261105_tm_ticket_office_edit: columns, trigger, t_and_m_ticket_edits (RLS, 1 SELECT policy), update_tm_ticket_contents (definer, search_path, authenticated only) verified';
END $$;
