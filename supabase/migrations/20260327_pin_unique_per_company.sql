-- Migration: Make project PINs unique per-company instead of globally unique
-- This allows different companies to reuse the same PIN for their own projects

-- Drop the old global unique index
DROP INDEX IF EXISTS idx_projects_pin;

-- Create new unique index scoped to company_id
CREATE UNIQUE INDEX idx_projects_pin_per_company ON projects(company_id, pin) WHERE pin IS NOT NULL;
