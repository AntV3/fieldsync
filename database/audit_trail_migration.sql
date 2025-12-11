-- Audit Trail Migration for FieldSync
-- Adds created_by, updated_by fields and improves audit tracking
-- Run this in your Supabase SQL Editor

-- ================================================
-- ADD AUDIT FIELDS TO EXISTING TABLES
-- ================================================

-- Projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS created_by_name TEXT,
ADD COLUMN IF NOT EXISTS updated_by_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS updated_by_name TEXT,
ADD COLUMN IF NOT EXISTS company_id UUID,
ADD COLUMN IF NOT EXISTS pin TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived'));

-- Areas table
ALTER TABLE areas
ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS created_by_name TEXT,
ADD COLUMN IF NOT EXISTS updated_by_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS updated_by_name TEXT,
ADD COLUMN IF NOT EXISTS group_name TEXT;

-- ================================================
-- CREATE NEW TABLES WITH AUDIT FIELDS
-- ================================================

-- T&M Tickets table
CREATE TABLE IF NOT EXISTS t_and_m_tickets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  ce_pco_number TEXT,
  notes TEXT,
  photos JSONB DEFAULT '[]'::jsonb,

  -- Approval fields
  approved_by_id UUID REFERENCES auth.users(id),
  approved_by_name TEXT,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_reason TEXT,

  -- Audit fields
  created_by_id UUID REFERENCES auth.users(id),
  created_by_name TEXT NOT NULL, -- Foreman certification
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by_id UUID REFERENCES auth.users(id),
  updated_by_name TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tm_tickets_project_id ON t_and_m_tickets(project_id);
CREATE INDEX IF NOT EXISTS idx_tm_tickets_status ON t_and_m_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tm_tickets_work_date ON t_and_m_tickets(work_date);

-- T&M Workers table
CREATE TABLE IF NOT EXISTS t_and_m_workers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES t_and_m_tickets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hours DECIMAL(5, 2) NOT NULL,
  overtime_hours DECIMAL(5, 2) DEFAULT 0,
  role TEXT CHECK (role IN ('Foreman', 'Laborer')),
  time_started TEXT,
  time_ended TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tm_workers_ticket_id ON t_and_m_workers(ticket_id);

-- T&M Items table
CREATE TABLE IF NOT EXISTS t_and_m_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES t_and_m_tickets(id) ON DELETE CASCADE,
  material_equipment_id UUID,
  custom_name TEXT,
  custom_category TEXT,
  quantity DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tm_items_ticket_id ON t_and_m_items(ticket_id);

-- Materials/Equipment master list
CREATE TABLE IF NOT EXISTS materials_equipment (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  cost_per_unit DECIMAL(10, 2),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_materials_company_id ON materials_equipment(company_id);
CREATE INDEX IF NOT EXISTS idx_materials_category ON materials_equipment(category);

-- Crew Check-ins table
CREATE TABLE IF NOT EXISTS crew_checkins (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  check_in_date DATE NOT NULL,
  workers JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by_id UUID REFERENCES auth.users(id),
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crew_checkins_project_id ON crew_checkins(project_id);
CREATE INDEX IF NOT EXISTS idx_crew_checkins_date ON crew_checkins(check_in_date);

-- Daily Reports table
CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  crew_count INTEGER,
  crew_list JSONB,
  tasks_completed INTEGER,
  tasks_total INTEGER,
  tm_tickets_count INTEGER,
  photos_count INTEGER,
  field_notes TEXT,
  issues TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),

  -- Audit fields
  submitted_by_id UUID REFERENCES auth.users(id),
  submitted_by_name TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_reports_project_id ON daily_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);

