-- FieldSync Migration: Universal Trade Profiles
-- Adds trade type and company type to companies table so FieldSync
-- can adapt its UI, terminology, and modules to any trade or contractor type.
-- Run this in your Supabase SQL Editor.

-- ============================================
-- Add trade and company_type columns to companies
-- ============================================

DO $$
BEGIN
  -- trade: which construction trade this company performs
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'trade'
  ) THEN
    ALTER TABLE companies ADD COLUMN trade TEXT DEFAULT 'demolition';
  END IF;

  -- company_type: GC, subcontractor, or owner/self-perform
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'company_type'
  ) THEN
    ALTER TABLE companies ADD COLUMN company_type TEXT DEFAULT 'subcontractor';
  END IF;

  -- field_supervisor_label: how this company refers to their field leads
  -- Overrides the trade profile default (e.g. 'Foreman', 'Lead', 'Super', etc.)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'field_supervisor_label'
  ) THEN
    ALTER TABLE companies ADD COLUMN field_supervisor_label TEXT;
  END IF;
END $$;

-- Add check constraints (permissive - allows 'custom' and any new trade values)
ALTER TABLE companies
  DROP CONSTRAINT IF EXISTS companies_company_type_check;

ALTER TABLE companies
  ADD CONSTRAINT companies_company_type_check
  CHECK (company_type IN ('subcontractor', 'general_contractor', 'owner_builder'));

-- ============================================
-- Add check constraint for company_branding
-- material_categories: JSON array of custom waste/material types
-- Overrides the trade profile's default material categories
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_branding' AND column_name = 'material_categories'
  ) THEN
    ALTER TABLE company_branding ADD COLUMN material_categories JSONB;
  END IF;

  -- custom_work_types: JSON array of {value, label} overriding trade defaults
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_branding' AND column_name = 'custom_work_types'
  ) THEN
    ALTER TABLE company_branding ADD COLUMN custom_work_types JSONB;
  END IF;
END $$;

-- ============================================
-- Update company settings view/function to include trade info
-- ============================================

CREATE OR REPLACE FUNCTION get_company_settings(p_company_id UUID)
RETURNS TABLE (id UUID, name TEXT, code VARCHAR, office_code TEXT, subscription_tier TEXT, trade TEXT, company_type TEXT, field_supervisor_label TEXT)
AS $$
BEGIN
  RETURN QUERY SELECT companies.id, companies.name, companies.code, companies.office_code, companies.subscription_tier, companies.trade, companies.company_type, companies.field_supervisor_label FROM companies WHERE companies.id = p_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Index for trade lookups
-- ============================================

CREATE INDEX IF NOT EXISTS idx_companies_trade ON companies(trade);
CREATE INDEX IF NOT EXISTS idx_companies_company_type ON companies(company_type);
