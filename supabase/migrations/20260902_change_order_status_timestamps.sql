-- Add audit timestamp columns to change_orders that the app writes but
-- were never in the schema.
--
-- corOps.rejectCOR/markCORAsBilled/closeCOR write rejected_at, billed_at
-- and closed_at respectively. Without these columns those three flows
-- fail with PGRST204 "column does not exist" — Reject, Mark as Billed
-- and Close are effectively broken.
--
-- Additive-only, safe to run multiple times.

ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at   TIMESTAMPTZ;
