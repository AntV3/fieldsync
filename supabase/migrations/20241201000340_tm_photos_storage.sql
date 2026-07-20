-- Migration: T&M Photos Storage Bucket RLS Policies
-- Fixes "new row violates row level security policy" error for photo uploads
--
-- IMPORTANT: Run this in the Supabase SQL Editor
--
-- This creates the required policies for authenticated users to:
-- 1. Upload photos to the tm-photos bucket
-- 2. Read photos from the tm-photos bucket
-- 3. Delete their own photos

-- First, ensure the bucket exists and is configured correctly
-- (Run this in Storage settings if bucket doesn't exist)
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('tm-photos', 'tm-photos', true)
-- ON CONFLICT (id) DO UPDATE SET public = true;

-- Policy 1: Allow authenticated users to INSERT (upload) photos
-- Path format: companyId/projectId/ticketId/filename
CREATE POLICY "Authenticated users can upload tm-photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tm-photos'
);

-- Policy 2: Allow public read access to photos (for display in office view)
CREATE POLICY "Public read access for tm-photos"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'tm-photos'
);

-- Policy 3: Allow authenticated users to update their uploads
CREATE POLICY "Authenticated users can update tm-photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'tm-photos'
)
WITH CHECK (
  bucket_id = 'tm-photos'
);

-- Policy 4: Allow authenticated users to delete photos
CREATE POLICY "Authenticated users can delete tm-photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'tm-photos'
);

-- ALTERNATIVE: If the above policies conflict with existing ones,
-- you may need to drop and recreate. Run these ONLY if you get
-- "policy already exists" errors:
--
-- DROP POLICY IF EXISTS "Authenticated users can upload tm-photos" ON storage.objects;
-- DROP POLICY IF EXISTS "Public read access for tm-photos" ON storage.objects;
-- DROP POLICY IF EXISTS "Authenticated users can update tm-photos" ON storage.objects;
-- DROP POLICY IF EXISTS "Authenticated users can delete tm-photos" ON storage.objects;
--
-- Then re-run the CREATE POLICY statements above.

-- VERIFICATION: After running, test by uploading a photo in the T&M form.
-- The 406 error should no longer appear.
