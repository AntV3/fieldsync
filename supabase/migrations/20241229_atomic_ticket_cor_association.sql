-- ============================================================
-- ATOMIC TICKET-COR ASSOCIATION
-- Ensures dual FK and junction table stay in sync
-- ============================================================

-- Function to atomically assign a ticket to a COR
-- Both operations happen in a single transaction
CREATE OR REPLACE FUNCTION assign_ticket_to_cor(
  p_ticket_id UUID,
  p_cor_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert into junction table (ignore if already exists)
  INSERT INTO change_order_ticket_associations (change_order_id, ticket_id, data_imported)
  VALUES (p_cor_id, p_ticket_id, false)
  ON CONFLICT (change_order_id, ticket_id) DO NOTHING;

  -- Update ticket's assigned_cor_id
  UPDATE t_and_m_tickets
  SET assigned_cor_id = p_cor_id
  WHERE id = p_ticket_id;

  -- Both succeed or both fail - transaction guarantees atomicity
END;
$$;

-- Function to atomically unassign a ticket from a COR
CREATE OR REPLACE FUNCTION unassign_ticket_from_cor(
  p_ticket_id UUID,
  p_cor_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete from junction table
  DELETE FROM change_order_ticket_associations
  WHERE ticket_id = p_ticket_id
    AND change_order_id = p_cor_id;

  -- Clear ticket's assigned_cor_id (only if it matches this COR)
  UPDATE t_and_m_tickets
  SET assigned_cor_id = NULL
  WHERE id = p_ticket_id
    AND assigned_cor_id = p_cor_id;
END;
$$;

-- ============================================================
-- SYNC TRIGGER
-- Automatically keeps assigned_cor_id in sync with junction table
-- ============================================================

CREATE OR REPLACE FUNCTION sync_ticket_cor_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- When association is created, update ticket's assigned_cor_id
    UPDATE t_and_m_tickets
    SET assigned_cor_id = NEW.change_order_id
    WHERE id = NEW.ticket_id
      AND (assigned_cor_id IS NULL OR assigned_cor_id != NEW.change_order_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- When association is deleted, clear ticket's assigned_cor_id
    UPDATE t_and_m_tickets
    SET assigned_cor_id = NULL
    WHERE id = OLD.ticket_id
      AND assigned_cor_id = OLD.change_order_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_sync_ticket_cor ON change_order_ticket_associations;

-- Create the sync trigger
CREATE TRIGGER trg_sync_ticket_cor
AFTER INSERT OR DELETE ON change_order_ticket_associations
FOR EACH ROW EXECUTE FUNCTION sync_ticket_cor_assignment();

-- ============================================================
-- DATA INTEGRITY CHECK FUNCTION
-- Run this to find any inconsistencies between dual associations
-- ============================================================

CREATE OR REPLACE FUNCTION check_ticket_cor_integrity()
RETURNS TABLE (
  ticket_id UUID,
  assigned_cor_id UUID,
  junction_cor_id UUID,
  issue TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  -- Find tickets where assigned_cor_id is set but no junction record exists
  SELECT
    t.id as ticket_id,
    t.assigned_cor_id,
    NULL::UUID as junction_cor_id,
    'Missing junction record'::TEXT as issue
  FROM t_and_m_tickets t
  WHERE t.assigned_cor_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM change_order_ticket_associations a
      WHERE a.ticket_id = t.id AND a.change_order_id = t.assigned_cor_id
    )

  UNION ALL

  -- Find junction records where ticket's assigned_cor_id doesn't match
  SELECT
    a.ticket_id,
    t.assigned_cor_id,
    a.change_order_id as junction_cor_id,
    'Mismatched assigned_cor_id'::TEXT as issue
  FROM change_order_ticket_associations a
  JOIN t_and_m_tickets t ON t.id = a.ticket_id
  WHERE t.assigned_cor_id IS NULL OR t.assigned_cor_id != a.change_order_id;
END;
$$;

-- ============================================================
-- FIX EXISTING INCONSISTENCIES
-- Run this once to fix any existing data issues
-- ============================================================

CREATE OR REPLACE FUNCTION fix_ticket_cor_integrity()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  fixed_count INTEGER := 0;
BEGIN
  -- Fix tickets with assigned_cor_id but no junction record
  INSERT INTO change_order_ticket_associations (change_order_id, ticket_id, data_imported)
  SELECT t.assigned_cor_id, t.id, false
  FROM t_and_m_tickets t
  WHERE t.assigned_cor_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM change_order_ticket_associations a
      WHERE a.ticket_id = t.id AND a.change_order_id = t.assigned_cor_id
    )
  ON CONFLICT (change_order_id, ticket_id) DO NOTHING;

  GET DIAGNOSTICS fixed_count = ROW_COUNT;

  -- Fix junction records where ticket's assigned_cor_id doesn't match
  UPDATE t_and_m_tickets t
  SET assigned_cor_id = a.change_order_id
  FROM change_order_ticket_associations a
  WHERE a.ticket_id = t.id
    AND (t.assigned_cor_id IS NULL OR t.assigned_cor_id != a.change_order_id);

  RETURN fixed_count;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION assign_ticket_to_cor(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION unassign_ticket_from_cor(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_ticket_cor_integrity() TO authenticated;
GRANT EXECUTE ON FUNCTION fix_ticket_cor_integrity() TO authenticated;

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE 'Atomic Ticket-COR Association functions created successfully!';
  RAISE NOTICE 'Functions: assign_ticket_to_cor(), unassign_ticket_from_cor()';
  RAISE NOTICE 'Integrity: check_ticket_cor_integrity(), fix_ticket_cor_integrity()';
  RAISE NOTICE 'Trigger: trg_sync_ticket_cor (keeps dual FK in sync)';
END $$;
