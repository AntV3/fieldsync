-- ============================================
-- Change Order Request (COR) System Migration
-- ============================================
-- This migration creates all tables, functions, triggers, and RLS policies
-- for the comprehensive COR system in FieldSync.
--
-- Run this in your Supabase SQL Editor.
-- ============================================

-- ============================================
-- 1. MAIN CHANGE ORDERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS change_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  area_id UUID REFERENCES areas(id) ON DELETE SET NULL,

  -- Basic Info
  cor_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  scope_of_work TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Status workflow: draft -> pending_approval -> approved -> billed -> closed
  -- Also: rejected (can go back to draft)
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'billed', 'closed')),

  -- Cost breakdown fields (stored in cents to avoid decimal issues)
  labor_subtotal INTEGER NOT NULL DEFAULT 0,
  materials_subtotal INTEGER NOT NULL DEFAULT 0,
  equipment_subtotal INTEGER NOT NULL DEFAULT 0,
  subcontractors_subtotal INTEGER NOT NULL DEFAULT 0,

  -- Markup percentages (stored as basis points: 1500 = 15.00%)
  labor_markup_percent INTEGER NOT NULL DEFAULT 1500,
  materials_markup_percent INTEGER NOT NULL DEFAULT 1500,
  equipment_markup_percent INTEGER NOT NULL DEFAULT 1500,
  subcontractors_markup_percent INTEGER NOT NULL DEFAULT 500,

  -- Calculated markup amounts (in cents)
  labor_markup_amount INTEGER NOT NULL DEFAULT 0,
  materials_markup_amount INTEGER NOT NULL DEFAULT 0,
  equipment_markup_amount INTEGER NOT NULL DEFAULT 0,
  subcontractors_markup_amount INTEGER NOT NULL DEFAULT 0,

  -- Additional fee percentages (stored as basis points: 144 = 1.44%)
  liability_insurance_percent INTEGER NOT NULL DEFAULT 144,
  bond_percent INTEGER NOT NULL DEFAULT 100,
  license_fee_percent INTEGER NOT NULL DEFAULT 10, -- 0.101% = ~10 basis points

  -- Calculated fee amounts (in cents)
  liability_insurance_amount INTEGER NOT NULL DEFAULT 0,
  bond_amount INTEGER NOT NULL DEFAULT 0,
  license_fee_amount INTEGER NOT NULL DEFAULT 0,

  -- Totals (in cents)
  cor_subtotal INTEGER NOT NULL DEFAULT 0, -- Sum of all subtotals + markups
  additional_fees_total INTEGER NOT NULL DEFAULT 0,
  cor_total INTEGER NOT NULL DEFAULT 0,

  -- GC Signature fields
  gc_signature_data TEXT, -- Base64 encoded signature image
  gc_signature_name TEXT,
  gc_signature_date TIMESTAMPTZ,

  -- Rejection info
  rejection_reason TEXT,

  -- Audit fields
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,

  -- Ensure unique COR numbers per project
  CONSTRAINT unique_cor_number_per_project UNIQUE (company_id, project_id, cor_number)
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_change_orders_project ON change_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_company ON change_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_status ON change_orders(status);
CREATE INDEX IF NOT EXISTS idx_change_orders_area ON change_orders(area_id);

