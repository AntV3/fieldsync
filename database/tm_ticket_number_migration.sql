-- T&M Ticket Number Migration
-- Adds unique 6-digit ticket numbers to T&M tickets
-- Run this in your Supabase SQL Editor

-- ================================================
-- ADD TICKET NUMBER TO T&M TICKETS
-- ================================================

-- Add ticket_number column
ALTER TABLE t_and_m_tickets
ADD COLUMN IF NOT EXISTS ticket_number TEXT UNIQUE;

-- Create sequence for ticket numbers (starts at 1, increments by 1)
CREATE SEQUENCE IF NOT EXISTS tm_ticket_number_seq START 1;

-- Drop trigger first (before dropping functions)
DROP TRIGGER IF EXISTS trigger_set_ticket_number ON t_and_m_tickets;

-- Function to generate 6-digit ticket number
DROP FUNCTION IF EXISTS generate_ticket_number() CASCADE;
CREATE FUNCTION generate_ticket_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  ticket_num TEXT;
BEGIN
  -- Get next number from sequence
  next_num := nextval('tm_ticket_number_seq');

  -- Format as 6-digit number with leading zeros
  ticket_num := LPAD(next_num::TEXT, 6, '0');

  RETURN ticket_num;
END;
$$ LANGUAGE plpgsql;

-- Function to set ticket number on insert (if not provided)
DROP FUNCTION IF EXISTS set_ticket_number() CASCADE;
CREATE FUNCTION set_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  -- Only generate if ticket_number is null
  IF NEW.ticket_number IS NULL THEN
    NEW.ticket_number := generate_ticket_number();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate ticket numbers
CREATE TRIGGER trigger_set_ticket_number
  BEFORE INSERT ON t_and_m_tickets
  FOR EACH ROW
  EXECUTE FUNCTION set_ticket_number();

-- ================================================
-- BACKFILL EXISTING TICKETS
-- ================================================

-- Update existing tickets without ticket numbers
DO $$
DECLARE
  ticket_record RECORD;
BEGIN
  FOR ticket_record IN
    SELECT id FROM t_and_m_tickets WHERE ticket_number IS NULL ORDER BY created_at
  LOOP
    UPDATE t_and_m_tickets
    SET ticket_number = generate_ticket_number()
    WHERE id = ticket_record.id;
  END LOOP;
END $$;

-- ================================================
-- CREATE INDEX
-- ================================================

CREATE INDEX IF NOT EXISTS idx_tm_tickets_ticket_number ON t_and_m_tickets(ticket_number);

-- ================================================
-- VERIFICATION
-- ================================================

-- Verify ticket numbers were created
SELECT
  COUNT(*) as total_tickets,
  COUNT(ticket_number) as tickets_with_numbers,
  MIN(ticket_number) as first_ticket,
  MAX(ticket_number) as last_ticket
FROM t_and_m_tickets;

-- Show sample tickets with numbers
SELECT id, ticket_number, work_date, created_at
FROM t_and_m_tickets
ORDER BY created_at DESC
LIMIT 10;

COMMENT ON COLUMN t_and_m_tickets.ticket_number IS 'Unique 6-digit ticket number (auto-generated)';
