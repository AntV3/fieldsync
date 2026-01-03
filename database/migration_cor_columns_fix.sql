-- Migration: Add missing columns to COR line item tables
-- Purpose: Fix 400 errors when inserting materials/equipment
-- Date: January 3, 2025
-- Risk: LOW (additive only)

-- ============================================
-- CHANGE_ORDER_MATERIALS - Add missing columns
-- ============================================

ALTER TABLE change_order_materials
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'custom'
  CHECK (source_type IN ('backup_sheet', 'invoice', 'mobilization', 'custom'));

ALTER TABLE change_order_materials
ADD COLUMN IF NOT EXISTS source_reference TEXT;

ALTER TABLE change_order_materials
ADD COLUMN IF NOT EXISTS source_ticket_id UUID REFERENCES t_and_m_tickets(id) ON DELETE SET NULL;

ALTER TABLE change_order_materials
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- ============================================
-- CHANGE_ORDER_EQUIPMENT - Add missing columns
-- ============================================

ALTER TABLE change_order_equipment
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'custom'
  CHECK (source_type IN ('backup_sheet', 'invoice', 'custom'));

ALTER TABLE change_order_equipment
ADD COLUMN IF NOT EXISTS source_reference TEXT;

ALTER TABLE change_order_equipment
ADD COLUMN IF NOT EXISTS source_ticket_id UUID REFERENCES t_and_m_tickets(id) ON DELETE SET NULL;

ALTER TABLE change_order_equipment
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- ============================================
-- CHANGE_ORDER_LABOR - Ensure columns exist
-- ============================================

ALTER TABLE change_order_labor
ADD COLUMN IF NOT EXISTS source_ticket_id UUID REFERENCES t_and_m_tickets(id) ON DELETE SET NULL;

ALTER TABLE change_order_labor
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- ============================================
-- CHANGE_ORDER_SUBCONTRACTORS - Ensure columns exist
-- ============================================

ALTER TABLE change_order_subcontractors
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'custom'
  CHECK (source_type IN ('invoice', 'quote', 'custom'));

ALTER TABLE change_order_subcontractors
ADD COLUMN IF NOT EXISTS source_reference TEXT;

ALTER TABLE change_order_subcontractors
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
