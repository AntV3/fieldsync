-- Migration: Project Schedule Fields
-- Adds start_date, end_date, and planned_man_days to projects table
-- For portfolio overview with schedule-based insights

-- Add schedule columns to projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS end_date DATE,
ADD COLUMN IF NOT EXISTS planned_man_days INTEGER;

-- Add constraint to ensure end_date >= start_date
-- Note: Using a DO block to check if constraint exists first
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_project_dates'
    ) THEN
        ALTER TABLE projects
        ADD CONSTRAINT check_project_dates
        CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date);
    END IF;
END $$;

-- Index for querying projects by status and archive date
CREATE INDEX IF NOT EXISTS idx_projects_status_archived
ON projects(status, archived_at);

-- Index for schedule-based queries
CREATE INDEX IF NOT EXISTS idx_projects_dates
ON projects(start_date, end_date)
WHERE start_date IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN projects.start_date IS 'Project start date for schedule tracking';
COMMENT ON COLUMN projects.end_date IS 'Planned project end date for schedule tracking';
COMMENT ON COLUMN projects.planned_man_days IS 'Total planned man-days for labor comparison';
