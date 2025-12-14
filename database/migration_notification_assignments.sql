-- FieldSync Notification Assignments Migration
-- Adds notification assignment capabilities for routing notifications to specific users

-- ============================================
-- Notification Assignments Table
-- ============================================

CREATE TABLE IF NOT EXISTS notification_assignments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'material_requests',
    'equipment_requests',
    'injury_reports',
    'tm_tickets',
    'daily_reports',
    'messages'
  )),
  assigned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  UNIQUE(company_id, notification_type, assigned_user_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_notification_assignments_company ON notification_assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_notification_assignments_type ON notification_assignments(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_assignments_user ON notification_assignments(assigned_user_id);

-- Enable RLS
ALTER TABLE notification_assignments ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Company users can view notification assignments" ON notification_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND company_id = notification_assignments.company_id
    )
  );

CREATE POLICY "Admins can manage notification assignments" ON notification_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND company_id = notification_assignments.company_id
      AND role IN ('owner', 'admin', 'manager')
    )
  );

-- Comments
COMMENT ON TABLE notification_assignments IS 'Assigns specific users to receive notifications for different event types';
COMMENT ON COLUMN notification_assignments.notification_type IS 'Type of notification: material_requests, equipment_requests, injury_reports, tm_tickets, daily_reports, messages';
COMMENT ON COLUMN notification_assignments.assigned_user_id IS 'User who will receive notifications for this type';
