-- Migration: Equipment Tracking
-- Track equipment on projects with daily rates for cost tracking

-- ============================================
-- EQUIPMENT CATALOG TABLE (Company-level)
-- ============================================
CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Equipment identification
  name TEXT NOT NULL,
  description TEXT,

  -- Rates (stored in cents)
  daily_rate INTEGER DEFAULT 0,
  weekly_rate INTEGER,
  monthly_rate INTEGER,

  -- Ownership
  is_owned BOOLEAN DEFAULT false, -- true = company owns it, false = rented

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Tracking
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PROJECT EQUIPMENT TABLE (Equipment on projects)
-- ============================================
CREATE TABLE IF NOT EXISTS project_equipment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Reference to catalog equipment (optional - for custom entries)
  equipment_id UUID REFERENCES equipment(id) ON DELETE SET NULL,

  -- Equipment details (denormalized for custom entries or overrides)
  equipment_name TEXT NOT NULL,
  description TEXT,

  -- Dates on site
  start_date DATE NOT NULL,
  end_date DATE, -- NULL means still on site

  -- Rate for this usage (in cents)
  daily_rate INTEGER NOT NULL,

  -- Additional info
  notes TEXT,

  -- Tracking
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_equipment_company ON equipment(company_id);
CREATE INDEX IF NOT EXISTS idx_equipment_active ON equipment(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_project_equipment_project ON project_equipment(project_id);
CREATE INDEX IF NOT EXISTS idx_project_equipment_dates ON project_equipment(project_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_project_equipment_equipment ON project_equipment(equipment_id);

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_equipment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_equipment_updated_at ON equipment;
CREATE TRIGGER trigger_equipment_updated_at
  BEFORE UPDATE ON equipment
  FOR EACH ROW
  EXECUTE FUNCTION update_equipment_updated_at();

DROP TRIGGER IF EXISTS trigger_project_equipment_updated_at ON project_equipment;
CREATE TRIGGER trigger_project_equipment_updated_at
  BEFORE UPDATE ON project_equipment
  FOR EACH ROW
  EXECUTE FUNCTION update_equipment_updated_at();

-- ============================================
-- CALCULATE EQUIPMENT DAYS FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION calculate_equipment_days(p_start_date DATE, p_end_date DATE)
RETURNS INTEGER AS $$
BEGIN
  -- If no end date, calculate to today
  IF p_end_date IS NULL THEN
    RETURN CURRENT_DATE - p_start_date + 1;
  ELSE
    RETURN p_end_date - p_start_date + 1;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- GET PROJECT EQUIPMENT COST FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION get_project_equipment_cost(p_project_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_total INTEGER;
BEGIN
  SELECT COALESCE(SUM(
    daily_rate * calculate_equipment_days(start_date, end_date)
  ), 0) INTO v_total
  FROM project_equipment
  WHERE project_id = p_project_id;

  RETURN v_total;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_equipment ENABLE ROW LEVEL SECURITY;

-- Equipment catalog policies (company-level)
DROP POLICY IF EXISTS "Users can view equipment for their company" ON equipment;
CREATE POLICY "Users can view equipment for their company" ON equipment
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = equipment.company_id
      AND uc.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can create equipment for their company" ON equipment;
CREATE POLICY "Users can create equipment for their company" ON equipment
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = equipment.company_id
      AND uc.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can update equipment for their company" ON equipment;
CREATE POLICY "Users can update equipment for their company" ON equipment
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = equipment.company_id
      AND uc.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can delete equipment for their company" ON equipment;
CREATE POLICY "Users can delete equipment for their company" ON equipment
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = equipment.company_id
      AND uc.status = 'active'
    )
  );

-- Project equipment policies
DROP POLICY IF EXISTS "Users can view project equipment" ON project_equipment;
CREATE POLICY "Users can view project equipment" ON project_equipment
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN user_companies uc ON uc.company_id = p.company_id
      WHERE p.id = project_equipment.project_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can manage project equipment" ON project_equipment;
CREATE POLICY "Users can manage project equipment" ON project_equipment
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN user_companies uc ON uc.company_id = p.company_id
      WHERE p.id = project_equipment.project_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
    )
  );

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
GRANT ALL ON equipment TO authenticated;
GRANT ALL ON project_equipment TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_equipment_days TO authenticated;
GRANT EXECUTE ON FUNCTION get_project_equipment_cost TO authenticated;
