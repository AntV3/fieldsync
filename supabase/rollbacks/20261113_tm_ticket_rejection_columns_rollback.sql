-- ============================================================
-- ROLLBACK for 20261113_tm_ticket_rejection_columns.sql
-- ============================================================
-- WARNING: drops the four columns and any rejection reasons stored
-- in them. Approving and rejecting tickets from the office stops
-- working again until the migration is re-applied.
-- ============================================================

BEGIN;

ALTER TABLE public.t_and_m_tickets
  DROP COLUMN IF EXISTS rejected_by_user_id,
  DROP COLUMN IF EXISTS rejected_by_name,
  DROP COLUMN IF EXISTS rejected_at,
  DROP COLUMN IF EXISTS rejection_reason;

NOTIFY pgrst, 'reload schema';

COMMIT;
