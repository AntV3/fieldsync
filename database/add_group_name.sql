-- FieldSync Database Migration: Add Group Name to Areas
-- Run this in your Supabase SQL Editor

-- Add group_name column to areas table for grouping tasks by level/section
ALTER TABLE areas ADD COLUMN IF NOT EXISTS group_name TEXT;

-- Create index for faster group queries
CREATE INDEX IF NOT EXISTS idx_areas_group_name ON areas(project_id, group_name);
