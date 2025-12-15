-- ============================================
-- NOTIFICATION SYSTEM INFRASTRUCTURE
-- Phase 1: Database Foundation
-- ============================================

-- 1. NOTIFICATION ROLES TABLE
-- Define roles that can receive notifications (flexible, not hardcoded)
CREATE TABLE IF NOT EXISTS notification_roles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL, -- e.g., "Materials Manager", "Safety Director", "Project Manager"
  role_key TEXT NOT NULL, -- e.g., "materials_manager", "safety_director" (for code reference)
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(company_id, role_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_roles_company ON notification_roles(company_id);

-- Disable RLS for development
ALTER TABLE notification_roles DISABLE ROW LEVEL SECURITY;

-- 2. USER NOTIFICATION ROLES TABLE
-- Assign roles to users (one user can have multiple roles)
CREATE TABLE IF NOT EXISTS user_notification_roles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES notification_roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID REFERENCES users(id),
  UNIQUE(user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_notification_roles_user ON user_notification_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notification_roles_role ON user_notification_roles(role_id);

-- Disable RLS for development
ALTER TABLE user_notification_roles DISABLE ROW LEVEL SECURITY;

-- 3. NOTIFICATION TYPES TABLE
-- Define what events can trigger notifications
CREATE TABLE IF NOT EXISTS notification_types (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  type_key TEXT UNIQUE NOT NULL, -- e.g., "material_request_submitted", "injury_report_filed"
  type_name TEXT NOT NULL, -- e.g., "Material Request Submitted"
  description TEXT,
  default_enabled BOOLEAN DEFAULT true,
  category TEXT, -- e.g., "materials", "safety", "timekeeping"
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_types_category ON notification_types(category);

-- Disable RLS for development
ALTER TABLE notification_types DISABLE ROW LEVEL SECURITY;

-- 4. NOTIFICATION PREFERENCES TABLE
-- User preferences for each notification type
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  notification_type_id UUID NOT NULL REFERENCES notification_types(id) ON DELETE CASCADE,
  email_enabled BOOLEAN DEFAULT true,
  in_app_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT false, -- Future: SMS notifications
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, company_id, notification_type_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_company ON notification_preferences(company_id);

-- Disable RLS for development
ALTER TABLE notification_preferences DISABLE ROW LEVEL SECURITY;

-- 5. NOTIFICATIONS TABLE
-- Log of all notifications sent
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  notification_type_id UUID NOT NULL REFERENCES notification_types(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- recipient
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link_url TEXT, -- e.g., link to material request or injury report
  metadata JSONB, -- Additional data (request_id, report_id, priority, etc.)

  -- Delivery tracking
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMP WITH TIME ZONE,
  email_error TEXT,

  in_app_read BOOLEAN DEFAULT false,
  in_app_read_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_company ON notifications(company_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, in_app_read) WHERE in_app_read = false;

-- Disable RLS for development
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- ============================================
-- SEED DATA: Default Notification Types
-- ============================================

INSERT INTO notification_types (type_key, type_name, description, category, default_enabled) VALUES
  -- Materials Category
  ('material_request_submitted', 'Material Request Submitted', 'Notify when a foreman submits a material request', 'materials', true),
  ('material_request_urgent', 'Urgent Material Request', 'Immediate alert for urgent material requests', 'materials', true),
  ('material_request_approved', 'Material Request Approved', 'Notify foreman when request is approved', 'materials', true),
  ('material_request_rejected', 'Material Request Rejected', 'Notify foreman when request is rejected', 'materials', true),
  ('material_delivery_overdue', 'Material Delivery Overdue', 'Alert when expected delivery date has passed', 'materials', true),

  -- Safety Category
  ('injury_report_filed', 'Injury Report Filed', 'Notify when any injury report is submitted', 'safety', true),
  ('injury_report_critical', 'Critical Injury Reported', 'IMMEDIATE alert for critical/serious injuries', 'safety', true),
  ('injury_report_osha_recordable', 'OSHA Recordable Injury', 'Alert for OSHA-recordable incidents', 'safety', true),
  ('injury_report_hospitalization', 'Hospitalization Required', 'Alert when injury requires hospitalization', 'safety', true),

  -- Time & Materials Category
  ('tm_ticket_submitted', 'T&M Ticket Submitted', 'Notify when T&M ticket needs approval', 'timekeeping', false),
  ('tm_ticket_rejected', 'T&M Ticket Rejected', 'Notify foreman when ticket is rejected', 'timekeeping', false),

  -- Daily Reports Category
  ('daily_report_missing', 'Daily Report Missing', 'Alert when daily report is not submitted', 'reports', false),
  ('daily_report_submitted', 'Daily Report Submitted', 'Notify when daily report is filed', 'reports', false)

ON CONFLICT (type_key) DO NOTHING;

-- ============================================
-- SEED DATA: Default Notification Roles
-- Create default roles for GGG and MILLER
-- ============================================

-- GGG Company Roles
INSERT INTO notification_roles (company_id, role_name, role_key, description)
SELECT
  c.id,
  'Materials Manager',
  'materials_manager',
  'Receives notifications about material requests and deliveries'
FROM companies c
WHERE c.code = 'GGG'
ON CONFLICT (company_id, role_key) DO NOTHING;

INSERT INTO notification_roles (company_id, role_name, role_key, description)
SELECT
  c.id,
  'Safety Director',
  'safety_director',
  'Receives notifications about all injury reports and safety incidents'
FROM companies c
WHERE c.code = 'GGG'
ON CONFLICT (company_id, role_key) DO NOTHING;

INSERT INTO notification_roles (company_id, role_name, role_key, description)
SELECT
  c.id,
  'Project Manager',
  'project_manager',
  'Receives notifications about project updates and reports'
FROM companies c
WHERE c.code = 'GGG'
ON CONFLICT (company_id, role_key) DO NOTHING;

-- MILLER Company Roles
INSERT INTO notification_roles (company_id, role_name, role_key, description)
SELECT
  c.id,
  'Materials Manager',
  'materials_manager',
  'Receives notifications about material requests and deliveries'
FROM companies c
WHERE c.code = 'MILLER'
ON CONFLICT (company_id, role_key) DO NOTHING;

INSERT INTO notification_roles (company_id, role_name, role_key, description)
SELECT
  c.id,
  'Safety Director',
  'safety_director',
  'Receives notifications about all injury reports and safety incidents'
FROM companies c
WHERE c.code = 'MILLER'
ON CONFLICT (company_id, role_key) DO NOTHING;

INSERT INTO notification_roles (company_id, role_name, role_key, description)
SELECT
  c.id,
  'Project Manager',
  'project_manager',
  'Receives notifications about project updates and reports'
FROM companies c
WHERE c.code = 'MILLER'
ON CONFLICT (company_id, role_key) DO NOTHING;

-- ============================================
-- VERIFICATION & SUCCESS MESSAGE
-- ============================================

-- Show created roles
SELECT
  '=== NOTIFICATION ROLES CREATED ===' as info,
  c.name as company,
  nr.role_name,
  nr.role_key,
  nr.description
FROM notification_roles nr
JOIN companies c ON c.id = nr.company_id
ORDER BY c.name, nr.role_name;

-- Show notification types
SELECT
  '=== NOTIFICATION TYPES AVAILABLE ===' as info,
  category,
  type_name,
  CASE WHEN default_enabled THEN '✓ Enabled' ELSE '○ Disabled' END as status
FROM notification_types
ORDER BY category, type_name;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✓ Notification system database created successfully!';
  RAISE NOTICE '';
  RAISE NOTICE '=== TABLES CREATED ===';
  RAISE NOTICE '- notification_roles: Define custom notification roles';
  RAISE NOTICE '- user_notification_roles: Assign roles to users';
  RAISE NOTICE '- notification_types: Event types that trigger notifications';
  RAISE NOTICE '- notification_preferences: User preferences per notification type';
  RAISE NOTICE '- notifications: Log of all sent notifications';
  RAISE NOTICE '';
  RAISE NOTICE '=== DEFAULT ROLES CREATED ===';
  RAISE NOTICE '- Materials Manager (receives material request notifications)';
  RAISE NOTICE '- Safety Director (receives injury report notifications)';
  RAISE NOTICE '- Project Manager (receives project update notifications)';
  RAISE NOTICE '';
  RAISE NOTICE '=== NEXT STEPS ===';
  RAISE NOTICE '1. Assign notification roles to users in the office UI';
  RAISE NOTICE '2. Configure notification preferences';
  RAISE NOTICE '3. Integrate email service';
  RAISE NOTICE '4. Test notifications end-to-end';
END $$;
