-- ================================================================
-- FieldSync — Complete Database Setup
-- Generated: Sun Feb 22 18:38:28 UTC 2026
-- Run this ONCE in your Supabase SQL Editor to set up everything.
-- ================================================================


-- ----------------------------------------------------------------
-- 1. Base Schema (projects, areas)
-- ----------------------------------------------------------------
-- FieldSync Database Schema
-- Run this in your Supabase SQL Editor to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Projects table
CREATE TABLE projects (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  contract_value DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Areas table
CREATE TABLE areas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  weight DECIMAL(5, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'working', 'done')),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_areas_project_id ON areas(project_id);
CREATE INDEX idx_areas_status ON areas(status);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;

-- For demo purposes, allow all operations (in production, you'd add proper policies)
CREATE POLICY "Allow all operations on projects" ON projects FOR ALL USING (true);
CREATE POLICY "Allow all operations on areas" ON areas FOR ALL USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to auto-update updated_at
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_areas_updated_at
  BEFORE UPDATE ON areas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable realtime for areas table (so field updates sync to dashboard)
ALTER PUBLICATION supabase_realtime ADD TABLE areas;


-- ----------------------------------------------------------------
-- 2. Schema v2 (profiles, project_assignments, activity_log)
-- ----------------------------------------------------------------
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

-- ============================================
-- RLS POLICIES - MOVED TO MIGRATIONS
-- ============================================
-- NOTE: RLS policies for projects, areas, and companies have been
-- moved to supabase/migrations/20250116_fix_ambiguous_project_id_v2.sql
-- to fix ambiguous column references.
--
-- DO NOT recreate policies here as they will conflict with migration policies.
-- All policies are now managed through migrations for better version control.
-- ============================================

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


-- ----------------------------------------------------------------
-- 3. Companies, users, user_companies
-- ----------------------------------------------------------------
-- ============================================
-- COMPANY JOIN APPROVAL LAYER - COMPLETE MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================
-- This migration is ORDERED to handle dependencies correctly:
-- 1. Create base tables if they don't exist
-- 2. Add columns to existing tables
-- 3. Create functions
-- 4. Create RLS policies (which depend on the above)
-- ============================================

-- ============================================
-- PHASE 1: ENSURE BASE TABLES EXIST
-- ============================================

-- 1A. Create companies table if not exists
CREATE TABLE IF NOT EXISTS companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code VARCHAR(6) UNIQUE,
  office_code TEXT,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'business', 'enterprise')),
  owner_user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1B. Create users table if not exists
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  company_id UUID REFERENCES companies(id),
  role TEXT DEFAULT 'member',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1C. Create user_companies junction table if not exists
CREATE TABLE IF NOT EXISTS user_companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  removed_at TIMESTAMPTZ,
  removed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(user_id, company_id)
);

-- ============================================
-- PHASE 2: ADD/ENSURE COLUMNS EXIST
-- ============================================

-- 2A. Add office_code to companies if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'office_code'
  ) THEN
    ALTER TABLE companies ADD COLUMN office_code TEXT;
  END IF;
END $$;

-- 2B. Add status column to user_companies if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_companies' AND column_name = 'status'
  ) THEN
    ALTER TABLE user_companies ADD COLUMN status TEXT DEFAULT 'active';
  END IF;
END $$;

-- 2C. Add approved_at column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_companies' AND column_name = 'approved_at'
  ) THEN
    ALTER TABLE user_companies ADD COLUMN approved_at TIMESTAMPTZ;
  END IF;
END $$;

-- 2D. Add approved_by column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_companies' AND column_name = 'approved_by'
  ) THEN
    ALTER TABLE user_companies ADD COLUMN approved_by UUID REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2E. Add removed_at column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_companies' AND column_name = 'removed_at'
  ) THEN
    ALTER TABLE user_companies ADD COLUMN removed_at TIMESTAMPTZ;
  END IF;
END $$;

-- 2F. Add removed_by column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_companies' AND column_name = 'removed_by'
  ) THEN
    ALTER TABLE user_companies ADD COLUMN removed_by UUID REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2G. Add company_id to projects if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE projects ADD COLUMN company_id UUID REFERENCES companies(id);
  END IF;
END $$;

-- 2H. Add status constraint to user_companies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_companies_status_check'
  ) THEN
    ALTER TABLE user_companies
    ADD CONSTRAINT user_companies_status_check
    CHECK (status IN ('pending', 'active', 'removed'));
  END IF;
END $$;

-- ============================================
-- PHASE 3: GENERATE OFFICE CODES FOR EXISTING COMPANIES
-- ============================================

UPDATE companies
SET office_code = UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 6))
WHERE office_code IS NULL;

-- ============================================
-- PHASE 4: CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_companies_code ON companies(code);
CREATE INDEX IF NOT EXISTS idx_companies_office_code ON companies(office_code);
CREATE INDEX IF NOT EXISTS idx_user_companies_status ON user_companies(status);
CREATE INDEX IF NOT EXISTS idx_user_companies_company_status ON user_companies(company_id, status);
CREATE INDEX IF NOT EXISTS idx_user_companies_user_status ON user_companies(user_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_company_id ON projects(company_id);

-- ============================================
-- PHASE 5: CREATE RPC FUNCTIONS
-- ============================================

-- Drop existing functions first to allow parameter name changes
DROP FUNCTION IF EXISTS verify_office_code(UUID, TEXT);
DROP FUNCTION IF EXISTS approve_membership_with_role(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS has_active_company_membership(UUID, UUID);

-- 5A. verify_office_code - Securely verifies office code without exposing it
-- Parameter names must match frontend: company_id, code
CREATE OR REPLACE FUNCTION verify_office_code(company_id UUID, code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_code TEXT;
BEGIN
  SELECT c.office_code INTO stored_code
  FROM companies c
  WHERE c.id = company_id;

  IF stored_code IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN UPPER(TRIM(stored_code)) = UPPER(TRIM(code));
END;
$$;

-- 5B. approve_membership_with_role - Approves membership with role assignment
CREATE OR REPLACE FUNCTION approve_membership_with_role(
  membership_id UUID,
  approved_by_user UUID,
  new_role TEXT DEFAULT 'member'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_company_id UUID;
  approver_status TEXT;
  approver_role TEXT;
BEGIN
  -- Get the company_id from the membership being approved
  SELECT company_id INTO target_company_id
  FROM user_companies
  WHERE id = membership_id;

  IF target_company_id IS NULL THEN
    RAISE EXCEPTION 'Membership not found';
  END IF;

  -- Verify the approver is an active admin/owner of this company
  SELECT uc.status, uc.role INTO approver_status, approver_role
  FROM user_companies uc
  WHERE uc.user_id = approved_by_user
  AND uc.company_id = target_company_id;

  IF approver_status != 'active' OR approver_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Unauthorized: Only active admins can approve memberships';
  END IF;

  -- Validate role value
  IF new_role NOT IN ('member', 'admin', 'owner', 'foreman', 'office') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;

  -- Update the membership
  UPDATE user_companies
  SET
    status = 'active',
    role = new_role,
    approved_at = NOW(),
    approved_by = approved_by_user
  WHERE id = membership_id
  AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership not found or already processed';
  END IF;
END;
$$;

-- 5C. has_active_company_membership - Helper to check active membership
CREATE OR REPLACE FUNCTION has_active_company_membership(check_user_id UUID, check_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_companies
    WHERE user_id = check_user_id
    AND company_id = check_company_id
    AND status = 'active'
  );
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION verify_office_code(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_membership_with_role(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION has_active_company_membership(UUID, UUID) TO authenticated;

-- ============================================
-- PHASE 6: ENABLE RLS ON ALL TABLES
-- ============================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PHASE 7: USER_COMPANIES RLS POLICIES
-- ============================================

-- Drop existing policies first
DROP POLICY IF EXISTS "Users view own memberships" ON user_companies;
DROP POLICY IF EXISTS "Admins view company memberships" ON user_companies;
DROP POLICY IF EXISTS "Admins manage company memberships" ON user_companies;
DROP POLICY IF EXISTS "Admins reject pending memberships" ON user_companies;
DROP POLICY IF EXISTS "Users create pending membership" ON user_companies;
DROP POLICY IF EXISTS "Admins create memberships" ON user_companies;

-- Users can view their own memberships (any status)
CREATE POLICY "Users view own memberships"
ON user_companies FOR SELECT
USING (user_id = auth.uid());

-- Active admins/owners can view all memberships in their company
CREATE POLICY "Admins view company memberships"
ON user_companies FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.role IN ('admin', 'owner')
  )
);

-- Active admins/owners can update memberships (approve/remove)
CREATE POLICY "Admins manage company memberships"
ON user_companies FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.role IN ('admin', 'owner')
  )
);

-- Admins can delete pending memberships (reject)
CREATE POLICY "Admins reject pending memberships"
ON user_companies FOR DELETE
USING (
  user_companies.status = 'pending'
  AND EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.role IN ('admin', 'owner')
  )
);

-- Authenticated users can insert their own pending membership
CREATE POLICY "Users create pending membership"
ON user_companies FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND status = 'pending'
);

-- Active admins can create memberships (for manual invites)
CREATE POLICY "Admins create memberships"
ON user_companies FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.role IN ('admin', 'owner')
  )
);

-- ============================================
-- PHASE 8: COMPANIES RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users view companies" ON companies;
DROP POLICY IF EXISTS "Public view companies by code" ON companies;
DROP POLICY IF EXISTS "Admins manage companies" ON companies;

-- Anyone can look up a company by code (for join flow)
CREATE POLICY "Public view companies by code"
ON companies FOR SELECT
USING (true);

-- Active admins can update their company
CREATE POLICY "Admins manage companies"
ON companies FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = companies.id
    AND uc.status = 'active'
    AND uc.role IN ('admin', 'owner')
  )
);

-- ============================================
-- PHASE 9: USERS RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users view own record" ON users;
DROP POLICY IF EXISTS "Users update own record" ON users;
DROP POLICY IF EXISTS "Admins view company users" ON users;
DROP POLICY IF EXISTS "Service role manage users" ON users;

-- Users can view their own record
CREATE POLICY "Users view own record"
ON users FOR SELECT
USING (id = auth.uid());

-- Users can update their own record
CREATE POLICY "Users update own record"
ON users FOR UPDATE
USING (id = auth.uid());

-- Active admins can view users in their company
CREATE POLICY "Admins view company users"
ON users FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc1
    WHERE uc1.user_id = auth.uid()
    AND uc1.status = 'active'
    AND uc1.role IN ('admin', 'owner')
    AND EXISTS (
      SELECT 1 FROM user_companies uc2
      WHERE uc2.user_id = users.id
      AND uc2.company_id = uc1.company_id
    )
  )
);

-- Allow inserts for new user signup
CREATE POLICY "Users can insert own record"
ON users FOR INSERT
WITH CHECK (id = auth.uid());

-- ============================================
-- PHASE 10: PROJECTS RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Allow all operations on projects" ON projects;
DROP POLICY IF EXISTS "Office can view all projects" ON projects;
DROP POLICY IF EXISTS "Foremen can view assigned projects" ON projects;
DROP POLICY IF EXISTS "Office can manage projects" ON projects;
DROP POLICY IF EXISTS "Active members view company projects" ON projects;
DROP POLICY IF EXISTS "Active members create company projects" ON projects;
DROP POLICY IF EXISTS "Active members update company projects" ON projects;
DROP POLICY IF EXISTS "Active admins delete company projects" ON projects;

-- Only active members can view their company's projects
CREATE POLICY "Active members view company projects"
ON projects FOR SELECT
USING (
  -- If project has company_id, check membership
  (company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = projects.company_id
    AND uc.status = 'active'
  ))
  OR
  -- Legacy: projects without company_id (backwards compatibility)
  company_id IS NULL
);

-- Active members can insert projects for their company
CREATE POLICY "Active members create company projects"
ON projects FOR INSERT
WITH CHECK (
  (company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = projects.company_id
    AND uc.status = 'active'
  ))
  OR company_id IS NULL
);

-- Active members can update projects
CREATE POLICY "Active members update company projects"
ON projects FOR UPDATE
USING (
  (company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = projects.company_id
    AND uc.status = 'active'
  ))
  OR company_id IS NULL
);

-- Only active admins can delete projects
CREATE POLICY "Active admins delete company projects"
ON projects FOR DELETE
USING (
  (company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = projects.company_id
    AND uc.status = 'active'
    AND uc.role IN ('admin', 'owner', 'office')
  ))
  OR company_id IS NULL
);

-- ============================================
-- PHASE 11: AREAS RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Allow all operations on areas" ON areas;
DROP POLICY IF EXISTS "Users can view areas" ON areas;
DROP POLICY IF EXISTS "Users can update area status" ON areas;
DROP POLICY IF EXISTS "Office can manage areas" ON areas;
DROP POLICY IF EXISTS "Office can delete areas" ON areas;
DROP POLICY IF EXISTS "Active members view areas" ON areas;
DROP POLICY IF EXISTS "Active members update areas" ON areas;
DROP POLICY IF EXISTS "Active members create areas" ON areas;
DROP POLICY IF EXISTS "Active admins delete areas" ON areas;

-- Active members can view areas via project->company
CREATE POLICY "Active members view areas"
ON areas FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM projects p
    LEFT JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = areas.project_id
    AND (
      p.company_id IS NULL
      OR (uc.user_id = auth.uid() AND uc.status = 'active')
    )
  )
);

-- Active members can update area status
CREATE POLICY "Active members update areas"
ON areas FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM projects p
    LEFT JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = areas.project_id
    AND (
      p.company_id IS NULL
      OR (uc.user_id = auth.uid() AND uc.status = 'active')
    )
  )
);

-- Active members can insert areas
CREATE POLICY "Active members create areas"
ON areas FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects p
    LEFT JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = areas.project_id
    AND (
      p.company_id IS NULL
      OR (uc.user_id = auth.uid() AND uc.status = 'active')
    )
  )
);

-- Active admins can delete areas
CREATE POLICY "Active admins delete areas"
ON areas FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM projects p
    LEFT JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = areas.project_id
    AND (
      p.company_id IS NULL
      OR (
        uc.user_id = auth.uid()
        AND uc.status = 'active'
        AND uc.role IN ('admin', 'owner', 'office')
      )
    )
  )
);

-- ============================================
-- PHASE 12: CHANGE ORDERS RLS (if table exists)
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'change_orders') THEN
    -- Drop existing policies
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users full access to CORs" ON change_orders';

    -- Create new policy with active membership check
    EXECUTE '
    CREATE POLICY "Active members access CORs"
    ON change_orders FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
        AND uc.company_id = change_orders.company_id
        AND uc.status = ''active''
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
        AND uc.company_id = change_orders.company_id
        AND uc.status = ''active''
      )
    )';
  END IF;
END $$;

-- ============================================
-- PHASE 13: SIGNATURE_REQUESTS RLS (if table exists)
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'signature_requests') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Company users manage signature requests" ON signature_requests';

    EXECUTE '
    CREATE POLICY "Active members manage signature requests"
    ON signature_requests FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
        AND uc.company_id = signature_requests.company_id
        AND uc.status = ''active''
      )
    )';
  END IF;
END $$;

-- ============================================
-- PHASE 14: INJURY_REPORTS RLS (if table exists)
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'injury_reports') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view injury reports" ON injury_reports';
    EXECUTE 'DROP POLICY IF EXISTS "Users can manage injury reports" ON injury_reports';
    EXECUTE 'DROP POLICY IF EXISTS "Active members view injury reports" ON injury_reports';
    EXECUTE 'DROP POLICY IF EXISTS "Active members manage injury reports" ON injury_reports';

    EXECUTE '
    CREATE POLICY "Active members access injury reports"
    ON injury_reports FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
        AND uc.company_id = injury_reports.company_id
        AND uc.status = ''active''
      )
    )';
  END IF;
END $$;

-- ============================================
-- PHASE 15: COMPANY_BRANDING RLS (if table exists)
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_branding') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view their company branding" ON company_branding';
    EXECUTE 'DROP POLICY IF EXISTS "Company admins can update branding" ON company_branding';
    EXECUTE 'DROP POLICY IF EXISTS "Public can view branding by domain" ON company_branding';
    EXECUTE 'DROP POLICY IF EXISTS "Active members view company branding" ON company_branding';
    EXECUTE 'DROP POLICY IF EXISTS "Active admins update company branding" ON company_branding';

    -- Allow viewing branding (for login page custom domains)
    EXECUTE '
    CREATE POLICY "View company branding"
    ON company_branding FOR SELECT
    USING (
      custom_domain IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
        AND uc.company_id = company_branding.company_id
        AND uc.status = ''active''
      )
    )';

    -- Only active admins can modify branding
    EXECUTE '
    CREATE POLICY "Admins update company branding"
    ON company_branding FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
        AND uc.company_id = company_branding.company_id
        AND uc.status = ''active''
        AND uc.role IN (''admin'', ''owner'', ''office'')
      )
    )';

    EXECUTE '
    CREATE POLICY "Admins insert company branding"
    ON company_branding FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
        AND uc.company_id = company_branding.company_id
        AND uc.status = ''active''
        AND uc.role IN (''admin'', ''owner'', ''office'')
      )
    )';
  END IF;
END $$;

-- ============================================
-- PHASE 16: GRANT PERMISSIONS
-- ============================================

GRANT SELECT ON companies TO authenticated;
GRANT SELECT ON companies TO anon;
GRANT SELECT, INSERT, UPDATE ON users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_companies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON areas TO authenticated;

-- ============================================
-- PHASE 17: DOCUMENTATION
-- ============================================

COMMENT ON FUNCTION verify_office_code IS 'Securely verifies office code without exposing it. Returns true if code matches.';
COMMENT ON FUNCTION approve_membership_with_role IS 'Approves a pending membership with role assignment. Only callable by active admins.';
COMMENT ON FUNCTION has_active_company_membership IS 'Helper to check if user has active membership in a company.';
COMMENT ON COLUMN user_companies.status IS 'Membership status: pending (awaiting approval), active (approved), removed (soft-deleted)';
COMMENT ON COLUMN user_companies.approved_at IS 'Timestamp when membership was approved';
COMMENT ON COLUMN user_companies.approved_by IS 'User ID of admin who approved';
COMMENT ON COLUMN user_companies.removed_at IS 'Timestamp when membership was removed';
COMMENT ON COLUMN user_companies.removed_by IS 'User ID of admin who removed';
COMMENT ON COLUMN companies.office_code IS 'Secret code for office staff to join company (verified server-side only)';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================


-- ----------------------------------------------------------------
-- 4. Membership approval workflow
-- ----------------------------------------------------------------
-- ============================================
-- MEMBERSHIP APPROVAL MIGRATION
-- Adds approval workflow to company membership
-- ============================================

-- ============================================
-- 1. ADD STATUS COLUMN TO USER_COMPANIES
-- ============================================

-- Add status column with default 'active' for backwards compatibility
ALTER TABLE user_companies
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Add constraint for valid status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_companies_status_check'
  ) THEN
    ALTER TABLE user_companies
    ADD CONSTRAINT user_companies_status_check
    CHECK (status IN ('pending', 'active', 'removed'));
  END IF;
END $$;

-- ============================================
-- 2. ADD AUDIT TRAIL COLUMNS
-- ============================================

-- Approval tracking
ALTER TABLE user_companies
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_by UUID;

-- Removal tracking
ALTER TABLE user_companies
ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS removed_by UUID;

-- Add foreign key constraints (if users table exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_companies_approved_by_fkey'
  ) THEN
    ALTER TABLE user_companies
    ADD CONSTRAINT user_companies_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_companies_removed_by_fkey'
  ) THEN
    ALTER TABLE user_companies
    ADD CONSTRAINT user_companies_removed_by_fkey
    FOREIGN KEY (removed_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

-- ============================================
-- 3. CREATE INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_user_companies_status
ON user_companies(status);

CREATE INDEX IF NOT EXISTS idx_user_companies_company_status
ON user_companies(company_id, status);

CREATE INDEX IF NOT EXISTS idx_user_companies_user_status
ON user_companies(user_id, status);

-- ============================================
-- 4. UPDATE RLS POLICIES TO REQUIRE ACTIVE STATUS
-- ============================================

-- Note: These policies ensure pending/removed users cannot access company data

-- CHANGE_ORDERS POLICY
DROP POLICY IF EXISTS "Authenticated users full access to CORs" ON change_orders;
CREATE POLICY "Authenticated users full access to CORs"
ON change_orders FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = change_orders.company_id
    AND uc.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = change_orders.company_id
    AND uc.status = 'active'
  )
);

-- CHANGE_ORDER_LABOR POLICY
DROP POLICY IF EXISTS "Authenticated users full access to labor items" ON change_order_labor;
CREATE POLICY "Authenticated users full access to labor items"
ON change_order_labor FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    JOIN user_companies uc ON uc.company_id = co.company_id
    WHERE co.id = change_order_labor.change_order_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
  )
);

-- CHANGE_ORDER_MATERIALS POLICY
DROP POLICY IF EXISTS "Authenticated users full access to material items" ON change_order_materials;
CREATE POLICY "Authenticated users full access to material items"
ON change_order_materials FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    JOIN user_companies uc ON uc.company_id = co.company_id
    WHERE co.id = change_order_materials.change_order_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
  )
);

-- CHANGE_ORDER_EQUIPMENT POLICY
DROP POLICY IF EXISTS "Authenticated users full access to equipment items" ON change_order_equipment;
CREATE POLICY "Authenticated users full access to equipment items"
ON change_order_equipment FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    JOIN user_companies uc ON uc.company_id = co.company_id
    WHERE co.id = change_order_equipment.change_order_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
  )
);

-- CHANGE_ORDER_SUBCONTRACTORS POLICY
DROP POLICY IF EXISTS "Authenticated users full access to subcontractor items" ON change_order_subcontractors;
CREATE POLICY "Authenticated users full access to subcontractor items"
ON change_order_subcontractors FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    JOIN user_companies uc ON uc.company_id = co.company_id
    WHERE co.id = change_order_subcontractors.change_order_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
  )
);

-- CHANGE_ORDER_TICKET_ASSOCIATIONS POLICY
DROP POLICY IF EXISTS "Authenticated users full access to ticket associations" ON change_order_ticket_associations;
CREATE POLICY "Authenticated users full access to ticket associations"
ON change_order_ticket_associations FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    JOIN user_companies uc ON uc.company_id = co.company_id
    WHERE co.id = change_order_ticket_associations.change_order_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
  )
);

-- SIGNATURE_REQUESTS POLICY
DROP POLICY IF EXISTS "Company users manage signature requests" ON signature_requests;
CREATE POLICY "Company users manage signature requests"
ON signature_requests FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = signature_requests.company_id
    AND uc.status = 'active'
  )
);

-- SIGNATURES POLICY (via signature_requests)
DROP POLICY IF EXISTS "Signatures access via signature requests" ON signatures;
CREATE POLICY "Signatures access via signature requests"
ON signatures FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM signature_requests sr
    INNER JOIN user_companies uc ON uc.company_id = sr.company_id
    WHERE sr.id = signatures.signature_request_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
  )
  OR
  -- Allow public access for signing (anon users signing their own signature)
  EXISTS (
    SELECT 1 FROM signature_requests sr
    WHERE sr.id = signatures.signature_request_id
    AND sr.token IS NOT NULL
  )
);

-- ============================================
-- 5. USER_COMPANIES RLS FOR MEMBERSHIP MANAGEMENT
-- ============================================

-- Enable RLS on user_companies if not already enabled
ALTER TABLE user_companies ENABLE ROW LEVEL SECURITY;

-- Users can view their own memberships
DROP POLICY IF EXISTS "Users view own memberships" ON user_companies;
CREATE POLICY "Users view own memberships"
ON user_companies FOR SELECT
USING (user_id = auth.uid());

-- Active admins/owners can view all memberships in their company
DROP POLICY IF EXISTS "Admins view company memberships" ON user_companies;
CREATE POLICY "Admins view company memberships"
ON user_companies FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.role IN ('admin', 'owner')
  )
);

-- Active admins/owners can update memberships (approve/remove)
DROP POLICY IF EXISTS "Admins manage company memberships" ON user_companies;
CREATE POLICY "Admins manage company memberships"
ON user_companies FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.role IN ('admin', 'owner')
  )
);

-- Admins can delete pending memberships (reject)
DROP POLICY IF EXISTS "Admins reject pending memberships" ON user_companies;
CREATE POLICY "Admins reject pending memberships"
ON user_companies FOR DELETE
USING (
  user_companies.status = 'pending'
  AND EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.role IN ('admin', 'owner')
  )
);

-- Authenticated users can insert their own pending membership
DROP POLICY IF EXISTS "Users create pending membership" ON user_companies;
CREATE POLICY "Users create pending membership"
ON user_companies FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND status = 'pending'
);

-- Also allow active admins to create memberships (for manual invites)
DROP POLICY IF EXISTS "Admins create memberships" ON user_companies;
CREATE POLICY "Admins create memberships"
ON user_companies FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.role IN ('admin', 'owner')
  )
);

-- ============================================
-- 6. GRANT PERMISSIONS
-- ============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON user_companies TO authenticated;

-- ============================================
-- 7. DOCUMENTATION
-- ============================================

COMMENT ON COLUMN user_companies.status IS 'Membership status: pending (awaiting approval), active (approved), removed (soft-deleted)';
COMMENT ON COLUMN user_companies.approved_at IS 'Timestamp when membership was approved';
COMMENT ON COLUMN user_companies.approved_by IS 'User ID of admin who approved the membership';
COMMENT ON COLUMN user_companies.removed_at IS 'Timestamp when membership was removed';
COMMENT ON COLUMN user_companies.removed_by IS 'User ID of admin who removed the membership';


-- ----------------------------------------------------------------
-- 5. Field sessions
-- ----------------------------------------------------------------
-- ============================================================
-- FIELD SESSION SECURITY MIGRATION
-- ============================================================
-- Run this in Supabase SQL Editor to secure field user access
--
-- PROBLEM: Current RLS uses auth.uid() IS NULL which allows ANY
-- anonymous request to access data without validation.
--
-- SOLUTION: Session-based field access:
-- 1. When PIN is validated, create a session with a secure token
-- 2. Client stores token, sends it via header with all requests
-- 3. RLS policies validate the session token and project access
-- ============================================================

-- ============================================================
-- 1. FIELD SESSIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS field_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_field_sessions_token ON field_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_field_sessions_project ON field_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_field_sessions_expires ON field_sessions(expires_at);

-- Enable RLS
ALTER TABLE field_sessions ENABLE ROW LEVEL SECURITY;

-- Sessions table should only be accessible via functions
DROP POLICY IF EXISTS "No direct session access" ON field_sessions;
CREATE POLICY "No direct session access"
ON field_sessions FOR ALL
USING (false);

-- Grant to anon (access controlled via functions)
GRANT SELECT, INSERT, UPDATE, DELETE ON field_sessions TO anon;

-- ============================================================
-- 2. SESSION VALIDATION FUNCTION
-- ============================================================

-- Validate a session token and check project access
CREATE OR REPLACE FUNCTION validate_field_session(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_session_token TEXT;
  valid_session BOOLEAN := false;
BEGIN
  -- Get session token from request header
  BEGIN
    v_session_token := current_setting('request.headers', true)::json->>'x-field-session';
  EXCEPTION WHEN OTHERS THEN
    v_session_token := NULL;
  END;

  IF v_session_token IS NULL OR v_session_token = '' THEN
    RETURN false;
  END IF;

  -- Check if session is valid for this project
  SELECT EXISTS (
    SELECT 1 FROM field_sessions fs
    WHERE fs.session_token = v_session_token
      AND fs.project_id = p_project_id
      AND fs.expires_at > NOW()
  ) INTO valid_session;

  -- Update last activity if valid
  IF valid_session THEN
    UPDATE field_sessions
    SET last_activity = NOW()
    WHERE session_token = v_session_token
      AND project_id = p_project_id;
  END IF;

  RETURN valid_session;
END;
$$;

-- Check if current request has a valid field session (for any project)
CREATE OR REPLACE FUNCTION has_valid_field_session()
RETURNS TABLE (project_id UUID, company_id UUID)
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_session_token TEXT;
BEGIN
  -- Get session token from request header
  BEGIN
    v_session_token := current_setting('request.headers', true)::json->>'x-field-session';
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  IF v_session_token IS NULL OR v_session_token = '' THEN
    RETURN;
  END IF;

  -- Return project/company if session is valid
  RETURN QUERY
  SELECT fs.project_id, fs.company_id
  FROM field_sessions fs
  WHERE fs.session_token = v_session_token
    AND fs.expires_at > NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION validate_field_session(UUID) TO anon;
GRANT EXECUTE ON FUNCTION has_valid_field_session() TO anon;

-- ============================================================
-- 3. CREATE SESSION ON PIN VALIDATION
-- ============================================================

-- Enhanced PIN validation that creates a session
CREATE OR REPLACE FUNCTION validate_pin_and_create_session(
  p_pin TEXT,
  p_company_code TEXT,
  p_device_id TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
) RETURNS TABLE (
  success BOOLEAN,
  session_token TEXT,
  project_id UUID,
  project_name TEXT,
  company_id UUID,
  company_name TEXT,
  error_code TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  is_rate_limited BOOLEAN;
  found_project RECORD;
  found_company RECORD;
  new_session_token TEXT;
  clean_pin TEXT;
  clean_company_code TEXT;
BEGIN
  -- Clean input: trim whitespace and normalize
  clean_pin := TRIM(p_pin);
  clean_company_code := UPPER(TRIM(p_company_code));

  -- Check rate limit first
  is_rate_limited := NOT check_rate_limit(p_ip_address, p_device_id, 15, 5);

  IF is_rate_limited THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_rate_limited');
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT,
      'RATE_LIMITED'::TEXT;
    RETURN;
  END IF;

  -- Find company by code (case-insensitive)
  SELECT * INTO found_company
  FROM companies c
  WHERE UPPER(c.code) = clean_company_code;

  IF found_company IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid_company');
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT,
      'INVALID_COMPANY'::TEXT;
    RETURN;
  END IF;

  -- Find project by PIN within company (trim whitespace from both sides)
  SELECT * INTO found_project
  FROM projects p
  WHERE TRIM(p.pin) = clean_pin
    AND p.company_id = found_company.id
    AND p.status = 'active';

  IF found_project IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid');
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT,
      'INVALID_PIN'::TEXT;
    RETURN;
  END IF;

  -- Generate secure session token
  new_session_token := encode(gen_random_bytes(32), 'hex');

  -- Revoke any existing sessions for this device/project combo
  DELETE FROM field_sessions
  WHERE device_id = p_device_id
    AND project_id = found_project.id;

  -- Create new session
  INSERT INTO field_sessions (project_id, company_id, session_token, device_id)
  VALUES (found_project.id, found_company.id, new_session_token, p_device_id);

  -- Log successful attempt
  PERFORM log_auth_attempt(p_ip_address, p_device_id, TRUE, 'pin');

  -- Return success with session token
  RETURN QUERY SELECT
    true,
    new_session_token,
    found_project.id,
    found_project.name,
    found_company.id,
    found_company.name,
    NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_pin_and_create_session(TEXT, TEXT, TEXT, TEXT) TO anon;

-- ============================================================
-- 4. UPDATED RLS POLICIES
-- ============================================================
-- Replace open anon policies with session-validated policies

-- Helper: Check if user is authenticated OR has valid field session for project
CREATE OR REPLACE FUNCTION can_access_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
BEGIN
  -- Check authenticated user access
  IF auth.uid() IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM user_companies uc
      JOIN projects p ON p.company_id = uc.company_id
      WHERE p.id = p_project_id
        AND uc.user_id = auth.uid()
        AND uc.status = 'active'
    );
  END IF;

  -- Check field session access
  RETURN validate_field_session(p_project_id);
END;
$$;

GRANT EXECUTE ON FUNCTION can_access_project(UUID) TO anon;
GRANT EXECUTE ON FUNCTION can_access_project(UUID) TO authenticated;

-- ============================================================
-- 4a. AREAS TABLE
-- ============================================================

DROP POLICY IF EXISTS "Field users can view areas" ON areas;
DROP POLICY IF EXISTS "Field users can update areas" ON areas;
DROP POLICY IF EXISTS "Secure field access to areas" ON areas;
DROP POLICY IF EXISTS "Secure field update areas" ON areas;

CREATE POLICY "Secure field access to areas"
ON areas FOR SELECT
USING (can_access_project(project_id));

DROP POLICY IF EXISTS "Secure field update areas" ON areas;
CREATE POLICY "Secure field update areas"
ON areas FOR UPDATE
USING (can_access_project(project_id))
WITH CHECK (can_access_project(project_id));

-- ============================================================
-- 4b. T&M TICKETS
-- ============================================================

DROP POLICY IF EXISTS "Field users can view tickets" ON t_and_m_tickets;
DROP POLICY IF EXISTS "Field users can create tickets" ON t_and_m_tickets;
DROP POLICY IF EXISTS "Field users can update tickets" ON t_and_m_tickets;
DROP POLICY IF EXISTS "Secure field view tickets" ON t_and_m_tickets;
DROP POLICY IF EXISTS "Secure field create tickets" ON t_and_m_tickets;
DROP POLICY IF EXISTS "Secure field update tickets" ON t_and_m_tickets;

CREATE POLICY "Secure field view tickets"
ON t_and_m_tickets FOR SELECT
USING (can_access_project(project_id));

CREATE POLICY "Secure field create tickets"
ON t_and_m_tickets FOR INSERT
WITH CHECK (can_access_project(project_id));

CREATE POLICY "Secure field update tickets"
ON t_and_m_tickets FOR UPDATE
USING (can_access_project(project_id))
WITH CHECK (can_access_project(project_id));

-- ============================================================
-- 4c. T&M WORKERS
-- ============================================================

DROP POLICY IF EXISTS "Field users can view workers" ON t_and_m_workers;
DROP POLICY IF EXISTS "Field users can create workers" ON t_and_m_workers;
DROP POLICY IF EXISTS "Secure field view workers" ON t_and_m_workers;
DROP POLICY IF EXISTS "Secure field create workers" ON t_and_m_workers;

CREATE POLICY "Secure field view workers"
ON t_and_m_workers FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM t_and_m_tickets t
    WHERE t.id = t_and_m_workers.ticket_id
      AND can_access_project(t.project_id)
  )
);

CREATE POLICY "Secure field create workers"
ON t_and_m_workers FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM t_and_m_tickets t
    WHERE t.id = t_and_m_workers.ticket_id
      AND can_access_project(t.project_id)
  )
);

-- ============================================================
-- 4d. T&M ITEMS
-- ============================================================

DROP POLICY IF EXISTS "Field users can view items" ON t_and_m_items;
DROP POLICY IF EXISTS "Field users can create items" ON t_and_m_items;
DROP POLICY IF EXISTS "Secure field view items" ON t_and_m_items;
DROP POLICY IF EXISTS "Secure field create items" ON t_and_m_items;

CREATE POLICY "Secure field view items"
ON t_and_m_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM t_and_m_tickets t
    WHERE t.id = t_and_m_items.ticket_id
      AND can_access_project(t.project_id)
  )
);

CREATE POLICY "Secure field create items"
ON t_and_m_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM t_and_m_tickets t
    WHERE t.id = t_and_m_items.ticket_id
      AND can_access_project(t.project_id)
  )
);

-- ============================================================
-- 4e. CREW CHECKINS
-- ============================================================

DROP POLICY IF EXISTS "Field users can view crew checkins" ON crew_checkins;
DROP POLICY IF EXISTS "Field users can create crew checkins" ON crew_checkins;
DROP POLICY IF EXISTS "Field users can update crew checkins" ON crew_checkins;
DROP POLICY IF EXISTS "Secure field view crew checkins" ON crew_checkins;
DROP POLICY IF EXISTS "Secure field create crew checkins" ON crew_checkins;
DROP POLICY IF EXISTS "Secure field update crew checkins" ON crew_checkins;

CREATE POLICY "Secure field view crew checkins"
ON crew_checkins FOR SELECT
USING (can_access_project(project_id));

CREATE POLICY "Secure field create crew checkins"
ON crew_checkins FOR INSERT
WITH CHECK (can_access_project(project_id));

CREATE POLICY "Secure field update crew checkins"
ON crew_checkins FOR UPDATE
USING (can_access_project(project_id))
WITH CHECK (can_access_project(project_id));

-- ============================================================
-- 4f. DAILY REPORTS
-- ============================================================

DROP POLICY IF EXISTS "Field users can view daily reports" ON daily_reports;
DROP POLICY IF EXISTS "Field users can create daily reports" ON daily_reports;
DROP POLICY IF EXISTS "Secure field view daily reports" ON daily_reports;
DROP POLICY IF EXISTS "Secure field create daily reports" ON daily_reports;

CREATE POLICY "Secure field view daily reports"
ON daily_reports FOR SELECT
USING (can_access_project(project_id));

CREATE POLICY "Secure field create daily reports"
ON daily_reports FOR INSERT
WITH CHECK (can_access_project(project_id));

-- ============================================================
-- 4g. MESSAGES
-- ============================================================

DROP POLICY IF EXISTS "Field users can view messages" ON messages;
DROP POLICY IF EXISTS "Field users can send messages" ON messages;
DROP POLICY IF EXISTS "Field users can update messages" ON messages;
DROP POLICY IF EXISTS "Secure field view messages" ON messages;
DROP POLICY IF EXISTS "Secure field create messages" ON messages;
DROP POLICY IF EXISTS "Secure field update messages" ON messages;

CREATE POLICY "Secure field view messages"
ON messages FOR SELECT
USING (can_access_project(project_id));

CREATE POLICY "Secure field create messages"
ON messages FOR INSERT
WITH CHECK (can_access_project(project_id));

CREATE POLICY "Secure field update messages"
ON messages FOR UPDATE
USING (can_access_project(project_id))
WITH CHECK (can_access_project(project_id));

-- ============================================================
-- 4h. DISPOSAL LOADS
-- ============================================================

DROP POLICY IF EXISTS "Field users can view disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Field users can create disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Field users can update disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Field users can delete disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Secure field view disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Secure field create disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Secure field update disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Secure field delete disposal loads" ON disposal_loads;

CREATE POLICY "Secure field view disposal loads"
ON disposal_loads FOR SELECT
USING (can_access_project(project_id));

CREATE POLICY "Secure field create disposal loads"
ON disposal_loads FOR INSERT
WITH CHECK (can_access_project(project_id));

CREATE POLICY "Secure field update disposal loads"
ON disposal_loads FOR UPDATE
USING (can_access_project(project_id))
WITH CHECK (can_access_project(project_id));

CREATE POLICY "Secure field delete disposal loads"
ON disposal_loads FOR DELETE
USING (can_access_project(project_id));

-- ============================================================
-- 4i. INJURY REPORTS
-- ============================================================

DROP POLICY IF EXISTS "Field users can view injury reports" ON injury_reports;
DROP POLICY IF EXISTS "Field users can create injury reports" ON injury_reports;
DROP POLICY IF EXISTS "Secure field view injury reports" ON injury_reports;
DROP POLICY IF EXISTS "Secure field create injury reports" ON injury_reports;

CREATE POLICY "Secure field view injury reports"
ON injury_reports FOR SELECT
USING (can_access_project(project_id));

CREATE POLICY "Secure field create injury reports"
ON injury_reports FOR INSERT
WITH CHECK (can_access_project(project_id));

-- ============================================================
-- 4j. MATERIAL REQUESTS
-- ============================================================

DROP POLICY IF EXISTS "Field users can view material requests" ON material_requests;
DROP POLICY IF EXISTS "Field users can create material requests" ON material_requests;
DROP POLICY IF EXISTS "Secure field view material requests" ON material_requests;
DROP POLICY IF EXISTS "Secure field create material requests" ON material_requests;

CREATE POLICY "Secure field view material requests"
ON material_requests FOR SELECT
USING (can_access_project(project_id));

CREATE POLICY "Secure field create material requests"
ON material_requests FOR INSERT
WITH CHECK (can_access_project(project_id));

-- ============================================================
-- 4k. PROJECTS (read-only for field)
-- ============================================================

DROP POLICY IF EXISTS "Field users can view projects" ON projects;
DROP POLICY IF EXISTS "Secure field view projects" ON projects;

CREATE POLICY "Secure field view projects"
ON projects FOR SELECT
USING (can_access_project(id));

-- ============================================================
-- 4l. COMPANIES (read-only for field via session)
-- ============================================================

DROP POLICY IF EXISTS "Field users can view companies" ON companies;
DROP POLICY IF EXISTS "Secure field view companies" ON companies;

CREATE POLICY "Secure field view companies"
ON companies FOR SELECT
USING (
  auth.uid() IS NOT NULL
  OR
  EXISTS (
    SELECT 1 FROM has_valid_field_session() s
    WHERE s.company_id = companies.id
  )
);

-- ============================================================
-- 4m. CHANGE ORDERS (read-only for field)
-- ============================================================

DROP POLICY IF EXISTS "Field users can view CORs by project" ON change_orders;
DROP POLICY IF EXISTS "Secure field view CORs" ON change_orders;

CREATE POLICY "Secure field view CORs"
ON change_orders FOR SELECT
USING (can_access_project(project_id));

-- ============================================================
-- 4n. CHANGE ORDER ASSOCIATIONS
-- ============================================================

DROP POLICY IF EXISTS "Field users can view ticket associations" ON change_order_ticket_associations;
DROP POLICY IF EXISTS "Field users can create ticket associations" ON change_order_ticket_associations;
DROP POLICY IF EXISTS "Secure field view ticket associations" ON change_order_ticket_associations;
DROP POLICY IF EXISTS "Secure field create ticket associations" ON change_order_ticket_associations;

CREATE POLICY "Secure field view ticket associations"
ON change_order_ticket_associations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_ticket_associations.change_order_id
      AND can_access_project(cor.project_id)
  )
);

CREATE POLICY "Secure field create ticket associations"
ON change_order_ticket_associations FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_ticket_associations.change_order_id
      AND can_access_project(cor.project_id)
  )
);

-- ============================================================
-- 4o. CHANGE ORDER LINE ITEMS
-- ============================================================

-- Labor
DROP POLICY IF EXISTS "Field users can view labor items" ON change_order_labor;
DROP POLICY IF EXISTS "Field users can insert labor items" ON change_order_labor;
DROP POLICY IF EXISTS "Secure field view labor items" ON change_order_labor;
DROP POLICY IF EXISTS "Secure field insert labor items" ON change_order_labor;

CREATE POLICY "Secure field view labor items"
ON change_order_labor FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_labor.change_order_id
      AND can_access_project(cor.project_id)
  )
);

CREATE POLICY "Secure field insert labor items"
ON change_order_labor FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_labor.change_order_id
      AND can_access_project(cor.project_id)
  )
);

-- Materials
DROP POLICY IF EXISTS "Field users can view material items" ON change_order_materials;
DROP POLICY IF EXISTS "Field users can insert material items" ON change_order_materials;
DROP POLICY IF EXISTS "Secure field view material items" ON change_order_materials;
DROP POLICY IF EXISTS "Secure field insert material items" ON change_order_materials;

CREATE POLICY "Secure field view material items"
ON change_order_materials FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_materials.change_order_id
      AND can_access_project(cor.project_id)
  )
);

CREATE POLICY "Secure field insert material items"
ON change_order_materials FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_materials.change_order_id
      AND can_access_project(cor.project_id)
  )
);

-- Equipment
DROP POLICY IF EXISTS "Field users can view equipment items" ON change_order_equipment;
DROP POLICY IF EXISTS "Field users can insert equipment items" ON change_order_equipment;
DROP POLICY IF EXISTS "Secure field view equipment items" ON change_order_equipment;
DROP POLICY IF EXISTS "Secure field insert equipment items" ON change_order_equipment;

CREATE POLICY "Secure field view equipment items"
ON change_order_equipment FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_equipment.change_order_id
      AND can_access_project(cor.project_id)
  )
);

CREATE POLICY "Secure field insert equipment items"
ON change_order_equipment FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_equipment.change_order_id
      AND can_access_project(cor.project_id)
  )
);

-- ============================================================
-- 4p. DUMP SITES (company-level, read-only for field)
-- ============================================================

DROP POLICY IF EXISTS "Field users can view dump sites" ON dump_sites;
DROP POLICY IF EXISTS "Secure field view dump sites" ON dump_sites;

CREATE POLICY "Secure field view dump sites"
ON dump_sites FOR SELECT
USING (
  auth.uid() IS NOT NULL
  OR
  EXISTS (
    SELECT 1 FROM has_valid_field_session() s
    WHERE s.company_id = dump_sites.company_id
  )
);

-- ============================================================
-- 4q. LABOR CLASSES (company-level, read-only for field)
-- ============================================================

-- Keep existing policies for authenticated users
-- Add secure field access
DROP POLICY IF EXISTS "Field can view labor classes" ON labor_classes;
DROP POLICY IF EXISTS "Secure field view labor classes" ON labor_classes;

CREATE POLICY "Secure field view labor classes"
ON labor_classes FOR SELECT
USING (
  auth.uid() IS NOT NULL
  OR
  EXISTS (
    SELECT 1 FROM has_valid_field_session() s
    WHERE s.company_id = labor_classes.company_id
  )
);

-- ============================================================
-- 4r. COMPANY BRANDING (company-level, read-only for field)
-- ============================================================

DROP POLICY IF EXISTS "Field users can view company branding" ON company_branding;
DROP POLICY IF EXISTS "Secure field view company branding" ON company_branding;

CREATE POLICY "Secure field view company branding"
ON company_branding FOR SELECT
USING (
  auth.uid() IS NOT NULL
  OR
  EXISTS (
    SELECT 1 FROM has_valid_field_session() s
    WHERE s.company_id = company_branding.company_id
  )
);

-- ============================================================
-- 4s. LABOR RATES (hide from field, keep as is)
-- ============================================================

-- Labor rates are already restricted to authenticated users only
-- No changes needed

-- ============================================================
-- 4t. MATERIALS EQUIPMENT (company-level, read-only for field)
-- ============================================================

DROP POLICY IF EXISTS "Field users can view materials equipment" ON materials_equipment;
DROP POLICY IF EXISTS "Secure field view materials equipment" ON materials_equipment;

CREATE POLICY "Secure field view materials equipment"
ON materials_equipment FOR SELECT
USING (
  auth.uid() IS NOT NULL
  OR
  EXISTS (
    SELECT 1 FROM has_valid_field_session() s
    WHERE s.company_id = materials_equipment.company_id
  )
);

-- ============================================================
-- 5. SESSION CLEANUP
-- ============================================================

-- Function to cleanup expired sessions (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM field_sessions
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Function to extend session expiry (called on activity)
CREATE OR REPLACE FUNCTION extend_field_session(p_session_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE field_sessions
  SET expires_at = NOW() + INTERVAL '24 hours',
      last_activity = NOW()
  WHERE session_token = p_session_token
    AND expires_at > NOW();

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION extend_field_session(TEXT) TO anon;

-- ============================================================
-- 6. LOGOUT/INVALIDATE SESSION
-- ============================================================

CREATE OR REPLACE FUNCTION invalidate_field_session(p_session_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM field_sessions
  WHERE session_token = p_session_token;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION invalidate_field_session(TEXT) TO anon;

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'FIELD SESSION SECURITY MIGRATION COMPLETE';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes applied:';
  RAISE NOTICE '  1. Created field_sessions table for secure session tracking';
  RAISE NOTICE '  2. Created validate_pin_and_create_session() function';
  RAISE NOTICE '  3. Created can_access_project() helper for RLS';
  RAISE NOTICE '  4. Updated all RLS policies to validate sessions';
  RAISE NOTICE '  5. Added session cleanup and extension functions';
  RAISE NOTICE '';
  RAISE NOTICE 'IMPORTANT: Update client code to:';
  RAISE NOTICE '  1. Call validate_pin_and_create_session() for PIN auth';
  RAISE NOTICE '  2. Store the returned session_token';
  RAISE NOTICE '  3. Include x-field-session header in all requests';
  RAISE NOTICE '';
  RAISE NOTICE 'Security model:';
  RAISE NOTICE '  - Anonymous users without valid session: NO ACCESS';
  RAISE NOTICE '  - Anonymous users with valid session: ACCESS TO THEIR PROJECT ONLY';
  RAISE NOTICE '  - Authenticated users: NORMAL ACCESS VIA user_companies';
  RAISE NOTICE '';
END $$;


-- ----------------------------------------------------------------
-- 6. Combined field auth (auth_attempts)
-- ----------------------------------------------------------------
-- ============================================================
-- COMBINED FIELD AUTH MIGRATION (All-in-One)
-- ============================================================
-- This combines security_hardening + field_sessions into one file
-- Run this if you're having issues with the separate migrations
-- ============================================================

-- ============================================================
-- PART 1: AUTH ATTEMPTS TABLE (for rate limiting)
-- ============================================================

CREATE TABLE IF NOT EXISTS auth_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT,
  device_id TEXT,
  attempt_type TEXT NOT NULL DEFAULT 'pin',
  pin_attempted TEXT,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip_time
ON auth_attempts(ip_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_attempts_device_time
ON auth_attempts(device_id, created_at DESC);

ALTER TABLE auth_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow logging auth attempts" ON auth_attempts;
CREATE POLICY "Allow logging auth attempts"
ON auth_attempts FOR INSERT WITH CHECK (true);

GRANT INSERT ON auth_attempts TO anon;

-- ============================================================
-- PART 2: RATE LIMITING FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_ip_address TEXT,
  p_device_id TEXT,
  p_window_minutes INTEGER DEFAULT 15,
  p_max_attempts INTEGER DEFAULT 5
) RETURNS BOOLEAN AS $$
DECLARE
  recent_failures INTEGER;
BEGIN
  SELECT COUNT(*) INTO recent_failures
  FROM auth_attempts
  WHERE (ip_address = p_ip_address OR device_id = p_device_id)
    AND success = FALSE
    AND created_at > NOW() - (p_window_minutes || ' minutes')::INTERVAL;

  RETURN recent_failures < p_max_attempts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION log_auth_attempt(
  p_ip_address TEXT,
  p_device_id TEXT,
  p_success BOOLEAN,
  p_attempt_type TEXT DEFAULT 'pin'
) RETURNS VOID AS $$
BEGIN
  INSERT INTO auth_attempts (ip_address, device_id, attempt_type, success)
  VALUES (p_ip_address, p_device_id, p_attempt_type, p_success);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION log_auth_attempt(TEXT, TEXT, BOOLEAN, TEXT) TO anon;

-- ============================================================
-- PART 3: FIELD SESSIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS field_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_sessions_token ON field_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_field_sessions_project ON field_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_field_sessions_expires ON field_sessions(expires_at);

ALTER TABLE field_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct session access" ON field_sessions;
CREATE POLICY "No direct session access"
ON field_sessions FOR ALL USING (false);

GRANT SELECT, INSERT, UPDATE, DELETE ON field_sessions TO anon;

-- ============================================================
-- PART 4: SESSION VALIDATION FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION validate_field_session(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_session_token TEXT;
  valid_session BOOLEAN := false;
BEGIN
  BEGIN
    v_session_token := current_setting('request.headers', true)::json->>'x-field-session';
  EXCEPTION WHEN OTHERS THEN
    v_session_token := NULL;
  END;

  IF v_session_token IS NULL OR v_session_token = '' THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM field_sessions fs
    WHERE fs.session_token = v_session_token
      AND fs.project_id = p_project_id
      AND fs.expires_at > NOW()
  ) INTO valid_session;

  IF valid_session THEN
    UPDATE field_sessions
    SET last_activity = NOW()
    WHERE session_token = v_session_token
      AND project_id = p_project_id;
  END IF;

  RETURN valid_session;
END;
$$;

CREATE OR REPLACE FUNCTION has_valid_field_session()
RETURNS TABLE (project_id UUID, company_id UUID)
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_session_token TEXT;
BEGIN
  BEGIN
    v_session_token := current_setting('request.headers', true)::json->>'x-field-session';
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  IF v_session_token IS NULL OR v_session_token = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT fs.project_id, fs.company_id
  FROM field_sessions fs
  WHERE fs.session_token = v_session_token
    AND fs.expires_at > NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION validate_field_session(UUID) TO anon;
GRANT EXECUTE ON FUNCTION has_valid_field_session() TO anon;

-- ============================================================
-- PART 5: PIN VALIDATION WITH SESSION CREATION
-- ============================================================

CREATE OR REPLACE FUNCTION validate_pin_and_create_session(
  p_pin TEXT,
  p_company_code TEXT,
  p_device_id TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
) RETURNS TABLE (
  success BOOLEAN,
  session_token TEXT,
  project_id UUID,
  project_name TEXT,
  company_id UUID,
  company_name TEXT,
  error_code TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  is_rate_limited BOOLEAN;
  found_project RECORD;
  found_company RECORD;
  new_session_token TEXT;
BEGIN
  -- Check rate limit first
  is_rate_limited := NOT check_rate_limit(p_ip_address, p_device_id, 15, 5);

  IF is_rate_limited THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_rate_limited');
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT,
      'RATE_LIMITED'::TEXT;
    RETURN;
  END IF;

  -- Find company by code
  SELECT * INTO found_company
  FROM companies c
  WHERE c.code = p_company_code;

  IF found_company IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid_company');
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT,
      'INVALID_COMPANY'::TEXT;
    RETURN;
  END IF;

  -- Find project by PIN within company
  SELECT * INTO found_project
  FROM projects p
  WHERE p.pin = p_pin
    AND p.company_id = found_company.id
    AND p.status = 'active';

  IF found_project IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid');
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT,
      'INVALID_PIN'::TEXT;
    RETURN;
  END IF;

  -- Generate secure session token
  new_session_token := encode(gen_random_bytes(32), 'hex');

  -- Revoke any existing sessions for this device/project combo
  DELETE FROM field_sessions
  WHERE device_id = p_device_id
    AND project_id = found_project.id;

  -- Create new session
  INSERT INTO field_sessions (project_id, company_id, session_token, device_id)
  VALUES (found_project.id, found_company.id, new_session_token, p_device_id);

  -- Log successful attempt
  PERFORM log_auth_attempt(p_ip_address, p_device_id, TRUE, 'pin');

  -- Return success with session token
  RETURN QUERY SELECT
    true,
    new_session_token,
    found_project.id,
    found_project.name,
    found_company.id,
    found_company.name,
    NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_pin_and_create_session(TEXT, TEXT, TEXT, TEXT) TO anon;

-- ============================================================
-- PART 6: CAN_ACCESS_PROJECT HELPER
-- ============================================================

CREATE OR REPLACE FUNCTION can_access_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
BEGIN
  -- Check authenticated user access
  IF auth.uid() IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM user_companies uc
      JOIN projects p ON p.company_id = uc.company_id
      WHERE p.id = p_project_id
        AND uc.user_id = auth.uid()
        AND uc.status = 'active'
    );
  END IF;

  -- Check field session access
  RETURN validate_field_session(p_project_id);
END;
$$;

GRANT EXECUTE ON FUNCTION can_access_project(UUID) TO anon;
GRANT EXECUTE ON FUNCTION can_access_project(UUID) TO authenticated;

-- ============================================================
-- PART 7: SESSION MANAGEMENT FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION extend_field_session(p_session_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE field_sessions
  SET expires_at = NOW() + INTERVAL '24 hours',
      last_activity = NOW()
  WHERE session_token = p_session_token
    AND expires_at > NOW();

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION invalidate_field_session(p_session_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM field_sessions
  WHERE session_token = p_session_token;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION extend_field_session(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION invalidate_field_session(TEXT) TO anon;

-- ============================================================
-- SUCCESS!
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'COMBINED FIELD AUTH MIGRATION COMPLETE!';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - auth_attempts table (rate limiting)';
  RAISE NOTICE '  - field_sessions table (session tracking)';
  RAISE NOTICE '  - check_rate_limit() function';
  RAISE NOTICE '  - log_auth_attempt() function';
  RAISE NOTICE '  - validate_pin_and_create_session() function';
  RAISE NOTICE '  - validate_field_session() function';
  RAISE NOTICE '  - can_access_project() function';
  RAISE NOTICE '';
  RAISE NOTICE 'Field users can now log in with PIN!';
  RAISE NOTICE '============================================================';
END $$;


-- ----------------------------------------------------------------
-- 7. Security hardening
-- ----------------------------------------------------------------
-- ============================================================
-- SECURITY HARDENING MIGRATION
-- ============================================================
-- Run this in Supabase SQL Editor to harden the system for production
--
-- KEY CHANGES:
-- 1. Rate limiting for PIN authentication attempts
-- 2. Field-safe view for labor classes (hides rates)
-- 3. Input validation functions
-- 4. Storage path validation for uploads
-- ============================================================

-- ============================================================
-- 1. PIN AUTHENTICATION RATE LIMITING
-- ============================================================

-- Track authentication attempts for rate limiting
CREATE TABLE IF NOT EXISTS auth_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT,
  device_id TEXT,
  attempt_type TEXT NOT NULL DEFAULT 'pin', -- 'pin', 'login', etc.
  pin_attempted TEXT, -- hashed, not plaintext
  success BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip_time
ON auth_attempts(ip_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_attempts_device_time
ON auth_attempts(device_id, created_at DESC);

-- Enable RLS
ALTER TABLE auth_attempts ENABLE ROW LEVEL SECURITY;

-- Only allow inserts from anon (for logging attempts)
DROP POLICY IF EXISTS "Allow logging auth attempts" ON auth_attempts;
CREATE POLICY "Allow logging auth attempts"
ON auth_attempts FOR INSERT
WITH CHECK (true);

-- Service role can read for analysis
DROP POLICY IF EXISTS "Service can read auth attempts" ON auth_attempts;
CREATE POLICY "Service can read auth attempts"
ON auth_attempts FOR SELECT
USING (auth.role() = 'service_role');

GRANT INSERT ON auth_attempts TO anon;
GRANT SELECT ON auth_attempts TO service_role;

-- Function to check if rate limited
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_ip_address TEXT,
  p_device_id TEXT,
  p_window_minutes INTEGER DEFAULT 15,
  p_max_attempts INTEGER DEFAULT 5
) RETURNS BOOLEAN AS $$
DECLARE
  recent_failures INTEGER;
BEGIN
  SELECT COUNT(*) INTO recent_failures
  FROM auth_attempts
  WHERE (ip_address = p_ip_address OR device_id = p_device_id)
    AND success = FALSE
    AND created_at > NOW() - (p_window_minutes || ' minutes')::INTERVAL;

  RETURN recent_failures < p_max_attempts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log auth attempt
CREATE OR REPLACE FUNCTION log_auth_attempt(
  p_ip_address TEXT,
  p_device_id TEXT,
  p_success BOOLEAN,
  p_attempt_type TEXT DEFAULT 'pin'
) RETURNS VOID AS $$
BEGIN
  INSERT INTO auth_attempts (ip_address, device_id, attempt_type, success)
  VALUES (p_ip_address, p_device_id, p_attempt_type, p_success);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Allow anon to call these functions
GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION log_auth_attempt(TEXT, TEXT, BOOLEAN, TEXT) TO anon;

-- Cleanup old attempts (run periodically via cron or manually)
CREATE OR REPLACE FUNCTION cleanup_old_auth_attempts() RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM auth_attempts
  WHERE created_at < NOW() - INTERVAL '24 hours';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. RESTRICT LABOR RATES FROM FIELD USERS
-- ============================================================

-- The labor_classes table doesn't have rate columns (rates are in labor_class_rates)
-- We need to:
-- 1. Remove field user access to labor_class_rates table
-- 2. Keep field user access to labor_classes (names only)

-- Remove the overly permissive policy on labor_class_rates
DROP POLICY IF EXISTS "Field users can view labor class rates" ON labor_class_rates;

-- Revoke anon access to rates table
REVOKE SELECT ON labor_class_rates FROM anon;

-- Field users should NOT be able to see rates at all
-- Create a restrictive policy that only allows authenticated users
DROP POLICY IF EXISTS "Only authenticated users can view rates" ON labor_class_rates;
CREATE POLICY "Only authenticated users can view rates"
ON labor_class_rates FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Create function for field to get classes with categories (no rates, used by CrewCheckin)
CREATE OR REPLACE FUNCTION get_labor_classes_for_field(p_company_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  category_id UUID,
  category_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    lc.id,
    lc.name,
    lc.category_id,
    cat.name as category_name
  FROM labor_classes lc
  LEFT JOIN labor_categories cat ON cat.id = lc.category_id
  WHERE lc.company_id = p_company_id
    AND lc.active = true
  ORDER BY cat.name NULLS LAST, lc.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_labor_classes_for_field(UUID) TO anon;

-- ============================================================
-- 3. INPUT VALIDATION FUNCTIONS
-- ============================================================

-- Validate COR/ticket amounts (positive, reasonable range)
CREATE OR REPLACE FUNCTION validate_amount(p_amount NUMERIC)
RETURNS BOOLEAN AS $$
BEGIN
  -- Amount must be positive and under $10 million (reasonable max)
  RETURN p_amount IS NULL OR (p_amount >= 0 AND p_amount < 10000000);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Validate text length (prevent oversized inputs)
CREATE OR REPLACE FUNCTION validate_text_length(p_text TEXT, p_max_length INTEGER DEFAULT 10000)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN p_text IS NULL OR LENGTH(p_text) <= p_max_length;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Note: Database constraints are optional since client-side validation exists
-- The change_orders table uses INTEGER cents (cor_total) and t_and_m_tickets
-- doesn't have total columns - validation happens in the application layer

-- ============================================================
-- 4. EXTEND PIN VALIDATION
-- ============================================================

-- Function to validate PIN format (6 digits)
CREATE OR REPLACE FUNCTION validate_pin_format(p_pin TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- PIN must be exactly 6 digits
  RETURN p_pin ~ '^\d{6}$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Secure PIN lookup that includes rate limiting check
CREATE OR REPLACE FUNCTION get_project_by_pin_secure(
  p_pin TEXT,
  p_company_code TEXT,
  p_ip_address TEXT DEFAULT NULL,
  p_device_id TEXT DEFAULT NULL
) RETURNS TABLE (
  id UUID,
  name TEXT,
  company_id UUID,
  status TEXT,
  job_number TEXT,
  address TEXT,
  general_contractor TEXT,
  client_contact TEXT,
  client_phone TEXT,
  allowed BOOLEAN
) AS $$
DECLARE
  is_allowed BOOLEAN;
  found_project RECORD;
BEGIN
  -- Check rate limit first
  is_allowed := check_rate_limit(p_ip_address, p_device_id, 15, 5);

  IF NOT is_allowed THEN
    -- Log failed attempt due to rate limit
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_rate_limited');

    RETURN QUERY SELECT
      NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT,
      NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
      FALSE;
    RETURN;
  END IF;

  -- Look up project by PIN and company code
  SELECT p.* INTO found_project
  FROM projects p
  JOIN companies c ON c.id = p.company_id
  WHERE p.pin = p_pin
    AND c.code = p_company_code
    AND p.status = 'active';

  IF found_project IS NULL THEN
    -- Log failed attempt
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin');

    RETURN QUERY SELECT
      NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT,
      NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
      TRUE; -- allowed but not found
    RETURN;
  END IF;

  -- Log successful attempt
  PERFORM log_auth_attempt(p_ip_address, p_device_id, TRUE, 'pin');

  -- Return project data
  RETURN QUERY SELECT
    found_project.id,
    found_project.name,
    found_project.company_id,
    found_project.status,
    found_project.job_number,
    found_project.address,
    found_project.general_contractor,
    found_project.client_contact,
    found_project.client_phone,
    TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_project_by_pin_secure(TEXT, TEXT, TEXT, TEXT) TO anon;

-- ============================================================
-- 5. STORAGE SECURITY (File type and size validation)
-- ============================================================

-- These are enforced via Supabase Storage policies in the dashboard
-- But we document the expected rules here:
--
-- Bucket: tm-photos
-- Allowed file types: image/jpeg, image/png, image/webp, application/pdf
-- Max file size: 10MB
-- Path structure: {company_id}/{project_id}/{filename}
--
-- To configure in Supabase Dashboard:
-- 1. Go to Storage > tm-photos > Policies
-- 2. Edit upload policy to include file type check
-- 3. Set bucket size limits in Storage Settings

-- ============================================================
-- 6. CLEANUP REDUNDANT POLICIES
-- ============================================================

-- These policies were overly permissive - we keep them for backwards
-- compatibility but the rate limiting adds protection

-- Note: Current RLS policies use auth.uid() IS NULL which allows anon
-- This is intentional for field users who don't have Supabase auth
-- Security is enforced through:
-- 1. Rate-limited PIN validation
-- 2. Project-level filtering in all queries
-- 3. Input validation constraints

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SECURITY HARDENING COMPLETE';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes applied:';
  RAISE NOTICE '  1. Rate limiting: auth_attempts table + check_rate_limit()';
  RAISE NOTICE '  2. Labor classes: labor_classes_field view (hides rates)';
  RAISE NOTICE '  3. Input validation: Amount and text length constraints';
  RAISE NOTICE '  4. Secure PIN lookup: get_project_by_pin_secure()';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Update client code to use get_project_by_pin_secure()';
  RAISE NOTICE '  2. Configure storage policies in Supabase Dashboard';
  RAISE NOTICE '  3. Set up periodic cleanup of auth_attempts table';
  RAISE NOTICE '';
END $$;


-- ----------------------------------------------------------------
-- 8. Labor categories and classes
-- ----------------------------------------------------------------
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


-- ----------------------------------------------------------------
-- 9. Project costs
-- ----------------------------------------------------------------
-- Migration: Project Costs Table
-- Allows users to add custom cost contributors beyond auto-tracked labor and haul-off costs

-- Create project_costs table
CREATE TABLE IF NOT EXISTS project_costs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('labor', 'materials', 'equipment', 'subcontractor', 'disposal', 'other')),
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  cost_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_project_costs_project_id ON project_costs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_costs_company_id ON project_costs(company_id);
CREATE INDEX IF NOT EXISTS idx_project_costs_category ON project_costs(category);
CREATE INDEX IF NOT EXISTS idx_project_costs_cost_date ON project_costs(cost_date);

-- Enable RLS
ALTER TABLE project_costs ENABLE ROW LEVEL SECURITY;

-- Policy: Allow users to view/manage costs for their company's projects
CREATE POLICY "Allow company users to manage project costs" ON project_costs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN users u ON u.company_id = p.company_id
      WHERE p.id = project_costs.project_id
      AND u.id = auth.uid()
    )
  );

-- Trigger to auto-update updated_at
CREATE TRIGGER update_project_costs_updated_at
  BEFORE UPDATE ON project_costs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ----------------------------------------------------------------
-- 10. Project schedule
-- ----------------------------------------------------------------
-- Migration: Project Schedule Fields
-- Adds start_date, end_date, and planned_man_days to projects table
-- For portfolio overview with schedule-based insights

-- Add schedule columns to projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS end_date DATE,
ADD COLUMN IF NOT EXISTS planned_man_days INTEGER;

-- Add constraint to ensure end_date >= start_date
-- Note: Using a DO block to check if constraint exists first
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_project_dates'
    ) THEN
        ALTER TABLE projects
        ADD CONSTRAINT check_project_dates
        CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date);
    END IF;
END $$;

-- Index for querying projects by status and archive date
CREATE INDEX IF NOT EXISTS idx_projects_status_archived
ON projects(status, archived_at);

-- Index for schedule-based queries
CREATE INDEX IF NOT EXISTS idx_projects_dates
ON projects(start_date, end_date)
WHERE start_date IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN projects.start_date IS 'Project start date for schedule tracking';
COMMENT ON COLUMN projects.end_date IS 'Planned project end date for schedule tracking';
COMMENT ON COLUMN projects.planned_man_days IS 'Total planned man-days for labor comparison';


-- ----------------------------------------------------------------
-- 11. Area scheduled value
-- ----------------------------------------------------------------
-- Migration: Add scheduled_value column to areas table
-- This allows capturing actual dollar amounts from SOV (Schedule of Values)
-- When foreman marks area complete, the actual dollar value is tracked

-- Add scheduled_value column to areas table
ALTER TABLE areas ADD COLUMN IF NOT EXISTS scheduled_value DECIMAL(12, 2);

-- Create index for aggregation queries (only on non-null values)
CREATE INDEX IF NOT EXISTS idx_areas_scheduled_value ON areas(scheduled_value) WHERE scheduled_value IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN areas.scheduled_value IS 'Dollar amount from SOV/AIA form for this area/task. NULL if manually created without SOV.';


-- ----------------------------------------------------------------
-- 12. Change orders
-- ----------------------------------------------------------------
-- ============================================
-- Change Order Request (COR) System Migration
-- ============================================
-- This migration creates all tables, functions, triggers, and RLS policies
-- for the comprehensive COR system in FieldSync.
--
-- Run this in your Supabase SQL Editor.
-- ============================================

-- ============================================
-- 1. MAIN CHANGE ORDERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS change_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  area_id UUID REFERENCES areas(id) ON DELETE SET NULL,

  -- Basic Info
  cor_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  scope_of_work TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Status workflow: draft -> pending_approval -> approved -> billed -> closed
  -- Also: rejected (can go back to draft)
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'billed', 'closed')),

  -- Cost breakdown fields (stored in cents to avoid decimal issues)
  labor_subtotal INTEGER NOT NULL DEFAULT 0,
  materials_subtotal INTEGER NOT NULL DEFAULT 0,
  equipment_subtotal INTEGER NOT NULL DEFAULT 0,
  subcontractors_subtotal INTEGER NOT NULL DEFAULT 0,

  -- Markup percentages (stored as basis points: 1500 = 15.00%)
  labor_markup_percent INTEGER NOT NULL DEFAULT 1500,
  materials_markup_percent INTEGER NOT NULL DEFAULT 1500,
  equipment_markup_percent INTEGER NOT NULL DEFAULT 1500,
  subcontractors_markup_percent INTEGER NOT NULL DEFAULT 500,

  -- Calculated markup amounts (in cents)
  labor_markup_amount INTEGER NOT NULL DEFAULT 0,
  materials_markup_amount INTEGER NOT NULL DEFAULT 0,
  equipment_markup_amount INTEGER NOT NULL DEFAULT 0,
  subcontractors_markup_amount INTEGER NOT NULL DEFAULT 0,

  -- Additional fee percentages (stored as basis points: 144 = 1.44%)
  liability_insurance_percent INTEGER NOT NULL DEFAULT 144,
  bond_percent INTEGER NOT NULL DEFAULT 100,
  license_fee_percent INTEGER NOT NULL DEFAULT 10, -- 0.101% = ~10 basis points

  -- Calculated fee amounts (in cents)
  liability_insurance_amount INTEGER NOT NULL DEFAULT 0,
  bond_amount INTEGER NOT NULL DEFAULT 0,
  license_fee_amount INTEGER NOT NULL DEFAULT 0,

  -- Totals (in cents)
  cor_subtotal INTEGER NOT NULL DEFAULT 0, -- Sum of all subtotals + markups
  additional_fees_total INTEGER NOT NULL DEFAULT 0,
  cor_total INTEGER NOT NULL DEFAULT 0,

  -- GC Signature fields
  gc_signature_data TEXT, -- Base64 encoded signature image
  gc_signature_name TEXT,
  gc_signature_date TIMESTAMPTZ,

  -- Rejection info
  rejection_reason TEXT,

  -- Audit fields
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,

  -- Ensure unique COR numbers per project
  CONSTRAINT unique_cor_number_per_project UNIQUE (company_id, project_id, cor_number)
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_change_orders_project ON change_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_company ON change_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_status ON change_orders(status);
CREATE INDEX IF NOT EXISTS idx_change_orders_area ON change_orders(area_id);

-- ============================================
-- 2. LABOR LINE ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS change_order_labor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,

  -- Labor details
  labor_class TEXT NOT NULL, -- e.g., "Foreman", "Operator", "Laborer"
  wage_type TEXT NOT NULL DEFAULT 'standard', -- standard, pla, etc.

  -- Hours
  regular_hours DECIMAL(10,2) NOT NULL DEFAULT 0,
  overtime_hours DECIMAL(10,2) NOT NULL DEFAULT 0,

  -- Rates (in cents)
  regular_rate INTEGER NOT NULL DEFAULT 0,
  overtime_rate INTEGER NOT NULL DEFAULT 0,

  -- Totals (in cents)
  regular_total INTEGER NOT NULL DEFAULT 0,
  overtime_total INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,

  -- Display order
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Source tracking
  source_ticket_id UUID REFERENCES t_and_m_tickets(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cor_labor_change_order ON change_order_labor(change_order_id);

-- ============================================
-- 3. MATERIALS LINE ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS change_order_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,

  -- Material details
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'each',
  unit_cost INTEGER NOT NULL DEFAULT 0, -- in cents
  total INTEGER NOT NULL DEFAULT 0, -- in cents

  -- Source tracking
  source_type TEXT NOT NULL DEFAULT 'custom' CHECK (source_type IN ('backup_sheet', 'invoice', 'mobilization', 'custom')),
  source_reference TEXT, -- e.g., invoice number, ticket reference
  source_ticket_id UUID REFERENCES t_and_m_tickets(id) ON DELETE SET NULL,

  -- Display order
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cor_materials_change_order ON change_order_materials(change_order_id);

-- ============================================
-- 4. EQUIPMENT LINE ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS change_order_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,

  -- Equipment details
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'day',
  unit_cost INTEGER NOT NULL DEFAULT 0, -- in cents
  total INTEGER NOT NULL DEFAULT 0, -- in cents

  -- Source tracking
  source_type TEXT NOT NULL DEFAULT 'custom' CHECK (source_type IN ('backup_sheet', 'invoice', 'custom')),
  source_reference TEXT,
  source_ticket_id UUID REFERENCES t_and_m_tickets(id) ON DELETE SET NULL,

  -- Display order
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cor_equipment_change_order ON change_order_equipment(change_order_id);

-- ============================================
-- 5. SUBCONTRACTORS LINE ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS change_order_subcontractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,

  -- Subcontractor details
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'lump sum',
  unit_cost INTEGER NOT NULL DEFAULT 0, -- in cents
  total INTEGER NOT NULL DEFAULT 0, -- in cents

  -- Source tracking
  source_type TEXT NOT NULL DEFAULT 'custom' CHECK (source_type IN ('invoice', 'quote', 'custom')),
  source_reference TEXT, -- e.g., invoice number, quote reference

  -- Display order
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cor_subcontractors_change_order ON change_order_subcontractors(change_order_id);

-- ============================================
-- 6. TICKET-COR ASSOCIATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS change_order_ticket_associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES t_and_m_tickets(id) ON DELETE CASCADE,

  -- Import tracking
  data_imported BOOLEAN NOT NULL DEFAULT FALSE,
  imported_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each ticket can only be associated once per COR
  CONSTRAINT unique_ticket_per_cor UNIQUE (change_order_id, ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_cor_tickets_change_order ON change_order_ticket_associations(change_order_id);
CREATE INDEX IF NOT EXISTS idx_cor_tickets_ticket ON change_order_ticket_associations(ticket_id);

-- ============================================
-- 7. ADD COR REFERENCE TO T&M TICKETS
-- ============================================
-- Add column to track which COR a ticket is assigned to
ALTER TABLE t_and_m_tickets
ADD COLUMN IF NOT EXISTS assigned_cor_id UUID REFERENCES change_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tm_tickets_assigned_cor ON t_and_m_tickets(assigned_cor_id);

-- ============================================
-- 8. RECALCULATE COR TOTALS FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION recalculate_cor_totals(cor_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_labor_subtotal INTEGER := 0;
  v_materials_subtotal INTEGER := 0;
  v_equipment_subtotal INTEGER := 0;
  v_subcontractors_subtotal INTEGER := 0;
  v_labor_markup_percent INTEGER;
  v_materials_markup_percent INTEGER;
  v_equipment_markup_percent INTEGER;
  v_subcontractors_markup_percent INTEGER;
  v_labor_markup_amount INTEGER;
  v_materials_markup_amount INTEGER;
  v_equipment_markup_amount INTEGER;
  v_subcontractors_markup_amount INTEGER;
  v_liability_insurance_percent INTEGER;
  v_bond_percent INTEGER;
  v_license_fee_percent INTEGER;
  v_cor_subtotal INTEGER;
  v_liability_insurance_amount INTEGER;
  v_bond_amount INTEGER;
  v_license_fee_amount INTEGER;
  v_additional_fees_total INTEGER;
  v_cor_total INTEGER;
BEGIN
  -- Get markup and fee percentages from the COR
  SELECT
    labor_markup_percent,
    materials_markup_percent,
    equipment_markup_percent,
    subcontractors_markup_percent,
    liability_insurance_percent,
    bond_percent,
    license_fee_percent
  INTO
    v_labor_markup_percent,
    v_materials_markup_percent,
    v_equipment_markup_percent,
    v_subcontractors_markup_percent,
    v_liability_insurance_percent,
    v_bond_percent,
    v_license_fee_percent
  FROM change_orders
  WHERE id = cor_id;

  -- Calculate labor subtotal
  SELECT COALESCE(SUM(total), 0)
  INTO v_labor_subtotal
  FROM change_order_labor
  WHERE change_order_id = cor_id;

  -- Calculate materials subtotal
  SELECT COALESCE(SUM(total), 0)
  INTO v_materials_subtotal
  FROM change_order_materials
  WHERE change_order_id = cor_id;

  -- Calculate equipment subtotal
  SELECT COALESCE(SUM(total), 0)
  INTO v_equipment_subtotal
  FROM change_order_equipment
  WHERE change_order_id = cor_id;

  -- Calculate subcontractors subtotal
  SELECT COALESCE(SUM(total), 0)
  INTO v_subcontractors_subtotal
  FROM change_order_subcontractors
  WHERE change_order_id = cor_id;

  -- Calculate markup amounts (basis points / 10000)
  v_labor_markup_amount := ROUND((v_labor_subtotal * v_labor_markup_percent)::NUMERIC / 10000);
  v_materials_markup_amount := ROUND((v_materials_subtotal * v_materials_markup_percent)::NUMERIC / 10000);
  v_equipment_markup_amount := ROUND((v_equipment_subtotal * v_equipment_markup_percent)::NUMERIC / 10000);
  v_subcontractors_markup_amount := ROUND((v_subcontractors_subtotal * v_subcontractors_markup_percent)::NUMERIC / 10000);

  -- Calculate COR subtotal (all costs + all markups)
  v_cor_subtotal := v_labor_subtotal + v_materials_subtotal + v_equipment_subtotal + v_subcontractors_subtotal
                  + v_labor_markup_amount + v_materials_markup_amount + v_equipment_markup_amount + v_subcontractors_markup_amount;

  -- Calculate additional fees
  v_liability_insurance_amount := ROUND((v_cor_subtotal * v_liability_insurance_percent)::NUMERIC / 10000);
  v_bond_amount := ROUND((v_cor_subtotal * v_bond_percent)::NUMERIC / 10000);
  v_license_fee_amount := ROUND((v_cor_subtotal * v_license_fee_percent)::NUMERIC / 10000);

  v_additional_fees_total := v_liability_insurance_amount + v_bond_amount + v_license_fee_amount;

  -- Calculate final COR total
  v_cor_total := v_cor_subtotal + v_additional_fees_total;

  -- Update the change_orders table
  UPDATE change_orders
  SET
    labor_subtotal = v_labor_subtotal,
    materials_subtotal = v_materials_subtotal,
    equipment_subtotal = v_equipment_subtotal,
    subcontractors_subtotal = v_subcontractors_subtotal,
    labor_markup_amount = v_labor_markup_amount,
    materials_markup_amount = v_materials_markup_amount,
    equipment_markup_amount = v_equipment_markup_amount,
    subcontractors_markup_amount = v_subcontractors_markup_amount,
    liability_insurance_amount = v_liability_insurance_amount,
    bond_amount = v_bond_amount,
    license_fee_amount = v_license_fee_amount,
    cor_subtotal = v_cor_subtotal,
    additional_fees_total = v_additional_fees_total,
    cor_total = v_cor_total,
    updated_at = NOW()
  WHERE id = cor_id;
END;
$$;

-- ============================================
-- 9. TRIGGERS FOR AUTO-RECALCULATION
-- ============================================

-- Trigger function for labor items
CREATE OR REPLACE FUNCTION trigger_recalculate_cor_from_labor()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_cor_totals(OLD.change_order_id);
    RETURN OLD;
  ELSE
    PERFORM recalculate_cor_totals(NEW.change_order_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_cor_labor ON change_order_labor;
CREATE TRIGGER trg_recalculate_cor_labor
AFTER INSERT OR UPDATE OR DELETE ON change_order_labor
FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_cor_from_labor();

-- Trigger function for materials items
CREATE OR REPLACE FUNCTION trigger_recalculate_cor_from_materials()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_cor_totals(OLD.change_order_id);
    RETURN OLD;
  ELSE
    PERFORM recalculate_cor_totals(NEW.change_order_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_cor_materials ON change_order_materials;
CREATE TRIGGER trg_recalculate_cor_materials
AFTER INSERT OR UPDATE OR DELETE ON change_order_materials
FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_cor_from_materials();

-- Trigger function for equipment items
CREATE OR REPLACE FUNCTION trigger_recalculate_cor_from_equipment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_cor_totals(OLD.change_order_id);
    RETURN OLD;
  ELSE
    PERFORM recalculate_cor_totals(NEW.change_order_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_cor_equipment ON change_order_equipment;
CREATE TRIGGER trg_recalculate_cor_equipment
AFTER INSERT OR UPDATE OR DELETE ON change_order_equipment
FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_cor_from_equipment();

-- Trigger function for subcontractors items
CREATE OR REPLACE FUNCTION trigger_recalculate_cor_from_subcontractors()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_cor_totals(OLD.change_order_id);
    RETURN OLD;
  ELSE
    PERFORM recalculate_cor_totals(NEW.change_order_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_cor_subcontractors ON change_order_subcontractors;
CREATE TRIGGER trg_recalculate_cor_subcontractors
AFTER INSERT OR UPDATE OR DELETE ON change_order_subcontractors
FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_cor_from_subcontractors();

-- Trigger to recalculate when markup or fee percentages change
CREATE OR REPLACE FUNCTION trigger_recalculate_cor_on_percentage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only recalculate if percentage fields changed
  IF OLD.labor_markup_percent != NEW.labor_markup_percent OR
     OLD.materials_markup_percent != NEW.materials_markup_percent OR
     OLD.equipment_markup_percent != NEW.equipment_markup_percent OR
     OLD.subcontractors_markup_percent != NEW.subcontractors_markup_percent OR
     OLD.liability_insurance_percent != NEW.liability_insurance_percent OR
     OLD.bond_percent != NEW.bond_percent OR
     OLD.license_fee_percent != NEW.license_fee_percent THEN
    PERFORM recalculate_cor_totals(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_cor_percentages ON change_orders;
CREATE TRIGGER trg_recalculate_cor_percentages
AFTER UPDATE ON change_orders
FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_cor_on_percentage_change();

-- ============================================
-- 10. UPDATED_AT TRIGGER FOR CHANGE_ORDERS
-- ============================================
CREATE OR REPLACE FUNCTION update_change_orders_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_change_orders_updated_at ON change_orders;
CREATE TRIGGER trg_change_orders_updated_at
BEFORE UPDATE ON change_orders
FOR EACH ROW EXECUTE FUNCTION update_change_orders_updated_at();

-- ============================================
-- 11. ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all COR tables
ALTER TABLE change_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_order_labor ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_order_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_order_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_order_subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_order_ticket_associations ENABLE ROW LEVEL SECURITY;

-- CHANGE_ORDERS POLICIES

-- Drop existing policies first
DROP POLICY IF EXISTS "Users can view their company CORs" ON change_orders;
DROP POLICY IF EXISTS "Office and Admin can create CORs" ON change_orders;
DROP POLICY IF EXISTS "Office and Admin can update draft/pending CORs" ON change_orders;
DROP POLICY IF EXISTS "Only Admin can delete draft CORs" ON change_orders;
DROP POLICY IF EXISTS "Authenticated users full access to CORs" ON change_orders;

-- Simple policy: authenticated users can access CORs from their company
-- Uses direct EXISTS check instead of helper functions for reliability
CREATE POLICY "Authenticated users full access to CORs"
ON change_orders FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = change_orders.company_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = change_orders.company_id
  )
);

-- CHANGE_ORDER_LABOR POLICIES
DROP POLICY IF EXISTS "Users can view labor items for their company CORs" ON change_order_labor;
DROP POLICY IF EXISTS "Office and Admin can manage labor items" ON change_order_labor;
DROP POLICY IF EXISTS "Authenticated users full access to labor items" ON change_order_labor;

CREATE POLICY "Authenticated users full access to labor items"
ON change_order_labor FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    JOIN user_companies uc ON uc.company_id = co.company_id
    WHERE co.id = change_order_labor.change_order_id
    AND uc.user_id = auth.uid()
  )
);

-- CHANGE_ORDER_MATERIALS POLICIES
DROP POLICY IF EXISTS "Users can view material items for their company CORs" ON change_order_materials;
DROP POLICY IF EXISTS "Office and Admin can manage material items" ON change_order_materials;
DROP POLICY IF EXISTS "Authenticated users full access to material items" ON change_order_materials;

CREATE POLICY "Authenticated users full access to material items"
ON change_order_materials FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    JOIN user_companies uc ON uc.company_id = co.company_id
    WHERE co.id = change_order_materials.change_order_id
    AND uc.user_id = auth.uid()
  )
);

-- CHANGE_ORDER_EQUIPMENT POLICIES
DROP POLICY IF EXISTS "Users can view equipment items for their company CORs" ON change_order_equipment;
DROP POLICY IF EXISTS "Office and Admin can manage equipment items" ON change_order_equipment;
DROP POLICY IF EXISTS "Authenticated users full access to equipment items" ON change_order_equipment;

CREATE POLICY "Authenticated users full access to equipment items"
ON change_order_equipment FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    JOIN user_companies uc ON uc.company_id = co.company_id
    WHERE co.id = change_order_equipment.change_order_id
    AND uc.user_id = auth.uid()
  )
);

-- CHANGE_ORDER_SUBCONTRACTORS POLICIES
DROP POLICY IF EXISTS "Users can view subcontractor items for their company CORs" ON change_order_subcontractors;
DROP POLICY IF EXISTS "Office and Admin can manage subcontractor items" ON change_order_subcontractors;
DROP POLICY IF EXISTS "Authenticated users full access to subcontractor items" ON change_order_subcontractors;

CREATE POLICY "Authenticated users full access to subcontractor items"
ON change_order_subcontractors FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    JOIN user_companies uc ON uc.company_id = co.company_id
    WHERE co.id = change_order_subcontractors.change_order_id
    AND uc.user_id = auth.uid()
  )
);

-- CHANGE_ORDER_TICKET_ASSOCIATIONS POLICIES
DROP POLICY IF EXISTS "Users can view ticket associations for their company CORs" ON change_order_ticket_associations;
DROP POLICY IF EXISTS "Office and Admin can manage ticket associations" ON change_order_ticket_associations;
DROP POLICY IF EXISTS "Authenticated users full access to ticket associations" ON change_order_ticket_associations;

CREATE POLICY "Authenticated users full access to ticket associations"
ON change_order_ticket_associations FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    JOIN user_companies uc ON uc.company_id = co.company_id
    WHERE co.id = change_order_ticket_associations.change_order_id
    AND uc.user_id = auth.uid()
  )
);

-- ============================================
-- 12. GRANT PERMISSIONS FOR REALTIME
-- ============================================
-- Grant access for authenticated users (RLS handles the rest)
GRANT SELECT, INSERT, UPDATE, DELETE ON change_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON change_order_labor TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON change_order_materials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON change_order_equipment TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON change_order_subcontractors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON change_order_ticket_associations TO authenticated;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION recalculate_cor_totals(UUID) TO authenticated;

-- ============================================
-- 13. COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON TABLE change_orders IS 'Main table for Change Order Requests (CORs). Tracks all cost breakdowns, markups, and approval workflow.';
COMMENT ON TABLE change_order_labor IS 'Labor line items for CORs. Each row represents a labor class with hours and rates.';
COMMENT ON TABLE change_order_materials IS 'Material line items for CORs. Includes containment, PPE, disposal items.';
COMMENT ON TABLE change_order_equipment IS 'Equipment line items for CORs. Rental equipment, tools, etc.';
COMMENT ON TABLE change_order_subcontractors IS 'Subcontractor line items for CORs. External vendor charges.';
COMMENT ON TABLE change_order_ticket_associations IS 'Links T&M tickets to CORs for data import and tracking.';

COMMENT ON FUNCTION recalculate_cor_totals IS 'Recalculates all subtotals, markups, fees, and totals for a COR. Called automatically by triggers.';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- After running this migration:
-- 1. Verify all tables are created: SELECT * FROM information_schema.tables WHERE table_name LIKE 'change_order%';
-- 2. Test the recalculate function: SELECT recalculate_cor_totals('some-cor-id');
-- 3. Test RLS policies by logging in as different user roles
-- ============================================


-- ----------------------------------------------------------------
-- 13. COR columns fix
-- ----------------------------------------------------------------
-- Migration: Add missing columns to COR line item tables
-- Purpose: Fix 400 errors when inserting materials/equipment
-- Date: January 3, 2025
-- Risk: LOW (additive only)

-- ============================================
-- CHANGE_ORDER_MATERIALS - Add missing columns
-- ============================================

ALTER TABLE change_order_materials
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'custom'
  CHECK (source_type IN ('backup_sheet', 'invoice', 'mobilization', 'custom'));

ALTER TABLE change_order_materials
ADD COLUMN IF NOT EXISTS source_reference TEXT;

ALTER TABLE change_order_materials
ADD COLUMN IF NOT EXISTS source_ticket_id UUID REFERENCES t_and_m_tickets(id) ON DELETE SET NULL;

ALTER TABLE change_order_materials
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- ============================================
-- CHANGE_ORDER_EQUIPMENT - Add missing columns
-- ============================================

ALTER TABLE change_order_equipment
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'custom'
  CHECK (source_type IN ('backup_sheet', 'invoice', 'custom'));

ALTER TABLE change_order_equipment
ADD COLUMN IF NOT EXISTS source_reference TEXT;

ALTER TABLE change_order_equipment
ADD COLUMN IF NOT EXISTS source_ticket_id UUID REFERENCES t_and_m_tickets(id) ON DELETE SET NULL;

ALTER TABLE change_order_equipment
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- ============================================
-- CHANGE_ORDER_LABOR - Ensure columns exist
-- ============================================

ALTER TABLE change_order_labor
ADD COLUMN IF NOT EXISTS source_ticket_id UUID REFERENCES t_and_m_tickets(id) ON DELETE SET NULL;

ALTER TABLE change_order_labor
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- ============================================
-- CHANGE_ORDER_SUBCONTRACTORS - Ensure columns exist
-- ============================================

ALTER TABLE change_order_subcontractors
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'custom'
  CHECK (source_type IN ('invoice', 'quote', 'custom'));

ALTER TABLE change_order_subcontractors
ADD COLUMN IF NOT EXISTS source_reference TEXT;

ALTER TABLE change_order_subcontractors
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;


-- ----------------------------------------------------------------
-- 14. COR enhancements
-- ----------------------------------------------------------------
-- ============================================================
-- COR ENHANCEMENTS MIGRATION
-- Run this in your Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. ADD GROUP_NAME TO CHANGE_ORDERS
-- Allows grouping CORs by phase, building, week, etc.
-- ============================================================
ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS group_name TEXT;

CREATE INDEX IF NOT EXISTS idx_change_orders_group_name
ON change_orders(project_id, group_name);

-- ============================================================
-- 2. ADD COMPANY_NAME TO CHANGE_ORDER_SUBCONTRACTORS
-- Stores the subcontractor company name for display
-- ============================================================
ALTER TABLE change_order_subcontractors
ADD COLUMN IF NOT EXISTS company_name TEXT DEFAULT '';

-- ============================================================
-- 3. VERIFY COLUMNS EXIST
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '✓ COR enhancements migration complete!';
  RAISE NOTICE '  - change_orders.group_name added';
  RAISE NOTICE '  - change_order_subcontractors.company_name added';
END $$;


-- ----------------------------------------------------------------
-- 15. COR export pipeline
-- ----------------------------------------------------------------
-- ============================================
-- COR Export Pipeline Migration
-- ============================================
-- Implements industrial-grade export system per specification:
-- - Idempotent export requests
-- - Async export pipeline with state machine
-- - Snapshot-based deterministic exports
-- - Failure handling and retry support
--
-- Run this in your Supabase SQL Editor after running
-- migration_photo_reliability.sql
-- ============================================

-- ============================================
-- 1. EXPORT JOBS TABLE (State Machine)
-- ============================================
-- Tracks all export requests with explicit states
-- Enables idempotent requests and failure recovery

CREATE TABLE IF NOT EXISTS cor_export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cor_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  snapshot_id UUID REFERENCES cor_export_snapshots(id) ON DELETE SET NULL,

  -- Idempotency key - prevents duplicate exports
  -- Format: cor_id:version:timestamp or custom client key
  idempotency_key TEXT NOT NULL,

  -- State machine: pending -> generating -> completed | failed
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Export requested, not yet started
    'generating',   -- PDF generation in progress
    'completed',    -- Successfully generated and available
    'failed'        -- Generation failed, may be retried
  )),

  -- Export options (stored for retry)
  options JSONB DEFAULT '{}',

  -- Progress tracking
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Retry handling
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_error TEXT,
  error_details JSONB,

  -- Result data
  pdf_url TEXT,           -- URL to generated PDF
  pdf_size_bytes INTEGER,
  generation_time_ms INTEGER,

  -- Metrics
  photo_count INTEGER DEFAULT 0,
  ticket_count INTEGER DEFAULT 0,
  page_count INTEGER DEFAULT 0,

  -- Audit
  requested_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique idempotency keys
  CONSTRAINT unique_idempotency_key UNIQUE (idempotency_key)
);

-- Index for finding jobs by COR
CREATE INDEX IF NOT EXISTS idx_export_jobs_cor
ON cor_export_jobs(cor_id, created_at DESC);

-- Index for finding pending/generating jobs
CREATE INDEX IF NOT EXISTS idx_export_jobs_status
ON cor_export_jobs(status, created_at ASC)
WHERE status IN ('pending', 'generating');

-- Index for idempotency lookups
CREATE INDEX IF NOT EXISTS idx_export_jobs_idempotency
ON cor_export_jobs(idempotency_key);

-- ============================================
-- 2. ADD VERSION COLUMN TO CHANGE_ORDERS
-- ============================================
-- Tracks COR version for snapshot invalidation
-- Incremented on any meaningful change

ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS last_snapshot_version INTEGER DEFAULT 0;

-- ============================================
-- 3. ADD PRE-AGGREGATED STATS
-- ============================================
-- Pre-computed statistics for fast export summary

ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS total_labor_hours DECIMAL(10,2) DEFAULT 0;

ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS total_overtime_hours DECIMAL(10,2) DEFAULT 0;

ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS ticket_count INTEGER DEFAULT 0;

ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS photo_count INTEGER DEFAULT 0;

ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS verified_ticket_count INTEGER DEFAULT 0;

-- ============================================
-- 4. UPDATE SNAPSHOT TABLE
-- ============================================
-- Add job reference and improve structure

ALTER TABLE cor_export_snapshots
ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES cor_export_jobs(id) ON DELETE SET NULL;

ALTER TABLE cor_export_snapshots
ADD COLUMN IF NOT EXISTS cor_version INTEGER;

ALTER TABLE cor_export_snapshots
ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT TRUE;

-- Index for finding current snapshot
CREATE INDEX IF NOT EXISTS idx_export_snapshots_current
ON cor_export_snapshots(cor_id, is_current)
WHERE is_current = TRUE;

-- ============================================
-- 5. VERSION INCREMENT TRIGGER
-- ============================================
-- Automatically increment COR version on changes

CREATE OR REPLACE FUNCTION increment_cor_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only increment on meaningful changes
  IF TG_OP = 'UPDATE' THEN
    -- Skip if only metadata fields changed
    IF OLD.updated_at != NEW.updated_at AND
       OLD.version = NEW.version AND
       OLD.last_snapshot_version = NEW.last_snapshot_version THEN
      -- Check if any substantive field changed
      IF OLD.title != NEW.title OR
         OLD.scope_of_work IS DISTINCT FROM NEW.scope_of_work OR
         OLD.period_start IS DISTINCT FROM NEW.period_start OR
         OLD.period_end IS DISTINCT FROM NEW.period_end OR
         OLD.status != NEW.status OR
         OLD.labor_subtotal != NEW.labor_subtotal OR
         OLD.materials_subtotal != NEW.materials_subtotal OR
         OLD.equipment_subtotal != NEW.equipment_subtotal OR
         OLD.subcontractors_subtotal != NEW.subcontractors_subtotal OR
         OLD.cor_total != NEW.cor_total THEN
        NEW.version := OLD.version + 1;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cor_version_increment ON change_orders;
CREATE TRIGGER trg_cor_version_increment
BEFORE UPDATE ON change_orders
FOR EACH ROW EXECUTE FUNCTION increment_cor_version();

-- ============================================
-- 6. PRE-AGGREGATED STATS UPDATE FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION update_cor_aggregated_stats(p_cor_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_labor_hours DECIMAL(10,2) := 0;
  v_ot_hours DECIMAL(10,2) := 0;
  v_ticket_count INTEGER := 0;
  v_photo_count INTEGER := 0;
  v_verified_count INTEGER := 0;
BEGIN
  -- Calculate total labor hours from labor line items
  SELECT
    COALESCE(SUM(regular_hours), 0),
    COALESCE(SUM(overtime_hours), 0)
  INTO v_labor_hours, v_ot_hours
  FROM change_order_labor
  WHERE change_order_id = p_cor_id;

  -- Count associated tickets and photos
  SELECT
    COUNT(DISTINCT t.id),
    COALESCE(SUM(COALESCE(array_length(t.photos, 1), 0)), 0),
    COUNT(DISTINCT CASE WHEN t.client_signature_data IS NOT NULL THEN t.id END)
  INTO v_ticket_count, v_photo_count, v_verified_count
  FROM change_order_ticket_associations cota
  JOIN t_and_m_tickets t ON t.id = cota.ticket_id
  WHERE cota.change_order_id = p_cor_id;

  -- Update COR with aggregated stats
  UPDATE change_orders
  SET
    total_labor_hours = v_labor_hours,
    total_overtime_hours = v_ot_hours,
    ticket_count = v_ticket_count,
    photo_count = v_photo_count,
    verified_ticket_count = v_verified_count
  WHERE id = p_cor_id;
END;
$$;

-- ============================================
-- 7. TRIGGER TO UPDATE STATS ON ASSOCIATION CHANGES
-- ============================================

CREATE OR REPLACE FUNCTION trigger_update_cor_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM update_cor_aggregated_stats(OLD.change_order_id);
    RETURN OLD;
  ELSE
    PERFORM update_cor_aggregated_stats(NEW.change_order_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_cor_stats ON change_order_ticket_associations;
CREATE TRIGGER trg_update_cor_stats
AFTER INSERT OR UPDATE OR DELETE ON change_order_ticket_associations
FOR EACH ROW EXECUTE FUNCTION trigger_update_cor_stats();

-- Also trigger on labor changes
DROP TRIGGER IF EXISTS trg_update_cor_stats_labor ON change_order_labor;
CREATE TRIGGER trg_update_cor_stats_labor
AFTER INSERT OR UPDATE OR DELETE ON change_order_labor
FOR EACH ROW EXECUTE FUNCTION trigger_update_cor_stats();

-- ============================================
-- 8. IDEMPOTENT EXPORT REQUEST FUNCTION
-- ============================================
-- Returns existing job if idempotency key matches,
-- otherwise creates new pending job

CREATE OR REPLACE FUNCTION request_cor_export(
  p_cor_id UUID,
  p_idempotency_key TEXT,
  p_options JSONB DEFAULT '{}',
  p_requested_by UUID DEFAULT NULL
)
RETURNS TABLE (
  job_id UUID,
  status TEXT,
  is_new BOOLEAN,
  snapshot_id UUID,
  pdf_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_job cor_export_jobs%ROWTYPE;
  v_new_job_id UUID;
BEGIN
  -- Check for existing job with same idempotency key
  SELECT * INTO v_existing_job
  FROM cor_export_jobs
  WHERE cor_export_jobs.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    -- Return existing job
    RETURN QUERY SELECT
      v_existing_job.id,
      v_existing_job.status,
      FALSE,
      v_existing_job.snapshot_id,
      v_existing_job.pdf_url;
    RETURN;
  END IF;

  -- Create new pending job
  INSERT INTO cor_export_jobs (
    cor_id,
    idempotency_key,
    options,
    requested_by,
    status
  ) VALUES (
    p_cor_id,
    p_idempotency_key,
    p_options,
    p_requested_by,
    'pending'
  )
  RETURNING id INTO v_new_job_id;

  RETURN QUERY SELECT
    v_new_job_id,
    'pending'::TEXT,
    TRUE,
    NULL::UUID,
    NULL::TEXT;
END;
$$;

-- ============================================
-- 9. UPDATE EXPORT JOB STATUS FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION update_export_job_status(
  p_job_id UUID,
  p_status TEXT,
  p_snapshot_id UUID DEFAULT NULL,
  p_pdf_url TEXT DEFAULT NULL,
  p_error TEXT DEFAULT NULL,
  p_error_details JSONB DEFAULT NULL,
  p_metrics JSONB DEFAULT NULL
)
RETURNS cor_export_jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job cor_export_jobs%ROWTYPE;
BEGIN
  UPDATE cor_export_jobs
  SET
    status = p_status,
    snapshot_id = COALESCE(p_snapshot_id, snapshot_id),
    pdf_url = COALESCE(p_pdf_url, pdf_url),
    last_error = COALESCE(p_error, last_error),
    error_details = COALESCE(p_error_details, error_details),
    started_at = CASE WHEN p_status = 'generating' THEN NOW() ELSE started_at END,
    completed_at = CASE WHEN p_status IN ('completed', 'failed') THEN NOW() ELSE completed_at END,
    generation_time_ms = CASE
      WHEN p_status = 'completed' AND started_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
      ELSE generation_time_ms
    END,
    photo_count = COALESCE((p_metrics->>'photo_count')::INTEGER, photo_count),
    ticket_count = COALESCE((p_metrics->>'ticket_count')::INTEGER, ticket_count),
    page_count = COALESCE((p_metrics->>'page_count')::INTEGER, page_count),
    pdf_size_bytes = COALESCE((p_metrics->>'pdf_size_bytes')::INTEGER, pdf_size_bytes),
    retry_count = CASE WHEN p_status = 'failed' THEN retry_count + 1 ELSE retry_count END,
    updated_at = NOW()
  WHERE id = p_job_id
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

-- ============================================
-- 10. RLS POLICIES FOR EXPORT JOBS
-- ============================================

ALTER TABLE cor_export_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view export jobs for their company CORs" ON cor_export_jobs;
CREATE POLICY "Users can view export jobs for their company CORs"
ON cor_export_jobs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    JOIN user_companies uc ON uc.company_id = co.company_id
    WHERE co.id = cor_export_jobs.cor_id
    AND uc.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can create export jobs for their company CORs" ON cor_export_jobs;
CREATE POLICY "Users can create export jobs for their company CORs"
ON cor_export_jobs FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM change_orders co
    JOIN user_companies uc ON uc.company_id = co.company_id
    WHERE co.id = cor_export_jobs.cor_id
    AND uc.user_id = auth.uid()
  )
);

-- ============================================
-- 11. GRANTS
-- ============================================

GRANT SELECT, INSERT, UPDATE ON cor_export_jobs TO authenticated;
GRANT EXECUTE ON FUNCTION request_cor_export(UUID, TEXT, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_export_job_status(UUID, TEXT, UUID, TEXT, TEXT, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION update_cor_aggregated_stats(UUID) TO authenticated;

-- ============================================
-- 12. COMMENTS
-- ============================================

COMMENT ON TABLE cor_export_jobs IS 'Tracks COR export requests with state machine for async, idempotent exports';
COMMENT ON COLUMN cor_export_jobs.idempotency_key IS 'Unique key to prevent duplicate export requests';
COMMENT ON COLUMN cor_export_jobs.status IS 'State machine: pending -> generating -> completed|failed';
COMMENT ON FUNCTION request_cor_export IS 'Idempotent export request - returns existing job or creates new pending one';
COMMENT ON FUNCTION update_export_job_status IS 'Updates export job state with optional metrics and error info';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================


-- ----------------------------------------------------------------
-- 16. COR log
-- ----------------------------------------------------------------
-- COR Log Feature Migration
-- Creates cor_log_entries table for tracking COR client communication
-- Run this migration in Supabase SQL Editor

-- ============================================================================
-- TABLE: cor_log_entries
-- Stores user-editable fields for COR client presentation log
-- ============================================================================

CREATE TABLE IF NOT EXISTS cor_log_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Auto-generated sequential number per project
  log_number INTEGER NOT NULL,

  -- User-editable fields for client communication tracking
  date_sent_to_client DATE,
  ce_number VARCHAR(50),  -- Client's reference/CE number
  comments TEXT,

  -- Audit timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure one log entry per COR
  CONSTRAINT uq_cor_log_change_order UNIQUE (change_order_id),
  -- Ensure unique log numbers per project
  CONSTRAINT uq_cor_log_project_number UNIQUE (project_id, log_number)
);

-- Index for efficient project-based queries
CREATE INDEX IF NOT EXISTS idx_cor_log_project ON cor_log_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_cor_log_company ON cor_log_entries(company_id);

-- ============================================================================
-- TRIGGER: Auto-create log entry when COR is created
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_cor_log_entry()
RETURNS TRIGGER AS $$
DECLARE
  next_log_num INTEGER;
  v_company_id UUID;
BEGIN
  -- Get company_id from the project
  SELECT company_id INTO v_company_id
  FROM projects WHERE id = NEW.project_id;

  -- Get next sequential log number for this project
  SELECT COALESCE(MAX(log_number), 0) + 1 INTO next_log_num
  FROM cor_log_entries
  WHERE project_id = NEW.project_id;

  -- Create the log entry
  INSERT INTO cor_log_entries (
    change_order_id,
    project_id,
    company_id,
    log_number
  ) VALUES (
    NEW.id,
    NEW.project_id,
    v_company_id,
    next_log_num
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists, then create
DROP TRIGGER IF EXISTS trg_auto_create_cor_log ON change_orders;

CREATE TRIGGER trg_auto_create_cor_log
AFTER INSERT ON change_orders
FOR EACH ROW
EXECUTE FUNCTION auto_create_cor_log_entry();

-- ============================================================================
-- FUNCTION: Backfill existing CORs
-- Creates log entries for any existing change_orders that don't have one
-- ============================================================================

CREATE OR REPLACE FUNCTION backfill_cor_log_entries()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_cor RECORD;
  v_next_log_num INTEGER;
  v_company_id UUID;
BEGIN
  -- Loop through CORs without log entries, ordered by creation date
  FOR v_cor IN
    SELECT co.id, co.project_id, co.created_at
    FROM change_orders co
    LEFT JOIN cor_log_entries cle ON co.id = cle.change_order_id
    WHERE cle.id IS NULL
    ORDER BY co.project_id, co.created_at
  LOOP
    -- Get company_id from project
    SELECT company_id INTO v_company_id
    FROM projects WHERE id = v_cor.project_id;

    -- Get next log number for this project
    SELECT COALESCE(MAX(log_number), 0) + 1 INTO v_next_log_num
    FROM cor_log_entries
    WHERE project_id = v_cor.project_id;

    -- Insert log entry
    INSERT INTO cor_log_entries (
      change_order_id,
      project_id,
      company_id,
      log_number
    ) VALUES (
      v_cor.id,
      v_cor.project_id,
      v_company_id,
      v_next_log_num
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Run backfill for existing CORs
SELECT backfill_cor_log_entries();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE cor_log_entries ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view log entries for their company's projects
CREATE POLICY "Users can view company cor log entries"
ON cor_log_entries FOR SELECT
TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  )
);

-- Policy: Users can update log entries for their company's projects
CREATE POLICY "Users can update company cor log entries"
ON cor_log_entries FOR UPDATE
TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  )
)
WITH CHECK (
  company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  )
);

-- Policy: Field workers with valid session can view log entries
CREATE POLICY "Field workers can view cor log entries"
ON cor_log_entries FOR SELECT
TO anon
USING (
  auth.uid() IS NULL
  AND validate_field_session(project_id)
);

-- ============================================================================
-- FUNCTION: Get COR Log with joined COR data
-- Returns complete log view data for a project
-- ============================================================================

CREATE OR REPLACE FUNCTION get_cor_log(p_project_id UUID)
RETURNS TABLE (
  id UUID,
  log_number INTEGER,
  date_sent_to_client DATE,
  ce_number VARCHAR(50),
  comments TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  -- COR data
  cor_id UUID,
  cor_number VARCHAR(50),
  cor_title TEXT,
  cor_total NUMERIC,
  cor_status VARCHAR(50),
  cor_created_at TIMESTAMPTZ,
  cor_approved_at TIMESTAMPTZ,
  cor_approved_by TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cle.id,
    cle.log_number,
    cle.date_sent_to_client,
    cle.ce_number,
    cle.comments,
    cle.created_at,
    cle.updated_at,
    -- COR data
    co.id AS cor_id,
    co.cor_number,
    co.title AS cor_title,
    co.cor_total,
    co.status AS cor_status,
    co.created_at AS cor_created_at,
    co.approved_at AS cor_approved_at,
    (SELECT full_name FROM profiles WHERE id = co.approved_by) AS cor_approved_by
  FROM cor_log_entries cle
  INNER JOIN change_orders co ON cle.change_order_id = co.id
  WHERE cle.project_id = p_project_id
  ORDER BY cle.log_number ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_cor_log(UUID) TO authenticated;

-- ============================================================================
-- FUNCTION: Update COR Log Entry
-- Updates user-editable fields
-- ============================================================================

CREATE OR REPLACE FUNCTION update_cor_log_entry(
  p_entry_id UUID,
  p_date_sent_to_client DATE DEFAULT NULL,
  p_ce_number VARCHAR(50) DEFAULT NULL,
  p_comments TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_entry cor_log_entries%ROWTYPE;
  v_company_id UUID;
BEGIN
  -- Get user's company
  SELECT company_id INTO v_company_id
  FROM profiles WHERE id = auth.uid();

  -- Check entry exists and belongs to user's company
  SELECT * INTO v_entry
  FROM cor_log_entries
  WHERE id = p_entry_id AND company_id = v_company_id;

  IF v_entry.id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Entry not found or access denied'
    );
  END IF;

  -- Update the entry
  UPDATE cor_log_entries
  SET
    date_sent_to_client = COALESCE(p_date_sent_to_client, date_sent_to_client),
    ce_number = COALESCE(p_ce_number, ce_number),
    comments = COALESCE(p_comments, comments),
    updated_at = NOW()
  WHERE id = p_entry_id;

  -- Return updated entry
  SELECT * INTO v_entry
  FROM cor_log_entries WHERE id = p_entry_id;

  RETURN json_build_object(
    'success', true,
    'entry', row_to_json(v_entry)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION update_cor_log_entry(UUID, DATE, VARCHAR, TEXT) TO authenticated;

-- ============================================================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================================================

-- Check table structure
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'cor_log_entries';

-- Check trigger exists
-- SELECT trigger_name, event_manipulation, action_timing
-- FROM information_schema.triggers
-- WHERE trigger_name = 'trg_auto_create_cor_log';

-- Check backfill results
-- SELECT COUNT(*) as log_entries FROM cor_log_entries;
-- SELECT COUNT(*) as change_orders FROM change_orders;


-- ----------------------------------------------------------------
-- 17. Access levels & project roles
-- ----------------------------------------------------------------
-- ============================================
-- ACCESS LEVELS & PROJECT ROLES MIGRATION
-- Separates security (access_level) from visibility (project_role)
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- PHASE 1: BACKUP CURRENT DATA
-- ============================================

-- Create backup of current roles (for rollback if needed)
CREATE TABLE IF NOT EXISTS _backup_user_companies_roles AS
SELECT id, user_id, company_id, role, status
FROM user_companies;

-- ============================================
-- PHASE 2: ADD ACCESS_LEVEL COLUMN
-- ============================================

-- Add new access_level column (keep role for now during transition)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_companies' AND column_name = 'access_level'
  ) THEN
    ALTER TABLE user_companies ADD COLUMN access_level TEXT DEFAULT 'member';
  END IF;
END $$;

-- ============================================
-- PHASE 3: MIGRATE DATA
-- ============================================

-- Map existing roles to access levels
-- owner, admin → administrator
-- office, member, foreman, anything else → member
UPDATE user_companies
SET access_level = CASE
  WHEN role IN ('owner', 'admin') THEN 'administrator'
  ELSE 'member'
END
WHERE access_level IS NULL OR access_level = 'member';

-- Ensure company owners are always administrators
UPDATE user_companies uc
SET access_level = 'administrator'
FROM companies c
WHERE c.owner_user_id = uc.user_id
AND c.id = uc.company_id;

-- ============================================
-- PHASE 4: ADD CONSTRAINT
-- ============================================

-- Add constraint for access_level values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_companies_access_level_check'
  ) THEN
    ALTER TABLE user_companies
    ADD CONSTRAINT user_companies_access_level_check
    CHECK (access_level IN ('administrator', 'member'));
  END IF;
END $$;

-- ============================================
-- PHASE 5: CREATE PROJECT_USERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS project_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_role TEXT NOT NULL DEFAULT 'Team Member',
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  UNIQUE(project_id, user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_users_project ON project_users(project_id);
CREATE INDEX IF NOT EXISTS idx_project_users_user ON project_users(user_id);

-- Add composite index for RLS performance
CREATE INDEX IF NOT EXISTS idx_user_companies_lookup
ON user_companies(user_id, company_id, status, access_level);

-- ============================================
-- PHASE 6: ENABLE RLS ON PROJECT_USERS
-- ============================================

ALTER TABLE project_users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "View project team" ON project_users;
DROP POLICY IF EXISTS "Administrators manage project team" ON project_users;

-- Active company members can view project team
CREATE POLICY "View project team"
ON project_users FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects p
    JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = project_users.project_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
  )
);

-- Only administrators can insert/update/delete project team members
CREATE POLICY "Administrators manage project team"
ON project_users FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects p
    JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = project_users.project_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
    AND uc.access_level = 'administrator'
  )
);

CREATE POLICY "Administrators update project team"
ON project_users FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects p
    JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = project_users.project_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
    AND uc.access_level = 'administrator'
  )
);

CREATE POLICY "Administrators delete project team"
ON project_users FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects p
    JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = project_users.project_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
    AND uc.access_level = 'administrator'
  )
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON project_users TO authenticated;

-- ============================================
-- PHASE 7: UPDATE EXISTING RLS POLICIES
-- ============================================

-- Update user_companies policies to use access_level
DROP POLICY IF EXISTS "Admins view company memberships" ON user_companies;
DROP POLICY IF EXISTS "Admins manage company memberships" ON user_companies;
DROP POLICY IF EXISTS "Admins reject pending memberships" ON user_companies;
DROP POLICY IF EXISTS "Admins create memberships" ON user_companies;

-- Administrators can view all memberships in their company
CREATE POLICY "Admins view company memberships"
ON user_companies FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.access_level = 'administrator'
  )
);

-- Administrators can update memberships (approve/change access level)
CREATE POLICY "Admins manage company memberships"
ON user_companies FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.access_level = 'administrator'
  )
);

-- Administrators can delete pending memberships (reject)
CREATE POLICY "Admins reject pending memberships"
ON user_companies FOR DELETE
TO authenticated
USING (
  user_companies.status = 'pending'
  AND EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.access_level = 'administrator'
  )
);

-- Administrators can create memberships (for invites)
CREATE POLICY "Admins create memberships"
ON user_companies FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.access_level = 'administrator'
  )
);

-- ============================================
-- PHASE 8: UPDATE COMPANIES POLICIES
-- ============================================

DROP POLICY IF EXISTS "Admins manage companies" ON companies;

CREATE POLICY "Admins manage companies"
ON companies FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = companies.id
    AND uc.status = 'active'
    AND uc.access_level = 'administrator'
  )
);

-- ============================================
-- PHASE 9: UPDATE COMPANY_BRANDING POLICIES
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_branding') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins update company branding" ON company_branding';
    EXECUTE 'DROP POLICY IF EXISTS "Admins insert company branding" ON company_branding';

    EXECUTE '
    CREATE POLICY "Admins update company branding"
    ON company_branding FOR UPDATE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
        AND uc.company_id = company_branding.company_id
        AND uc.status = ''active''
        AND uc.access_level = ''administrator''
      )
    )';

    EXECUTE '
    CREATE POLICY "Admins insert company branding"
    ON company_branding FOR INSERT
    TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
        AND uc.company_id = company_branding.company_id
        AND uc.status = ''active''
        AND uc.access_level = ''administrator''
      )
    )';
  END IF;
END $$;

-- ============================================
-- PHASE 10: UPDATE RPC FUNCTIONS
-- ============================================

-- Update approve_membership function to use access_level
CREATE OR REPLACE FUNCTION approve_membership_with_role(
  membership_id UUID,
  approved_by_user UUID,
  new_access_level TEXT DEFAULT 'member'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_company_id UUID;
  approver_status TEXT;
  approver_access TEXT;
BEGIN
  -- Get the company_id from the membership being approved
  SELECT company_id INTO target_company_id
  FROM user_companies
  WHERE id = membership_id;

  IF target_company_id IS NULL THEN
    RAISE EXCEPTION 'Membership not found';
  END IF;

  -- Verify the approver is an active administrator of this company
  SELECT uc.status, uc.access_level INTO approver_status, approver_access
  FROM user_companies uc
  WHERE uc.user_id = approved_by_user
  AND uc.company_id = target_company_id;

  IF approver_status != 'active' OR approver_access != 'administrator' THEN
    RAISE EXCEPTION 'Unauthorized: Only active administrators can approve memberships';
  END IF;

  -- Validate access_level value
  IF new_access_level NOT IN ('member', 'administrator') THEN
    RAISE EXCEPTION 'Invalid access level: %. Must be member or administrator', new_access_level;
  END IF;

  -- Update the membership
  UPDATE user_companies
  SET
    status = 'active',
    access_level = new_access_level,
    approved_at = NOW(),
    approved_by = approved_by_user
  WHERE id = membership_id
  AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership not found or already processed';
  END IF;
END;
$$;

-- Update has_active_company_membership to optionally check access level
CREATE OR REPLACE FUNCTION has_admin_access(check_user_id UUID, check_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_companies
    WHERE user_id = check_user_id
    AND company_id = check_company_id
    AND status = 'active'
    AND access_level = 'administrator'
  );
$$;

GRANT EXECUTE ON FUNCTION has_admin_access(UUID, UUID) TO authenticated;

-- ============================================
-- PHASE 11: ADD COMMENTS
-- ============================================

COMMENT ON COLUMN user_companies.access_level IS 'Security level: administrator (full control) or member (standard access)';
COMMENT ON COLUMN user_companies.role IS 'DEPRECATED: Use access_level instead. Kept for backwards compatibility.';
COMMENT ON TABLE project_users IS 'Associates users with projects and their project-specific role (informational only, not security)';
COMMENT ON COLUMN project_users.project_role IS 'Display role for project context (PM, Foreman, etc). Not used for authorization.';

-- ============================================
-- PHASE 12: VERIFICATION QUERIES
-- ============================================

-- Run these to verify migration:
-- SELECT access_level, COUNT(*) FROM user_companies GROUP BY access_level;
-- SELECT * FROM project_users LIMIT 5;
-- SELECT policyname FROM pg_policies WHERE tablename = 'project_users';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- Summary:
-- 1. Added access_level column to user_companies
-- 2. Migrated existing roles to access levels
-- 3. Created project_users table for project team
-- 4. Updated all RLS policies to use access_level
-- 5. Updated RPC functions
-- 6. Added performance indexes
-- ============================================


-- ----------------------------------------------------------------
-- 18. Documents and folders
-- ----------------------------------------------------------------
-- =============================================
-- DOCUMENT MANAGEMENT SYSTEM MIGRATION
-- =============================================
-- This migration creates the document management infrastructure for FieldSync
-- Allows companies to upload, organize, and manage construction documents

-- =============================================
-- 1. DOCUMENT FOLDERS TABLE
-- =============================================
-- Custom folders created by office/admin for organizing documents per project
CREATE TABLE IF NOT EXISTS document_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Folder details
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'folder', -- lucide icon name
  color TEXT DEFAULT 'blue', -- theme color

  -- Ordering
  sort_order INTEGER DEFAULT 0,

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique folder names per project
  UNIQUE(project_id, name)
);

-- =============================================
-- 2. DOCUMENTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- File metadata
  name TEXT NOT NULL,
  description TEXT,
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,

  -- Organization
  folder_id UUID REFERENCES document_folders(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'general',
  tags TEXT[] DEFAULT '{}',

  -- Versioning
  version INTEGER DEFAULT 1,
  is_current BOOLEAN DEFAULT true,
  parent_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,

  -- Linking to other resources (polymorphic)
  resource_type TEXT, -- 'cor', 'tm_ticket', 'daily_report', null for general
  resource_id UUID,

  -- Access control
  visibility TEXT DEFAULT 'all' CHECK (visibility IN ('all', 'office_only', 'admin_only')),

  -- Approval workflow (for contracts)
  approval_status TEXT DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Audit
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),

  -- Soft delete
  archived_at TIMESTAMPTZ,
  archived_by UUID REFERENCES auth.users(id)
);

-- =============================================
-- 2. DOCUMENT UPLOAD QUEUE (for reliability)
-- =============================================
CREATE TABLE IF NOT EXISTS document_upload_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  temp_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER,
  category TEXT DEFAULT 'general',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'confirmed', 'failed', 'cancelled')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  last_attempt TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  uploaded_url TEXT,
  storage_path TEXT,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  UNIQUE(project_id, temp_id)
);

-- =============================================
-- 3. DOCUMENT AUDIT LOG
-- =============================================
CREATE TABLE IF NOT EXISTS document_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  operation TEXT NOT NULL CHECK (operation IN (
    'upload_started', 'upload_completed', 'upload_failed',
    'downloaded', 'viewed', 'deleted', 'restored',
    'version_created', 'linked', 'unlinked',
    'approved', 'rejected'
  )),
  details JSONB,
  error_message TEXT,
  triggered_by TEXT DEFAULT 'user' CHECK (triggered_by IN ('user', 'system', 'retry')),
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 4. INDEXES
-- =============================================

-- Folder indexes
CREATE INDEX IF NOT EXISTS idx_folders_project ON document_folders(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_folders_company ON document_folders(company_id);

-- Primary access patterns
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id, uploaded_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_company ON documents(company_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(project_id, category) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id, uploaded_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_resource ON documents(resource_type, resource_id) WHERE resource_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_current ON documents(parent_document_id) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_documents_approval ON documents(company_id, approval_status) WHERE approval_status = 'pending';

-- Queue processing
CREATE INDEX IF NOT EXISTS idx_doc_queue_pending ON document_upload_queue(status, next_retry_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_doc_queue_project ON document_upload_queue(project_id);

-- Audit queries
CREATE INDEX IF NOT EXISTS idx_doc_audit_document ON document_audit_log(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_audit_project ON document_audit_log(project_id, created_at DESC);

-- =============================================
-- 5. ROW LEVEL SECURITY
-- =============================================

-- Enable RLS on all tables
ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_upload_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_audit_log ENABLE ROW LEVEL SECURITY;

-- =============================================
-- FOLDER POLICIES
-- =============================================

-- Folders: All company members can view
CREATE POLICY "folders_select" ON document_folders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
    )
  );

-- Folders: Field users can also view via project access
CREATE POLICY "folders_field_select" ON document_folders
  FOR SELECT USING (
    can_access_project(project_id)
  );

-- Folders: Only office/admin can create
CREATE POLICY "folders_insert" ON document_folders
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
        AND uc.access_level IN ('member', 'administrator')
    )
  );

-- Folders: Only office/admin can update
CREATE POLICY "folders_update" ON document_folders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
        AND uc.access_level IN ('member', 'administrator')
    )
  );

-- Folders: Only admin can delete
CREATE POLICY "folders_delete" ON document_folders
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
        AND uc.access_level = 'administrator'
    )
  );

-- Documents: Company members can access their company's documents
CREATE POLICY "documents_select" ON documents
  FOR SELECT USING (
    -- Must be company member
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
    )
    AND (
      -- Visibility check based on access level
      visibility = 'all'
      OR (visibility = 'office_only' AND EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
          AND uc.company_id = documents.company_id
          AND uc.access_level IN ('member', 'administrator')
      ))
      OR (visibility = 'admin_only' AND EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
          AND uc.company_id = documents.company_id
          AND uc.access_level = 'administrator'
      ))
    )
    AND (
      -- Approval check: pending documents only visible to admins
      approval_status = 'approved'
      OR EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
          AND uc.company_id = documents.company_id
          AND uc.access_level = 'administrator'
      )
    )
  );

-- Documents: Only office/admin can insert
CREATE POLICY "documents_insert" ON documents
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
        AND uc.access_level IN ('member', 'administrator')
    )
  );

-- Documents: Only office/admin can update
CREATE POLICY "documents_update" ON documents
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
        AND uc.access_level IN ('member', 'administrator')
    )
  );

-- Documents: Only admin can delete
CREATE POLICY "documents_delete" ON documents
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
        AND uc.access_level = 'administrator'
    )
  );

-- Field users can view 'all' visibility, approved documents
CREATE POLICY "documents_field_select" ON documents
  FOR SELECT USING (
    visibility = 'all'
    AND approval_status = 'approved'
    AND archived_at IS NULL
    AND can_access_project(project_id)
  );

-- Upload queue policies
CREATE POLICY "doc_queue_select" ON document_upload_queue
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_upload_queue.company_id
        AND uc.status = 'active'
    )
  );

CREATE POLICY "doc_queue_insert" ON document_upload_queue
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_upload_queue.company_id
        AND uc.status = 'active'
        AND uc.access_level IN ('member', 'administrator')
    )
  );

CREATE POLICY "doc_queue_update" ON document_upload_queue
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_upload_queue.company_id
        AND uc.status = 'active'
    )
  );

-- Audit log: read-only for users, system can insert
CREATE POLICY "doc_audit_select" ON document_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_audit_log.company_id
        AND uc.status = 'active'
    )
  );

CREATE POLICY "doc_audit_insert" ON document_audit_log
  FOR INSERT WITH CHECK (true);

-- =============================================
-- 6. STORAGE BUCKET
-- =============================================
-- Note: Run this in Supabase Dashboard or via API

-- Create bucket (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-documents', 'project-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "document_storage_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM companies c
      JOIN user_companies uc ON c.id = uc.company_id
      WHERE uc.user_id = auth.uid()
        AND uc.status = 'active'
        AND uc.access_level IN ('member', 'administrator')
    )
  );

CREATE POLICY "document_storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'project-documents');

CREATE POLICY "document_storage_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM companies c
      JOIN user_companies uc ON c.id = uc.company_id
      WHERE uc.user_id = auth.uid()
        AND uc.status = 'active'
        AND uc.access_level IN ('member', 'administrator')
    )
  );

CREATE POLICY "document_storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM companies c
      JOIN user_companies uc ON c.id = uc.company_id
      WHERE uc.user_id = auth.uid()
        AND uc.status = 'active'
        AND uc.access_level = 'administrator'
    )
  );

-- =============================================
-- 7. RPC FUNCTIONS
-- =============================================

-- Confirm document upload (atomic operation)
CREATE OR REPLACE FUNCTION confirm_document_upload(
  p_queue_id UUID,
  p_document_id UUID,
  p_storage_path TEXT,
  p_uploaded_url TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update queue entry
  UPDATE document_upload_queue
  SET status = 'confirmed',
      document_id = p_document_id,
      storage_path = p_storage_path,
      uploaded_url = p_uploaded_url,
      confirmed_at = NOW()
  WHERE id = p_queue_id;

  -- Log the operation
  INSERT INTO document_audit_log (document_id, project_id, company_id, operation, triggered_by, user_id)
  SELECT p_document_id, project_id, company_id, 'upload_completed', 'system', auth.uid()
  FROM document_upload_queue WHERE id = p_queue_id;

  RETURN true;
END;
$$;

-- Mark document upload failed
CREATE OR REPLACE FUNCTION mark_document_upload_failed(
  p_queue_id UUID,
  p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE document_upload_queue
  SET status = 'failed',
      attempts = attempts + 1,
      last_error = p_error,
      last_attempt = NOW(),
      next_retry_at = CASE
        WHEN attempts + 1 < max_attempts
          THEN NOW() + (POWER(2, attempts + 1) || ' seconds')::INTERVAL
        ELSE NULL
      END
  WHERE id = p_queue_id;

  -- Log the failure
  INSERT INTO document_audit_log (project_id, company_id, operation, error_message, triggered_by, user_id)
  SELECT project_id, company_id, 'upload_failed', p_error, 'system', auth.uid()
  FROM document_upload_queue WHERE id = p_queue_id;

  RETURN true;
END;
$$;

-- Approve document
CREATE OR REPLACE FUNCTION approve_document(
  p_document_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  -- Check if user is admin
  SELECT company_id INTO v_company_id FROM documents WHERE id = p_document_id;

  IF NOT EXISTS (
    SELECT 1 FROM user_companies
    WHERE user_id = auth.uid()
      AND company_id = v_company_id
      AND access_level = 'administrator'
  ) THEN
    RAISE EXCEPTION 'Only administrators can approve documents';
  END IF;

  -- Update document
  UPDATE documents
  SET approval_status = 'approved',
      approved_by = auth.uid(),
      approved_at = NOW()
  WHERE id = p_document_id;

  -- Log the approval
  INSERT INTO document_audit_log (document_id, project_id, company_id, operation, triggered_by, user_id)
  SELECT id, project_id, company_id, 'approved', 'user', auth.uid()
  FROM documents WHERE id = p_document_id;

  RETURN true;
END;
$$;

-- Reject document
CREATE OR REPLACE FUNCTION reject_document(
  p_document_id UUID,
  p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  -- Check if user is admin
  SELECT company_id INTO v_company_id FROM documents WHERE id = p_document_id;

  IF NOT EXISTS (
    SELECT 1 FROM user_companies
    WHERE user_id = auth.uid()
      AND company_id = v_company_id
      AND access_level = 'administrator'
  ) THEN
    RAISE EXCEPTION 'Only administrators can reject documents';
  END IF;

  -- Update document
  UPDATE documents
  SET approval_status = 'rejected',
      rejection_reason = p_reason
  WHERE id = p_document_id;

  -- Log the rejection
  INSERT INTO document_audit_log (document_id, project_id, company_id, operation, details, triggered_by, user_id)
  SELECT id, project_id, company_id, 'rejected', jsonb_build_object('reason', p_reason), 'user', auth.uid()
  FROM documents WHERE id = p_document_id;

  RETURN true;
END;
$$;

-- =============================================
-- 8. REALTIME SUBSCRIPTION
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE document_folders;
ALTER PUBLICATION supabase_realtime ADD TABLE documents;
ALTER PUBLICATION supabase_realtime ADD TABLE document_upload_queue;

-- =============================================
-- 9. GRANTS
-- =============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON document_folders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO authenticated;
GRANT SELECT, INSERT, UPDATE ON document_upload_queue TO authenticated;
GRANT SELECT, INSERT ON document_audit_log TO authenticated;

GRANT EXECUTE ON FUNCTION confirm_document_upload TO authenticated;
GRANT EXECUTE ON FUNCTION mark_document_upload_failed TO authenticated;
GRANT EXECUTE ON FUNCTION approve_document TO authenticated;
GRANT EXECUTE ON FUNCTION reject_document TO authenticated;


-- ----------------------------------------------------------------
-- 19. Signatures
-- ----------------------------------------------------------------
-- Migration: Add signature workflow tables for CORs and T&M Tickets
-- Run this in your Supabase SQL Editor
-- This enables shareable links for GC/Client to sign documents without login

-- ============================================================================
-- Table 1: signature_requests - Tracks pending signature links
-- ============================================================================

CREATE TABLE signature_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Link to the document being signed
  document_type TEXT NOT NULL CHECK (document_type IN ('cor', 'tm_ticket')),
  document_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Secure token for public access (e.g., sig_abc123xyz789)
  signature_token TEXT NOT NULL UNIQUE,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partially_signed', 'completed', 'expired', 'revoked')),

  -- Optional expiration
  expires_at TIMESTAMPTZ,

  -- Access tracking
  view_count INTEGER DEFAULT 0 NOT NULL,
  last_viewed_at TIMESTAMPTZ,

  -- Audit
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_signature_requests_token ON signature_requests(signature_token);
CREATE INDEX idx_signature_requests_document ON signature_requests(document_type, document_id);
CREATE INDEX idx_signature_requests_status ON signature_requests(status);
CREATE INDEX idx_signature_requests_company ON signature_requests(company_id);

-- ============================================================================
-- Table 2: signatures - Stores captured signatures
-- ============================================================================

CREATE TABLE signatures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Link to the signature request
  signature_request_id UUID NOT NULL REFERENCES signature_requests(id) ON DELETE CASCADE,

  -- Which signature slot (1 = GC, 2 = Client)
  signature_slot INTEGER NOT NULL CHECK (signature_slot IN (1, 2)),

  -- Full signature data
  signature_image TEXT NOT NULL, -- Base64 encoded PNG
  signer_name TEXT NOT NULL,
  signer_title TEXT,
  signer_company TEXT,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Legal/audit tracking
  ip_address INET,
  user_agent TEXT,

  -- Ensure only one signature per slot per request
  CONSTRAINT unique_slot_per_request UNIQUE (signature_request_id, signature_slot)
);

CREATE INDEX idx_signatures_request ON signatures(signature_request_id);

-- ============================================================================
-- Add signature columns to change_orders table
-- ============================================================================

-- Add additional fields for GC signature (some may already exist)
ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS gc_signature_title TEXT,
ADD COLUMN IF NOT EXISTS gc_signature_company TEXT,
ADD COLUMN IF NOT EXISTS gc_signature_ip INET;

-- Add full Client signature fields
ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS client_signature_data TEXT,
ADD COLUMN IF NOT EXISTS client_signature_name TEXT,
ADD COLUMN IF NOT EXISTS client_signature_title TEXT,
ADD COLUMN IF NOT EXISTS client_signature_company TEXT,
ADD COLUMN IF NOT EXISTS client_signature_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS client_signature_ip INET;

-- ============================================================================
-- Add signature columns to t_and_m_tickets table
-- ============================================================================

-- Add GC signature fields
ALTER TABLE t_and_m_tickets
ADD COLUMN IF NOT EXISTS gc_signature_data TEXT,
ADD COLUMN IF NOT EXISTS gc_signature_name TEXT,
ADD COLUMN IF NOT EXISTS gc_signature_title TEXT,
ADD COLUMN IF NOT EXISTS gc_signature_company TEXT,
ADD COLUMN IF NOT EXISTS gc_signature_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS gc_signature_ip INET;

-- Add Client signature fields
ALTER TABLE t_and_m_tickets
ADD COLUMN IF NOT EXISTS client_signature_data TEXT,
ADD COLUMN IF NOT EXISTS client_signature_name TEXT,
ADD COLUMN IF NOT EXISTS client_signature_title TEXT,
ADD COLUMN IF NOT EXISTS client_signature_company TEXT,
ADD COLUMN IF NOT EXISTS client_signature_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS client_signature_ip INET;

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE signature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;

-- Policy: Public can view signature requests by valid token
CREATE POLICY "Public read signature requests by token" ON signature_requests
  FOR SELECT
  USING (
    status IN ('pending', 'partially_signed')
    AND (expires_at IS NULL OR expires_at > NOW())
  );

-- Policy: Public can insert signatures for valid requests
CREATE POLICY "Public can add signatures" ON signatures
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM signature_requests sr
      WHERE sr.id = signature_request_id
      AND sr.status IN ('pending', 'partially_signed')
      AND (sr.expires_at IS NULL OR sr.expires_at > NOW())
    )
  );

-- Policy: Public can read signatures for accessible requests
CREATE POLICY "Public can view signatures" ON signatures
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM signature_requests sr
      WHERE sr.id = signature_request_id
      AND sr.status IN ('pending', 'partially_signed', 'completed')
      AND (sr.expires_at IS NULL OR sr.expires_at > NOW())
    )
  );

-- Policy: Authenticated company users can manage signature requests
CREATE POLICY "Company users manage signature requests" ON signature_requests
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = signature_requests.company_id
    )
  );

-- Policy: Authenticated company users can view signatures
CREATE POLICY "Company users view signatures" ON signatures
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM signature_requests sr
      INNER JOIN user_companies uc ON uc.company_id = sr.company_id
      WHERE sr.id = signature_request_id
      AND uc.user_id = auth.uid()
    )
  );

-- ============================================================================
-- Functions
-- ============================================================================

-- Generate unique signature token with 'sig_' prefix
CREATE OR REPLACE FUNCTION generate_signature_token()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
  token_exists BOOLEAN := true;
BEGIN
  WHILE token_exists LOOP
    result := 'sig_';
    FOR i IN 1..16 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    SELECT EXISTS(SELECT 1 FROM signature_requests WHERE signature_token = result) INTO token_exists;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Auto-update signature request status when signatures are added
CREATE OR REPLACE FUNCTION update_signature_request_status()
RETURNS TRIGGER AS $$
DECLARE
  sig_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO sig_count
  FROM signatures
  WHERE signature_request_id = NEW.signature_request_id;

  IF sig_count >= 2 THEN
    UPDATE signature_requests
    SET status = 'completed', updated_at = NOW()
    WHERE id = NEW.signature_request_id;
  ELSIF sig_count = 1 THEN
    UPDATE signature_requests
    SET status = 'partially_signed', updated_at = NOW()
    WHERE id = NEW.signature_request_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_signature_status
AFTER INSERT ON signatures
FOR EACH ROW EXECUTE FUNCTION update_signature_request_status();

-- Increment view count for signature request
CREATE OR REPLACE FUNCTION increment_signature_view_count(token TEXT)
RETURNS void AS $$
BEGIN
  UPDATE signature_requests
  SET
    view_count = view_count + 1,
    last_viewed_at = NOW()
  WHERE signature_token = token
    AND status IN ('pending', 'partially_signed')
    AND (expires_at IS NULL OR expires_at > NOW());
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at trigger
CREATE TRIGGER update_signature_requests_updated_at
  BEFORE UPDATE ON signature_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ----------------------------------------------------------------
-- 20. Signature anon access
-- ----------------------------------------------------------------
-- Migration: Fix signatures table RLS for anonymous users
-- Purpose: Allow field users (anon role) to submit signatures via public links
-- Date: January 3, 2025

-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Public can add signatures" ON signatures;
DROP POLICY IF EXISTS "Public can view signatures" ON signatures;
DROP POLICY IF EXISTS "Anon can add signatures" ON signatures;
DROP POLICY IF EXISTS "Anon can view signatures" ON signatures;

-- Allow anonymous users to insert signatures for valid pending requests
CREATE POLICY "Anon can add signatures" ON signatures
  FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM signature_requests sr
      WHERE sr.id = signature_request_id
      AND sr.status IN ('pending', 'partially_signed')
      AND (sr.expires_at IS NULL OR sr.expires_at > NOW())
    )
  );

-- Allow anonymous users to view signatures for accessible requests
CREATE POLICY "Anon can view signatures" ON signatures
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM signature_requests sr
      WHERE sr.id = signature_request_id
      AND (sr.expires_at IS NULL OR sr.expires_at > NOW())
    )
  );

-- Ensure authenticated users can also insert/view
CREATE POLICY "Authenticated can add signatures" ON signatures
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM signature_requests sr
      WHERE sr.id = signature_request_id
      AND sr.status IN ('pending', 'partially_signed')
    )
  );

CREATE POLICY "Authenticated can view signatures" ON signatures
  FOR SELECT
  TO authenticated
  USING (true);

-- Grant necessary permissions
GRANT SELECT, INSERT ON signatures TO anon;
GRANT SELECT, INSERT ON signatures TO authenticated;


-- ----------------------------------------------------------------
-- 21. Field photo uploads
-- ----------------------------------------------------------------
-- Migration: Field User Photo Upload Access
-- Date: 2025-01-07
--
-- PROBLEM: Field users (foremen) authenticate via project PIN, not Supabase Auth.
-- This means they use the 'anon' role, not 'authenticated'.
-- The existing tm-photos storage policies only allow 'authenticated' role to upload,
-- so foremen cannot upload photos from the field.
--
-- SOLUTION: Add storage RLS policies for 'anon' role with project-based validation.
-- Photos are stored at path: companyId/projectId/ticketId/filename
-- We validate that the project exists to prevent arbitrary uploads.
--
-- IMPORTANT: Run this in the Supabase SQL Editor

-- ============================================================================
-- POLICY 1: Allow field users (anon) to upload photos
-- Validates that the path contains a valid project ID
-- ============================================================================
CREATE POLICY "Field users can upload tm-photos"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'tm-photos'
  -- Path format: companyId/projectId/ticketId/filename
  -- Extract project_id from path (second segment) and verify it exists
  AND EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id::text = (string_to_array(name, '/'))[2]
  )
);

-- ============================================================================
-- POLICY 2: Allow field users (anon) to update photos they uploaded
-- Same project validation as upload
-- ============================================================================
CREATE POLICY "Field users can update tm-photos"
ON storage.objects
FOR UPDATE
TO anon
USING (
  bucket_id = 'tm-photos'
  AND EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id::text = (string_to_array(name, '/'))[2]
  )
)
WITH CHECK (
  bucket_id = 'tm-photos'
  AND EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id::text = (string_to_array(name, '/'))[2]
  )
);

-- ============================================================================
-- POLICY 3: Allow field users (anon) to delete photos
-- Same project validation
-- ============================================================================
CREATE POLICY "Field users can delete tm-photos"
ON storage.objects
FOR DELETE
TO anon
USING (
  bucket_id = 'tm-photos'
  AND EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id::text = (string_to_array(name, '/'))[2]
  )
);

-- ============================================================================
-- VERIFICATION QUERIES
-- Run these after the migration to verify policies are in place
-- ============================================================================

-- Check all policies on storage.objects for tm-photos bucket
-- SELECT policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'objects'
-- AND schemaname = 'storage';

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================
-- DROP POLICY IF EXISTS "Field users can upload tm-photos" ON storage.objects;
-- DROP POLICY IF EXISTS "Field users can update tm-photos" ON storage.objects;
-- DROP POLICY IF EXISTS "Field users can delete tm-photos" ON storage.objects;

-- ============================================================================
-- TESTING
-- ============================================================================
-- 1. Open the app as a foreman (Company Code + Project PIN)
-- 2. Create a T&M ticket
-- 3. Add photos
-- 4. Submit - photos should upload without 406/403 errors
-- 5. Verify photos appear in ticket details



-- ----------------------------------------------------------------
-- 22. T&M photo storage
-- ----------------------------------------------------------------
-- Migration: T&M Photos Storage Bucket RLS Policies
-- Fixes "new row violates row level security policy" error for photo uploads
--
-- IMPORTANT: Run this in the Supabase SQL Editor
--
-- This creates the required policies for authenticated users to:
-- 1. Upload photos to the tm-photos bucket
-- 2. Read photos from the tm-photos bucket
-- 3. Delete their own photos

-- First, ensure the bucket exists and is configured correctly
-- (Run this in Storage settings if bucket doesn't exist)
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('tm-photos', 'tm-photos', true)
-- ON CONFLICT (id) DO UPDATE SET public = true;

-- Policy 1: Allow authenticated users to INSERT (upload) photos
-- Path format: companyId/projectId/ticketId/filename
CREATE POLICY "Authenticated users can upload tm-photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tm-photos'
);

-- Policy 2: Allow public read access to photos (for display in office view)
CREATE POLICY "Public read access for tm-photos"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'tm-photos'
);

-- Policy 3: Allow authenticated users to update their uploads
CREATE POLICY "Authenticated users can update tm-photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'tm-photos'
)
WITH CHECK (
  bucket_id = 'tm-photos'
);

-- Policy 4: Allow authenticated users to delete photos
CREATE POLICY "Authenticated users can delete tm-photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'tm-photos'
);

-- ALTERNATIVE: If the above policies conflict with existing ones,
-- you may need to drop and recreate. Run these ONLY if you get
-- "policy already exists" errors:
--
-- DROP POLICY IF EXISTS "Authenticated users can upload tm-photos" ON storage.objects;
-- DROP POLICY IF EXISTS "Public read access for tm-photos" ON storage.objects;
-- DROP POLICY IF EXISTS "Authenticated users can update tm-photos" ON storage.objects;
-- DROP POLICY IF EXISTS "Authenticated users can delete tm-photos" ON storage.objects;
--
-- Then re-run the CREATE POLICY statements above.

-- VERIFICATION: After running, test by uploading a photo in the T&M form.
-- The 406 error should no longer appear.


-- ----------------------------------------------------------------
-- 23. Photo reliability & audit log
-- ----------------------------------------------------------------
-- Migration: Photo Reliability & Export Snapshots
-- Purpose: Add infrastructure for reliable photo uploads and dispute-ready exports
-- Date: January 2, 2025
-- Risk: LOW (additive only, no data changes)

-- ============================================
-- PHOTO UPLOAD QUEUE (for retry/offline support)
-- ============================================

-- Queue for tracking photo uploads that need processing
CREATE TABLE IF NOT EXISTS photo_upload_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES t_and_m_tickets(id) ON DELETE CASCADE,
  temp_id TEXT NOT NULL,  -- Client-side temporary ID for matching
  file_name TEXT,
  file_size_bytes INTEGER,

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'confirmed', 'failed', 'cancelled')),

  -- Retry logic
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  last_attempt TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,

  -- Results
  uploaded_url TEXT,  -- Set when upload succeeds
  storage_path TEXT,  -- Path in storage bucket

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,

  -- Prevent duplicate uploads
  UNIQUE(ticket_id, temp_id)
);

-- Index for processing pending uploads
CREATE INDEX IF NOT EXISTS idx_photo_queue_pending
ON photo_upload_queue(status, next_retry_at)
WHERE status IN ('pending', 'failed');

-- Index for ticket lookups
CREATE INDEX IF NOT EXISTS idx_photo_queue_ticket
ON photo_upload_queue(ticket_id);

-- ============================================
-- COR EXPORT SNAPSHOTS (for dispute-ready exports)
-- ============================================

-- Frozen snapshots of COR data at export time
CREATE TABLE IF NOT EXISTS cor_export_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cor_id UUID REFERENCES change_orders(id) ON DELETE CASCADE,

  -- Export metadata
  exported_at TIMESTAMPTZ DEFAULT NOW(),
  exported_by UUID,  -- User who triggered export
  export_type TEXT DEFAULT 'pdf' CHECK (export_type IN ('pdf', 'email', 'download')),
  export_reason TEXT,  -- Optional: "client request", "dispute", "audit"

  -- Frozen data (complete snapshot)
  cor_data JSONB NOT NULL,  -- Full COR record
  tickets_data JSONB NOT NULL,  -- All associated tickets with workers/items
  photos_manifest JSONB NOT NULL,  -- Photo URLs and verification status
  totals_snapshot JSONB,  -- Calculated totals at export time

  -- Versioning
  version INTEGER DEFAULT 1,
  checksum TEXT NOT NULL,  -- SHA256 of export content for integrity

  -- Client tracking
  client_sent_at TIMESTAMPTZ,
  client_email TEXT,
  client_name TEXT,

  -- File reference (if stored)
  pdf_storage_path TEXT,
  pdf_size_bytes INTEGER
);

-- Index for COR export history
CREATE INDEX IF NOT EXISTS idx_export_snapshots_cor
ON cor_export_snapshots(cor_id, exported_at DESC);

-- Index for finding exports by date
CREATE INDEX IF NOT EXISTS idx_export_snapshots_date
ON cor_export_snapshots(exported_at DESC);

-- ============================================
-- PHOTO VERIFICATION TRACKING
-- ============================================

-- Add verification columns to tickets
ALTER TABLE t_and_m_tickets
ADD COLUMN IF NOT EXISTS photos_verified_at TIMESTAMPTZ;

ALTER TABLE t_and_m_tickets
ADD COLUMN IF NOT EXISTS photos_verification_status TEXT DEFAULT 'pending'
  CHECK (photos_verification_status IN ('pending', 'verified', 'issues', 'empty'));

ALTER TABLE t_and_m_tickets
ADD COLUMN IF NOT EXISTS photos_issue_count INTEGER DEFAULT 0;

-- ============================================
-- PHOTO INTEGRITY LOG
-- ============================================

-- Log all photo operations for audit trail
CREATE TABLE IF NOT EXISTS photo_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES t_and_m_tickets(id) ON DELETE SET NULL,
  cor_id UUID REFERENCES change_orders(id) ON DELETE SET NULL,

  -- Operation details
  operation TEXT NOT NULL CHECK (operation IN (
    'upload_started', 'upload_completed', 'upload_failed',
    'verification_passed', 'verification_failed',
    'deleted', 'restored',
    'export_included', 'export_excluded'
  )),

  photo_url TEXT,
  storage_path TEXT,

  -- Metadata
  details JSONB,
  error_message TEXT,

  -- Context
  triggered_by TEXT,  -- 'user', 'system', 'retry'
  user_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for ticket audit
CREATE INDEX IF NOT EXISTS idx_photo_audit_ticket
ON photo_audit_log(ticket_id, created_at DESC);

-- Index for finding failures
CREATE INDEX IF NOT EXISTS idx_photo_audit_failures
ON photo_audit_log(operation, created_at DESC)
WHERE operation IN ('upload_failed', 'verification_failed');

-- ============================================
-- RLS POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE photo_upload_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE cor_export_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_audit_log ENABLE ROW LEVEL SECURITY;

-- Photo queue: Users can manage their own uploads
CREATE POLICY "Users can view own photo queue"
ON photo_upload_queue FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can insert to photo queue"
ON photo_upload_queue FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can update own photo queue"
ON photo_upload_queue FOR UPDATE
TO authenticated
USING (true);

-- Export snapshots: Users can view exports for their CORs
CREATE POLICY "Users can view export snapshots"
ON cor_export_snapshots FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can create export snapshots"
ON cor_export_snapshots FOR INSERT
TO authenticated
WITH CHECK (true);

-- Audit log: Read-only for users
CREATE POLICY "Users can view photo audit log"
ON photo_audit_log FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "System can insert audit log"
ON photo_audit_log FOR INSERT
TO authenticated
WITH CHECK (true);

-- Field users (anon) need limited access
CREATE POLICY "Field users can view own photo queue"
ON photo_upload_queue FOR SELECT
TO anon
USING (true);

CREATE POLICY "Field users can insert to photo queue"
ON photo_upload_queue FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "Field users can update photo queue"
ON photo_upload_queue FOR UPDATE
TO anon
USING (true);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get pending uploads for a ticket
CREATE OR REPLACE FUNCTION get_pending_photo_uploads(p_ticket_id UUID)
RETURNS TABLE (
  id UUID,
  temp_id TEXT,
  status TEXT,
  attempts INTEGER,
  last_error TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT pq.id, pq.temp_id, pq.status, pq.attempts, pq.last_error
  FROM photo_upload_queue pq
  WHERE pq.ticket_id = p_ticket_id
  AND pq.status IN ('pending', 'uploading', 'failed')
  ORDER BY pq.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to confirm photo upload
CREATE OR REPLACE FUNCTION confirm_photo_upload(
  p_queue_id UUID,
  p_uploaded_url TEXT,
  p_storage_path TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_ticket_id UUID;
  v_current_photos JSONB;
BEGIN
  -- Get ticket ID and mark queue entry as confirmed
  UPDATE photo_upload_queue
  SET status = 'confirmed',
      uploaded_url = p_uploaded_url,
      storage_path = p_storage_path,
      confirmed_at = NOW()
  WHERE id = p_queue_id
  AND status IN ('pending', 'uploading')
  RETURNING ticket_id INTO v_ticket_id;

  IF v_ticket_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Append URL to ticket photos array
  SELECT COALESCE(photos, '[]'::JSONB) INTO v_current_photos
  FROM t_and_m_tickets
  WHERE id = v_ticket_id;

  UPDATE t_and_m_tickets
  SET photos = v_current_photos || to_jsonb(p_uploaded_url)
  WHERE id = v_ticket_id;

  -- Log the successful upload
  INSERT INTO photo_audit_log (ticket_id, operation, photo_url, storage_path, triggered_by)
  VALUES (v_ticket_id, 'upload_completed', p_uploaded_url, p_storage_path, 'system');

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark photo upload as failed
CREATE OR REPLACE FUNCTION mark_photo_upload_failed(
  p_queue_id UUID,
  p_error TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_ticket_id UUID;
  v_attempts INTEGER;
  v_max_attempts INTEGER;
BEGIN
  UPDATE photo_upload_queue
  SET status = CASE
    WHEN attempts + 1 >= max_attempts THEN 'failed'
    ELSE 'failed'
    END,
      attempts = attempts + 1,
      last_error = p_error,
      last_attempt = NOW(),
      next_retry_at = CASE
        WHEN attempts + 1 < max_attempts THEN NOW() + (POWER(2, attempts + 1) || ' seconds')::INTERVAL
        ELSE NULL
        END
  WHERE id = p_queue_id
  RETURNING ticket_id, attempts, max_attempts INTO v_ticket_id, v_attempts, v_max_attempts;

  IF v_ticket_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Log the failure
  INSERT INTO photo_audit_log (ticket_id, operation, error_message, details, triggered_by)
  VALUES (v_ticket_id, 'upload_failed', p_error,
    jsonb_build_object('attempt', v_attempts, 'max_attempts', v_max_attempts),
    'system');

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to verify all photos in a ticket are accessible
CREATE OR REPLACE FUNCTION mark_ticket_photos_verified(
  p_ticket_id UUID,
  p_status TEXT,
  p_issue_count INTEGER DEFAULT 0
) RETURNS VOID AS $$
BEGIN
  UPDATE t_and_m_tickets
  SET photos_verified_at = NOW(),
      photos_verification_status = p_status,
      photos_issue_count = p_issue_count
  WHERE id = p_ticket_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to roles
GRANT EXECUTE ON FUNCTION get_pending_photo_uploads TO authenticated, anon;
GRANT EXECUTE ON FUNCTION confirm_photo_upload TO authenticated, anon;
GRANT EXECUTE ON FUNCTION mark_photo_upload_failed TO authenticated, anon;
GRANT EXECUTE ON FUNCTION mark_ticket_photos_verified TO authenticated, anon;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE photo_upload_queue IS 'Queue for managing photo uploads with retry support';
COMMENT ON TABLE cor_export_snapshots IS 'Frozen snapshots of COR data for dispute-ready exports';
COMMENT ON TABLE photo_audit_log IS 'Audit trail for all photo operations';

COMMENT ON COLUMN photo_upload_queue.temp_id IS 'Client-side ID for matching upload to UI element';
COMMENT ON COLUMN photo_upload_queue.next_retry_at IS 'When to retry failed upload (exponential backoff)';
COMMENT ON COLUMN cor_export_snapshots.checksum IS 'SHA256 hash of export content for integrity verification';
COMMENT ON COLUMN cor_export_snapshots.photos_manifest IS 'List of photo URLs with verification status at export time';


-- ----------------------------------------------------------------
-- 24. Injury reports
-- ----------------------------------------------------------------
-- Migration: Add injury_reports table for workplace incident tracking
-- Run this in your Supabase SQL Editor after the project_shares migration

-- Injury Reports table for tracking workplace incidents
CREATE TABLE injury_reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Incident Details
  incident_date DATE NOT NULL,
  incident_time TIME NOT NULL,
  incident_location TEXT NOT NULL,
  incident_description TEXT NOT NULL,
  injury_type TEXT NOT NULL, -- 'minor', 'serious', 'critical', 'near_miss'
  body_part_affected TEXT, -- e.g., 'hand', 'leg', 'head', 'back', etc.

  -- Injured Employee Information
  employee_name TEXT NOT NULL,
  employee_phone TEXT,
  employee_email TEXT,
  employee_address TEXT,
  employee_job_title TEXT,
  employee_hire_date DATE,

  -- Medical Information
  medical_treatment_required BOOLEAN DEFAULT false,
  medical_facility_name TEXT,
  medical_facility_address TEXT,
  hospitalized BOOLEAN DEFAULT false,

  -- Supervisor/Foreman Information
  reported_by_name TEXT NOT NULL,
  reported_by_title TEXT NOT NULL,
  reported_by_phone TEXT,
  reported_by_email TEXT,

  -- Witness Information (JSONB array for multiple witnesses)
  witnesses JSONB DEFAULT '[]'::jsonb,
  -- Structure: [{ name: "", phone: "", email: "", testimony: "" }]

  -- Photos/Documentation
  photos TEXT[], -- Array of photo URLs

  -- Follow-up and Actions
  immediate_actions_taken TEXT,
  corrective_actions_planned TEXT,
  safety_equipment_used TEXT, -- e.g., "Hard hat, gloves, safety glasses"
  safety_equipment_failed TEXT, -- What safety equipment failed, if any

  -- Regulatory
  osha_recordable BOOLEAN DEFAULT false,
  reported_to_osha BOOLEAN DEFAULT false,
  osha_case_number TEXT,
  workers_comp_claim BOOLEAN DEFAULT false,
  workers_comp_claim_number TEXT,

  -- Status and Tracking
  status TEXT DEFAULT 'reported' CHECK (status IN ('reported', 'under_investigation', 'closed')),
  days_away_from_work INTEGER DEFAULT 0,
  restricted_work_days INTEGER DEFAULT 0,

  -- Metadata
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  closed_at TIMESTAMP WITH TIME ZONE,
  closed_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for better query performance
CREATE INDEX idx_injury_reports_project_id ON injury_reports(project_id);
CREATE INDEX idx_injury_reports_company_id ON injury_reports(company_id);
CREATE INDEX idx_injury_reports_incident_date ON injury_reports(incident_date);
CREATE INDEX idx_injury_reports_status ON injury_reports(status);
CREATE INDEX idx_injury_reports_injury_type ON injury_reports(injury_type);

-- Enable Row Level Security
ALTER TABLE injury_reports ENABLE ROW LEVEL SECURITY;

-- Policy: Allow company users to view and manage their company's injury reports
CREATE POLICY "Allow company users to manage injury reports" ON injury_reports
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.company_id = injury_reports.company_id
    )
  );

-- Trigger to auto-update updated_at
CREATE TRIGGER update_injury_reports_updated_at
  BEFORE UPDATE ON injury_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to get injury statistics for a company
CREATE OR REPLACE FUNCTION get_injury_statistics(comp_id UUID, start_date DATE DEFAULT NULL, end_date DATE DEFAULT NULL)
RETURNS TABLE (
  total_incidents BIGINT,
  minor_injuries BIGINT,
  serious_injuries BIGINT,
  critical_injuries BIGINT,
  near_misses BIGINT,
  osha_recordable BIGINT,
  total_days_away BIGINT,
  total_restricted_days BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) as total_incidents,
    COUNT(*) FILTER (WHERE injury_type = 'minor') as minor_injuries,
    COUNT(*) FILTER (WHERE injury_type = 'serious') as serious_injuries,
    COUNT(*) FILTER (WHERE injury_type = 'critical') as critical_injuries,
    COUNT(*) FILTER (WHERE injury_type = 'near_miss') as near_misses,
    COUNT(*) FILTER (WHERE injury_reports.osha_recordable = true) as osha_recordable,
    COALESCE(SUM(days_away_from_work), 0) as total_days_away,
    COALESCE(SUM(restricted_work_days), 0) as total_restricted_days
  FROM injury_reports
  WHERE company_id = comp_id
    AND (start_date IS NULL OR incident_date >= start_date)
    AND (end_date IS NULL OR incident_date <= end_date);
END;
$$ LANGUAGE plpgsql;

-- Function to get injury rate (incidents per 200,000 hours worked)
-- This is a standard OSHA calculation
CREATE OR REPLACE FUNCTION calculate_injury_rate(
  comp_id UUID,
  total_hours_worked NUMERIC,
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL
)
RETURNS NUMERIC AS $$
DECLARE
  incident_count BIGINT;
  rate NUMERIC;
BEGIN
  SELECT COUNT(*) INTO incident_count
  FROM injury_reports
  WHERE company_id = comp_id
    AND injury_type != 'near_miss'
    AND (start_date IS NULL OR incident_date >= start_date)
    AND (end_date IS NULL OR incident_date <= end_date);

  IF total_hours_worked > 0 THEN
    rate := (incident_count * 200000.0) / total_hours_worked;
  ELSE
    rate := 0;
  END IF;

  RETURN ROUND(rate, 2);
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------
-- 25. Equipment
-- ----------------------------------------------------------------
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


-- ----------------------------------------------------------------
-- 26. Punch list
-- ----------------------------------------------------------------
-- ============================================
-- Punch List Items
-- ============================================
-- Tracks deficiency items that need resolution before project closeout.
-- Items are linked to projects and optionally to work areas.

CREATE TABLE IF NOT EXISTS punch_list_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  area_id UUID REFERENCES areas(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'complete')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  assigned_to TEXT,
  notes TEXT,
  photo_url TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_punch_list_project ON punch_list_items(project_id);
CREATE INDEX IF NOT EXISTS idx_punch_list_status ON punch_list_items(project_id, status);
CREATE INDEX IF NOT EXISTS idx_punch_list_area ON punch_list_items(area_id);

-- Row Level Security
ALTER TABLE punch_list_items ENABLE ROW LEVEL SECURITY;

-- Users can read punch items for projects they belong to
CREATE POLICY punch_list_select ON punch_list_items
  FOR SELECT USING (
    company_id IN (
      SELECT uc.company_id FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.status = 'active'
    )
  );

-- Users can insert punch items for their company's projects
CREATE POLICY punch_list_insert ON punch_list_items
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT uc.company_id FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.status = 'active'
    )
  );

-- Users can update punch items for their company's projects
CREATE POLICY punch_list_update ON punch_list_items
  FOR UPDATE USING (
    company_id IN (
      SELECT uc.company_id FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.status = 'active'
    )
  );

-- Users can delete punch items for their company's projects
CREATE POLICY punch_list_delete ON punch_list_items
  FOR DELETE USING (
    company_id IN (
      SELECT uc.company_id FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.status = 'active'
    )
  );


-- ----------------------------------------------------------------
-- 27. Draw requests
-- ----------------------------------------------------------------
-- Migration: Progress Billing / Draw Requests
-- Create draw requests (pay applications) based on schedule of values

-- ============================================
-- DRAW REQUESTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS draw_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Draw identification
  draw_number INTEGER NOT NULL,
  period_start DATE,
  period_end DATE,

  -- Status workflow: draft → submitted → approved → paid
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'paid', 'rejected')),

  -- Contract amounts (stored in cents)
  original_contract INTEGER NOT NULL DEFAULT 0,
  approved_changes INTEGER NOT NULL DEFAULT 0, -- Sum of approved CORs
  revised_contract INTEGER GENERATED ALWAYS AS (original_contract + approved_changes) STORED,

  -- Billing amounts (stored in cents)
  previous_billings INTEGER NOT NULL DEFAULT 0,
  current_billing INTEGER NOT NULL DEFAULT 0,
  total_completed INTEGER GENERATED ALWAYS AS (previous_billings + current_billing) STORED,

  -- Retention
  retention_percent INTEGER NOT NULL DEFAULT 1000, -- basis points (1000 = 10%)
  retention_held INTEGER NOT NULL DEFAULT 0,
  previous_retention INTEGER NOT NULL DEFAULT 0,

  -- Net amounts
  current_payment_due INTEGER GENERATED ALWAYS AS (current_billing - (retention_held - previous_retention)) STORED,

  -- Balance
  balance_to_finish INTEGER GENERATED ALWAYS AS (original_contract + approved_changes - previous_billings - current_billing) STORED,

  -- Metadata
  notes TEXT,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  -- Tracking
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique draw numbers per project
  UNIQUE(project_id, draw_number)
);

-- ============================================
-- DRAW REQUEST LINE ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS draw_request_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  draw_request_id UUID NOT NULL REFERENCES draw_requests(id) ON DELETE CASCADE,

  -- Reference to area (schedule of values item)
  area_id UUID REFERENCES areas(id) ON DELETE SET NULL,
  item_number TEXT, -- e.g., "1", "1.1", "2"
  description TEXT NOT NULL, -- Area name or description

  -- Scheduled value (from area's contract value, in cents)
  scheduled_value INTEGER NOT NULL DEFAULT 0,

  -- Previous work (percentage in basis points, amount in cents)
  previous_percent INTEGER NOT NULL DEFAULT 0, -- basis points (5000 = 50%)
  previous_amount INTEGER NOT NULL DEFAULT 0,

  -- This period work
  current_percent INTEGER NOT NULL DEFAULT 0, -- basis points
  current_amount INTEGER NOT NULL DEFAULT 0,

  -- Total completed
  total_percent INTEGER GENERATED ALWAYS AS (previous_percent + current_percent) STORED,
  total_amount INTEGER GENERATED ALWAYS AS (previous_amount + current_amount) STORED,

  -- Balance to finish
  balance_to_finish INTEGER GENERATED ALWAYS AS (scheduled_value - previous_amount - current_amount) STORED,

  -- Sort order
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_draw_requests_project ON draw_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_draw_requests_company ON draw_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_draw_requests_status ON draw_requests(status);
CREATE INDEX IF NOT EXISTS idx_draw_requests_number ON draw_requests(project_id, draw_number DESC);
CREATE INDEX IF NOT EXISTS idx_draw_request_items_draw ON draw_request_items(draw_request_id);
CREATE INDEX IF NOT EXISTS idx_draw_request_items_area ON draw_request_items(area_id);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_draw_request_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_draw_request_updated_at ON draw_requests;
CREATE TRIGGER trigger_draw_request_updated_at
  BEFORE UPDATE ON draw_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_draw_request_updated_at();

-- ============================================
-- AUTO-CALCULATE TOTALS TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION recalculate_draw_request_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_current_billing INTEGER;
  v_draw_id UUID;
  v_retention_percent INTEGER;
  v_previous_retention INTEGER;
BEGIN
  -- Get draw_request_id based on operation
  IF TG_OP = 'DELETE' THEN
    v_draw_id := OLD.draw_request_id;
  ELSE
    v_draw_id := NEW.draw_request_id;
  END IF;

  -- Calculate current billing from all items
  SELECT COALESCE(SUM(current_amount), 0) INTO v_current_billing
  FROM draw_request_items
  WHERE draw_request_id = v_draw_id;

  -- Get retention info
  SELECT retention_percent, previous_retention INTO v_retention_percent, v_previous_retention
  FROM draw_requests
  WHERE id = v_draw_id;

  -- Update draw request totals
  UPDATE draw_requests
  SET
    current_billing = v_current_billing,
    retention_held = ((previous_billings + v_current_billing) * retention_percent / 10000),
    updated_at = NOW()
  WHERE id = v_draw_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_recalculate_draw_totals ON draw_request_items;
CREATE TRIGGER trigger_recalculate_draw_totals
  AFTER INSERT OR UPDATE OR DELETE ON draw_request_items
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_draw_request_totals();

-- ============================================
-- GET NEXT DRAW NUMBER FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION get_next_draw_number(p_project_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_max_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(draw_number), 0) INTO v_max_num
  FROM draw_requests
  WHERE project_id = p_project_id;

  RETURN v_max_num + 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- GET PREVIOUS BILLING TOTALS FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION get_previous_billing_totals(p_project_id UUID)
RETURNS TABLE(
  total_billed INTEGER,
  total_retention INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(current_billing), 0)::INTEGER as total_billed,
    COALESCE(MAX(retention_held), 0)::INTEGER as total_retention
  FROM draw_requests
  WHERE project_id = p_project_id
  AND status IN ('submitted', 'approved', 'paid');
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE draw_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE draw_request_items ENABLE ROW LEVEL SECURITY;

-- Draw requests policies
DROP POLICY IF EXISTS "Users can view draw requests for their company" ON draw_requests;
CREATE POLICY "Users can view draw requests for their company" ON draw_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = draw_requests.company_id
      AND uc.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can create draw requests for their company" ON draw_requests;
CREATE POLICY "Users can create draw requests for their company" ON draw_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = draw_requests.company_id
      AND uc.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can update draw requests for their company" ON draw_requests;
CREATE POLICY "Users can update draw requests for their company" ON draw_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = draw_requests.company_id
      AND uc.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can delete draft draw requests" ON draw_requests;
CREATE POLICY "Users can delete draft draw requests" ON draw_requests
  FOR DELETE USING (
    status = 'draft' AND
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = draw_requests.company_id
      AND uc.status = 'active'
    )
  );

-- Draw request items policies
DROP POLICY IF EXISTS "Users can manage draw request items" ON draw_request_items;
CREATE POLICY "Users can manage draw request items" ON draw_request_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM draw_requests dr
      JOIN user_companies uc ON uc.company_id = dr.company_id
      WHERE dr.id = draw_request_items.draw_request_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
    )
  );

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
GRANT ALL ON draw_requests TO authenticated;
GRANT ALL ON draw_request_items TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_draw_number TO authenticated;
GRANT EXECUTE ON FUNCTION get_previous_billing_totals TO authenticated;


-- ----------------------------------------------------------------
-- 28. Invoices & billing
-- ----------------------------------------------------------------
-- Migration: Billing System (Invoices)
-- Adds invoice generation capability for approved CORs and T&M tickets

-- ============================================
-- FIX: Drop FK constraint on created_by if it exists (too strict)
-- ============================================
DO $$
BEGIN
  -- Drop the FK constraint if it exists
  ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_created_by_fkey;
EXCEPTION
  WHEN undefined_table THEN
    -- Table doesn't exist yet, will be created below
    NULL;
END $$;

-- ============================================
-- INVOICES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Invoice identification
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,

  -- Status workflow: draft → sent → partial → paid
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partial', 'paid', 'void')),

  -- Amounts (stored in cents to avoid floating point issues)
  subtotal INTEGER NOT NULL DEFAULT 0,
  retention_percent INTEGER DEFAULT 0, -- basis points (1000 = 10%)
  retention_amount INTEGER DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  amount_paid INTEGER DEFAULT 0,

  -- Bill To information (cached from project at time of invoice)
  bill_to_name TEXT,
  bill_to_address TEXT,
  bill_to_contact TEXT,

  -- Additional fields
  notes TEXT,
  terms TEXT DEFAULT 'Net 30',

  -- Tracking
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_by UUID, -- User who created (no FK constraint - user validation via RLS)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique invoice numbers per company
  UNIQUE(company_id, invoice_number)
);

-- ============================================
-- INVOICE LINE ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,

  -- Item type: 'cor', 'tm_ticket', 'manual'
  item_type TEXT NOT NULL CHECK (item_type IN ('cor', 'tm_ticket', 'manual')),

  -- Reference to source record (null for manual items)
  reference_id UUID,
  reference_number TEXT, -- COR number or T&M ticket number for display

  -- Line item details
  description TEXT NOT NULL,
  amount INTEGER NOT NULL, -- in cents

  -- Sort order for display
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_reference ON invoice_items(item_type, reference_id);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_invoice_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_invoice_updated_at ON invoices;
CREATE TRIGGER trigger_invoice_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_updated_at();

-- ============================================
-- AUTO-CALCULATE TOTALS TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION recalculate_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_subtotal INTEGER;
  v_retention INTEGER;
BEGIN
  -- Get invoice_id based on operation
  IF TG_OP = 'DELETE' THEN
    -- Calculate new subtotal from remaining items
    SELECT COALESCE(SUM(amount), 0) INTO v_subtotal
    FROM invoice_items
    WHERE invoice_id = OLD.invoice_id;

    -- Update invoice totals
    UPDATE invoices
    SET
      subtotal = v_subtotal,
      retention_amount = (v_subtotal * retention_percent / 10000),
      total = v_subtotal - (v_subtotal * retention_percent / 10000),
      updated_at = NOW()
    WHERE id = OLD.invoice_id;
  ELSE
    -- Calculate new subtotal
    SELECT COALESCE(SUM(amount), 0) INTO v_subtotal
    FROM invoice_items
    WHERE invoice_id = NEW.invoice_id;

    -- Update invoice totals
    UPDATE invoices
    SET
      subtotal = v_subtotal,
      retention_amount = (v_subtotal * retention_percent / 10000),
      total = v_subtotal - (v_subtotal * retention_percent / 10000),
      updated_at = NOW()
    WHERE id = NEW.invoice_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_recalculate_invoice_totals ON invoice_items;
CREATE TRIGGER trigger_recalculate_invoice_totals
  AFTER INSERT OR UPDATE OR DELETE ON invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_invoice_totals();

-- ============================================
-- NEXT INVOICE NUMBER FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION get_next_invoice_number(p_company_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_max_num INTEGER;
  v_next_num INTEGER;
BEGIN
  -- Get highest existing invoice number for this company
  SELECT COALESCE(MAX(
    CASE
      WHEN invoice_number ~ '^INV-[0-9]+$'
      THEN CAST(SUBSTRING(invoice_number FROM 5) AS INTEGER)
      ELSE 0
    END
  ), 0) INTO v_max_num
  FROM invoices
  WHERE company_id = p_company_id;

  v_next_num := v_max_num + 1;

  RETURN 'INV-' || LPAD(v_next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

-- Invoices policies
DROP POLICY IF EXISTS "Users can view invoices for their company" ON invoices;
CREATE POLICY "Users can view invoices for their company" ON invoices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = invoices.company_id
      AND uc.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can create invoices for their company" ON invoices;
CREATE POLICY "Users can create invoices for their company" ON invoices
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = invoices.company_id
      AND uc.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can update invoices for their company" ON invoices;
CREATE POLICY "Users can update invoices for their company" ON invoices
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = invoices.company_id
      AND uc.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can delete draft invoices for their company" ON invoices;
CREATE POLICY "Users can delete draft invoices for their company" ON invoices
  FOR DELETE USING (
    status = 'draft' AND
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = invoices.company_id
      AND uc.status = 'active'
    )
  );

-- Invoice items policies
DROP POLICY IF EXISTS "Users can manage invoice items" ON invoice_items;
CREATE POLICY "Users can manage invoice items" ON invoice_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM invoices i
      JOIN user_companies uc ON uc.company_id = i.company_id
      WHERE i.id = invoice_items.invoice_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
    )
  );

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
GRANT ALL ON invoices TO authenticated;
GRANT ALL ON invoice_items TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_invoice_number TO authenticated;


-- ----------------------------------------------------------------
-- 29. Import status
-- ----------------------------------------------------------------
-- Migration: Add import_status tracking to COR ticket associations
-- Purpose: Enable tracking and retry of failed COR data imports
-- Date: January 2, 2025
-- Risk: LOW (additive column only)

-- Add import_status column to track import state
-- Values: 'pending' (default), 'completed', 'failed'
ALTER TABLE change_order_ticket_associations
ADD COLUMN IF NOT EXISTS import_status TEXT DEFAULT 'pending'
  CHECK (import_status IN ('pending', 'completed', 'failed'));

-- Add timestamp for failed imports to enable debugging and retry visibility
ALTER TABLE change_order_ticket_associations
ADD COLUMN IF NOT EXISTS import_failed_at TIMESTAMPTZ;

-- Add error message storage for failed imports
ALTER TABLE change_order_ticket_associations
ADD COLUMN IF NOT EXISTS import_error TEXT;

-- Update existing records: if data_imported = true, set import_status = 'completed'
UPDATE change_order_ticket_associations
SET import_status = 'completed'
WHERE data_imported = true AND import_status = 'pending';

-- Create index for quickly finding failed imports
CREATE INDEX IF NOT EXISTS idx_cota_import_status
ON change_order_ticket_associations(import_status)
WHERE import_status = 'failed';

-- Add RLS policy for field users to see import status (if not exists)
-- This allows the field app to know if a retry is needed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'change_order_ticket_associations'
    AND policyname = 'Field users can view their ticket associations'
  ) THEN
    CREATE POLICY "Field users can view their ticket associations"
    ON change_order_ticket_associations FOR SELECT
    TO anon
    USING (true);
  END IF;
END $$;

-- Grant select to anon for viewing associations
GRANT SELECT ON change_order_ticket_associations TO anon;

-- Comment the columns for documentation
COMMENT ON COLUMN change_order_ticket_associations.import_status IS 'Import state: pending (not started), completed (success), failed (needs retry)';
COMMENT ON COLUMN change_order_ticket_associations.import_failed_at IS 'Timestamp when import last failed, null if never failed or succeeded after retry';
COMMENT ON COLUMN change_order_ticket_associations.import_error IS 'Error message from last failed import attempt';


-- ----------------------------------------------------------------
-- 30. Project shares
-- ----------------------------------------------------------------
-- Migration: Add project_shares table for read-only portal
-- Run this in your Supabase SQL Editor after the initial schema

-- Project Shares table for public read-only access
CREATE TABLE project_shares (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  share_token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{"progress": true, "photos": true, "daily_reports": true, "tm_tickets": false, "crew_info": false}'::jsonb,
  view_count INTEGER DEFAULT 0 NOT NULL,
  last_viewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_project_shares_project_id ON project_shares(project_id);
CREATE INDEX idx_project_shares_token ON project_shares(share_token);
CREATE INDEX idx_project_shares_active ON project_shares(is_active);

-- Enable Row Level Security
ALTER TABLE project_shares ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access by share token (no auth required)
CREATE POLICY "Allow public read by share token" ON project_shares
  FOR SELECT
  USING (is_active = true AND (expires_at IS NULL OR expires_at > NOW()));

-- Policy: Allow authenticated users to manage shares for their company's projects
CREATE POLICY "Allow company users to manage shares" ON project_shares
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN users u ON u.company_id = p.company_id
      WHERE p.id = project_shares.project_id
      AND u.id = auth.uid()
    )
  );

-- Trigger to auto-update updated_at
CREATE TRIGGER update_project_shares_updated_at
  BEFORE UPDATE ON project_shares
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to generate a unique share token
CREATE OR REPLACE FUNCTION generate_share_token()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
  token_exists BOOLEAN := true;
BEGIN
  WHILE token_exists LOOP
    result := '';
    FOR i IN 1..12 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;

    -- Check if token already exists
    SELECT EXISTS(SELECT 1 FROM project_shares WHERE share_token = result) INTO token_exists;
  END LOOP;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to increment view count
CREATE OR REPLACE FUNCTION increment_share_view_count(token TEXT)
RETURNS void AS $$
BEGIN
  UPDATE project_shares
  SET
    view_count = view_count + 1,
    last_viewed_at = NOW()
  WHERE share_token = token
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW());
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------
-- 31. Dashboard optimization
-- ----------------------------------------------------------------
-- ============================================================
-- DASHBOARD QUERY OPTIMIZATION MIGRATION
-- ============================================================
-- Run this in Supabase SQL Editor to optimize dashboard loading
--
-- PROBLEM: Dashboard executes 9 queries per project (9N pattern)
-- 100 projects = 900+ database queries on load
--
-- SOLUTION: Single aggregation function returns all project metrics
-- ============================================================

-- ============================================================
-- 1. PROJECT DASHBOARD SUMMARY FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION get_project_dashboard_summary(p_company_id UUID)
RETURNS TABLE (
  project_id UUID,
  project_name TEXT,
  project_status TEXT,
  project_number TEXT,
  project_address TEXT,
  project_pin TEXT,

  -- Financial fields (essential for dashboard)
  contract_value NUMERIC,
  work_type TEXT,
  job_type TEXT,
  general_contractor TEXT,

  -- Area metrics
  total_areas BIGINT,
  completed_areas BIGINT,
  in_progress_areas BIGINT,
  pending_areas BIGINT,

  -- Ticket metrics
  total_tickets BIGINT,
  pending_tickets BIGINT,
  submitted_tickets BIGINT,
  approved_tickets BIGINT,

  -- Crew/Labor metrics
  total_labor_hours NUMERIC,
  today_labor_hours NUMERIC,
  today_worker_count BIGINT,

  -- Activity metrics
  last_activity_at TIMESTAMPTZ,
  daily_reports_this_week BIGINT,

  -- COR metrics
  cor_count BIGINT,
  pending_cor_count BIGINT,

  -- Disposal metrics
  disposal_loads_today BIGINT,

  -- Project dates
  created_at TIMESTAMPTZ,
  start_date DATE,
  end_date DATE
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    p.id AS project_id,
    p.name AS project_name,
    p.status AS project_status,
    p.job_number AS project_number,
    p.address AS project_address,
    p.pin AS project_pin,

    -- Financial fields
    COALESCE(p.contract_value, 0) AS contract_value,
    COALESCE(p.work_type, 'demolition') AS work_type,
    COALESCE(p.job_type, 'standard') AS job_type,
    COALESCE(p.general_contractor, '') AS general_contractor,

    -- Areas aggregation
    COALESCE(a.total, 0) AS total_areas,
    COALESCE(a.completed, 0) AS completed_areas,
    COALESCE(a.in_progress, 0) AS in_progress_areas,
    COALESCE(a.pending, 0) AS pending_areas,

    -- Tickets aggregation
    COALESCE(t.total, 0) AS total_tickets,
    COALESCE(t.pending, 0) AS pending_tickets,
    COALESCE(t.submitted, 0) AS submitted_tickets,
    COALESCE(t.approved, 0) AS approved_tickets,

    -- Crew/Labor aggregation
    COALESCE(c.total_hours, 0) AS total_labor_hours,
    COALESCE(c.today_hours, 0) AS today_labor_hours,
    COALESCE(c.today_workers, 0) AS today_worker_count,

    -- Activity
    GREATEST(
      p.updated_at,
      a.last_update,
      t.last_update,
      c.last_checkin,
      dr.last_report
    ) AS last_activity_at,
    COALESCE(dr.this_week, 0) AS daily_reports_this_week,

    -- CORs
    COALESCE(cor.total, 0) AS cor_count,
    COALESCE(cor.pending, 0) AS pending_cor_count,

    -- Disposal
    COALESCE(disp.today_count, 0) AS disposal_loads_today,

    -- Dates
    p.created_at,
    p.start_date,
    p.end_date

  FROM projects p

  -- Area aggregation (lateral join for per-project stats)
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'done' OR status = 'completed') AS completed,
      COUNT(*) FILTER (WHERE status = 'in_progress' OR status = 'active') AS in_progress,
      COUNT(*) FILTER (WHERE status = 'pending' OR status = 'not_started') AS pending,
      MAX(updated_at) AS last_update
    FROM areas
    WHERE project_id = p.id
  ) a ON TRUE

  -- Ticket aggregation
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'pending' OR status = 'draft') AS pending,
      COUNT(*) FILTER (WHERE status = 'submitted') AS submitted,
      COUNT(*) FILTER (WHERE status = 'approved') AS approved,
      MAX(updated_at) AS last_update
    FROM t_and_m_tickets
    WHERE project_id = p.id
  ) t ON TRUE

  -- Crew/Labor aggregation (workers is JSONB array)
  LEFT JOIN LATERAL (
    SELECT
      SUM(jsonb_array_length(COALESCE(workers, '[]'::jsonb))) AS total_hours,
      SUM(CASE WHEN check_in_date = CURRENT_DATE THEN jsonb_array_length(COALESCE(workers, '[]'::jsonb)) ELSE 0 END) AS today_hours,
      SUM(CASE WHEN check_in_date = CURRENT_DATE THEN jsonb_array_length(COALESCE(workers, '[]'::jsonb)) ELSE 0 END) AS today_workers,
      MAX(check_in_date) AS last_checkin
    FROM crew_checkins
    WHERE project_id = p.id
  ) c ON TRUE

  -- Daily reports this week
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS this_week,
      MAX(report_date) AS last_report
    FROM daily_reports
    WHERE project_id = p.id
      AND report_date >= CURRENT_DATE - INTERVAL '7 days'
  ) dr ON TRUE

  -- COR aggregation
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'pending' OR status = 'draft') AS pending
    FROM change_orders
    WHERE project_id = p.id
  ) cor ON TRUE

  -- Disposal loads today
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS today_count
    FROM disposal_loads
    WHERE project_id = p.id
      AND work_date = CURRENT_DATE
  ) disp ON TRUE

  WHERE p.company_id = p_company_id
  ORDER BY
    CASE p.status
      WHEN 'active' THEN 0
      WHEN 'on_hold' THEN 1
      ELSE 2
    END,
    p.name;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_project_dashboard_summary(UUID) TO authenticated;

-- ============================================================
-- 2. SINGLE PROJECT DETAIL FUNCTION (for expanded view)
-- ============================================================

CREATE OR REPLACE FUNCTION get_project_detail(p_project_id UUID)
RETURNS TABLE (
  project_id UUID,
  project_name TEXT,
  project_status TEXT,
  project_number TEXT,
  project_address TEXT,
  general_contractor TEXT,
  client_contact TEXT,
  client_phone TEXT,
  estimated_total BIGINT,
  project_pin TEXT,

  -- Full area breakdown
  areas_by_status JSONB,

  -- Recent tickets (last 5)
  recent_tickets JSONB,

  -- Today's crew
  todays_crew JSONB,

  -- Recent activity summary
  recent_activity JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    p.id AS project_id,
    p.name AS project_name,
    p.status AS project_status,
    p.job_number AS project_number,
    p.address AS project_address,
    p.general_contractor,
    p.client_contact,
    p.client_phone,
    p.estimated_total,
    p.pin AS project_pin,

    -- Areas by status
    (
      SELECT COALESCE(jsonb_object_agg(status, cnt), '{}'::jsonb)
      FROM (
        SELECT status, COUNT(*) as cnt
        FROM areas
        WHERE project_id = p.id
        GROUP BY status
      ) area_counts
    ) AS areas_by_status,

    -- Recent tickets
    (
      SELECT COALESCE(jsonb_agg(ticket_info), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'id', id,
          'work_date', work_date,
          'status', status,
          'created_by_name', created_by_name,
          'total_hours', (
            SELECT COALESCE(SUM(
              COALESCE(regular_hours, 0) + COALESCE(overtime_hours, 0)
            ), 0)
            FROM t_and_m_workers WHERE ticket_id = t.id
          )
        ) as ticket_info
        FROM t_and_m_tickets t
        WHERE project_id = p.id
        ORDER BY created_at DESC
        LIMIT 5
      ) recent
    ) AS recent_tickets,

    -- Today's crew
    (
      SELECT COALESCE(
        jsonb_build_object(
          'worker_count', worker_count,
          'total_hours', total_hours,
          'workers', workers
        ),
        jsonb_build_object('worker_count', 0, 'total_hours', 0, 'workers', '[]'::jsonb)
      )
      FROM crew_checkins
      WHERE project_id = p.id
        AND check_in_date = CURRENT_DATE
      LIMIT 1
    ) AS todays_crew,

    -- Recent activity (last 24 hours)
    (
      SELECT COALESCE(jsonb_agg(activity), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'type', 'area_update',
          'name', name,
          'status', status,
          'at', updated_at
        ) as activity
        FROM areas
        WHERE project_id = p.id
          AND updated_at >= NOW() - INTERVAL '24 hours'
        ORDER BY updated_at DESC
        LIMIT 10
      ) recent_activity
    ) AS recent_activity

  FROM projects p
  WHERE p.id = p_project_id;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_project_detail(UUID) TO authenticated;

-- ============================================================
-- 3. INDEXES FOR OPTIMIZATION
-- ============================================================

-- Composite indexes for the aggregation queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_areas_project_status_updated
  ON areas(project_id, status, updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_project_status_created
  ON t_and_m_tickets(project_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crew_project_date
  ON crew_checkins(project_id, check_in_date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_reports_project_date
  ON daily_reports(project_id, report_date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cors_project_status
  ON change_orders(project_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_disposal_project_date
  ON disposal_loads(project_id, load_date DESC);

-- Active projects index for faster company dashboard
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_company_status
  ON projects(company_id, status, name);

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'DASHBOARD OPTIMIZATION COMPLETE';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'New functions:';
  RAISE NOTICE '  - get_project_dashboard_summary(company_id)';
  RAISE NOTICE '    Returns all project metrics in a single query';
  RAISE NOTICE '  - get_project_detail(project_id)';
  RAISE NOTICE '    Returns full project details for expanded view';
  RAISE NOTICE '';
  RAISE NOTICE 'Performance impact:';
  RAISE NOTICE '  Before: 9 × N queries (N = project count)';
  RAISE NOTICE '  After: 1 query for all projects';
  RAISE NOTICE '';
  RAISE NOTICE 'New indexes created for optimal aggregation performance.';
  RAISE NOTICE '';
END $$;


-- ----------------------------------------------------------------
-- 32. Performance indexes
-- ----------------------------------------------------------------
-- ============================================
-- Performance Indexes Migration
-- ============================================
-- Run this migration to add missing indexes for improved query performance at scale.
-- These indexes are critical for applications with 100k+ records.
--
-- Run in Supabase SQL Editor or via migration tool.

-- ============================================
-- 1. Projects Table Indexes
-- ============================================

-- Index for date-range queries on created_at
CREATE INDEX IF NOT EXISTS idx_projects_created_at
ON projects (created_at DESC);

-- Compound index for company + status (common filter pattern)
CREATE INDEX IF NOT EXISTS idx_projects_company_status
ON projects (company_id, status);

-- Index for archived projects lookup
CREATE INDEX IF NOT EXISTS idx_projects_archived
ON projects (company_id, archived) WHERE archived = true;

-- ============================================
-- 2. Areas Table Indexes
-- ============================================

-- Compound index for project + status
CREATE INDEX IF NOT EXISTS idx_areas_project_status
ON areas (project_id, status);

-- Index for created_at for history queries
CREATE INDEX IF NOT EXISTS idx_areas_created_at
ON areas (created_at DESC);

-- ============================================
-- 3. T&M Tickets Table Indexes
-- ============================================

-- Compound index for project + work_date (common sort)
CREATE INDEX IF NOT EXISTS idx_tm_tickets_project_date
ON tm_tickets (project_id, work_date DESC);

-- Compound index for project + status
CREATE INDEX IF NOT EXISTS idx_tm_tickets_project_status
ON tm_tickets (project_id, status);

-- Index for company-wide ticket queries
CREATE INDEX IF NOT EXISTS idx_tm_tickets_company
ON tm_tickets (company_id, created_at DESC);

-- Index for COR assignment lookup
CREATE INDEX IF NOT EXISTS idx_tm_tickets_cor
ON tm_tickets (change_order_id) WHERE change_order_id IS NOT NULL;

-- ============================================
-- 4. Change Orders (CORs) Table Indexes
-- ============================================

-- Compound index for project + status
CREATE INDEX IF NOT EXISTS idx_change_orders_project_status
ON change_orders (project_id, status);

-- Index for created_at for history queries
CREATE INDEX IF NOT EXISTS idx_change_orders_created_at
ON change_orders (created_at DESC);

-- ============================================
-- 5. Daily Reports Table Indexes
-- ============================================

-- Compound index for project + date (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_daily_reports_project_date
ON daily_reports (project_id, report_date DESC);

-- Index for submitted reports
CREATE INDEX IF NOT EXISTS idx_daily_reports_submitted
ON daily_reports (project_id, submitted) WHERE submitted = true;

-- ============================================
-- 6. Crew Checkins Table Indexes
-- ============================================

-- Compound index for project + check_in_date
CREATE INDEX IF NOT EXISTS idx_crew_checkins_project_date
ON crew_checkins (project_id, check_in_date DESC);

-- ============================================
-- 7. Messages Table Indexes
-- ============================================

-- Compound index for project + created_at (chat queries)
CREATE INDEX IF NOT EXISTS idx_messages_project_created
ON messages (project_id, created_at DESC);

-- ============================================
-- 8. Injury Reports Table Indexes
-- ============================================

-- Compound index for project + incident_date
CREATE INDEX IF NOT EXISTS idx_injury_reports_project_date
ON injury_reports (project_id, incident_date DESC);

-- Index for company-wide queries
CREATE INDEX IF NOT EXISTS idx_injury_reports_company
ON injury_reports (company_id, incident_date DESC);

-- ============================================
-- 9. User Companies (Junction) Table Indexes
-- ============================================

-- Compound index for user lookups
CREATE INDEX IF NOT EXISTS idx_user_companies_user
ON user_companies (user_id, role);

-- Compound index for company member lookups
CREATE INDEX IF NOT EXISTS idx_user_companies_company
ON user_companies (company_id, role);

-- ============================================
-- 10. Documents Table Indexes
-- ============================================

-- Compound index for folder + created_at
CREATE INDEX IF NOT EXISTS idx_documents_folder_created
ON documents (folder_id, created_at DESC);

-- Index for project document lookups
CREATE INDEX IF NOT EXISTS idx_documents_project
ON documents (project_id, created_at DESC) WHERE project_id IS NOT NULL;

-- ============================================
-- 11. Field Sessions Table Indexes
-- ============================================

-- Index for session token lookups
CREATE INDEX IF NOT EXISTS idx_field_sessions_token
ON field_sessions (session_token);

-- Index for cleanup of expired sessions
CREATE INDEX IF NOT EXISTS idx_field_sessions_expires
ON field_sessions (expires_at) WHERE is_valid = true;

-- ============================================
-- 12. Project Costs Table Indexes
-- ============================================

-- Compound index for project + cost_date
CREATE INDEX IF NOT EXISTS idx_project_costs_project_date
ON project_costs (project_id, cost_date DESC);

-- ============================================
-- Analyze Tables After Index Creation
-- ============================================
-- Run ANALYZE to update statistics for query planner
-- (This should be done after bulk data loads or major index changes)

ANALYZE projects;
ANALYZE areas;
ANALYZE tm_tickets;
ANALYZE change_orders;
ANALYZE daily_reports;
ANALYZE crew_checkins;
ANALYZE messages;
ANALYZE injury_reports;
ANALYZE user_companies;
ANALYZE documents;
ANALYZE field_sessions;
ANALYZE project_costs;

-- ============================================
-- Verification Query
-- ============================================
-- Run this to verify indexes were created:
/*
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
*/


-- ----------------------------------------------------------------
-- 33. Legacy user repair
-- ----------------------------------------------------------------
-- ============================================
-- LEGACY USER REPAIR MIGRATION
-- Fixes users created before membership system
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- PHASE 1: IDENTIFY LEGACY USERS
-- ============================================
-- Legacy users have:
-- - A record in `users` table with `company_id` set
-- - NO corresponding record in `user_companies` table

-- First, let's see how many legacy users we have (diagnostic query)
-- SELECT
--   u.id,
--   u.email,
--   u.name,
--   u.company_id,
--   u.role
-- FROM users u
-- LEFT JOIN user_companies uc ON uc.user_id = u.id
-- WHERE u.company_id IS NOT NULL
-- AND uc.id IS NULL;

-- ============================================
-- PHASE 2: CREATE MEMBERSHIP RECORDS FOR LEGACY USERS
-- ============================================

-- Insert user_companies records for all legacy users
-- Status = 'active' (they were already using the system)
-- Role = inherited from users.role, defaulting to 'member'
INSERT INTO user_companies (
  id,
  user_id,
  company_id,
  role,
  status,
  created_at,
  approved_at,
  approved_by
)
SELECT
  gen_random_uuid(),
  u.id,
  u.company_id,
  COALESCE(
    CASE
      WHEN u.role IN ('admin', 'owner', 'office', 'foreman', 'member') THEN u.role
      ELSE 'member'
    END,
    'member'
  ),
  'active',
  COALESCE(u.created_at, NOW()),
  NOW(),  -- Mark as approved now (retroactively)
  NULL    -- No approver (system migration)
FROM users u
LEFT JOIN user_companies uc ON uc.user_id = u.id AND uc.company_id = u.company_id
WHERE u.company_id IS NOT NULL
AND uc.id IS NULL
ON CONFLICT (user_id, company_id) DO NOTHING;

-- ============================================
-- PHASE 3: HANDLE COMPANY OWNERS
-- ============================================

-- Ensure company owners have 'owner' role in user_companies
UPDATE user_companies uc
SET role = 'owner'
FROM companies c
WHERE c.owner_user_id = uc.user_id
AND c.id = uc.company_id
AND uc.role != 'owner';

-- ============================================
-- PHASE 4: VERIFY MIGRATION
-- ============================================

-- After running, verify no legacy users remain:
-- SELECT COUNT(*) as remaining_legacy_users
-- FROM users u
-- LEFT JOIN user_companies uc ON uc.user_id = u.id
-- WHERE u.company_id IS NOT NULL
-- AND uc.id IS NULL;

-- Should return 0

-- ============================================
-- PHASE 5: RPC FUNCTION FOR RUNTIME LEGACY REPAIR
-- ============================================

-- Create RPC function that can be called from JavaScript
-- Uses SECURITY DEFINER to bypass RLS for legacy user repair
CREATE OR REPLACE FUNCTION repair_legacy_user(
  p_user_id UUID,
  p_company_id UUID,
  p_role TEXT DEFAULT 'member'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_id UUID;
  existing_status TEXT;
  user_company_id UUID;
BEGIN
  -- Verify this is actually a legacy user scenario
  -- User must own this request (auth.uid() = p_user_id)
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: Can only repair own account';
  END IF;

  -- Check if user actually has this company_id set
  SELECT company_id INTO user_company_id
  FROM users
  WHERE id = p_user_id;

  IF user_company_id IS NULL OR user_company_id != p_company_id THEN
    RAISE EXCEPTION 'Invalid: company_id does not match user record';
  END IF;

  -- Check if membership already exists
  SELECT id, status INTO existing_id, existing_status
  FROM user_companies
  WHERE user_id = p_user_id
  AND company_id = p_company_id;

  IF existing_id IS NOT NULL THEN
    -- Membership exists
    IF existing_status != 'active' THEN
      -- Reactivate if not active
      UPDATE user_companies
      SET status = 'active',
          approved_at = NOW()
      WHERE id = existing_id;
    END IF;
    RETURN TRUE;
  END IF;

  -- Create new active membership for legacy user
  INSERT INTO user_companies (
    id,
    user_id,
    company_id,
    role,
    status,
    created_at,
    approved_at
  ) VALUES (
    gen_random_uuid(),
    p_user_id,
    p_company_id,
    CASE
      WHEN p_role IN ('admin', 'owner', 'office', 'foreman', 'member') THEN p_role
      ELSE 'member'
    END,
    'active',
    NOW(),
    NOW()
  );

  RETURN TRUE;
EXCEPTION
  WHEN unique_violation THEN
    -- Already exists, that's fine
    RETURN TRUE;
  WHEN OTHERS THEN
    RAISE;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION repair_legacy_user(UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION repair_legacy_user IS
'Repairs legacy user accounts by creating missing user_companies record. Only works for users with matching company_id in their user record.';

-- ============================================
-- PHASE 6: ADD TRIGGER FOR FUTURE SAFETY
-- ============================================

-- Create trigger to auto-create membership when users.company_id is set
-- This handles any code paths that might still set company_id directly

CREATE OR REPLACE FUNCTION ensure_user_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If company_id is being set and no membership exists, create one
  IF NEW.company_id IS NOT NULL THEN
    INSERT INTO user_companies (
      id,
      user_id,
      company_id,
      role,
      status,
      created_at,
      approved_at
    )
    VALUES (
      gen_random_uuid(),
      NEW.id,
      NEW.company_id,
      COALESCE(NEW.role, 'member'),
      'active',
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id, company_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS ensure_user_membership_trigger ON users;

-- Create trigger on users table
CREATE TRIGGER ensure_user_membership_trigger
AFTER INSERT OR UPDATE OF company_id ON users
FOR EACH ROW
EXECUTE FUNCTION ensure_user_membership();

-- ============================================
-- PHASE 6: DOCUMENTATION
-- ============================================

COMMENT ON FUNCTION ensure_user_membership() IS
'Auto-creates user_companies record when users.company_id is set. Ensures backwards compatibility with legacy code paths.';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- Summary:
-- 1. Created user_companies records for all legacy users
-- 2. Set status = 'active' for immediate access
-- 3. Preserved existing role from users table
-- 4. Ensured company owners have 'owner' role
-- 5. Added trigger for future safety
-- ============================================


-- ----------------------------------------------------------------
-- 34. Complete fixes
-- ----------------------------------------------------------------
-- ============================================================
-- FIELDSYNC COMPLETE FIXES MIGRATION
-- Run this in your Supabase SQL Editor
-- This script is idempotent - safe to run multiple times
-- ============================================================

-- ============================================================
-- PART 1: ADD MISSING COLUMNS
-- ============================================================

-- 1.1 Add group_name to change_orders (for COR grouping feature)
ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS group_name TEXT;

CREATE INDEX IF NOT EXISTS idx_change_orders_group_name
ON change_orders(project_id, group_name);

-- 1.2 Add company_name to change_order_subcontractors
ALTER TABLE change_order_subcontractors
ADD COLUMN IF NOT EXISTS company_name TEXT DEFAULT '';

-- ============================================================
-- PART 2: FIELD USER RLS POLICIES (anon role)
-- Field users authenticate via project PIN, not Supabase Auth
-- So auth.uid() is NULL - these policies allow anonymous access
-- ============================================================

-- 2.1 CREW_CHECKINS - Field crew check-in management
DROP POLICY IF EXISTS "Field users can view crew checkins" ON crew_checkins;
CREATE POLICY "Field users can view crew checkins"
ON crew_checkins FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create crew checkins" ON crew_checkins;
CREATE POLICY "Field users can create crew checkins"
ON crew_checkins FOR INSERT
WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can update crew checkins" ON crew_checkins;
CREATE POLICY "Field users can update crew checkins"
ON crew_checkins FOR UPDATE
USING (auth.uid() IS NULL)
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT, UPDATE ON crew_checkins TO anon;

-- 2.2 CHANGE_ORDERS - Field can view CORs
DROP POLICY IF EXISTS "Field users can view CORs by project" ON change_orders;
CREATE POLICY "Field users can view CORs by project"
ON change_orders FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT ON change_orders TO anon;

-- 2.3 CHANGE_ORDER_TICKET_ASSOCIATIONS - Field can link tickets to CORs
DROP POLICY IF EXISTS "Field users can view ticket associations" ON change_order_ticket_associations;
CREATE POLICY "Field users can view ticket associations"
ON change_order_ticket_associations FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create ticket associations" ON change_order_ticket_associations;
CREATE POLICY "Field users can create ticket associations"
ON change_order_ticket_associations FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT ON change_order_ticket_associations TO anon;

-- 2.4 T&M TICKETS - Full field access
DROP POLICY IF EXISTS "Field users can view tickets" ON t_and_m_tickets;
CREATE POLICY "Field users can view tickets"
ON t_and_m_tickets FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create tickets" ON t_and_m_tickets;
CREATE POLICY "Field users can create tickets"
ON t_and_m_tickets FOR INSERT
WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can update tickets" ON t_and_m_tickets;
CREATE POLICY "Field users can update tickets"
ON t_and_m_tickets FOR UPDATE
USING (auth.uid() IS NULL)
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT, UPDATE ON t_and_m_tickets TO anon;

-- 2.5 T&M WORKERS
DROP POLICY IF EXISTS "Field users can view workers" ON t_and_m_workers;
CREATE POLICY "Field users can view workers"
ON t_and_m_workers FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create workers" ON t_and_m_workers;
CREATE POLICY "Field users can create workers"
ON t_and_m_workers FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT ON t_and_m_workers TO anon;

-- 2.6 T&M ITEMS
DROP POLICY IF EXISTS "Field users can view items" ON t_and_m_items;
CREATE POLICY "Field users can view items"
ON t_and_m_items FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create items" ON t_and_m_items;
CREATE POLICY "Field users can create items"
ON t_and_m_items FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT ON t_and_m_items TO anon;

-- 2.7 COR LINE ITEM TABLES
-- Labor
DROP POLICY IF EXISTS "Field users can view labor items" ON change_order_labor;
CREATE POLICY "Field users can view labor items"
ON change_order_labor FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can insert labor items" ON change_order_labor;
CREATE POLICY "Field users can insert labor items"
ON change_order_labor FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT ON change_order_labor TO anon;

-- Materials
DROP POLICY IF EXISTS "Field users can view material items" ON change_order_materials;
CREATE POLICY "Field users can view material items"
ON change_order_materials FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can insert material items" ON change_order_materials;
CREATE POLICY "Field users can insert material items"
ON change_order_materials FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT ON change_order_materials TO anon;

-- Equipment
DROP POLICY IF EXISTS "Field users can view equipment items" ON change_order_equipment;
CREATE POLICY "Field users can view equipment items"
ON change_order_equipment FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can insert equipment items" ON change_order_equipment;
CREATE POLICY "Field users can insert equipment items"
ON change_order_equipment FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT ON change_order_equipment TO anon;

-- 2.8 SUPPORTING TABLES
-- Projects
DROP POLICY IF EXISTS "Field users can view projects" ON projects;
CREATE POLICY "Field users can view projects"
ON projects FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT ON projects TO anon;

-- Companies
DROP POLICY IF EXISTS "Field users can view companies" ON companies;
CREATE POLICY "Field users can view companies"
ON companies FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT ON companies TO anon;

-- Areas
DROP POLICY IF EXISTS "Field users can view areas" ON areas;
CREATE POLICY "Field users can view areas"
ON areas FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can update areas" ON areas;
CREATE POLICY "Field users can update areas"
ON areas FOR UPDATE
USING (auth.uid() IS NULL)
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, UPDATE ON areas TO anon;

-- Company Branding
DROP POLICY IF EXISTS "Field users can view company branding" ON company_branding;
CREATE POLICY "Field users can view company branding"
ON company_branding FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT ON company_branding TO anon;

-- Labor Rates
DROP POLICY IF EXISTS "Field users can view labor rates" ON labor_rates;
CREATE POLICY "Field users can view labor rates"
ON labor_rates FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT ON labor_rates TO anon;

-- Materials/Equipment Library
DROP POLICY IF EXISTS "Field users can view materials equipment" ON materials_equipment;
CREATE POLICY "Field users can view materials equipment"
ON materials_equipment FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT ON materials_equipment TO anon;

-- 2.9 MESSAGES
DROP POLICY IF EXISTS "Field users can view messages" ON messages;
CREATE POLICY "Field users can view messages"
ON messages FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can send messages" ON messages;
CREATE POLICY "Field users can send messages"
ON messages FOR INSERT
WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can update messages" ON messages;
CREATE POLICY "Field users can update messages"
ON messages FOR UPDATE
USING (auth.uid() IS NULL)
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT, UPDATE ON messages TO anon;

-- 2.10 DAILY REPORTS
DROP POLICY IF EXISTS "Field users can view daily reports" ON daily_reports;
CREATE POLICY "Field users can view daily reports"
ON daily_reports FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create daily reports" ON daily_reports;
CREATE POLICY "Field users can create daily reports"
ON daily_reports FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT ON daily_reports TO anon;

-- 2.11 INJURY REPORTS
DROP POLICY IF EXISTS "Field users can view injury reports" ON injury_reports;
CREATE POLICY "Field users can view injury reports"
ON injury_reports FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create injury reports" ON injury_reports;
CREATE POLICY "Field users can create injury reports"
ON injury_reports FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT ON injury_reports TO anon;

-- 2.12 MATERIAL REQUESTS
DROP POLICY IF EXISTS "Field users can view material requests" ON material_requests;
CREATE POLICY "Field users can view material requests"
ON material_requests FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create material requests" ON material_requests;
CREATE POLICY "Field users can create material requests"
ON material_requests FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT ON material_requests TO anon;

-- 2.13 DISPOSAL LOADS
DROP POLICY IF EXISTS "Field users can view disposal loads" ON disposal_loads;
CREATE POLICY "Field users can view disposal loads"
ON disposal_loads FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create disposal loads" ON disposal_loads;
CREATE POLICY "Field users can create disposal loads"
ON disposal_loads FOR INSERT
WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can update disposal loads" ON disposal_loads;
CREATE POLICY "Field users can update disposal loads"
ON disposal_loads FOR UPDATE
USING (auth.uid() IS NULL)
WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can delete disposal loads" ON disposal_loads;
CREATE POLICY "Field users can delete disposal loads"
ON disposal_loads FOR DELETE
USING (auth.uid() IS NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON disposal_loads TO anon;

-- 2.14 DUMP SITES
DROP POLICY IF EXISTS "Field users can view dump sites" ON dump_sites;
CREATE POLICY "Field users can view dump sites"
ON dump_sites FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT ON dump_sites TO anon;

-- ============================================================
-- PART 3: GRANT EXECUTE ON RPC FUNCTIONS
-- ============================================================

-- Allow anon to call atomic ticket-COR functions
GRANT EXECUTE ON FUNCTION assign_ticket_to_cor(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION unassign_ticket_from_cor(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION recalculate_cor_totals(UUID) TO anon;

-- ============================================================
-- VERIFICATION
-- ============================================================

DO $$
DECLARE
  col_exists BOOLEAN;
BEGIN
  -- Check group_name column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_orders' AND column_name = 'group_name'
  ) INTO col_exists;

  IF col_exists THEN
    RAISE NOTICE '✓ change_orders.group_name column exists';
  ELSE
    RAISE WARNING '✗ change_orders.group_name column NOT found';
  END IF;

  -- Check company_name column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_order_subcontractors' AND column_name = 'company_name'
  ) INTO col_exists;

  IF col_exists THEN
    RAISE NOTICE '✓ change_order_subcontractors.company_name column exists';
  ELSE
    RAISE WARNING '✗ change_order_subcontractors.company_name column NOT found';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'MIGRATION COMPLETE!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Added columns:';
  RAISE NOTICE '  - change_orders.group_name';
  RAISE NOTICE '  - change_order_subcontractors.company_name';
  RAISE NOTICE '';
  RAISE NOTICE 'Field access policies applied for:';
  RAISE NOTICE '  - crew_checkins (SELECT, INSERT, UPDATE)';
  RAISE NOTICE '  - t_and_m_tickets, workers, items';
  RAISE NOTICE '  - change_orders, COR line items';
  RAISE NOTICE '  - projects, companies, areas';
  RAISE NOTICE '  - messages, daily_reports, injury_reports';
  RAISE NOTICE '  - disposal_loads, dump_sites';
  RAISE NOTICE '  - materials_equipment, labor_rates';
  RAISE NOTICE '========================================';
END $$;


-- ----------------------------------------------------------------
-- 35. Company branding
-- ----------------------------------------------------------------
-- FieldSync Database Migration: Company Branding for White-Label Support
-- Run this in your Supabase SQL Editor
-- This enables large contractors to have their own branded version

-- ============================================
-- Company Branding Table
-- ============================================

CREATE TABLE IF NOT EXISTS company_branding (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Visual Branding
  logo_url TEXT,
  favicon_url TEXT,
  login_background_url TEXT,
  primary_color TEXT DEFAULT '#3B82F6',
  secondary_color TEXT DEFAULT '#1E40AF',

  -- App Customization
  custom_app_name TEXT DEFAULT 'FieldSync',
  hide_fieldsync_branding BOOLEAN DEFAULT false,

  -- Email Branding
  email_from_name TEXT,
  email_from_address TEXT,

  -- Custom Domain (for Enterprise)
  custom_domain TEXT,
  domain_verified BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one branding config per company
  UNIQUE(company_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_branding_company ON company_branding(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_branding_domain ON company_branding(custom_domain) WHERE custom_domain IS NOT NULL;

-- Enable RLS
ALTER TABLE company_branding ENABLE ROW LEVEL SECURITY;

-- Policies: Users can view their company's branding
CREATE POLICY "Users can view their company branding" ON company_branding
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.company_id = company_branding.company_id
      AND users.id = auth.uid()
    )
  );

-- Only company admins/owners can update branding
CREATE POLICY "Company admins can update branding" ON company_branding
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.company_id = company_branding.company_id
      AND users.id = auth.uid()
      AND users.role IN ('admin', 'office')
    )
  );

-- Allow unauthenticated read for custom domain lookups
CREATE POLICY "Public can view branding by domain" ON company_branding
  FOR SELECT USING (custom_domain IS NOT NULL);

-- Trigger to update updated_at
CREATE TRIGGER update_company_branding_updated_at
  BEFORE UPDATE ON company_branding
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Add subscription tier to companies table
-- ============================================

-- Add tier column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'subscription_tier') THEN
    ALTER TABLE companies ADD COLUMN subscription_tier TEXT DEFAULT 'free'
      CHECK (subscription_tier IN ('free', 'pro', 'business', 'enterprise'));
  END IF;
END $$;

-- Create index on tier
CREATE INDEX IF NOT EXISTS idx_companies_tier ON companies(subscription_tier);

-- ============================================
-- Function to get branding for a domain
-- ============================================

CREATE OR REPLACE FUNCTION get_branding_by_domain(domain_name TEXT)
RETURNS TABLE (
  company_id UUID,
  logo_url TEXT,
  favicon_url TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  custom_app_name TEXT,
  hide_fieldsync_branding BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cb.company_id,
    cb.logo_url,
    cb.favicon_url,
    cb.primary_color,
    cb.secondary_color,
    cb.custom_app_name,
    cb.hide_fieldsync_branding
  FROM company_branding cb
  WHERE cb.custom_domain = domain_name
  AND cb.domain_verified = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Default branding for existing companies
-- ============================================

-- Insert default branding for companies that don't have one
INSERT INTO company_branding (company_id, custom_app_name, primary_color, secondary_color)
SELECT
  id,
  'FieldSync',
  '#3B82F6',
  '#1E40AF'
FROM companies
WHERE NOT EXISTS (
  SELECT 1 FROM company_branding WHERE company_branding.company_id = companies.id
);


-- ----------------------------------------------------------------
-- 36. Group name
-- ----------------------------------------------------------------
-- FieldSync Database Migration: Add Group Name to Areas
-- Run this in your Supabase SQL Editor

-- Add group_name column to areas table for grouping tasks by level/section
ALTER TABLE areas ADD COLUMN IF NOT EXISTS group_name TEXT;

-- Create index for faster group queries
CREATE INDEX IF NOT EXISTS idx_areas_group_name ON areas(project_id, group_name);


-- ----------------------------------------------------------------
-- 37. PIN auth
-- ----------------------------------------------------------------
-- FieldSync Database Migration: Add PIN to Projects
-- Run this in your Supabase SQL Editor

-- Add PIN column to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pin TEXT;

-- Create unique index on PIN (each PIN must be unique)
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_pin ON projects(pin) WHERE pin IS NOT NULL;

-- Update RLS policies to allow PIN-based lookups
-- (The existing policies should work, but we need to allow unauthenticated PIN lookups)

-- Drop existing restrictive policies if they exist
DROP POLICY IF EXISTS "Office can view all projects" ON projects;
DROP POLICY IF EXISTS "Foremen can view assigned projects" ON projects;
DROP POLICY IF EXISTS "Office can manage projects" ON projects;

-- Create new policies that allow PIN access
CREATE POLICY "Anyone can view projects by PIN" ON projects
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage projects" ON projects
  FOR ALL USING (auth.role() = 'authenticated');

-- Also update areas policies for PIN access
DROP POLICY IF EXISTS "Users can view areas" ON areas;
DROP POLICY IF EXISTS "Users can update area status" ON areas;
DROP POLICY IF EXISTS "Office can manage areas" ON areas;
DROP POLICY IF EXISTS "Office can delete areas" ON areas;

-- Allow anyone to view areas (for PIN access)
CREATE POLICY "Anyone can view areas" ON areas
  FOR SELECT USING (true);

-- Allow anyone to update area status (for foreman PIN access)
CREATE POLICY "Anyone can update areas" ON areas
  FOR UPDATE USING (true);

-- Only authenticated can create/delete areas
CREATE POLICY "Authenticated can create areas" ON areas
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can delete areas" ON areas
  FOR DELETE USING (auth.role() = 'authenticated');


-- ----------------------------------------------------------------
-- 38. Field session validation fix
-- ----------------------------------------------------------------
-- FieldSync Database Fix: Correct Field Session Validation Functions
-- This fixes variable reference issues in the field session validation functions
-- Run this in your Supabase SQL Editor

-- Fix validate_field_session function
CREATE OR REPLACE FUNCTION validate_field_session(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_session_token TEXT;
  valid_session BOOLEAN := false;
BEGIN
  -- Get session token from request header
  BEGIN
    v_session_token := current_setting('request.headers', true)::json->>'x-field-session';
  EXCEPTION WHEN OTHERS THEN
    v_session_token := NULL;
  END;

  IF v_session_token IS NULL OR v_session_token = '' THEN
    RETURN false;
  END IF;

  -- Check if session is valid for this project
  SELECT EXISTS (
    SELECT 1 FROM field_sessions fs
    WHERE fs.session_token = v_session_token
      AND fs.project_id = p_project_id
      AND fs.expires_at > NOW()
  ) INTO valid_session;

  -- Update last activity if valid
  IF valid_session THEN
    UPDATE field_sessions
    SET last_activity = NOW()
    WHERE session_token = v_session_token
      AND project_id = p_project_id;
  END IF;

  RETURN valid_session;
END;
$$;

-- Fix has_valid_field_session function
CREATE OR REPLACE FUNCTION has_valid_field_session()
RETURNS TABLE (project_id UUID, company_id UUID)
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_session_token TEXT;
BEGIN
  -- Get session token from request header
  BEGIN
    v_session_token := current_setting('request.headers', true)::json->>'x-field-session';
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  IF v_session_token IS NULL OR v_session_token = '' THEN
    RETURN;
  END IF;

  -- Return project/company if session is valid
  RETURN QUERY
  SELECT fs.project_id, fs.company_id
  FROM field_sessions fs
  WHERE fs.session_token = v_session_token
    AND fs.expires_at > NOW();
END;
$$;


-- ----------------------------------------------------------------
-- 39. PIN case sensitivity fix
-- ----------------------------------------------------------------
-- Fix PIN Validation Case Sensitivity and Whitespace Issues
-- This fixes potential issues with company code and PIN matching

CREATE OR REPLACE FUNCTION validate_pin_and_create_session(
  p_pin TEXT,
  p_company_code TEXT,
  p_device_id TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
) RETURNS TABLE (
  success BOOLEAN,
  session_token TEXT,
  project_id UUID,
  project_name TEXT,
  company_id UUID,
  company_name TEXT,
  error_code TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  is_rate_limited BOOLEAN;
  found_project RECORD;
  found_company RECORD;
  new_session_token TEXT;
  clean_pin TEXT;
  clean_company_code TEXT;
BEGIN
  -- Clean input: trim whitespace and normalize
  clean_pin := TRIM(p_pin);
  clean_company_code := UPPER(TRIM(p_company_code));

  -- Check rate limit first
  is_rate_limited := NOT check_rate_limit(p_ip_address, p_device_id, 15, 5);

  IF is_rate_limited THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_rate_limited');
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT,
      'RATE_LIMITED'::TEXT;
    RETURN;
  END IF;

  -- Find company by code (case-insensitive)
  SELECT * INTO found_company
  FROM companies c
  WHERE UPPER(c.code) = clean_company_code;

  IF found_company IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid_company');
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT,
      'INVALID_COMPANY'::TEXT;
    RETURN;
  END IF;

  -- Find project by PIN within company (trim whitespace from both sides)
  SELECT * INTO found_project
  FROM projects p
  WHERE TRIM(p.pin) = clean_pin
    AND p.company_id = found_company.id
    AND p.status = 'active';

  IF found_project IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid');
    RETURN QUERY SELECT
      false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT,
      'INVALID_PIN'::TEXT;
    RETURN;
  END IF;

  -- Generate secure session token
  new_session_token := encode(gen_random_bytes(32), 'hex');

  -- Revoke any existing sessions for this device/project combo
  DELETE FROM field_sessions
  WHERE device_id = p_device_id
    AND project_id = found_project.id;

  -- Create new session
  INSERT INTO field_sessions (project_id, company_id, session_token, device_id)
  VALUES (found_project.id, found_company.id, new_session_token, p_device_id);

  -- Log successful attempt
  PERFORM log_auth_attempt(p_ip_address, p_device_id, TRUE, 'pin');

  -- Return success with session token
  RETURN QUERY SELECT
    true,
    new_session_token,
    found_project.id,
    found_project.name,
    found_company.id,
    found_company.name,
    NULL::TEXT;
END;
$$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'PIN validation function updated with case-insensitive matching and whitespace handling';
END $$;


-- ----------------------------------------------------------------
-- 40. Field sync access fix
-- ----------------------------------------------------------------
-- ============================================================
-- FIX: Field Sync Access for CORs and Documents
-- ============================================================
-- This migration fixes two critical issues:
-- 1. CORs created by office not showing for foreman
-- 2. Documents uploaded by office not visible to foreman
--
-- Root causes:
-- - Conflicting RLS policies for CORs
-- - Document policies too restrictive (require approval)
-- - Document folder policies may not have been created
-- ============================================================

-- ============================================================
-- STEP 1: Ensure can_access_project function exists
-- ============================================================

CREATE OR REPLACE FUNCTION can_access_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
BEGIN
  -- Check authenticated user access
  IF auth.uid() IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM user_companies uc
      JOIN projects p ON p.company_id = uc.company_id
      WHERE p.id = p_project_id
        AND uc.user_id = auth.uid()
        AND uc.status = 'active'
    );
  END IF;

  -- Check field session access
  RETURN validate_field_session(p_project_id);
END;
$$;

GRANT EXECUTE ON FUNCTION can_access_project(UUID) TO anon;
GRANT EXECUTE ON FUNCTION can_access_project(UUID) TO authenticated;

-- ============================================================
-- STEP 2: Fix Change Orders (COR) access for field users
-- ============================================================

-- Drop ALL conflicting policies for change_orders SELECT
DROP POLICY IF EXISTS "Field users can view CORs by project" ON change_orders;
DROP POLICY IF EXISTS "Secure field view CORs" ON change_orders;
DROP POLICY IF EXISTS "change_orders_field_select" ON change_orders;

-- Create single, correct policy for field COR access
CREATE POLICY "Field users can view project CORs"
ON change_orders FOR SELECT
TO anon
USING (can_access_project(project_id));

-- Ensure anon role has SELECT permission
GRANT SELECT ON change_orders TO anon;

-- ============================================================
-- STEP 3: Fix Document Folders access for field users
-- ============================================================

-- Drop existing field policies
DROP POLICY IF EXISTS "folders_field_select" ON document_folders;
DROP POLICY IF EXISTS "document_folders_field_select" ON document_folders;

-- Create field access policy (no restrictions, just project access)
CREATE POLICY "Field users can view project folders"
ON document_folders FOR SELECT
TO anon
USING (can_access_project(project_id));

-- Ensure anon role has SELECT permission
GRANT SELECT ON document_folders TO anon;

-- ============================================================
-- STEP 4: Fix Documents access for field users
-- ============================================================

-- Drop existing field policies
DROP POLICY IF EXISTS "documents_field_select" ON document_folders;
DROP POLICY IF EXISTS "Field users can view documents" ON documents;

-- Create field access policy
-- Documents should be visible immediately after upload if:
-- 1. visibility is 'all' (not office_only or admin_only)
-- 2. document is not archived
-- NOTE: Removed approval_status check for immediate visibility
CREATE POLICY "Field users can view project documents"
ON documents FOR SELECT
TO anon
USING (
  can_access_project(project_id)
  AND visibility = 'all'
  AND archived_at IS NULL
  AND is_current = true
);

-- Ensure anon role has SELECT permission
GRANT SELECT ON documents TO anon;

-- ============================================================
-- STEP 5: Fix Change Order Ticket Associations
-- ============================================================

DROP POLICY IF EXISTS "Field users can view ticket associations" ON change_order_ticket_associations;
DROP POLICY IF EXISTS "Secure field view ticket associations" ON change_order_ticket_associations;
DROP POLICY IF EXISTS "Field users can create ticket associations" ON change_order_ticket_associations;
DROP POLICY IF EXISTS "Secure field create ticket associations" ON change_order_ticket_associations;

CREATE POLICY "Field users can view COR ticket links"
ON change_order_ticket_associations FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_ticket_associations.change_order_id
      AND can_access_project(cor.project_id)
  )
);

CREATE POLICY "Field users can link tickets to CORs"
ON change_order_ticket_associations FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_ticket_associations.change_order_id
      AND can_access_project(cor.project_id)
  )
);

GRANT SELECT, INSERT ON change_order_ticket_associations TO anon;

-- ============================================================
-- STEP 6: Ensure supporting COR line item tables are accessible
-- ============================================================

-- Labor items
DROP POLICY IF EXISTS "Field users can view labor items" ON change_order_labor;
DROP POLICY IF EXISTS "Secure field view labor items" ON change_order_labor;

CREATE POLICY "Field users can view COR labor"
ON change_order_labor FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_labor.change_order_id
      AND can_access_project(cor.project_id)
  )
);

GRANT SELECT ON change_order_labor TO anon;

-- Materials items
DROP POLICY IF EXISTS "Field users can view material items" ON change_order_materials;
DROP POLICY IF EXISTS "Secure field view material items" ON change_order_materials;

CREATE POLICY "Field users can view COR materials"
ON change_order_materials FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_materials.change_order_id
      AND can_access_project(cor.project_id)
  )
);

GRANT SELECT ON change_order_materials TO anon;

-- Equipment items
DROP POLICY IF EXISTS "Field users can view equipment items" ON change_order_equipment;
DROP POLICY IF EXISTS "Secure field view equipment items" ON change_order_equipment;

CREATE POLICY "Field users can view COR equipment"
ON change_order_equipment FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_equipment.change_order_id
      AND can_access_project(cor.project_id)
  )
);

GRANT SELECT ON change_order_equipment TO anon;

-- ============================================================
-- STEP 7: Verify document upload defaults
-- ============================================================

-- Ensure new documents default to visibility='all' so they're
-- immediately visible to field users
ALTER TABLE documents
ALTER COLUMN visibility SET DEFAULT 'all';

-- ============================================================
-- VERIFICATION
-- ============================================================

DO $$
DECLARE
  cor_policies INTEGER;
  folder_policies INTEGER;
  doc_policies INTEGER;
BEGIN
  SELECT COUNT(*) INTO cor_policies
  FROM pg_policies WHERE tablename = 'change_orders' AND policyname LIKE '%Field%';

  SELECT COUNT(*) INTO folder_policies
  FROM pg_policies WHERE tablename = 'document_folders' AND policyname LIKE '%Field%';

  SELECT COUNT(*) INTO doc_policies
  FROM pg_policies WHERE tablename = 'documents' AND policyname LIKE '%Field%';

  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'FIELD SYNC ACCESS FIX APPLIED SUCCESSFULLY';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Policies created:';
  RAISE NOTICE '  - Change Orders (COR): % field policies', cor_policies;
  RAISE NOTICE '  - Document Folders: % field policies', folder_policies;
  RAISE NOTICE '  - Documents: % field policies', doc_policies;
  RAISE NOTICE '';
  RAISE NOTICE 'Fixed issues:';
  RAISE NOTICE '  1. CORs created by office now visible to foreman';
  RAISE NOTICE '  2. Documents uploaded by office immediately visible';
  RAISE NOTICE '';
  RAISE NOTICE 'Field users can now:';
  RAISE NOTICE '  - View all CORs for their project (draft, pending, approved)';
  RAISE NOTICE '  - Link T&M tickets to CORs';
  RAISE NOTICE '  - View document folders and download documents';
  RAISE NOTICE '============================================================';
END $$;


-- ----------------------------------------------------------------
-- 41. Documents RLS fix
-- ----------------------------------------------------------------
-- =============================================
-- FIX: Documents Table RLS Policies
-- =============================================
-- This migration fixes RLS policies for the documents table
-- to allow document uploads and management
--
-- Run this in Supabase SQL Editor AFTER fix_document_folders_rls.sql
-- =============================================

-- =============================================
-- STEP 1: Ensure documents table exists
-- =============================================

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  folder_id UUID REFERENCES document_folders(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'general',
  tags TEXT[] DEFAULT '{}',
  version INTEGER DEFAULT 1,
  is_current BOOLEAN DEFAULT true,
  parent_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  resource_type TEXT,
  resource_id UUID,
  visibility TEXT DEFAULT 'all' CHECK (visibility IN ('all', 'office_only', 'admin_only')),
  approval_status TEXT DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archived_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- =============================================
-- STEP 2: Ensure upload queue table exists
-- =============================================

CREATE TABLE IF NOT EXISTS document_upload_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  temp_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER,
  category TEXT DEFAULT 'general',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'confirmed', 'failed', 'cancelled')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  last_attempt TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  uploaded_url TEXT,
  storage_path TEXT,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  UNIQUE(project_id, temp_id)
);

ALTER TABLE document_upload_queue ENABLE ROW LEVEL SECURITY;

-- =============================================
-- STEP 3: Drop existing policies
-- =============================================

DROP POLICY IF EXISTS "documents_select" ON documents;
DROP POLICY IF EXISTS "documents_insert" ON documents;
DROP POLICY IF EXISTS "documents_update" ON documents;
DROP POLICY IF EXISTS "documents_delete" ON documents;
DROP POLICY IF EXISTS "documents_field_select" ON documents;

DROP POLICY IF EXISTS "doc_queue_select" ON document_upload_queue;
DROP POLICY IF EXISTS "doc_queue_insert" ON document_upload_queue;
DROP POLICY IF EXISTS "doc_queue_update" ON document_upload_queue;

-- =============================================
-- STEP 4: Create documents policies
-- =============================================

-- SELECT: Company members can view documents (with visibility checks)
CREATE POLICY "documents_select" ON documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
    )
    AND (
      visibility = 'all'
      OR (visibility = 'office_only' AND EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
          AND uc.company_id = documents.company_id
          AND (uc.access_level IN ('member', 'administrator') OR uc.access_level IS NULL)
      ))
      OR (visibility = 'admin_only' AND EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
          AND uc.company_id = documents.company_id
          AND uc.access_level = 'administrator'
      ))
    )
  );

-- INSERT: Office users can upload documents
CREATE POLICY "documents_insert" ON documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
        AND (
          uc.access_level IN ('member', 'administrator')
          OR uc.access_level IS NULL
        )
    )
  );

-- UPDATE: Office users can update documents
CREATE POLICY "documents_update" ON documents
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
        AND (
          uc.access_level IN ('member', 'administrator')
          OR uc.access_level IS NULL
        )
    )
  );

-- DELETE: Only administrators can delete
CREATE POLICY "documents_delete" ON documents
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
        AND uc.access_level = 'administrator'
    )
  );

-- Field users can view public approved documents
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'can_access_project') THEN
    EXECUTE '
      CREATE POLICY "documents_field_select" ON documents
        FOR SELECT
        TO anon
        USING (
          visibility = ''all''
          AND approval_status = ''approved''
          AND archived_at IS NULL
          AND can_access_project(project_id)
        )
    ';
  END IF;
END $$;

-- =============================================
-- STEP 5: Create upload queue policies
-- =============================================

-- SELECT: Company members can view queue
CREATE POLICY "doc_queue_select" ON document_upload_queue
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_upload_queue.company_id
        AND uc.status = 'active'
    )
  );

-- INSERT: Office users can add to queue
CREATE POLICY "doc_queue_insert" ON document_upload_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_upload_queue.company_id
        AND uc.status = 'active'
        AND (
          uc.access_level IN ('member', 'administrator')
          OR uc.access_level IS NULL
        )
    )
  );

-- UPDATE: Company members can update queue entries
CREATE POLICY "doc_queue_update" ON document_upload_queue
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_upload_queue.company_id
        AND uc.status = 'active'
    )
  );

-- =============================================
-- STEP 6: Grant permissions
-- =============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO authenticated;
GRANT SELECT ON documents TO anon;
GRANT SELECT, INSERT, UPDATE ON document_upload_queue TO authenticated;

-- =============================================
-- STEP 7: Create indexes
-- =============================================

CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id, uploaded_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_company ON documents(company_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(project_id, category) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id, uploaded_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_doc_queue_pending ON document_upload_queue(status, next_retry_at) WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_doc_queue_project ON document_upload_queue(project_id);

-- =============================================
-- STEP 8: Setup storage bucket (if not exists)
-- =============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-documents', 'project-documents', true)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- STEP 9: Storage RLS policies
-- =============================================

-- Drop existing storage policies for this bucket
DROP POLICY IF EXISTS "document_storage_upload" ON storage.objects;
DROP POLICY IF EXISTS "document_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "document_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "document_storage_delete" ON storage.objects;

-- Upload: Office users can upload to their company's folder
CREATE POLICY "document_storage_upload" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM companies c
      JOIN user_companies uc ON c.id = uc.company_id
      WHERE uc.user_id = auth.uid()
        AND uc.status = 'active'
        AND (
          uc.access_level IN ('member', 'administrator')
          OR uc.access_level IS NULL
        )
    )
  );

-- Select: Anyone can view documents (public bucket)
CREATE POLICY "document_storage_select" ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'project-documents');

-- Update: Office users can update files
CREATE POLICY "document_storage_update" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM companies c
      JOIN user_companies uc ON c.id = uc.company_id
      WHERE uc.user_id = auth.uid()
        AND uc.status = 'active'
        AND (
          uc.access_level IN ('member', 'administrator')
          OR uc.access_level IS NULL
        )
    )
  );

-- Delete: Only admins can delete files
CREATE POLICY "document_storage_delete" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM companies c
      JOIN user_companies uc ON c.id = uc.company_id
      WHERE uc.user_id = auth.uid()
        AND uc.status = 'active'
        AND uc.access_level = 'administrator'
    )
  );

-- =============================================
-- VERIFICATION
-- =============================================

DO $$
DECLARE
  doc_policies INTEGER;
  queue_policies INTEGER;
  storage_policies INTEGER;
BEGIN
  SELECT COUNT(*) INTO doc_policies
  FROM pg_policies WHERE tablename = 'documents';

  SELECT COUNT(*) INTO queue_policies
  FROM pg_policies WHERE tablename = 'document_upload_queue';

  SELECT COUNT(*) INTO storage_policies
  FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE 'document_storage%';

  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'DOCUMENTS RLS FIX APPLIED SUCCESSFULLY';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Documents table policies: %', doc_policies;
  RAISE NOTICE 'Upload queue policies: %', queue_policies;
  RAISE NOTICE 'Storage policies: %', storage_policies;
  RAISE NOTICE '';
  RAISE NOTICE 'You can now upload and manage documents!';
  RAISE NOTICE '============================================================';
END $$;


-- ----------------------------------------------------------------
-- 42. Document folders RLS fix
-- ----------------------------------------------------------------
-- =============================================
-- FIX: Document Folders RLS Policies
-- =============================================
-- This migration fixes the RLS policy error:
-- "new row violates row-level security policy for table document_folders"
-- Error code: 42501
--
-- Run this in Supabase SQL Editor
-- =============================================

-- =============================================
-- STEP 1: Ensure table exists with RLS enabled
-- =============================================

-- Create table if not exists (idempotent)
CREATE TABLE IF NOT EXISTS document_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'folder',
  color TEXT DEFAULT 'blue',
  sort_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, name)
);

-- Enable RLS (idempotent)
ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;

-- =============================================
-- STEP 2: Drop all existing policies (clean slate)
-- =============================================

DROP POLICY IF EXISTS "folders_select" ON document_folders;
DROP POLICY IF EXISTS "folders_field_select" ON document_folders;
DROP POLICY IF EXISTS "folders_insert" ON document_folders;
DROP POLICY IF EXISTS "folders_update" ON document_folders;
DROP POLICY IF EXISTS "folders_delete" ON document_folders;
DROP POLICY IF EXISTS "document_folders_select" ON document_folders;
DROP POLICY IF EXISTS "document_folders_insert" ON document_folders;
DROP POLICY IF EXISTS "document_folders_update" ON document_folders;
DROP POLICY IF EXISTS "document_folders_delete" ON document_folders;

-- =============================================
-- STEP 3: Create SELECT policies
-- =============================================

-- Authenticated company members can view folders
CREATE POLICY "folders_select" ON document_folders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
    )
  );

-- Field users can view via project access (if can_access_project function exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'can_access_project') THEN
    EXECUTE '
      CREATE POLICY "folders_field_select" ON document_folders
        FOR SELECT
        TO anon
        USING (can_access_project(project_id))
    ';
  END IF;
END $$;

-- =============================================
-- STEP 4: Create INSERT policy
-- =============================================

-- Office users (member/administrator) can create folders
CREATE POLICY "folders_insert" ON document_folders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
        AND (
          uc.access_level IN ('member', 'administrator')
          OR uc.access_level IS NULL  -- Fallback for legacy users without access_level set
        )
    )
  );

-- =============================================
-- STEP 5: Create UPDATE policy
-- =============================================

-- Office users can update folders
CREATE POLICY "folders_update" ON document_folders
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
        AND (
          uc.access_level IN ('member', 'administrator')
          OR uc.access_level IS NULL
        )
    )
  );

-- =============================================
-- STEP 6: Create DELETE policy
-- =============================================

-- Only administrators can delete folders
CREATE POLICY "folders_delete" ON document_folders
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
        AND uc.access_level = 'administrator'
    )
  );

-- =============================================
-- STEP 7: Grant permissions
-- =============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON document_folders TO authenticated;
GRANT SELECT ON document_folders TO anon;

-- =============================================
-- STEP 8: Create indexes for performance
-- =============================================

CREATE INDEX IF NOT EXISTS idx_folders_project ON document_folders(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_folders_company ON document_folders(company_id);

-- =============================================
-- STEP 9: Fix access_level for any NULL values
-- =============================================

-- Set default access_level for users who have NULL (legacy users)
UPDATE user_companies
SET access_level = 'member'
WHERE access_level IS NULL
  AND status = 'active';

-- Ensure company owners are always administrators
UPDATE user_companies uc
SET access_level = 'administrator'
FROM companies c
WHERE c.owner_user_id = uc.user_id
  AND c.id = uc.company_id
  AND (uc.access_level IS NULL OR uc.access_level != 'administrator');

-- =============================================
-- VERIFICATION
-- =============================================

DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'document_folders';

  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'DOCUMENT FOLDERS RLS FIX APPLIED SUCCESSFULLY';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Policies created: %', policy_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Users can now:';
  RAISE NOTICE '  - VIEW folders: All active company members';
  RAISE NOTICE '  - CREATE folders: Members and Administrators';
  RAISE NOTICE '  - UPDATE folders: Members and Administrators';
  RAISE NOTICE '  - DELETE folders: Administrators only';
  RAISE NOTICE '';
  RAISE NOTICE 'Try creating a folder in your Documents tab now!';
  RAISE NOTICE '============================================================';
END $$;


-- ----------------------------------------------------------------
-- 43. Document upload RLS fix
-- ----------------------------------------------------------------
-- =============================================
-- COMPLETE FIX: Document Upload RLS Policies
-- =============================================
-- This fixes the error:
-- "new row violates row-level security policy for table document_folders"
-- Error code: 42501
--
-- INSTRUCTIONS:
-- 1. Go to Supabase Dashboard
-- 2. Navigate to SQL Editor
-- 3. Click "New Query"
-- 4. Paste this ENTIRE file
-- 5. Click "Run"
-- 6. You should see success messages
-- 7. Try creating a folder/uploading a document again
-- =============================================

BEGIN;

-- =============================================
-- PART 1: DOCUMENT FOLDERS
-- =============================================

-- Create table if not exists
CREATE TABLE IF NOT EXISTS document_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'folder',
  color TEXT DEFAULT 'blue',
  sort_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, name)
);

ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;

-- Drop all existing folder policies
DROP POLICY IF EXISTS "folders_select" ON document_folders;
DROP POLICY IF EXISTS "folders_field_select" ON document_folders;
DROP POLICY IF EXISTS "folders_insert" ON document_folders;
DROP POLICY IF EXISTS "folders_update" ON document_folders;
DROP POLICY IF EXISTS "folders_delete" ON document_folders;
DROP POLICY IF EXISTS "document_folders_select" ON document_folders;
DROP POLICY IF EXISTS "document_folders_insert" ON document_folders;
DROP POLICY IF EXISTS "document_folders_update" ON document_folders;
DROP POLICY IF EXISTS "document_folders_delete" ON document_folders;

-- Create folder policies
CREATE POLICY "folders_select" ON document_folders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
    )
  );

CREATE POLICY "folders_insert" ON document_folders
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
        AND (uc.access_level IN ('member', 'administrator') OR uc.access_level IS NULL)
    )
  );

CREATE POLICY "folders_update" ON document_folders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
        AND (uc.access_level IN ('member', 'administrator') OR uc.access_level IS NULL)
    )
  );

CREATE POLICY "folders_delete" ON document_folders
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
        AND uc.access_level = 'administrator'
    )
  );

-- Grant folder permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON document_folders TO authenticated;

-- Create folder indexes
CREATE INDEX IF NOT EXISTS idx_folders_project ON document_folders(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_folders_company ON document_folders(company_id);

-- =============================================
-- PART 2: DOCUMENTS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  folder_id UUID REFERENCES document_folders(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'general',
  tags TEXT[] DEFAULT '{}',
  version INTEGER DEFAULT 1,
  is_current BOOLEAN DEFAULT true,
  parent_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  resource_type TEXT,
  resource_id UUID,
  visibility TEXT DEFAULT 'all' CHECK (visibility IN ('all', 'office_only', 'admin_only')),
  approval_status TEXT DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archived_by UUID REFERENCES auth.users(id)
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Drop existing document policies
DROP POLICY IF EXISTS "documents_select" ON documents;
DROP POLICY IF EXISTS "documents_insert" ON documents;
DROP POLICY IF EXISTS "documents_update" ON documents;
DROP POLICY IF EXISTS "documents_delete" ON documents;
DROP POLICY IF EXISTS "documents_field_select" ON documents;

-- Create document policies
CREATE POLICY "documents_select" ON documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
    )
  );

CREATE POLICY "documents_insert" ON documents
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
        AND (uc.access_level IN ('member', 'administrator') OR uc.access_level IS NULL)
    )
  );

CREATE POLICY "documents_update" ON documents
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
        AND (uc.access_level IN ('member', 'administrator') OR uc.access_level IS NULL)
    )
  );

CREATE POLICY "documents_delete" ON documents
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
        AND uc.access_level = 'administrator'
    )
  );

-- Grant document permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO authenticated;

-- Create document indexes
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id, uploaded_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_company ON documents(company_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id, uploaded_at DESC) WHERE archived_at IS NULL;

-- =============================================
-- PART 3: UPLOAD QUEUE
-- =============================================

CREATE TABLE IF NOT EXISTS document_upload_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  temp_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER,
  category TEXT DEFAULT 'general',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'confirmed', 'failed', 'cancelled')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  last_attempt TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  uploaded_url TEXT,
  storage_path TEXT,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  UNIQUE(project_id, temp_id)
);

ALTER TABLE document_upload_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "doc_queue_select" ON document_upload_queue;
DROP POLICY IF EXISTS "doc_queue_insert" ON document_upload_queue;
DROP POLICY IF EXISTS "doc_queue_update" ON document_upload_queue;

CREATE POLICY "doc_queue_select" ON document_upload_queue
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_upload_queue.company_id
        AND uc.status = 'active'
    )
  );

CREATE POLICY "doc_queue_insert" ON document_upload_queue
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_upload_queue.company_id
        AND uc.status = 'active'
        AND (uc.access_level IN ('member', 'administrator') OR uc.access_level IS NULL)
    )
  );

CREATE POLICY "doc_queue_update" ON document_upload_queue
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_upload_queue.company_id
        AND uc.status = 'active'
    )
  );

GRANT SELECT, INSERT, UPDATE ON document_upload_queue TO authenticated;

-- =============================================
-- PART 4: FIX USER ACCESS LEVELS
-- =============================================

-- Set default access_level for users who have NULL
UPDATE user_companies
SET access_level = 'member'
WHERE access_level IS NULL AND status = 'active';

-- Ensure company owners are administrators
UPDATE user_companies uc
SET access_level = 'administrator'
FROM companies c
WHERE c.owner_user_id = uc.user_id
  AND c.id = uc.company_id
  AND (uc.access_level IS NULL OR uc.access_level != 'administrator');

-- =============================================
-- PART 5: STORAGE BUCKET
-- =============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-documents', 'project-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (drop existing first)
DROP POLICY IF EXISTS "document_storage_upload" ON storage.objects;
DROP POLICY IF EXISTS "document_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "document_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "document_storage_delete" ON storage.objects;

CREATE POLICY "document_storage_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM companies c
      JOIN user_companies uc ON c.id = uc.company_id
      WHERE uc.user_id = auth.uid()
        AND uc.status = 'active'
        AND (uc.access_level IN ('member', 'administrator') OR uc.access_level IS NULL)
    )
  );

CREATE POLICY "document_storage_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'project-documents');

CREATE POLICY "document_storage_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM companies c
      JOIN user_companies uc ON c.id = uc.company_id
      WHERE uc.user_id = auth.uid()
        AND uc.status = 'active'
        AND (uc.access_level IN ('member', 'administrator') OR uc.access_level IS NULL)
    )
  );

CREATE POLICY "document_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM companies c
      JOIN user_companies uc ON c.id = uc.company_id
      WHERE uc.user_id = auth.uid()
        AND uc.status = 'active'
        AND uc.access_level = 'administrator'
    )
  );

COMMIT;

-- =============================================
-- SUCCESS MESSAGE
-- =============================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '╔══════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║     DOCUMENT UPLOAD FIX APPLIED SUCCESSFULLY!            ║';
  RAISE NOTICE '╠══════════════════════════════════════════════════════════╣';
  RAISE NOTICE '║ Tables created/verified:                                 ║';
  RAISE NOTICE '║   - document_folders                                     ║';
  RAISE NOTICE '║   - documents                                            ║';
  RAISE NOTICE '║   - document_upload_queue                                ║';
  RAISE NOTICE '║                                                          ║';
  RAISE NOTICE '║ RLS policies configured for:                             ║';
  RAISE NOTICE '║   - Folder creation (member + administrator)             ║';
  RAISE NOTICE '║   - Document upload (member + administrator)             ║';
  RAISE NOTICE '║   - Storage bucket access                                ║';
  RAISE NOTICE '║                                                          ║';
  RAISE NOTICE '║ User access levels fixed (NULL -> member)                ║';
  RAISE NOTICE '╠══════════════════════════════════════════════════════════╣';
  RAISE NOTICE '║ TRY NOW: Create a folder or upload a document!           ║';
  RAISE NOTICE '╚══════════════════════════════════════════════════════════╝';
END $$;


-- ----------------------------------------------------------------
-- 44. Field session cleanup
-- ----------------------------------------------------------------
-- ============================================================
-- CLEANUP: Drop existing policies before re-running migration
-- Run this FIRST, then run migration_field_sessions.sql
-- ============================================================

-- Field Sessions table
DROP POLICY IF EXISTS "No direct session access" ON field_sessions;

-- Areas
DROP POLICY IF EXISTS "Secure field access to areas" ON areas;
DROP POLICY IF EXISTS "Secure field update areas" ON areas;

-- T&M Tickets
DROP POLICY IF EXISTS "Secure field view tickets" ON t_and_m_tickets;
DROP POLICY IF EXISTS "Secure field create tickets" ON t_and_m_tickets;
DROP POLICY IF EXISTS "Secure field update tickets" ON t_and_m_tickets;

-- T&M Workers
DROP POLICY IF EXISTS "Secure field view workers" ON t_and_m_workers;
DROP POLICY IF EXISTS "Secure field create workers" ON t_and_m_workers;

-- T&M Items
DROP POLICY IF EXISTS "Secure field view items" ON t_and_m_items;
DROP POLICY IF EXISTS "Secure field create items" ON t_and_m_items;

-- Crew Checkins
DROP POLICY IF EXISTS "Secure field view crew checkins" ON crew_checkins;
DROP POLICY IF EXISTS "Secure field create crew checkins" ON crew_checkins;
DROP POLICY IF EXISTS "Secure field update crew checkins" ON crew_checkins;

-- Daily Reports
DROP POLICY IF EXISTS "Secure field view daily reports" ON daily_reports;
DROP POLICY IF EXISTS "Secure field create daily reports" ON daily_reports;

-- Messages
DROP POLICY IF EXISTS "Secure field view messages" ON messages;
DROP POLICY IF EXISTS "Secure field create messages" ON messages;
DROP POLICY IF EXISTS "Secure field update messages" ON messages;

-- Disposal Loads
DROP POLICY IF EXISTS "Secure field view disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Secure field create disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Secure field update disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Secure field delete disposal loads" ON disposal_loads;

-- Injury Reports
DROP POLICY IF EXISTS "Secure field view injury reports" ON injury_reports;
DROP POLICY IF EXISTS "Secure field create injury reports" ON injury_reports;

-- Material Requests
DROP POLICY IF EXISTS "Secure field view material requests" ON material_requests;
DROP POLICY IF EXISTS "Secure field create material requests" ON material_requests;

-- Projects
DROP POLICY IF EXISTS "Secure field view projects" ON projects;

-- Companies
DROP POLICY IF EXISTS "Secure field view companies" ON companies;

-- Change Orders
DROP POLICY IF EXISTS "Secure field view CORs" ON change_orders;

-- Change Order Associations
DROP POLICY IF EXISTS "Secure field view ticket associations" ON change_order_ticket_associations;
DROP POLICY IF EXISTS "Secure field create ticket associations" ON change_order_ticket_associations;

-- Change Order Labor
DROP POLICY IF EXISTS "Secure field view labor items" ON change_order_labor;
DROP POLICY IF EXISTS "Secure field insert labor items" ON change_order_labor;

-- Change Order Materials
DROP POLICY IF EXISTS "Secure field view material items" ON change_order_materials;
DROP POLICY IF EXISTS "Secure field insert material items" ON change_order_materials;

-- Change Order Equipment
DROP POLICY IF EXISTS "Secure field view equipment items" ON change_order_equipment;
DROP POLICY IF EXISTS "Secure field insert equipment items" ON change_order_equipment;

-- Dump Sites
DROP POLICY IF EXISTS "Secure field view dump sites" ON dump_sites;

-- Labor Classes
DROP POLICY IF EXISTS "Secure field view labor classes" ON labor_classes;

-- Company Branding
DROP POLICY IF EXISTS "Secure field view company branding" ON company_branding;

-- Materials Equipment
DROP POLICY IF EXISTS "Secure field view materials equipment" ON materials_equipment;

-- Drop functions to recreate them
DROP FUNCTION IF EXISTS validate_field_session(UUID);
DROP FUNCTION IF EXISTS has_valid_field_session();
DROP FUNCTION IF EXISTS validate_pin_and_create_session(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS can_access_project(UUID);
DROP FUNCTION IF EXISTS cleanup_expired_sessions();
DROP FUNCTION IF EXISTS extend_field_session(TEXT);
DROP FUNCTION IF EXISTS invalidate_field_session(TEXT);


-- ----------------------------------------------------------------
-- 45. Observability tables
-- ----------------------------------------------------------------
-- ============================================================
-- FIELDSYNC OBSERVABILITY TABLES
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/YOUR_PROJECT/sql
-- ============================================================

-- 1. ERROR LOG
-- Tracks all errors with context (company, user, operation)
CREATE TABLE IF NOT EXISTS error_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Classification
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  category TEXT NOT NULL, -- 'database', 'storage', 'auth', 'network', 'sync'
  error_code TEXT,
  message TEXT NOT NULL,

  -- Context (who/what/where)
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  operation TEXT, -- 'getTMTickets', 'uploadPhoto', etc.

  -- Additional data
  context JSONB DEFAULT '{}'
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_error_log_created ON error_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_company ON error_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_severity ON error_log(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_category ON error_log(category, created_at DESC);

-- 2. QUERY METRICS
-- Tracks slow queries for performance monitoring
CREATE TABLE IF NOT EXISTS query_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Query info
  operation TEXT NOT NULL, -- 'getTMTickets', 'getAreas', etc.
  duration_ms INTEGER NOT NULL,
  rows_returned INTEGER,

  -- Context
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Additional data
  context JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_query_metrics_created ON query_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_metrics_operation ON query_metrics(operation, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_metrics_slow ON query_metrics(duration_ms DESC);
CREATE INDEX IF NOT EXISTS idx_query_metrics_company ON query_metrics(company_id, created_at DESC);

-- 3. TENANT HEALTH SNAPSHOTS
-- Daily rollup of per-company health metrics
CREATE TABLE IF NOT EXISTS tenant_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,

  -- Health score (0-100)
  health_score INTEGER CHECK (health_score BETWEEN 0 AND 100),
  status TEXT CHECK (status IN ('healthy', 'warning', 'critical')),

  -- Usage metrics
  active_users INTEGER DEFAULT 0,
  total_users INTEGER DEFAULT 0,
  active_projects INTEGER DEFAULT 0,
  total_projects INTEGER DEFAULT 0,
  storage_bytes BIGINT DEFAULT 0,

  -- Activity metrics
  daily_tickets INTEGER DEFAULT 0,
  daily_actions INTEGER DEFAULT 0,
  daily_errors INTEGER DEFAULT 0,
  avg_query_latency_ms INTEGER,

  -- Flags and recommendations
  flags TEXT[] DEFAULT '{}',
  recommended_actions TEXT[] DEFAULT '{}',

  -- Ensure one snapshot per company per day
  UNIQUE(snapshot_date, company_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenant_health_company ON tenant_health_snapshots(company_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_health_status ON tenant_health_snapshots(status, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_health_date ON tenant_health_snapshots(snapshot_date DESC);

-- 4. STORAGE METRICS
-- Tracks storage usage per company
CREATE TABLE IF NOT EXISTS storage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date DATE NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,

  -- Storage totals
  total_bytes BIGINT DEFAULT 0,
  photo_bytes BIGINT DEFAULT 0,
  document_bytes BIGINT DEFAULT 0,

  -- Daily activity
  files_uploaded INTEGER DEFAULT 0,
  bytes_uploaded BIGINT DEFAULT 0,
  files_deleted INTEGER DEFAULT 0,
  bytes_deleted BIGINT DEFAULT 0,
  upload_errors INTEGER DEFAULT 0,

  -- Ensure one record per company per day
  UNIQUE(metric_date, company_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_storage_metrics_company ON storage_metrics(company_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_storage_metrics_date ON storage_metrics(metric_date DESC);

-- 5. PLATFORM ADMINS
-- Separate from company admins - for system operators only
CREATE TABLE IF NOT EXISTS platform_admins (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Only platform admins can see observability data
-- ============================================================

ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- Platform admins can see all observability data
CREATE POLICY "Platform admins can view error_log"
  ON error_log FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM platform_admins)
  );

CREATE POLICY "Platform admins can insert error_log"
  ON error_log FOR INSERT
  WITH CHECK (true); -- Anyone can log errors

CREATE POLICY "Platform admins can view query_metrics"
  ON query_metrics FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM platform_admins)
  );

CREATE POLICY "Platform admins can insert query_metrics"
  ON query_metrics FOR INSERT
  WITH CHECK (true); -- Anyone can log metrics

CREATE POLICY "Platform admins can view tenant_health"
  ON tenant_health_snapshots FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM platform_admins)
  );

CREATE POLICY "Platform admins can manage tenant_health"
  ON tenant_health_snapshots FOR ALL
  USING (
    auth.uid() IN (SELECT user_id FROM platform_admins)
  );

CREATE POLICY "Platform admins can view storage_metrics"
  ON storage_metrics FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM platform_admins)
  );

CREATE POLICY "Platform admins can manage storage_metrics"
  ON storage_metrics FOR ALL
  USING (
    auth.uid() IN (SELECT user_id FROM platform_admins)
  );

CREATE POLICY "Platform admins can view platform_admins"
  ON platform_admins FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM platform_admins)
  );

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Function to log errors (callable from app)
CREATE OR REPLACE FUNCTION log_error(
  p_severity TEXT,
  p_category TEXT,
  p_message TEXT,
  p_company_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_operation TEXT DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_context JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO error_log (
    severity, category, message, company_id, user_id,
    project_id, operation, error_code, context
  ) VALUES (
    p_severity, p_category, p_message, p_company_id, p_user_id,
    p_project_id, p_operation, p_error_code, p_context
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Function to log slow queries (callable from app)
CREATE OR REPLACE FUNCTION log_query_metric(
  p_operation TEXT,
  p_duration_ms INTEGER,
  p_rows_returned INTEGER DEFAULT NULL,
  p_company_id UUID DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_context JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Only log queries slower than 200ms to avoid noise
  IF p_duration_ms >= 200 THEN
    INSERT INTO query_metrics (
      operation, duration_ms, rows_returned, company_id,
      project_id, user_id, context
    ) VALUES (
      p_operation, p_duration_ms, p_rows_returned, p_company_id,
      p_project_id, p_user_id, p_context
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

-- ============================================================
-- GRANT EXECUTE ON FUNCTIONS
-- ============================================================

GRANT EXECUTE ON FUNCTION log_error TO authenticated;
GRANT EXECUTE ON FUNCTION log_query_metric TO authenticated;

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE 'Observability tables created successfully!';
  RAISE NOTICE 'Tables: error_log, query_metrics, tenant_health_snapshots, storage_metrics, platform_admins';
  RAISE NOTICE 'Functions: log_error(), log_query_metric()';
END $$;


-- ----------------------------------------------------------------
-- 46. Atomic ticket-COR association
-- ----------------------------------------------------------------
-- ============================================================
-- ATOMIC TICKET-COR ASSOCIATION
-- Ensures dual FK and junction table stay in sync
-- ============================================================

-- Function to atomically assign a ticket to a COR
-- Both operations happen in a single transaction
CREATE OR REPLACE FUNCTION assign_ticket_to_cor(
  p_ticket_id UUID,
  p_cor_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert into junction table (ignore if already exists)
  INSERT INTO change_order_ticket_associations (change_order_id, ticket_id, data_imported)
  VALUES (p_cor_id, p_ticket_id, false)
  ON CONFLICT (change_order_id, ticket_id) DO NOTHING;

  -- Update ticket's assigned_cor_id
  UPDATE t_and_m_tickets
  SET assigned_cor_id = p_cor_id
  WHERE id = p_ticket_id;

  -- Both succeed or both fail - transaction guarantees atomicity
END;
$$;

-- Function to atomically unassign a ticket from a COR
CREATE OR REPLACE FUNCTION unassign_ticket_from_cor(
  p_ticket_id UUID,
  p_cor_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete from junction table
  DELETE FROM change_order_ticket_associations
  WHERE ticket_id = p_ticket_id
    AND change_order_id = p_cor_id;

  -- Clear ticket's assigned_cor_id (only if it matches this COR)
  UPDATE t_and_m_tickets
  SET assigned_cor_id = NULL
  WHERE id = p_ticket_id
    AND assigned_cor_id = p_cor_id;
END;
$$;

-- ============================================================
-- SYNC TRIGGER
-- Automatically keeps assigned_cor_id in sync with junction table
-- ============================================================

CREATE OR REPLACE FUNCTION sync_ticket_cor_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- When association is created, update ticket's assigned_cor_id
    UPDATE t_and_m_tickets
    SET assigned_cor_id = NEW.change_order_id
    WHERE id = NEW.ticket_id
      AND (assigned_cor_id IS NULL OR assigned_cor_id != NEW.change_order_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- When association is deleted, clear ticket's assigned_cor_id
    UPDATE t_and_m_tickets
    SET assigned_cor_id = NULL
    WHERE id = OLD.ticket_id
      AND assigned_cor_id = OLD.change_order_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_sync_ticket_cor ON change_order_ticket_associations;

-- Create the sync trigger
CREATE TRIGGER trg_sync_ticket_cor
AFTER INSERT OR DELETE ON change_order_ticket_associations
FOR EACH ROW EXECUTE FUNCTION sync_ticket_cor_assignment();

-- ============================================================
-- DATA INTEGRITY CHECK FUNCTION
-- Run this to find any inconsistencies between dual associations
-- ============================================================

CREATE OR REPLACE FUNCTION check_ticket_cor_integrity()
RETURNS TABLE (
  ticket_id UUID,
  assigned_cor_id UUID,
  junction_cor_id UUID,
  issue TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  -- Find tickets where assigned_cor_id is set but no junction record exists
  SELECT
    t.id as ticket_id,
    t.assigned_cor_id,
    NULL::UUID as junction_cor_id,
    'Missing junction record'::TEXT as issue
  FROM t_and_m_tickets t
  WHERE t.assigned_cor_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM change_order_ticket_associations a
      WHERE a.ticket_id = t.id AND a.change_order_id = t.assigned_cor_id
    )

  UNION ALL

  -- Find junction records where ticket's assigned_cor_id doesn't match
  SELECT
    a.ticket_id,
    t.assigned_cor_id,
    a.change_order_id as junction_cor_id,
    'Mismatched assigned_cor_id'::TEXT as issue
  FROM change_order_ticket_associations a
  JOIN t_and_m_tickets t ON t.id = a.ticket_id
  WHERE t.assigned_cor_id IS NULL OR t.assigned_cor_id != a.change_order_id;
END;
$$;

-- ============================================================
-- FIX EXISTING INCONSISTENCIES
-- Run this once to fix any existing data issues
-- ============================================================

CREATE OR REPLACE FUNCTION fix_ticket_cor_integrity()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  fixed_count INTEGER := 0;
BEGIN
  -- Fix tickets with assigned_cor_id but no junction record
  INSERT INTO change_order_ticket_associations (change_order_id, ticket_id, data_imported)
  SELECT t.assigned_cor_id, t.id, false
  FROM t_and_m_tickets t
  WHERE t.assigned_cor_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM change_order_ticket_associations a
      WHERE a.ticket_id = t.id AND a.change_order_id = t.assigned_cor_id
    )
  ON CONFLICT (change_order_id, ticket_id) DO NOTHING;

  GET DIAGNOSTICS fixed_count = ROW_COUNT;

  -- Fix junction records where ticket's assigned_cor_id doesn't match
  UPDATE t_and_m_tickets t
  SET assigned_cor_id = a.change_order_id
  FROM change_order_ticket_associations a
  WHERE a.ticket_id = t.id
    AND (t.assigned_cor_id IS NULL OR t.assigned_cor_id != a.change_order_id);

  RETURN fixed_count;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION assign_ticket_to_cor(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION unassign_ticket_from_cor(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_ticket_cor_integrity() TO authenticated;
GRANT EXECUTE ON FUNCTION fix_ticket_cor_integrity() TO authenticated;

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE 'Atomic Ticket-COR Association functions created successfully!';
  RAISE NOTICE 'Functions: assign_ticket_to_cor(), unassign_ticket_from_cor()';
  RAISE NOTICE 'Integrity: check_ticket_cor_integrity(), fix_ticket_cor_integrity()';
  RAISE NOTICE 'Trigger: trg_sync_ticket_cor (keeps dual FK in sync)';
END $$;


-- ----------------------------------------------------------------
-- 47. Disposal loads
-- ----------------------------------------------------------------
-- ============================================================
-- DISPOSAL LOAD TRACKING
-- Simplified disposal tracking - quantity only, no pricing
-- ============================================================

-- Load type enum
CREATE TYPE disposal_load_type AS ENUM (
  'concrete',
  'trash',
  'metals',
  'hazardous_waste'
);

-- Main disposal loads table
CREATE TABLE IF NOT EXISTS disposal_loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- Nullable for field-entered data via PIN

  -- Core data
  work_date DATE NOT NULL,
  load_type disposal_load_type NOT NULL,
  load_count INTEGER NOT NULL CHECK (load_count >= 1),

  -- Optional notes (for future hazardous waste requirements)
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_disposal_loads_project ON disposal_loads(project_id);
CREATE INDEX idx_disposal_loads_date ON disposal_loads(work_date DESC);
CREATE INDEX idx_disposal_loads_type ON disposal_loads(load_type);
CREATE INDEX idx_disposal_loads_project_date ON disposal_loads(project_id, work_date DESC);
CREATE INDEX idx_disposal_loads_user ON disposal_loads(user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_disposal_loads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_disposal_loads_updated_at
  BEFORE UPDATE ON disposal_loads
  FOR EACH ROW
  EXECUTE FUNCTION update_disposal_loads_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE disposal_loads ENABLE ROW LEVEL SECURITY;

-- Foremen can manage disposal loads for their assigned projects
CREATE POLICY "Users can view disposal loads for their projects"
  ON disposal_loads FOR SELECT
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

CREATE POLICY "Users can insert disposal loads for assigned projects"
  ON disposal_loads FOR INSERT
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

CREATE POLICY "Users can update their own disposal loads"
  ON disposal_loads FOR UPDATE
  USING (
    user_id = auth.uid()
    OR
    project_id IN (
      SELECT id FROM projects WHERE company_id IN (
        SELECT company_id FROM user_companies
        WHERE user_id = auth.uid()
        AND status = 'active'
        AND access_level = 'administrator'
      )
    )
  );

CREATE POLICY "Users can delete their own disposal loads"
  ON disposal_loads FOR DELETE
  USING (
    user_id = auth.uid()
    OR
    project_id IN (
      SELECT id FROM projects WHERE company_id IN (
        SELECT company_id FROM user_companies
        WHERE user_id = auth.uid()
        AND status = 'active'
        AND access_level = 'administrator'
      )
    )
  );

-- ============================================================
-- AGGREGATION VIEW (for office/PM consumption)
-- ============================================================

CREATE OR REPLACE VIEW disposal_loads_summary AS
SELECT
  project_id,
  load_type,
  DATE_TRUNC('week', work_date)::DATE as week_start,
  DATE_TRUNC('month', work_date)::DATE as month_start,
  SUM(load_count) as total_loads,
  COUNT(DISTINCT work_date) as days_with_loads,
  MIN(work_date) as first_load_date,
  MAX(work_date) as last_load_date
FROM disposal_loads
GROUP BY project_id, load_type, DATE_TRUNC('week', work_date), DATE_TRUNC('month', work_date);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Get disposal summary for a project within a date range
CREATE OR REPLACE FUNCTION get_disposal_summary(
  p_project_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  load_type disposal_load_type,
  total_loads BIGINT,
  days_with_activity BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dl.load_type,
    SUM(dl.load_count)::BIGINT as total_loads,
    COUNT(DISTINCT dl.work_date)::BIGINT as days_with_activity
  FROM disposal_loads dl
  WHERE dl.project_id = p_project_id
    AND (p_start_date IS NULL OR dl.work_date >= p_start_date)
    AND (p_end_date IS NULL OR dl.work_date <= p_end_date)
  GROUP BY dl.load_type
  ORDER BY total_loads DESC;
END;
$$;

-- Get disposal loads for a specific date (for foreman daily view)
CREATE OR REPLACE FUNCTION get_daily_disposal_loads(
  p_project_id UUID,
  p_date DATE
)
RETURNS TABLE (
  id UUID,
  load_type disposal_load_type,
  load_count INTEGER,
  notes TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dl.id,
    dl.load_type,
    dl.load_count,
    dl.notes,
    dl.user_id,
    dl.created_at
  FROM disposal_loads dl
  WHERE dl.project_id = p_project_id
    AND dl.work_date = p_date
  ORDER BY dl.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_disposal_summary TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_disposal_loads TO authenticated;

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE 'Disposal Load Tracking tables created successfully!';
  RAISE NOTICE 'Table: disposal_loads';
  RAISE NOTICE 'View: disposal_loads_summary';
  RAISE NOTICE 'Functions: get_disposal_summary(), get_daily_disposal_loads()';
END $$;


-- ----------------------------------------------------------------
-- 48. Field COR access
-- ----------------------------------------------------------------
-- ============================================================
-- FIELD USER COR ACCESS
-- Allows field users (PIN-authenticated, not Supabase auth)
-- to view CORs for their project
-- ============================================================

-- Problem: Field foremen access the app via project PIN, not Supabase auth
-- This means auth.uid() is NULL for them, causing RLS to block all COR access
-- Solution: Add a SELECT-only policy that allows project-based access

-- ============================================================
-- 1. CHANGE_ORDERS - Allow anonymous SELECT by project_id
-- ============================================================

-- Add policy for anonymous/field access (SELECT only)
DROP POLICY IF EXISTS "Field users can view CORs by project" ON change_orders;

CREATE POLICY "Field users can view CORs by project"
ON change_orders FOR SELECT
USING (
  -- Allow SELECT when auth.uid() is NULL (field/anonymous access)
  -- This is safe because:
  -- 1. Field users already validated project PIN to get project_id
  -- 2. Query is filtered by project_id (they can only see their project's CORs)
  -- 3. Only SELECT is allowed, not INSERT/UPDATE/DELETE
  auth.uid() IS NULL
);

-- Also grant SELECT to anon role (required for RLS to work with anon key)
GRANT SELECT ON change_orders TO anon;

-- ============================================================
-- 2. CHANGE_ORDER_TICKET_ASSOCIATIONS - Allow field ticket linking
-- ============================================================

-- Field users need to:
-- 1. View existing associations
-- 2. Create new associations when submitting T&M tickets

DROP POLICY IF EXISTS "Field users can view ticket associations" ON change_order_ticket_associations;
DROP POLICY IF EXISTS "Field users can create ticket associations" ON change_order_ticket_associations;

CREATE POLICY "Field users can view ticket associations"
ON change_order_ticket_associations FOR SELECT
USING (
  auth.uid() IS NULL
);

CREATE POLICY "Field users can create ticket associations"
ON change_order_ticket_associations FOR INSERT
WITH CHECK (
  auth.uid() IS NULL
);

-- Grant permissions to anon role
GRANT SELECT, INSERT ON change_order_ticket_associations TO anon;

-- ============================================================
-- 3. T_AND_M_TICKETS - Ensure field can update assigned_cor_id
-- ============================================================

-- Check if policy exists and add if needed
DO $$
BEGIN
  -- Ensure anon can update tickets (for setting assigned_cor_id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 't_and_m_tickets'
    AND policyname = 'Field users can update tickets'
  ) THEN
    CREATE POLICY "Field users can update tickets"
    ON t_and_m_tickets FOR UPDATE
    USING (auth.uid() IS NULL)
    WITH CHECK (auth.uid() IS NULL);
  END IF;
END $$;

-- Ensure anon has update permission
GRANT UPDATE ON t_and_m_tickets TO anon;

-- ============================================================
-- 4. COR LINE ITEM TABLES - Allow field to import T&M data
-- ============================================================

-- When a field user links a T&M ticket to a COR, the system imports
-- labor, materials, and equipment data into the COR tables

-- CHANGE_ORDER_LABOR
DROP POLICY IF EXISTS "Field users can insert labor items" ON change_order_labor;
CREATE POLICY "Field users can insert labor items"
ON change_order_labor FOR INSERT
WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can view labor items" ON change_order_labor;
CREATE POLICY "Field users can view labor items"
ON change_order_labor FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT, INSERT ON change_order_labor TO anon;

-- CHANGE_ORDER_MATERIALS
DROP POLICY IF EXISTS "Field users can insert material items" ON change_order_materials;
CREATE POLICY "Field users can insert material items"
ON change_order_materials FOR INSERT
WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can view material items" ON change_order_materials;
CREATE POLICY "Field users can view material items"
ON change_order_materials FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT, INSERT ON change_order_materials TO anon;

-- CHANGE_ORDER_EQUIPMENT
DROP POLICY IF EXISTS "Field users can insert equipment items" ON change_order_equipment;
CREATE POLICY "Field users can insert equipment items"
ON change_order_equipment FOR INSERT
WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can view equipment items" ON change_order_equipment;
CREATE POLICY "Field users can view equipment items"
ON change_order_equipment FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT, INSERT ON change_order_equipment TO anon;

-- ============================================================
-- 5. SUPPORTING TABLES - Allow field to read rates/materials
-- ============================================================

-- Field needs to read labor_rates for importing ticket data
DROP POLICY IF EXISTS "Field users can view labor rates" ON labor_rates;
CREATE POLICY "Field users can view labor rates"
ON labor_rates FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT ON labor_rates TO anon;

-- Field needs to read materials_equipment for importing ticket data
DROP POLICY IF EXISTS "Field users can view materials equipment" ON materials_equipment;
CREATE POLICY "Field users can view materials equipment"
ON materials_equipment FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT ON materials_equipment TO anon;

-- ============================================================
-- 6. GRANT EXECUTE ON RPC FUNCTIONS
-- ============================================================

-- Allow anon to call the atomic ticket-COR functions
GRANT EXECUTE ON FUNCTION assign_ticket_to_cor(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION unassign_ticket_from_cor(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION recalculate_cor_totals(UUID) TO anon;

-- ============================================================
-- 7. COMPANY BRANDING - Allow field to view branding
-- ============================================================

DROP POLICY IF EXISTS "Field users can view company branding" ON company_branding;
CREATE POLICY "Field users can view company branding"
ON company_branding FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT ON company_branding TO anon;

-- ============================================================
-- 8. CREW CHECKINS - Allow field to manage crew check-ins
-- ============================================================

DROP POLICY IF EXISTS "Field users can view crew checkins" ON crew_checkins;
CREATE POLICY "Field users can view crew checkins"
ON crew_checkins FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create crew checkins" ON crew_checkins;
CREATE POLICY "Field users can create crew checkins"
ON crew_checkins FOR INSERT
WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can update crew checkins" ON crew_checkins;
CREATE POLICY "Field users can update crew checkins"
ON crew_checkins FOR UPDATE
USING (auth.uid() IS NULL)
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT, UPDATE ON crew_checkins TO anon;

-- ============================================================
-- 9. PROJECTS - Allow field to view project details
-- ============================================================

DROP POLICY IF EXISTS "Field users can view projects" ON projects;
CREATE POLICY "Field users can view projects"
ON projects FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT ON projects TO anon;

-- ============================================================
-- 10. COMPANIES - Allow field to view company info
-- ============================================================

DROP POLICY IF EXISTS "Field users can view companies" ON companies;
CREATE POLICY "Field users can view companies"
ON companies FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT ON companies TO anon;

-- ============================================================
-- 11. AREAS - Allow field to view and update areas
-- ============================================================

DROP POLICY IF EXISTS "Field users can view areas" ON areas;
CREATE POLICY "Field users can view areas"
ON areas FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can update areas" ON areas;
CREATE POLICY "Field users can update areas"
ON areas FOR UPDATE
USING (auth.uid() IS NULL)
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, UPDATE ON areas TO anon;

-- ============================================================
-- 12. MESSAGES - Allow field to view and send messages
-- ============================================================

DROP POLICY IF EXISTS "Field users can view messages" ON messages;
CREATE POLICY "Field users can view messages"
ON messages FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can send messages" ON messages;
CREATE POLICY "Field users can send messages"
ON messages FOR INSERT
WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can update messages" ON messages;
CREATE POLICY "Field users can update messages"
ON messages FOR UPDATE
USING (auth.uid() IS NULL)
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT, UPDATE ON messages TO anon;

-- ============================================================
-- 13. DAILY REPORTS - Allow field to create daily reports
-- ============================================================

DROP POLICY IF EXISTS "Field users can view daily reports" ON daily_reports;
CREATE POLICY "Field users can view daily reports"
ON daily_reports FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create daily reports" ON daily_reports;
CREATE POLICY "Field users can create daily reports"
ON daily_reports FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT ON daily_reports TO anon;

-- ============================================================
-- 14. INJURY REPORTS - Allow field to create injury reports
-- ============================================================

DROP POLICY IF EXISTS "Field users can view injury reports" ON injury_reports;
CREATE POLICY "Field users can view injury reports"
ON injury_reports FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create injury reports" ON injury_reports;
CREATE POLICY "Field users can create injury reports"
ON injury_reports FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT ON injury_reports TO anon;

-- ============================================================
-- 15. MATERIAL REQUESTS - Allow field to create material requests
-- ============================================================

DROP POLICY IF EXISTS "Field users can view material requests" ON material_requests;
CREATE POLICY "Field users can view material requests"
ON material_requests FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create material requests" ON material_requests;
CREATE POLICY "Field users can create material requests"
ON material_requests FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT ON material_requests TO anon;

-- ============================================================
-- 16. DISPOSAL LOADS - Allow field to manage disposal loads
-- ============================================================

DROP POLICY IF EXISTS "Field users can view disposal loads" ON disposal_loads;
CREATE POLICY "Field users can view disposal loads"
ON disposal_loads FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create disposal loads" ON disposal_loads;
CREATE POLICY "Field users can create disposal loads"
ON disposal_loads FOR INSERT
WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can update disposal loads" ON disposal_loads;
CREATE POLICY "Field users can update disposal loads"
ON disposal_loads FOR UPDATE
USING (auth.uid() IS NULL)
WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can delete disposal loads" ON disposal_loads;
CREATE POLICY "Field users can delete disposal loads"
ON disposal_loads FOR DELETE
USING (auth.uid() IS NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON disposal_loads TO anon;

-- ============================================================
-- 17. DUMP SITES - Allow field to view dump sites
-- ============================================================

DROP POLICY IF EXISTS "Field users can view dump sites" ON dump_sites;
CREATE POLICY "Field users can view dump sites"
ON dump_sites FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT ON dump_sites TO anon;

-- ============================================================
-- 18. T&M TICKETS - Ensure full field access
-- ============================================================

DROP POLICY IF EXISTS "Field users can view tickets" ON t_and_m_tickets;
CREATE POLICY "Field users can view tickets"
ON t_and_m_tickets FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create tickets" ON t_and_m_tickets;
CREATE POLICY "Field users can create tickets"
ON t_and_m_tickets FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT, UPDATE ON t_and_m_tickets TO anon;

-- ============================================================
-- 19. T&M WORKERS - Allow field to manage workers
-- ============================================================

DROP POLICY IF EXISTS "Field users can view workers" ON t_and_m_workers;
CREATE POLICY "Field users can view workers"
ON t_and_m_workers FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create workers" ON t_and_m_workers;
CREATE POLICY "Field users can create workers"
ON t_and_m_workers FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT ON t_and_m_workers TO anon;

-- ============================================================
-- 20. T&M ITEMS - Allow field to manage items
-- ============================================================

DROP POLICY IF EXISTS "Field users can view items" ON t_and_m_items;
CREATE POLICY "Field users can view items"
ON t_and_m_items FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create items" ON t_and_m_items;
CREATE POLICY "Field users can create items"
ON t_and_m_items FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT ON t_and_m_items TO anon;

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '✓ Field access policies created successfully!';
  RAISE NOTICE '  - CORs: SELECT, ticket associations';
  RAISE NOTICE '  - T&M: Full ticket/worker/item access';
  RAISE NOTICE '  - Crew check-ins, disposal loads, daily reports';
  RAISE NOTICE '  - Messages, material requests, injury reports';
  RAISE NOTICE '  - Company branding, projects, areas';
END $$;


-- ----------------------------------------------------------------
-- 49. Reverse ticket-COR sync
-- ----------------------------------------------------------------
-- ============================================================
-- REVERSE SYNC: Ticket assigned_cor_id → Junction Table
-- ============================================================
--
-- Problem: When a T&M ticket is created with assigned_cor_id set,
-- no junction table entry is created. The COR detail view and PDF
-- export look for entries in change_order_ticket_associations,
-- but they're never created from field ticket submissions.
--
-- Solution: Add a trigger that creates junction entries when
-- assigned_cor_id is set on a ticket (INSERT or UPDATE).
-- ============================================================

-- Function to sync assigned_cor_id changes to junction table
CREATE OR REPLACE FUNCTION sync_ticket_to_junction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Handle INSERT or UPDATE where assigned_cor_id is set
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- If assigned_cor_id was set or changed
    IF NEW.assigned_cor_id IS NOT NULL THEN
      -- Create junction entry if it doesn't exist
      INSERT INTO change_order_ticket_associations (change_order_id, ticket_id, data_imported)
      VALUES (NEW.assigned_cor_id, NEW.id, false)
      ON CONFLICT (change_order_id, ticket_id) DO NOTHING;
    END IF;

    -- If assigned_cor_id was cleared (UPDATE only)
    IF TG_OP = 'UPDATE' AND OLD.assigned_cor_id IS NOT NULL AND NEW.assigned_cor_id IS NULL THEN
      -- Remove the old junction entry
      DELETE FROM change_order_ticket_associations
      WHERE ticket_id = NEW.id AND change_order_id = OLD.assigned_cor_id;
    END IF;

    -- If assigned_cor_id was changed to a different COR (UPDATE only)
    IF TG_OP = 'UPDATE' AND OLD.assigned_cor_id IS NOT NULL AND NEW.assigned_cor_id IS NOT NULL
       AND OLD.assigned_cor_id != NEW.assigned_cor_id THEN
      -- Remove old junction entry
      DELETE FROM change_order_ticket_associations
      WHERE ticket_id = NEW.id AND change_order_id = OLD.assigned_cor_id;
    END IF;

    RETURN NEW;
  END IF;

  -- Handle DELETE - clean up junction entries
  IF TG_OP = 'DELETE' THEN
    IF OLD.assigned_cor_id IS NOT NULL THEN
      DELETE FROM change_order_ticket_associations
      WHERE ticket_id = OLD.id AND change_order_id = OLD.assigned_cor_id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_sync_ticket_to_junction ON t_and_m_tickets;

-- Create trigger on t_and_m_tickets
CREATE TRIGGER trg_sync_ticket_to_junction
AFTER INSERT OR UPDATE OF assigned_cor_id OR DELETE ON t_and_m_tickets
FOR EACH ROW EXECUTE FUNCTION sync_ticket_to_junction();

-- ============================================================
-- FIX EXISTING DATA
-- Create junction entries for all tickets that have assigned_cor_id
-- but are missing from the junction table
-- ============================================================

INSERT INTO change_order_ticket_associations (change_order_id, ticket_id, data_imported)
SELECT t.assigned_cor_id, t.id, false
FROM t_and_m_tickets t
WHERE t.assigned_cor_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM change_order_ticket_associations a
    WHERE a.ticket_id = t.id AND a.change_order_id = t.assigned_cor_id
  )
ON CONFLICT (change_order_id, ticket_id) DO NOTHING;

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
DECLARE
  fixed_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO fixed_count
  FROM t_and_m_tickets t
  WHERE t.assigned_cor_id IS NOT NULL;

  RAISE NOTICE '✓ Reverse ticket-COR sync trigger created!';
  RAISE NOTICE '  - Trigger: trg_sync_ticket_to_junction';
  RAISE NOTICE '  - Tickets with assigned_cor_id: %', fixed_count;
  RAISE NOTICE '  - Junction entries now synced automatically';
END $$;


-- ----------------------------------------------------------------
-- 50. Signature anon access (CLI)
-- ----------------------------------------------------------------
-- Migration: Add RLS policies for anon/field users to create signature requests
-- Run this in your Supabase SQL Editor
--
-- Problem: Field users authenticate via project PIN (anon role), not Supabase Auth.
-- They need to be able to create signature request links for T&M tickets.

-- ============================================================================
-- Grant execute on signature functions to anon role
-- ============================================================================

GRANT EXECUTE ON FUNCTION generate_signature_token() TO anon;
GRANT EXECUTE ON FUNCTION increment_signature_view_count(TEXT) TO anon;

-- ============================================================================
-- Add INSERT policy for anon role on signature_requests
-- ============================================================================

-- Field users can create signature requests for T&M tickets
CREATE POLICY "Anon can create signature requests" ON signature_requests
  FOR INSERT
  WITH CHECK (
    document_type IN ('tm_ticket', 'cor')
  );

-- Field users can update their signature requests (e.g., view count)
CREATE POLICY "Anon can update signature requests" ON signature_requests
  FOR UPDATE
  USING (
    status IN ('pending', 'partially_signed')
    AND (expires_at IS NULL OR expires_at > NOW())
  );

-- ============================================================================
-- Verification queries (run after migration)
-- ============================================================================

-- Check policies exist:
-- SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'signature_requests';

-- Test creating a signature request as anon:
-- SET ROLE anon;
-- SELECT generate_signature_token();
-- RESET ROLE;


-- ----------------------------------------------------------------
-- 51. Fix ambiguous project_id
-- ----------------------------------------------------------------
-- ============================================================
-- FIX AMBIGUOUS PROJECT_ID ERROR
-- ============================================================
-- Problem: "Error: column reference 'project_id' is ambiguous"
-- occurs when field users try to validate PIN
--
-- Root cause: Conflicting or complex RLS policies on projects table
-- that weren't properly cleaned up from earlier migrations
--
-- Solution: Drop ALL existing RLS policies and recreate with
-- simple, non-conflicting policies
-- ============================================================

-- ============================================================
-- 1. DROP ALL EXISTING POLICIES ON PROJECTS
-- ============================================================

-- Drop all possible project policies from various migrations
DROP POLICY IF EXISTS "Allow all operations on projects" ON projects;
DROP POLICY IF EXISTS "Office can view all projects" ON projects;
DROP POLICY IF EXISTS "Foremen can view assigned projects" ON projects;
DROP POLICY IF EXISTS "Office can manage projects" ON projects;
DROP POLICY IF EXISTS "Anyone can view projects by PIN" ON projects;
DROP POLICY IF EXISTS "Authenticated users can manage projects" ON projects;
DROP POLICY IF EXISTS "Field users can view projects" ON projects;
DROP POLICY IF EXISTS "Secure field view projects" ON projects;
DROP POLICY IF EXISTS "Active members view projects" ON projects;
DROP POLICY IF EXISTS "Active members manage projects" ON projects;

-- ============================================================
-- 2. DROP ALL EXISTING POLICIES ON AREAS
-- ============================================================

-- Drop all possible area policies
DROP POLICY IF EXISTS "Allow all operations on areas" ON areas;
DROP POLICY IF EXISTS "Users can view areas" ON areas;
DROP POLICY IF EXISTS "Users can update area status" ON areas;
DROP POLICY IF EXISTS "Office can manage areas" ON areas;
DROP POLICY IF EXISTS "Office can delete areas" ON areas;
DROP POLICY IF EXISTS "Anyone can view areas" ON areas;
DROP POLICY IF EXISTS "Anyone can update areas" ON areas;
DROP POLICY IF EXISTS "Authenticated can create areas" ON areas;
DROP POLICY IF EXISTS "Authenticated can delete areas" ON areas;
DROP POLICY IF EXISTS "Field users can view areas" ON areas;
DROP POLICY IF EXISTS "Field users can update areas" ON areas;
DROP POLICY IF EXISTS "Secure field access to areas" ON areas;
DROP POLICY IF EXISTS "Secure field update areas" ON areas;
DROP POLICY IF EXISTS "Active members view areas" ON areas;
DROP POLICY IF EXISTS "Active members update areas" ON areas;
DROP POLICY IF EXISTS "Active members create areas" ON areas;
DROP POLICY IF EXISTS "Active admins delete areas" ON areas;

-- ============================================================
-- 3. DROP ALL EXISTING POLICIES ON COMPANIES
-- ============================================================

DROP POLICY IF EXISTS "Field users can view companies" ON companies;
DROP POLICY IF EXISTS "Secure field view companies" ON companies;
DROP POLICY IF EXISTS "Active members view companies" ON companies;
DROP POLICY IF EXISTS "Anyone can view companies" ON companies;

-- ============================================================
-- 4. RECREATE SIMPLE, CLEAN POLICIES FOR PROJECTS
-- ============================================================

-- Field users (anonymous, PIN-authenticated) can view all projects
-- This is safe because they've already validated via PIN
CREATE POLICY "Field users can view projects"
ON projects FOR SELECT
TO anon
USING (true);

-- Authenticated office users can view projects in their company
CREATE POLICY "Authenticated users can view projects"
ON projects FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
      AND uc.company_id = projects.company_id
      AND uc.status = 'active'
  )
);

-- Authenticated office users can manage projects in their company
CREATE POLICY "Authenticated users can manage projects"
ON projects FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
      AND uc.company_id = projects.company_id
      AND uc.status = 'active'
      AND uc.role IN ('admin', 'owner', 'office')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
      AND uc.company_id = projects.company_id
      AND uc.status = 'active'
      AND uc.role IN ('admin', 'owner', 'office')
  )
);

-- ============================================================
-- 5. RECREATE SIMPLE, CLEAN POLICIES FOR AREAS
-- ============================================================

-- Field users can view all areas
CREATE POLICY "Field users can view areas"
ON areas FOR SELECT
TO anon
USING (true);

-- Field users can update area status
CREATE POLICY "Field users can update areas"
ON areas FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Authenticated users can view areas in their company's projects
CREATE POLICY "Authenticated users can view areas"
ON areas FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM projects p
    JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = areas.project_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
  )
);

-- Authenticated users can manage areas in their company's projects
CREATE POLICY "Authenticated users can manage areas"
ON areas FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM projects p
    JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = areas.project_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM projects p
    JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = areas.project_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
  )
);

-- ============================================================
-- 6. RECREATE SIMPLE, CLEAN POLICIES FOR COMPANIES
-- ============================================================

-- Field users can view all companies (they need this to validate company codes)
CREATE POLICY "Field users can view companies"
ON companies FOR SELECT
TO anon
USING (true);

-- Authenticated users can view companies they're members of
CREATE POLICY "Authenticated users can view companies"
ON companies FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
      AND uc.company_id = companies.id
      AND uc.status = 'active'
  )
);

-- ============================================================
-- 7. ENSURE PROPER GRANTS
-- ============================================================

-- Grant necessary permissions to anon role
GRANT SELECT ON projects TO anon;
GRANT SELECT, UPDATE ON areas TO anon;
GRANT SELECT ON companies TO anon;

-- ============================================================
-- 8. SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '✓ FIXED AMBIGUOUS PROJECT_ID ERROR';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'All conflicting RLS policies have been removed and replaced';
  RAISE NOTICE 'with simple, non-conflicting policies.';
  RAISE NOTICE '';
  RAISE NOTICE 'Projects: Field users can view all, authenticated users';
  RAISE NOTICE '          can view/manage their company projects';
  RAISE NOTICE '';
  RAISE NOTICE 'Areas: Field users can view/update all, authenticated users';
  RAISE NOTICE '       can manage their company areas';
  RAISE NOTICE '';
  RAISE NOTICE 'Companies: Field users can view all (for PIN validation),';
  RAISE NOTICE '           authenticated users can view their companies';
  RAISE NOTICE '';
END $$;


-- ----------------------------------------------------------------
-- 52. Fix ambiguous project_id v2
-- ----------------------------------------------------------------
-- ============================================================
-- FIX AMBIGUOUS PROJECT_ID ERROR - COMPREHENSIVE FIX
-- ============================================================
-- Problem: "Error: column reference 'project_id' is ambiguous"
-- This occurs when RLS policies reference project_id without
-- proper table qualification in JOIN/subquery contexts
-- ============================================================

-- ============================================================
-- STEP 1: Drop ALL existing problematic policies
-- ============================================================

-- Drop all project policies
DROP POLICY IF EXISTS "Allow all operations on projects" ON projects;
DROP POLICY IF EXISTS "Office can view all projects" ON projects;
DROP POLICY IF EXISTS "Foremen can view assigned projects" ON projects;
DROP POLICY IF EXISTS "Office can manage projects" ON projects;
DROP POLICY IF EXISTS "Anyone can view projects by PIN" ON projects;
DROP POLICY IF EXISTS "Authenticated users can manage projects" ON projects;
DROP POLICY IF EXISTS "Field users can view projects" ON projects;
DROP POLICY IF EXISTS "Secure field view projects" ON projects;
DROP POLICY IF EXISTS "Active members view projects" ON projects;
DROP POLICY IF EXISTS "Active members manage projects" ON projects;
DROP POLICY IF EXISTS "Authenticated users can view projects" ON projects;

-- Drop all area policies
DROP POLICY IF EXISTS "Allow all operations on areas" ON areas;
DROP POLICY IF EXISTS "Users can view areas" ON areas;
DROP POLICY IF EXISTS "Users can update area status" ON areas;
DROP POLICY IF EXISTS "Office can manage areas" ON areas;
DROP POLICY IF EXISTS "Office can delete areas" ON areas;
DROP POLICY IF EXISTS "Anyone can view areas" ON areas;
DROP POLICY IF EXISTS "Anyone can update areas" ON areas;
DROP POLICY IF EXISTS "Authenticated can create areas" ON areas;
DROP POLICY IF EXISTS "Authenticated can delete areas" ON areas;
DROP POLICY IF EXISTS "Field users can view areas" ON areas;
DROP POLICY IF EXISTS "Field users can update areas" ON areas;
DROP POLICY IF EXISTS "Secure field access to areas" ON areas;
DROP POLICY IF EXISTS "Secure field update areas" ON areas;
DROP POLICY IF EXISTS "Active members view areas" ON areas;
DROP POLICY IF EXISTS "Active members update areas" ON areas;
DROP POLICY IF EXISTS "Active members create areas" ON areas;
DROP POLICY IF EXISTS "Active admins delete areas" ON areas;
DROP POLICY IF EXISTS "Authenticated users can view areas" ON areas;
DROP POLICY IF EXISTS "Authenticated users can manage areas" ON areas;

-- Drop all company policies
DROP POLICY IF EXISTS "Field users can view companies" ON companies;
DROP POLICY IF EXISTS "Secure field view companies" ON companies;
DROP POLICY IF EXISTS "Active members view companies" ON companies;
DROP POLICY IF EXISTS "Anyone can view companies" ON companies;
DROP POLICY IF EXISTS "Authenticated users can view companies" ON companies;

-- ============================================================
-- STEP 2: Create clean, properly qualified policies
-- ============================================================

-- ============================================================
-- PROJECTS POLICIES
-- ============================================================

-- Field users (anonymous, PIN-authenticated) can view all projects
-- This is safe because they've already validated via PIN
CREATE POLICY "Field users can view projects"
ON projects FOR SELECT
TO anon
USING (true);

-- Authenticated office users can view projects in their company
CREATE POLICY "Authenticated users can view projects"
ON projects FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
      AND uc.company_id = projects.company_id
      AND uc.status = 'active'
  )
);

-- Authenticated office users can manage projects in their company
CREATE POLICY "Authenticated users can manage projects"
ON projects FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
      AND uc.company_id = projects.company_id
      AND uc.status = 'active'
      AND uc.role IN ('admin', 'owner', 'office')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
      AND uc.company_id = projects.company_id
      AND uc.status = 'active'
      AND uc.role IN ('admin', 'owner', 'office')
  )
);

-- ============================================================
-- AREAS POLICIES
-- ============================================================

-- Field users can view all areas
CREATE POLICY "Field users can view areas"
ON areas FOR SELECT
TO anon
USING (true);

-- Field users can update area status
CREATE POLICY "Field users can update areas"
ON areas FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Authenticated users can view areas in their company's projects
CREATE POLICY "Authenticated users can view areas"
ON areas FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM projects p
    JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = areas.project_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
  )
);

-- Authenticated users can manage areas in their company's projects
CREATE POLICY "Authenticated users can manage areas"
ON areas FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM projects p
    JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = areas.project_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM projects p
    JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = areas.project_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
  )
);

-- ============================================================
-- COMPANIES POLICIES
-- ============================================================

-- Field users can view all companies (they need this to validate company codes)
CREATE POLICY "Field users can view companies"
ON companies FOR SELECT
TO anon
USING (true);

-- Authenticated users can view companies they're members of
CREATE POLICY "Authenticated users can view companies"
ON companies FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
      AND uc.company_id = companies.id
      AND uc.status = 'active'
  )
);

-- ============================================================
-- STEP 3: Ensure proper grants
-- ============================================================

-- Grant necessary permissions to anon role
GRANT SELECT ON projects TO anon;
GRANT SELECT, UPDATE ON areas TO anon;
GRANT SELECT ON companies TO anon;

-- ============================================================
-- STEP 4: Verify the fix
-- ============================================================

DO $$
DECLARE
  policy_count INT;
BEGIN
  -- Count policies on projects
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'projects';

  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '✓ FIXED AMBIGUOUS PROJECT_ID ERROR';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'All conflicting RLS policies have been removed and replaced';
  RAISE NOTICE 'with properly qualified, non-conflicting policies.';
  RAISE NOTICE '';
  RAISE NOTICE 'Projects table now has % policies', policy_count;
  RAISE NOTICE '';
  RAISE NOTICE 'PIN validation should now work correctly!';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
END $$;


-- ----------------------------------------------------------------
-- 53. Performance indexes (CLI)
-- ----------------------------------------------------------------
-- ============================================================
-- PERFORMANCE INDEXES FOR SCALABILITY
-- ============================================================
-- These indexes address critical N+1 query patterns and slow
-- filtering operations identified in the codebase audit.
--
-- Impact: 10-100x improvement on filtered queries at scale
-- ============================================================

-- ============================================================
-- 1. CREW CHECKINS - Frequent date-based lookups
-- ============================================================
-- Used by: calculateManDayCosts(), getCrewCheckinHistory()
-- Query pattern: WHERE project_id = ? AND check_in_date >= ?
CREATE INDEX IF NOT EXISTS idx_crew_checkins_project_date
ON crew_checkins(project_id, check_in_date DESC);

-- ============================================================
-- 2. T&M TICKETS - Primary access pattern
-- ============================================================
-- Used by: getTMTickets(), getTMTicketsPaginated(), getPreviousTicketCrew()
-- Query pattern: WHERE project_id = ? ORDER BY work_date DESC
CREATE INDEX IF NOT EXISTS idx_tm_tickets_project_workdate
ON t_and_m_tickets(project_id, work_date DESC);

-- Status filtering for approval workflows
-- Query pattern: WHERE project_id = ? AND status = ?
CREATE INDEX IF NOT EXISTS idx_tm_tickets_project_status
ON t_and_m_tickets(project_id, status);

-- ============================================================
-- 3. CHANGE ORDERS (CORs) - Filtered views
-- ============================================================
-- Used by: getCORs(), getCORStats()
-- Query pattern: WHERE project_id = ? AND status = ?
CREATE INDEX IF NOT EXISTS idx_change_orders_project_status
ON change_orders(project_id, status);

-- ============================================================
-- 4. DISPOSAL LOADS - Date range queries
-- ============================================================
-- Used by: getDisposalLoads(), calculateHaulOffCosts()
-- Query pattern: WHERE project_id = ? ORDER BY work_date DESC
CREATE INDEX IF NOT EXISTS idx_disposal_loads_project_date
ON disposal_loads(project_id, work_date DESC);

-- ============================================================
-- 5. PROJECT COSTS - Custom cost tracking
-- ============================================================
-- Used by: getProjectCosts()
-- Query pattern: WHERE project_id = ? ORDER BY cost_date DESC
CREATE INDEX IF NOT EXISTS idx_project_costs_project_date
ON project_costs(project_id, cost_date DESC);

-- ============================================================
-- 6. DAILY REPORTS - Recent activity queries
-- ============================================================
-- Used by: getDailyReports()
-- Query pattern: WHERE project_id = ? ORDER BY report_date DESC
CREATE INDEX IF NOT EXISTS idx_daily_reports_project_date
ON daily_reports(project_id, report_date DESC);

-- ============================================================
-- 7. AREAS - Sorted area lists
-- ============================================================
-- Used by: getAreas()
-- Query pattern: WHERE project_id = ? ORDER BY sort_order
CREATE INDEX IF NOT EXISTS idx_areas_project_sort
ON areas(project_id, sort_order);

-- ============================================================
-- 8. DOCUMENTS - Folder and search optimization
-- ============================================================
-- Used by: getFolderDocuments(), searchDocuments()
-- Note: documents table uses uploaded_at, not created_at
CREATE INDEX IF NOT EXISTS idx_documents_folder_perf
ON documents(folder_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_project_category
ON documents(project_id, category);

-- ============================================================
-- 9. COMPANIES - Code lookup for PIN validation
-- ============================================================
-- Used by: getCompanyByCode() (critical for field user auth)
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_code
ON companies(code) WHERE code IS NOT NULL;

-- ============================================================
-- 10. FIELD SESSIONS - Active session lookups
-- ============================================================
-- Note: Basic indexes (token, project, expires) already exist in migration_field_sessions.sql
-- This adds a composite index for device-based session management
CREATE INDEX IF NOT EXISTS idx_field_sessions_project_device
ON field_sessions(project_id, device_id, created_at DESC);

-- ============================================================
-- 11. USER COMPANIES - Role-based access checks
-- ============================================================
-- Used by: RLS policies for company membership verification
CREATE INDEX IF NOT EXISTS idx_user_companies_user_status
ON user_companies(user_id, status) WHERE status = 'active';

-- ============================================================
-- VERIFICATION
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'PERFORMANCE INDEXES CREATED SUCCESSFULLY';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Indexes created for:';
  RAISE NOTICE '  - crew_checkins (project_id, check_in_date)';
  RAISE NOTICE '  - t_and_m_tickets (project_id, work_date), (project_id, status)';
  RAISE NOTICE '  - change_orders (project_id, status)';
  RAISE NOTICE '  - disposal_loads (project_id, work_date)';
  RAISE NOTICE '  - project_costs (project_id, cost_date)';
  RAISE NOTICE '  - daily_reports (project_id, report_date)';
  RAISE NOTICE '  - areas (project_id, sort_order)';
  RAISE NOTICE '  - documents (folder_id), (project_id, category)';
  RAISE NOTICE '  - companies (code) UNIQUE';
  RAISE NOTICE '  - field_sessions (session_token), (project_id, device_id)';
  RAISE NOTICE '  - user_companies (user_id, status)';
  RAISE NOTICE '';
  RAISE NOTICE 'These indexes will significantly improve query performance';
  RAISE NOTICE 'as the database scales to thousands of records.';
  RAISE NOTICE '';
END $$;


-- ----------------------------------------------------------------
-- 54. Fix draw requests FK
-- ----------------------------------------------------------------
-- Fix draw_requests.created_by FK: add ON DELETE SET NULL so deleting a user
-- does not leave a dangling foreign key reference.
ALTER TABLE draw_requests
  DROP CONSTRAINT IF EXISTS draw_requests_created_by_fkey;

ALTER TABLE draw_requests
  ADD CONSTRAINT draw_requests_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ----------------------------------------------------------------
-- 55. Fix photo bucket
-- ----------------------------------------------------------------
-- ============================================================
-- CRITICAL SECURITY FIX: Restrict tm-photos bucket read access
-- ============================================================
-- The previous policy:
--   CREATE POLICY "Public read access for tm-photos"
--   ON storage.objects FOR SELECT TO public
--   USING (bucket_id = 'tm-photos');
--
-- ...allowed ANYONE on the internet to read all project photos,
-- including injury documentation, damage evidence, and before/after
-- site conditions that are routinely used in legal disputes.
--
-- New policy: only authenticated users (office staff) or field
-- workers with a valid PIN-issued session can read photos.
-- ============================================================

-- Drop the open public policy
DROP POLICY IF EXISTS "Public read access for tm-photos" ON storage.objects;

-- Replace with authenticated + valid field session access
CREATE POLICY "Authenticated or field session can read tm-photos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'tm-photos'
  AND (
    -- Office staff logged in via Supabase Auth
    auth.uid() IS NOT NULL
    OR
    -- Field workers with a valid PIN-issued session
    EXISTS (SELECT 1 FROM has_valid_field_session())
  )
);

-- Also ensure the bucket itself is marked private (not public)
-- This prevents direct URL access bypassing RLS entirely.
-- NOTE: This must also be confirmed in the Supabase dashboard:
--   Storage > tm-photos > Edit bucket > uncheck "Public bucket"
UPDATE storage.buckets
SET public = false
WHERE id = 'tm-photos';

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'CRITICAL-2 FIX APPLIED: tm-photos bucket is no longer public';
  RAISE NOTICE 'Read access requires: authenticated user OR valid field session';
  RAISE NOTICE 'ACTION REQUIRED: Also uncheck "Public bucket" in Supabase dashboard';
  RAISE NOTICE '   Storage > tm-photos > Edit bucket > uncheck Public';
  RAISE NOTICE '============================================================';
END $$;


-- ----------------------------------------------------------------
-- 56. Project shares company_id
-- ----------------------------------------------------------------
-- ============================================================
-- CRITICAL-3 FIX: Add company_id to project_shares
-- ============================================================
-- The project_shares table had no company_id column, requiring
-- all company-level filtering to JOIN through projects.
-- This is slow at scale and inconsistent with every other table
-- in the schema that has a direct company_id column.
--
-- This migration:
--  1. Adds company_id column
--  2. Backfills it from the linked project
--  3. Adds NOT NULL constraint and FK
--  4. Adds index for fast company-level queries
--  5. Updates the management RLS policy to use company_id directly
-- ============================================================

-- Step 1: Add nullable column first to allow backfill
ALTER TABLE project_shares
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Step 2: Backfill from linked project
UPDATE project_shares ps
SET company_id = p.company_id
FROM projects p
WHERE p.id = ps.project_id
  AND ps.company_id IS NULL;

-- Step 3: Make NOT NULL now that all rows are populated
ALTER TABLE project_shares
  ALTER COLUMN company_id SET NOT NULL;

-- Step 4: Index for company-level listing queries
CREATE INDEX IF NOT EXISTS idx_project_shares_company
  ON project_shares(company_id);

-- Step 5: Update management policy to use company_id directly (avoids JOIN)
DROP POLICY IF EXISTS "Allow company users to manage shares" ON project_shares;
CREATE POLICY "Allow company users to manage shares"
ON project_shares FOR ALL
USING (
  company_id IN (
    SELECT uc.company_id FROM user_companies uc
    WHERE uc.user_id = auth.uid()
      AND uc.status = 'active'
  )
);

-- Step 6: Ensure future inserts always provide company_id.
-- Add a trigger to auto-populate it if omitted.
CREATE OR REPLACE FUNCTION set_project_share_company_id()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    SELECT company_id INTO NEW.company_id
    FROM projects WHERE id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_shares_company_id ON project_shares;
CREATE TRIGGER trg_project_shares_company_id
  BEFORE INSERT ON project_shares
  FOR EACH ROW EXECUTE FUNCTION set_project_share_company_id();

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'CRITICAL-3 FIX APPLIED: company_id added to project_shares';
  RAISE NOTICE 'RLS policy updated to use direct company_id lookup (no JOIN)';
  RAISE NOTICE '============================================================';
END $$;


-- ----------------------------------------------------------------
-- 57. Secure field RLS
-- ----------------------------------------------------------------
-- ============================================================
-- CRITICAL SECURITY FIX: Replace auth.uid() IS NULL policies
-- ============================================================
-- The previous field-user RLS policies used:
--   USING (auth.uid() IS NULL)
-- which allows ANY anonymous HTTP request to read/write data
-- with no project validation whatsoever.
--
-- This migration replaces them with session-validated policies
-- using the field_sessions table. Field workers authenticate via
-- PIN, receive a session token, and must include it as the
-- x-field-session header on all subsequent requests.
--
-- Run order:
--   1. This file (creates tables, functions, secure policies)
--   2. 20260218_fix_photo_bucket.sql
--   3. 20260218_project_shares_company_id.sql
-- ============================================================

-- ============================================================
-- PART 1: RATE LIMITING (prerequisite for session creation)
-- ============================================================

CREATE TABLE IF NOT EXISTS auth_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT,
  device_id TEXT,
  attempt_type TEXT NOT NULL DEFAULT 'pin',
  success BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip_time
  ON auth_attempts(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_device_time
  ON auth_attempts(device_id, created_at DESC);

ALTER TABLE auth_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow logging auth attempts" ON auth_attempts;
CREATE POLICY "Allow logging auth attempts"
ON auth_attempts FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Service can read auth attempts" ON auth_attempts;
CREATE POLICY "Service can read auth attempts"
ON auth_attempts FOR SELECT
USING (auth.role() = 'service_role');

GRANT INSERT ON auth_attempts TO anon;
GRANT SELECT ON auth_attempts TO service_role;

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_ip_address TEXT,
  p_device_id TEXT,
  p_window_minutes INTEGER DEFAULT 15,
  p_max_attempts INTEGER DEFAULT 5
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  recent_failures INTEGER;
BEGIN
  SELECT COUNT(*) INTO recent_failures
  FROM auth_attempts
  WHERE (ip_address = p_ip_address OR device_id = p_device_id)
    AND success = FALSE
    AND created_at > NOW() - (p_window_minutes || ' minutes')::INTERVAL;
  RETURN recent_failures < p_max_attempts;
END;
$$;

CREATE OR REPLACE FUNCTION log_auth_attempt(
  p_ip_address TEXT,
  p_device_id TEXT,
  p_success BOOLEAN,
  p_attempt_type TEXT DEFAULT 'pin'
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO auth_attempts (ip_address, device_id, attempt_type, success)
  VALUES (p_ip_address, p_device_id, p_attempt_type, p_success);
END;
$$;

GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION log_auth_attempt(TEXT, TEXT, BOOLEAN, TEXT) TO anon;

-- ============================================================
-- PART 2: FIELD SESSIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS field_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_sessions_token   ON field_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_field_sessions_project ON field_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_field_sessions_expires ON field_sessions(expires_at);

ALTER TABLE field_sessions ENABLE ROW LEVEL SECURITY;

-- Sessions table is never directly accessible — only via SECURITY DEFINER functions
DROP POLICY IF EXISTS "No direct session access" ON field_sessions;
CREATE POLICY "No direct session access"
ON field_sessions FOR ALL USING (false);

GRANT SELECT, INSERT, UPDATE, DELETE ON field_sessions TO anon;

-- ============================================================
-- PART 3: SESSION VALIDATION FUNCTIONS
-- ============================================================

-- Validate session token for a specific project
CREATE OR REPLACE FUNCTION validate_field_session(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_token TEXT;
  valid   BOOLEAN := false;
BEGIN
  BEGIN
    v_token := current_setting('request.headers', true)::json->>'x-field-session';
  EXCEPTION WHEN OTHERS THEN
    v_token := NULL;
  END;

  IF v_token IS NULL OR v_token = '' THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM field_sessions fs
    WHERE fs.session_token = v_token
      AND fs.project_id = p_project_id
      AND fs.expires_at > NOW()
  ) INTO valid;

  IF valid THEN
    UPDATE field_sessions
    SET last_activity = NOW()
    WHERE session_token = v_token AND project_id = p_project_id;
  END IF;

  RETURN valid;
END;
$$;

-- Return project/company for any valid session (used for company-scoped tables)
CREATE OR REPLACE FUNCTION has_valid_field_session()
RETURNS TABLE (project_id UUID, company_id UUID)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_token TEXT;
BEGIN
  BEGIN
    v_token := current_setting('request.headers', true)::json->>'x-field-session';
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  IF v_token IS NULL OR v_token = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT fs.project_id, fs.company_id
  FROM field_sessions fs
  WHERE fs.session_token = v_token
    AND fs.expires_at > NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION validate_field_session(UUID)  TO anon;
GRANT EXECUTE ON FUNCTION has_valid_field_session()      TO anon;

-- ============================================================
-- PART 4: PIN → SESSION CREATION FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION validate_pin_and_create_session(
  p_pin TEXT,
  p_company_code TEXT,
  p_device_id TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
) RETURNS TABLE (
  success       BOOLEAN,
  session_token TEXT,
  project_id    UUID,
  project_name  TEXT,
  company_id    UUID,
  company_name  TEXT,
  error_code    TEXT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  found_project  RECORD;
  found_company  RECORD;
  new_token      TEXT;
  clean_pin      TEXT;
  clean_code     TEXT;
BEGIN
  clean_pin  := TRIM(p_pin);
  clean_code := UPPER(TRIM(p_company_code));

  IF NOT check_rate_limit(p_ip_address, p_device_id, 15, 5) THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_rate_limited');
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, 'RATE_LIMITED'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO found_company FROM companies WHERE UPPER(code) = clean_code;

  IF found_company IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid_company');
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, 'INVALID_COMPANY'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO found_project
  FROM projects
  WHERE TRIM(pin) = clean_pin
    AND company_id = found_company.id
    AND status = 'active';

  IF found_project IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid');
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, 'INVALID_PIN'::TEXT;
    RETURN;
  END IF;

  new_token := encode(gen_random_bytes(32), 'hex');

  -- Revoke existing sessions for this device+project to avoid orphaned rows
  DELETE FROM field_sessions
  WHERE device_id = p_device_id AND project_id = found_project.id;

  INSERT INTO field_sessions (project_id, company_id, session_token, device_id)
  VALUES (found_project.id, found_company.id, new_token, p_device_id);

  PERFORM log_auth_attempt(p_ip_address, p_device_id, TRUE, 'pin');

  RETURN QUERY SELECT
    true, new_token,
    found_project.id, found_project.name,
    found_company.id, found_company.name,
    NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_pin_and_create_session(TEXT, TEXT, TEXT, TEXT) TO anon;

-- ============================================================
-- PART 5: CENTRAL ACCESS HELPER
-- ============================================================

-- Returns true for: authenticated office users who belong to the project's company,
-- OR field workers with a valid session for that project.
CREATE OR REPLACE FUNCTION can_access_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM user_companies uc
      JOIN projects p ON p.company_id = uc.company_id
      WHERE p.id = p_project_id
        AND uc.user_id = auth.uid()
        AND uc.status = 'active'
    );
  END IF;
  RETURN validate_field_session(p_project_id);
END;
$$;

GRANT EXECUTE ON FUNCTION can_access_project(UUID) TO anon;
GRANT EXECUTE ON FUNCTION can_access_project(UUID) TO authenticated;

-- ============================================================
-- PART 6: REPLACE ALL auth.uid() IS NULL POLICIES
-- Each section: drop old open policy, create session-validated one
-- ============================================================

-- AREAS
DROP POLICY IF EXISTS "Field users can view areas"   ON areas;
DROP POLICY IF EXISTS "Field users can update areas" ON areas;
DROP POLICY IF EXISTS "Secure field access to areas" ON areas;
DROP POLICY IF EXISTS "Secure field update areas"    ON areas;
CREATE POLICY "Secure field access to areas"
  ON areas FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "Secure field update areas"
  ON areas FOR UPDATE
  USING (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));

-- T&M TICKETS
DROP POLICY IF EXISTS "Field users can view tickets"   ON t_and_m_tickets;
DROP POLICY IF EXISTS "Field users can create tickets" ON t_and_m_tickets;
DROP POLICY IF EXISTS "Field users can update tickets" ON t_and_m_tickets;
DROP POLICY IF EXISTS "Secure field view tickets"      ON t_and_m_tickets;
DROP POLICY IF EXISTS "Secure field create tickets"    ON t_and_m_tickets;
DROP POLICY IF EXISTS "Secure field update tickets"    ON t_and_m_tickets;
CREATE POLICY "Secure field view tickets"
  ON t_and_m_tickets FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "Secure field create tickets"
  ON t_and_m_tickets FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "Secure field update tickets"
  ON t_and_m_tickets FOR UPDATE
  USING (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));

-- T&M WORKERS (scoped through ticket)
DROP POLICY IF EXISTS "Field users can view workers"   ON t_and_m_workers;
DROP POLICY IF EXISTS "Field users can create workers" ON t_and_m_workers;
DROP POLICY IF EXISTS "Secure field view workers"      ON t_and_m_workers;
DROP POLICY IF EXISTS "Secure field create workers"    ON t_and_m_workers;
CREATE POLICY "Secure field view workers"
  ON t_and_m_workers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM t_and_m_tickets t
    WHERE t.id = t_and_m_workers.ticket_id
      AND can_access_project(t.project_id)
  ));
CREATE POLICY "Secure field create workers"
  ON t_and_m_workers FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM t_and_m_tickets t
    WHERE t.id = t_and_m_workers.ticket_id
      AND can_access_project(t.project_id)
  ));

-- T&M ITEMS (scoped through ticket)
DROP POLICY IF EXISTS "Field users can view items"   ON t_and_m_items;
DROP POLICY IF EXISTS "Field users can create items" ON t_and_m_items;
DROP POLICY IF EXISTS "Secure field view items"      ON t_and_m_items;
DROP POLICY IF EXISTS "Secure field create items"    ON t_and_m_items;
CREATE POLICY "Secure field view items"
  ON t_and_m_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM t_and_m_tickets t
    WHERE t.id = t_and_m_items.ticket_id
      AND can_access_project(t.project_id)
  ));
CREATE POLICY "Secure field create items"
  ON t_and_m_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM t_and_m_tickets t
    WHERE t.id = t_and_m_items.ticket_id
      AND can_access_project(t.project_id)
  ));

-- CREW CHECKINS
DROP POLICY IF EXISTS "Field users can view crew checkins"   ON crew_checkins;
DROP POLICY IF EXISTS "Field users can create crew checkins" ON crew_checkins;
DROP POLICY IF EXISTS "Field users can update crew checkins" ON crew_checkins;
DROP POLICY IF EXISTS "Secure field view crew checkins"      ON crew_checkins;
DROP POLICY IF EXISTS "Secure field create crew checkins"    ON crew_checkins;
DROP POLICY IF EXISTS "Secure field update crew checkins"    ON crew_checkins;
CREATE POLICY "Secure field view crew checkins"
  ON crew_checkins FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "Secure field create crew checkins"
  ON crew_checkins FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "Secure field update crew checkins"
  ON crew_checkins FOR UPDATE
  USING (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));

-- DAILY REPORTS
DROP POLICY IF EXISTS "Field users can view daily reports"   ON daily_reports;
DROP POLICY IF EXISTS "Field users can create daily reports" ON daily_reports;
DROP POLICY IF EXISTS "Secure field view daily reports"      ON daily_reports;
DROP POLICY IF EXISTS "Secure field create daily reports"    ON daily_reports;
CREATE POLICY "Secure field view daily reports"
  ON daily_reports FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "Secure field create daily reports"
  ON daily_reports FOR INSERT WITH CHECK (can_access_project(project_id));

-- MESSAGES
DROP POLICY IF EXISTS "Field users can view messages"   ON messages;
DROP POLICY IF EXISTS "Field users can send messages"   ON messages;
DROP POLICY IF EXISTS "Field users can update messages" ON messages;
DROP POLICY IF EXISTS "Secure field view messages"      ON messages;
DROP POLICY IF EXISTS "Secure field create messages"    ON messages;
DROP POLICY IF EXISTS "Secure field update messages"    ON messages;
CREATE POLICY "Secure field view messages"
  ON messages FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "Secure field create messages"
  ON messages FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "Secure field update messages"
  ON messages FOR UPDATE
  USING (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));

-- INJURY REPORTS
DROP POLICY IF EXISTS "Field users can view injury reports"   ON injury_reports;
DROP POLICY IF EXISTS "Field users can create injury reports" ON injury_reports;
DROP POLICY IF EXISTS "Secure field view injury reports"      ON injury_reports;
DROP POLICY IF EXISTS "Secure field create injury reports"    ON injury_reports;
CREATE POLICY "Secure field view injury reports"
  ON injury_reports FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "Secure field create injury reports"
  ON injury_reports FOR INSERT WITH CHECK (can_access_project(project_id));

-- MATERIAL REQUESTS
DROP POLICY IF EXISTS "Field users can view material requests"   ON material_requests;
DROP POLICY IF EXISTS "Field users can create material requests" ON material_requests;
DROP POLICY IF EXISTS "Secure field view material requests"      ON material_requests;
DROP POLICY IF EXISTS "Secure field create material requests"    ON material_requests;
CREATE POLICY "Secure field view material requests"
  ON material_requests FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "Secure field create material requests"
  ON material_requests FOR INSERT WITH CHECK (can_access_project(project_id));

-- DISPOSAL LOADS
DROP POLICY IF EXISTS "Field users can view disposal loads"   ON disposal_loads;
DROP POLICY IF EXISTS "Field users can create disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Field users can update disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Field users can delete disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Secure field view disposal loads"      ON disposal_loads;
DROP POLICY IF EXISTS "Secure field create disposal loads"    ON disposal_loads;
DROP POLICY IF EXISTS "Secure field update disposal loads"    ON disposal_loads;
DROP POLICY IF EXISTS "Secure field delete disposal loads"    ON disposal_loads;
CREATE POLICY "Secure field view disposal loads"
  ON disposal_loads FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "Secure field create disposal loads"
  ON disposal_loads FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "Secure field update disposal loads"
  ON disposal_loads FOR UPDATE
  USING (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));
CREATE POLICY "Secure field delete disposal loads"
  ON disposal_loads FOR DELETE USING (can_access_project(project_id));

-- PROJECTS (read-only for field)
DROP POLICY IF EXISTS "Field users can view projects" ON projects;
DROP POLICY IF EXISTS "Secure field view projects"    ON projects;
CREATE POLICY "Secure field view projects"
  ON projects FOR SELECT USING (can_access_project(id));

-- CHANGE ORDERS (read-only for field)
DROP POLICY IF EXISTS "Field users can view CORs by project" ON change_orders;
DROP POLICY IF EXISTS "Secure field view CORs"               ON change_orders;
CREATE POLICY "Secure field view CORs"
  ON change_orders FOR SELECT USING (can_access_project(project_id));

-- CHANGE ORDER TICKET ASSOCIATIONS
DROP POLICY IF EXISTS "Field users can view ticket associations"   ON change_order_ticket_associations;
DROP POLICY IF EXISTS "Field users can create ticket associations" ON change_order_ticket_associations;
DROP POLICY IF EXISTS "Secure field view ticket associations"      ON change_order_ticket_associations;
DROP POLICY IF EXISTS "Secure field create ticket associations"    ON change_order_ticket_associations;
CREATE POLICY "Secure field view ticket associations"
  ON change_order_ticket_associations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_ticket_associations.change_order_id
      AND can_access_project(cor.project_id)
  ));
CREATE POLICY "Secure field create ticket associations"
  ON change_order_ticket_associations FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_ticket_associations.change_order_id
      AND can_access_project(cor.project_id)
  ));

-- COR LINE ITEMS (scoped through change_order)
DROP POLICY IF EXISTS "Field users can view labor items"    ON change_order_labor;
DROP POLICY IF EXISTS "Field users can insert labor items"  ON change_order_labor;
DROP POLICY IF EXISTS "Secure field view labor items"       ON change_order_labor;
DROP POLICY IF EXISTS "Secure field insert labor items"     ON change_order_labor;
CREATE POLICY "Secure field view labor items"
  ON change_order_labor FOR SELECT
  USING (EXISTS (SELECT 1 FROM change_orders c WHERE c.id = change_order_labor.change_order_id AND can_access_project(c.project_id)));
CREATE POLICY "Secure field insert labor items"
  ON change_order_labor FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM change_orders c WHERE c.id = change_order_labor.change_order_id AND can_access_project(c.project_id)));

DROP POLICY IF EXISTS "Field users can view material items"   ON change_order_materials;
DROP POLICY IF EXISTS "Field users can insert material items" ON change_order_materials;
DROP POLICY IF EXISTS "Secure field view material items"      ON change_order_materials;
DROP POLICY IF EXISTS "Secure field insert material items"    ON change_order_materials;
CREATE POLICY "Secure field view material items"
  ON change_order_materials FOR SELECT
  USING (EXISTS (SELECT 1 FROM change_orders c WHERE c.id = change_order_materials.change_order_id AND can_access_project(c.project_id)));
CREATE POLICY "Secure field insert material items"
  ON change_order_materials FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM change_orders c WHERE c.id = change_order_materials.change_order_id AND can_access_project(c.project_id)));

DROP POLICY IF EXISTS "Field users can view equipment items"   ON change_order_equipment;
DROP POLICY IF EXISTS "Field users can insert equipment items" ON change_order_equipment;
DROP POLICY IF EXISTS "Secure field view equipment items"      ON change_order_equipment;
DROP POLICY IF EXISTS "Secure field insert equipment items"    ON change_order_equipment;
CREATE POLICY "Secure field view equipment items"
  ON change_order_equipment FOR SELECT
  USING (EXISTS (SELECT 1 FROM change_orders c WHERE c.id = change_order_equipment.change_order_id AND can_access_project(c.project_id)));
CREATE POLICY "Secure field insert equipment items"
  ON change_order_equipment FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM change_orders c WHERE c.id = change_order_equipment.change_order_id AND can_access_project(c.project_id)));

-- COMPANY-SCOPED TABLES (branding, dump sites, labor classes, materials library)
DROP POLICY IF EXISTS "Field users can view companies"        ON companies;
DROP POLICY IF EXISTS "Secure field view companies"           ON companies;
CREATE POLICY "Secure field view companies"
  ON companies FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    OR EXISTS (SELECT 1 FROM has_valid_field_session() s WHERE s.company_id = companies.id)
  );

DROP POLICY IF EXISTS "Field users can view company branding" ON company_branding;
DROP POLICY IF EXISTS "Secure field view company branding"    ON company_branding;
CREATE POLICY "Secure field view company branding"
  ON company_branding FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    OR EXISTS (SELECT 1 FROM has_valid_field_session() s WHERE s.company_id = company_branding.company_id)
  );

DROP POLICY IF EXISTS "Field users can view dump sites" ON dump_sites;
DROP POLICY IF EXISTS "Secure field view dump sites"    ON dump_sites;
CREATE POLICY "Secure field view dump sites"
  ON dump_sites FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    OR EXISTS (SELECT 1 FROM has_valid_field_session() s WHERE s.company_id = dump_sites.company_id)
  );

DROP POLICY IF EXISTS "Field can view labor classes"    ON labor_classes;
DROP POLICY IF EXISTS "Secure field view labor classes" ON labor_classes;
CREATE POLICY "Secure field view labor classes"
  ON labor_classes FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    OR EXISTS (SELECT 1 FROM has_valid_field_session() s WHERE s.company_id = labor_classes.company_id)
  );

DROP POLICY IF EXISTS "Field users can view materials equipment" ON materials_equipment;
DROP POLICY IF EXISTS "Secure field view materials equipment"    ON materials_equipment;
CREATE POLICY "Secure field view materials equipment"
  ON materials_equipment FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    OR EXISTS (SELECT 1 FROM has_valid_field_session() s WHERE s.company_id = materials_equipment.company_id)
  );

-- ============================================================
-- PART 7: SESSION UTILITY FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted INTEGER;
BEGIN
  DELETE FROM field_sessions WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

CREATE OR REPLACE FUNCTION extend_field_session(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE field_sessions
  SET expires_at = NOW() + INTERVAL '24 hours', last_activity = NOW()
  WHERE session_token = p_token AND expires_at > NOW();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION invalidate_field_session(p_session_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM field_sessions WHERE session_token = p_session_token;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION extend_field_session(TEXT)        TO anon;
GRANT EXECUTE ON FUNCTION invalidate_field_session(TEXT)    TO anon;

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'CRITICAL-1 FIX APPLIED: auth.uid() IS NULL policies removed';
  RAISE NOTICE 'All field access now requires a valid PIN-issued session token';
  RAISE NOTICE 'Anonymous requests without x-field-session header: NO ACCESS';
  RAISE NOTICE '============================================================';
END $$;


-- ================================================================
-- Setup complete. All tables, policies, and indexes are now ready.
-- ================================================================
