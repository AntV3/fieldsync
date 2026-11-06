-- ============================================================
-- ROLLBACK for 20261104_transactional_email.sql
--
-- Run this FIRST, then 20261104_signature_public_rpcs_rollback.sql
-- (reverse apply order). Deploy the previous client before or with
-- it: the current client embeds email_outbox under signature_requests
-- (it falls back to the plain select on PGRST200 for one release).
--
-- Removes: the cron job 'email_outbox_sweep', the three email
-- triggers (trg_email_signature_request, trg_email_document_signed,
-- trg_email_tm_ticket_submitted), every outbox / worker function and
-- the email_outbox table (its rows: the delivery history, are lost).
--
-- Leaves in place: notification_preferences (the app reads and writes
-- it independently of email) and the pg_net / pg_cron extensions.
-- The two Vault secrets are not touched; delete them in the dashboard
-- if email is being retired for good.
--
-- IDEMPOTENT: safe to re-run.
-- ============================================================

BEGIN;

-- 8. cron job (guarded: pg_cron may be absent)
DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'pg_cron not present; no cron job to remove';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email_outbox_sweep') THEN
    PERFORM cron.unschedule('email_outbox_sweep');
    RAISE NOTICE 'cron job email_outbox_sweep removed';
  END IF;
END $$;

-- 7. triggers
DROP TRIGGER IF EXISTS trg_email_signature_request ON signature_requests;
DROP TRIGGER IF EXISTS trg_email_document_signed ON signatures;
DO $$
BEGIN
  IF to_regclass('public.t_and_m_tickets') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_email_tm_ticket_submitted ON t_and_m_tickets';
  END IF;
END $$;

-- 8, 7, 6, 5, 4, 3. functions
DROP FUNCTION IF EXISTS email_outbox_sweep();
DROP FUNCTION IF EXISTS email_on_signature_request();
DROP FUNCTION IF EXISTS email_on_document_signed();
DROP FUNCTION IF EXISTS email_on_tm_ticket_submitted();
DROP FUNCTION IF EXISTS email_context(UUID);
DROP FUNCTION IF EXISTS mark_email_outbox(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS claim_email_outbox(UUID);
DROP FUNCTION IF EXISTS email_outbox_due(INTEGER);
DROP FUNCTION IF EXISTS enqueue_email(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INTERVAL);
DROP FUNCTION IF EXISTS email_outbox_dispatch(UUID);
DROP FUNCTION IF EXISTS email_worker_post(JSONB);
DROP FUNCTION IF EXISTS email_recipients_for_event(UUID, TEXT);
DROP FUNCTION IF EXISTS email_company_owner(UUID);
DROP FUNCTION IF EXISTS email_company_member(UUID, UUID);
DROP FUNCTION IF EXISTS email_user_contact(UUID);
DROP FUNCTION IF EXISTS email_address_ok(TEXT);

-- 2. the outbox (policy and indexes go with it)
DROP TABLE IF EXISTS email_outbox;

COMMIT;

-- Verify:
--   SELECT to_regclass('public.email_outbox');                                -- NULL
--   SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_email_%';             -- no rows
--   SELECT jobname FROM cron.job WHERE jobname = 'email_outbox_sweep';         -- no rows
