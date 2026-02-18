-- ============================================================
-- CRITICAL SECURITY FIX: Restrict tm-photos bucket read access
-- ============================================================
-- The previous policy:
--   CREATE POLICY "Public read access for tm-photos"
--   ON storage.objects FOR SELECT TO public
--   USING (bucket_id = 'tm-photos');
--
-- ...allowed ANYONE on the internet to read all project photos,
-- including injury documentation, damage evidence, and before/after
-- site conditions that are routinely used in legal disputes.
--
-- New policy: only authenticated users (office staff) or field
-- workers with a valid PIN-issued session can read photos.
-- ============================================================

-- Drop the open public policy
DROP POLICY IF EXISTS "Public read access for tm-photos" ON storage.objects;

-- Replace with authenticated + valid field session access
CREATE POLICY "Authenticated or field session can read tm-photos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'tm-photos'
  AND (
    -- Office staff logged in via Supabase Auth
    auth.uid() IS NOT NULL
    OR
    -- Field workers with a valid PIN-issued session
    EXISTS (SELECT 1 FROM has_valid_field_session())
  )
);

-- Also ensure the bucket itself is marked private (not public)
-- This prevents direct URL access bypassing RLS entirely.
-- NOTE: This must also be confirmed in the Supabase dashboard:
--   Storage > tm-photos > Edit bucket > uncheck "Public bucket"
UPDATE storage.buckets
SET public = false
WHERE id = 'tm-photos';

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'CRITICAL-2 FIX APPLIED: tm-photos bucket is no longer public';
  RAISE NOTICE 'Read access requires: authenticated user OR valid field session';
  RAISE NOTICE 'ACTION REQUIRED: Also uncheck "Public bucket" in Supabase dashboard';
  RAISE NOTICE '   Storage > tm-photos > Edit bucket > uncheck Public';
  RAISE NOTICE '============================================================';
END $$;
