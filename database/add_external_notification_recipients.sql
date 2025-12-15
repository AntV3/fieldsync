-- ============================================
-- EXTERNAL NOTIFICATION RECIPIENTS
-- Allow emails without user accounts to receive notifications
-- ============================================

-- Table for external email recipients
CREATE TABLE IF NOT EXISTS external_notification_recipients (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  role_id UUID NOT NULL REFERENCES notification_roles(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT, -- Optional name for the external recipient
  notes TEXT, -- Optional notes (e.g., "External vendor contact")
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  UNIQUE(role_id, email)
);

CREATE INDEX IF NOT EXISTS idx_external_recipients_role ON external_notification_recipients(role_id);
CREATE INDEX IF NOT EXISTS idx_external_recipients_email ON external_notification_recipients(email);

-- Disable RLS for development
ALTER TABLE external_notification_recipients DISABLE ROW LEVEL SECURITY;

-- Success message
SELECT '✓ External notification recipients table created!' as status;
SELECT 'You can now add email addresses to notification roles without requiring user accounts.' as info;
