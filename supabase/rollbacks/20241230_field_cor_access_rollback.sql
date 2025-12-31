-- ============================================================
-- ROLLBACK: Field User COR Access Policies
-- Original Migration: 20241230_field_cor_access.sql
-- ============================================================
--
-- WARNING: Running this will remove field user access to the app
-- Only run if the policies are causing security issues
--
-- ============================================================

-- Remove anon policies from change_orders
DROP POLICY IF EXISTS "Field users can view CORs by project" ON change_orders;

-- Remove anon policies from ticket associations
DROP POLICY IF EXISTS "Field users can view ticket associations" ON change_order_ticket_associations;
DROP POLICY IF EXISTS "Field users can create ticket associations" ON change_order_ticket_associations;

-- Remove anon policies from COR line items
DROP POLICY IF EXISTS "Field users can view labor items" ON change_order_labor;
DROP POLICY IF EXISTS "Field users can insert labor items" ON change_order_labor;
DROP POLICY IF EXISTS "Field users can view material items" ON change_order_materials;
DROP POLICY IF EXISTS "Field users can insert material items" ON change_order_materials;
DROP POLICY IF EXISTS "Field users can view equipment items" ON change_order_equipment;
DROP POLICY IF EXISTS "Field users can insert equipment items" ON change_order_equipment;

-- Remove anon policies from supporting tables
DROP POLICY IF EXISTS "Field users can view labor rates" ON labor_rates;
DROP POLICY IF EXISTS "Field users can view materials equipment" ON materials_equipment;
DROP POLICY IF EXISTS "Field users can view company branding" ON company_branding;

-- Remove anon policies from crew/operations
DROP POLICY IF EXISTS "Field users can view crew checkins" ON crew_checkins;
DROP POLICY IF EXISTS "Field users can create crew checkins" ON crew_checkins;
DROP POLICY IF EXISTS "Field users can update crew checkins" ON crew_checkins;

DROP POLICY IF EXISTS "Field users can view disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Field users can create disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Field users can update disposal loads" ON disposal_loads;
DROP POLICY IF EXISTS "Field users can delete disposal loads" ON disposal_loads;

DROP POLICY IF EXISTS "Field users can view dump sites" ON dump_sites;

-- Remove anon policies from core tables
DROP POLICY IF EXISTS "Field users can view projects" ON projects;
DROP POLICY IF EXISTS "Field users can view companies" ON companies;
DROP POLICY IF EXISTS "Field users can view areas" ON areas;
DROP POLICY IF EXISTS "Field users can update areas" ON areas;

-- Remove anon policies from communications
DROP POLICY IF EXISTS "Field users can view messages" ON messages;
DROP POLICY IF EXISTS "Field users can send messages" ON messages;
DROP POLICY IF EXISTS "Field users can update messages" ON messages;

DROP POLICY IF EXISTS "Field users can view daily reports" ON daily_reports;
DROP POLICY IF EXISTS "Field users can create daily reports" ON daily_reports;

DROP POLICY IF EXISTS "Field users can view injury reports" ON injury_reports;
DROP POLICY IF EXISTS "Field users can create injury reports" ON injury_reports;

DROP POLICY IF EXISTS "Field users can view material requests" ON material_requests;
DROP POLICY IF EXISTS "Field users can create material requests" ON material_requests;

-- Remove anon policies from T&M
DROP POLICY IF EXISTS "Field users can view tickets" ON t_and_m_tickets;
DROP POLICY IF EXISTS "Field users can create tickets" ON t_and_m_tickets;
DROP POLICY IF EXISTS "Field users can update tickets" ON t_and_m_tickets;

DROP POLICY IF EXISTS "Field users can view workers" ON t_and_m_workers;
DROP POLICY IF EXISTS "Field users can create workers" ON t_and_m_workers;

DROP POLICY IF EXISTS "Field users can view items" ON t_and_m_items;
DROP POLICY IF EXISTS "Field users can create items" ON t_and_m_items;

-- Revoke grants (optional - policies being gone is enough)
-- REVOKE SELECT ON change_orders FROM anon;
-- etc.

-- Verify rollback
DO $$
DECLARE
  remaining_policies INT;
BEGIN
  SELECT COUNT(*) INTO remaining_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname ILIKE '%field%';

  IF remaining_policies = 0 THEN
    RAISE NOTICE '✅ Rollback completed - all field policies removed';
  ELSE
    RAISE NOTICE '⚠️ Rollback completed - % field policies remain', remaining_policies;
  END IF;
END $$;
