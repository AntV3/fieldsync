-- Migration: Trade Profiles & Customizable Field Sync
-- Enables companies of ANY trade to customize their field forms, dashboard widgets,
-- worker roles, document categories, KPIs, and field actions.

-- ============================================
-- TRADE TEMPLATES (Starter presets — not a fixed list)
-- ============================================
CREATE TABLE IF NOT EXISTS trade_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  default_worker_roles JSONB DEFAULT '[]',
  default_document_categories JSONB DEFAULT '[]',
  default_field_actions JSONB DEFAULT '[]',
  default_dashboard_widgets JSONB DEFAULT '[]',
  default_custom_fields JSONB DEFAULT '{}',
  default_kpis JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- COMPANY TRADE CONFIG (One per company)
-- ============================================
CREATE TABLE IF NOT EXISTS company_trade_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  trade_template_id TEXT REFERENCES trade_templates(id),
  trade_name TEXT,
  worker_roles JSONB,
  document_categories JSONB,
  field_actions JSONB,
  dashboard_widgets JSONB,
  custom_fields JSONB,
  kpis JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PROJECT TRADE OVERRIDES (Optional per-project)
-- ============================================
CREATE TABLE IF NOT EXISTS project_trade_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  dashboard_widgets JSONB,
  custom_fields JSONB,
  field_actions JSONB,
  kpis JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CUSTOM FIELD DATA (Stores captured values)
-- ============================================
CREATE TABLE IF NOT EXISTS custom_field_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  field_key TEXT NOT NULL,
  field_value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, field_key)
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_company_trade_config_company ON company_trade_config(company_id);
CREATE INDEX IF NOT EXISTS idx_project_trade_overrides_project ON project_trade_overrides(project_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_data_project ON custom_field_data(project_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_data_entity ON custom_field_data(entity_type, entity_id);

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_trade_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_company_trade_config_updated_at ON company_trade_config;
CREATE TRIGGER trigger_company_trade_config_updated_at
  BEFORE UPDATE ON company_trade_config
  FOR EACH ROW
  EXECUTE FUNCTION update_trade_config_updated_at();

DROP TRIGGER IF EXISTS trigger_project_trade_overrides_updated_at ON project_trade_overrides;
CREATE TRIGGER trigger_project_trade_overrides_updated_at
  BEFORE UPDATE ON project_trade_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_trade_config_updated_at();

DROP TRIGGER IF EXISTS trigger_custom_field_data_updated_at ON custom_field_data;
CREATE TRIGGER trigger_custom_field_data_updated_at
  BEFORE UPDATE ON custom_field_data
  FOR EACH ROW
  EXECUTE FUNCTION update_trade_config_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE trade_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_trade_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_trade_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_data ENABLE ROW LEVEL SECURITY;

-- Trade templates are readable by all authenticated users
DROP POLICY IF EXISTS "Anyone can read trade templates" ON trade_templates;
CREATE POLICY "Anyone can read trade templates" ON trade_templates
  FOR SELECT USING (true);

-- Company trade config
DROP POLICY IF EXISTS "Users can view their company trade config" ON company_trade_config;
CREATE POLICY "Users can view their company trade config" ON company_trade_config
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = company_trade_config.company_id
      AND uc.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can create their company trade config" ON company_trade_config;
CREATE POLICY "Users can create their company trade config" ON company_trade_config
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = company_trade_config.company_id
      AND uc.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can update their company trade config" ON company_trade_config;
CREATE POLICY "Users can update their company trade config" ON company_trade_config
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = company_trade_config.company_id
      AND uc.status = 'active'
    )
  );

-- Project trade overrides
DROP POLICY IF EXISTS "Users can view project trade overrides" ON project_trade_overrides;
CREATE POLICY "Users can view project trade overrides" ON project_trade_overrides
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN user_companies uc ON uc.company_id = p.company_id
      WHERE p.id = project_trade_overrides.project_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can manage project trade overrides" ON project_trade_overrides;
CREATE POLICY "Users can manage project trade overrides" ON project_trade_overrides
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN user_companies uc ON uc.company_id = p.company_id
      WHERE p.id = project_trade_overrides.project_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
    )
  );

