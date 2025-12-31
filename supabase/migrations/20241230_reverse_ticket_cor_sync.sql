-- ============================================================
-- REVERSE SYNC: Ticket assigned_cor_id → Junction Table
-- ============================================================
--
-- Problem: When a T&M ticket is created with assigned_cor_id set,
-- no junction table entry is created. The COR detail view and PDF
-- export look for entries in change_order_ticket_associations,
-- but they're never created from field ticket submissions.
--
-- Solution: Add a trigger that creates junction entries when
-- assigned_cor_id is set on a ticket (INSERT or UPDATE).
-- ============================================================

-- Function to sync assigned_cor_id changes to junction table
CREATE OR REPLACE FUNCTION sync_ticket_to_junction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Handle INSERT or UPDATE where assigned_cor_id is set
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- If assigned_cor_id was set or changed
    IF NEW.assigned_cor_id IS NOT NULL THEN
      -- Create junction entry if it doesn't exist
      INSERT INTO change_order_ticket_associations (change_order_id, ticket_id, data_imported)
      VALUES (NEW.assigned_cor_id, NEW.id, false)
      ON CONFLICT (change_order_id, ticket_id) DO NOTHING;
    END IF;

    -- If assigned_cor_id was cleared (UPDATE only)
    IF TG_OP = 'UPDATE' AND OLD.assigned_cor_id IS NOT NULL AND NEW.assigned_cor_id IS NULL THEN
      -- Remove the old junction entry
      DELETE FROM change_order_ticket_associations
      WHERE ticket_id = NEW.id AND change_order_id = OLD.assigned_cor_id;
    END IF;

    -- If assigned_cor_id was changed to a different COR (UPDATE only)
    IF TG_OP = 'UPDATE' AND OLD.assigned_cor_id IS NOT NULL AND NEW.assigned_cor_id IS NOT NULL
       AND OLD.assigned_cor_id != NEW.assigned_cor_id THEN
      -- Remove old junction entry
      DELETE FROM change_order_ticket_associations
      WHERE ticket_id = NEW.id AND change_order_id = OLD.assigned_cor_id;
    END IF;

    RETURN NEW;
  END IF;

  -- Handle DELETE - clean up junction entries
  IF TG_OP = 'DELETE' THEN
    IF OLD.assigned_cor_id IS NOT NULL THEN
      DELETE FROM change_order_ticket_associations
      WHERE ticket_id = OLD.id AND change_order_id = OLD.assigned_cor_id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_sync_ticket_to_junction ON t_and_m_tickets;

-- Create trigger on t_and_m_tickets
CREATE TRIGGER trg_sync_ticket_to_junction
AFTER INSERT OR UPDATE OF assigned_cor_id OR DELETE ON t_and_m_tickets
FOR EACH ROW EXECUTE FUNCTION sync_ticket_to_junction();

-- ============================================================
-- FIX EXISTING DATA
-- Create junction entries for all tickets that have assigned_cor_id
-- but are missing from the junction table
-- ============================================================

INSERT INTO change_order_ticket_associations (change_order_id, ticket_id, data_imported)
SELECT t.assigned_cor_id, t.id, false
FROM t_and_m_tickets t
WHERE t.assigned_cor_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM change_order_ticket_associations a
    WHERE a.ticket_id = t.id AND a.change_order_id = t.assigned_cor_id
  )
ON CONFLICT (change_order_id, ticket_id) DO NOTHING;

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
DECLARE
  fixed_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO fixed_count
  FROM t_and_m_tickets t
  WHERE t.assigned_cor_id IS NOT NULL;

  RAISE NOTICE '✓ Reverse ticket-COR sync trigger created!';
  RAISE NOTICE '  - Trigger: trg_sync_ticket_to_junction';
  RAISE NOTICE '  - Tickets with assigned_cor_id: %', fixed_count;
  RAISE NOTICE '  - Junction entries now synced automatically';
END $$;
