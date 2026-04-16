-- ============================================================
-- FIELD OBSERVATIONS
-- ============================================================
-- Timestamped field-log entries captured by foremen with photos
-- and a written description. Used as professional backup
-- documentation (e.g. for unit-priced projects where work must
-- be evidenced as it happens).
--
-- Follows the same field-session RLS model as disposal_loads
-- (can_access_project()) and stores photos in the tm-photos
-- bucket (resolved via db.resolvePhotoUrls).
-- ============================================================

CREATE TABLE IF NOT EXISTS field_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Core data
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observation_date DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')::DATE,
  description TEXT NOT NULL,
  location TEXT,

  -- Photo storage paths (tm-photos bucket, resolved via signed URLs)
  photos TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Attribution
  foreman_name TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_observations_project ON field_observations(project_id);
CREATE INDEX IF NOT EXISTS idx_field_observations_date ON field_observations(observation_date DESC);
CREATE INDEX IF NOT EXISTS idx_field_observations_project_date ON field_observations(project_id, observation_date DESC);
CREATE INDEX IF NOT EXISTS idx_field_observations_observed_at ON field_observations(observed_at DESC);

CREATE OR REPLACE FUNCTION update_field_observations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_field_observations_updated_at ON field_observations;
CREATE TRIGGER trigger_field_observations_updated_at
  BEFORE UPDATE ON field_observations
  FOR EACH ROW
  EXECUTE FUNCTION update_field_observations_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (mirrors disposal_loads / daily_reports)
-- ============================================================

ALTER TABLE field_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Secure field view observations" ON field_observations;
CREATE POLICY "Secure field view observations"
  ON field_observations FOR SELECT
  USING (can_access_project(project_id));

DROP POLICY IF EXISTS "Secure field create observations" ON field_observations;
CREATE POLICY "Secure field create observations"
  ON field_observations FOR INSERT
  WITH CHECK (can_access_project(project_id));

DROP POLICY IF EXISTS "Secure field update observations" ON field_observations;
CREATE POLICY "Secure field update observations"
  ON field_observations FOR UPDATE
  USING (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));

DROP POLICY IF EXISTS "Secure field delete observations" ON field_observations;
CREATE POLICY "Secure field delete observations"
  ON field_observations FOR DELETE
  USING (
    can_access_project(project_id)
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM projects p
        JOIN user_companies uc ON uc.company_id = p.company_id
        WHERE p.id = field_observations.project_id
          AND uc.user_id = auth.uid()
          AND uc.status = 'active'
          AND uc.access_level = 'administrator'
      )
    )
  );

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE 'Field Observations table created successfully!';
  RAISE NOTICE 'Table: field_observations';
END $$;
