-- ============================================================
-- DISPOSAL LOAD TRACKING
-- Simplified disposal tracking - quantity only, no pricing
-- ============================================================

-- Load type enum
CREATE TYPE disposal_load_type AS ENUM (
  'concrete',
  'trash',
  'metals',
  'hazardous_waste'
);

-- Main disposal loads table
CREATE TABLE IF NOT EXISTS disposal_loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- Nullable for field-entered data via PIN

  -- Core data
  work_date DATE NOT NULL,
  load_type disposal_load_type NOT NULL,
  load_count INTEGER NOT NULL CHECK (load_count >= 1),

  -- Optional notes (for future hazardous waste requirements)
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_disposal_loads_project ON disposal_loads(project_id);
CREATE INDEX idx_disposal_loads_date ON disposal_loads(work_date DESC);
CREATE INDEX idx_disposal_loads_type ON disposal_loads(load_type);
CREATE INDEX idx_disposal_loads_project_date ON disposal_loads(project_id, work_date DESC);
CREATE INDEX idx_disposal_loads_user ON disposal_loads(user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_disposal_loads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_disposal_loads_updated_at
  BEFORE UPDATE ON disposal_loads
  FOR EACH ROW
  EXECUTE FUNCTION update_disposal_loads_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE disposal_loads ENABLE ROW LEVEL SECURITY;

-- Foremen can manage disposal loads for their assigned projects
CREATE POLICY "Users can view disposal loads for their projects"
  ON disposal_loads FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM project_assignments WHERE user_id = auth.uid()
    )
    OR
    project_id IN (
      SELECT id FROM projects WHERE company_id IN (
        SELECT company_id FROM user_companies
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

CREATE POLICY "Users can insert disposal loads for assigned projects"
  ON disposal_loads FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT project_id FROM project_assignments WHERE user_id = auth.uid()
    )
    OR
    project_id IN (
      SELECT id FROM projects WHERE company_id IN (
        SELECT company_id FROM user_companies
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

CREATE POLICY "Users can update their own disposal loads"
  ON disposal_loads FOR UPDATE
  USING (
    user_id = auth.uid()
    OR
    project_id IN (
      SELECT id FROM projects WHERE company_id IN (
        SELECT company_id FROM user_companies
        WHERE user_id = auth.uid()
        AND status = 'active'
        AND access_level = 'administrator'
      )
    )
  );

CREATE POLICY "Users can delete their own disposal loads"
  ON disposal_loads FOR DELETE
  USING (
    user_id = auth.uid()
    OR
    project_id IN (
      SELECT id FROM projects WHERE company_id IN (
        SELECT company_id FROM user_companies
        WHERE user_id = auth.uid()
        AND status = 'active'
        AND access_level = 'administrator'
      )
    )
  );

-- ============================================================
-- AGGREGATION VIEW (for office/PM consumption)
-- ============================================================

CREATE OR REPLACE VIEW disposal_loads_summary AS
SELECT
  project_id,
  load_type,
  DATE_TRUNC('week', work_date)::DATE as week_start,
  DATE_TRUNC('month', work_date)::DATE as month_start,
  SUM(load_count) as total_loads,
  COUNT(DISTINCT work_date) as days_with_loads,
  MIN(work_date) as first_load_date,
  MAX(work_date) as last_load_date
FROM disposal_loads
GROUP BY project_id, load_type, DATE_TRUNC('week', work_date), DATE_TRUNC('month', work_date);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Get disposal summary for a project within a date range
CREATE OR REPLACE FUNCTION get_disposal_summary(
  p_project_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  load_type disposal_load_type,
  total_loads BIGINT,
  days_with_activity BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dl.load_type,
    SUM(dl.load_count)::BIGINT as total_loads,
    COUNT(DISTINCT dl.work_date)::BIGINT as days_with_activity
  FROM disposal_loads dl
  WHERE dl.project_id = p_project_id
    AND (p_start_date IS NULL OR dl.work_date >= p_start_date)
    AND (p_end_date IS NULL OR dl.work_date <= p_end_date)
  GROUP BY dl.load_type
  ORDER BY total_loads DESC;
END;
$$;

-- Get disposal loads for a specific date (for foreman daily view)
CREATE OR REPLACE FUNCTION get_daily_disposal_loads(
  p_project_id UUID,
  p_date DATE
)
RETURNS TABLE (
  id UUID,
  load_type disposal_load_type,
  load_count INTEGER,
  notes TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dl.id,
    dl.load_type,
    dl.load_count,
    dl.notes,
    dl.user_id,
    dl.created_at
  FROM disposal_loads dl
  WHERE dl.project_id = p_project_id
    AND dl.work_date = p_date
  ORDER BY dl.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_disposal_summary TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_disposal_loads TO authenticated;

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE 'Disposal Load Tracking tables created successfully!';
  RAISE NOTICE 'Table: disposal_loads';
  RAISE NOTICE 'View: disposal_loads_summary';
  RAISE NOTICE 'Functions: get_disposal_summary(), get_daily_disposal_loads()';
END $$;
