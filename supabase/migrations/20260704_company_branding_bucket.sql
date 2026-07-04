-- ============================================================
-- Create company-branding storage bucket
-- ============================================================
-- BrandingContext.uploadBrandingImage() writes logos, favicons, and
-- login backgrounds to storage. Before this migration the code targeted
-- the historically-shipped `public` bucket, which does not exist on
-- Supabase projects created from a modern template — every branding
-- upload failed with "Bucket not found" and the UI silently retained
-- the previous branding.
--
-- This migration creates a dedicated `company-branding` bucket, marks
-- it public so getPublicUrl() returns a working URL, and adds RLS
-- policies so:
--   * anyone can read (branding is publicly visible on the landing
--     page and email footers by design)
--   * only authenticated office users can write to a path scoped to
--     their own company (`<company_id>/...`), preventing an authed
--     user from overwriting another company's logo.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-branding',
  'company-branding',
  true,
  5 * 1024 * 1024, -- 5 MB per branding asset is generous
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read: branding assets are shown pre-login (landing page,
-- custom-domain login screens) so read must be open.
DROP POLICY IF EXISTS "Public read for company-branding" ON storage.objects;
CREATE POLICY "Public read for company-branding"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'company-branding');

-- Write access: authenticated users can only touch files under
-- `branding/<their_company_id>/...`. The BrandingContext code stores
-- files as `branding/<company_id>/<type>-<timestamp>.<ext>`; the path
-- prefix check keeps one company from overwriting another.
DROP POLICY IF EXISTS "Company members can upload own branding" ON storage.objects;
CREATE POLICY "Company members can upload own branding"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-branding'
  AND (storage.foldername(name))[1] = 'branding'
  AND (storage.foldername(name))[2] = (
    SELECT company_id::text FROM company_members WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Company members can update own branding" ON storage.objects;
CREATE POLICY "Company members can update own branding"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-branding'
  AND (storage.foldername(name))[1] = 'branding'
  AND (storage.foldername(name))[2] = (
    SELECT company_id::text FROM company_members WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Company members can delete own branding" ON storage.objects;
CREATE POLICY "Company members can delete own branding"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-branding'
  AND (storage.foldername(name))[1] = 'branding'
  AND (storage.foldername(name))[2] = (
    SELECT company_id::text FROM company_members WHERE user_id = auth.uid()
  )
);

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'company-branding bucket created';
  RAISE NOTICE 'Read: public. Write: authenticated users, scoped to their';
  RAISE NOTICE 'own branding/<company_id>/ prefix.';
  RAISE NOTICE '============================================================';
END $$;
