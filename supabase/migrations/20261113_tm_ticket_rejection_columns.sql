-- ============================================================
-- T&M TICKET REJECTION COLUMNS
-- ============================================================
-- The office app writes rejected_by_user_id, rejected_by_name,
-- rejected_at and rejection_reason on t_and_m_tickets when a ticket
-- is rejected, and clears them when a ticket is approved. The live
-- table (read 2026-11-11) does not have these columns, so approving
-- or rejecting a ticket fails with "column does not exist".
--
-- Additive only: four nullable columns, no data touched. Safe to run
-- on its own, before or after anything else, and safe to re-run.
-- Rollback: supabase/rollbacks/20261113_tm_ticket_rejection_columns_rollback.sql
-- ============================================================

BEGIN;

ALTER TABLE public.t_and_m_tickets
  ADD COLUMN IF NOT EXISTS rejected_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS rejected_by_name TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

COMMENT ON COLUMN public.t_and_m_tickets.rejection_reason IS
  'Why the office rejected the ticket; shown to the foreman so it can be fixed and resubmitted.';

-- Make the API see the new columns immediately
NOTIFY pgrst, 'reload schema';

COMMIT;
