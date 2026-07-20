-- COR Log Feature Migration
-- Creates cor_log_entries table for tracking COR client communication
-- Run this migration in Supabase SQL Editor

-- ============================================================================
-- TABLE: cor_log_entries
-- Stores user-editable fields for COR client presentation log
-- ============================================================================

CREATE TABLE IF NOT EXISTS cor_log_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Auto-generated sequential number per project
  log_number INTEGER NOT NULL,

  -- User-editable fields for client communication tracking
  date_sent_to_client DATE,
  ce_number VARCHAR(50),  -- Client's reference/CE number
  comments TEXT,

  -- Audit timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure one log entry per COR
  CONSTRAINT uq_cor_log_change_order UNIQUE (change_order_id),
  -- Ensure unique log numbers per project
  CONSTRAINT uq_cor_log_project_number UNIQUE (project_id, log_number)
);

-- Index for efficient project-based queries
CREATE INDEX IF NOT EXISTS idx_cor_log_project ON cor_log_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_cor_log_company ON cor_log_entries(company_id);

-- ============================================================================
-- TRIGGER: Auto-create log entry when COR is created
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_cor_log_entry()
RETURNS TRIGGER AS $$
DECLARE
  next_log_num INTEGER;
  v_company_id UUID;
BEGIN
  -- Get company_id from the project
  SELECT company_id INTO v_company_id
  FROM projects WHERE id = NEW.project_id;

  -- Get next sequential log number for this project
  SELECT COALESCE(MAX(log_number), 0) + 1 INTO next_log_num
  FROM cor_log_entries
  WHERE project_id = NEW.project_id;

  -- Create the log entry
  INSERT INTO cor_log_entries (
    change_order_id,
    project_id,
    company_id,
    log_number
  ) VALUES (
    NEW.id,
    NEW.project_id,
    v_company_id,
    next_log_num
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists, then create
DROP TRIGGER IF EXISTS trg_auto_create_cor_log ON change_orders;

CREATE TRIGGER trg_auto_create_cor_log
AFTER INSERT ON change_orders
FOR EACH ROW
EXECUTE FUNCTION auto_create_cor_log_entry();

-- ============================================================================
-- FUNCTION: Backfill existing CORs
-- Creates log entries for any existing change_orders that don't have one
-- ============================================================================

CREATE OR REPLACE FUNCTION backfill_cor_log_entries()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_cor RECORD;
  v_next_log_num INTEGER;
  v_company_id UUID;
BEGIN
  -- Loop through CORs without log entries, ordered by creation date
  FOR v_cor IN
    SELECT co.id, co.project_id, co.created_at
    FROM change_orders co
    LEFT JOIN cor_log_entries cle ON co.id = cle.change_order_id
    WHERE cle.id IS NULL
    ORDER BY co.project_id, co.created_at
  LOOP
    -- Get company_id from project
    SELECT company_id INTO v_company_id
    FROM projects WHERE id = v_cor.project_id;

    -- Get next log number for this project
    SELECT COALESCE(MAX(log_number), 0) + 1 INTO v_next_log_num
    FROM cor_log_entries
    WHERE project_id = v_cor.project_id;

    -- Insert log entry
    INSERT INTO cor_log_entries (
      change_order_id,
      project_id,
      company_id,
      log_number
    ) VALUES (
      v_cor.id,
      v_cor.project_id,
      v_company_id,
      v_next_log_num
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Run backfill for existing CORs
SELECT backfill_cor_log_entries();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE cor_log_entries ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view log entries for their company's projects
CREATE POLICY "Users can view company cor log entries"
ON cor_log_entries FOR SELECT
TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  )
);

-- Policy: Users can update log entries for their company's projects
CREATE POLICY "Users can update company cor log entries"
ON cor_log_entries FOR UPDATE
TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  )
)
WITH CHECK (
  company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  )
);

-- Policy: Field workers with valid session can view log entries
CREATE POLICY "Field workers can view cor log entries"
ON cor_log_entries FOR SELECT
TO anon
USING (
  auth.uid() IS NULL
  AND validate_field_session(project_id)
);

-- ============================================================================
-- FUNCTION: Get COR Log with joined COR data
-- Returns complete log view data for a project
-- ============================================================================

CREATE OR REPLACE FUNCTION get_cor_log(p_project_id UUID)
RETURNS TABLE (
  id UUID,
  log_number INTEGER,
  date_sent_to_client DATE,
  ce_number VARCHAR(50),
  comments TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  -- COR data
  cor_id UUID,
  cor_number VARCHAR(50),
  cor_title TEXT,
  cor_total NUMERIC,
  cor_status VARCHAR(50),
  cor_created_at TIMESTAMPTZ,
  cor_approved_at TIMESTAMPTZ,
  cor_approved_by TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cle.id,
    cle.log_number,
    cle.date_sent_to_client,
    cle.ce_number,
    cle.comments,
    cle.created_at,
    cle.updated_at,
    -- COR data
    co.id AS cor_id,
    co.cor_number,
    co.title AS cor_title,
    co.cor_total,
    co.status AS cor_status,
    co.created_at AS cor_created_at,
    co.approved_at AS cor_approved_at,
    (SELECT full_name FROM profiles WHERE id = co.approved_by) AS cor_approved_by
  FROM cor_log_entries cle
  INNER JOIN change_orders co ON cle.change_order_id = co.id
  WHERE cle.project_id = p_project_id
  ORDER BY cle.log_number ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_cor_log(UUID) TO authenticated;

-- ============================================================================
-- FUNCTION: Update COR Log Entry
-- Updates user-editable fields
-- ============================================================================

CREATE OR REPLACE FUNCTION update_cor_log_entry(
  p_entry_id UUID,
  p_date_sent_to_client DATE DEFAULT NULL,
  p_ce_number VARCHAR(50) DEFAULT NULL,
  p_comments TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_entry cor_log_entries%ROWTYPE;
  v_company_id UUID;
BEGIN
  -- Get user's company
  SELECT company_id INTO v_company_id
  FROM profiles WHERE id = auth.uid();

  -- Check entry exists and belongs to user's company
  SELECT * INTO v_entry
  FROM cor_log_entries
  WHERE id = p_entry_id AND company_id = v_company_id;

  IF v_entry.id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Entry not found or access denied'
    );
  END IF;

  -- Update the entry
  UPDATE cor_log_entries
  SET
    date_sent_to_client = COALESCE(p_date_sent_to_client, date_sent_to_client),
    ce_number = COALESCE(p_ce_number, ce_number),
    comments = COALESCE(p_comments, comments),
    updated_at = NOW()
  WHERE id = p_entry_id;

  -- Return updated entry
  SELECT * INTO v_entry
  FROM cor_log_entries WHERE id = p_entry_id;

  RETURN json_build_object(
    'success', true,
    'entry', row_to_json(v_entry)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION update_cor_log_entry(UUID, DATE, VARCHAR, TEXT) TO authenticated;

-- ============================================================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================================================

-- Check table structure
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'cor_log_entries';

-- Check trigger exists
-- SELECT trigger_name, event_manipulation, action_timing
-- FROM information_schema.triggers
-- WHERE trigger_name = 'trg_auto_create_cor_log';

-- Check backfill results
-- SELECT COUNT(*) as log_entries FROM cor_log_entries;
-- SELECT COUNT(*) as change_orders FROM change_orders;
