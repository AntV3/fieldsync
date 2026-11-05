-- ============================================================
-- PUBLIC GC SIGNING LINK: token-gated RPCs
--
-- PROBLEM:
--   /sign/:token (SignaturePage.jsx) was written when the anon role
--   could read the base tables. Every hardening migration since
--   closed a door the page still walks through, so an outside
--   signer with no session sees "Unable to load signature request".
--
-- FIX:
--   The signature token is the credential. The whole public flow
--   moves behind SECURITY DEFINER functions that validate the token
--   (and expiry / status) and return explicit key allowlists:
--
--   1. public_signing_pick(row, keys)             helper, no grant
--   2. public_signing_ticket_json(ticket_id)      helper, no grant
--   3. public_get_signature_request_by_token(tok) re-created: a row
--      that exists but is time-expired now returns
--      {status:'expired', document_type} instead of NULL
--   4. public_get_document_for_signing(tok)       read projection,
--      bumps view_count (replaces increment_signature_view_count)
--   5. public_add_signature(tok, slot, payload)   signature insert +
--      document mirror + status advance + audit, one transaction
--   6. signatures.company_id (ADD COLUMN IF NOT EXISTS + backfill)
--   7. signing_token_can_read_photo(name)         storage helper
--   8. storage policy: anon may read tm-photos objects that belong
--      to the token's own ticket(s); header x-signing-token
--   9. the two anon policies on signature_requests (from
--      20250101_signature_anon_access.sql) are re-created pinned to
--      a valid field session for the request's project, the
--      project's company and a document inside that project. A
--      signature_requests row is now a credential (it unlocks the
--      RPCs above), so a session-less anon caller must not be able
--      to mint or re-point one.
--
--   No table-level GRANT/REVOKE. No new anon policy on base tables
--   (t_and_m_tickets / change_orders / signatures / storage.objects
--   are untouched apart from 8). The tm-photos bucket stays private.
--
--   A completed (signed) request stays readable after expires_at so
--   the signed state keeps rendering; expiry only closes the write
--   path and unsigned links.
--
--   ip_address / *_signature_ip: taken from cf-connecting-ip when the
--   gateway sets it (Supabase sits behind Cloudflare), otherwise the
--   first hop of x-forwarded-for. That first hop is client-supplied
--   when no trusted edge overwrites it, so without cf-connecting-ip
--   the recorded IP is self-reported audit data, not proof.
--
-- Errors raised to the client use a stable message token so the
-- client can match on error.message:
--   signing_link_invalid, signing_link_revoked, signing_link_expired,
--   signing_already_signed, signing_invalid_payload
--
-- IDEMPOTENT — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 6. signatures.company_id (done first so the RPC below can
--    populate it; a no-op where production already has it)
-- ------------------------------------------------------------
ALTER TABLE signatures
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

UPDATE signatures s
SET company_id = sr.company_id
FROM signature_requests sr
WHERE sr.id = s.signature_request_id
  AND s.company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_signatures_company_id ON signatures(company_id);

-- ------------------------------------------------------------
-- 1. Allowlist helper: keep only the listed keys of a JSON object.
--    Drift-safe in both directions: a column that disappears is
--    simply absent, a column added later is never leaked.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public_signing_pick(p_row JSONB, p_keys TEXT[])
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT CASE
    WHEN p_row IS NULL OR jsonb_typeof(p_row) <> 'object' THEN NULL
    ELSE COALESCE(
      (SELECT jsonb_object_agg(e.key, e.value)
         FROM jsonb_each(p_row) AS e
        WHERE e.key = ANY (COALESCE(p_keys, ARRAY[]::TEXT[]))),
      '{}'::jsonb)
  END;
$$;

