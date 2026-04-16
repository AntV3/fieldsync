-- Migration: Add enable_truck_load_tracking flag to trade config tables
--
-- Context: The foreman "Disposal" tab and the office "Disposal Trends" section
-- are gated on resolvedConfig.enable_truck_load_tracking (see ForemanLanding.jsx,
-- ForemanView.jsx, ReportsTab.jsx, TradeConfigContext.jsx). The application code
-- reads this flag from trade_templates, company_trade_config, and
-- project_trade_overrides, but the column was never added to the schema.
--
-- Result before this migration: the flag always resolves to undefined, falls back
-- to false, and the disposal UI is hidden regardless of the admin toggle. Saves
-- from TradeProfileSettings silently drop the field.
--
-- Default is TRUE so disposal load / material type / truck count capture is
-- available out of the box for existing companies. Admins can still disable per
-- company or per project.

ALTER TABLE trade_templates
  ADD COLUMN IF NOT EXISTS enable_truck_load_tracking BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE company_trade_config
  ADD COLUMN IF NOT EXISTS enable_truck_load_tracking BOOLEAN;

ALTER TABLE project_trade_overrides
  ADD COLUMN IF NOT EXISTS enable_truck_load_tracking BOOLEAN;
