-- Add budget tracking fields to projects table
-- Run this migration in your Supabase SQL Editor

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS labor_budget DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS materials_budget DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS equipment_budget DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS other_budget DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_budget DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS company_labor_rate DECIMAL(8, 2) DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN projects.labor_budget IS 'Budgeted amount for labor costs';
COMMENT ON COLUMN projects.materials_budget IS 'Budgeted amount for materials';
COMMENT ON COLUMN projects.equipment_budget IS 'Budgeted amount for equipment';
COMMENT ON COLUMN projects.other_budget IS 'Budgeted amount for other costs';
COMMENT ON COLUMN projects.total_budget IS 'Total project budget (sum of all categories)';
COMMENT ON COLUMN projects.company_labor_rate IS 'Company labor rate per hour for calculating actual labor costs';
