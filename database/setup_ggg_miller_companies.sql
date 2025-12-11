-- ========================================
-- Setup GGG and Miller Companies
-- ========================================
-- This creates your two companies: GGG and Miller
-- Each with projects and sample data
-- ========================================

-- ========================================
-- 1. CREATE GGG COMPANY
-- ========================================

INSERT INTO companies (id, name, code, created_at)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'GGG Construction',
  'GGG',
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code;

-- ========================================
-- 2. CREATE MILLER COMPANY
-- ========================================

INSERT INTO companies (id, name, code, created_at)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'Miller Construction',
  'MILLER',
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code;

-- ========================================
-- 3. CREATE PROJECTS FOR GGG
-- ========================================

-- GGG Project 1
INSERT INTO projects (id, name, contract_value, company_id, pin, status, created_at)
VALUES (
  '11111111-0000-0000-0000-000000000001',
  'GGG - Downtown Office Complex',
  750000.00,
  '11111111-1111-1111-1111-111111111111',
  '1111',
  'active',
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  pin = EXCLUDED.pin,
  status = EXCLUDED.status;

-- GGG Project 2
INSERT INTO projects (id, name, contract_value, company_id, pin, status, created_at)
VALUES (
  '11111111-0000-0000-0000-000000000002',
  'GGG - Residential Development',
  500000.00,
  '11111111-1111-1111-1111-111111111111',
  '2222',
  'active',
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  pin = EXCLUDED.pin,
  status = EXCLUDED.status;

-- ========================================
-- 4. CREATE PROJECTS FOR MILLER
-- ========================================

-- Miller Project 1
INSERT INTO projects (id, name, contract_value, company_id, pin, status, created_at)
VALUES (
  '22222222-0000-0000-0000-000000000001',
  'Miller - Commercial Warehouse',
  600000.00,
  '22222222-2222-2222-2222-222222222222',
  '3333',
  'active',
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  pin = EXCLUDED.pin,
  status = EXCLUDED.status;

-- Miller Project 2
INSERT INTO projects (id, name, contract_value, company_id, pin, status, created_at)
VALUES (
  '22222222-0000-0000-0000-000000000002',
  'Miller - Medical Center Addition',
  850000.00,
  '22222222-2222-2222-2222-222222222222',
  '4444',
  'active',
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  pin = EXCLUDED.pin,
  status = EXCLUDED.status;

-- ========================================
-- 5. CREATE AREAS FOR GGG PROJECT 1
-- ========================================

INSERT INTO areas (project_id, name, weight, group_name, status, sort_order, created_at)
VALUES
  ('11111111-0000-0000-0000-000000000001', 'Site Preparation', 10.00, 'Site Work', 'done', 1, NOW()),
  ('11111111-0000-0000-0000-000000000001', 'Foundation & Footings', 15.00, 'Foundation', 'done', 2, NOW()),
  ('11111111-0000-0000-0000-000000000001', 'Structural Steel', 20.00, 'Structure', 'working', 3, NOW()),
  ('11111111-0000-0000-0000-000000000001', 'Concrete Deck', 15.00, 'Structure', 'not_started', 4, NOW()),
  ('11111111-0000-0000-0000-000000000001', 'Rough MEP', 15.00, 'MEP', 'not_started', 5, NOW()),
  ('11111111-0000-0000-0000-000000000001', 'Exterior Envelope', 12.00, 'Exterior', 'not_started', 6, NOW()),
  ('11111111-0000-0000-0000-000000000001', 'Interior Finishes', 8.00, 'Finishes', 'not_started', 7, NOW()),
  ('11111111-0000-0000-0000-000000000001', 'Final MEP', 5.00, 'Finishes', 'not_started', 8, NOW())
ON CONFLICT DO NOTHING;

-- ========================================
-- 6. CREATE AREAS FOR GGG PROJECT 2
-- ========================================

INSERT INTO areas (project_id, name, weight, group_name, status, sort_order, created_at)
VALUES
  ('11111111-0000-0000-0000-000000000002', 'Land Grading', 8.00, 'Site Work', 'done', 1, NOW()),
  ('11111111-0000-0000-0000-000000000002', 'Utilities Install', 10.00, 'Site Work', 'working', 2, NOW()),
  ('11111111-0000-0000-0000-000000000002', 'Building A - Foundation', 15.00, 'Building A', 'not_started', 3, NOW()),
  ('11111111-0000-0000-0000-000000000002', 'Building A - Framing', 20.00, 'Building A', 'not_started', 4, NOW()),
  ('11111111-0000-0000-0000-000000000002', 'Building B - Foundation', 15.00, 'Building B', 'not_started', 5, NOW()),
  ('11111111-0000-0000-0000-000000000002', 'Building B - Framing', 20.00, 'Building B', 'not_started', 6, NOW()),
  ('11111111-0000-0000-0000-000000000002', 'Parking & Landscaping', 12.00, 'Site Work', 'not_started', 7, NOW())
ON CONFLICT DO NOTHING;

-- ========================================
-- 7. CREATE AREAS FOR MILLER PROJECT 1
-- ========================================

INSERT INTO areas (project_id, name, weight, group_name, status, sort_order, created_at)
VALUES
  ('22222222-0000-0000-0000-000000000001', 'Excavation', 12.00, 'Site Work', 'done', 1, NOW()),
  ('22222222-0000-0000-0000-000000000001', 'Foundation', 18.00, 'Foundation', 'working', 2, NOW()),
  ('22222222-0000-0000-0000-000000000001', 'Slab on Grade', 15.00, 'Foundation', 'not_started', 3, NOW()),
  ('22222222-0000-0000-0000-000000000001', 'Steel Erection', 20.00, 'Structure', 'not_started', 4, NOW()),
  ('22222222-0000-0000-0000-000000000001', 'Roof Deck', 10.00, 'Structure', 'not_started', 5, NOW()),
  ('22222222-0000-0000-0000-000000000001', 'Electrical Service', 10.00, 'MEP', 'not_started', 6, NOW()),
  ('22222222-0000-0000-0000-000000000001', 'HVAC Units', 8.00, 'MEP', 'not_started', 7, NOW()),
  ('22222222-0000-0000-0000-000000000001', 'Overhead Doors', 7.00, 'Finishes', 'not_started', 8, NOW())
ON CONFLICT DO NOTHING;

-- ========================================
-- 8. CREATE AREAS FOR MILLER PROJECT 2
-- ========================================

INSERT INTO areas (project_id, name, weight, group_name, status, sort_order, created_at)
VALUES
  ('22222222-0000-0000-0000-000000000002', 'Demolition', 8.00, 'Demo', 'done', 1, NOW()),
  ('22222222-0000-0000-0000-000000000002', 'New Foundation', 15.00, 'Foundation', 'done', 2, NOW()),
  ('22222222-0000-0000-0000-000000000002', 'Structural Framing', 18.00, 'Structure', 'working', 3, NOW()),
  ('22222222-0000-0000-0000-000000000002', 'Mechanical Rough-In', 12.00, 'MEP', 'not_started', 4, NOW()),
  ('22222222-0000-0000-0000-000000000002', 'Electrical Rough-In', 12.00, 'MEP', 'not_started', 5, NOW()),
  ('22222222-0000-0000-0000-000000000002', 'Plumbing Rough-In', 10.00, 'MEP', 'not_started', 6, NOW()),
  ('22222222-0000-0000-0000-000000000002', 'Drywall & Paint', 10.00, 'Finishes', 'not_started', 7, NOW()),
  ('22222222-0000-0000-0000-000000000002', 'Medical Equipment', 8.00, 'Equipment', 'not_started', 8, NOW()),
  ('22222222-0000-0000-0000-000000000002', 'Final Inspections', 7.00, 'Closeout', 'not_started', 9, NOW())
ON CONFLICT DO NOTHING;

-- ========================================
-- VERIFICATION
-- ========================================

-- Show all companies
SELECT
  '=== COMPANIES ===' as section,
  name as "Company Name",
  code as "Company Code (for foreman entry)",
  id
FROM companies
WHERE code IN ('GGG', 'MILLER')
ORDER BY name;

-- Show all projects
SELECT
  '=== PROJECTS ===' as section,
  c.name as "Company",
  p.name as "Project Name",
  p.pin as "PIN",
  p.status,
  (SELECT COUNT(*) FROM areas WHERE project_id = p.id) as "# Areas"
FROM projects p
JOIN companies c ON p.company_id = c.id
WHERE c.code IN ('GGG', 'MILLER')
ORDER BY c.name, p.name;

-- ========================================
-- SETUP COMPLETE!
-- ========================================
--
-- GGG COMPANY ACCESS:
-- -------------------
-- Company Code: GGG
-- Projects:
--   1. "GGG - Downtown Office Complex" - PIN: 1111
--   2. "GGG - Residential Development"  - PIN: 2222
--
-- MILLER COMPANY ACCESS:
-- ----------------------
-- Company Code: MILLER
-- Projects:
--   1. "Miller - Commercial Warehouse"   - PIN: 3333
--   2. "Miller - Medical Center Addition" - PIN: 4444
--
-- ========================================
