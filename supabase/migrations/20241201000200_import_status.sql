-- Migration: Add import_status tracking to COR ticket associations
-- Purpose: Enable tracking and retry of failed COR data imports
-- Date: January 2, 2025
-- Risk: LOW (additive column only)

-- Add import_status column to track import state
-- Values: 'pending' (default), 'completed', 'failed'
ALTER TABLE change_order_ticket_associations
ADD COLUMN IF NOT EXISTS import_status TEXT DEFAULT 'pending'
  CHECK (import_status IN ('pending', 'completed', 'failed'));

-- Add timestamp for failed imports to enable debugging and retry visibility
ALTER TABLE change_order_ticket_associations
ADD COLUMN IF NOT EXISTS import_failed_at TIMESTAMPTZ;

-- Add error message storage for failed imports
ALTER TABLE change_order_ticket_associations
ADD COLUMN IF NOT EXISTS import_error TEXT;

-- Update existing records: if data_imported = true, set import_status = 'completed'
UPDATE change_order_ticket_associations
SET import_status = 'completed'
WHERE data_imported = true AND import_status = 'pending';

-- Create index for quickly finding failed imports
CREATE INDEX IF NOT EXISTS idx_cota_import_status
ON change_order_ticket_associations(import_status)
WHERE import_status = 'failed';

-- Add RLS policy for field users to see import status (if not exists)
-- This allows the field app to know if a retry is needed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'change_order_ticket_associations'
    AND policyname = 'Field users can view their ticket associations'
  ) THEN
    CREATE POLICY "Field users can view their ticket associations"
    ON change_order_ticket_associations FOR SELECT
    TO anon
    USING (true);
  END IF;
END $$;

-- Grant select to anon for viewing associations
GRANT SELECT ON change_order_ticket_associations TO anon;

-- Comment the columns for documentation
COMMENT ON COLUMN change_order_ticket_associations.import_status IS 'Import state: pending (not started), completed (success), failed (needs retry)';
COMMENT ON COLUMN change_order_ticket_associations.import_failed_at IS 'Timestamp when import last failed, null if never failed or succeeded after retry';
COMMENT ON COLUMN change_order_ticket_associations.import_error IS 'Error message from last failed import attempt';
