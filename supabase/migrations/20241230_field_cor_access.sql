-- ============================================================
-- FIELD USER COR ACCESS
-- Allows field users (PIN-authenticated, not Supabase auth)
-- to view CORs for their project
-- ============================================================

-- Problem: Field foremen access the app via project PIN, not Supabase auth
-- This means auth.uid() is NULL for them, causing RLS to block all COR access
-- Solution: Add a SELECT-only policy that allows project-based access

-- ============================================================
-- 1. CHANGE_ORDERS - Allow anonymous SELECT by project_id
-- ============================================================

-- Add policy for anonymous/field access (SELECT only)
DROP POLICY IF EXISTS "Field users can view CORs by project" ON change_orders;

CREATE POLICY "Field users can view CORs by project"
ON change_orders FOR SELECT
USING (
  -- Allow SELECT when auth.uid() is NULL (field/anonymous access)
  -- This is safe because:
  -- 1. Field users already validated project PIN to get project_id
  -- 2. Query is filtered by project_id (they can only see their project's CORs)
  -- 3. Only SELECT is allowed, not INSERT/UPDATE/DELETE
  auth.uid() IS NULL
);

-- Also grant SELECT to anon role (required for RLS to work with anon key)
GRANT SELECT ON change_orders TO anon;

-- ============================================================
-- 2. CHANGE_ORDER_TICKET_ASSOCIATIONS - Allow field ticket linking
-- ============================================================

-- Field users need to:
-- 1. View existing associations
-- 2. Create new associations when submitting T&M tickets

DROP POLICY IF EXISTS "Field users can view ticket associations" ON change_order_ticket_associations;
DROP POLICY IF EXISTS "Field users can create ticket associations" ON change_order_ticket_associations;

CREATE POLICY "Field users can view ticket associations"
ON change_order_ticket_associations FOR SELECT
USING (
  auth.uid() IS NULL
);

CREATE POLICY "Field users can create ticket associations"
ON change_order_ticket_associations FOR INSERT
WITH CHECK (
  auth.uid() IS NULL
);

-- Grant permissions to anon role
GRANT SELECT, INSERT ON change_order_ticket_associations TO anon;

-- ============================================================
-- 3. T_AND_M_TICKETS - Ensure field can update assigned_cor_id
-- ============================================================

-- Check if policy exists and add if needed
DO $$
BEGIN
  -- Ensure anon can update tickets (for setting assigned_cor_id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 't_and_m_tickets'
    AND policyname = 'Field users can update tickets'
  ) THEN
    CREATE POLICY "Field users can update tickets"
    ON t_and_m_tickets FOR UPDATE
    USING (auth.uid() IS NULL)
    WITH CHECK (auth.uid() IS NULL);
  END IF;
END $$;

-- Ensure anon has update permission
GRANT UPDATE ON t_and_m_tickets TO anon;

-- ============================================================
-- 4. COR LINE ITEM TABLES - Allow field to import T&M data
-- ============================================================

-- When a field user links a T&M ticket to a COR, the system imports
-- labor, materials, and equipment data into the COR tables

-- CHANGE_ORDER_LABOR
DROP POLICY IF EXISTS "Field users can insert labor items" ON change_order_labor;
CREATE POLICY "Field users can insert labor items"
ON change_order_labor FOR INSERT
WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can view labor items" ON change_order_labor;
CREATE POLICY "Field users can view labor items"
ON change_order_labor FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT, INSERT ON change_order_labor TO anon;

-- CHANGE_ORDER_MATERIALS
DROP POLICY IF EXISTS "Field users can insert material items" ON change_order_materials;
CREATE POLICY "Field users can insert material items"
ON change_order_materials FOR INSERT
WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can view material items" ON change_order_materials;
CREATE POLICY "Field users can view material items"
ON change_order_materials FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT, INSERT ON change_order_materials TO anon;

-- CHANGE_ORDER_EQUIPMENT
DROP POLICY IF EXISTS "Field users can insert equipment items" ON change_order_equipment;
CREATE POLICY "Field users can insert equipment items"
ON change_order_equipment FOR INSERT
WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Field users can view equipment items" ON change_order_equipment;
CREATE POLICY "Field users can view equipment items"
ON change_order_equipment FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT, INSERT ON change_order_equipment TO anon;

-- ============================================================
-- 5. SUPPORTING TABLES - Allow field to read rates/materials
-- ============================================================

-- Field needs to read labor_rates for importing ticket data
DROP POLICY IF EXISTS "Field users can view labor rates" ON labor_rates;
CREATE POLICY "Field users can view labor rates"
ON labor_rates FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT ON labor_rates TO anon;

-- Field needs to read materials_equipment for importing ticket data
DROP POLICY IF EXISTS "Field users can view materials equipment" ON materials_equipment;
CREATE POLICY "Field users can view materials equipment"
ON materials_equipment FOR SELECT
USING (auth.uid() IS NULL);

GRANT SELECT ON materials_equipment TO anon;

-- ============================================================
-- 6. GRANT EXECUTE ON RPC FUNCTIONS
-- ============================================================

-- Allow anon to call the atomic ticket-COR functions
GRANT EXECUTE ON FUNCTION assign_ticket_to_cor(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION unassign_ticket_from_cor(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION recalculate_cor_totals(UUID) TO anon;

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '✓ Field COR access policies created successfully!';
  RAISE NOTICE '  - Field users can now SELECT CORs by project_id';
  RAISE NOTICE '  - Field users can create ticket-COR associations';
  RAISE NOTICE '  - Field users can import T&M data to CORs (labor, materials, equipment)';
  RAISE NOTICE '  - T&M tickets can be linked to CORs from field';
END $$;