-- ============================================
-- 2. LABOR LINE ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS change_order_labor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,

  -- Labor details
  labor_class TEXT NOT NULL, -- e.g., "Foreman", "Operator", "Laborer"
  wage_type TEXT NOT NULL DEFAULT 'standard', -- standard, pla, etc.

  -- Hours
  regular_hours DECIMAL(10,2) NOT NULL DEFAULT 0,
  overtime_hours DECIMAL(10,2) NOT NULL DEFAULT 0,

  -- Rates (in cents)
  regular_rate INTEGER NOT NULL DEFAULT 0,
  overtime_rate INTEGER NOT NULL DEFAULT 0,

  -- Totals (in cents)
  regular_total INTEGER NOT NULL DEFAULT 0,
  overtime_total INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,

  -- Display order
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Source tracking
  source_ticket_id UUID REFERENCES t_and_m_tickets(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cor_labor_change_order ON change_order_labor(change_order_id);

-- ============================================
-- 3. MATERIALS LINE ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS change_order_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,

  -- Material details
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'each',
  unit_cost INTEGER NOT NULL DEFAULT 0, -- in cents
  total INTEGER NOT NULL DEFAULT 0, -- in cents

  -- Source tracking
  source_type TEXT NOT NULL DEFAULT 'custom' CHECK (source_type IN ('backup_sheet', 'invoice', 'mobilization', 'custom')),
  source_reference TEXT, -- e.g., invoice number, ticket reference
  source_ticket_id UUID REFERENCES t_and_m_tickets(id) ON DELETE SET NULL,

  -- Display order
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cor_materials_change_order ON change_order_materials(change_order_id);

-- ============================================
-- 4. EQUIPMENT LINE ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS change_order_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,

  -- Equipment details
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'day',
  unit_cost INTEGER NOT NULL DEFAULT 0, -- in cents
  total INTEGER NOT NULL DEFAULT 0, -- in cents

  -- Source tracking
  source_type TEXT NOT NULL DEFAULT 'custom' CHECK (source_type IN ('backup_sheet', 'invoice', 'custom')),
  source_reference TEXT,
  source_ticket_id UUID REFERENCES t_and_m_tickets(id) ON DELETE SET NULL,

  -- Display order
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cor_equipment_change_order ON change_order_equipment(change_order_id);

-- ============================================
-- 5. SUBCONTRACTORS LINE ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS change_order_subcontractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,

  -- Subcontractor details
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'lump sum',
  unit_cost INTEGER NOT NULL DEFAULT 0, -- in cents
  total INTEGER NOT NULL DEFAULT 0, -- in cents

  -- Source tracking
  source_type TEXT NOT NULL DEFAULT 'custom' CHECK (source_type IN ('invoice', 'quote', 'custom')),
  source_reference TEXT, -- e.g., invoice number, quote reference

  -- Display order
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cor_subcontractors_change_order ON change_order_subcontractors(change_order_id);

-- ============================================
-- 6. TICKET-COR ASSOCIATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS change_order_ticket_associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES t_and_m_tickets(id) ON DELETE CASCADE,

  -- Import tracking
  data_imported BOOLEAN NOT NULL DEFAULT FALSE,
  imported_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each ticket can only be associated once per COR
  CONSTRAINT unique_ticket_per_cor UNIQUE (change_order_id, ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_cor_tickets_change_order ON change_order_ticket_associations(change_order_id);
CREATE INDEX IF NOT EXISTS idx_cor_tickets_ticket ON change_order_ticket_associations(ticket_id);

-- ============================================
-- 7. ADD COR REFERENCE TO T&M TICKETS
-- ============================================
-- Add column to track which COR a ticket is assigned to
ALTER TABLE t_and_m_tickets
ADD COLUMN IF NOT EXISTS assigned_cor_id UUID REFERENCES change_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tm_tickets_assigned_cor ON t_and_m_tickets(assigned_cor_id);

-- ============================================
-- 8. RECALCULATE COR TOTALS FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION recalculate_cor_totals(cor_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_labor_subtotal INTEGER := 0;
  v_materials_subtotal INTEGER := 0;
  v_equipment_subtotal INTEGER := 0;
  v_subcontractors_subtotal INTEGER := 0;
  v_labor_markup_percent INTEGER;
  v_materials_markup_percent INTEGER;
  v_equipment_markup_percent INTEGER;
  v_subcontractors_markup_percent INTEGER;
  v_labor_markup_amount INTEGER;
  v_materials_markup_amount INTEGER;
  v_equipment_markup_amount INTEGER;
  v_subcontractors_markup_amount INTEGER;
  v_liability_insurance_percent INTEGER;
  v_bond_percent INTEGER;
  v_license_fee_percent INTEGER;
  v_cor_subtotal INTEGER;
  v_liability_insurance_amount INTEGER;
  v_bond_amount INTEGER;
  v_license_fee_amount INTEGER;
  v_additional_fees_total INTEGER;
  v_cor_total INTEGER;
BEGIN
  -- Get markup and fee percentages from the COR
  SELECT
    labor_markup_percent,
    materials_markup_percent,
    equipment_markup_percent,
    subcontractors_markup_percent,
    liability_insurance_percent,
    bond_percent,
    license_fee_percent
  INTO
    v_labor_markup_percent,
    v_materials_markup_percent,
    v_equipment_markup_percent,
    v_subcontractors_markup_percent,
    v_liability_insurance_percent,
    v_bond_percent,
    v_license_fee_percent
  FROM change_orders
  WHERE id = cor_id;

  -- Calculate labor subtotal
  SELECT COALESCE(SUM(total), 0)
  INTO v_labor_subtotal
  FROM change_order_labor
  WHERE change_order_id = cor_id;

  -- Calculate materials subtotal
  SELECT COALESCE(SUM(total), 0)
  INTO v_materials_subtotal
  FROM change_order_materials
  WHERE change_order_id = cor_id;

  -- Calculate equipment subtotal
  SELECT COALESCE(SUM(total), 0)
  INTO v_equipment_subtotal
  FROM change_order_equipment
  WHERE change_order_id = cor_id;

  -- Calculate subcontractors subtotal
  SELECT COALESCE(SUM(total), 0)
  INTO v_subcontractors_subtotal
  FROM change_order_subcontractors
  WHERE change_order_id = cor_id;

  -- Calculate markup amounts (basis points / 10000)
  v_labor_markup_amount := ROUND((v_labor_subtotal * v_labor_markup_percent)::NUMERIC / 10000);
  v_materials_markup_amount := ROUND((v_materials_subtotal * v_materials_markup_percent)::NUMERIC / 10000);
  v_equipment_markup_amount := ROUND((v_equipment_subtotal * v_equipment_markup_percent)::NUMERIC / 10000);
  v_subcontractors_markup_amount := ROUND((v_subcontractors_subtotal * v_subcontractors_markup_percent)::NUMERIC / 10000);

  -- Calculate COR subtotal (all costs + all markups)
  v_cor_subtotal := v_labor_subtotal + v_materials_subtotal + v_equipment_subtotal + v_subcontractors_subtotal
                  + v_labor_markup_amount + v_materials_markup_amount + v_equipment_markup_amount + v_subcontractors_markup_amount;

  -- Calculate additional fees
  v_liability_insurance_amount := ROUND((v_cor_subtotal * v_liability_insurance_percent)::NUMERIC / 10000);
  v_bond_amount := ROUND((v_cor_subtotal * v_bond_percent)::NUMERIC / 10000);
  v_license_fee_amount := ROUND((v_cor_subtotal * v_license_fee_percent)::NUMERIC / 10000);

  v_additional_fees_total := v_liability_insurance_amount + v_bond_amount + v_license_fee_amount;

  -- Calculate final COR total
  v_cor_total := v_cor_subtotal + v_additional_fees_total;

  -- Update the change_orders table
  UPDATE change_orders
  SET
    labor_subtotal = v_labor_subtotal,
    materials_subtotal = v_materials_subtotal,
    equipment_subtotal = v_equipment_subtotal,
    subcontractors_subtotal = v_subcontractors_subtotal,
    labor_markup_amount = v_labor_markup_amount,
    materials_markup_amount = v_materials_markup_amount,
    equipment_markup_amount = v_equipment_markup_amount,
    subcontractors_markup_amount = v_subcontractors_markup_amount,
    liability_insurance_amount = v_liability_insurance_amount,
    bond_amount = v_bond_amount,
    license_fee_amount = v_license_fee_amount,
    cor_subtotal = v_cor_subtotal,
    additional_fees_total = v_additional_fees_total,
    cor_total = v_cor_total,
    updated_at = NOW()
  WHERE id = cor_id;
END;
$$;

-- ============================================
-- 9. TRIGGERS FOR AUTO-RECALCULATION
-- ============================================

-- Trigger function for labor items
CREATE OR REPLACE FUNCTION trigger_recalculate_cor_from_labor()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_cor_totals(OLD.change_order_id);
    RETURN OLD;
  ELSE
    PERFORM recalculate_cor_totals(NEW.change_order_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_cor_labor ON change_order_labor;
CREATE TRIGGER trg_recalculate_cor_labor
AFTER INSERT OR UPDATE OR DELETE ON change_order_labor
FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_cor_from_labor();

-- Trigger function for materials items
CREATE OR REPLACE FUNCTION trigger_recalculate_cor_from_materials()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_cor_totals(OLD.change_order_id);
    RETURN OLD;
  ELSE
    PERFORM recalculate_cor_totals(NEW.change_order_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_cor_materials ON change_order_materials;
CREATE TRIGGER trg_recalculate_cor_materials
AFTER INSERT OR UPDATE OR DELETE ON change_order_materials
FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_cor_from_materials();

-- Trigger function for equipment items
CREATE OR REPLACE FUNCTION trigger_recalculate_cor_from_equipment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_cor_totals(OLD.change_order_id);
    RETURN OLD;
  ELSE
    PERFORM recalculate_cor_totals(NEW.change_order_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_cor_equipment ON change_order_equipment;
CREATE TRIGGER trg_recalculate_cor_equipment
AFTER INSERT OR UPDATE OR DELETE ON change_order_equipment
FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_cor_from_equipment();

-- Trigger function for subcontractors items
CREATE OR REPLACE FUNCTION trigger_recalculate_cor_from_subcontractors()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_cor_totals(OLD.change_order_id);
    RETURN OLD;
  ELSE
    PERFORM recalculate_cor_totals(NEW.change_order_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_cor_subcontractors ON change_order_subcontractors;
CREATE TRIGGER trg_recalculate_cor_subcontractors
AFTER INSERT OR UPDATE OR DELETE ON change_order_subcontractors
FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_cor_from_subcontractors();

-- Trigger to recalculate when markup or fee percentages change
CREATE OR REPLACE FUNCTION trigger_recalculate_cor_on_percentage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only recalculate if percentage fields changed
  IF OLD.labor_markup_percent != NEW.labor_markup_percent OR
     OLD.materials_markup_percent != NEW.materials_markup_percent OR
     OLD.equipment_markup_percent != NEW.equipment_markup_percent OR
     OLD.subcontractors_markup_percent != NEW.subcontractors_markup_percent OR
     OLD.liability_insurance_percent != NEW.liability_insurance_percent OR
     OLD.bond_percent != NEW.bond_percent OR
     OLD.license_fee_percent != NEW.license_fee_percent THEN
    PERFORM recalculate_cor_totals(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_cor_percentages ON change_orders;
CREATE TRIGGER trg_recalculate_cor_percentages
AFTER UPDATE ON change_orders
FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_cor_on_percentage_change();

-- ============================================
-- 10. UPDATED_AT TRIGGER FOR CHANGE_ORDERS
-- ============================================
CREATE OR REPLACE FUNCTION update_change_orders_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_change_orders_updated_at ON change_orders;
CREATE TRIGGER trg_change_orders_updated_at
BEFORE UPDATE ON change_orders
FOR EACH ROW EXECUTE FUNCTION update_change_orders_updated_at();

-- ============================================
-- 11. ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all COR tables
ALTER TABLE change_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_order_labor ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_order_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_order_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_order_subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_order_ticket_associations ENABLE ROW LEVEL SECURITY;

-- Helper function to check user's company
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT company_id FROM user_companies WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Helper function to check user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM user_companies WHERE user_id = auth.uid() LIMIT 1;
$$;

-- CHANGE_ORDERS POLICIES

-- Drop existing policies first
DROP POLICY IF EXISTS "Users can view their company CORs" ON change_orders;
DROP POLICY IF EXISTS "Office and Admin can create CORs" ON change_orders;
DROP POLICY IF EXISTS "Office and Admin can update draft/pending CORs" ON change_orders;
DROP POLICY IF EXISTS "Only Admin can delete draft CORs" ON change_orders;

-- Users can view CORs from their company
CREATE POLICY "Users can view their company CORs"
ON change_orders FOR SELECT
USING (company_id = get_user_company_id());

-- Office and Admin can create CORs
CREATE POLICY "Office and Admin can create CORs"
ON change_orders FOR INSERT
WITH CHECK (
  company_id = get_user_company_id() AND
  get_user_role() IN ('office', 'admin')
);

-- Office and Admin can update draft/pending CORs
CREATE POLICY "Office and Admin can update draft/pending CORs"
ON change_orders FOR UPDATE
USING (
  company_id = get_user_company_id() AND
  get_user_role() IN ('office', 'admin') AND
  status IN ('draft', 'pending_approval', 'rejected')
)
WITH CHECK (
  company_id = get_user_company_id() AND
  get_user_role() IN ('office', 'admin')
);

-- Only Admin can delete CORs (and only drafts)
CREATE POLICY "Only Admin can delete draft CORs"
ON change_orders FOR DELETE
USING (
  company_id = get_user_company_id() AND
  get_user_role() = 'admin' AND
  status = 'draft'
);

-- CHANGE_ORDER_LABOR POLICIES
DROP POLICY IF EXISTS "Users can view labor items for their company CORs" ON change_order_labor;
DROP POLICY IF EXISTS "Office and Admin can manage labor items" ON change_order_labor;

CREATE POLICY "Users can view labor items for their company CORs"
ON change_order_labor FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    WHERE co.id = change_order_id AND co.company_id = get_user_company_id()
  )
);

CREATE POLICY "Office and Admin can manage labor items"
ON change_order_labor FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    WHERE co.id = change_order_id
    AND co.company_id = get_user_company_id()
    AND get_user_role() IN ('office', 'admin')
    AND co.status IN ('draft', 'pending_approval', 'rejected')
  )
);

-- CHANGE_ORDER_MATERIALS POLICIES
DROP POLICY IF EXISTS "Users can view material items for their company CORs" ON change_order_materials;
DROP POLICY IF EXISTS "Office and Admin can manage material items" ON change_order_materials;

CREATE POLICY "Users can view material items for their company CORs"
ON change_order_materials FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    WHERE co.id = change_order_id AND co.company_id = get_user_company_id()
  )
);

CREATE POLICY "Office and Admin can manage material items"
ON change_order_materials FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    WHERE co.id = change_order_id
    AND co.company_id = get_user_company_id()
    AND get_user_role() IN ('office', 'admin')
    AND co.status IN ('draft', 'pending_approval', 'rejected')
  )
);