REVOKE ALL ON FUNCTION public_signing_pick(JSONB, TEXT[]) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 2. T&M ticket projection for an outside signer.
--    Key names match today's PostgREST embed shape
--    (t_and_m_workers, t_and_m_items { materials_equipment {...} })
--    so SignaturePage.jsx / corPdfExport.js keep working.
--    Never returned: rejection_reason, rejected_*, approved_*,
--    photo_locations, photos_verified_*, *_signature_ip,
--    cost_code_id, import_*, materials_equipment.cost_per_unit.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public_signing_ticket_json(p_ticket_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  c_ticket_keys CONSTANT TEXT[] := ARRAY[
    'id', 'project_id', 'assigned_cor_id', 'work_date', 'ce_pco_number', 'notes',
    'status', 'photos', 'created_at', 'created_by_name',
    'foreman_signature_data', 'foreman_signature_name', 'foreman_signature_title', 'foreman_signature_date',
    'gc_signature_data', 'gc_signature_name', 'gc_signature_title', 'gc_signature_company', 'gc_signature_date',
    'client_signature_data', 'client_signature_name', 'client_signature_title', 'client_signature_company', 'client_signature_date'
  ];
  c_worker_keys CONSTANT TEXT[] := ARRAY[
    'id', 'ticket_id', 'name', 'role', 'hours', 'overtime_hours', 'time_started', 'time_ended'
  ];
  c_item_keys CONSTANT TEXT[] := ARRAY[
    'id', 'ticket_id', 'material_equipment_id', 'custom_name', 'custom_category', 'quantity'
  ];
  c_material_keys CONSTANT TEXT[] := ARRAY['id', 'name', 'unit', 'category'];
  v_ticket  JSONB;
  v_workers JSONB;
  v_items   JSONB;
BEGIN
  IF p_ticket_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT public_signing_pick(to_jsonb(t), c_ticket_keys)
  INTO v_ticket
  FROM t_and_m_tickets t
  WHERE t.id = p_ticket_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      public_signing_pick(to_jsonb(w), c_worker_keys)
      ORDER BY to_jsonb(w)->>'created_at', to_jsonb(w)->>'id'
    ),
    '[]'::jsonb)
  INTO v_workers
  FROM t_and_m_workers w
  WHERE w.ticket_id = p_ticket_id;

  SELECT COALESCE(
    jsonb_agg(
      public_signing_pick(to_jsonb(i), c_item_keys)
      || jsonb_build_object(
           'materials_equipment',
           (SELECT public_signing_pick(to_jsonb(me), c_material_keys)
              FROM materials_equipment me
             WHERE me.id = i.material_equipment_id)
         )
      ORDER BY to_jsonb(i)->>'created_at', to_jsonb(i)->>'id'
    ),
    '[]'::jsonb)
  INTO v_items
  FROM t_and_m_items i
  WHERE i.ticket_id = p_ticket_id;

  RETURN v_ticket
    || jsonb_build_object('t_and_m_workers', v_workers, 't_and_m_items', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public_signing_ticket_json(UUID) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 3. Token reader RPC (re-created). Same return shape as
--    20260423_signature_tenant_isolation.sql: the request row plus
--    "signatures": [...]. New: a row that exists but is time-expired
--    returns {"status":"expired","document_type":...} (no id, no
--    signatures) so the page can show the right copy; a revoked row
--    returns {"status":"revoked","document_type":...} the same way.
--    A completed row is returned in full even after expires_at.
--    Unknown token is still NULL.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public_get_signature_request_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_request    signature_requests%ROWTYPE;
  v_signatures JSONB;
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_request
  FROM signature_requests
  WHERE signature_token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- A revoked link discloses nothing beyond its state (no document /
  -- project / company ids that could seed a forged request).
  IF v_request.status = 'revoked' THEN
    RETURN jsonb_build_object(
      'status', 'revoked',
      'document_type', v_request.document_type
    );
  END IF;

  -- Time expiry only closes unsigned links; a completed request keeps
  -- rendering its signed state.
  IF v_request.status <> 'completed'
     AND v_request.expires_at IS NOT NULL AND v_request.expires_at <= NOW() THEN
    RETURN jsonb_build_object(
      'status', 'expired',
      'document_type', v_request.document_type
    );
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.signed_at), '[]'::jsonb)
  INTO v_signatures
  FROM signatures s
  WHERE s.signature_request_id = v_request.id;

  RETURN to_jsonb(v_request) || jsonb_build_object('signatures', v_signatures);
END;
$$;

REVOKE ALL ON FUNCTION public_get_signature_request_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_get_signature_request_by_token(TEXT) TO anon, authenticated;

