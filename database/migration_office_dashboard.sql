-- FieldSync Office Dashboard Migration
-- This migration adds all necessary tables for the comprehensive office dashboard
-- Run this in your Supabase SQL Editor

-- ============================================
-- Companies Table
-- ============================================
CREATE TABLE IF NOT EXISTS companies (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_code ON companies(code);

-- ============================================
-- Users Table
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'office' CHECK (role IN ('owner', 'admin', 'manager', 'office', 'foreman')),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Add company_id to projects if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'company_id') THEN
    ALTER TABLE projects ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
    CREATE INDEX idx_projects_company ON projects(company_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'status') THEN
    ALTER TABLE projects ADD COLUMN status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'completed'));
    CREATE INDEX idx_projects_status ON projects(status);
  END IF;
END $$;

-- ============================================
-- Materials & Equipment (Master List)
-- ============================================
CREATE TABLE IF NOT EXISTS materials_equipment (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('material', 'equipment', 'tool', 'other')),
  unit TEXT NOT NULL, -- e.g., 'each', 'ft', 'yd', 'hour', 'day'
  cost_per_unit DECIMAL(10, 2),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_materials_company ON materials_equipment(company_id);
CREATE INDEX IF NOT EXISTS idx_materials_category ON materials_equipment(category);
CREATE INDEX IF NOT EXISTS idx_materials_active ON materials_equipment(active);

-- ============================================
-- T&M Tickets
-- ============================================
CREATE TABLE IF NOT EXISTS t_and_m_tickets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  ce_pco_number TEXT,
  notes TEXT,
  photos TEXT[], -- Array of photo URLs
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by_name TEXT,

  -- Approval tracking
  approved_by_user_id UUID REFERENCES users(id),
  approved_by_name TEXT,
  approved_at TIMESTAMP WITH TIME ZONE,

  -- Rejection tracking
  rejected_by_user_id UUID REFERENCES users(id),
  rejected_by_name TEXT,
  rejected_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_tm_tickets_project ON t_and_m_tickets(project_id);
CREATE INDEX IF NOT EXISTS idx_tm_tickets_status ON t_and_m_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tm_tickets_date ON t_and_m_tickets(work_date);

-- T&M Workers (associated with tickets)
CREATE TABLE IF NOT EXISTS t_and_m_workers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES t_and_m_tickets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'Laborer',
  hours DECIMAL(5, 2) NOT NULL DEFAULT 0,
  overtime_hours DECIMAL(5, 2) DEFAULT 0,
  time_started TIME,
  time_ended TIME,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tm_workers_ticket ON t_and_m_workers(ticket_id);

-- T&M Items (materials/equipment used)
CREATE TABLE IF NOT EXISTS t_and_m_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES t_and_m_tickets(id) ON DELETE CASCADE,
  material_equipment_id UUID REFERENCES materials_equipment(id) ON DELETE SET NULL,
  custom_name TEXT, -- If not from master list
  custom_category TEXT,
  quantity DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tm_items_ticket ON t_and_m_items(ticket_id);

-- ============================================
-- Crew Check-ins
-- ============================================
CREATE TABLE IF NOT EXISTS crew_checkins (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  check_in_date DATE NOT NULL,
  workers JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of {name, role, time_in}
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, check_in_date)
);

CREATE INDEX IF NOT EXISTS idx_crew_project ON crew_checkins(project_id);
CREATE INDEX IF NOT EXISTS idx_crew_date ON crew_checkins(check_in_date);

-- ============================================
-- Daily Reports
-- ============================================
CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,

  -- Crew summary
  crew_count INTEGER DEFAULT 0,
  crew_list JSONB DEFAULT '[]'::jsonb,

  -- Work summary
  tasks_completed INTEGER DEFAULT 0,
  tasks_total INTEGER DEFAULT 0,
  completed_tasks JSONB DEFAULT '[]'::jsonb,

  -- T&M and photos
  tm_tickets_count INTEGER DEFAULT 0,
  photos_count INTEGER DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  submitted_at TIMESTAMP WITH TIME ZONE,
  submitted_by TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, report_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_reports_project ON daily_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_daily_reports_status ON daily_reports(status);

-- ============================================
-- Messages (Two-way communication)
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('field', 'office')),
  sender_name TEXT NOT NULL,
  sender_user_id UUID REFERENCES users(id),
  message TEXT NOT NULL,
  photo_url TEXT,
  message_type TEXT DEFAULT 'general' CHECK (message_type IN ('general', 'urgent', 'question', 'update')),
  parent_message_id UUID REFERENCES messages(id),
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_type);
CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(is_read);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

-- ============================================
-- Material Requests
-- ============================================
CREATE TABLE IF NOT EXISTS material_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  items JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of {name, quantity, unit}
  requested_by TEXT NOT NULL,
  needed_by DATE,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  notes TEXT,

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'ordered', 'delivered', 'cancelled')),
  responded_by TEXT,
  responded_at TIMESTAMP WITH TIME ZONE,
  response_notes TEXT,
  expected_delivery DATE,
  delivered_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_material_requests_project ON material_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_material_requests_status ON material_requests(status);
CREATE INDEX IF NOT EXISTS idx_material_requests_priority ON material_requests(priority);

-- ============================================
-- Row Level Security Policies
-- ============================================

-- Enable RLS on all tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_and_m_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_and_m_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_and_m_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_requests ENABLE ROW LEVEL SECURITY;

