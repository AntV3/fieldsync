-- ============================================================
-- DISPOSAL TRUCK COUNTS
-- Track number of trucks used per day for hauling off disposal
-- ============================================================

CREATE TABLE IF NOT EXISTS disposal_truck_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  truck_count INTEGER NOT NULL CHECK (truck_count >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One entry per project per day
  UNIQUE(project_id, work_date)
);

-- Indexes
CREATE INDEX idx_disposal_truck_counts_project ON disposal_truck_counts(project_id);
CREATE INDEX idx_disposal_truck_counts_project_date ON disposal_truck_counts(project_id, work_date DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_disposal_truck_counts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_disposal_truck_counts_updated_at
  BEFORE UPDATE ON disposal_truck_counts
  FOR EACH ROW
  EXECUTE FUNCTION update_disposal_truck_counts_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE disposal_truck_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view truck counts for their projects"
  ON disposal_truck_counts FOR SELECT
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

CREATE POLICY "Users can insert truck counts for assigned projects"
  ON disposal_truck_counts FOR INSERT
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

CREATE POLICY "Users can update truck counts for their projects"
  ON disposal_truck_counts FOR UPDATE
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

CREATE POLICY "Users can delete truck counts for their projects"
  ON disposal_truck_counts FOR DELETE
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
