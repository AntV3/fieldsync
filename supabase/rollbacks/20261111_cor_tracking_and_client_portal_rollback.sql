-- ============================================================
-- ROLLBACK: 20261111_cor_tracking_and_client_portal.sql
-- ============================================================
-- Removes the trigger and the functions. After this the app has no
-- void, no client "request changes" and no client portal; everything
-- that existed before the migration works as it did.
--
-- The two tables and the nine change_orders columns are KEPT by
-- default, so comments, portal grants, sent dates and void reasons
-- are not lost if the migration is re-applied. Uncomment the last
-- block to drop them as well (this deletes that data).
-- ============================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_stamp_cor_sent_to_client ON signature_requests;

DROP FUNCTION IF EXISTS public.public_client_portal_open_cor(TEXT, UUID);
DROP FUNCTION IF EXISTS public.public_client_portal(TEXT);
DROP FUNCTION IF EXISTS public.client_portal_access_for_token(TEXT);
DROP FUNCTION IF EXISTS public.revoke_client_portal_access(UUID);
DROP FUNCTION IF EXISTS public.grant_client_portal_access(UUID, TEXT, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.add_cor_comment(UUID, TEXT);
DROP FUNCTION IF EXISTS public.public_get_cor_comments(TEXT);
DROP FUNCTION IF EXISTS public.public_request_cor_changes(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.cor_request_for_token(TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.void_change_order(UUID, TEXT);
DROP FUNCTION IF EXISTS public.stamp_cor_sent_to_client();

-- DROP TABLE IF EXISTS client_portal_access;
-- DROP TABLE IF EXISTS cor_client_comments;
-- ALTER TABLE change_orders
--   DROP COLUMN IF EXISTS sent_to_client_at,
--   DROP COLUMN IF EXISTS sent_to_client_by,
--   DROP COLUMN IF EXISTS returned_by_client_at,
--   DROP COLUMN IF EXISTS voided_at,
--   DROP COLUMN IF EXISTS voided_by,
--   DROP COLUMN IF EXISTS void_reason;
-- (rejected_at, billed_at and closed_at are written by the app and are left in place.)

COMMIT;
