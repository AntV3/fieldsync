-- ============================================
-- COR Export Pipeline Migration
-- ============================================
-- Implements industrial-grade export system per specification:
-- - Idempotent export requests
-- - Async export pipeline with state machine
-- - Snapshot-based deterministic exports
-- - Failure handling and retry support
--
-- Run this in your Supabase SQL Editor after running
-- migration_photo_reliability.sql
-- ============================================

-- ============================================
-- 1. EXPORT JOBS TABLE (State Machine)
-- ============================================
-- Tracks all export requests with explicit states
-- Enables idempotent requests and failure recovery

CREATE TABLE IF NOT EXISTS cor_export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cor_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  snapshot_id UUID REFERENCES cor_export_snapshots(id) ON DELETE SET NULL,

  -- Idempotency key - prevents duplicate exports
  -- Format: cor_id:version:timestamp or custom client key
  idempotency_key TEXT NOT NULL,

  -- State machine: pending -> generating -> completed | failed
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Export requested, not yet started
    'generating',   -- PDF generation in progress
    'completed',    -- Successfully generated and available
    'failed'        -- Generation failed, may be retried
  )),

  -- Export options (stored for retry)
  options JSONB DEFAULT '{}',

  -- Progress tracking
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Retry handling
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_error TEXT,
  error_details JSONB,

  -- Result data
  pdf_url TEXT,           -- URL to generated PDF
  pdf_size_bytes INTEGER,
  generation_time_ms INTEGER,

  -- Metrics
  photo_count INTEGER DEFAULT 0,
  ticket_count INTEGER DEFAULT 0,
  page_count INTEGER DEFAULT 0,

  -- Audit
  requested_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique idempotency keys
  CONSTRAINT unique_idempotency_key UNIQUE (idempotency_key)
);

-- Index for finding jobs by COR
CREATE INDEX IF NOT EXISTS idx_export_jobs_cor
ON cor_export_jobs(cor_id, created_at DESC);

-- Index for finding pending/generating jobs
CREATE INDEX IF NOT EXISTS idx_export_jobs_status
ON cor_export_jobs(status, created_at ASC)
WHERE status IN ('pending', 'generating');

-- Index for idempotency lookups
CREATE INDEX IF NOT EXISTS idx_export_jobs_idempotency
ON cor_export_jobs(idempotency_key);

-- ============================================
-- 2. ADD VERSION COLUMN TO CHANGE_ORDERS
-- ============================================
-- Tracks COR version for snapshot invalidation
-- Incremented on any meaningful change

ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS last_snapshot_version INTEGER DEFAULT 0;

-- ============================================
-- 3. ADD PRE-AGGREGATED STATS
-- ============================================
-- Pre-computed statistics for fast export summary

ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS total_labor_hours DECIMAL(10,2) DEFAULT 0;

ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS total_overtime_hours DECIMAL(10,2) DEFAULT 0;

ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS ticket_count INTEGER DEFAULT 0;

ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS photo_count INTEGER DEFAULT 0;

ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS verified_ticket_count INTEGER DEFAULT 0;

-- ============================================
-- 4. UPDATE SNAPSHOT TABLE
-- ============================================
-- Add job reference and improve structure

ALTER TABLE cor_export_snapshots
ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES cor_export_jobs(id) ON DELETE SET NULL;

ALTER TABLE cor_export_snapshots
ADD COLUMN IF NOT EXISTS cor_version INTEGER;

ALTER TABLE cor_export_snapshots
ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT TRUE;

-- Index for finding current snapshot
CREATE INDEX IF NOT EXISTS idx_export_snapshots_current
ON cor_export_snapshots(cor_id, is_current)
WHERE is_current = TRUE;

-- ============================================
-- 5. VERSION INCREMENT TRIGGER
-- ============================================
-- Automatically increment COR version on changes

