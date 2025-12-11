-- ========================================
-- VERIFY DATABASE SETUP
-- ========================================
-- Run this to check if your database is set up correctly
-- ========================================

-- Check if companies table exists and has data
SELECT
  'Companies Table' as check_name,
  COUNT(*) as count,
  CASE
    WHEN COUNT(*) > 0 THEN '✅ HAS DATA'
    ELSE '❌ EMPTY - Run complete_setup.sql'
  END as status
FROM companies;

-- Show all companies
SELECT
  id,
  name,
  code as "Company Code (use this for foreman entry)",
  created_at
FROM companies
ORDER BY created_at DESC;

-- Check if projects table exists and has data
SELECT
  'Projects Table' as check_name,
  COUNT(*) as count,
  CASE
    WHEN COUNT(*) > 0 THEN '✅ HAS DATA'
    ELSE '❌ EMPTY - Run create_sample_data.sql'
  END as status
FROM projects;

-- Show all projects with PINs
SELECT
  p.id,
  p.name as "Project Name",
  p.pin as "PIN (use this for foreman entry)",
  c.name as "Company",
  c.code as "Company Code",
  p.status,
  p.created_at
FROM projects p
LEFT JOIN companies c ON p.company_id = c.id
ORDER BY p.created_at DESC;

-- Check if areas exist
SELECT
  'Areas Table' as check_name,
  COUNT(*) as count,
  CASE
    WHEN COUNT(*) > 0 THEN '✅ HAS DATA'
    ELSE '❌ EMPTY - Run create_sample_data.sql'
  END as status
FROM areas;

-- Check users table
SELECT
  'Users Table' as check_name,
  COUNT(*) as count,
  CASE
    WHEN COUNT(*) > 0 THEN '✅ HAS DATA'
    ELSE '❌ EMPTY - Create auth users first, then run create_sample_data.sql'
  END as status
FROM users;

-- Show all users
SELECT
  id,
  email,
  name,
  role,
  created_at
FROM users
ORDER BY created_at DESC;
