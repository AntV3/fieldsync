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