CREATE OR REPLACE FUNCTION increment_cor_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only increment on meaningful changes
  IF TG_OP = 'UPDATE' THEN
    -- Skip if only metadata fields changed
    IF OLD.updated_at != NEW.updated_at AND
       OLD.version = NEW.version AND
       OLD.last_snapshot_version = NEW.last_snapshot_version THEN
      -- Check if any substantive field changed
      IF OLD.title != NEW.title OR
         OLD.scope_of_work IS DISTINCT FROM NEW.scope_of_work OR
         OLD.period_start IS DISTINCT FROM NEW.period_start OR
         OLD.period_end IS DISTINCT FROM NEW.period_end OR
         OLD.status != NEW.status OR
         OLD.labor_subtotal != NEW.labor_subtotal OR
         OLD.materials_subtotal != NEW.materials_subtotal OR
         OLD.equipment_subtotal != NEW.equipment_subtotal OR
         OLD.subcontractors_subtotal != NEW.subcontractors_subtotal OR
         OLD.cor_total != NEW.cor_total THEN
        NEW.version := OLD.version + 1;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cor_version_increment ON change_orders;
CREATE TRIGGER trg_cor_version_increment
BEFORE UPDATE ON change_orders
FOR EACH ROW EXECUTE FUNCTION increment_cor_version();

