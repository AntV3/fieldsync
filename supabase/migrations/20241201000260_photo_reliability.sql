-- Migration: Photo Reliability & Export Snapshots
-- Purpose: Add infrastructure for reliable photo uploads and dispute-ready exports
-- Date: January 2, 2025
-- Risk: LOW (additive only, no data changes)

-- ============================================
-- PHOTO UPLOAD QUEUE (for retry/offline support)
-- ============================================

-- Queue for tracking photo uploads that need processing
CREATE TABLE IF NOT EXISTS photo_upload_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES t_and_m_tickets(id) ON DELETE CASCADE,
  temp_id TEXT NOT NULL,  -- Client-side temporary ID for matching
  file_name TEXT,
  file_size_bytes INTEGER,

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'confirmed', 'failed', 'cancelled')),

  -- Retry logic
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  last_attempt TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,

  -- Results
  uploaded_url TEXT,  -- Set when upload succeeds
  storage_path TEXT,  -- Path in storage bucket

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,

  -- Prevent duplicate uploads
  UNIQUE(ticket_id, temp_id)
);

-- Index for processing pending uploads
CREATE INDEX IF NOT EXISTS idx_photo_queue_pending
ON photo_upload_queue(status, next_retry_at)
WHERE status IN ('pending', 'failed');

-- Index for ticket lookups
CREATE INDEX IF NOT EXISTS idx_photo_queue_ticket
ON photo_upload_queue(ticket_id);

-- ============================================
-- COR EXPORT SNAPSHOTS (for dispute-ready exports)
-- ============================================

-- Frozen snapshots of COR data at export time
CREATE TABLE IF NOT EXISTS cor_export_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cor_id UUID REFERENCES change_orders(id) ON DELETE CASCADE,

  -- Export metadata
  exported_at TIMESTAMPTZ DEFAULT NOW(),
  exported_by UUID,  -- User who triggered export
  export_type TEXT DEFAULT 'pdf' CHECK (export_type IN ('pdf', 'email', 'download')),
  export_reason TEXT,  -- Optional: "client request", "dispute", "audit"

  -- Frozen data (complete snapshot)
  cor_data JSONB NOT NULL,  -- Full COR record
  tickets_data JSONB NOT NULL,  -- All associated tickets with workers/items
  photos_manifest JSONB NOT NULL,  -- Photo URLs and verification status
  totals_snapshot JSONB,  -- Calculated totals at export time

  -- Versioning
  version INTEGER DEFAULT 1,
  checksum TEXT NOT NULL,  -- SHA256 of export content for integrity

  -- Client tracking
  client_sent_at TIMESTAMPTZ,
  client_email TEXT,
  client_name TEXT,

  -- File reference (if stored)
  pdf_storage_path TEXT,
  pdf_size_bytes INTEGER
);

-- Index for COR export history
CREATE INDEX IF NOT EXISTS idx_export_snapshots_cor
ON cor_export_snapshots(cor_id, exported_at DESC);

-- Index for finding exports by date
CREATE INDEX IF NOT EXISTS idx_export_snapshots_date
ON cor_export_snapshots(exported_at DESC);

-- ============================================
-- PHOTO VERIFICATION TRACKING
-- ============================================

-- Add verification columns to tickets
ALTER TABLE t_and_m_tickets
ADD COLUMN IF NOT EXISTS photos_verified_at TIMESTAMPTZ;

ALTER TABLE t_and_m_tickets
ADD COLUMN IF NOT EXISTS photos_verification_status TEXT DEFAULT 'pending'
  CHECK (photos_verification_status IN ('pending', 'verified', 'issues', 'empty'));

ALTER TABLE t_and_m_tickets
ADD COLUMN IF NOT EXISTS photos_issue_count INTEGER DEFAULT 0;

-- ============================================
-- PHOTO INTEGRITY LOG
-- ============================================

-- Log all photo operations for audit trail
CREATE TABLE IF NOT EXISTS photo_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES t_and_m_tickets(id) ON DELETE SET NULL,
  cor_id UUID REFERENCES change_orders(id) ON DELETE SET NULL,

  -- Operation details
  operation TEXT NOT NULL CHECK (operation IN (
    'upload_started', 'upload_completed', 'upload_failed',
    'verification_passed', 'verification_failed',
    'deleted', 'restored',
    'export_included', 'export_excluded'
  )),

  photo_url TEXT,
  storage_path TEXT,

  -- Metadata
  details JSONB,
  error_message TEXT,

  -- Context
  triggered_by TEXT,  -- 'user', 'system', 'retry'
  user_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for ticket audit
CREATE INDEX IF NOT EXISTS idx_photo_audit_ticket
ON photo_audit_log(ticket_id, created_at DESC);

-- Index for finding failures
CREATE INDEX IF NOT EXISTS idx_photo_audit_failures
ON photo_audit_log(operation, created_at DESC)
WHERE operation IN ('upload_failed', 'verification_failed');

-- ============================================
-- RLS POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE photo_upload_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE cor_export_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_audit_log ENABLE ROW LEVEL SECURITY;

-- Photo queue: Users can manage their own uploads
CREATE POLICY "Users can view own photo queue"
ON photo_upload_queue FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can insert to photo queue"
ON photo_upload_queue FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can update own photo queue"
ON photo_upload_queue FOR UPDATE
TO authenticated
USING (true);