-- Custom field data
DROP POLICY IF EXISTS "Users can view custom field data" ON custom_field_data;
CREATE POLICY "Users can view custom field data" ON custom_field_data
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN user_companies uc ON uc.company_id = p.company_id
      WHERE p.id = custom_field_data.project_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can manage custom field data" ON custom_field_data;
CREATE POLICY "Users can manage custom field data" ON custom_field_data
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN user_companies uc ON uc.company_id = p.company_id
      WHERE p.id = custom_field_data.project_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
    )
  );

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
GRANT SELECT ON trade_templates TO authenticated;
GRANT ALL ON company_trade_config TO authenticated;
GRANT ALL ON project_trade_overrides TO authenticated;
GRANT ALL ON custom_field_data TO authenticated;

-- ============================================
-- SEED DATA: Starter trade templates
-- ============================================
INSERT INTO trade_templates (id, name, description, icon, default_worker_roles, default_document_categories, default_field_actions, default_dashboard_widgets, default_custom_fields, default_kpis) VALUES

('general_contractor', 'General Contractor', 'Multi-trade coordination and project management', 'Building2',
  '["Superintendent", "Foreman", "Project Manager", "Laborer", "Operator"]',
  '[{"id": "subcontracts", "label": "Subcontracts", "icon": "Users"}, {"id": "schedules", "label": "Schedules", "icon": "Calendar"}, {"id": "meeting_minutes", "label": "Meeting Minutes", "icon": "FileText"}]',
  '["crew", "tm", "report", "progress", "observations", "docs", "punchlist", "injury"]',
  '["progress_gauge", "financial_card", "crew_metrics", "earned_value"]',
  '{"daily_report": [{"key": "subcontractors_on_site", "label": "Subcontractors on Site", "type": "textarea", "required": false, "placeholder": "List subs and headcount", "sort_order": 1}, {"key": "schedule_notes", "label": "Schedule Notes", "type": "textarea", "required": false, "placeholder": "Any schedule impacts or milestones", "sort_order": 2}], "tm_ticket": [{"key": "trade_performing", "label": "Trade Performing Work", "type": "text", "required": false, "placeholder": "e.g. Electrical, Plumbing", "sort_order": 1}]}',
  '[{"id": "sub_compliance", "label": "Sub Compliance Rate", "unit": "%", "icon": "CheckCircle", "source_field_key": null, "aggregation": "count", "time_period": "week"}]'
),

('electrical', 'Electrical', 'Electrical installation, wiring, and panel work', 'Zap',
  '["Foreman", "Journeyman", "Apprentice", "Superintendent", "Operator"]',
  '[{"id": "panel_schedules", "label": "Panel Schedules", "icon": "LayoutGrid"}, {"id": "as_builts", "label": "As-Builts", "icon": "Map"}, {"id": "test_reports", "label": "Test Reports", "icon": "ClipboardCheck"}]',
  '["crew", "tm", "report", "progress", "observations", "docs", "punchlist", "injury"]',
  '["progress_gauge", "financial_card", "crew_metrics"]',
  '{"daily_report": [{"key": "wire_pulls", "label": "Wire Pulls Completed", "type": "number", "required": false, "placeholder": "Number of pulls", "sort_order": 1}, {"key": "conduit_footage", "label": "Conduit Installed (ft)", "type": "number", "required": false, "placeholder": "Linear feet", "sort_order": 2}, {"key": "panels_set", "label": "Panels Set", "type": "number", "required": false, "placeholder": "Number of panels", "sort_order": 3}, {"key": "circuit_testing", "label": "Circuit Testing Status", "type": "select", "required": false, "options": ["Not Started", "In Progress", "Complete", "Failed"], "sort_order": 4}], "tm_ticket": [{"key": "wire_type", "label": "Wire Type/Size", "type": "text", "required": false, "placeholder": "e.g. 12/2 Romex, #10 THHN", "sort_order": 1}, {"key": "panel_ref", "label": "Panel Reference", "type": "text", "required": false, "placeholder": "e.g. Panel A, MDP", "sort_order": 2}]}',
  '[{"id": "wire_pulls_per_day", "label": "Wire Pulls / Day", "unit": "pulls", "icon": "Zap", "source_field_key": "wire_pulls", "aggregation": "avg", "time_period": "day"}, {"id": "conduit_per_day", "label": "Conduit / Day", "unit": "ft", "icon": "ArrowRight", "source_field_key": "conduit_footage", "aggregation": "avg", "time_period": "day"}]'
),

