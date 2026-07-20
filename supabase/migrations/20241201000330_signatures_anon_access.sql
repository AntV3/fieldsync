-- Migration: Fix signatures table RLS for anonymous users
-- Purpose: Allow field users (anon role) to submit signatures via public links
-- Date: January 3, 2025

-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Public can add signatures" ON signatures;
DROP POLICY IF EXISTS "Public can view signatures" ON signatures;
DROP POLICY IF EXISTS "Anon can add signatures" ON signatures;
DROP POLICY IF EXISTS "Anon can view signatures" ON signatures;

-- Allow anonymous users to insert signatures for valid pending requests
CREATE POLICY "Anon can add signatures" ON signatures
  FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM signature_requests sr
      WHERE sr.id = signature_request_id
      AND sr.status IN ('pending', 'partially_signed')
      AND (sr.expires_at IS NULL OR sr.expires_at > NOW())
    )
  );

-- Allow anonymous users to view signatures for accessible requests
CREATE POLICY "Anon can view signatures" ON signatures
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM signature_requests sr
      WHERE sr.id = signature_request_id
      AND (sr.expires_at IS NULL OR sr.expires_at > NOW())
    )
  );

-- Ensure authenticated users can also insert/view
CREATE POLICY "Authenticated can add signatures" ON signatures
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM signature_requests sr
      WHERE sr.id = signature_request_id
      AND sr.status IN ('pending', 'partially_signed')
    )
  );

CREATE POLICY "Authenticated can view signatures" ON signatures
  FOR SELECT
  TO authenticated
  USING (true);

-- Grant necessary permissions
GRANT SELECT, INSERT ON signatures TO anon;
GRANT SELECT, INSERT ON signatures TO authenticated;
