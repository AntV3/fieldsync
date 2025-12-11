-- ========================================
-- FieldSync Complete Database Setup
-- ========================================
-- This script sets up the entire database schema with proper RLS policies
-- for foreman PIN-based access.
--
-- RUN THIS IN YOUR SUPABASE SQL EDITOR
--
-- ========================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- 1. COMPANIES TABLE
-- ========================================

CREATE TABLE IF NOT EXISTS companies (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL, -- Company access code for foreman entry
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_code ON companies(code);

-- Enable RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Anyone can read companies by code (for foreman access)
DROP POLICY IF EXISTS "Anyone can view companies by code" ON companies;
CREATE POLICY "Anyone can view companies by code" ON companies
  FOR SELECT USING (true);

-- Only authenticated users can manage companies
DROP POLICY IF EXISTS "Authenticated users can manage companies" ON companies;
CREATE POLICY "Authenticated users can manage companies" ON companies
  FOR ALL USING (auth.role() = 'authenticated');

-- ========================================
-- 2. PROJECTS TABLE
-- ========================================

CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  contract_value DECIMAL(12, 2) NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  pin TEXT, -- 4-digit PIN for foreman access
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  archived_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_pin ON projects(pin) WHERE pin IS NOT NULL;

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Drop any existing restrictive policies
DROP POLICY IF EXISTS "Office can view all projects" ON projects;
DROP POLICY IF EXISTS "Foremen can view assigned projects" ON projects;
DROP POLICY IF EXISTS "Office can manage projects" ON projects;

-- Allow anyone to view projects (needed for PIN-based foreman access)
DROP POLICY IF EXISTS "Anyone can view projects by PIN" ON projects;
CREATE POLICY "Anyone can view projects by PIN" ON projects
  FOR SELECT USING (true);

-- Only authenticated users can manage projects
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
  group_name TEXT, -- For grouping areas
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'working', 'done')),
  sort_order INTEGER DEFAULT 0,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_areas_project_id ON areas(project_id);
CREATE INDEX IF NOT EXISTS idx_areas_status ON areas(status);

-- Enable RLS
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;

-- Drop any existing restrictive policies
DROP POLICY IF EXISTS "Users can view areas" ON areas;
DROP POLICY IF EXISTS "Users can update area status" ON areas;
DROP POLICY IF EXISTS "Office can manage areas" ON areas;
DROP POLICY IF EXISTS "Office can delete areas" ON areas;

-- Allow anyone to view areas (for PIN-based foreman access)
DROP POLICY IF EXISTS "Anyone can view areas" ON areas;
CREATE POLICY "Anyone can view areas" ON areas
  FOR SELECT USING (true);

-- Allow anyone to update area status (for foreman PIN access)
DROP POLICY IF EXISTS "Anyone can update areas" ON areas;
CREATE POLICY "Anyone can update areas" ON areas
  FOR UPDATE USING (true);

-- Only authenticated can create/delete areas
DROP POLICY IF EXISTS "Authenticated can create areas" ON areas;
CREATE POLICY "Authenticated can create areas" ON areas
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can delete areas" ON areas;
CREATE POLICY "Authenticated can delete areas" ON areas
  FOR DELETE USING (auth.role() = 'authenticated');

-- ========================================
-- 4. USERS TABLE (for authenticated users)
-- ========================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'foreman' CHECK (role IN ('foreman', 'office', 'admin', 'owner', 'manager', 'member')),
  company_id UUID REFERENCES companies(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON users;
CREATE POLICY "Users can view their own profile" ON users
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON users;
CREATE POLICY "Users can update their own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

-- ========================================
-- 5. PROJECT ASSIGNMENTS
-- ========================================

CREATE TABLE IF NOT EXISTS project_assignments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id),
  UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_user ON project_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_project ON project_assignments(project_id);

ALTER TABLE project_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their assignments" ON project_assignments;
CREATE POLICY "Users can view their assignments" ON project_assignments
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Office/Admin can manage assignments" ON project_assignments;
CREATE POLICY "Office/Admin can manage assignments" ON project_assignments
  FOR ALL USING (auth.role() = 'authenticated');

-- ========================================
-- 6. MATERIALS & EQUIPMENT
-- ========================================

