-- FieldSync Database Migration: Company Branding for White-Label Support
-- Run this in your Supabase SQL Editor
-- This enables large contractors to have their own branded version

-- ============================================
-- Company Branding Table
-- ============================================

CREATE TABLE IF NOT EXISTS company_branding (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Visual Branding
  logo_url TEXT,
  favicon_url TEXT,
  login_background_url TEXT,
  primary_color TEXT DEFAULT '#3B82F6',
  secondary_color TEXT DEFAULT '#1E40AF',

  -- App Customization
  custom_app_name TEXT DEFAULT 'FieldSync',
  hide_fieldsync_branding BOOLEAN DEFAULT false,

  -- Email Branding
  email_from_name TEXT,
  email_from_address TEXT,

  -- Custom Domain (for Enterprise)
  custom_domain TEXT,
  domain_verified BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one branding config per company
  UNIQUE(company_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_branding_company ON company_branding(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_branding_domain ON company_branding(custom_domain) WHERE custom_domain IS NOT NULL;

-- Enable RLS
ALTER TABLE company_branding ENABLE ROW LEVEL SECURITY;

-- Policies: Users can view their company's branding
CREATE POLICY "Users can view their company branding" ON company_branding
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.company_id = company_branding.company_id
      AND users.id = auth.uid()
    )
  );

-- Only company admins/owners can update branding
CREATE POLICY "Company admins can update branding" ON company_branding
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.company_id = company_branding.company_id
      AND users.id = auth.uid()
      AND users.role IN ('admin', 'office')
    )
  );

-- Allow unauthenticated read for custom domain lookups
CREATE POLICY "Public can view branding by domain" ON company_branding
  FOR SELECT USING (custom_domain IS NOT NULL);

-- Trigger to update updated_at
CREATE TRIGGER update_company_branding_updated_at
  BEFORE UPDATE ON company_branding
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Add subscription tier to companies table
-- ============================================

-- Add tier column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'subscription_tier') THEN
    ALTER TABLE companies ADD COLUMN subscription_tier TEXT DEFAULT 'free'
      CHECK (subscription_tier IN ('free', 'pro', 'business', 'enterprise'));
  END IF;
END $$;

-- Create index on tier
CREATE INDEX IF NOT EXISTS idx_companies_tier ON companies(subscription_tier);

-- ============================================
-- Function to get branding for a domain
-- ============================================

CREATE OR REPLACE FUNCTION get_branding_by_domain(domain_name TEXT)
RETURNS TABLE (
  company_id UUID,
  logo_url TEXT,
  favicon_url TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  custom_app_name TEXT,
  hide_fieldsync_branding BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cb.company_id,
    cb.logo_url,
    cb.favicon_url,
    cb.primary_color,
    cb.secondary_color,
    cb.custom_app_name,
    cb.hide_fieldsync_branding
  FROM company_branding cb
  WHERE cb.custom_domain = domain_name
  AND cb.domain_verified = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Default branding for existing companies
-- ============================================

-- Insert default branding for companies that don't have one
INSERT INTO company_branding (company_id, custom_app_name, primary_color, secondary_color)
SELECT
  id,
  'FieldSync',
  '#3B82F6',
  '#1E40AF'
FROM companies
WHERE NOT EXISTS (
  SELECT 1 FROM company_branding WHERE company_branding.company_id = companies.id
);
