-- Migration: Add enable_truck_load_tracking to trade config tables
-- This allows office users to enable/disable truck & load tracking per company or per project.
-- When enabled, foremen and office users can track trucks and loads hauled off site.

-- Add to company-level trade config
ALTER TABLE company_trade_config
  ADD COLUMN IF NOT EXISTS enable_truck_load_tracking BOOLEAN DEFAULT NULL;

-- Add to project-level overrides
ALTER TABLE project_trade_overrides
  ADD COLUMN IF NOT EXISTS enable_truck_load_tracking BOOLEAN DEFAULT NULL;

-- Add to trade templates (so templates like Concrete can default it on)
ALTER TABLE trade_templates
  ADD COLUMN IF NOT EXISTS enable_truck_load_tracking BOOLEAN DEFAULT NULL;

-- Update concrete template to enable truck load tracking by default
UPDATE trade_templates
  SET enable_truck_load_tracking = true
  WHERE id = 'concrete';

COMMENT ON COLUMN company_trade_config.enable_truck_load_tracking
  IS 'When true, truck & load tracking is available in foreman and office views for this company';
COMMENT ON COLUMN project_trade_overrides.enable_truck_load_tracking
  IS 'Per-project override for truck & load tracking visibility. NULL = use company default';
COMMENT ON COLUMN trade_templates.enable_truck_load_tracking
  IS 'Template default for truck & load tracking. NULL = disabled';
