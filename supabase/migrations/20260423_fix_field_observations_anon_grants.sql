-- ============================================================
-- FIX: Field observations not visible on the field (foreman) side
--
-- SYMPTOM:
--   Foremen on the field app see "No observations yet" under
--   Field Observations even when rows exist in the table, and
--   newly saved observations do not appear on the field side
--   (the office side works fine).
--
-- ROOT CAUSE:
--   The original 20260416_field_observations.sql migration
--   enabled RLS with can_access_project() -- which correctly
--   recognises both authenticated office users and PIN-based
--   field sessions -- but forgot the table-level GRANTs to the
--   anon role. Field users connect with the anon JWT plus an
--   x-field-session header; without SELECT/INSERT/UPDATE/DELETE
--   granted to anon, PostgreSQL blocks access at the privilege
--   layer before RLS is ever consulted. Every peer table
--   (disposal_loads, daily_reports, t_and_m_tickets,
--   punch_list_items) has the equivalent grant -- this one was
--   simply missed.
--
-- FIX:
--   Grant the same privileges on field_observations to the anon
--   role that the comparable tables already have. RLS continues
--   to gate which rows each caller can see.
--
-- IDEMPOTENT -- safe to re-run.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON field_observations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON field_observations TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'field_observations: granted anon/authenticated CRUD (RLS still enforced)';
END $$;
