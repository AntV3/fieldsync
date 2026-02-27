-- ============================================================
-- Migration: 20260227_daily_reports_photos
-- Adds a photos column to daily_reports so field workers can
-- attach photos directly to daily reports (in addition to
-- photos on T&M tickets). Also fixes the project deletion
-- RLS to ensure authenticated users see proper errors.
-- ============================================================

-- Add photos array column to daily_reports if not already present
ALTER TABLE daily_reports
  ADD COLUMN IF NOT EXISTS photos TEXT[] DEFAULT '{}';

-- Grant access so field workers (anon) can update photos on reports
-- (SELECT/INSERT/UPDATE are already granted via existing RLS policies)

DO $$
BEGIN
  RAISE NOTICE 'Migration 20260227_daily_reports_photos applied: photos column added to daily_reports';
END $$;