-- ------------------------------------------------------------
-- 4. Document projection for the signing page.
--    Returns NULL unless the token names a request whose status is
--    pending / partially_signed / completed; pending / partially_signed
--    must also not be time-expired (a completed request stays readable).
--    Bumps view_count / last_viewed_at for open requests (VOLATILE;
--    replaces increment_signature_view_count).
--
--    tm_ticket -> public_signing_ticket_json(...) pinned to the
--                 request's project_id, plus "projects"
--    cor       -> allowlisted change_orders keys, whole line rows
--                 (change_order_labor / _materials / _equipment /
--                 _subcontractors ordered by sort_order), "projects"
--                 and "backup_tickets" (every ticket with
--                 assigned_cor_id = cor.id, ordered by work_date)
--    projects  -> {id, name, job_number, companies {id, name, logo_url}}
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public_get_document_for_signing(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  c_project_keys CONSTANT TEXT[] := ARRAY['id', 'name', 'job_number'];
  c_company_keys CONSTANT TEXT[] := ARRAY['id', 'name', 'logo_url'];
  c_cor_keys CONSTANT TEXT[] := ARRAY[
    'id', 'project_id', 'cor_number', 'title', 'description', 'scope_of_work',
    'period_start', 'period_end', 'status',
    'labor_subtotal', 'materials_subtotal', 'equipment_subtotal', 'subcontractors_subtotal',
    'labor_markup_percent', 'materials_markup_percent', 'equipment_markup_percent', 'subcontractors_markup_percent',
    'labor_markup_amount', 'materials_markup_amount', 'equipment_markup_amount', 'subcontractors_markup_amount',
    'liability_insurance_percent', 'bond_percent', 'license_fee_percent',
    'liability_insurance_amount', 'bond_amount', 'license_fee_amount',
    'cor_subtotal', 'additional_fees_total', 'cor_total',
    'gc_signature_data', 'gc_signature_name', 'gc_signature_title', 'gc_signature_company', 'gc_signature_date',
    'client_signature_data', 'client_signature_name', 'client_signature_title', 'client_signature_company', 'client_signature_date',
    'created_at', 'submitted_at', 'approved_at',
    'total_labor_hours', 'total_overtime_hours',
    'ticket_count', 'photo_count', 'verified_ticket_count',
    'revision_number'
  ];
  v_request  signature_requests%ROWTYPE;
  v_project  JSONB;
  v_company  JSONB;
  v_doc      JSONB;
  v_ticket_id UUID;
  v_cor_id   UUID;
  v_labor    JSONB;
  v_materials JSONB;
  v_equipment JSONB;
  v_subs     JSONB;
  v_backup   JSONB;
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_request
  FROM signature_requests
  WHERE signature_token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_request.status NOT IN ('pending', 'partially_signed', 'completed') THEN
    RETURN NULL;
  END IF;

  IF v_request.status <> 'completed'
     AND v_request.expires_at IS NOT NULL AND v_request.expires_at <= NOW() THEN
    RETURN NULL;
  END IF;

  -- Access tracking (open requests only)
  IF v_request.status IN ('pending', 'partially_signed') THEN
    UPDATE signature_requests
    SET view_count = COALESCE(view_count, 0) + 1,
        last_viewed_at = NOW()
    WHERE id = v_request.id;
  END IF;

  -- projects { id, name, job_number, companies { id, name, logo_url } }
  SELECT public_signing_pick(to_jsonb(p), c_project_keys)
  INTO v_project
  FROM projects p
  WHERE p.id = v_request.project_id;

  SELECT public_signing_pick(to_jsonb(c), c_company_keys)
  INTO v_company
  FROM companies c
  WHERE c.id = v_request.company_id;

  v_project := COALESCE(v_project, '{}'::jsonb)
    || jsonb_build_object('companies', v_company);

  IF v_request.document_type = 'tm_ticket' THEN
    SELECT t.id INTO v_ticket_id
    FROM t_and_m_tickets t
    WHERE t.id = v_request.document_id
      AND t.project_id = v_request.project_id;

    IF NOT FOUND THEN
      RETURN NULL;
    END IF;

    v_doc := public_signing_ticket_json(v_ticket_id);
    IF v_doc IS NULL THEN
      RETURN NULL;
    END IF;

    RETURN v_doc || jsonb_build_object('projects', v_project);
  END IF;

  IF v_request.document_type = 'cor' THEN
    SELECT public_signing_pick(to_jsonb(co), c_cor_keys), co.id
    INTO v_doc, v_cor_id
    FROM change_orders co
    WHERE co.id = v_request.document_id
      AND co.project_id = v_request.project_id;

    IF NOT FOUND THEN
      RETURN NULL;
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.sort_order, l.created_at), '[]'::jsonb)
    INTO v_labor
    FROM change_order_labor l
    WHERE l.change_order_id = v_cor_id;

    SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.sort_order, m.created_at), '[]'::jsonb)
    INTO v_materials
    FROM change_order_materials m
    WHERE m.change_order_id = v_cor_id;

    SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.sort_order, e.created_at), '[]'::jsonb)
    INTO v_equipment
    FROM change_order_equipment e
    WHERE e.change_order_id = v_cor_id;

    SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.sort_order, s.created_at), '[]'::jsonb)
    INTO v_subs
    FROM change_order_subcontractors s
    WHERE s.change_order_id = v_cor_id;

    SELECT COALESCE(jsonb_agg(public_signing_ticket_json(t.id) ORDER BY t.work_date, t.created_at), '[]'::jsonb)
    INTO v_backup
    FROM t_and_m_tickets t
    WHERE t.assigned_cor_id = v_cor_id
      AND t.project_id = v_request.project_id;

    RETURN v_doc || jsonb_build_object(
      'projects', v_project,
      'change_order_labor', v_labor,
      'change_order_materials', v_materials,
      'change_order_equipment', v_equipment,
      'change_order_subcontractors', v_subs,
      'backup_tickets', v_backup
    );
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public_get_document_for_signing(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_get_document_for_signing(TEXT) TO anon, authenticated;

-- ------------------------------------------------------------
-- 5. Write path: one transaction, token-gated.
--    p_signature keys: signature (PNG data URL), signerName,
--    signerTitle, signerCompany, userAgent. signedAt is accepted
--    for compatibility but the server clock is the signed_at of
--    record.
--    Order of checks: invalid -> revoked -> already signed
--    (request completed, any existing signature, or the document
--    slot already filled) -> expired -> payload.
--    Returns {signature, document_status, request_status}.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public_add_signature(p_token TEXT, p_slot INTEGER, p_signature JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_request   signature_requests%ROWTYPE;
  v_headers   JSONB;
  v_image     TEXT;
  v_name      TEXT;
  v_title     TEXT;
  v_company   TEXT;
  v_agent     TEXT;
  v_ip_text   TEXT;
  v_ip        INET;
  v_signed_at TIMESTAMPTZ := NOW();
  v_doc_gc    TEXT;
  v_doc_client TEXT;
  v_sig       signatures%ROWTYPE;
  v_document_status TEXT;
  v_rows      INTEGER := 0;
BEGIN
  -- ---- token / request ------------------------------------------------
  IF p_token IS NULL OR length(p_token) < 8 THEN
    RAISE EXCEPTION 'signing_link_invalid';
  END IF;

  SELECT * INTO v_request
  FROM signature_requests
  WHERE signature_token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'signing_link_invalid';
  END IF;

  IF v_request.status = 'revoked' THEN
    RAISE EXCEPTION 'signing_link_revoked';
  END IF;

  IF v_request.status = 'completed'
     OR EXISTS (SELECT 1 FROM signatures s WHERE s.signature_request_id = v_request.id) THEN
    RAISE EXCEPTION 'signing_already_signed';
  END IF;

  IF v_request.status = 'expired'
     OR (v_request.expires_at IS NOT NULL AND v_request.expires_at <= NOW()) THEN
    RAISE EXCEPTION 'signing_link_expired';
  END IF;

  IF v_request.status NOT IN ('pending', 'partially_signed') THEN
    RAISE EXCEPTION 'signing_link_invalid';
  END IF;

  -- ---- payload --------------------------------------------------------
  IF p_slot IS NULL OR p_slot NOT IN (1, 2) THEN
    RAISE EXCEPTION 'signing_invalid_payload';
  END IF;

  IF p_signature IS NULL OR jsonb_typeof(p_signature) <> 'object' THEN
    RAISE EXCEPTION 'signing_invalid_payload';
  END IF;

  v_image := p_signature->>'signature';
  IF v_image IS NULL
     OR left(v_image, 22) <> 'data:image/png;base64,'
     OR length(v_image) < 30
     OR length(v_image) > 1500000 THEN
    RAISE EXCEPTION 'signing_invalid_payload';
  END IF;

  v_name := NULLIF(btrim(p_signature->>'signerName'), '');
  IF v_name IS NULL OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'signing_invalid_payload';
  END IF;

  v_title := NULLIF(btrim(p_signature->>'signerTitle'), '');
  v_company := NULLIF(btrim(p_signature->>'signerCompany'), '');
  IF length(v_title) > 120 OR length(v_company) > 120 THEN
    RAISE EXCEPTION 'signing_invalid_payload';
  END IF;

  -- ---- request headers: user agent + client IP -------------------------
  -- cf-connecting-ip is set by the trusted edge; the first hop of
  -- x-forwarded-for is whatever the client sent when no edge rewrote
  -- it (self-reported, see the header comment). Parsing is guarded so
  -- a malformed header can never block a signature.
  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
  END;

  v_agent := NULLIF(btrim(COALESCE(p_signature->>'userAgent', v_headers->>'user-agent')), '');
  v_agent := left(v_agent, 512);

  v_ip_text := COALESCE(
    NULLIF(btrim(v_headers->>'cf-connecting-ip'), ''),
    NULLIF(btrim(split_part(COALESCE(v_headers->>'x-forwarded-for', ''), ',', 1)), '')
  );
  IF v_ip_text IS NOT NULL THEN
    BEGIN
      v_ip := v_ip_text::inet;
    EXCEPTION WHEN OTHERS THEN
      v_ip := NULL;
    END;
  END IF;

  -- ---- per-slot document guard (row locked for the transaction) -------
  IF v_request.document_type = 'tm_ticket' THEN
    SELECT t.gc_signature_data, t.client_signature_data
    INTO v_doc_gc, v_doc_client
    FROM t_and_m_tickets t
    WHERE t.id = v_request.document_id
      AND t.project_id = v_request.project_id
    FOR UPDATE;
  ELSIF v_request.document_type = 'cor' THEN
    SELECT co.gc_signature_data, co.client_signature_data
    INTO v_doc_gc, v_doc_client
    FROM change_orders co
    WHERE co.id = v_request.document_id
      AND co.project_id = v_request.project_id
    FOR UPDATE;
  ELSE
    RAISE EXCEPTION 'signing_link_invalid';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'signing_link_invalid';
  END IF;

  IF (p_slot = 1 AND NULLIF(v_doc_gc, '') IS NOT NULL)
     OR (p_slot = 2 AND NULLIF(v_doc_client, '') IS NOT NULL) THEN
    RAISE EXCEPTION 'signing_already_signed';
  END IF;

  -- ---- signatures row ---------------------------------------------------
  BEGIN
    INSERT INTO signatures (
      signature_request_id, signature_slot, signature_image,
      signer_name, signer_title, signer_company,
      signed_at, ip_address, user_agent, company_id
    ) VALUES (
      v_request.id, p_slot, v_image,
      v_name, v_title, v_company,
      v_signed_at, v_ip, v_agent, v_request.company_id
    )
    RETURNING * INTO v_sig;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'signing_already_signed';
  END;

  -- ---- mirror to the document + status advance --------------------------
  IF v_request.document_type = 'tm_ticket' THEN
    IF p_slot = 1 THEN
      UPDATE t_and_m_tickets
      SET gc_signature_data = v_image,
          gc_signature_name = v_name,
          gc_signature_title = v_title,
          gc_signature_company = v_company,
          gc_signature_date = v_signed_at,
          gc_signature_ip = v_ip,
          status = CASE WHEN status IN ('pending', 'foreman_signed') THEN 'client_signed' ELSE status END
      WHERE id = v_request.document_id
        AND project_id = v_request.project_id
      RETURNING status INTO v_document_status;
    ELSE
      UPDATE t_and_m_tickets
      SET client_signature_data = v_image,
          client_signature_name = v_name,
          client_signature_title = v_title,
          client_signature_company = v_company,
          client_signature_date = v_signed_at,
          client_signature_ip = v_ip,
          status = CASE WHEN status IN ('pending', 'foreman_signed') THEN 'client_signed' ELSE status END
      WHERE id = v_request.document_id
        AND project_id = v_request.project_id
      RETURNING status INTO v_document_status;
    END IF;

  ELSE -- cor
    IF p_slot = 1 THEN
      UPDATE change_orders
      SET gc_signature_data = v_image,
          gc_signature_name = v_name,
          gc_signature_title = v_title,
          gc_signature_company = v_company,
          gc_signature_date = v_signed_at,
          gc_signature_ip = v_ip
      WHERE id = v_request.document_id
        AND project_id = v_request.project_id
      RETURNING status INTO v_document_status;

      -- A GC signature is the approval. No-op unless pending_approval.
      UPDATE change_orders
      SET status = 'approved',
          approved_at = COALESCE(approved_at, v_signed_at)
      WHERE id = v_request.document_id
        AND project_id = v_request.project_id
        AND status = 'pending_approval';
      GET DIAGNOSTICS v_rows = ROW_COUNT;

      IF v_rows > 0 THEN
        v_document_status := 'approved';
        INSERT INTO cor_status_history (change_order_id, status, changed_by, notes, changed_at)
        VALUES (v_request.document_id, 'approved', NULL, 'GC signed via signature link', v_signed_at);
      END IF;
    ELSE
      UPDATE change_orders
      SET client_signature_data = v_image,
          client_signature_name = v_name,
          client_signature_title = v_title,
          client_signature_company = v_company,
          client_signature_date = v_signed_at,
          client_signature_ip = v_ip
      WHERE id = v_request.document_id
        AND project_id = v_request.project_id
      RETURNING status INTO v_document_status;
    END IF;
  END IF;

  -- ---- one signature completes the request ------------------------------
  -- (overrides the two-slot AFTER INSERT trigger on signatures)
  UPDATE signature_requests
  SET status = 'completed',
      updated_at = NOW()
  WHERE id = v_request.id;

  RETURN jsonb_build_object(
    'signature', to_jsonb(v_sig),
    'document_status', v_document_status,
    'request_status', 'completed'
  );
END;
$$;

REVOKE ALL ON FUNCTION public_add_signature(TEXT, INTEGER, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_add_signature(TEXT, INTEGER, JSONB) TO anon, authenticated;

-- ------------------------------------------------------------
-- 7. Storage helper: may the bearer of the x-signing-token header
--    read this tm-photos object? True only when the object name
--    equals (exact string compare) a photos entry of the token's
--    ticket, or of a ticket assigned to the token's COR, pinned to
--    the request's project, AND the object path itself starts with
--    the request's "companyId/projectId/" (a photos entry that names
--    another tenant's object never unlocks it). Handles stored paths
--    ("companyId/projectId/ticketId/file") and legacy public URLs
--    that end with "/tm-photos/<that path>". A completed request
--    keeps its photos readable after expires_at. Fails closed.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION signing_token_can_read_photo(p_object_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_token   TEXT;
  v_request signature_requests%ROWTYPE;
  v_found   BOOLEAN := false;
BEGIN
  IF p_object_name IS NULL OR p_object_name = '' THEN
    RETURN false;
  END IF;

  BEGIN
    v_token := NULLIF(btrim(NULLIF(current_setting('request.headers', true), '')::jsonb->>'x-signing-token'), '');
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;

  IF v_token IS NULL OR length(v_token) < 8 THEN
    RETURN false;
  END IF;

  SELECT * INTO v_request
  FROM signature_requests
  WHERE signature_token = v_token
    AND status IN ('pending', 'partially_signed', 'completed')
    AND (status = 'completed' OR expires_at IS NULL OR expires_at > NOW())
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_request.document_type NOT IN ('tm_ticket', 'cor') THEN
    RETURN false;
  END IF;

  -- The object must live under this request's own tenant/project
  -- prefix, whatever the ticket's photos array says.
  IF v_request.company_id IS NULL OR v_request.project_id IS NULL
     OR split_part(p_object_name, '/', 1) <> v_request.company_id::text
     OR split_part(p_object_name, '/', 2) <> v_request.project_id::text THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM t_and_m_tickets t
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(to_jsonb(t.photos)) = 'array' THEN to_jsonb(t.photos) ELSE '[]'::jsonb END
    ) AS ph(entry)
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN jsonb_typeof(ph.entry) = 'string' THEN ph.entry #>> '{}'
        WHEN jsonb_typeof(ph.entry) = 'object' THEN COALESCE(ph.entry->>'path', ph.entry->>'url')
        ELSE NULL
      END AS photo
    ) AS pv
    WHERE t.project_id = v_request.project_id
      AND (
        (v_request.document_type = 'tm_ticket' AND t.id = v_request.document_id)
        OR (v_request.document_type = 'cor' AND t.assigned_cor_id = v_request.document_id)
      )
      AND pv.photo IS NOT NULL
      AND (
        pv.photo = p_object_name
        OR (
          left(pv.photo, 4) = 'http'
          AND right(pv.photo, length(p_object_name) + 11) = '/tm-photos/' || p_object_name
        )
      )
  ) INTO v_found;

  RETURN COALESCE(v_found, false);
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION signing_token_can_read_photo(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION signing_token_can_read_photo(TEXT) TO anon, authenticated;

-- ------------------------------------------------------------
-- 8. Storage policy (additive to "Secure read access for tm-photos",
--    anon only). The bucket stays private: this only lets the
--    Storage API mint a signed URL for a photo of the token's own
--    document when the request carries x-signing-token.
--    Guarded so the file also runs on a plain Postgres without the
--    storage schema.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage.objects not present in this database; skipping the tm-photos signing policy';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "Signing link can read document photos" ON storage.objects';
  EXECUTE $POL$
    CREATE POLICY "Signing link can read document photos"
    ON storage.objects
    FOR SELECT
    TO anon
    USING (
      bucket_id = 'tm-photos'
      AND signing_token_can_read_photo(name)
    )
  $POL$;
END $$;

-- ------------------------------------------------------------
-- 9. Pin the anon policies on signature_requests.
--    20250101_signature_anon_access.sql let any caller INSERT a
--    request (WITH CHECK document_type only) and UPDATE any open
--    request. Both were harmless while the base tables were closed;
--    with the RPCs above a request row IS the credential, so a
--    session-less anon could mint one for any document whose ids it
--    learned (e.g. from a revoked or T&M link) and sign / approve it,
--    or re-point its own open request at another document.
--    Now: a valid field session for the request's project
--    (can_access_project, the same gate the field app passes to
--    create tickets), company pinned to the project's company, and
--    the document must exist inside that project. Office users keep
--    going through "Company users manage signature requests".
--    The subqueries run as the caller: anon holds SELECT on
--    projects / t_and_m_tickets / change_orders behind the field-
--    session policies, which is exactly the scope being asserted.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Anon can create signature requests" ON signature_requests;
CREATE POLICY "Anon can create signature requests" ON signature_requests
  FOR INSERT
  TO anon
  WITH CHECK (
    document_type IN ('tm_ticket', 'cor')
    AND can_access_project(project_id)
    AND company_id = (SELECT p.company_id FROM projects p WHERE p.id = signature_requests.project_id)
    AND (
      (document_type = 'tm_ticket' AND EXISTS (
        SELECT 1 FROM t_and_m_tickets t
        WHERE t.id = signature_requests.document_id
          AND t.project_id = signature_requests.project_id))
      OR
      (document_type = 'cor' AND EXISTS (
        SELECT 1 FROM change_orders c
        WHERE c.id = signature_requests.document_id
          AND c.project_id = signature_requests.project_id))
    )
  );

DROP POLICY IF EXISTS "Anon can update signature requests" ON signature_requests;
CREATE POLICY "Anon can update signature requests" ON signature_requests
  FOR UPDATE
  TO anon
  USING (
    status IN ('pending', 'partially_signed')
    AND (expires_at IS NULL OR expires_at > NOW())
    AND can_access_project(project_id)
  )
  WITH CHECK (
    document_type IN ('tm_ticket', 'cor')
    AND can_access_project(project_id)
    AND company_id = (SELECT p.company_id FROM projects p WHERE p.id = signature_requests.project_id)
    AND (
      (document_type = 'tm_ticket' AND EXISTS (
        SELECT 1 FROM t_and_m_tickets t
        WHERE t.id = signature_requests.document_id
          AND t.project_id = signature_requests.project_id))
      OR
      (document_type = 'cor' AND EXISTS (
        SELECT 1 FROM change_orders c
        WHERE c.id = signature_requests.document_id
          AND c.project_id = signature_requests.project_id))
    )
  );

-- Verify manually (as anon, no session):
--   SELECT public_get_signature_request_by_token('sig_someRealToken');
--   SELECT public_get_document_for_signing('sig_someRealToken');
--   SELECT public_signing_ticket_json('00000000-0000-0000-0000-000000000000');  -- permission denied
--   INSERT INTO signature_requests (document_type, document_id, company_id, project_id, signature_token)
--     VALUES ('cor', '<id>', '<id>', '<id>', 'sig_attackermint1');               -- RLS violation
-- Then run supabase/tests/public_signing_smoke.sql (rolls back).