('hvac', 'Mechanical / HVAC', 'HVAC systems, ductwork, and refrigeration', 'Wind',
  '["Foreman", "Journeyman", "Apprentice", "Sheet Metal Worker", "Pipefitter"]',
  '[{"id": "equipment_submittals", "label": "Equipment Submittals", "icon": "Package"}, {"id": "commissioning", "label": "Commissioning Docs", "icon": "ClipboardCheck"}, {"id": "balancing_reports", "label": "Balancing Reports", "icon": "BarChart2"}]',
  '["crew", "tm", "report", "progress", "observations", "docs", "punchlist", "injury"]',
  '["progress_gauge", "financial_card", "crew_metrics"]',
  '{"daily_report": [{"key": "duct_footage", "label": "Ductwork Installed (ft)", "type": "number", "required": false, "placeholder": "Linear feet", "sort_order": 1}, {"key": "refrigerant_type", "label": "Refrigerant Type", "type": "select", "required": false, "options": ["R-410A", "R-32", "R-134a", "R-22", "Other"], "sort_order": 2}, {"key": "refrigerant_lbs", "label": "Refrigerant Charged (lbs)", "type": "number", "required": false, "placeholder": "Pounds", "sort_order": 3}, {"key": "commissioning_items", "label": "Commissioning Items Completed", "type": "number", "required": false, "placeholder": "Number of items", "sort_order": 4}], "tm_ticket": [{"key": "equipment_tag", "label": "Equipment Tag/ID", "type": "text", "required": false, "placeholder": "e.g. AHU-1, RTU-3", "sort_order": 1}]}',
  '[{"id": "duct_per_day", "label": "Ductwork / Day", "unit": "ft", "icon": "Wind", "source_field_key": "duct_footage", "aggregation": "avg", "time_period": "day"}]'
),

('concrete', 'Concrete', 'Concrete placement, forming, and finishing', 'Layers',
  '["Foreman", "Finisher", "Form Carpenter", "Laborer", "Pump Operator", "Rod Buster"]',
  '[{"id": "mix_designs", "label": "Mix Designs", "icon": "Beaker"}, {"id": "pour_tickets", "label": "Pour Tickets", "icon": "FileText"}, {"id": "test_cylinders", "label": "Test Cylinders", "icon": "TestTube"}]',
  '["crew", "tm", "report", "progress", "observations", "docs", "punchlist", "injury"]',
  '["progress_gauge", "financial_card", "crew_metrics"]',
  '{"daily_report": [{"key": "yards_poured", "label": "Yards Poured", "type": "number", "required": false, "placeholder": "Cubic yards", "sort_order": 1}, {"key": "psi_spec", "label": "PSI Specification", "type": "number", "required": false, "placeholder": "e.g. 4000", "sort_order": 2}, {"key": "slump", "label": "Slump (inches)", "type": "number", "required": false, "placeholder": "e.g. 4", "sort_order": 3}, {"key": "mix_design_id", "label": "Mix Design ID", "type": "text", "required": false, "placeholder": "Mix design reference", "sort_order": 4}, {"key": "cure_start", "label": "Cure Start Time", "type": "text", "required": false, "placeholder": "e.g. 2:30 PM", "sort_order": 5}, {"key": "rebar_inspection", "label": "Rebar Inspection", "type": "select", "required": false, "options": ["Passed", "Failed", "Pending", "N/A"], "sort_order": 6}], "tm_ticket": [{"key": "pour_location", "label": "Pour Location", "type": "text", "required": false, "placeholder": "e.g. Foundation Wall B", "sort_order": 1}]}',
  '[{"id": "yards_per_week", "label": "Yards / Week", "unit": "cy", "icon": "Layers", "source_field_key": "yards_poured", "aggregation": "sum", "time_period": "week"}, {"id": "avg_psi", "label": "Avg PSI", "unit": "psi", "icon": "Gauge", "source_field_key": "psi_spec", "aggregation": "avg", "time_period": "month"}]'
)

ON CONFLICT (id) DO NOTHING;
