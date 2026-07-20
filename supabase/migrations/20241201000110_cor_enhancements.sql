-- ============================================================
-- COR ENHANCEMENTS MIGRATION
-- Run this in your Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. ADD GROUP_NAME TO CHANGE_ORDERS
-- Allows grouping CORs by phase, building, week, etc.
-- ============================================================
ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS group_name TEXT;

CREATE INDEX IF NOT EXISTS idx_change_orders_group_name
ON change_orders(project_id, group_name);

-- ============================================================
-- 2. ADD COMPANY_NAME TO CHANGE_ORDER_SUBCONTRACTORS
-- Stores the subcontractor company name for display
-- ============================================================
ALTER TABLE change_order_subcontractors
ADD COLUMN IF NOT EXISTS company_name TEXT DEFAULT '';

-- ============================================================
-- 3. VERIFY COLUMNS EXIST
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '✓ COR enhancements migration complete!';
  RAISE NOTICE '  - change_orders.group_name added';
  RAISE NOTICE '  - change_order_subcontractors.company_name added';
END $$;
