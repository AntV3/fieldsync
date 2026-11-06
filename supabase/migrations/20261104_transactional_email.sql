-- ============================================================
-- TRANSACTIONAL EMAIL: outbox, triggers, worker RPCs, sweep
-- (launch item 5, part 2 of 2)
--
-- ************************************************************
-- APPLY ORDER: after 20261105_public_signing_rpcs.sql (item 1) and
-- 20261104_signature_public_rpcs.sql (item 5 part 1), even though
-- the dates sort otherwise. The first statement checks that
-- create_signature_request exists and stops with an error if not.
--
-- BEFORE APPLYING (founder checklist 20): enable pg_net and pg_cron
-- (Database -> Extensions) and create the two Vault secrets
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-email', 'email_worker_url');
--   select vault.create_secret('<random 32+ chars>', 'email_worker_secret');
-- The file still applies without them (NOTICE instead of an error):
-- emails then queue as 'pending' and go out once the secrets /
-- extensions exist and the sweep runs.
-- ************************************************************
--
-- FLOW:
--   business write (signature request / signature / field ticket)
--     -> AFTER trigger (SECURITY DEFINER, any exception becomes a
--        WARNING and the business write commits regardless)
--     -> enqueue_email(): email_outbox row (UNIQUE dedupe_key,
--        per-company cap 300 / 24 h)
--     -> email_outbox_dispatch(): pg_net POST {"outbox_id": "<id>"}
--        to the Vault 'email_worker_url' with header
--        x-email-worker-secret = Vault 'email_worker_secret'
--        (pg_net sends only after COMMIT; a rolled-back write sends
--        nothing)
--     -> Edge Function send-email (service role): claim_email_outbox,
--        email_context, Resend, mark_email_outbox
--   pg_cron 'email_outbox_sweep' every minute: POST {"drain": true}
--   when anything is due (retries, delayed rows, stuck 'sending'
--   rows locked > 10 min).
--
-- CONTENTS:
--   0. extensions (guarded)
--   1. notification_preferences (CREATE TABLE IF NOT EXISTS; never
--      ALTERs an existing table) + RLS + the 20260720 policies
--   2. email_outbox + indexes + RLS (authenticated SELECT of own
--      companies only; no client write)
--   3. internal helpers: email_address_ok, email_user_contact,
--      email_company_owner, email_company_member,
--      email_recipients_for_event
--   4. enqueue_email (per-company advisory lock; caps 300 / 24 h per
--      company and 5 / 24 h per signing-link address per company)
--   5. email_worker_post / email_outbox_dispatch
--   6. worker RPCs (service_role only): email_outbox_due,
--      claim_email_outbox, mark_email_outbox, email_context
--   7. triggers: trg_email_signature_request (signature_requests),
--      trg_email_document_signed (signatures),
--      trg_email_tm_ticket_submitted (t_and_m_tickets, field inserts)
--   8. email_outbox_sweep + cron job 'email_outbox_sweep'
--
-- Recipients per event type: active company members whose
-- notification_preferences row for the project lists the type
-- ('signature', 'tm_ticket'); when no row for the project lists it,
-- all active members. The Signed email always also goes to the
-- request's creator (if still an active member), else the company
-- owner (field-created requests). Addresses: users.email, else auth.users.email.
--
-- Columns that are not in the repo DDL (users.*, companies.logo_url /
-- owner_user_id, company_branding.*, notification_preferences.*) are
-- read through to_jsonb(row)->>'col', so a missing column reads as
-- NULL instead of breaking a trigger.
--
-- ROLLBACK: supabase/rollbacks/20261104_transactional_email_rollback.sql
--   (leaves notification_preferences and the extensions).
--
-- IDEMPOTENT: safe to re-run.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Apply-order check (see header)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.create_signature_request(text, uuid, uuid, timestamptz, text, text)') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261104_signature_public_rpcs.sql before 20261104_transactional_email.sql: create_signature_request(...) does not exist. Nothing was changed.';
  END IF;
  IF to_regprocedure('public.user_company_ids()') IS NULL THEN
    RAISE EXCEPTION 'user_company_ids() is missing: apply 20260720_enable_rls_remaining_tables.sql first. Nothing was changed.';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 0. Extensions (guarded: NOTICE, never an error)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    NULL;
  ELSIF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_net;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_net could not be enabled (%): enable it in Database -> Extensions; emails stay queued until then', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'pg_net is not available on this server: immediate dispatch is disabled; emails stay queued (net.http_post is used if a net schema provides it)';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    NULL;
  ELSIF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron could not be enabled (%): enable it in Database -> Extensions and re-run this file to schedule the sweep', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'pg_cron is not available on this server: no retry sweep (a cron schema providing cron.schedule is used if present)';
  END IF;

  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE NOTICE 'Vault (vault.decrypted_secrets) is not available: emails stay queued until the email_worker_url / email_worker_secret secrets exist';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1. notification_preferences (read by the recipient resolver;
--    written by NotificationSettings via financialOps.js upsert
--    on (project_id, user_id))
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.notification_preferences') IS NULL THEN
    CREATE TABLE notification_preferences (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      notification_types TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (project_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_notification_preferences_project ON notification_preferences(project_id);
    REVOKE ALL ON notification_preferences FROM anon;
    RAISE NOTICE 'notification_preferences created';
  ELSE
    RAISE NOTICE 'notification_preferences already exists: left as is (policies re-applied)';
  END IF;
END $$;

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- 20260720_enable_rls_remaining_tables.sql:196-231 (same text)
DROP POLICY IF EXISTS "View own or company notification prefs" ON notification_preferences;
CREATE POLICY "View own or company notification prefs"
  ON notification_preferences FOR SELECT
  USING (
    user_id = auth.uid()
    OR project_id IN (
      SELECT p.id FROM projects p
      WHERE p.company_id IN (SELECT user_company_ids())
    )
  );

DROP POLICY IF EXISTS "Manage own or company notification prefs" ON notification_preferences;
CREATE POLICY "Manage own or company notification prefs"
  ON notification_preferences FOR ALL
  USING (
    user_id = auth.uid()
    OR project_id IN (
      SELECT p.id FROM projects p
      WHERE p.company_id IN (SELECT user_company_ids())
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR project_id IN (
      SELECT p.id FROM projects p
      WHERE p.company_id IN (SELECT user_company_ids())
    )
  );

-- ------------------------------------------------------------
-- 2. email_outbox
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  signature_request_id UUID REFERENCES signature_requests(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CONSTRAINT email_outbox_event_type_check
    CHECK (event_type IN ('signature_request', 'document_signed', 'tm_ticket_submitted')),
  dedupe_key TEXT NOT NULL CONSTRAINT email_outbox_dedupe_key_key UNIQUE,
  to_email TEXT NOT NULL
    CONSTRAINT email_outbox_to_email_check
    CHECK (length(to_email) <= 254
           AND to_email ~ '^[^[:space:]@<>(),;:"\\\[\]]+@[^[:space:]@<>(),;:"\\\[\]]+\.[^[:space:]@<>(),;:"\\\[\]]+$'),
  to_name TEXT,
  reply_to TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT email_outbox_status_check
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'dead', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  provider_message_id TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE email_outbox IS
  'Transactional email queue. Written only by SECURITY DEFINER triggers / worker RPCs; payload holds ids only. Company members can read their own rows (delivery status in the UI).';

CREATE INDEX IF NOT EXISTS idx_email_outbox_due
  ON email_outbox (scheduled_for)
  WHERE status IN ('pending', 'failed', 'sending');
CREATE INDEX IF NOT EXISTS idx_email_outbox_company_created
  ON email_outbox (company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_email_outbox_signature_request
  ON email_outbox (signature_request_id)
  WHERE signature_request_id IS NOT NULL;

ALTER TABLE email_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON email_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT ON email_outbox TO authenticated;
GRANT ALL ON email_outbox TO service_role;

DROP POLICY IF EXISTS "Company members view email outbox" ON email_outbox;
CREATE POLICY "Company members view email outbox"
  ON email_outbox FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT user_company_ids()));

-- ------------------------------------------------------------
-- 3. Internal helpers (no grants)
-- ------------------------------------------------------------

-- Same address rule as the CHECKs (no whitespace, no header / list
-- separators, one @, a dot in the domain, <= 254 chars).
CREATE OR REPLACE FUNCTION email_address_ok(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT p_email IS NOT NULL
     AND length(p_email) <= 254
     AND p_email ~ '^[^[:space:]@<>(),;:"\\\[\]]+@[^[:space:]@<>(),;:"\\\[\]]+\.[^[:space:]@<>(),;:"\\\[\]]+$';
$$;

REVOKE ALL ON FUNCTION email_address_ok(TEXT) FROM PUBLIC, anon, authenticated;

-- {email, name} of a user: users.email, else auth.users.email.
CREATE OR REPLACE FUNCTION email_user_contact(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_u  JSONB;
  v_au JSONB;
  v_email TEXT;
  v_name  TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT to_jsonb(u) INTO v_u FROM users u WHERE u.id = p_user_id;
  SELECT to_jsonb(au) INTO v_au FROM auth.users au WHERE au.id = p_user_id;
  v_email := lower(COALESCE(NULLIF(btrim(v_u->>'email'), ''), NULLIF(btrim(v_au->>'email'), '')));
  v_name := COALESCE(
    NULLIF(btrim(v_u->>'name'), ''),
    NULLIF(btrim(v_u->>'full_name'), ''),
    NULLIF(btrim(v_au->'raw_user_meta_data'->>'full_name'), ''),
    NULLIF(btrim(v_au->'raw_user_meta_data'->>'name'), '')
  );
  IF NOT email_address_ok(v_email) THEN
    v_email := NULL;
  END IF;
  IF v_email IS NULL AND v_name IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object('email', v_email, 'name', v_name);
END;
$$;

REVOKE ALL ON FUNCTION email_user_contact(UUID) FROM PUBLIC, anon, authenticated;

-- Company owner: companies.owner_user_id, else the earliest active
-- administrator / owner member.
CREATE OR REPLACE FUNCTION email_company_owner(p_company_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_owner UUID;
  v_txt   TEXT;
BEGIN
  SELECT to_jsonb(c)->>'owner_user_id' INTO v_txt FROM companies c WHERE c.id = p_company_id;
  BEGIN
    v_owner := NULLIF(v_txt, '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_owner := NULL;
  END;
  IF v_owner IS NOT NULL THEN
    RETURN v_owner;
  END IF;

  SELECT uc.user_id INTO v_owner
  FROM user_companies uc
  WHERE uc.company_id = p_company_id
    AND COALESCE(uc.status, 'active') = 'active'
    AND (to_jsonb(uc)->>'access_level' = 'administrator'
         OR to_jsonb(uc)->>'role' IN ('owner', 'admin'))
  ORDER BY (to_jsonb(uc)->>'role' = 'owner') DESC NULLS LAST,
           to_jsonb(uc)->>'created_at', uc.user_id
  LIMIT 1;
  RETURN v_owner;
END;
$$;

REVOKE ALL ON FUNCTION email_company_owner(UUID) FROM PUBLIC, anon, authenticated;

-- p_user_id when it is an active member of p_company_id, else NULL.
-- A requester / creator is only used for Reply-To, the requester name
-- and the Signed email when it really belongs to the company.
CREATE OR REPLACE FUNCTION email_company_member(p_user_id UUID, p_company_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT uc.user_id
  FROM user_companies uc
  WHERE uc.user_id = p_user_id
    AND uc.company_id = p_company_id
    AND (uc.status = 'active' OR uc.status IS NULL)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION email_company_member(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Recipients of an event type for a project. p_type is the
-- NotificationSettings id: 'signature' or 'tm_ticket'.
CREATE OR REPLACE FUNCTION email_recipients_for_event(p_project_id UUID, p_type TEXT)
RETURNS TABLE (user_id UUID, email TEXT, name TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_company UUID;
  v_pref_users UUID[] := ARRAY[]::UUID[];
BEGIN
  SELECT p.company_id INTO v_company FROM projects p WHERE p.id = p_project_id;
  IF v_company IS NULL THEN
    RETURN;
  END IF;

  -- notification_types may be TEXT[] or a JSONB array: to_jsonb() of
  -- either is a JSON array that the ? operator searches.
  IF to_regclass('public.notification_preferences') IS NOT NULL THEN
    EXECUTE $q$
      SELECT COALESCE(array_agg(np.user_id), ARRAY[]::UUID[])
      FROM notification_preferences np
      WHERE np.project_id = $1
        AND jsonb_typeof(to_jsonb(np)->'notification_types') = 'array'
        AND (to_jsonb(np)->'notification_types') ? $2
    $q$ INTO v_pref_users USING p_project_id, p_type;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (c.email) c.user_id, c.email, c.name
  FROM (
    SELECT uc.user_id,
           (email_user_contact(uc.user_id))->>'email' AS email,
           (email_user_contact(uc.user_id))->>'name'  AS name
    FROM user_companies uc
    LEFT JOIN users u ON u.id = uc.user_id
    WHERE uc.company_id = v_company
      AND COALESCE(uc.status, 'active') = 'active'
      AND COALESCE(to_jsonb(u)->>'is_active', 'true') <> 'false'
      AND (cardinality(v_pref_users) = 0 OR uc.user_id = ANY (v_pref_users))
  ) c
  WHERE c.email IS NOT NULL
  ORDER BY c.email, c.user_id;
END;
$$;

REVOKE ALL ON FUNCTION email_recipients_for_event(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 5 (defined before 4, which calls it). Dispatch
-- ------------------------------------------------------------

-- POST p_body to the worker URL from Vault. FALSE (with a NOTICE)
-- when Vault, the secrets or pg_net are missing; never raises.
CREATE OR REPLACE FUNCTION email_worker_post(p_body JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE NOTICE 'email: Vault is not available; nothing posted (rows stay queued)';
    RETURN false;
  END IF;

  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 ORDER BY created_at DESC LIMIT 1'
    INTO v_url USING 'email_worker_url';
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 ORDER BY created_at DESC LIMIT 1'
    INTO v_secret USING 'email_worker_secret';

  IF NULLIF(btrim(v_url), '') IS NULL OR NULLIF(btrim(v_secret), '') IS NULL THEN
    RAISE NOTICE 'email: Vault secrets email_worker_url / email_worker_secret are not set; nothing posted (rows stay queued)';
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'net' AND p.proname = 'http_post'
  ) THEN
    RAISE NOTICE 'email: pg_net (net.http_post) is not available; nothing posted (rows stay queued)';
    RETURN false;
  END IF;

  PERFORM net.http_post(
    url := btrim(v_url),
    body := p_body,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-email-worker-secret', btrim(v_secret)
    ),
    timeout_milliseconds := 10000
  );
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'email: worker POST failed: % (%)', SQLERRM, SQLSTATE;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION email_worker_post(JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION email_outbox_dispatch(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF p_id IS NULL THEN
    RETURN false;
  END IF;
  RETURN email_worker_post(jsonb_build_object('outbox_id', p_id));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'email_outbox_dispatch(%): % (%)', p_id, SQLERRM, SQLSTATE;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION email_outbox_dispatch(UUID) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 4. enqueue_email: validate, cap, dedupe, dispatch now unless
--    delayed. Returns the new row id, or NULL when nothing was
--    queued (invalid address, cap reached, duplicate key).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION enqueue_email(
  p_company_id           UUID,
  p_project_id           UUID,
  p_signature_request_id UUID,
  p_event_type           TEXT,
  p_dedupe_key           TEXT,
  p_to_email             TEXT,
  p_to_name              TEXT,
  p_reply_to             TEXT,
  p_payload              JSONB,
  p_delay                INTERVAL DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  c_daily_cap CONSTANT INTEGER := 300;
  c_recipient_cap CONSTANT INTEGER := 5;
  v_to     TEXT := lower(NULLIF(btrim(p_to_email), ''));
  v_reply  TEXT := lower(NULLIF(btrim(p_reply_to), ''));
  v_count  INTEGER;
  v_id     UUID;
BEGIN
  IF p_company_id IS NULL OR p_dedupe_key IS NULL OR p_event_type IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT email_address_ok(v_to) THEN
    RAISE NOTICE 'email: skipped % (invalid recipient address)', p_dedupe_key;
    RETURN NULL;
  END IF;
  IF v_reply IS NOT NULL AND NOT email_address_ok(v_reply) THEN
    v_reply := NULL;
  END IF;

  -- One enqueue per company at a time (until COMMIT), so concurrent
  -- writers cannot both pass the counts below.
  PERFORM pg_advisory_xact_lock(hashtext('email_outbox:' || p_company_id::text));

  SELECT count(*) INTO v_count
  FROM email_outbox o
  WHERE o.company_id = p_company_id
    AND o.created_at > now() - interval '24 hours';
  IF v_count >= c_daily_cap THEN
    RAISE WARNING 'email: daily cap of % reached for company %; % not queued', c_daily_cap, p_company_id, p_dedupe_key;
    RETURN NULL;
  END IF;

  -- Signing-link emails go to an address the caller typed: at most 5
  -- per address per company per 24 h. document_signed /
  -- tm_ticket_submitted only go to company members / the creator.
  IF p_event_type = 'signature_request' THEN
    SELECT count(*) INTO v_count
    FROM email_outbox o
    WHERE o.company_id = p_company_id
      AND o.event_type = 'signature_request'
      AND o.to_email = v_to
      AND o.created_at > now() - interval '24 hours';
    IF v_count >= c_recipient_cap THEN
      RAISE WARNING 'email: % signing emails to this address in 24 h for company %; % not queued', c_recipient_cap, p_company_id, p_dedupe_key;
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO email_outbox (
    company_id, project_id, signature_request_id, event_type, dedupe_key,
    to_email, to_name, reply_to, payload, scheduled_for
  ) VALUES (
    p_company_id, p_project_id, p_signature_request_id, p_event_type, p_dedupe_key,
    v_to, left(NULLIF(btrim(p_to_name), ''), 200), v_reply,
    COALESCE(p_payload, '{}'::jsonb),
    now() + COALESCE(GREATEST(p_delay, interval '0'), interval '0')
  )
  ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL AND (p_delay IS NULL OR p_delay <= interval '0') THEN
    PERFORM email_outbox_dispatch(v_id);
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION enqueue_email(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INTERVAL) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 6. Worker RPCs (EXECUTE: service_role only)
-- ------------------------------------------------------------

-- Ids the worker may claim now, oldest first. Same predicate as
-- claim_email_outbox.
CREATE OR REPLACE FUNCTION email_outbox_due(p_limit INTEGER)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT o.id
  FROM email_outbox o
  WHERE o.attempts < 5
    AND o.scheduled_for <= now()
    AND (o.status IN ('pending', 'failed')
         OR (o.status = 'sending' AND o.locked_at < now() - interval '10 minutes'))
  ORDER BY o.scheduled_for, o.created_at, o.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
$$;

-- Atomic claim: the row as JSONB, or NULL when it is not claimable
-- (unknown id, already sending, sent / dead / cancelled, out of
-- attempts, scheduled later). A concurrent second claim waits for
-- the first and then sees status 'sending' -> NULL.
CREATE OR REPLACE FUNCTION claim_email_outbox(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_row email_outbox%ROWTYPE;
BEGIN
  UPDATE email_outbox o
  SET status = 'sending',
      locked_at = now(),
      attempts = o.attempts + 1,
      updated_at = now()
  WHERE o.id = p_id
    AND o.attempts < 5
    AND o.scheduled_for <= now()
    AND (o.status IN ('pending', 'failed')
         OR (o.status = 'sending' AND o.locked_at < now() - interval '10 minutes'))
  RETURNING o.* INTO v_row;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN to_jsonb(v_row);
END;
$$;

-- Record the outcome of an attempt.
--   sent:      sent_at, provider_message_id (p_error kept as a note,
--              e.g. 'idempotent_replay'); for a signature_request
--              email also stamps signature_requests.sent_at (first) /
--              last_sent_at / send_count + 1 and, for a COR, fills
--              cor_log_entries.date_sent_to_client when empty.
--   failed:    retry with backoff by attempts: 1 -> 1 min, 2 -> 5 min,
--              3 -> 30 min, 4 -> 2 h; the 5th failure becomes 'dead'.
--   dead:      permanent failure (no retry).
--   cancelled: nothing to send any more.
-- A row already 'sent' is never changed (late or duplicate report).
CREATE OR REPLACE FUNCTION mark_email_outbox(
  p_id                  UUID,
  p_status              TEXT,
  p_provider_message_id TEXT DEFAULT NULL,
  p_error               TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_row     email_outbox%ROWTYPE;
  v_req     signature_requests%ROWTYPE;
  v_error   TEXT := left(NULLIF(btrim(p_error), ''), 2000);
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('sent', 'failed', 'dead', 'cancelled') THEN
    RAISE EXCEPTION 'mark_email_outbox: status must be sent, failed, dead or cancelled'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM email_outbox WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_row.status = 'sent' THEN
    RETURN;
  END IF;

  IF p_status = 'sent' THEN
    UPDATE email_outbox
    SET status = 'sent',
        sent_at = now(),
        provider_message_id = left(NULLIF(btrim(p_provider_message_id), ''), 200),
        last_error = v_error,
        locked_at = NULL,
        updated_at = now()
    WHERE id = p_id;

    IF v_row.event_type = 'signature_request' AND v_row.signature_request_id IS NOT NULL THEN
      UPDATE signature_requests
      SET sent_at = COALESCE(sent_at, now()),
          last_sent_at = now(),
          send_count = COALESCE(send_count, 0) + 1
      WHERE id = v_row.signature_request_id
      RETURNING * INTO v_req;

      IF FOUND AND v_req.document_type = 'cor' AND to_regclass('public.cor_log_entries') IS NOT NULL THEN
        BEGIN
          EXECUTE 'UPDATE cor_log_entries SET date_sent_to_client = CURRENT_DATE, updated_at = now()
                   WHERE change_order_id = $1 AND date_sent_to_client IS NULL'
            USING v_req.document_id;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'mark_email_outbox: cor_log_entries not updated: % (%)', SQLERRM, SQLSTATE;
        END;
      END IF;
    END IF;

  ELSIF p_status = 'failed' THEN
    IF v_row.attempts >= 5 THEN
      UPDATE email_outbox
      SET status = 'dead', last_error = v_error, locked_at = NULL, updated_at = now()
      WHERE id = p_id;
    ELSE
      UPDATE email_outbox
      SET status = 'failed',
          last_error = v_error,
          locked_at = NULL,
          scheduled_for = now() + CASE GREATEST(v_row.attempts, 1)
                                    WHEN 1 THEN interval '1 minute'
                                    WHEN 2 THEN interval '5 minutes'
                                    WHEN 3 THEN interval '30 minutes'
                                    ELSE interval '2 hours'
                                  END,
          updated_at = now()
      WHERE id = p_id;
    END IF;

  ELSE -- dead / cancelled
    UPDATE email_outbox
    SET status = p_status, last_error = v_error, locked_at = NULL, updated_at = now()
    WHERE id = p_id;
  END IF;
END;
$$;

-- Everything the worker needs to render one email, read at send time.
--   NULL           -> cancel (row gone; request no longer open or
--                     expired; document / signature / ticket gone)
--   {"defer":true} -> a field ticket younger than 30 minutes has no
--                     workers yet (legacy two-step insert)
--   otherwise      -> {event_type, to_email, to_name, reply_to, brand,
--                      project, document}
CREATE OR REPLACE FUNCTION email_context(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_row      email_outbox%ROWTYPE;
  v_company  JSONB;
  v_branding JSONB;
  v_project  JSONB;
  v_brand    JSONB;
  v_doc      JSONB;
  v_req      signature_requests%ROWTYPE;
  v_sig      signatures%ROWTYPE;
  v_d        JSONB;
  v_label    TEXT;
  v_status   TEXT;
  v_requester TEXT;
  v_ticket_id UUID;
  v_workers  JSONB;
  v_items    INTEGER;
  v_photos   JSONB;
  v_cents    TEXT;
BEGIN
  SELECT * INTO v_row FROM email_outbox WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT to_jsonb(c) INTO v_company FROM companies c WHERE c.id = v_row.company_id;
  IF v_company IS NULL THEN
    RETURN NULL;
  END IF;
  IF to_regclass('public.company_branding') IS NOT NULL THEN
    EXECUTE 'SELECT to_jsonb(b) FROM company_branding b WHERE b.company_id = $1 LIMIT 1'
      INTO v_branding USING v_row.company_id;
  END IF;
  v_branding := COALESCE(v_branding, '{}'::jsonb);

  v_brand := jsonb_build_object(
    'company_name', v_company->>'name',
    'logo_url', COALESCE(NULLIF(v_branding->>'logo_url', ''), NULLIF(v_company->>'logo_url', '')),
    'primary_color', COALESCE(NULLIF(v_branding->>'primary_color', ''), NULLIF(v_company->>'primary_color', '')),
    'hide_fieldsync_branding', COALESCE(v_branding->>'hide_fieldsync_branding', 'false') = 'true'
  );

  SELECT jsonb_build_object('name', to_jsonb(p)->>'name', 'job_number', to_jsonb(p)->>'job_number')
  INTO v_project
  FROM projects p WHERE p.id = v_row.project_id;
  IF v_project IS NULL THEN
    RETURN NULL;
  END IF;

  -- ---- signature_request / document_signed: the request ----------
  IF v_row.event_type IN ('signature_request', 'document_signed') THEN
    IF v_row.event_type = 'document_signed' THEN
      SELECT * INTO v_sig FROM signatures s WHERE s.id = NULLIF(v_row.payload->>'signature_id', '')::uuid;
      IF NOT FOUND THEN
        RETURN NULL;
      END IF;
      SELECT * INTO v_req FROM signature_requests sr WHERE sr.id = v_sig.signature_request_id;
    ELSE
      SELECT * INTO v_req FROM signature_requests sr WHERE sr.id = v_row.signature_request_id;
    END IF;
    IF NOT FOUND OR v_req.company_id IS DISTINCT FROM v_row.company_id THEN
      RETURN NULL;
    END IF;

    IF v_req.document_type = 'cor' THEN
      SELECT to_jsonb(co) INTO v_d FROM change_orders co
      WHERE co.id = v_req.document_id AND co.project_id = v_req.project_id;
      IF v_d IS NULL THEN
        RETURN NULL;
      END IF;
      v_label := 'COR ' || COALESCE(v_d->>'cor_number', '') || ' — ' || COALESCE(v_d->>'title', '');
    ELSIF v_req.document_type = 'tm_ticket' THEN
      SELECT to_jsonb(t) INTO v_d FROM t_and_m_tickets t
      WHERE t.id = v_req.document_id AND t.project_id = v_req.project_id;
      IF v_d IS NULL THEN
        RETURN NULL;
      END IF;
      v_label := 'T&M ticket ' || COALESCE(v_d->>'work_date', '')
                 || COALESCE(' (' || NULLIF(btrim(v_d->>'ce_pco_number'), '') || ')', '');
    ELSE
      RETURN NULL;
    END IF;
    v_status := v_d->>'status';

    IF v_row.event_type = 'signature_request' THEN
      IF v_req.status NOT IN ('pending', 'partially_signed') THEN
        RETURN NULL;
      END IF;
      IF v_req.expires_at IS NOT NULL AND v_req.expires_at <= now() THEN
        RETURN NULL;
      END IF;

      v_requester := COALESCE(
        email_user_contact(email_company_member(v_req.created_by, v_req.company_id))->>'name',
        CASE WHEN v_req.document_type = 'tm_ticket' THEN NULLIF(btrim(v_d->>'created_by_name'), '') END,
        v_company->>'name'
      );

      v_cents := CASE WHEN v_req.document_type = 'cor' THEN v_d->>'cor_total' END;
      v_doc := jsonb_build_object(
        'document_type', v_req.document_type,
        'document_label', v_label,
        'signature_token', v_req.signature_token,
        'expires_at', v_req.expires_at,
        'requested_by_name', v_requester,
        'cor_total_cents', CASE WHEN v_cents ~ '^-?[0-9]+(\.[0-9]+)?$' THEN round(v_cents::numeric)::bigint END
      );
    ELSE
      v_doc := jsonb_build_object(
        'document_type', v_req.document_type,
        'document_label', v_label,
        'signer_name', v_sig.signer_name,
        'signer_title', v_sig.signer_title,
        'signer_company', v_sig.signer_company,
        'signed_at', v_sig.signed_at,
        'document_status', v_status
      );
    END IF;

  -- ---- tm_ticket_submitted -----------------------------------------
  ELSIF v_row.event_type = 'tm_ticket_submitted' THEN
    BEGIN
      v_ticket_id := NULLIF(v_row.payload->>'ticket_id', '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    SELECT to_jsonb(t) INTO v_d FROM t_and_m_tickets t
    WHERE t.id = v_ticket_id AND t.project_id = v_row.project_id;
    IF v_d IS NULL THEN
      RETURN NULL;
    END IF;

    -- Entry order: created_at, then physical order (create_tm_ticket_full
    -- and the office edit insert a whole crew in one statement, so the
    -- rows share created_at and land in array order).
    SELECT COALESCE(jsonb_agg(
             jsonb_build_object(
               'name', to_jsonb(w)->'name',
               'role', to_jsonb(w)->'role',
               'hours', COALESCE(to_jsonb(w)->'hours', '0'::jsonb),
               'overtime_hours', COALESCE(to_jsonb(w)->'overtime_hours', '0'::jsonb)
             )
             ORDER BY to_jsonb(w)->>'created_at', w.ctid),
           '[]'::jsonb)
    INTO v_workers
    FROM t_and_m_workers w WHERE w.ticket_id = v_ticket_id;

    IF jsonb_array_length(v_workers) = 0
       AND COALESCE((v_d->>'created_at')::timestamptz, now()) > now() - interval '30 minutes' THEN
      RETURN jsonb_build_object('defer', true);
    END IF;

    SELECT count(*) INTO v_items FROM t_and_m_items i WHERE i.ticket_id = v_ticket_id;
    v_photos := v_d->'photos';

    v_doc := jsonb_build_object(
      'ticket_id', v_ticket_id,
      'work_date', v_d->'work_date',
      'ce_pco_number', v_d->'ce_pco_number',
      'notes', v_d->'notes',
      'created_by_name', v_d->'created_by_name',
      'workers', v_workers,
      'item_count', v_items,
      'photo_count', CASE WHEN jsonb_typeof(v_photos) = 'array' THEN jsonb_array_length(v_photos) ELSE 0 END
    );
  ELSE
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'event_type', v_row.event_type,
    'to_email', v_row.to_email,
    'to_name', v_row.to_name,
    'reply_to', v_row.reply_to,
    'brand', v_brand,
    'project', v_project,
    'document', v_doc
  );
END;
$$;

REVOKE ALL ON FUNCTION email_outbox_due(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_email_outbox(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION mark_email_outbox(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION email_context(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION email_outbox_due(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION claim_email_outbox(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION mark_email_outbox(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION email_context(UUID) TO service_role;

-- ------------------------------------------------------------
-- 7. Triggers. Each function body is wrapped: any exception becomes
--    a WARNING and the business row is returned unchanged.
-- ------------------------------------------------------------

-- 7a. Signing link emailed (insert with a recipient, or a resend bump)
CREATE OR REPLACE FUNCTION email_on_signature_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_project_company UUID;
  v_reply JSONB;
  v_epoch TEXT;
BEGIN
  BEGIN
    IF NEW.recipient_email IS NULL THEN
      RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.resend_requested_at IS NOT DISTINCT FROM OLD.resend_requested_at THEN
      RETURN NEW;
    END IF;
    IF NEW.status NOT IN ('pending', 'partially_signed') THEN
      RETURN NEW;
    END IF;

    -- Tenant consistency: project belongs to the request's company and
    -- the document to the project (an authenticated member writes this
    -- table directly through "Company users manage signature requests").
    SELECT p.company_id INTO v_project_company FROM projects p WHERE p.id = NEW.project_id;
    IF v_project_company IS NULL OR v_project_company IS DISTINCT FROM NEW.company_id THEN
      RAISE WARNING 'email: signature request % not queued (project / company mismatch)', NEW.id;
      RETURN NEW;
    END IF;
    IF NOT (
      (NEW.document_type = 'cor' AND EXISTS (
         SELECT 1 FROM change_orders co
         WHERE co.id = NEW.document_id AND co.project_id = NEW.project_id AND co.company_id = NEW.company_id))
      OR (NEW.document_type = 'tm_ticket' AND EXISTS (
         SELECT 1 FROM t_and_m_tickets t
         WHERE t.id = NEW.document_id AND t.project_id = NEW.project_id))
    ) THEN
      RAISE WARNING 'email: signature request % not queued (document not in project)', NEW.id;
      RETURN NEW;
    END IF;

    v_reply := COALESCE(email_user_contact(email_company_member(NEW.created_by, NEW.company_id)),
                        email_user_contact(email_company_owner(NEW.company_id)));
    v_epoch := COALESCE(floor(extract(epoch FROM NEW.resend_requested_at))::bigint::text, '0');

    PERFORM enqueue_email(
      NEW.company_id, NEW.project_id, NEW.id, 'signature_request',
      'sigreq:' || NEW.id::text || ':' || v_epoch,
      NEW.recipient_email, NEW.recipient_name, v_reply->>'email',
      jsonb_build_object('signature_request_id', NEW.id,
                         'document_type', NEW.document_type,
                         'document_id', NEW.document_id),
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'email_on_signature_request(%): % (%)', NEW.id, SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION email_on_signature_request() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_email_signature_request ON signature_requests;
CREATE TRIGGER trg_email_signature_request
  AFTER INSERT OR UPDATE OF resend_requested_at ON signature_requests
  FOR EACH ROW EXECUTE FUNCTION email_on_signature_request();

-- 7b. Document signed -> office (type 'signature' + creator / owner)
CREATE OR REPLACE FUNCTION email_on_document_signed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_req signature_requests%ROWTYPE;
  v_project_company UUID;
  v_extra JSONB;
  r RECORD;
BEGIN
  BEGIN
    SELECT * INTO v_req FROM signature_requests WHERE id = NEW.signature_request_id;
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    SELECT p.company_id INTO v_project_company FROM projects p WHERE p.id = v_req.project_id;
    IF v_project_company IS NULL OR v_project_company IS DISTINCT FROM v_req.company_id THEN
      RAISE WARNING 'email: signature % not announced (project / company mismatch)', NEW.id;
      RETURN NEW;
    END IF;
    IF NOT (
      (v_req.document_type = 'cor' AND EXISTS (
         SELECT 1 FROM change_orders co
         WHERE co.id = v_req.document_id AND co.project_id = v_req.project_id AND co.company_id = v_req.company_id))
      OR (v_req.document_type = 'tm_ticket' AND EXISTS (
         SELECT 1 FROM t_and_m_tickets t
         WHERE t.id = v_req.document_id AND t.project_id = v_req.project_id))
    ) THEN
      RAISE WARNING 'email: signature % not announced (document not in project)', NEW.id;
      RETURN NEW;
    END IF;

    -- creator, or the company owner for a field-created request
    v_extra := COALESCE(email_user_contact(email_company_member(v_req.created_by, v_req.company_id)),
                        email_user_contact(email_company_owner(v_req.company_id)));

    FOR r IN
      SELECT x.email, max(x.name) AS name
      FROM (
        SELECT e.email, e.name FROM email_recipients_for_event(v_req.project_id, 'signature') e
        UNION ALL
        SELECT v_extra->>'email', v_extra->>'name' WHERE v_extra->>'email' IS NOT NULL
      ) x
      GROUP BY x.email
      ORDER BY x.email
    LOOP
      PERFORM enqueue_email(
        v_req.company_id, v_req.project_id, v_req.id, 'document_signed',
        'signed:' || NEW.id::text || ':' || r.email,
        r.email, r.name, NULL,
        jsonb_build_object('signature_id', NEW.id, 'signature_request_id', v_req.id),
        NULL
      );
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'email_on_document_signed(%): % (%)', NEW.id, SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION email_on_document_signed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_email_document_signed ON signatures;
CREATE TRIGGER trg_email_document_signed
  AFTER INSERT ON signatures
  FOR EACH ROW EXECUTE FUNCTION email_on_document_signed();

-- 7c. Field ticket submitted -> office (type 'tm_ticket'), 3 min later
--     Only inserts without a logged-in user (field PIN session as anon,
--     incl. create_tm_ticket_full -- SECURITY INVOKER -- and offline
--     replay). Office-created tickets send nothing.
CREATE OR REPLACE FUNCTION email_on_tm_ticket_submitted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_company UUID;
  r RECORD;
BEGIN
  BEGIN
    IF auth.uid() IS NOT NULL THEN
      RETURN NEW;
    END IF;
    IF NEW.status NOT IN ('pending', 'foreman_signed') THEN
      RETURN NEW;
    END IF;

    SELECT p.company_id INTO v_company FROM projects p WHERE p.id = NEW.project_id;
    IF v_company IS NULL THEN
      RETURN NEW;
    END IF;

    FOR r IN SELECT e.email, e.name FROM email_recipients_for_event(NEW.project_id, 'tm_ticket') e LOOP
      PERFORM enqueue_email(
        v_company, NEW.project_id, NULL, 'tm_ticket_submitted',
        'tm_submitted:' || NEW.id::text || ':' || r.email,
        r.email, r.name, NULL,
        jsonb_build_object('ticket_id', NEW.id),
        interval '3 minutes'
      );
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'email_on_tm_ticket_submitted(%): % (%)', NEW.id, SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION email_on_tm_ticket_submitted() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.t_and_m_tickets') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 't_and_m_tickets' AND column_name = 'status')
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 't_and_m_tickets' AND column_name = 'project_id') THEN
    RAISE NOTICE 't_and_m_tickets (status, project_id) not found: trg_email_tm_ticket_submitted not created';
    RETURN;
  END IF;
  EXECUTE 'DROP TRIGGER IF EXISTS trg_email_tm_ticket_submitted ON t_and_m_tickets';
  EXECUTE $T$
    CREATE TRIGGER trg_email_tm_ticket_submitted
      AFTER INSERT ON t_and_m_tickets
      FOR EACH ROW
      WHEN (NEW.status IN ('pending', 'foreman_signed'))
      EXECUTE FUNCTION email_on_tm_ticket_submitted()
  $T$;
END $$;

-- ------------------------------------------------------------
-- 8. Sweep (every minute via pg_cron)
--    Retires rows that died on their last attempt, then wakes the
--    worker with {"drain": true} when anything is due. Returns the
--    number of due rows it saw (at most 100).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION email_outbox_sweep()
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_due INTEGER;
BEGIN
  UPDATE email_outbox
  SET status = 'dead',
      last_error = COALESCE(last_error || ' / ', '') || 'worker did not report the last attempt',
      locked_at = NULL,
      updated_at = now()
  WHERE status IN ('sending', 'failed', 'pending')
    AND attempts >= 5
    AND (status <> 'sending' OR locked_at < now() - interval '10 minutes');

  SELECT count(*) INTO v_due FROM email_outbox_due(100);
  IF v_due > 0 THEN
    PERFORM email_worker_post(jsonb_build_object('drain', true));
  END IF;
  RETURN v_due;
END;
$$;

REVOKE ALL ON FUNCTION email_outbox_sweep() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regnamespace('cron') IS NULL
     OR to_regclass('cron.job') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'cron' AND p.proname = 'schedule') THEN
    RAISE NOTICE 'pg_cron is not available: cron job email_outbox_sweep not scheduled (re-run this file after enabling pg_cron)';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email_outbox_sweep') THEN
    PERFORM cron.unschedule('email_outbox_sweep');
  END IF;
  PERFORM cron.schedule('email_outbox_sweep', '* * * * *', 'SELECT public.email_outbox_sweep()');
  RAISE NOTICE 'cron job email_outbox_sweep scheduled (every minute)';
END $$;

COMMIT;

-- Verify manually:
--   SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'email_outbox_sweep';
--   SELECT name FROM vault.decrypted_secrets WHERE name IN ('email_worker_url', 'email_worker_secret');
--   SELECT status, count(*) FROM email_outbox GROUP BY 1;
-- Then run supabase/tests/email_outbox_tests.sql (rolls back).
