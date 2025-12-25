-- Migration: Add signature workflow tables for CORs and T&M Tickets
-- Run this in your Supabase SQL Editor
-- This enables shareable links for GC/Client to sign documents without login

-- ============================================================================
-- Table 1: signature_requests - Tracks pending signature links
-- ============================================================================

CREATE TABLE signature_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Link to the document being signed
  document_type TEXT NOT NULL CHECK (document_type IN ('cor', 'tm_ticket')),
  document_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Secure token for public access (e.g., sig_abc123xyz789)
  signature_token TEXT NOT NULL UNIQUE,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partially_signed', 'completed', 'expired', 'revoked')),

  -- Optional expiration
  expires_at TIMESTAMPTZ,

  -- Access tracking
  view_count INTEGER DEFAULT 0 NOT NULL,
  last_viewed_at TIMESTAMPTZ,

  -- Audit
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_signature_requests_token ON signature_requests(signature_token);
CREATE INDEX idx_signature_requests_document ON signature_requests(document_type, document_id);
CREATE INDEX idx_signature_requests_status ON signature_requests(status);
CREATE INDEX idx_signature_requests_company ON signature_requests(company_id);

-- ============================================================================
-- Table 2: signatures - Stores captured signatures
-- ============================================================================

CREATE TABLE signatures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Link to the signature request
  signature_request_id UUID NOT NULL REFERENCES signature_requests(id) ON DELETE CASCADE,

  -- Which signature slot (1 = GC, 2 = Client)
  signature_slot INTEGER NOT NULL CHECK (signature_slot IN (1, 2)),

  -- Full signature data
  signature_image TEXT NOT NULL, -- Base64 encoded PNG
  signer_name TEXT NOT NULL,
  signer_title TEXT,
  signer_company TEXT,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Legal/audit tracking
  ip_address INET,
  user_agent TEXT,

  -- Ensure only one signature per slot per request
  CONSTRAINT unique_slot_per_request UNIQUE (signature_request_id, signature_slot)
);

CREATE INDEX idx_signatures_request ON signatures(signature_request_id);

-- ============================================================================
-- Add signature columns to change_orders table
-- ============================================================================

-- Add additional fields for GC signature (some may already exist)
ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS gc_signature_title TEXT,
ADD COLUMN IF NOT EXISTS gc_signature_company TEXT,
ADD COLUMN IF NOT EXISTS gc_signature_ip INET;

-- Add full Client signature fields
ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS client_signature_data TEXT,
ADD COLUMN IF NOT EXISTS client_signature_name TEXT,
ADD COLUMN IF NOT EXISTS client_signature_title TEXT,
ADD COLUMN IF NOT EXISTS client_signature_company TEXT,
ADD COLUMN IF NOT EXISTS client_signature_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS client_signature_ip INET;

-- ============================================================================
-- Add signature columns to t_and_m_tickets table
-- ============================================================================

-- Add GC signature fields
ALTER TABLE t_and_m_tickets
ADD COLUMN IF NOT EXISTS gc_signature_data TEXT,
ADD COLUMN IF NOT EXISTS gc_signature_name TEXT,
ADD COLUMN IF NOT EXISTS gc_signature_title TEXT,
ADD COLUMN IF NOT EXISTS gc_signature_company TEXT,
ADD COLUMN IF NOT EXISTS gc_signature_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS gc_signature_ip INET;

-- Add Client signature fields
ALTER TABLE t_and_m_tickets
ADD COLUMN IF NOT EXISTS client_signature_data TEXT,
ADD COLUMN IF NOT EXISTS client_signature_name TEXT,
ADD COLUMN IF NOT EXISTS client_signature_title TEXT,
ADD COLUMN IF NOT EXISTS client_signature_company TEXT,
ADD COLUMN IF NOT EXISTS client_signature_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS client_signature_ip INET;

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE signature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;

-- Policy: Public can view signature requests by valid token
CREATE POLICY "Public read signature requests by token" ON signature_requests
  FOR SELECT
  USING (
    status IN ('pending', 'partially_signed')
    AND (expires_at IS NULL OR expires_at > NOW())
  );

-- Policy: Public can insert signatures for valid requests
CREATE POLICY "Public can add signatures" ON signatures
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM signature_requests sr
      WHERE sr.id = signature_request_id
      AND sr.status IN ('pending', 'partially_signed')
      AND (sr.expires_at IS NULL OR sr.expires_at > NOW())
    )
  );

-- Policy: Public can read signatures for accessible requests
CREATE POLICY "Public can view signatures" ON signatures
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM signature_requests sr
      WHERE sr.id = signature_request_id
      AND sr.status IN ('pending', 'partially_signed', 'completed')
      AND (sr.expires_at IS NULL OR sr.expires_at > NOW())
    )
  );

-- Policy: Authenticated company users can manage signature requests
CREATE POLICY "Company users manage signature requests" ON signature_requests
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = signature_requests.company_id
    )
  );

-- Policy: Authenticated company users can view signatures
CREATE POLICY "Company users view signatures" ON signatures
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM signature_requests sr
      INNER JOIN user_companies uc ON uc.company_id = sr.company_id
      WHERE sr.id = signature_request_id
      AND uc.user_id = auth.uid()
    )
  );

-- ============================================================================
-- Functions
-- ============================================================================

-- Generate unique signature token with 'sig_' prefix
CREATE OR REPLACE FUNCTION generate_signature_token()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
  token_exists BOOLEAN := true;
BEGIN
  WHILE token_exists LOOP
    result := 'sig_';
    FOR i IN 1..16 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    SELECT EXISTS(SELECT 1 FROM signature_requests WHERE signature_token = result) INTO token_exists;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Auto-update signature request status when signatures are added
CREATE OR REPLACE FUNCTION update_signature_request_status()
RETURNS TRIGGER AS $$
DECLARE
  sig_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO sig_count
  FROM signatures
  WHERE signature_request_id = NEW.signature_request_id;

  IF sig_count >= 2 THEN
    UPDATE signature_requests
    SET status = 'completed', updated_at = NOW()
    WHERE id = NEW.signature_request_id;
  ELSIF sig_count = 1 THEN
    UPDATE signature_requests
    SET status = 'partially_signed', updated_at = NOW()
    WHERE id = NEW.signature_request_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_signature_status
AFTER INSERT ON signatures
FOR EACH ROW EXECUTE FUNCTION update_signature_request_status();

-- Increment view count for signature request
CREATE OR REPLACE FUNCTION increment_signature_view_count(token TEXT)
RETURNS void AS $$
BEGIN
  UPDATE signature_requests
  SET
    view_count = view_count + 1,
    last_viewed_at = NOW()
  WHERE signature_token = token
    AND status IN ('pending', 'partially_signed')
    AND (expires_at IS NULL OR expires_at > NOW());
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at trigger
CREATE TRIGGER update_signature_requests_updated_at
  BEFORE UPDATE ON signature_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
