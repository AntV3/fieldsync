-- ============================================================
-- ROLLBACK for 20261104_offline_tm_submit.sql
--
-- Drops create_tm_ticket_full, the client_submission_id unique
-- index and the client_submission_id column. Deploy the previous
-- client first: the offline-submit client calls the RPC.
--
-- Dropping the column discards the dedupe keys of tickets created
-- through the RPC; the tickets, workers and items themselves stay.
--
-- The re-asserted field policies on t_and_m_tickets / t_and_m_workers
-- / t_and_m_items ("Secure field view/create/update tickets",
-- "Secure field view/create workers", "Secure field view/create
-- items") and the SELECT/INSERT(/UPDATE) grants to anon and
-- authenticated are deliberately LEFT IN PLACE: their text is the
-- one 20260228_fix_foreman_auth_errors.sql already shipped, the
-- deployed field app depends on them, and permissive policies only
-- widen access to the rows can_access_project() already allows.
--
-- IDEMPOTENT — safe to re-run.
-- ============================================================

DROP FUNCTION IF EXISTS create_tm_ticket_full(JSONB);

DROP INDEX IF EXISTS idx_tm_tickets_client_submission_id;

ALTER TABLE t_and_m_tickets
  DROP COLUMN IF EXISTS client_submission_id;
