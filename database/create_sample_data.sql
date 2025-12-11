-- ========================================
-- Create Sample Users and Projects
-- ========================================
-- Run this AFTER complete_setup.sql
-- This creates sample users and projects for testing
-- ========================================

-- NOTE: You must first create auth users in Supabase Authentication UI:
-- 1. Go to Authentication > Users in Supabase Dashboard
-- 2. Click "Add User" and create:
--    - Email: miller@example.com, Password: (your choice)
--    - Email: ggg@example.com, Password: (your choice)
-- 3. Copy the UUID of each user
-- 4. Replace the UUIDs below with the actual user IDs

-- ========================================
-- 1. CREATE USER PROFILES
-- ========================================
-- Replace these UUIDs with actual user IDs from Supabase Auth

-- Miller - Office user
INSERT INTO users (id, email, name, full_name, role, company_id)
VALUES
  (
    '10000000-0000-0000-0000-000000000001', -- REPLACE WITH ACTUAL MILLER USER ID
    'miller@example.com',
    'Miller',
    'Miller Johnson',
    'office',
    '00000000-0000-0000-0000-000000000001' -- Demo company
  )
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  company_id = EXCLUDED.company_id;

-- GGG - Foreman user
INSERT INTO users (id, email, name, full_name, role, company_id)
VALUES
  (
    '20000000-0000-0000-0000-000000000001', -- REPLACE WITH ACTUAL GGG USER ID
    'ggg@example.com',
    'GGG',
    'GGG Construction',
    'foreman',
    '00000000-0000-0000-0000-000000000001' -- Demo company
  )
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  company_id = EXCLUDED.company_id;

-- ========================================
-- 2. CREATE SAMPLE PROJECTS WITH PINS
-- ========================================

-- Sample Project 1
INSERT INTO projects (id, name, contract_value, company_id, pin, status)
VALUES
  (
    '30000000-0000-0000-0000-000000000001',
    'Downtown Office Building',
    500000.00,
    '00000000-0000-0000-0000-000000000001',
    '1234', -- PIN for foreman access
    'active'
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  contract_value = EXCLUDED.contract_value,
  pin = EXCLUDED.pin,
  status = EXCLUDED.status;

-- Sample Project 2
INSERT INTO projects (id, name, contract_value, company_id, pin, status)
VALUES
  (
    '30000000-0000-0000-0000-000000000002',
    'Residential Complex Phase 1',
    750000.00,
    '00000000-0000-0000-0000-000000000001',
    '5678', -- PIN for foreman access
    'active'
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  contract_value = EXCLUDED.contract_value,
  pin = EXCLUDED.pin,
  status = EXCLUDED.status;

-- ========================================
-- 3. CREATE SAMPLE AREAS
-- ========================================

-- Areas for Project 1
INSERT INTO areas (project_id, name, weight, group_name, status, sort_order)
VALUES
  ('30000000-0000-0000-0000-000000000001', 'Foundation', 15.00, 'Site Work', 'done', 1),
  ('30000000-0000-0000-0000-000000000001', 'Rough Framing', 20.00, 'Framing', 'working', 2),
  ('30000000-0000-0000-0000-000000000001', 'Electrical Rough-In', 10.00, 'MEP', 'not_started', 3),
  ('30000000-0000-0000-0000-000000000001', 'Plumbing Rough-In', 10.00, 'MEP', 'not_started', 4),
  ('30000000-0000-0000-0000-000000000001', 'Drywall', 15.00, 'Finishes', 'not_started', 5),
  ('30000000-0000-0000-0000-000000000001', 'Flooring', 12.00, 'Finishes', 'not_started', 6),
  ('30000000-0000-0000-0000-000000000001', 'Paint', 8.00, 'Finishes', 'not_started', 7),
  ('30000000-0000-0000-0000-000000000001', 'Fixtures', 10.00, 'Final', 'not_started', 8)
ON CONFLICT DO NOTHING;

-- Areas for Project 2
INSERT INTO areas (project_id, name, weight, group_name, status, sort_order)
VALUES
  ('30000000-0000-0000-0000-000000000002', 'Site Preparation', 10.00, 'Site Work', 'done', 1),
  ('30000000-0000-0000-0000-000000000002', 'Building A Foundation', 15.00, 'Building A', 'done', 2),
  ('30000000-0000-0000-0000-000000000002', 'Building A Framing', 20.00, 'Building A', 'working', 3),
  ('30000000-0000-0000-0000-000000000002', 'Building B Foundation', 15.00, 'Building B', 'not_started', 4),
  ('30000000-0000-0000-0000-000000000002', 'Building B Framing', 20.00, 'Building B', 'not_started', 5),
  ('30000000-0000-0000-0000-000000000002', 'Parking Lot', 20.00, 'Site Work', 'not_started', 6)
ON CONFLICT DO NOTHING;

-- ========================================
-- 4. ASSIGN FOREMAN TO PROJECTS
-- ========================================

-- Assign GGG to both projects
INSERT INTO project_assignments (project_id, user_id, assigned_by)
VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- ========================================
-- SAMPLE DATA COMPLETE!
-- ========================================
--
-- Test foreman access:
-- 1. Company Code: DEMO
-- 2. Project PIN: 1234 (Downtown Office Building)
-- 3. Project PIN: 5678 (Residential Complex Phase 1)
--
-- Test authenticated access:
-- - Miller: miller@example.com (office user)
-- - GGG: ggg@example.com (foreman user)
--
-- ========================================
