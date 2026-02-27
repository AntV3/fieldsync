-- Migration: Add photos column to daily_reports table
-- Date: 2026-02-27
--
-- PROBLEM: daily_reports table is missing a 'photos' TEXT[] column.
-- PhotoTimeline.jsx queries daily_reports for photos, causing PGRST204 errors.
-- submitDailyReport also writes compiled report data that references this column.
--
-- SOLUTION: Add the photos column and ensure all summary columns used by
-- compileDailyReport/submitDailyReport exist.
--
-- Run this in your Supabase SQL Editor.

-- Add photos array column (TEXT[] for storing photo URLs attached to daily reports)
ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS photos TEXT[];

-- Ensure summary columns written by compileDailyReport/submitDailyReport exist
ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS photos_count INTEGER DEFAULT 0;

ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS crew_count INTEGER DEFAULT 0;

ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS crew_list JSONB DEFAULT '[]';

ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS tasks_completed INTEGER DEFAULT 0;

ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS tasks_total INTEGER DEFAULT 0;

ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS completed_tasks JSONB DEFAULT '[]';

ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS tm_tickets_count INTEGER DEFAULT 0;

-- Ensure field_notes and issues columns exist (written by saveDailyReport)
ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS field_notes TEXT;

ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS issues TEXT;

-- Verification query (uncomment to check columns after running):
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'daily_reports'
-- ORDER BY ordinal_position;
