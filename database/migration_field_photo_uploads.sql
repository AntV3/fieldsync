-- Migration: Field User Photo Upload Access
-- Date: 2025-01-07
--
-- PROBLEM: Field users (foremen) authenticate via project PIN, not Supabase Auth.
-- This means they use the 'anon' role, not 'authenticated'.
-- The existing tm-photos storage policies only allow 'authenticated' role to upload,
-- so foremen cannot upload photos from the field.
--
-- SOLUTION: Add storage RLS policies for 'anon' role with project-based validation.
-- Photos are stored at path: companyId/projectId/ticketId/filename
-- We validate that the project exists to prevent arbitrary uploads.
--
-- IMPORTANT: Run this in the Supabase SQL Editor

-- ============================================================================
-- POLICY 1: Allow field users (anon) to upload photos
-- Validates that the path contains a valid project ID
-- ============================================================================
CREATE POLICY "Field users can upload tm-photos"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'tm-photos'
  -- Path format: companyId/projectId/ticketId/filename
  -- Extract project_id from path (second segment) and verify it exists
  AND EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id::text = (string_to_array(name, '/'))[2]
  )
);

-- ============================================================================
-- POLICY 2: Allow field users (anon) to update photos they uploaded
-- Same project validation as upload
-- ============================================================================
CREATE POLICY "Field users can update tm-photos"
ON storage.objects
FOR UPDATE
TO anon
USING (
  bucket_id = 'tm-photos'
  AND EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id::text = (string_to_array(name, '/'))[2]
  )
)
WITH CHECK (
  bucket_id = 'tm-photos'
  AND EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id::text = (string_to_array(name, '/'))[2]
  )
);

-- ============================================================================
-- POLICY 3: Allow field users (anon) to delete photos
-- Same project validation
-- ============================================================================
CREATE POLICY "Field users can delete tm-photos"
ON storage.objects
FOR DELETE
TO anon
USING (
  bucket_id = 'tm-photos'
  AND EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id::text = (string_to_array(name, '/'))[2]
  )
);

-- ============================================================================
-- VERIFICATION QUERIES
-- Run these after the migration to verify policies are in place
-- ============================================================================

-- Check all policies on storage.objects for tm-photos bucket
-- SELECT policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'objects'
-- AND schemaname = 'storage';

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================
-- DROP POLICY IF EXISTS "Field users can upload tm-photos" ON storage.objects;
-- DROP POLICY IF EXISTS "Field users can update tm-photos" ON storage.objects;
-- DROP POLICY IF EXISTS "Field users can delete tm-photos" ON storage.objects;

-- ============================================================================
-- TESTING
-- ============================================================================
-- 1. Open the app as a foreman (Company Code + Project PIN)
-- 2. Create a T&M ticket
-- 3. Add photos
-- 4. Submit - photos should upload without 406/403 errors
-- 5. Verify photos appear in ticket details

