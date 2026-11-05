-- ============================================================
-- OFFLINE T&M SUBMIT: one idempotent, atomic create RPC
--
-- PROBLEM:
--   A T&M ticket is created by three separate requests (ticket,
--   workers, items) with no server-side dedupe key. A foreman whose
--   submit is queued offline, retried after a timeout, or sent from
--   two tabs can produce a hollow ticket (no crew) or the same
--   ticket twice, and nothing on the server can tell a replay from
--   a new ticket.
--
-- FIX:
--   1. t_and_m_tickets.client_submission_id UUID (ADD COLUMN IF NOT
--      EXISTS) + a partial unique index where it is not null. The
--      client generates the id once per ticket and keeps it across
--      retries. Existing rows stay NULL; the legacy insert path is
--      unaffected.
--   2. The field T&M policies are re-asserted, text identical to
--      20260228_fix_foreman_auth_errors.sql:361-415:
--        "Secure field view/create/update tickets"
--        "Secure field view/create workers"
--        "Secure field view/create items"
--      20260416_fix_disposal_load_error.sql:37-38 dropped
--      can_access_project() CASCADE, which removed these policies,
--      and only re-created the disposal ones. Permissive policies OR
--      together, so re-creating them cannot narrow what production
--      allows today. The matching table GRANTs are re-asserted for
--      anon and authenticated.
--   3. create_tm_ticket_full(p_payload JSONB) RETURNS JSONB,
--      SECURITY INVOKER (RLS and grants of the caller apply; the
--      x-field-session header is read by can_access_project() via
--      request.headers exactly as for a direct table insert):
--        a. project_id and client_submission_id are required UUIDs
--           -> otherwise 22023
--        b. can_access_project(project_id) -> otherwise 42501,
--           checked before anything else is looked up, so a caller
--           without a session cannot probe ids
--        c. workers: a non-empty array of objects with a name;
--           items: an array of objects (may be empty);
--           assigned_cor_id: a COR in the same project;
--           foreman_signature (optional): {data, name, title, date},
--           data a PNG data URL of at most 2,000,000 chars, name
--           not blank -> otherwise 22023
--        d. replay: a row with the same client_submission_id is
--           returned as to_jsonb(row) || {"replayed": true}; a
--           concurrent duplicate insert (unique_violation, two tabs)
--           is answered the same way
--        e. insert ticket (status 'foreman_signed' with a signature,
--           else 'pending'; photos empty), workers and items in the
--           same transaction; returns to_jsonb(row) ||
--           {"replayed": false}
--
--   Payload values are converted with jsonb_populate_record /
--   jsonb_populate_recordset against the real table row types, so
--   Postgres coerces to whatever the live column types are
--   (time_started '08:00' works for TEXT or TIME; photos '[]' works
--   for JSONB or TEXT[]). Empty-string values in worker / item
--   objects are treated as absent. Text fields are left()-truncated.
--
--   Setting assigned_cor_id fires trg_sync_ticket_to_junction
--   (20241230_reverse_ticket_cor_sync.sql), which writes the
--   change_order_ticket_associations row; nothing extra is done
--   here, and a replay inserts nothing.
--
--   No SECURITY DEFINER, no new anon policy, no storage change.
--   Photos are not part of this RPC (uploaded afterwards online).
--
-- IDEMPOTENT — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Dedupe key
-- ------------------------------------------------------------
ALTER TABLE t_and_m_tickets
  ADD COLUMN IF NOT EXISTS client_submission_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tm_tickets_client_submission_id
  ON t_and_m_tickets (client_submission_id)
  WHERE client_submission_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. Field T&M policies (text of 20260228_fix_foreman_auth_errors.sql
--    :361-415) and grants (20260228 PART 9, plus authenticated)
-- ------------------------------------------------------------
ALTER TABLE t_and_m_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_and_m_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_and_m_items   ENABLE ROW LEVEL SECURITY;

-- T&M TICKETS
DROP POLICY IF EXISTS "Field users can view tickets"   ON t_and_m_tickets;
DROP POLICY IF EXISTS "Field users can create tickets" ON t_and_m_tickets;
DROP POLICY IF EXISTS "Field users can update tickets" ON t_and_m_tickets;
DROP POLICY IF EXISTS "Secure field view tickets"      ON t_and_m_tickets;
DROP POLICY IF EXISTS "Secure field create tickets"    ON t_and_m_tickets;
DROP POLICY IF EXISTS "Secure field update tickets"    ON t_and_m_tickets;
CREATE POLICY "Secure field view tickets"
  ON t_and_m_tickets FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "Secure field create tickets"
  ON t_and_m_tickets FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "Secure field update tickets"
  ON t_and_m_tickets FOR UPDATE
  USING (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));