-- ============================================
-- 6. PRE-AGGREGATED STATS UPDATE FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION update_cor_aggregated_stats(p_cor_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_labor_hours DECIMAL(10,2) := 0;
  v_ot_hours DECIMAL(10,2) := 0;
  v_ticket_count INTEGER := 0;
  v_photo_count INTEGER := 0;
  v_verified_count INTEGER := 0;
BEGIN
  -- Calculate total labor hours from labor line items
  SELECT
    COALESCE(SUM(regular_hours), 0),
    COALESCE(SUM(overtime_hours), 0)
  INTO v_labor_hours, v_ot_hours
  FROM change_order_labor
  WHERE change_order_id = p_cor_id;

  -- Count associated tickets and photos
  SELECT
    COUNT(DISTINCT t.id),
    COALESCE(SUM(COALESCE(array_length(t.photos, 1), 0)), 0),
    COUNT(DISTINCT CASE WHEN t.client_signature_data IS NOT NULL THEN t.id END)
  INTO v_ticket_count, v_photo_count, v_verified_count
  FROM change_order_ticket_associations cota
  JOIN t_and_m_tickets t ON t.id = cota.ticket_id
  WHERE cota.change_order_id = p_cor_id;

  -- Update COR with aggregated stats
  UPDATE change_orders
  SET
    total_labor_hours = v_labor_hours,
    total_overtime_hours = v_ot_hours,
    ticket_count = v_ticket_count,
    photo_count = v_photo_count,
    verified_ticket_count = v_verified_count
  WHERE id = p_cor_id;
END;
$$;

-- ============================================
-- 7. TRIGGER TO UPDATE STATS ON ASSOCIATION CHANGES
-- ============================================

CREATE OR REPLACE FUNCTION trigger_update_cor_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM update_cor_aggregated_stats(OLD.change_order_id);
    RETURN OLD;
  ELSE
    PERFORM update_cor_aggregated_stats(NEW.change_order_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_cor_stats ON change_order_ticket_associations;
CREATE TRIGGER trg_update_cor_stats
AFTER INSERT OR UPDATE OR DELETE ON change_order_ticket_associations
FOR EACH ROW EXECUTE FUNCTION trigger_update_cor_stats();

-- Also trigger on labor changes
DROP TRIGGER IF EXISTS trg_update_cor_stats_labor ON change_order_labor;
CREATE TRIGGER trg_update_cor_stats_labor
AFTER INSERT OR UPDATE OR DELETE ON change_order_labor
FOR EACH ROW EXECUTE FUNCTION trigger_update_cor_stats();

-- ============================================
-- 8. IDEMPOTENT EXPORT REQUEST FUNCTION
-- ============================================
-- Returns existing job if idempotency key matches,
-- otherwise creates new pending job

CREATE OR REPLACE FUNCTION request_cor_export(
  p_cor_id UUID,
  p_idempotency_key TEXT,
  p_options JSONB DEFAULT '{}',
  p_requested_by UUID DEFAULT NULL
)
RETURNS TABLE (
  job_id UUID,
  status TEXT,
  is_new BOOLEAN,
  snapshot_id UUID,
  pdf_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_job cor_export_jobs%ROWTYPE;
  v_new_job_id UUID;
BEGIN
  -- Check for existing job with same idempotency key
  SELECT * INTO v_existing_job
  FROM cor_export_jobs
  WHERE cor_export_jobs.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    -- Return existing job
    RETURN QUERY SELECT
      v_existing_job.id,
      v_existing_job.status,
      FALSE,
      v_existing_job.snapshot_id,
      v_existing_job.pdf_url;
    RETURN;
  END IF;

  -- Create new pending job
  INSERT INTO cor_export_jobs (
    cor_id,
    idempotency_key,
    options,
    requested_by,
    status
  ) VALUES (
    p_cor_id,
    p_idempotency_key,
    p_options,
    p_requested_by,
    'pending'
  )
  RETURNING id INTO v_new_job_id;

  RETURN QUERY SELECT
    v_new_job_id,
    'pending'::TEXT,
    TRUE,
    NULL::UUID,
    NULL::TEXT;
END;
$$;

-- ============================================
-- 9. UPDATE EXPORT JOB STATUS FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION update_export_job_status(
  p_job_id UUID,
  p_status TEXT,
  p_snapshot_id UUID DEFAULT NULL,
  p_pdf_url TEXT DEFAULT NULL,
  p_error TEXT DEFAULT NULL,
  p_error_details JSONB DEFAULT NULL,
  p_metrics JSONB DEFAULT NULL
)
RETURNS cor_export_jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job cor_export_jobs%ROWTYPE;
BEGIN
  UPDATE cor_export_jobs
  SET
    status = p_status,
    snapshot_id = COALESCE(p_snapshot_id, snapshot_id),
    pdf_url = COALESCE(p_pdf_url, pdf_url),
    last_error = COALESCE(p_error, last_error),
    error_details = COALESCE(p_error_details, error_details),
    started_at = CASE WHEN p_status = 'generating' THEN NOW() ELSE started_at END,
    completed_at = CASE WHEN p_status IN ('completed', 'failed') THEN NOW() ELSE completed_at END,
    generation_time_ms = CASE
      WHEN p_status = 'completed' AND started_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
      ELSE generation_time_ms
    END,
    photo_count = COALESCE((p_metrics->>'photo_count')::INTEGER, photo_count),
    ticket_count = COALESCE((p_metrics->>'ticket_count')::INTEGER, ticket_count),
    page_count = COALESCE((p_metrics->>'page_count')::INTEGER, page_count),
    pdf_size_bytes = COALESCE((p_metrics->>'pdf_size_bytes')::INTEGER, pdf_size_bytes),
    retry_count = CASE WHEN p_status = 'failed' THEN retry_count + 1 ELSE retry_count END,
    updated_at = NOW()
  WHERE id = p_job_id
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

-- ============================================
-- 10. RLS POLICIES FOR EXPORT JOBS
-- ============================================

ALTER TABLE cor_export_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view export jobs for their company CORs" ON cor_export_jobs;
CREATE POLICY "Users can view export jobs for their company CORs"
ON cor_export_jobs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    JOIN user_companies uc ON uc.company_id = co.company_id
    WHERE co.id = cor_export_jobs.cor_id
    AND uc.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can create export jobs for their company CORs" ON cor_export_jobs;
CREATE POLICY "Users can create export jobs for their company CORs"
ON cor_export_jobs FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM change_orders co
    JOIN user_companies uc ON uc.company_id = co.company_id
    WHERE co.id = cor_export_jobs.cor_id
    AND uc.user_id = auth.uid()
  )
);

-- ============================================
-- 11. GRANTS
-- ============================================

GRANT SELECT, INSERT, UPDATE ON cor_export_jobs TO authenticated;
GRANT EXECUTE ON FUNCTION request_cor_export(UUID, TEXT, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_export_job_status(UUID, TEXT, UUID, TEXT, TEXT, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION update_cor_aggregated_stats(UUID) TO authenticated;

-- ============================================
-- 12. COMMENTS
-- ============================================

COMMENT ON TABLE cor_export_jobs IS 'Tracks COR export requests with state machine for async, idempotent exports';
COMMENT ON COLUMN cor_export_jobs.idempotency_key IS 'Unique key to prevent duplicate export requests';
COMMENT ON COLUMN cor_export_jobs.status IS 'State machine: pending -> generating -> completed|failed';
COMMENT ON FUNCTION request_cor_export IS 'Idempotent export request - returns existing job or creates new pending one';
COMMENT ON FUNCTION update_export_job_status IS 'Updates export job state with optional metrics and error info';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
