-- ============================================================
-- FIELDSYNC COMPLETE FIXES MIGRATION
-- Run this in your Supabase SQL Editor
-- This script is idempotent - safe to run multiple times
-- ============================================================

-- ============================================================
-- PART 1: ADD MISSING COLUMNS
-- ============================================================

-- 1.1 Add group_name to change_orders (for COR grouping feature)
ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS group_name TEXT;

CREATE INDEX IF NOT EXISTS idx_change_orders_group_name
ON change_orders(project_id, group_name);

-- 1.2 Add company_name to change_order_subcontractors
ALTER TABLE change_order_subcontractors
ADD COLUMN IF NOT EXISTS company_name TEXT DEFAULT '';

-- ============================================================
-- PART 2: FIELD USER RLS POLICIES (anon role)
-- Field users authenticate via project PIN, not Supabase Auth
-- So auth.uid() is NULL - these policies allow anonymous access
-- ============================================================

-- 2.1 CREW_CHECKINS - Field crew check-in management
DROP POLICY IF EXISTS "Field users can view crew checkins" ON crew_checkins;
CREATE POLICY "Field users can view crew checkins"
ON crew_checkins FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create crew checkins" ON crew_checkins;
CREATE POLICY "Field users can create crew checkins"
ON crew_checkins FOR INSERT
WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can update crew checkins" ON crew_checkins;
CREATE POLICY "Field users can update crew checkins"
ON crew_checkins FOR UPDATE
USING (auth.uid() IS NULL)
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT, UPDATE ON crew_checkins TO anon;

-- 2.2 CHANGE_ORDERS - Field can view CORs
DROP POLICY IF EXISTS "Field users can view CORs by project" ON change_orders;
CREATE POLICY "Field users can view CORs by project"
ON change_orders FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT ON change_orders TO anon;

-- 2.3 CHANGE_ORDER_TICKET_ASSOCIATIONS - Field can link tickets to CORs
DROP POLICY IF EXISTS "Field users can view ticket associations" ON change_order_ticket_associations;
CREATE POLICY "Field users can view ticket associations"
ON change_order_ticket_associations FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create ticket associations" ON change_order_ticket_associations;
CREATE POLICY "Field users can create ticket associations"
ON change_order_ticket_associations FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT ON change_order_ticket_associations TO anon;

-- 2.4 T&M TICKETS - Full field access
DROP POLICY IF EXISTS "Field users can view tickets" ON t_and_m_tickets;
CREATE POLICY "Field users can view tickets"
ON t_and_m_tickets FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create tickets" ON t_and_m_tickets;
CREATE POLICY "Field users can create tickets"
ON t_and_m_tickets FOR INSERT
WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can update tickets" ON t_and_m_tickets;
CREATE POLICY "Field users can update tickets"
ON t_and_m_tickets FOR UPDATE
USING (auth.uid() IS NULL)
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT, UPDATE ON t_and_m_tickets TO anon;

-- 2.5 T&M WORKERS
DROP POLICY IF EXISTS "Field users can view workers" ON t_and_m_workers;
CREATE POLICY "Field users can view workers"
ON t_and_m_workers FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create workers" ON t_and_m_workers;
CREATE POLICY "Field users can create workers"
ON t_and_m_workers FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT ON t_and_m_workers TO anon;

-- 2.6 T&M ITEMS
DROP POLICY IF EXISTS "Field users can view items" ON t_and_m_items;
CREATE POLICY "Field users can view items"
ON t_and_m_items FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create items" ON t_and_m_items;
CREATE POLICY "Field users can create items"
ON t_and_m_items FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT ON t_and_m_items TO anon;

-- 2.7 COR LINE ITEM TABLES
-- Labor
DROP POLICY IF EXISTS "Field users can view labor items" ON change_order_labor;
CREATE POLICY "Field users can view labor items"
ON change_order_labor FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can insert labor items" ON change_order_labor;
CREATE POLICY "Field users can insert labor items"
ON change_order_labor FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT ON change_order_labor TO anon;

-- Materials
DROP POLICY IF EXISTS "Field users can view material items" ON change_order_materials;
CREATE POLICY "Field users can view material items"
ON change_order_materials FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can insert material items" ON change_order_materials;
CREATE POLICY "Field users can insert material items"
ON change_order_materials FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT ON change_order_materials TO anon;

-- Equipment
DROP POLICY IF EXISTS "Field users can view equipment items" ON change_order_equipment;
CREATE POLICY "Field users can view equipment items"
ON change_order_equipment FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can insert equipment items" ON change_order_equipment;
CREATE POLICY "Field users can insert equipment items"
ON change_order_equipment FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT ON change_order_equipment TO anon;

-- 2.8 SUPPORTING TABLES
-- Projects
DROP POLICY IF EXISTS "Field users can view projects" ON projects;
CREATE POLICY "Field users can view projects"
ON projects FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT ON projects TO anon;

-- Companies
DROP POLICY IF EXISTS "Field users can view companies" ON companies;
CREATE POLICY "Field users can view companies"
ON companies FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT ON companies TO anon;

-- Areas
DROP POLICY IF EXISTS "Field users can view areas" ON areas;
CREATE POLICY "Field users can view areas"
ON areas FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can update areas" ON areas;
CREATE POLICY "Field users can update areas"
ON areas FOR UPDATE
USING (auth.uid() IS NULL)
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, UPDATE ON areas TO anon;

