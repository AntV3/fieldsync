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
