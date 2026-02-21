-- ============================================================
-- DAILY REPORT ENHANCEMENTS
-- Adds structured fields for:
--   - work_description: brief description of work completed
--   - disposal_loads_summary: loads hauled by type (JSONB)
--   - photo_urls: photo documentation URLs collected at submit time (JSONB)
-- ============================================================

ALTER TABLE daily_reports
  ADD COLUMN IF NOT EXISTS work_description TEXT,
  ADD COLUMN IF NOT EXISTS disposal_loads_summary JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS photo_urls JSONB DEFAULT '[]'::jsonb;

-- Index for faster queries on non-empty photo reports
CREATE INDEX IF NOT EXISTS idx_daily_reports_has_photos
  ON daily_reports ((photo_urls IS NOT NULL AND jsonb_array_length(photo_urls) > 0));

DO $$
BEGIN
  RAISE NOTICE 'Daily report enhancements applied:';
  RAISE NOTICE '  + work_description TEXT';
  RAISE NOTICE '  + disposal_loads_summary JSONB';
  RAISE NOTICE '  + photo_urls JSONB';
END $$;