-- CHANGE_ORDER_EQUIPMENT POLICIES
DROP POLICY IF EXISTS "Users can view equipment items for their company CORs" ON change_order_equipment;
DROP POLICY IF EXISTS "Office and Admin can manage equipment items" ON change_order_equipment;

CREATE POLICY "Users can view equipment items for their company CORs"
ON change_order_equipment FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    WHERE co.id = change_order_id AND co.company_id = get_user_company_id()
  )
);

CREATE POLICY "Office and Admin can manage equipment items"
ON change_order_equipment FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    WHERE co.id = change_order_id
    AND co.company_id = get_user_company_id()
    AND get_user_role() IN ('office', 'admin')
    AND co.status IN ('draft', 'pending_approval', 'rejected')
  )
);

-- CHANGE_ORDER_SUBCONTRACTORS POLICIES
DROP POLICY IF EXISTS "Users can view subcontractor items for their company CORs" ON change_order_subcontractors;
DROP POLICY IF EXISTS "Office and Admin can manage subcontractor items" ON change_order_subcontractors;

CREATE POLICY "Users can view subcontractor items for their company CORs"
ON change_order_subcontractors FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    WHERE co.id = change_order_id AND co.company_id = get_user_company_id()
  )
);

CREATE POLICY "Office and Admin can manage subcontractor items"
ON change_order_subcontractors FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    WHERE co.id = change_order_id
    AND co.company_id = get_user_company_id()
    AND get_user_role() IN ('office', 'admin')
    AND co.status IN ('draft', 'pending_approval', 'rejected')
  )
);