CREATE TABLE IF NOT EXISTS materials_equipment (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('material', 'equipment')),
  unit TEXT NOT NULL,
  cost_per_unit DECIMAL(10, 2),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_materials_company ON materials_equipment(company_id);
CREATE INDEX IF NOT EXISTS idx_materials_category ON materials_equipment(category);

ALTER TABLE materials_equipment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view materials" ON materials_equipment;
CREATE POLICY "Anyone can view materials" ON materials_equipment
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated can manage materials" ON materials_equipment;
CREATE POLICY "Authenticated can manage materials" ON materials_equipment
  FOR ALL USING (auth.role() = 'authenticated');

-- ========================================
-- 7. T&M TICKETS
-- ========================================

CREATE TABLE IF NOT EXISTS t_and_m_tickets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  ce_pco_number TEXT,
  notes TEXT,
  photos TEXT[], -- Array of photo URLs
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by_name TEXT,
  approved_by_user_id UUID REFERENCES auth.users(id),
  approved_by_name TEXT,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_by_user_id UUID REFERENCES auth.users(id),
  rejected_by_name TEXT,
  rejected_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tm_tickets_project ON t_and_m_tickets(project_id);
CREATE INDEX IF NOT EXISTS idx_tm_tickets_date ON t_and_m_tickets(work_date);
CREATE INDEX IF NOT EXISTS idx_tm_tickets_status ON t_and_m_tickets(status);

ALTER TABLE t_and_m_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view tickets" ON t_and_m_tickets;
CREATE POLICY "Anyone can view tickets" ON t_and_m_tickets
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can create tickets" ON t_and_m_tickets;
CREATE POLICY "Anyone can create tickets" ON t_and_m_tickets
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can manage tickets" ON t_and_m_tickets;
CREATE POLICY "Authenticated can manage tickets" ON t_and_m_tickets
  FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can delete tickets" ON t_and_m_tickets;
CREATE POLICY "Authenticated can delete tickets" ON t_and_m_tickets
  FOR DELETE USING (auth.role() = 'authenticated');

-- ========================================
-- 8. T&M WORKERS
-- ========================================

CREATE TABLE IF NOT EXISTS t_and_m_workers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES t_and_m_tickets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hours DECIMAL(5, 2) NOT NULL,
  overtime_hours DECIMAL(5, 2) DEFAULT 0,
  time_started TIME,
  time_ended TIME,
  role TEXT DEFAULT 'Laborer',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tm_workers_ticket ON t_and_m_workers(ticket_id);

ALTER TABLE t_and_m_workers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view workers" ON t_and_m_workers;
CREATE POLICY "Anyone can view workers" ON t_and_m_workers
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can create workers" ON t_and_m_workers;
CREATE POLICY "Anyone can create workers" ON t_and_m_workers
  FOR INSERT WITH CHECK (true);

-- ========================================
-- 9. T&M ITEMS
-- ========================================

CREATE TABLE IF NOT EXISTS t_and_m_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES t_and_m_tickets(id) ON DELETE CASCADE,
  material_equipment_id UUID REFERENCES materials_equipment(id),
  custom_name TEXT,
  custom_category TEXT,
  quantity DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tm_items_ticket ON t_and_m_items(ticket_id);

ALTER TABLE t_and_m_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view items" ON t_and_m_items;
CREATE POLICY "Anyone can view items" ON t_and_m_items
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can create items" ON t_and_m_items;
CREATE POLICY "Anyone can create items" ON t_and_m_items
  FOR INSERT WITH CHECK (true);

-- ========================================
-- 10. CREW CHECK-INS
-- ========================================

CREATE TABLE IF NOT EXISTS crew_checkins (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  check_in_date DATE NOT NULL,
  workers JSONB NOT NULL DEFAULT '[]', -- Array of {name, role}
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, check_in_date)
);

CREATE INDEX IF NOT EXISTS idx_crew_project ON crew_checkins(project_id);
CREATE INDEX IF NOT EXISTS idx_crew_date ON crew_checkins(check_in_date);

ALTER TABLE crew_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view crew checkins" ON crew_checkins;
CREATE POLICY "Anyone can view crew checkins" ON crew_checkins
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can manage crew checkins" ON crew_checkins;
CREATE POLICY "Anyone can manage crew checkins" ON crew_checkins
  FOR ALL USING (true);

