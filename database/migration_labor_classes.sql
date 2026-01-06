-- Migration: Labor Categories, Classes, and Rates
-- Purpose: Allow companies to define custom labor class types with rates
-- Backward Compatible: Existing labor_rates table is preserved

-- =====================================================
-- Table 1: labor_categories (Custom groupings)
-- =====================================================
CREATE TABLE IF NOT EXISTS labor_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  name TEXT NOT NULL,              -- "Supervision", "Operators", "Labor", etc.
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_labor_categories_company ON labor_categories(company_id);
CREATE INDEX IF NOT EXISTS idx_labor_categories_active ON labor_categories(company_id, active);

-- =====================================================
-- Table 2: labor_classes (Class types within categories)
-- =====================================================
CREATE TABLE IF NOT EXISTS labor_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id UUID REFERENCES labor_categories(id) ON DELETE SET NULL,

  name TEXT NOT NULL,              -- "Foreman", "Operator", "Laborer"

  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_labor_classes_company ON labor_classes(company_id);
CREATE INDEX IF NOT EXISTS idx_labor_classes_category ON labor_classes(category_id);
CREATE INDEX IF NOT EXISTS idx_labor_classes_active ON labor_classes(company_id, active);

-- =====================================================
-- Table 3: labor_class_rates (Rates per work_type/job_type)
-- =====================================================
CREATE TABLE IF NOT EXISTS labor_class_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  labor_class_id UUID NOT NULL REFERENCES labor_classes(id) ON DELETE CASCADE,

  work_type TEXT NOT NULL,         -- "demolition", "abatement"
  job_type TEXT NOT NULL,          -- "standard", "pla"

  regular_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  overtime_rate DECIMAL(10,2) NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(labor_class_id, work_type, job_type)
);

CREATE INDEX IF NOT EXISTS idx_labor_class_rates_class ON labor_class_rates(labor_class_id);

-- =====================================================
-- Add labor_class_id to t_and_m_workers (nullable for backward compat)
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 't_and_m_workers' AND column_name = 'labor_class_id'
  ) THEN
    ALTER TABLE t_and_m_workers ADD COLUMN labor_class_id UUID REFERENCES labor_classes(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_tm_workers_labor_class ON t_and_m_workers(labor_class_id);
  END IF;
END $$;

-- =====================================================
-- RLS Policies for labor_categories
-- =====================================================
ALTER TABLE labor_categories ENABLE ROW LEVEL SECURITY;

-- Field users (anon via PIN) can view
DROP POLICY IF EXISTS "Field users can view labor categories" ON labor_categories;
CREATE POLICY "Field users can view labor categories"
ON labor_categories FOR SELECT
USING (true);

-- Authenticated users can manage their company's categories
DROP POLICY IF EXISTS "Authenticated users manage labor categories" ON labor_categories;
CREATE POLICY "Authenticated users manage labor categories"
ON labor_categories FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = labor_categories.company_id
    AND uc.status = 'active'
    AND uc.access_level = 'administrator'
  )
);

-- =====================================================
-- RLS Policies for labor_classes
-- =====================================================
ALTER TABLE labor_classes ENABLE ROW LEVEL SECURITY;

-- Field users (anon via PIN) can view
DROP POLICY IF EXISTS "Field users can view labor classes" ON labor_classes;
CREATE POLICY "Field users can view labor classes"
ON labor_classes FOR SELECT
USING (true);

-- Authenticated users can manage their company's classes
DROP POLICY IF EXISTS "Authenticated users manage labor classes" ON labor_classes;
CREATE POLICY "Authenticated users manage labor classes"
ON labor_classes FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = labor_classes.company_id
    AND uc.status = 'active'
    AND uc.access_level = 'administrator'
  )
);

-- =====================================================
-- RLS Policies for labor_class_rates
-- =====================================================
ALTER TABLE labor_class_rates ENABLE ROW LEVEL SECURITY;

-- Field users (anon via PIN) can view
DROP POLICY IF EXISTS "Field users can view labor class rates" ON labor_class_rates;
CREATE POLICY "Field users can view labor class rates"
ON labor_class_rates FOR SELECT
USING (true);

-- Authenticated users can manage rates for their company's classes
DROP POLICY IF EXISTS "Authenticated users manage labor class rates" ON labor_class_rates;
CREATE POLICY "Authenticated users manage labor class rates"
ON labor_class_rates FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM labor_classes lc
    JOIN user_companies uc ON uc.company_id = lc.company_id
    WHERE lc.id = labor_class_rates.labor_class_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
    AND uc.access_level = 'administrator'
  )
);

-- =====================================================
-- Grants for anon and authenticated roles
-- =====================================================
GRANT SELECT ON labor_categories TO anon;
GRANT SELECT ON labor_classes TO anon;
GRANT SELECT ON labor_class_rates TO anon;

GRANT ALL ON labor_categories TO authenticated;
GRANT ALL ON labor_classes TO authenticated;
GRANT ALL ON labor_class_rates TO authenticated;

-- =====================================================
-- Updated_at trigger function (if not exists)
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_labor_classes_updated_at ON labor_classes;
CREATE TRIGGER update_labor_classes_updated_at
  BEFORE UPDATE ON labor_classes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_labor_class_rates_updated_at ON labor_class_rates;
CREATE TRIGGER update_labor_class_rates_updated_at
  BEFORE UPDATE ON labor_class_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
