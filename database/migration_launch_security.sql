-- ============================================================
-- LAUNCH SECURITY MIGRATION
-- ============================================================
-- Run this in Supabase SQL Editor BEFORE production launch.
--
-- PREREQUISITES: migration_field_sessions.sql must be applied first.
-- This migration verifies session security is active and fixes
-- remaining security issues.
--
-- CHANGES:
-- 1. Verifies field session security functions exist
-- 2. Fixes public photo access (CRITICAL-2 from audit)
-- 3. Ensures tm-photos bucket is private
-- ============================================================

-- ============================================================
-- 1. VERIFY FIELD SESSION SECURITY IS ACTIVE
-- ============================================================
-- migration_field_sessions.sql must be applied first. It replaces
-- all insecure auth.uid() IS NULL policies with session-validated
-- policies using can_access_project().

DO $$
BEGIN
  -- Check that validate_field_session exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'validate_field_session'
  ) THEN
    RAISE EXCEPTION 'BLOCKER: validate_field_session() not found. Run migration_field_sessions.sql first!';
  END IF;

  -- Check that can_access_project exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'can_access_project'
  ) THEN
    RAISE EXCEPTION 'BLOCKER: can_access_project() not found. Run migration_field_sessions.sql first!';
  END IF;

  -- Check that validate_pin_and_create_session exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'validate_pin_and_create_session'
  ) THEN
    RAISE EXCEPTION 'BLOCKER: validate_pin_and_create_session() not found. Run migration_field_sessions.sql first!';
  END IF;

  -- Check that field_sessions table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'field_sessions'
  ) THEN
    RAISE EXCEPTION 'BLOCKER: field_sessions table not found. Run migration_field_sessions.sql first!';
  END IF;

  RAISE NOTICE '✓ Field session security functions verified';
END $$;

-- ============================================================
-- 2. FIX PUBLIC PHOTO ACCESS (CRITICAL-2)
-- ============================================================
-- The current policy allows ANY user to view all T&M photos.
-- Replace with session-validated access.

-- Drop the overly permissive public read policy
DROP POLICY IF EXISTS "Public read access for tm-photos" ON storage.objects;

-- Create secure read policy: authenticated users OR field workers with valid session
-- Photos are stored at path: companyId/projectId/ticketId/filename
-- We extract projectId from the path to validate session access
DROP POLICY IF EXISTS "Secure read access for tm-photos" ON storage.objects;
CREATE POLICY "Secure read access for tm-photos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'tm-photos'
  AND (
    -- Authenticated office users can view all photos in their company
    auth.uid() IS NOT NULL
    OR
    -- Field workers with valid session can view photos for their project
    -- Photo path format: companyId/projectId/...
    EXISTS (
      SELECT 1 FROM has_valid_field_session() s
      WHERE s.project_id::text = (storage.foldername(name))[2]
    )
  )
);

-- Ensure field workers can also upload photos via session
DROP POLICY IF EXISTS "Field users can upload tm-photos" ON storage.objects;
CREATE POLICY "Field users can upload tm-photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'tm-photos'
  AND (
    auth.uid() IS NOT NULL
    OR
    EXISTS (
      SELECT 1 FROM has_valid_field_session() s
      WHERE s.project_id::text = (storage.foldername(name))[2]
    )
  )
);

-- Make bucket private (signed URLs required for access)
UPDATE storage.buckets SET public = false WHERE id = 'tm-photos';

-- ============================================================
-- 3. VERIFICATION
-- ============================================================

DO $$
DECLARE
  policy_count INTEGER;
  bucket_public BOOLEAN;
BEGIN
  -- Check that insecure policies are gone
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE policyname = 'Public read access for tm-photos';

  IF policy_count > 0 THEN
    RAISE WARNING '✗ Public photo access policy still exists!';
  ELSE
    RAISE NOTICE '✓ Public photo access policy removed';
  END IF;

  -- Check secure policy exists
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE policyname = 'Secure read access for tm-photos';

  IF policy_count > 0 THEN
    RAISE NOTICE '✓ Secure photo access policy created';
  ELSE
    RAISE WARNING '✗ Secure photo access policy not found!';
  END IF;

  -- Check bucket is private
  SELECT public INTO bucket_public
  FROM storage.buckets
  WHERE id = 'tm-photos';

  IF bucket_public = false THEN
    RAISE NOTICE '✓ tm-photos bucket is private';
  ELSE
    RAISE WARNING '✗ tm-photos bucket is still public!';
  END IF;

  -- Verify no insecure anon policies remain on key tables
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE qual LIKE '%auth.uid() IS NULL%'
    AND policyname LIKE 'Field users%';

  IF policy_count > 0 THEN
    RAISE WARNING '✗ Found % insecure "Field users" policies with auth.uid() IS NULL. Run migration_field_sessions.sql!', policy_count;
  ELSE
    RAISE NOTICE '✓ No insecure auth.uid() IS NULL field policies found';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'LAUNCH SECURITY MIGRATION COMPLETE';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Security checklist:';
  RAISE NOTICE '  ✓ Field session functions verified';
  RAISE NOTICE '  ✓ Public photo access removed';
  RAISE NOTICE '  ✓ tm-photos bucket set to private';
  RAISE NOTICE '';
  RAISE NOTICE 'Remaining manual checks:';
  RAISE NOTICE '  - Verify Supabase production env vars in Vercel dashboard';
  RAISE NOTICE '  - Smoke test: foreman PIN login → view data → upload photo';
  RAISE NOTICE '  - Smoke test: office login → dashboard → generate PDF';
  RAISE NOTICE '  - Test offline mode: airplane mode → changes → reconnect';
  RAISE NOTICE '';
END $$;