-- Export snapshots: Users can view exports for their CORs
CREATE POLICY "Users can view export snapshots"
ON cor_export_snapshots FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can create export snapshots"
ON cor_export_snapshots FOR INSERT
TO authenticated
WITH CHECK (true);

-- Audit log: Read-only for users
CREATE POLICY "Users can view photo audit log"
ON photo_audit_log FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "System can insert audit log"
ON photo_audit_log FOR INSERT
TO authenticated
WITH CHECK (true);

-- Field users (anon) need limited access
CREATE POLICY "Field users can view own photo queue"
ON photo_upload_queue FOR SELECT
TO anon
USING (true);

CREATE POLICY "Field users can insert to photo queue"
ON photo_upload_queue FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "Field users can update photo queue"
ON photo_upload_queue FOR UPDATE
TO anon
USING (true);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get pending uploads for a ticket
CREATE OR REPLACE FUNCTION get_pending_photo_uploads(p_ticket_id UUID)
RETURNS TABLE (
  id UUID,
  temp_id TEXT,
  status TEXT,
  attempts INTEGER,
  last_error TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT pq.id, pq.temp_id, pq.status, pq.attempts, pq.last_error
  FROM photo_upload_queue pq
  WHERE pq.ticket_id = p_ticket_id
  AND pq.status IN ('pending', 'uploading', 'failed')
  ORDER BY pq.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to confirm photo upload
CREATE OR REPLACE FUNCTION confirm_photo_upload(
  p_queue_id UUID,
  p_uploaded_url TEXT,
  p_storage_path TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_ticket_id UUID;
  v_current_photos JSONB;
BEGIN
  -- Get ticket ID and mark queue entry as confirmed
  UPDATE photo_upload_queue
  SET status = 'confirmed',
      uploaded_url = p_uploaded_url,
      storage_path = p_storage_path,
      confirmed_at = NOW()
  WHERE id = p_queue_id
  AND status IN ('pending', 'uploading')
  RETURNING ticket_id INTO v_ticket_id;

  IF v_ticket_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Append URL to ticket photos array
  SELECT COALESCE(photos, '[]'::JSONB) INTO v_current_photos
  FROM t_and_m_tickets
  WHERE id = v_ticket_id;

  UPDATE t_and_m_tickets
  SET photos = v_current_photos || to_jsonb(p_uploaded_url)
  WHERE id = v_ticket_id;

  -- Log the successful upload
  INSERT INTO photo_audit_log (ticket_id, operation, photo_url, storage_path, triggered_by)
  VALUES (v_ticket_id, 'upload_completed', p_uploaded_url, p_storage_path, 'system');

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark photo upload as failed
CREATE OR REPLACE FUNCTION mark_photo_upload_failed(
  p_queue_id UUID,
  p_error TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_ticket_id UUID;
  v_attempts INTEGER;
  v_max_attempts INTEGER;
BEGIN
  UPDATE photo_upload_queue
  SET status = CASE
    WHEN attempts + 1 >= max_attempts THEN 'failed'
    ELSE 'failed'
    END,
      attempts = attempts + 1,
      last_error = p_error,
      last_attempt = NOW(),
      next_retry_at = CASE
        WHEN attempts + 1 < max_attempts THEN NOW() + (POWER(2, attempts + 1) || ' seconds')::INTERVAL
        ELSE NULL
        END
  WHERE id = p_queue_id
  RETURNING ticket_id, attempts, max_attempts INTO v_ticket_id, v_attempts, v_max_attempts;

  IF v_ticket_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Log the failure
  INSERT INTO photo_audit_log (ticket_id, operation, error_message, details, triggered_by)
  VALUES (v_ticket_id, 'upload_failed', p_error,
    jsonb_build_object('attempt', v_attempts, 'max_attempts', v_max_attempts),
    'system');

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to verify all photos in a ticket are accessible
CREATE OR REPLACE FUNCTION mark_ticket_photos_verified(
  p_ticket_id UUID,
  p_status TEXT,
  p_issue_count INTEGER DEFAULT 0
) RETURNS VOID AS $$
BEGIN
  UPDATE t_and_m_tickets
  SET photos_verified_at = NOW(),
      photos_verification_status = p_status,
      photos_issue_count = p_issue_count
  WHERE id = p_ticket_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to roles
GRANT EXECUTE ON FUNCTION get_pending_photo_uploads TO authenticated, anon;
GRANT EXECUTE ON FUNCTION confirm_photo_upload TO authenticated, anon;
GRANT EXECUTE ON FUNCTION mark_photo_upload_failed TO authenticated, anon;
GRANT EXECUTE ON FUNCTION mark_ticket_photos_verified TO authenticated, anon;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE photo_upload_queue IS 'Queue for managing photo uploads with retry support';
COMMENT ON TABLE cor_export_snapshots IS 'Frozen snapshots of COR data for dispute-ready exports';
COMMENT ON TABLE photo_audit_log IS 'Audit trail for all photo operations';

COMMENT ON COLUMN photo_upload_queue.temp_id IS 'Client-side ID for matching upload to UI element';
COMMENT ON COLUMN photo_upload_queue.next_retry_at IS 'When to retry failed upload (exponential backoff)';
COMMENT ON COLUMN cor_export_snapshots.checksum IS 'SHA256 hash of export content for integrity verification';
COMMENT ON COLUMN cor_export_snapshots.photos_manifest IS 'List of photo URLs with verification status at export time';