-- Material Requests table
CREATE TABLE IF NOT EXISTS material_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  items JSONB NOT NULL,
  needed_by DATE,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'delivered')),
  notes TEXT,

  -- Request info
  requested_by_id UUID REFERENCES auth.users(id),
  requested_by_name TEXT NOT NULL,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Response info
  responded_by_id UUID REFERENCES auth.users(id),
  responded_by_name TEXT,
  responded_at TIMESTAMP WITH TIME ZONE,
  expected_delivery DATE,
  response_notes TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_material_requests_project_id ON material_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_material_requests_status ON material_requests(status);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('field', 'office')),
  sender_name TEXT NOT NULL,
  sender_user_id UUID REFERENCES auth.users(id),
  message TEXT NOT NULL,
  photo_url TEXT,
  message_type TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_messages_project_id ON messages(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Companies table
CREATE TABLE IF NOT EXISTS companies (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id),
  role TEXT CHECK (role IN ('admin', 'office', 'foreman', 'field')),
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Project Assignments table
CREATE TABLE IF NOT EXISTS project_assignments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_project_assignments_user_id ON project_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_project_assignments_project_id ON project_assignments(project_id);

-- ================================================
-- UPDATE TRIGGERS FOR AUDIT FIELDS
-- ================================================

-- Function to automatically update updated_at and capture who updated
CREATE OR REPLACE FUNCTION update_audit_fields()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  -- Note: updated_by_id and updated_by_name should be set by application
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers to all tables with audit fields
DROP TRIGGER IF EXISTS update_projects_audit ON projects;
CREATE TRIGGER update_projects_audit
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();

DROP TRIGGER IF EXISTS update_areas_audit ON areas;
CREATE TRIGGER update_areas_audit
  BEFORE UPDATE ON areas
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();

DROP TRIGGER IF EXISTS update_tm_tickets_audit ON t_and_m_tickets;
CREATE TRIGGER update_tm_tickets_audit
  BEFORE UPDATE ON t_and_m_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();

DROP TRIGGER IF EXISTS update_materials_equipment_audit ON materials_equipment;
CREATE TRIGGER update_materials_equipment_audit
  BEFORE UPDATE ON materials_equipment
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();

DROP TRIGGER IF EXISTS update_crew_checkins_audit ON crew_checkins;
CREATE TRIGGER update_crew_checkins_audit
  BEFORE UPDATE ON crew_checkins
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();

DROP TRIGGER IF EXISTS update_daily_reports_audit ON daily_reports;
CREATE TRIGGER update_daily_reports_audit
  BEFORE UPDATE ON daily_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();

DROP TRIGGER IF EXISTS update_material_requests_audit ON material_requests;
CREATE TRIGGER update_material_requests_audit
  BEFORE UPDATE ON material_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();

-- ================================================
-- ROW LEVEL SECURITY POLICIES
-- ================================================

-- Enable RLS on all tables
ALTER TABLE t_and_m_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_and_m_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_and_m_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_assignments ENABLE ROW LEVEL SECURITY;

-- For demo purposes, allow all operations (in production, add proper policies)
CREATE POLICY IF NOT EXISTS "Allow all on t_and_m_tickets" ON t_and_m_tickets FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all on t_and_m_workers" ON t_and_m_workers FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all on t_and_m_items" ON t_and_m_items FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all on crew_checkins" ON crew_checkins FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all on daily_reports" ON daily_reports FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all on material_requests" ON material_requests FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all on materials_equipment" ON materials_equipment FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all on messages" ON messages FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all on companies" ON companies FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all on users" ON users FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all on project_assignments" ON project_assignments FOR ALL USING (true);

-- ================================================
-- REALTIME SUBSCRIPTIONS
-- ================================================

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS areas;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS messages;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS t_and_m_tickets;

-- ================================================
-- HELPER VIEWS FOR AUDIT TRAILS
-- ================================================

-- View to see recent activity across all tables
CREATE OR REPLACE VIEW recent_activity AS
SELECT 'project' as record_type, id, created_by_name, created_at, updated_by_name, updated_at
FROM projects
WHERE created_at > NOW() - INTERVAL '30 days'
UNION ALL
SELECT 'area' as record_type, id, created_by_name, created_at, updated_by_name, updated_at
FROM areas
WHERE created_at > NOW() - INTERVAL '30 days'
UNION ALL
SELECT 't_and_m_ticket' as record_type, id, created_by_name, created_at, updated_by_name, updated_at
FROM t_and_m_tickets
WHERE created_at > NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;

COMMENT ON VIEW recent_activity IS 'Shows recent creation and modification activity across all entities';
