-- ============================================
-- PROJECT-LEVEL PERMISSIONS SYSTEM
-- Enables project owners to manage team members
-- and customize what each member can see/do
-- ============================================

-- ============================================
-- 1. PROJECT MEMBERSHIP TABLE
-- Tracks who is on which project and their role
-- ============================================
CREATE TABLE IF NOT EXISTS project_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Project role (authority level)
  project_role TEXT NOT NULL CHECK (project_role IN ('owner', 'manager', 'member', 'viewer')),

  -- Metadata
  invited_by UUID REFERENCES users(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Ensure user can only be on project once
  UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_users_project ON project_users(project_id);
CREATE INDEX IF NOT EXISTS idx_project_users_user ON project_users(user_id);
CREATE INDEX IF NOT EXISTS idx_project_users_role ON project_users(project_role);

COMMENT ON TABLE project_users IS 'Tracks which users are members of which projects and their project-level role';
COMMENT ON COLUMN project_users.project_role IS 'owner: full control, manager: can manage team/settings, member: active participant, viewer: read-only';


-- ============================================
-- 2. PERMISSION DEFINITIONS
-- Defines all available permissions in the system
-- ============================================
CREATE TABLE IF NOT EXISTS project_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  permission_key TEXT UNIQUE NOT NULL,
  permission_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('financial', 'materials', 'operations', 'team', 'safety', 'equipment')),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_permissions_category ON project_permissions(category);

COMMENT ON TABLE project_permissions IS 'Defines all available permissions that can be granted to project members';


