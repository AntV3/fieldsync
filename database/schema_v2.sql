-- FieldSync Database Schema v2
-- Adds user profiles and role-based access
-- Run this in your Supabase SQL Editor

-- ============================================
-- NEW: User Profiles Table
-- ============================================

-- Create profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'foreman' CHECK (role IN ('foreman', 'office', 'admin')),
  company_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_company ON profiles(company_id);

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- ============================================
-- Function to auto-create profile on signup
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'foreman')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- Update existing tables with user ownership
-- ============================================

-- Add created_by to projects (if column doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'projects' AND column_name = 'created_by') THEN
    ALTER TABLE projects ADD COLUMN created_by UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- ============================================
-- Foreman Project Assignments
-- ============================================

-- Table to assign foremen to specific projects
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

-- Enable RLS
ALTER TABLE project_assignments ENABLE ROW LEVEL SECURITY;

-- Assignment policies
CREATE POLICY "Users can view their assignments" ON project_assignments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Office/Admin can manage assignments" ON project_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('office', 'admin')
    )
  );

-- ============================================
-- Update Project Policies
-- ============================================

-- Drop old permissive policy
DROP POLICY IF EXISTS "Allow all operations on projects" ON projects;

-- Office/Admin can see all projects
CREATE POLICY "Office can view all projects" ON projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('office', 'admin')
    )
  );

-- Foremen can only see assigned projects
CREATE POLICY "Foremen can view assigned projects" ON projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_assignments 
      WHERE project_id = projects.id AND user_id = auth.uid()
    )
  );

-- Only office/admin can create/update/delete projects
CREATE POLICY "Office can manage projects" ON projects
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('office', 'admin')
    )
  );

-- ============================================
-- Update Area Policies
-- ============================================

-- Drop old permissive policy
DROP POLICY IF EXISTS "Allow all operations on areas" ON areas;

-- Everyone can view areas for projects they have access to
CREATE POLICY "Users can view areas" ON areas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      LEFT JOIN project_assignments pa ON pa.project_id = p.id
      LEFT JOIN profiles pr ON pr.id = auth.uid()
      WHERE p.id = areas.project_id
      AND (pr.role IN ('office', 'admin') OR pa.user_id = auth.uid())
    )
  );

-- Everyone with project access can update area status
CREATE POLICY "Users can update area status" ON areas
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM projects p
      LEFT JOIN project_assignments pa ON pa.project_id = p.id
      LEFT JOIN profiles pr ON pr.id = auth.uid()
      WHERE p.id = areas.project_id
      AND (pr.role IN ('office', 'admin') OR pa.user_id = auth.uid())
    )
  );

-- Only office/admin can create/delete areas
CREATE POLICY "Office can manage areas" ON areas
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('office', 'admin')
    )
  );

CREATE POLICY "Office can delete areas" ON areas
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('office', 'admin')
    )
  );

-- ============================================
-- Activity Log (for tracking who did what)
-- ============================================

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

-- Enable RLS
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Office can see all activity
CREATE POLICY "Office can view activity" ON activity_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('office', 'admin')
    )
  );

-- Anyone can insert activity
CREATE POLICY "Users can log activity" ON activity_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- Enable realtime for relevant tables
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE areas;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;