-- Company Branding
DROP POLICY IF EXISTS "Field users can view company branding" ON company_branding;
CREATE POLICY "Field users can view company branding"
ON company_branding FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT ON company_branding TO anon;

-- Labor Rates
DROP POLICY IF EXISTS "Field users can view labor rates" ON labor_rates;
CREATE POLICY "Field users can view labor rates"
ON labor_rates FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT ON labor_rates TO anon;

-- Materials/Equipment Library
DROP POLICY IF EXISTS "Field users can view materials equipment" ON materials_equipment;
CREATE POLICY "Field users can view materials equipment"
ON materials_equipment FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT ON materials_equipment TO anon;

-- 2.9 MESSAGES
DROP POLICY IF EXISTS "Field users can view messages" ON messages;
CREATE POLICY "Field users can view messages"
ON messages FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can send messages" ON messages;
CREATE POLICY "Field users can send messages"
ON messages FOR INSERT
WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can update messages" ON messages;
CREATE POLICY "Field users can update messages"
ON messages FOR UPDATE
USING (auth.uid() IS NULL)
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT, UPDATE ON messages TO anon;

-- 2.10 DAILY REPORTS
DROP POLICY IF EXISTS "Field users can view daily reports" ON daily_reports;
CREATE POLICY "Field users can view daily reports"
ON daily_reports FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create daily reports" ON daily_reports;
CREATE POLICY "Field users can create daily reports"
ON daily_reports FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT ON daily_reports TO anon;

-- 2.11 INJURY REPORTS
DROP POLICY IF EXISTS "Field users can view injury reports" ON injury_reports;
CREATE POLICY "Field users can view injury reports"
ON injury_reports FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create injury reports" ON injury_reports;
CREATE POLICY "Field users can create injury reports"
ON injury_reports FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT ON injury_reports TO anon;

-- 2.12 MATERIAL REQUESTS
DROP POLICY IF EXISTS "Field users can view material requests" ON material_requests;
CREATE POLICY "Field users can view material requests"
ON material_requests FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create material requests" ON material_requests;
CREATE POLICY "Field users can create material requests"
ON material_requests FOR INSERT
WITH CHECK (auth.uid() IS NULL);

GRANT SELECT, INSERT ON material_requests TO anon;

-- 2.13 DISPOSAL LOADS
DROP POLICY IF EXISTS "Field users can view disposal loads" ON disposal_loads;
CREATE POLICY "Field users can view disposal loads"
ON disposal_loads FOR SELECT
USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can create disposal loads" ON disposal_loads;
CREATE POLICY "Field users can create disposal loads"
ON disposal_loads FOR INSERT
WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can update disposal loads" ON disposal_loads;
CREATE POLICY "Field users can update disposal loads"
ON disposal_loads FOR UPDATE
USING (auth.uid() IS NULL)
WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can delete disposal loads" ON disposal_loads;
CREATE POLICY "Field users can delete disposal loads"
ON disposal_loads FOR DELETE
USING (auth.uid() IS NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON disposal_loads TO anon;

-- 2.14 DUMP SITES
DROP POLICY IF EXISTS "Field users can view dump sites" ON dump_sites;
CREATE POLICY "Field users can view dump sites"
ON dump_sites FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT ON dump_sites TO anon;

-- ============================================================
-- PART 3: GRANT EXECUTE ON RPC FUNCTIONS
-- ============================================================

-- Allow anon to call atomic ticket-COR functions
GRANT EXECUTE ON FUNCTION assign_ticket_to_cor(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION unassign_ticket_from_cor(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION recalculate_cor_totals(UUID) TO anon;

-- ============================================================
-- VERIFICATION
-- ============================================================

DO $$
DECLARE
  col_exists BOOLEAN;
BEGIN
  -- Check group_name column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_orders' AND column_name = 'group_name'
  ) INTO col_exists;

  IF col_exists THEN
    RAISE NOTICE '✓ change_orders.group_name column exists';
  ELSE
    RAISE WARNING '✗ change_orders.group_name column NOT found';
  END IF;

  -- Check company_name column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'change_order_subcontractors' AND column_name = 'company_name'
  ) INTO col_exists;

  IF col_exists THEN
    RAISE NOTICE '✓ change_order_subcontractors.company_name column exists';
  ELSE
    RAISE WARNING '✗ change_order_subcontractors.company_name column NOT found';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'MIGRATION COMPLETE!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Added columns:';
  RAISE NOTICE '  - change_orders.group_name';
  RAISE NOTICE '  - change_order_subcontractors.company_name';
  RAISE NOTICE '';
  RAISE NOTICE 'Field access policies applied for:';
  RAISE NOTICE '  - crew_checkins (SELECT, INSERT, UPDATE)';
  RAISE NOTICE '  - t_and_m_tickets, workers, items';
  RAISE NOTICE '  - change_orders, COR line items';
  RAISE NOTICE '  - projects, companies, areas';
  RAISE NOTICE '  - messages, daily_reports, injury_reports';
  RAISE NOTICE '  - disposal_loads, dump_sites';
  RAISE NOTICE '  - materials_equipment, labor_rates';
  RAISE NOTICE '========================================';
END $$;
