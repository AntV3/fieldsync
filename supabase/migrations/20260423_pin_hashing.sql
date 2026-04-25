-- ============================================================
-- SEC-C2: Hash project PINs with bcrypt
--
-- BEFORE:
--   `projects.pin` was stored as plaintext TEXT. The
--   validate_pin_and_create_session RPC compared with TRIM(p.pin).
--   A DB read (backup theft, elevated access) exposed every PIN.
--
-- AFTER:
--   `projects.pin_hash` stores a bcrypt hash (cost 10). A BEFORE
--   INSERT/UPDATE trigger keeps it in sync with any write to
--   `projects.pin`, so existing client code that still writes the
--   plaintext column keeps working without change. The auth RPC
--   now compares against pin_hash via pgcrypto's crypt().
--
-- RESIDUAL RISK:
--   Plaintext `pin` column is retained in this migration for the
--   unique-per-company index and for office-UI display. Follow-up
--   migration should move uniqueness to a deterministic fingerprint
--   and drop the plaintext column. Tracked in LAUNCH_READINESS_2026-
--   04-23.md as SEC-C2 PARTIAL.
--
-- IDEMPOTENT — safe to re-run.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Add pin_hash column.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pin_hash TEXT;

-- 2. Keep pin_hash in sync with any write to pin. Trigger runs
--    BEFORE INSERT and BEFORE UPDATE OF pin so we hash at most
--    once per write.
CREATE OR REPLACE FUNCTION sync_project_pin_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
-- `extensions` is required so crypt()/gen_salt() from pgcrypto resolve
-- under the hardened search_path set by 20260423_harden_definer_search_path.
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NEW.pin IS NULL THEN
    NEW.pin_hash := NULL;
  ELSE
    NEW.pin_hash := crypt(TRIM(NEW.pin), gen_salt('bf', 10));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_project_pin_hash ON projects;
CREATE TRIGGER trg_sync_project_pin_hash
  BEFORE INSERT OR UPDATE OF pin ON projects
  FOR EACH ROW
  EXECUTE FUNCTION sync_project_pin_hash();

-- 3. Backfill existing rows that have a plaintext pin but no hash.
UPDATE projects
SET pin_hash = crypt(TRIM(pin), gen_salt('bf', 10))
WHERE pin IS NOT NULL
  AND (pin_hash IS NULL OR pin_hash = '');

-- 4. Rewrite validate_pin_and_create_session to compare against
--    pin_hash via crypt(). Identity and signature stay the same so
--    the anon GRANT / client call site don't change.
DROP FUNCTION IF EXISTS validate_pin_and_create_session(TEXT, TEXT, TEXT, TEXT);

CREATE FUNCTION validate_pin_and_create_session(
  p_pin          TEXT,
  p_company_code TEXT,
  p_device_id    TEXT DEFAULT NULL,
  p_ip_address   TEXT DEFAULT NULL
) RETURNS TABLE (
  success       BOOLEAN,
  session_token TEXT,
  project_id    UUID,
  project_name  TEXT,
  company_id    UUID,
  company_name  TEXT,
  error_code    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
-- `extensions` is required so crypt()/gen_random_bytes() from pgcrypto
-- resolve under the hardened search_path set by
-- 20260423_harden_definer_search_path.
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  is_rate_limited BOOLEAN;
  found_project   RECORD;
  found_company   RECORD;
  new_token       TEXT;
  clean_pin       TEXT;
  clean_code      TEXT;
BEGIN
  clean_pin  := TRIM(p_pin);
  clean_code := UPPER(TRIM(p_company_code));

  is_rate_limited := NOT check_rate_limit(p_ip_address, p_device_id, 15, 5);

  IF is_rate_limited THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_rate_limited');
    RETURN QUERY SELECT
      false       AS success,
      NULL::TEXT  AS session_token,
      NULL::UUID  AS project_id,
      NULL::TEXT  AS project_name,
      NULL::UUID  AS company_id,
      NULL::TEXT  AS company_name,
      'RATE_LIMITED'::TEXT AS error_code;
    RETURN;
  END IF;

  SELECT c.* INTO found_company
  FROM companies c
  WHERE UPPER(c.code) = clean_code;

  IF found_company IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid_company');
    RETURN QUERY SELECT
      false       AS success,
      NULL::TEXT  AS session_token,
      NULL::UUID  AS project_id,
      NULL::TEXT  AS project_name,
      NULL::UUID  AS company_id,
      NULL::TEXT  AS company_name,
      'INVALID_COMPANY'::TEXT AS error_code;
    RETURN;
  END IF;

  -- Match on pin_hash via bcrypt. Fall through to plaintext match
  -- only for rows that haven't been backfilled yet (defensive; the
  -- backfill step above should have covered every row).
  SELECT p.* INTO found_project
  FROM projects p
  WHERE p.company_id = found_company.id
    AND p.status = 'active'
    AND (
      (p.pin_hash IS NOT NULL AND crypt(clean_pin, p.pin_hash) = p.pin_hash)
      OR (p.pin_hash IS NULL AND p.pin IS NOT NULL AND TRIM(p.pin) = clean_pin)
    );

  IF found_project IS NULL THEN
    PERFORM log_auth_attempt(p_ip_address, p_device_id, FALSE, 'pin_invalid');
    RETURN QUERY SELECT
      false       AS success,
      NULL::TEXT  AS session_token,
      NULL::UUID  AS project_id,
      NULL::TEXT  AS project_name,
      NULL::UUID  AS company_id,
      NULL::TEXT  AS company_name,
      'INVALID_PIN'::TEXT AS error_code;
    RETURN;
  END IF;

  new_token := encode(gen_random_bytes(32), 'hex');

  IF p_device_id IS NOT NULL THEN
    DELETE FROM field_sessions fs
    WHERE fs.device_id  = p_device_id
      AND fs.project_id = found_project.id;
  END IF;

  INSERT INTO field_sessions (project_id, company_id, session_token, device_id)
  VALUES (found_project.id, found_company.id, new_token, p_device_id);

  PERFORM log_auth_attempt(p_ip_address, p_device_id, TRUE, 'pin');

  RETURN QUERY SELECT
    true               AS success,
    new_token          AS session_token,
    found_project.id   AS project_id,
    found_project.name AS project_name,
    found_company.id   AS company_id,
    found_company.name AS company_name,
    NULL::TEXT          AS error_code;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_pin_and_create_session(TEXT, TEXT, TEXT, TEXT) TO anon;

COMMENT ON COLUMN projects.pin_hash IS
  'bcrypt hash of projects.pin. Populated by trg_sync_project_pin_hash. The auth RPC compares against this column; plaintext pin is retained only for the unique-per-company index and office UI display.';
