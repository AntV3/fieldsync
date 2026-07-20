-- ============================================================================
-- Add foreman signature columns to t_and_m_tickets table
-- ============================================================================
-- The foreman must sign the T&M ticket before the client can sign it.
-- This ensures the foreman certifies the work documented is accurate
-- before the ticket is presented to the client for their signature.

ALTER TABLE t_and_m_tickets
ADD COLUMN IF NOT EXISTS foreman_signature_data TEXT,
ADD COLUMN IF NOT EXISTS foreman_signature_name TEXT,
ADD COLUMN IF NOT EXISTS foreman_signature_title TEXT,
ADD COLUMN IF NOT EXISTS foreman_signature_date TIMESTAMPTZ;

-- Add 'foreman_signed' as a valid status for the workflow:
-- pending → foreman_signed → client_signed → approved → billed
-- This status indicates the foreman has signed but client has not yet.
COMMENT ON COLUMN t_and_m_tickets.foreman_signature_data IS 'Base64 PNG of foreman signature';
COMMENT ON COLUMN t_and_m_tickets.foreman_signature_name IS 'Printed name of foreman who signed';
COMMENT ON COLUMN t_and_m_tickets.foreman_signature_title IS 'Title of foreman who signed';
COMMENT ON COLUMN t_and_m_tickets.foreman_signature_date IS 'Timestamp when foreman signed';
