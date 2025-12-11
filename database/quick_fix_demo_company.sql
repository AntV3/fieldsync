-- ========================================
-- QUICK FIX: Create Demo Company & Project
-- ========================================
-- Run this if you haven't run complete_setup.sql yet
-- This creates a demo company and project so you can test immediately
-- ========================================

-- 1. Create demo company (if it doesn't exist)
INSERT INTO companies (id, name, code, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Demo Construction Co',
  'DEMO',
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code;

-- Verify company was created
SELECT
  id,
  name,
  code as "Use this company code: DEMO",
  created_at
FROM companies
WHERE code = 'DEMO';

-- 2. Create a test project with PIN (if projects table exists)
INSERT INTO projects (id, name, contract_value, company_id, pin, status, created_at)
VALUES (
  '30000000-0000-0000-0000-000000000001',
  'Test Project',
  100000.00,
  '00000000-0000-0000-0000-000000000001',
  '1234',
  'active',
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  pin = EXCLUDED.pin,
  status = EXCLUDED.status;

-- Verify project was created
SELECT
  p.id,
  p.name as "Project Name",
  p.pin as "Use this PIN: 1234",
  c.code as "Company Code: DEMO",
  p.status
FROM projects p
JOIN companies c ON p.company_id = c.id
WHERE p.pin = '1234';

-- 3. Create some test areas (if areas table exists)
INSERT INTO areas (project_id, name, weight, status, sort_order, created_at)
VALUES
  ('30000000-0000-0000-0000-000000000001', 'Foundation', 20.00, 'done', 1, NOW()),
  ('30000000-0000-0000-0000-000000000001', 'Framing', 30.00, 'working', 2, NOW()),
  ('30000000-0000-0000-0000-000000000001', 'Electrical', 25.00, 'not_started', 3, NOW()),
  ('30000000-0000-0000-0000-000000000001', 'Plumbing', 25.00, 'not_started', 4, NOW())
ON CONFLICT DO NOTHING;

-- Verify areas were created
SELECT
  COUNT(*) as "Number of areas created"
FROM areas
WHERE project_id = '30000000-0000-0000-0000-000000000001';

-- ========================================
-- READY TO TEST!
-- ========================================
--
-- Now try foreman access:
-- 1. Company Code: DEMO
-- 2. PIN: 1234
--
-- If you still get errors, the tables might not exist yet.
-- In that case, you MUST run complete_setup.sql first!
-- ========================================
