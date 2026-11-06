-- ============================================================
-- ROLLBACK for 20261105_tm_ticket_office_edit.sql
--
-- Drops update_tm_ticket_contents, the trg_protect_tm_edit_audit
-- trigger and its function, the t_and_m_ticket_edits table (with its
-- policy and index) and the six audit columns on t_and_m_tickets.
-- Deploy the previous client first: the office edit modal calls the
-- RPC and the T&M card reads the audit columns.
--
-- NOT reverted (data, not schema):
--   - workers / items / ticket fields changed by edits stay as edited;
--   - ticket-sourced COR lines deleted by an edit stay deleted, and
--     associations an edit flagged (import_status 'failed', import_error
--     'Ticket edited - COR cost lines must be re-synced') stay flagged:
--     the existing Retry Sync button re-imports them;
--   - cor_status_history notes written by edits stay.
-- Dropping t_and_m_ticket_edits discards the before/after snapshots
-- (the only record of what a signer signed before an edit); export it
-- first if it must be kept:
--   SELECT * FROM t_and_m_ticket_edits ORDER BY ticket_id, edited_at;
--
-- IDEMPOTENT — safe to re-run.
-- ============================================================

DROP FUNCTION IF EXISTS update_tm_ticket_contents(UUID, JSONB, JSONB, JSONB, TEXT);

DROP TRIGGER IF EXISTS trg_protect_tm_edit_audit ON t_and_m_tickets;
DROP FUNCTION IF EXISTS protect_tm_edit_audit_columns();

DROP TABLE IF EXISTS t_and_m_ticket_edits;

ALTER TABLE t_and_m_tickets
  DROP COLUMN IF EXISTS edited_at,
  DROP COLUMN IF EXISTS edited_by_user_id,
  DROP COLUMN IF EXISTS edited_by_name,
  DROP COLUMN IF EXISTS edit_count,
  DROP COLUMN IF EXISTS edited_after_signature,
  DROP COLUMN IF EXISTS last_edit_note;

DO $$
BEGIN
  IF to_regprocedure('public.update_tm_ticket_contents(uuid,jsonb,jsonb,jsonb,text)') IS NOT NULL
     OR to_regprocedure('public.protect_tm_edit_audit_columns()') IS NOT NULL
     OR to_regclass('public.t_and_m_ticket_edits') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 't_and_m_tickets'
         AND column_name IN ('edited_at', 'edited_by_user_id', 'edited_by_name',
                             'edit_count', 'edited_after_signature', 'last_edit_note')
     ) THEN
    RAISE EXCEPTION 'Rollback verification failed: office-edit objects still present';
  END IF;
  RAISE NOTICE 'Rollback of 20261105_tm_ticket_office_edit complete';
END $$;
