-- ============================================================
-- TIGHTEN FIVE OVER-BROAD RLS POLICIES
-- ============================================================
-- Found during the 2026-10-18 health check:
--
--   1. labor_class_rates "Only authenticated users can view rates"
--      — `USING (auth.uid() IS NOT NULL)` leaks every tenant's
--      billable + cost + overtime rates to any logged-in user.
--
--   2. labor_categories "Field users can view labor categories"
--      — `USING (true)` with grants to anon + authenticated.
--      Not caught by 20260630_drop_blanket_anon_rls.sql because
--      that migration only matches policies tagged `TO anon`;
--      this one has no TO clause so pg records roles = {public}.
--
--   3. labor_classes "Secure field view labor classes" left arm
--      — `auth.uid() IS NOT NULL OR …field_session…` means an
--      authenticated Company-B user reads Company-A's class list.
--
--   4. document_audit_log "doc_audit_insert" — `WITH CHECK (true)`
--      with no TO clause. Any authenticated or anon caller inserts
--      arbitrary (document_id, project_id, company_id, operation,
--      user_id) rows, forging approved/deleted events in another
--      tenant's audit trail.
--
--   5. photo_upload_queue three authenticated policies — SELECT,
--      INSERT, UPDATE all `USING (true)` / `WITH CHECK (true)`.
--      Any authenticated user reads another tenant's queue
--      (temp paths, ticket IDs, errors) and marks their rows
--      `confirmed` or `failed` to spoof or suppress their sync.
--
-- The user_company_ids() helper (SECURITY DEFINER, defined in
-- 20260720_enable_rls_remaining_tables.sql) returns the companies
-- the current auth user is an active member of without recursing
-- into user_companies RLS.
--
-- IDEMPOTENT — safe to re-run.
-- ============================================================

-- ============================================================
-- 1. labor_class_rates — company-scoped SELECT
-- ============================================================

DROP POLICY IF EXISTS "Only authenticated users can view rates" ON labor_class_rates;
DROP POLICY IF EXISTS "Field users can view labor class rates" ON labor_class_rates;

CREATE POLICY "Members view own company labor class rates"
ON labor_class_rates FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM labor_classes lc
    WHERE lc.id = labor_class_rates.labor_class_id
      AND lc.company_id IN (SELECT user_company_ids())
  )
);

-- ============================================================
-- 2. labor_categories — company-scoped SELECT
-- ============================================================

DROP POLICY IF EXISTS "Field users can view labor categories" ON labor_categories;

-- Authenticated users: scoped by company membership.
CREATE POLICY "Members view own company labor categories"
ON labor_categories FOR SELECT
TO authenticated
USING (
  company_id IN (SELECT user_company_ids())
);

-- Anon field users with a valid PIN session: scoped by that
-- session's company. has_valid_field_session() is SECURITY
-- DEFINER so it does not recurse into field_sessions RLS.
CREATE POLICY "Field session view labor categories"
ON labor_categories FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM has_valid_field_session() s
    WHERE s.company_id = labor_categories.company_id
  )
);

-- ============================================================
-- 3. labor_classes — tighten the auth-arm leak
-- ============================================================

DROP POLICY IF EXISTS "Secure field view labor classes" ON labor_classes;

CREATE POLICY "Secure field view labor classes"
ON labor_classes FOR SELECT
USING (
  -- Authenticated users: only their own companies' classes.
  labor_classes.company_id IN (SELECT user_company_ids())
  OR
  -- Anon field users: scoped by field-session company.
  EXISTS (
    SELECT 1
    FROM has_valid_field_session() s
    WHERE s.company_id = labor_classes.company_id
  )
);

-- ============================================================
-- 4. document_audit_log — WITH CHECK on INSERT
-- ============================================================

DROP POLICY IF EXISTS "doc_audit_insert" ON document_audit_log;

-- Only authenticated users may write audit rows, and only for
-- (company_id, document_id, user_id) tuples that actually
-- correspond to themselves and their company. Server-side
-- SECURITY DEFINER triggers that stamp audit rows continue to
-- bypass RLS as owner, so system-logged events still land.
CREATE POLICY "doc_audit_insert" ON document_audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (user_id IS NULL OR user_id = auth.uid())
  AND (company_id IS NULL OR company_id IN (SELECT user_company_ids()))
  AND (
    document_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM documents d
      WHERE d.id = document_audit_log.document_id
        AND d.company_id IN (SELECT user_company_ids())
    )
  )
  AND (
    project_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = document_audit_log.project_id
        AND p.company_id IN (SELECT user_company_ids())
    )
  )
);

-- ============================================================
-- 5. photo_upload_queue — scope SELECT / INSERT / UPDATE to the
--     tenant that owns the queue's ticket (and so, project).
-- ============================================================

DROP POLICY IF EXISTS "Users can view own photo queue" ON photo_upload_queue;
DROP POLICY IF EXISTS "Users can insert to photo queue" ON photo_upload_queue;
DROP POLICY IF EXISTS "Users can update own photo queue" ON photo_upload_queue;

CREATE POLICY "Users view own company photo queue"
ON photo_upload_queue FOR SELECT
TO authenticated
USING (
  ticket_id IS NULL
  OR EXISTS (
    SELECT 1
    FROM t_and_m_tickets t
    JOIN projects p ON p.id = t.project_id
    WHERE t.id = photo_upload_queue.ticket_id
      AND p.company_id IN (SELECT user_company_ids())
  )
);

CREATE POLICY "Users insert own company photo queue"
ON photo_upload_queue FOR INSERT
TO authenticated
WITH CHECK (
  ticket_id IS NULL
  OR EXISTS (
    SELECT 1
    FROM t_and_m_tickets t
    JOIN projects p ON p.id = t.project_id
    WHERE t.id = photo_upload_queue.ticket_id
      AND p.company_id IN (SELECT user_company_ids())
  )
);

CREATE POLICY "Users update own company photo queue"
ON photo_upload_queue FOR UPDATE
TO authenticated
USING (
  ticket_id IS NULL
  OR EXISTS (
    SELECT 1
    FROM t_and_m_tickets t
    JOIN projects p ON p.id = t.project_id
    WHERE t.id = photo_upload_queue.ticket_id
      AND p.company_id IN (SELECT user_company_ids())
  )
)
WITH CHECK (
  ticket_id IS NULL
  OR EXISTS (
    SELECT 1
    FROM t_and_m_tickets t
    JOIN projects p ON p.id = t.project_id
    WHERE t.id = photo_upload_queue.ticket_id
      AND p.company_id IN (SELECT user_company_ids())
  )
);