-- ========================================
-- 11. DAILY REPORTS
-- ========================================

CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  crew_count INTEGER DEFAULT 0,
  crew_list JSONB DEFAULT '[]',
  tasks_completed INTEGER DEFAULT 0,
  tasks_total INTEGER DEFAULT 0,
  completed_tasks JSONB DEFAULT '[]',
  tm_tickets_count INTEGER DEFAULT 0,
  photos_count INTEGER DEFAULT 0,
  weather TEXT,
  notes TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  submitted_by TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, report_date)
);

CREATE INDEX IF NOT EXISTS idx_reports_project ON daily_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_reports_date ON daily_reports(report_date);

ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view reports" ON daily_reports;
CREATE POLICY "Anyone can view reports" ON daily_reports
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can manage reports" ON daily_reports;
CREATE POLICY "Anyone can manage reports" ON daily_reports
  FOR ALL USING (true);

-- ========================================
-- 12. MESSAGES
-- ========================================

CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('field', 'office')),
  sender_name TEXT NOT NULL,
  sender_user_id UUID REFERENCES auth.users(id),
  message TEXT NOT NULL,
  photo_url TEXT,
  message_type TEXT DEFAULT 'general' CHECK (message_type IN ('general', 'urgent', 'question')),
  parent_message_id UUID REFERENCES messages(id),
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(sender_type);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view messages" ON messages;
CREATE POLICY "Anyone can view messages" ON messages
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can create messages" ON messages;
CREATE POLICY "Anyone can create messages" ON messages
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update messages" ON messages;
CREATE POLICY "Anyone can update messages" ON messages
  FOR UPDATE USING (true);

-- ========================================
-- 13. MATERIAL REQUESTS
-- ========================================

CREATE TABLE IF NOT EXISTS material_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  items JSONB NOT NULL, -- Array of {name, quantity, unit}
  requested_by TEXT NOT NULL,
  needed_by DATE,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'ordered', 'delivered', 'cancelled')),
  responded_by TEXT,
  responded_at TIMESTAMP WITH TIME ZONE,
  response_notes TEXT,
  expected_delivery DATE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requests_project ON material_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON material_requests(status);

ALTER TABLE material_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view requests" ON material_requests;
CREATE POLICY "Anyone can view requests" ON material_requests
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can create requests" ON material_requests;
CREATE POLICY "Anyone can create requests" ON material_requests
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can manage requests" ON material_requests;
CREATE POLICY "Authenticated can manage requests" ON material_requests
  FOR UPDATE USING (auth.role() = 'authenticated');

-- ========================================
-- 14. ACTIVITY LOG
-- ========================================

CREATE TABLE IF NOT EXISTS activity_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  area_id UUID REFERENCES areas(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_project ON activity_log(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_date ON activity_log(created_at);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Office can view activity" ON activity_log;
CREATE POLICY "Office can view activity" ON activity_log
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can log activity" ON activity_log;
CREATE POLICY "Users can log activity" ON activity_log
  FOR INSERT WITH CHECK (true);

-- ========================================
-- 15. TRIGGERS
-- ========================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS update_companies_updated_at ON companies;
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_areas_updated_at ON areas;
CREATE TRIGGER update_areas_updated_at
  BEFORE UPDATE ON areas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 16. REALTIME
-- ========================================

-- Enable realtime for relevant tables
-- Use DO blocks to handle cases where tables are already in publication

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE areas;
EXCEPTION
  WHEN duplicate_object THEN
    NULL; -- Table already in publication, ignore
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE crew_checkins;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE daily_reports;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

-- ========================================
-- 17. SAMPLE DATA
-- ========================================

-- Insert sample company
INSERT INTO companies (id, name, code)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Demo Construction Co', 'DEMO')
ON CONFLICT (code) DO NOTHING;

-- ========================================
-- SETUP COMPLETE!
-- ========================================
--
-- Next steps:
-- 1. Create users "miller" and "ggg" in Supabase Auth (Authentication > Users)
-- 2. Create projects with PINs for foreman access
-- 3. Test foreman access with company code "DEMO" and project PIN
--
-- ========================================