-- ============================================
-- 3. USER PERMISSIONS FOR PROJECTS
-- Tracks which permissions each user has on each project
-- ============================================
CREATE TABLE IF NOT EXISTS project_user_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_user_id UUID NOT NULL REFERENCES project_users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,

  -- Metadata
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Ensure permission only granted once per user
  UNIQUE(project_user_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_project_user_permissions_project_user ON project_user_permissions(project_user_id);
CREATE INDEX IF NOT EXISTS idx_project_user_permissions_key ON project_user_permissions(permission_key);

COMMENT ON TABLE project_user_permissions IS 'Tracks which permissions each project member has been granted';


-- ============================================
-- 4. ROLE TEMPLATES
-- Predefined permission sets for common roles
-- ============================================
CREATE TABLE IF NOT EXISTS role_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_key TEXT UNIQUE NOT NULL,
  role_name TEXT NOT NULL,
  description TEXT,
  default_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_role_templates_key ON role_templates(role_key);

COMMENT ON TABLE role_templates IS 'Template permission sets for common roles like Materials Manager, Accounting, etc.';
COMMENT ON COLUMN role_templates.default_permissions IS 'JSON array of permission_key strings';


-- ============================================
-- 5. MAKE NOTIFICATION ROLES PROJECT-SPECIFIC
-- Add project_id to notification_roles (nullable for company-wide roles)
-- ============================================
ALTER TABLE notification_roles
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notification_roles_project ON notification_roles(project_id);

COMMENT ON COLUMN notification_roles.project_id IS 'If set, this notification role is specific to a project. If NULL, it is company-wide.';


-- ============================================
-- INSERT DEFAULT PERMISSIONS
-- ============================================
INSERT INTO project_permissions (permission_key, permission_name, category, description) VALUES
  -- Financial Permissions
  ('view_material_costs', 'View Material Costs', 'financial', 'Can see how much materials cost'),
  ('view_labor_costs', 'View Labor Costs', 'financial', 'Can see employee pay rates and labor costs'),
  ('view_equipment_costs', 'View Equipment Costs', 'financial', 'Can see equipment rental/ownership costs'),
  ('view_budgets', 'View Project Budgets', 'financial', 'Can see project budget and financial targets'),
  ('view_profit_margins', 'View Profit Margins', 'financial', 'Can see markup and profit calculations'),
  ('export_financial_reports', 'Export Financial Reports', 'financial', 'Can download financial data and reports'),
  ('edit_budgets', 'Edit Budgets', 'financial', 'Can modify project budgets'),

  -- Materials Permissions
  ('view_materials', 'View Materials', 'materials', 'Can see material lists and requests'),
  ('edit_materials', 'Edit Materials', 'materials', 'Can create and edit material requests'),
  ('approve_materials', 'Approve Materials', 'materials', 'Can approve or reject material orders'),
  ('manage_inventory', 'Manage Inventory', 'materials', 'Can track and manage material inventory'),
  ('export_material_reports', 'Export Material Reports', 'materials', 'Can download material reports'),

  -- Operations Permissions
  ('view_daily_reports', 'View Daily Reports', 'operations', 'Can see field daily reports'),
  ('edit_daily_reports', 'Edit Daily Reports', 'operations', 'Can create and edit daily reports'),
  ('view_tm', 'View Time & Materials', 'operations', 'Can see T&M entries'),
  ('edit_tm', 'Edit Time & Materials', 'operations', 'Can create and edit T&M entries'),
  ('approve_tm', 'Approve Time & Materials', 'operations', 'Can approve or reject T&M submissions'),
  ('export_tm_reports', 'Export T&M Reports', 'operations', 'Can download T&M reports'),

  -- Equipment Permissions
  ('view_equipment', 'View Equipment', 'equipment', 'Can see equipment lists and status'),
  ('edit_equipment', 'Edit Equipment', 'equipment', 'Can create and edit equipment records'),
  ('manage_equipment', 'Manage Equipment', 'equipment', 'Can track equipment usage and maintenance'),

  -- Team Permissions
  ('view_team', 'View Team', 'team', 'Can see who is on the project'),
  ('invite_users', 'Invite Users', 'team', 'Can add people to the project'),
  ('remove_users', 'Remove Users', 'team', 'Can remove people from the project'),
  ('edit_permissions', 'Edit Permissions', 'team', 'Can change other members permissions'),

  -- Safety Permissions
  ('view_safety', 'View Safety Records', 'safety', 'Can see safety incidents and inspections'),
  ('edit_safety', 'Edit Safety Records', 'safety', 'Can create and edit safety records'),
  ('manage_safety', 'Manage Safety Program', 'safety', 'Full safety program management')
ON CONFLICT (permission_key) DO NOTHING;


-- ============================================
-- INSERT DEFAULT ROLE TEMPLATES
-- ============================================
INSERT INTO role_templates (role_key, role_name, description, default_permissions) VALUES
  ('materials_manager', 'Materials Manager', 'Manages material requests, inventory, and deliveries',
   '["view_materials", "edit_materials", "approve_materials", "manage_inventory", "export_material_reports", "view_equipment"]'::jsonb),

  ('accounting', 'Accounting / Finance', 'Views financial data and exports reports (read-only)',
   '["view_material_costs", "view_labor_costs", "view_equipment_costs", "view_budgets", "view_profit_margins", "export_financial_reports", "view_tm", "export_tm_reports"]'::jsonb),

  ('field_supervisor', 'Field Supervisor', 'Manages daily field operations and reporting',
   '["view_daily_reports", "edit_daily_reports", "view_tm", "edit_tm", "view_materials", "view_equipment", "view_team"]'::jsonb),

  ('safety_director', 'Safety Director', 'Manages all safety-related activities',
   '["view_safety", "edit_safety", "manage_safety", "view_team", "view_daily_reports"]'::jsonb),

  ('equipment_manager', 'Equipment Manager', 'Tracks and manages equipment',
   '["view_equipment", "edit_equipment", "manage_equipment", "view_daily_reports"]'::jsonb),

  ('project_accountant', 'Project Accountant', 'Full financial oversight with editing rights',
   '["view_material_costs", "view_labor_costs", "view_equipment_costs", "view_budgets", "view_profit_margins", "export_financial_reports", "edit_budgets", "view_tm", "approve_tm", "export_tm_reports"]'::jsonb),

  ('viewer', 'Viewer / Observer', 'Read-only access to basic project information',
   '["view_daily_reports", "view_materials", "view_equipment", "view_team"]'::jsonb)
ON CONFLICT (role_key) DO NOTHING;


-- ============================================
-- HELPER VIEWS
-- ============================================

-- View: Project members with their permissions
CREATE OR REPLACE VIEW v_project_team_permissions AS
SELECT
  pu.id as project_user_id,
  pu.project_id,
  pu.user_id,
  u.name as user_name,
  u.email as user_email,
  pu.project_role,
  array_agg(DISTINCT pup.permission_key) FILTER (WHERE pup.permission_key IS NOT NULL) as permissions,
  pu.joined_at,
  pu.invited_by
FROM project_users pu
JOIN users u ON u.id = pu.user_id
LEFT JOIN project_user_permissions pup ON pup.project_user_id = pu.id
GROUP BY pu.id, pu.project_id, pu.user_id, u.name, u.email, pu.project_role, pu.joined_at, pu.invited_by;

COMMENT ON VIEW v_project_team_permissions IS 'Shows all project members with their roles and permissions';


-- ============================================
-- AUTOMATIC PROJECT CREATOR OWNERSHIP
-- Trigger to automatically make project creator an owner
-- ============================================
CREATE OR REPLACE FUNCTION auto_assign_project_owner()
RETURNS TRIGGER AS $$
BEGIN
  -- When a project is created, automatically add the creator as owner
  INSERT INTO project_users (project_id, user_id, project_role, invited_by)
  VALUES (NEW.id, NEW.created_by, 'owner', NEW.created_by)
  ON CONFLICT (project_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_assign_project_owner ON projects;
CREATE TRIGGER trg_auto_assign_project_owner
  AFTER INSERT ON projects
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_project_owner();

COMMENT ON FUNCTION auto_assign_project_owner IS 'Automatically makes the project creator an owner of the project';


-- ============================================
-- GRANT FULL PERMISSIONS TO OWNERS/MANAGERS
-- Function to check if user has permission
-- ============================================
CREATE OR REPLACE FUNCTION user_has_project_permission(
  p_user_id UUID,
  p_project_id UUID,
  p_permission_key TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_project_role TEXT;
  v_has_permission BOOLEAN;
BEGIN
  -- Get user's project role
  SELECT project_role INTO v_project_role
  FROM project_users
  WHERE user_id = p_user_id AND project_id = p_project_id;

  -- If not on project, no access
  IF v_project_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Owners and managers have all permissions
  IF v_project_role IN ('owner', 'manager') THEN
    RETURN TRUE;
  END IF;

  -- Check if user has specific permission
  SELECT EXISTS(
    SELECT 1
    FROM project_users pu
    JOIN project_user_permissions pup ON pup.project_user_id = pu.id
    WHERE pu.user_id = p_user_id
      AND pu.project_id = p_project_id
      AND pup.permission_key = p_permission_key
  ) INTO v_has_permission;

  RETURN v_has_permission;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION user_has_project_permission IS 'Check if a user has a specific permission on a project';


-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '✅ Project permissions schema created successfully!';
  RAISE NOTICE '📋 Tables created: project_users, project_permissions, project_user_permissions, role_templates';
  RAISE NOTICE '🔧 Trigger created: auto_assign_project_owner';
  RAISE NOTICE '✨ Default permissions and role templates inserted';
END $$;