-- Companies policies
CREATE POLICY "Users can view their company" ON companies
  FOR SELECT USING (
    id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- Users policies
CREATE POLICY "Users can view users in their company" ON users
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- Materials & Equipment policies
CREATE POLICY "Users can view company materials" ON materials_equipment
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Office can manage materials" ON materials_equipment
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'admin', 'manager', 'office')
    )
  );

-- T&M Tickets policies
CREATE POLICY "Users can view tickets in their company" ON t_and_m_tickets
  FOR SELECT USING (
    project_id IN (
      SELECT p.id FROM projects p
      INNER JOIN users u ON u.company_id = p.company_id
      WHERE u.id = auth.uid()
    )
  );

CREATE POLICY "Anyone can create tickets" ON t_and_m_tickets
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Office can update tickets" ON t_and_m_tickets
  FOR UPDATE USING (
    project_id IN (
      SELECT p.id FROM projects p
      INNER JOIN users u ON u.company_id = p.company_id
      WHERE u.id = auth.uid() AND u.role IN ('owner', 'admin', 'manager', 'office')
    )
  );

-- T&M Workers/Items inherit ticket permissions
CREATE POLICY "Users can view workers" ON t_and_m_workers
  FOR SELECT USING (
    ticket_id IN (SELECT id FROM t_and_m_tickets)
  );

CREATE POLICY "Anyone can add workers" ON t_and_m_workers
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can view items" ON t_and_m_items
  FOR SELECT USING (
    ticket_id IN (SELECT id FROM t_and_m_tickets)
  );

CREATE POLICY "Anyone can add items" ON t_and_m_items
  FOR INSERT WITH CHECK (true);

-- Crew Check-ins policies
CREATE POLICY "Users can view crew checkins" ON crew_checkins
  FOR SELECT USING (
    project_id IN (
      SELECT p.id FROM projects p
      INNER JOIN users u ON u.company_id = p.company_id
      WHERE u.id = auth.uid()
    )
  );

CREATE POLICY "Anyone can manage crew checkins" ON crew_checkins
  FOR ALL USING (true);

-- Daily Reports policies
CREATE POLICY "Users can view reports" ON daily_reports
  FOR SELECT USING (
    project_id IN (
      SELECT p.id FROM projects p
      INNER JOIN users u ON u.company_id = p.company_id
      WHERE u.id = auth.uid()
    )
  );

CREATE POLICY "Anyone can manage reports" ON daily_reports
  FOR ALL USING (true);

-- Messages policies
CREATE POLICY "Users can view messages" ON messages
  FOR SELECT USING (
    project_id IN (
      SELECT p.id FROM projects p
      INNER JOIN users u ON u.company_id = p.company_id
      WHERE u.id = auth.uid()
    )
  );

CREATE POLICY "Anyone can send messages" ON messages
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update message read status" ON messages
  FOR UPDATE USING (
    project_id IN (
      SELECT p.id FROM projects p
      INNER JOIN users u ON u.company_id = p.company_id
      WHERE u.id = auth.uid()
    )
  );

-- Material Requests policies
CREATE POLICY "Users can view requests" ON material_requests
  FOR SELECT USING (
    project_id IN (
      SELECT p.id FROM projects p
      INNER JOIN users u ON u.company_id = p.company_id
      WHERE u.id = auth.uid()
    )
  );

CREATE POLICY "Anyone can create requests" ON material_requests
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Office can update requests" ON material_requests
  FOR UPDATE USING (
    project_id IN (
      SELECT p.id FROM projects p
      INNER JOIN users u ON u.company_id = p.company_id
      WHERE u.id = auth.uid() AND u.role IN ('owner', 'admin', 'manager', 'office')
    )
  );

-- ============================================
-- Utility Functions
-- ============================================

-- Function to increment share view count
CREATE OR REPLACE FUNCTION increment_share_view_count(token TEXT)
RETURNS void AS $$
BEGIN
  UPDATE project_shares
  SET view_count = view_count + 1,
      last_viewed_at = NOW()
  WHERE share_token = token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate unique share token
CREATE OR REPLACE FUNCTION generate_share_token()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..12 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Realtime
-- ============================================

-- Enable realtime for relevant tables
DO $$
BEGIN
  -- Try to add tables to realtime, ignore errors if already added
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE t_and_m_tickets;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE crew_checkins;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE daily_reports;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE material_requests;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

-- ============================================
-- Storage Bucket for T&M Photos
-- ============================================

-- Create storage bucket for T&M photos (run this separately in Supabase dashboard or via SQL)
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('tm-photos', 'tm-photos', true)
-- ON CONFLICT DO NOTHING;

-- Storage policies for tm-photos bucket
-- CREATE POLICY "Public read access" ON storage.objects
--   FOR SELECT USING (bucket_id = 'tm-photos');

-- CREATE POLICY "Authenticated users can upload" ON storage.objects
--   FOR INSERT WITH CHECK (bucket_id = 'tm-photos' AND auth.role() = 'authenticated');

-- CREATE POLICY "Users can update their uploads" ON storage.objects
--   FOR UPDATE USING (bucket_id = 'tm-photos' AND auth.role() = 'authenticated');

-- CREATE POLICY "Users can delete their uploads" ON storage.objects
--   FOR DELETE USING (bucket_id = 'tm-photos' AND auth.role() = 'authenticated');
