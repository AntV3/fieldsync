-- Migration: Add project_shares table for read-only portal
-- Run this in your Supabase SQL Editor after the initial schema

-- Project Shares table for public read-only access
CREATE TABLE project_shares (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  share_token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{"progress": true, "photos": true, "daily_reports": true, "tm_tickets": false, "crew_info": false}'::jsonb,
  view_count INTEGER DEFAULT 0 NOT NULL,
  last_viewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_project_shares_project_id ON project_shares(project_id);
CREATE INDEX idx_project_shares_token ON project_shares(share_token);
CREATE INDEX idx_project_shares_active ON project_shares(is_active);

-- Enable Row Level Security
ALTER TABLE project_shares ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access by share token (no auth required)
CREATE POLICY "Allow public read by share token" ON project_shares
  FOR SELECT
  USING (is_active = true AND (expires_at IS NULL OR expires_at > NOW()));

-- Policy: Allow authenticated users to manage shares for their company's projects
CREATE POLICY "Allow company users to manage shares" ON project_shares
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN users u ON u.company_id = p.company_id
      WHERE p.id = project_shares.project_id
      AND u.id = auth.uid()
    )
  );

-- Trigger to auto-update updated_at
CREATE TRIGGER update_project_shares_updated_at
  BEFORE UPDATE ON project_shares
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to generate a unique share token
CREATE OR REPLACE FUNCTION generate_share_token()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
  token_exists BOOLEAN := true;
BEGIN
  WHILE token_exists LOOP
    result := '';
    FOR i IN 1..12 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;

    -- Check if token already exists
    SELECT EXISTS(SELECT 1 FROM project_shares WHERE share_token = result) INTO token_exists;
  END LOOP;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to increment view count
CREATE OR REPLACE FUNCTION increment_share_view_count(token TEXT)
RETURNS void AS $$
BEGIN
  UPDATE project_shares
  SET
    view_count = view_count + 1,
    last_viewed_at = NOW()
  WHERE share_token = token
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW());
END;
$$ LANGUAGE plpgsql;