-- T&M WORKERS
DROP POLICY IF EXISTS "Field users can view workers"   ON t_and_m_workers;
DROP POLICY IF EXISTS "Field users can create workers" ON t_and_m_workers;
DROP POLICY IF EXISTS "Secure field view workers"      ON t_and_m_workers;
DROP POLICY IF EXISTS "Secure field create workers"    ON t_and_m_workers;
CREATE POLICY "Secure field view workers"
  ON t_and_m_workers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM t_and_m_tickets t
    WHERE t.id = t_and_m_workers.ticket_id
      AND can_access_project(t.project_id)
  ));
CREATE POLICY "Secure field create workers"
  ON t_and_m_workers FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM t_and_m_tickets t
    WHERE t.id = t_and_m_workers.ticket_id
      AND can_access_project(t.project_id)
  ));

-- T&M ITEMS
DROP POLICY IF EXISTS "Field users can view items"   ON t_and_m_items;
DROP POLICY IF EXISTS "Field users can create items" ON t_and_m_items;
DROP POLICY IF EXISTS "Secure field view items"      ON t_and_m_items;
DROP POLICY IF EXISTS "Secure field create items"    ON t_and_m_items;
CREATE POLICY "Secure field view items"
  ON t_and_m_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM t_and_m_tickets t
    WHERE t.id = t_and_m_items.ticket_id
      AND can_access_project(t.project_id)
  ));
CREATE POLICY "Secure field create items"
  ON t_and_m_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM t_and_m_tickets t
    WHERE t.id = t_and_m_items.ticket_id
      AND can_access_project(t.project_id)
  ));

GRANT SELECT, INSERT, UPDATE ON t_and_m_tickets TO anon, authenticated;
GRANT SELECT, INSERT         ON t_and_m_workers TO anon, authenticated;
GRANT SELECT, INSERT         ON t_and_m_items   TO anon, authenticated;

