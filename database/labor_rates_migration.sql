-- Labor Rates Migration
-- Adds hourly rates for different worker types to projects
-- Run this in your Supabase SQL Editor

-- ================================================
-- ADD LABOR RATES TO PROJECTS
-- ================================================

-- Add labor rate columns to projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS laborer_rate DECIMAL(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS operator_rate DECIMAL(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS foreman_rate DECIMAL(10,2) DEFAULT 0.00;

-- Add comments for documentation
COMMENT ON COLUMN projects.laborer_rate IS 'Hourly rate for laborers (for cost calculation)';
COMMENT ON COLUMN projects.operator_rate IS 'Hourly rate for operators (for cost calculation)';
COMMENT ON COLUMN projects.foreman_rate IS 'Hourly rate for foreman (for cost calculation)';

-- ================================================
-- ADD SIGNATURE FIELDS TO T&M TICKETS
-- ================================================

-- Add client signature fields
ALTER TABLE t_and_m_tickets
ADD COLUMN IF NOT EXISTS client_signature_data TEXT,
ADD COLUMN IF NOT EXISTS client_signer_name TEXT,
ADD COLUMN IF NOT EXISTS client_signature_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- Add comments for documentation
COMMENT ON COLUMN t_and_m_tickets.client_signature_data IS 'Base64 encoded signature image data';
COMMENT ON COLUMN t_and_m_tickets.client_signer_name IS 'Name of person who signed the ticket';
COMMENT ON COLUMN t_and_m_tickets.client_signature_date IS 'Date and time when ticket was signed';
COMMENT ON COLUMN t_and_m_tickets.approval_status IS 'Approval status: pending, approved, or rejected';

-- ================================================
-- CREATE VIEW FOR T&M LABOR COSTS
-- ================================================

-- Create a view that calculates labor costs for T&M tickets
CREATE OR REPLACE VIEW tm_ticket_labor_costs AS
SELECT
  tm.id as ticket_id,
  tm.project_id,
  tm.work_date,
  tm.ticket_number,
  tm.approval_status,
  p.laborer_rate,
  p.operator_rate,
  p.foreman_rate,
  -- Calculate total hours by role from workers
  COALESCE(SUM(CASE WHEN w.role = 'laborer' THEN w.total_hours ELSE 0 END), 0) as laborer_hours,
  COALESCE(SUM(CASE WHEN w.role = 'operator' THEN w.total_hours ELSE 0 END), 0) as operator_hours,
  COALESCE(SUM(CASE WHEN w.role = 'foreman' THEN w.total_hours ELSE 0 END), 0) as foreman_hours,
  -- Calculate costs
  COALESCE(SUM(CASE WHEN w.role = 'laborer' THEN w.total_hours * p.laborer_rate ELSE 0 END), 0) as laborer_cost,
  COALESCE(SUM(CASE WHEN w.role = 'operator' THEN w.total_hours * p.operator_rate ELSE 0 END), 0) as operator_cost,
  COALESCE(SUM(CASE WHEN w.role = 'foreman' THEN w.total_hours * p.foreman_rate ELSE 0 END), 0) as foreman_cost,
  -- Total labor cost
  COALESCE(SUM(w.total_hours *
    CASE
      WHEN w.role = 'laborer' THEN p.laborer_rate
      WHEN w.role = 'operator' THEN p.operator_rate
      WHEN w.role = 'foreman' THEN p.foreman_rate
      ELSE 0
    END
  ), 0) as total_labor_cost
FROM t_and_m_tickets tm
JOIN projects p ON tm.project_id = p.id
LEFT JOIN t_and_m_workers w ON tm.id = w.ticket_id
GROUP BY tm.id, tm.project_id, tm.work_date, tm.ticket_number, tm.approval_status,
         p.laborer_rate, p.operator_rate, p.foreman_rate;

COMMENT ON VIEW tm_ticket_labor_costs IS 'Calculates labor costs for T&M tickets based on project rates';

-- ================================================
-- VERIFICATION
-- ================================================

-- Show projects with labor rates
SELECT id, name, laborer_rate, operator_rate, foreman_rate
FROM projects
LIMIT 10;

-- Show T&M tickets with calculated costs
SELECT * FROM tm_ticket_labor_costs
LIMIT 10;
