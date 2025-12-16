-- ============================================
-- LOGIN SEPARATION: Office PIN + Field Code
-- Adds two-layer security for office and field access
-- ============================================

-- This migration is SAFE and BACKWARD COMPATIBLE
-- Just adds new columns, doesn't modify existing data

-- ============================================
-- 1. ADD LOGIN CODES TO COMPANIES
-- ============================================

-- Add field_code (for foremen access)
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS field_code TEXT UNIQUE;

-- Add office_pin (gates office signup)
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS office_pin TEXT UNIQUE;

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_companies_field_code ON companies(field_code);
CREATE INDEX IF NOT EXISTS idx_companies_office_pin ON companies(office_pin);

COMMENT ON COLUMN companies.field_code IS 'Code for field workers to access projects (e.g., "GGG2024")';
COMMENT ON COLUMN companies.office_pin IS 'PIN required to create office accounts (e.g., "8765")';


-- ============================================
-- 2. SET CODES FOR EXISTING COMPANIES
-- You can customize these codes per company
-- ============================================

-- Example for GGG Construction
UPDATE companies
SET
  field_code = 'GGG2024',
  office_pin = '8765'
WHERE name ILIKE '%GGG%'
  AND field_code IS NULL;

-- Example for MILLER
UPDATE companies
SET
  field_code = 'MILLER2024',
  office_pin = '5432'
WHERE name ILIKE '%MILLER%'
  AND field_code IS NULL;

-- For any other companies without codes, generate defaults
UPDATE companies
SET
  field_code = UPPER(SUBSTRING(name FROM 1 FOR 3)) || '2024',
  office_pin = LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0')
WHERE field_code IS NULL;


-- ============================================
-- 3. FIELD ACCESS AUDIT TRAIL
-- Track who accesses projects from field
-- ============================================

CREATE TABLE IF NOT EXISTS field_access_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  foreman_name TEXT NOT NULL,
  company_code_used TEXT NOT NULL,
  project_pin_used TEXT,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_field_access_project ON field_access_log(project_id);
CREATE INDEX IF NOT EXISTS idx_field_access_date ON field_access_log(accessed_at);
CREATE INDEX IF NOT EXISTS idx_field_access_foreman ON field_access_log(foreman_name);

COMMENT ON TABLE field_access_log IS 'Audit trail of field worker access to projects';


-- ============================================
-- 4. FIELD ACTIVITY AUDIT TRAIL
-- Track what field workers do (reports, tickets, etc.)
-- ============================================

CREATE TABLE IF NOT EXISTS field_activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  foreman_name TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'daily_report',
    'ticket',
    'photo_upload',
    'task_update',
    'note',
    'other'
  )),
  activity_id UUID,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_field_activity_project ON field_activity_log(project_id);
CREATE INDEX IF NOT EXISTS idx_field_activity_type ON field_activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_field_activity_date ON field_activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_field_activity_foreman ON field_activity_log(foreman_name);

COMMENT ON TABLE field_activity_log IS 'Audit trail of field worker activities and submissions';


-- ============================================
-- 5. HELPER FUNCTION: Verify Company Office PIN
-- ============================================

CREATE OR REPLACE FUNCTION verify_company_office_pin(
  p_company_name TEXT,
  p_office_pin TEXT
)
RETURNS TABLE(
  company_id UUID,
  company_name TEXT,
  field_code TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.field_code
  FROM companies c
  WHERE LOWER(c.name) = LOWER(p_company_name)
    AND c.office_pin = p_office_pin;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION verify_company_office_pin IS 'Validates company name and office PIN combination';


-- ============================================
-- 6. HELPER FUNCTION: Verify Field Access
-- ============================================

CREATE OR REPLACE FUNCTION verify_field_access(
  p_field_code TEXT,
  p_project_pin TEXT
)
RETURNS TABLE(
  project_id UUID,
  project_name TEXT,
  company_id UUID,
  company_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    c.id,
    c.name
  FROM projects p
  JOIN companies c ON c.id = p.company_id
  WHERE c.field_code = p_field_code
    AND p.pin = p_project_pin;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION verify_field_access IS 'Validates field code and project PIN combination';


-- ============================================
-- 7. VIEW: Current Field Codes Summary
-- ============================================

CREATE OR REPLACE VIEW v_company_access_codes AS
SELECT
  c.id,
  c.name as company_name,
  c.field_code,
  c.office_pin,
  COUNT(DISTINCT p.id) as project_count,
  COUNT(DISTINCT u.id) as office_user_count
FROM companies c
LEFT JOIN projects p ON p.company_id = c.id
LEFT JOIN users u ON u.company_id = c.id AND u.role IN ('office', 'admin')
GROUP BY c.id, c.name, c.field_code, c.office_pin
ORDER BY c.name;

COMMENT ON VIEW v_company_access_codes IS 'Summary of company access codes and usage';


-- ============================================
-- SUCCESS VERIFICATION
-- ============================================

DO $$
DECLARE
  v_companies_with_codes INT;
  v_total_companies INT;
BEGIN
  SELECT COUNT(*) INTO v_total_companies FROM companies;
  SELECT COUNT(*) INTO v_companies_with_codes
  FROM companies
  WHERE field_code IS NOT NULL AND office_pin IS NOT NULL;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'LOGIN SEPARATION SCHEMA CREATED';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total companies: %', v_total_companies;
  RAISE NOTICE 'Companies with access codes: %', v_companies_with_codes;
  RAISE NOTICE '';
  RAISE NOTICE 'New tables created:';
  RAISE NOTICE '  - field_access_log (audit trail)';
  RAISE NOTICE '  - field_activity_log (activity tracking)';
  RAISE NOTICE '';
  RAISE NOTICE 'New functions created:';
  RAISE NOTICE '  - verify_company_office_pin()';
  RAISE NOTICE '  - verify_field_access()';
  RAISE NOTICE '';
  RAISE NOTICE 'View current codes:';
  RAISE NOTICE '  SELECT * FROM v_company_access_codes;';
  RAISE NOTICE '========================================';
END $$;


-- ============================================
-- QUICK REFERENCE QUERIES
-- ============================================

-- View all company access codes
-- SELECT * FROM v_company_access_codes;

-- Test office PIN verification
-- SELECT * FROM verify_company_office_pin('GGG Construction', '8765');

-- Test field access verification
-- SELECT * FROM verify_field_access('GGG2024', '1234');

-- View recent field access
-- SELECT * FROM field_access_log ORDER BY accessed_at DESC LIMIT 10;

-- View recent field activities
-- SELECT * FROM field_activity_log ORDER BY created_at DESC LIMIT 10;
