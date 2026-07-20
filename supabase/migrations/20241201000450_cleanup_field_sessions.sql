-- ============================================================
-- CLEANUP: Drop existing policies before re-running migration
-- Run this FIRST, then run migration_field_sessions.sql
-- ============================================================

-- Field Sessions table
DROP POLICY IF EXISTS "No direct session access" ON field_sessions;

-- Areas
DROP POLICY IF EXISTS "Secure field access to areas" ON areas;
DROP POLICY IF EXISTS "Secure field update areas" ON areas;

-- T&M Tickets
DROP POLICY IF EXISTS "Secure field view tickets" ON t_and_m_tickets;
DROP POLICY IF EXISTS "Secure field create tickets" ON t_and_m_tickets;
DROP POLICY IF EXISTS "Secure field update tickets" ON t_and_m_tickets;

-- T&M Workers
DROP POLICY IF EXISTS "Secure field view workers" ON t_and_m_workers;
DROP POLICY IF EXISTS "Secure field create workers" ON t_and_m_workers;

-- T&M Items
DROP POLICY IF EXISTS "Secure field view items" ON t_and_m_items;
DROP POLICY IF EXISTS "Secure field create items" ON t_and_m_items;

-- Crew Checkins
DROP POLICY IF EXISTS "Secure field view crew checkins" ON crew_checkins;
DROP POLICY IF EXISTS "Secure field create crew checkins" ON crew_checkins;
DROP POLICY IF EXISTS "Secure field update crew checkins" ON crew_checkins;

-- Daily Reports
DROP POLICY IF EXISTS "Secure field view daily reports" ON daily_reports;
DROP POLICY IF EXISTS "Secure field create daily reports" ON daily_reports;

-- Messages
DROP POLICY IF EXISTS "Secure field view messages" ON messages;
DROP POLICY IF EXISTS "Secure field create messages" ON messages;
DROP POLICY IF EXISTS "Secure field update messages" ON messages;

-- Disposal Loads
DROP POLICY IF EXISTS "Secure field view disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Secure field create disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Secure field update disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Secure field delete disposal loads" ON disposal_loads;

-- Injury Reports
DROP POLICY IF EXISTS "Secure field view injury reports" ON injury_reports;
DROP POLICY IF EXISTS "Secure field create injury reports" ON injury_reports;

-- Material Requests
DROP POLICY IF EXISTS "Secure field view material requests" ON material_requests;
DROP POLICY IF EXISTS "Secure field create material requests" ON material_requests;

-- Projects
DROP POLICY IF EXISTS "Secure field view projects" ON projects;

-- Companies
DROP POLICY IF EXISTS "Secure field view companies" ON companies;

-- Change Orders
DROP POLICY IF EXISTS "Secure field view CORs" ON change_orders;

-- Change Order Associations
DROP POLICY IF EXISTS "Secure field view ticket associations" ON change_order_ticket_associations;
DROP POLICY IF EXISTS "Secure field create ticket associations" ON change_order_ticket_associations;

-- Change Order Labor
DROP POLICY IF EXISTS "Secure field view labor items" ON change_order_labor;
DROP POLICY IF EXISTS "Secure field insert labor items" ON change_order_labor;

-- Change Order Materials
DROP POLICY IF EXISTS "Secure field view material items" ON change_order_materials;
DROP POLICY IF EXISTS "Secure field insert material items" ON change_order_materials;

-- Change Order Equipment
DROP POLICY IF EXISTS "Secure field view equipment items" ON change_order_equipment;
DROP POLICY IF EXISTS "Secure field insert equipment items" ON change_order_equipment;

-- Dump Sites
DROP POLICY IF EXISTS "Secure field view dump sites" ON dump_sites;

-- Labor Classes
DROP POLICY IF EXISTS "Secure field view labor classes" ON labor_classes;

-- Company Branding
DROP POLICY IF EXISTS "Secure field view company branding" ON company_branding;

-- Materials Equipment
DROP POLICY IF EXISTS "Secure field view materials equipment" ON materials_equipment;

-- Drop functions to recreate them
DROP FUNCTION IF EXISTS validate_field_session(UUID);
DROP FUNCTION IF EXISTS has_valid_field_session();
DROP FUNCTION IF EXISTS validate_pin_and_create_session(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS can_access_project(UUID);
DROP FUNCTION IF EXISTS cleanup_expired_sessions();
DROP FUNCTION IF EXISTS extend_field_session(TEXT);
DROP FUNCTION IF EXISTS invalidate_field_session(TEXT);
