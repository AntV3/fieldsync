-- Migration: Add scheduled_value column to areas table
-- This allows capturing actual dollar amounts from SOV (Schedule of Values)
-- When foreman marks area complete, the actual dollar value is tracked

-- Add scheduled_value column to areas table
ALTER TABLE areas ADD COLUMN IF NOT EXISTS scheduled_value DECIMAL(12, 2);

-- Create index for aggregation queries (only on non-null values)
CREATE INDEX IF NOT EXISTS idx_areas_scheduled_value ON areas(scheduled_value) WHERE scheduled_value IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN areas.scheduled_value IS 'Dollar amount from SOV/AIA form for this area/task. NULL if manually created without SOV.';
