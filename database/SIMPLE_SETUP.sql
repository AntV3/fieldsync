-- ========================================
-- SIMPLE SETUP - For Quick Testing
-- ========================================
-- This is a simplified version that skips realtime setup
-- Use this if you're getting errors with complete_setup.sql
-- ========================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- 1. COMPANIES TABLE
-- ========================================

CREATE TABLE IF NOT EXISTS companies (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_code ON companies(code);
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view companies by code" ON companies;
CREATE POLICY "Anyone can view companies by code" ON companies
  FOR SELECT USING (true);

-- ========================================
-- 2. PROJECTS TABLE
-- ========================================

CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  contract_value DECIMAL(12, 2) NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  pin TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  archived_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_pin ON projects(pin) WHERE pin IS NOT NULL;

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view projects by PIN" ON projects;
CREATE POLICY "Anyone can view projects by PIN" ON projects
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage projects" ON projects;
CREATE POLICY "Authenticated users can manage projects" ON projects
  FOR ALL USING (auth.role() = 'authenticated');

-- ========================================
-- 3. AREAS TABLE
-- ========================================

CREATE TABLE IF NOT EXISTS areas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  weight DECIMAL(5, 2) NOT NULL,
  group_name TEXT,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'working', 'done')),
  sort_order INTEGER DEFAULT 0,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_areas_project_id ON areas(project_id);
CREATE INDEX IF NOT EXISTS idx_areas_status ON areas(status);

ALTER TABLE areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view areas" ON areas;
CREATE POLICY "Anyone can view areas" ON areas
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can update areas" ON areas;
CREATE POLICY "Anyone can update areas" ON areas
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Authenticated can create areas" ON areas;
CREATE POLICY "Authenticated can create areas" ON areas
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can delete areas" ON areas;
CREATE POLICY "Authenticated can delete areas" ON areas
  FOR DELETE USING (auth.role() = 'authenticated');

-- ========================================
-- SUCCESS!
-- ========================================
--
-- Core tables created! Now run:
-- database/setup_ggg_miller_companies.sql
--
-- This creates your GGG and Miller companies with projects.
--
-- ========================================
