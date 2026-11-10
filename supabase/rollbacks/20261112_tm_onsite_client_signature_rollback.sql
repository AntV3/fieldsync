-- ============================================================
-- ROLLBACK: 20261112_tm_onsite_client_signature.sql
-- ============================================================
-- Removes the function. The app then goes back to writing an on-site
-- client signature straight onto the ticket (no office email, device
-- time), which is how it worked before. Signatures already recorded
-- are kept.
-- ============================================================

BEGIN;
DROP FUNCTION IF EXISTS public.record_tm_client_signature(UUID, JSONB);
COMMIT;
