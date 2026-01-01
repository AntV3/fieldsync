-- Migration: Add RLS policies for anon/field users to create signature requests
-- Run this in your Supabase SQL Editor
--
-- Problem: Field users authenticate via project PIN (anon role), not Supabase Auth.
-- They need to be able to create signature request links for T&M tickets.

-- ============================================================================
-- Grant execute on signature functions to anon role
-- ============================================================================

GRANT EXECUTE ON FUNCTION generate_signature_token() TO anon;
GRANT EXECUTE ON FUNCTION increment_signature_view_count(TEXT) TO anon;

-- ============================================================================
-- Add INSERT policy for anon role on signature_requests
-- ============================================================================

-- Field users can create signature requests for T&M tickets
CREATE POLICY "Anon can create signature requests" ON signature_requests
  FOR INSERT
  WITH CHECK (
    document_type IN ('tm_ticket', 'cor')
  );

-- Field users can update their signature requests (e.g., view count)
CREATE POLICY "Anon can update signature requests" ON signature_requests
  FOR UPDATE
  USING (
    status IN ('pending', 'partially_signed')
    AND (expires_at IS NULL OR expires_at > NOW())
  );

-- ============================================================================
-- Verification queries (run after migration)
-- ============================================================================

-- Check policies exist:
-- SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'signature_requests';

-- Test creating a signature request as anon:
-- SET ROLE anon;
-- SELECT generate_signature_token();
-- RESET ROLE;