-- ------------------------------------------------------------
-- 3. create_tm_ticket_full
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_tm_ticket_full(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  c_uuid_re CONSTANT TEXT := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_project_txt  TEXT;
  v_csid_txt     TEXT;
  v_cor_txt      TEXT;
  v_project_id   UUID;
  v_csid         UUID;
  v_cor_id       UUID;
  v_workers      JSONB;
  v_items        JSONB;
  v_sig          JSONB;
  v_sig_data     TEXT;
  v_sig_name     TEXT;
  v_has_sig      BOOLEAN := false;
  v_elem         JSONB;
  v_obj          JSONB;
  v_rec          t_and_m_tickets%ROWTYPE;
  v_row          t_and_m_tickets%ROWTYPE;
BEGIN
  -- a. Required identifiers
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'create_tm_ticket_full: payload must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  v_project_txt := NULLIF(btrim(p_payload->>'project_id'), '');
  v_csid_txt    := NULLIF(btrim(p_payload->>'client_submission_id'), '');

  IF v_project_txt IS NULL OR v_project_txt !~ c_uuid_re THEN
    RAISE EXCEPTION 'create_tm_ticket_full: project_id is required and must be a UUID'
      USING ERRCODE = '22023';
  END IF;
  IF v_csid_txt IS NULL OR v_csid_txt !~ c_uuid_re THEN
    RAISE EXCEPTION 'create_tm_ticket_full: client_submission_id is required and must be a UUID'
      USING ERRCODE = '22023';
  END IF;
  v_project_id := v_project_txt::uuid;
  v_csid       := v_csid_txt::uuid;

  -- b. Access first: nothing else is read for a caller who cannot
  --    see the project (office login of the company, or a valid
  --    x-field-session for this project).
  IF NOT COALESCE(can_access_project(v_project_id), false) THEN
    RAISE EXCEPTION 'create_tm_ticket_full: not authorized for this project'
      USING ERRCODE = '42501';
  END IF;

  -- c. Payload shape
  v_workers := p_payload->'workers';
  IF v_workers IS NULL OR jsonb_typeof(v_workers) <> 'array' OR jsonb_array_length(v_workers) = 0 THEN
    RAISE EXCEPTION 'create_tm_ticket_full: at least one worker is required'
      USING ERRCODE = '22023';
  END IF;
  FOR v_elem IN SELECT e FROM jsonb_array_elements(v_workers) AS t(e) LOOP
    IF jsonb_typeof(v_elem) <> 'object'
       OR jsonb_typeof(v_elem->'name') IS DISTINCT FROM 'string'
       OR btrim(v_elem->>'name') = '' THEN
      RAISE EXCEPTION 'create_tm_ticket_full: every worker needs a name'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  v_items := COALESCE(p_payload->'items', '[]'::jsonb);
  IF jsonb_typeof(v_items) = 'null' THEN
    v_items := '[]'::jsonb;
  END IF;
  IF jsonb_typeof(v_items) <> 'array' THEN
    RAISE EXCEPTION 'create_tm_ticket_full: items must be an array'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) AS t(e) WHERE jsonb_typeof(e) <> 'object') THEN
    RAISE EXCEPTION 'create_tm_ticket_full: every item must be an object'
      USING ERRCODE = '22023';
  END IF;

  v_cor_txt := NULLIF(btrim(p_payload->>'assigned_cor_id'), '');
  IF v_cor_txt IS NOT NULL THEN
    IF v_cor_txt !~ c_uuid_re THEN
      RAISE EXCEPTION 'create_tm_ticket_full: assigned_cor_id must be a UUID'
        USING ERRCODE = '22023';
    END IF;
    v_cor_id := v_cor_txt::uuid;
    -- Read under the caller's RLS: the COR must be visible and belong
    -- to this project (the junction trigger runs as definer, so this
    -- is what keeps a ticket from being attached to a foreign COR).
    IF NOT EXISTS (SELECT 1 FROM change_orders c WHERE c.id = v_cor_id AND c.project_id = v_project_id) THEN
      RAISE EXCEPTION 'create_tm_ticket_full: assigned_cor_id is not a change order of this project'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  v_sig := p_payload->'foreman_signature';
  IF v_sig IS NOT NULL AND jsonb_typeof(v_sig) <> 'null' THEN
    IF jsonb_typeof(v_sig) <> 'object' OR jsonb_typeof(v_sig->'data') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'create_tm_ticket_full: foreman_signature must be an object with data'
        USING ERRCODE = '22023';
    END IF;
    v_sig_data := v_sig->>'data';
    IF left(v_sig_data, 22) <> 'data:image/png;base64,'
       OR length(v_sig_data) <= 22
       OR length(v_sig_data) > 2000000 THEN
      RAISE EXCEPTION 'create_tm_ticket_full: foreman_signature.data must be a PNG data URL of at most 2000000 characters'
        USING ERRCODE = '22023';
    END IF;
    v_sig_name := NULLIF(btrim(v_sig->>'name'), '');
    IF v_sig_name IS NULL THEN
      RAISE EXCEPTION 'create_tm_ticket_full: foreman_signature.name is required'
        USING ERRCODE = '22023';
    END IF;
    v_has_sig := true;
  END IF;

  -- d. Replay (read under the caller's RLS)
  SELECT * INTO v_row FROM t_and_m_tickets WHERE client_submission_id = v_csid;
  IF FOUND THEN
    IF v_row.project_id IS DISTINCT FROM v_project_id THEN
      RAISE EXCEPTION 'create_tm_ticket_full: client_submission_id already used for another project'
        USING ERRCODE = '23505';
    END IF;
    RETURN to_jsonb(v_row) || jsonb_build_object('replayed', true);
  END IF;

  -- e. Insert. The ticket values go through jsonb_populate_record so
  --    every value is coerced to the live column type.
  v_obj := jsonb_build_object(
    'project_id',           v_project_id,
    'client_submission_id', v_csid,
    'work_date',            COALESCE(NULLIF(btrim(p_payload->>'work_date'), ''), CURRENT_DATE::text),
    'ce_pco_number',        left(NULLIF(btrim(p_payload->>'ce_pco_number'), ''), 100),
    'assigned_cor_id',      v_cor_id,
    'notes',                left(p_payload->>'notes', 10000),
    'created_by_name',      COALESCE(left(NULLIF(btrim(p_payload->>'created_by_name'), ''), 200), 'Field User'),
    'status',               CASE WHEN v_has_sig THEN 'foreman_signed' ELSE 'pending' END,
    'photos',               '[]'::jsonb
  );
  IF v_has_sig THEN
    v_obj := v_obj || jsonb_build_object(
      'foreman_signature_data',  v_sig_data,
      'foreman_signature_name',  left(v_sig_name, 200),
      'foreman_signature_title', left(NULLIF(btrim(v_sig->>'title'), ''), 200),
      'foreman_signature_date',  COALESCE(NULLIF(btrim(v_sig->>'date'), ''), now()::text)
    );
  END IF;
  v_rec := jsonb_populate_record(NULL::t_and_m_tickets, v_obj);

  BEGIN
    INSERT INTO t_and_m_tickets (
      project_id, client_submission_id, work_date, ce_pco_number, assigned_cor_id,
      notes, created_by_name, status, photos,
      foreman_signature_data, foreman_signature_name, foreman_signature_title, foreman_signature_date
    ) VALUES (
      v_rec.project_id, v_rec.client_submission_id, v_rec.work_date, v_rec.ce_pco_number, v_rec.assigned_cor_id,
      v_rec.notes, v_rec.created_by_name, v_rec.status, v_rec.photos,
      v_rec.foreman_signature_data, v_rec.foreman_signature_name, v_rec.foreman_signature_title, v_rec.foreman_signature_date
    )
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    -- Another request with the same client_submission_id committed
    -- first (two tabs, or a retry racing the original).
    SELECT * INTO v_row FROM t_and_m_tickets WHERE client_submission_id = v_csid;
    IF NOT FOUND OR v_row.project_id IS DISTINCT FROM v_project_id THEN
      RAISE;
    END IF;
    RETURN to_jsonb(v_row) || jsonb_build_object('replayed', true);
  END;

  -- Workers: empty strings are dropped so they become NULL instead of
  -- failing a TIME / UUID / NUMERIC cast.
  INSERT INTO t_and_m_workers (
    ticket_id, name, hours, overtime_hours, time_started, time_ended, role, labor_class_id
  )
  SELECT
    v_row.id,
    left(btrim(w.name), 200),
    COALESCE(w.hours, 0),
    COALESCE(w.overtime_hours, 0),
    w.time_started,
    w.time_ended,
    COALESCE(left(NULLIF(btrim(w.role), ''), 100), 'Laborer'),
    w.labor_class_id
  FROM jsonb_populate_recordset(
    NULL::t_and_m_workers,
    (SELECT jsonb_agg(
              (SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb)
               FROM jsonb_each(e) AS kv(k, v)
               WHERE v NOT IN ('""'::jsonb, 'null'::jsonb)
                 AND k NOT IN ('id', 'ticket_id', 'created_at'))
              ORDER BY ord)
     FROM jsonb_array_elements(v_workers) WITH ORDINALITY AS t(e, ord))
  ) AS w;

  IF jsonb_array_length(v_items) > 0 THEN
    INSERT INTO t_and_m_items (
      ticket_id, material_equipment_id, custom_name, custom_category, quantity
    )
    SELECT
      v_row.id,
      i.material_equipment_id,
      left(NULLIF(btrim(i.custom_name), ''), 200),
      left(NULLIF(btrim(i.custom_category), ''), 100),
      COALESCE(i.quantity, 1)
    FROM jsonb_populate_recordset(
      NULL::t_and_m_items,
      (SELECT jsonb_agg(
                (SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb)
                 FROM jsonb_each(e) AS kv(k, v)
                 WHERE v NOT IN ('""'::jsonb, 'null'::jsonb)
                   AND k NOT IN ('id', 'ticket_id', 'created_at'))
                ORDER BY ord)
       FROM jsonb_array_elements(v_items) WITH ORDINALITY AS t(e, ord))
    ) AS i;
  END IF;

  RETURN to_jsonb(v_row) || jsonb_build_object('replayed', false);
END;
$$;

COMMENT ON FUNCTION create_tm_ticket_full(JSONB) IS
  'Creates a T&M ticket with its workers and items in one transaction. Idempotent on client_submission_id: a repeated id returns the existing row with replayed=true. SECURITY INVOKER: RLS (can_access_project) applies. Errors: 22023 invalid payload, 42501 no access to the project.';

-- 4. Execute: API roles only
REVOKE ALL ON FUNCTION create_tm_ticket_full(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_tm_ticket_full(JSONB) TO anon, authenticated;

-- Verify manually:
--   SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_tm_tickets_client_submission_id';
--   SELECT policyname, cmd FROM pg_policies
--    WHERE tablename IN ('t_and_m_tickets','t_and_m_workers','t_and_m_items') ORDER BY 1;
-- Then run supabase/tests/create_tm_ticket_full_tests.sql (rolls back).
