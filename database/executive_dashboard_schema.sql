-- Executive Dashboard Database Schema
-- Additional tables needed for the executive dashboard
-- Run this in your Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

-- ============================================
-- Users Table
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'foreman' CHECK (role IN ('foreman', 'owner', 'admin', 'manager', 'office')),
  company_id UUID REFERENCES companies(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================
-- Update Projects Table
-- ============================================
-- Add missing columns to projects table
DO $$
BEGIN
  -- Add company_id if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'company_id') THEN
    ALTER TABLE projects ADD COLUMN company_id UUID REFERENCES companies(id);
  END IF;

  -- Add pin if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'pin') THEN
    ALTER TABLE projects ADD COLUMN pin TEXT;
  END IF;

  -- Add status if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'status') THEN
    ALTER TABLE projects ADD COLUMN status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'completed'));
  END IF;

  -- Add archived_at if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'archived_at') THEN
    ALTER TABLE projects ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE;
  END IF;

  -- Add total_spent if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'total_spent') THEN
    ALTER TABLE projects ADD COLUMN total_spent DECIMAL(12, 2) DEFAULT 0;
  END IF;
END $$;

-- ============================================
-- Materials & Equipment Master List
-- ============================================
CREATE TABLE IF NOT EXISTS materials_equipment (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('materials', 'equipment', 'tools')),
  unit TEXT NOT NULL, -- 'each', 'hours', 'lbs', 'sqft', etc.
  cost_per_unit DECIMAL(10, 2) DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_materials_equipment_company ON materials_equipment(company_id);
CREATE INDEX IF NOT EXISTS idx_materials_equipment_category ON materials_equipment(category);

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
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by_name TEXT,
  approved_by_user_id UUID REFERENCES users(id),
  approved_by_name TEXT,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_by_user_id UUID REFERENCES users(id),
  rejected_by_name TEXT,
  rejected_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tm_tickets_project ON t_and_m_tickets(project_id);
CREATE INDEX IF NOT EXISTS idx_tm_tickets_status ON t_and_m_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tm_tickets_date ON t_and_m_tickets(work_date);

-- ============================================
-- T&M Workers (Labor)
-- ============================================
CREATE TABLE IF NOT EXISTS t_and_m_workers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES t_and_m_tickets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'Laborer',
  hours DECIMAL(5, 2) NOT NULL,
  overtime_hours DECIMAL(5, 2) DEFAULT 0,
  time_started TIME,
  time_ended TIME,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tm_workers_ticket ON t_and_m_workers(ticket_id);

-- ============================================
-- T&M Items (Materials/Equipment)
-- ============================================
CREATE TABLE IF NOT EXISTS t_and_m_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES t_and_m_tickets(id) ON DELETE CASCADE,
  material_equipment_id UUID REFERENCES materials_equipment(id),
  custom_name TEXT, -- If not from master list
  custom_category TEXT,
  quantity DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tm_items_ticket ON t_and_m_items(ticket_id);

-- ============================================
-- Material Requests
-- ============================================
CREATE TABLE IF NOT EXISTS material_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  items JSONB NOT NULL, -- Array of {name, quantity, unit}
  requested_by TEXT NOT NULL,
  needed_by DATE,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent')),
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'ordered', 'delivered', 'rejected')),
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

-- ============================================
-- Crew Check-ins
-- ============================================
CREATE TABLE IF NOT EXISTS crew_checkins (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  check_in_date DATE NOT NULL,
  workers JSONB NOT NULL, -- Array of {name, role}
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, check_in_date)
);

CREATE INDEX IF NOT EXISTS idx_crew_checkins_project ON crew_checkins(project_id);
CREATE INDEX IF NOT EXISTS idx_crew_checkins_date ON crew_checkins(check_in_date);

-- ============================================
-- Daily Reports
-- ============================================
CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  crew_count INTEGER DEFAULT 0,
  crew_list JSONB, -- Array of crew members
  tasks_completed INTEGER DEFAULT 0,
  tasks_total INTEGER DEFAULT 0,
  completed_tasks JSONB, -- Array of completed task details
  tm_tickets_count INTEGER DEFAULT 0,
  photos_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  submitted_at TIMESTAMP WITH TIME ZONE,
  submitted_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, report_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_reports_project ON daily_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);

-- ============================================
-- Messages (Field <-> Office Communication)
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('field', 'office')),
  sender_name TEXT NOT NULL,
  sender_user_id UUID REFERENCES users(id),
  message TEXT NOT NULL,
  photo_url TEXT,
  message_type TEXT DEFAULT 'general' CHECK (message_type IN ('general', 'question', 'issue', 'update')),
  parent_message_id UUID REFERENCES messages(id),
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_type);
CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(is_read);

-- ============================================
-- Enable Row Level Security
-- ============================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_and_m_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_and_m_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_and_m_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Basic RLS Policies (Allow all for authenticated users)
-- In production, you'd want more granular policies
-- ============================================

-- Companies
CREATE POLICY "Authenticated users can view companies" ON companies
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Users
CREATE POLICY "Authenticated users can view users" ON users
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Materials Equipment
CREATE POLICY "Authenticated users can manage materials" ON materials_equipment
  FOR ALL USING (auth.uid() IS NOT NULL);

-- T&M Tickets
CREATE POLICY "Authenticated users can manage tickets" ON t_and_m_tickets
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage workers" ON t_and_m_workers
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can manage items" ON t_and_m_items
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Material Requests
CREATE POLICY "Authenticated users can manage requests" ON material_requests
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Crew Check-ins
CREATE POLICY "Authenticated users can manage checkins" ON crew_checkins
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Daily Reports
CREATE POLICY "Authenticated users can manage reports" ON daily_reports
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Messages
CREATE POLICY "Authenticated users can manage messages" ON messages
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ============================================
-- Update triggers for updated_at columns
-- ============================================

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_materials_equipment_updated_at
  BEFORE UPDATE ON materials_equipment
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tm_tickets_updated_at
  BEFORE UPDATE ON t_and_m_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_material_requests_updated_at
  BEFORE UPDATE ON material_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crew_checkins_updated_at
  BEFORE UPDATE ON crew_checkins
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_reports_updated_at
  BEFORE UPDATE ON daily_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
