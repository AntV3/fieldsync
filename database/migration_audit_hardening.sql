-- ============================================================
-- Audit Hardening Migration
-- Addresses database-level findings from the DB operations audit
-- Date: 2026-03-09
-- ============================================================

-- ============================================================
-- 2. SEC-5 / IV-2: Add CHECK constraints on status columns
--    Defense-in-depth: even if client code is bypassed, the DB
--    rejects invalid status values.
-- ============================================================

-- Change orders status constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'change_orders_status_check'
  ) THEN
    ALTER TABLE change_orders
      ADD CONSTRAINT change_orders_status_check
      CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'billed', 'closed'));
  END IF;
END $$;

-- Draw requests status constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'draw_requests_status_check'
  ) THEN
    ALTER TABLE draw_requests
      ADD CONSTRAINT draw_requests_status_check
      CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'paid'));
  END IF;
END $$;

-- ============================================================
-- 3. RC-1: Create a server-side function for atomic COR number
--    generation. Eliminates the read-then-write race condition
--    in getNextCORNumber().
-- ============================================================

CREATE OR REPLACE FUNCTION get_next_cor_number(p_project_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  max_num INTEGER := 0;
  cur_num INTEGER;
  rec RECORD;
BEGIN
  -- Lock the project row to serialize concurrent COR creation
  PERFORM id FROM projects WHERE id = p_project_id FOR UPDATE;

  FOR rec IN
    SELECT cor_number FROM change_orders WHERE project_id = p_project_id
  LOOP
    IF rec.cor_number ~ '^COR #(\d+)$' THEN
      cur_num := (regexp_match(rec.cor_number, '^COR #(\d+)$'))[1]::INTEGER;
      IF cur_num > max_num THEN
        max_num := cur_num;
      END IF;
    END IF;
  END LOOP;

  RETURN 'COR #' || (max_num + 1);
END;
$$;

-- ============================================================
-- 4. RC-3 / DI-1: Create a server-side function for atomic
--    COR snapshot save. Wraps the three-step mark-insert-update
--    in a single transaction to prevent partial state.
-- ============================================================

CREATE OR REPLACE FUNCTION save_cor_snapshot(
  p_snapshot_id UUID,
  p_cor_id UUID,
  p_job_id TEXT,
  p_cor_version INTEGER,
  p_cor_data JSONB,
  p_tickets_data JSONB,
  p_photos_manifest JSONB,
  p_totals JSONB,
  p_checksum TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSONB;
  user_id UUID;
BEGIN
  -- Get current user
  user_id := auth.uid();

  -- Step 1: Mark all previous snapshots as not current
  UPDATE cor_export_snapshots
    SET is_current = FALSE
    WHERE cor_id = p_cor_id;

  -- Step 2: Insert new snapshot
  INSERT INTO cor_export_snapshots (
    id, cor_id, job_id, cor_version, cor_data, tickets_data,
    photos_manifest, totals_snapshot, checksum, is_current, exported_by
  ) VALUES (
    p_snapshot_id, p_cor_id, p_job_id, p_cor_version, p_cor_data, p_tickets_data,
    p_photos_manifest, p_totals, p_checksum, TRUE, user_id
  );

  -- Step 3: Update COR's last snapshot version
  UPDATE change_orders
    SET last_snapshot_version = p_cor_version
    WHERE id = p_cor_id;

  -- Return the new snapshot as JSON
  SELECT to_jsonb(s.*) INTO result
    FROM cor_export_snapshots s
    WHERE s.id = p_snapshot_id;

  RETURN result;
END;
$$;

-- ============================================================
-- 5. Performance index: support the N+1 folder document count
--    queries (PF-1) until they can be replaced with a single
--    grouped query or RPC.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_documents_folder_current
  ON documents (folder_id)
  WHERE archived_at IS NULL AND is_current = TRUE;

-- ============================================================
-- 6. Performance index: speed up universalSearch worker query
--    (PF-2) by indexing crew_checkins by company via project.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_crew_checkins_project_date
  ON crew_checkins (project_id, check_in_date DESC);