-- CHANGE_ORDER_TICKET_ASSOCIATIONS POLICIES
DROP POLICY IF EXISTS "Users can view ticket associations for their company CORs" ON change_order_ticket_associations;
DROP POLICY IF EXISTS "Office and Admin can manage ticket associations" ON change_order_ticket_associations;

CREATE POLICY "Users can view ticket associations for their company CORs"
ON change_order_ticket_associations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    WHERE co.id = change_order_id AND co.company_id = get_user_company_id()
  )
);

CREATE POLICY "Office and Admin can manage ticket associations"
ON change_order_ticket_associations FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    WHERE co.id = change_order_id
    AND co.company_id = get_user_company_id()
    AND get_user_role() IN ('office', 'admin')
  )
);

-- ============================================
-- 12. GRANT PERMISSIONS FOR REALTIME
-- ============================================
-- Grant access for authenticated users (RLS handles the rest)
GRANT SELECT, INSERT, UPDATE, DELETE ON change_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON change_order_labor TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON change_order_materials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON change_order_equipment TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON change_order_subcontractors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON change_order_ticket_associations TO authenticated;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION recalculate_cor_totals(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;

-- ============================================
-- 13. COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON TABLE change_orders IS 'Main table for Change Order Requests (CORs). Tracks all cost breakdowns, markups, and approval workflow.';
COMMENT ON TABLE change_order_labor IS 'Labor line items for CORs. Each row represents a labor class with hours and rates.';
COMMENT ON TABLE change_order_materials IS 'Material line items for CORs. Includes containment, PPE, disposal items.';
COMMENT ON TABLE change_order_equipment IS 'Equipment line items for CORs. Rental equipment, tools, etc.';
COMMENT ON TABLE change_order_subcontractors IS 'Subcontractor line items for CORs. External vendor charges.';
COMMENT ON TABLE change_order_ticket_associations IS 'Links T&M tickets to CORs for data import and tracking.';

COMMENT ON FUNCTION recalculate_cor_totals IS 'Recalculates all subtotals, markups, fees, and totals for a COR. Called automatically by triggers.';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- After running this migration:
-- 1. Verify all tables are created: SELECT * FROM information_schema.tables WHERE table_name LIKE 'change_order%';
-- 2. Test the recalculate function: SELECT recalculate_cor_totals('some-cor-id');
-- 3. Test RLS policies by logging in as different user roles
-- ============================================
