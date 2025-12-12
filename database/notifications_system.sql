-- Notification System for FieldSync
-- Creates company-level notification settings and individual notifications

-- ============================================================================
-- NOTIFICATION_SETTINGS TABLE
-- Company-level presets defining WHO gets notified for WHAT events
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  -- Event types: 'material_request', 'tm_submitted', 'tm_approved', 'tm_rejected',
  --              'daily_report', 'message', 'material_approved', 'material_rejected',
  --              'safety_incident', 'crew_checkin'

  -- Who to notify (can use both user IDs and roles)
  notify_user_ids UUID[] DEFAULT '{}',  -- Specific user IDs
  notify_roles TEXT[] DEFAULT '{}',     -- Roles: 'owner', 'admin', 'manager', 'office', 'pm'

  -- Notification channels
  email_enabled BOOLEAN DEFAULT FALSE,
  push_enabled BOOLEAN DEFAULT FALSE,
  in_app_enabled BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique constraint: one setting per event type per company
  UNIQUE(company_id, event_type)
);

-- Index for faster lookups by company
CREATE INDEX IF NOT EXISTS idx_notification_settings_company
  ON notification_settings(company_id);

-- ============================================================================
-- NOTIFICATIONS TABLE
-- Actual notifications sent to individual users
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,

  -- Where to navigate when clicked (e.g., '/project/123/materials', '/project/123/tm')
  link_to TEXT,

  -- Metadata for the event (JSON with relevant IDs and context)
  metadata JSONB DEFAULT '{}',

  -- Read status
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications(user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_company
  ON notifications(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_project
  ON notifications(project_id, created_at DESC);

-- ============================================================================
-- TRIGGERS AND FUNCTIONS
-- ============================================================================

-- Update updated_at timestamp for notification_settings
CREATE OR REPLACE FUNCTION update_notification_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notification_settings_updated_at
  BEFORE UPDATE ON notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_settings_updated_at();

-- ============================================================================
-- DEFAULT NOTIFICATION SETTINGS
-- Function to create default settings for a new company
-- ============================================================================
CREATE OR REPLACE FUNCTION create_default_notification_settings(p_company_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Material request submitted
  INSERT INTO notification_settings (company_id, event_type, notify_roles, in_app_enabled)
  VALUES (p_company_id, 'material_request', ARRAY['owner', 'admin', 'manager']::TEXT[], TRUE)
  ON CONFLICT (company_id, event_type) DO NOTHING;

  -- T&M ticket submitted
  INSERT INTO notification_settings (company_id, event_type, notify_roles, in_app_enabled)
  VALUES (p_company_id, 'tm_submitted', ARRAY['owner', 'admin', 'manager']::TEXT[], TRUE)
  ON CONFLICT (company_id, event_type) DO NOTHING;

  -- T&M ticket approved
  INSERT INTO notification_settings (company_id, event_type, notify_roles, in_app_enabled)
  VALUES (p_company_id, 'tm_approved', ARRAY['foreman']::TEXT[], TRUE)
  ON CONFLICT (company_id, event_type) DO NOTHING;

  -- T&M ticket rejected
  INSERT INTO notification_settings (company_id, event_type, notify_roles, in_app_enabled)
  VALUES (p_company_id, 'tm_rejected', ARRAY['foreman']::TEXT[], TRUE)
  ON CONFLICT (company_id, event_type) DO NOTHING;

  -- Daily report submitted
  INSERT INTO notification_settings (company_id, event_type, notify_roles, in_app_enabled)
  VALUES (p_company_id, 'daily_report', ARRAY['owner', 'admin', 'manager']::TEXT[], TRUE)
  ON CONFLICT (company_id, event_type) DO NOTHING;

  -- Message from field
  INSERT INTO notification_settings (company_id, event_type, notify_roles, in_app_enabled)
  VALUES (p_company_id, 'message', ARRAY['owner', 'admin', 'manager', 'office']::TEXT[], TRUE)
  ON CONFLICT (company_id, event_type) DO NOTHING;

  -- Material request approved
  INSERT INTO notification_settings (company_id, event_type, notify_roles, in_app_enabled)
  VALUES (p_company_id, 'material_approved', ARRAY['foreman']::TEXT[], TRUE)
  ON CONFLICT (company_id, event_type) DO NOTHING;

  -- Material request rejected
  INSERT INTO notification_settings (company_id, event_type, notify_roles, in_app_enabled)
  VALUES (p_company_id, 'material_rejected', ARRAY['foreman']::TEXT[], TRUE)
  ON CONFLICT (company_id, event_type) DO NOTHING;

  -- Crew check-in
  INSERT INTO notification_settings (company_id, event_type, notify_roles, in_app_enabled)
  VALUES (p_company_id, 'crew_checkin', ARRAY['owner', 'admin', 'manager']::TEXT[], TRUE)
  ON CONFLICT (company_id, event_type) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- HELPER FUNCTION: Create notifications for an event
-- ============================================================================
CREATE OR REPLACE FUNCTION create_notifications_for_event(
  p_company_id UUID,
  p_project_id UUID,
  p_event_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_link_to TEXT,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS INT AS $$
DECLARE
  v_setting RECORD;
  v_user_id UUID;
  v_profile RECORD;
  v_notification_count INT := 0;
BEGIN
  -- Get notification settings for this event type
  SELECT * INTO v_setting
  FROM notification_settings
  WHERE company_id = p_company_id
    AND event_type = p_event_type;

  -- If no settings found or in_app not enabled, return 0
  IF NOT FOUND OR v_setting.in_app_enabled = FALSE THEN
    RETURN 0;
  END IF;

  -- Create notifications for specific users
  FOREACH v_user_id IN ARRAY v_setting.notify_user_ids
  LOOP
    INSERT INTO notifications (
      user_id, company_id, project_id, event_type,
      title, message, link_to, metadata
    ) VALUES (
      v_user_id, p_company_id, p_project_id, p_event_type,
      p_title, p_message, p_link_to, p_metadata
    );
    v_notification_count := v_notification_count + 1;
  END LOOP;

  -- Create notifications for users with matching roles
  IF array_length(v_setting.notify_roles, 1) > 0 THEN
    FOR v_profile IN
      SELECT DISTINCT id
      FROM profiles
      WHERE company_id = p_company_id
        AND role = ANY(v_setting.notify_roles)
        AND id != ALL(COALESCE(v_setting.notify_user_ids, '{}'))  -- Avoid duplicates
    LOOP
      INSERT INTO notifications (
        user_id, company_id, project_id, event_type,
        title, message, link_to, metadata
      ) VALUES (
        v_profile.id, p_company_id, p_project_id, p_event_type,
        p_title, p_message, p_link_to, p_metadata
      );
      v_notification_count := v_notification_count + 1;
    END LOOP;
  END IF;

  RETURN v_notification_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RLS (Row Level Security) POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Notification Settings Policies
-- Only company owners/admins can manage settings
CREATE POLICY notification_settings_select_policy ON notification_settings
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY notification_settings_insert_policy ON notification_settings
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY notification_settings_update_policy ON notification_settings
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY notification_settings_delete_policy ON notification_settings
  FOR DELETE USING (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Notifications Policies
-- Users can only see their own notifications
CREATE POLICY notifications_select_policy ON notifications
  FOR SELECT USING (user_id = auth.uid());

-- System can create notifications (handled by functions)
CREATE POLICY notifications_insert_policy ON notifications
  FOR INSERT WITH CHECK (TRUE);

-- Users can update their own notifications (mark as read)
CREATE POLICY notifications_update_policy ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- Users can delete their own notifications
CREATE POLICY notifications_delete_policy ON notifications
  FOR DELETE USING (user_id = auth.uid());

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE notification_settings IS 'Company-level notification configuration presets';
COMMENT ON TABLE notifications IS 'Individual user notifications for various events';
COMMENT ON FUNCTION create_default_notification_settings IS 'Creates default notification settings when a new company is created';
COMMENT ON FUNCTION create_notifications_for_event IS 'Creates notifications for all relevant users based on company settings';
