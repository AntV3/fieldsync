-- ============================================================
-- SEC-H2: Server-side MIME and size limits on storage buckets
--
-- Previously the upload policies gated on path/session but did
-- no MIME-type or file-size validation. Client-supplied
-- `file.type` is not trustworthy. Supabase Storage can enforce
-- per-bucket MIME whitelists and size caps natively via
-- `storage.buckets.allowed_mime_types` and `file_size_limit` —
-- apply them here.
--
-- BUCKETS:
--   tm-photos          — field photos (images only, 15 MB cap)
--   project-documents  — office docs (common office + image
--                        types, 25 MB cap; covers PDFs + photos)
--
-- IDEMPOTENT — safe to re-run.
-- ============================================================

-- tm-photos: images only.
UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/gif'
  ]::text[],
  file_size_limit   = 15 * 1024 * 1024,  -- 15 MB
  public             = false
WHERE id = 'tm-photos';

-- project-documents: docs + images.
UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    -- Images (for photos attached to documents)
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/gif',
    -- PDFs
    'application/pdf',
    -- Office
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    -- Plain text / CSV
    'text/plain',
    'text/csv'
  ]::text[],
  file_size_limit   = 25 * 1024 * 1024,  -- 25 MB
  public             = false
WHERE id = 'project-documents';

-- Sanity: path format for tm-photos must be
--   companyId/projectId/ticketId/filename
-- (matches uploadPhoto / uploadPhotoBase64 in src/lib/db/tmOps.js;
--  ticketId is also used as a sub-folder for daily-report and
--  field-observation photos, e.g. `dr-...` / `obs-...`).
-- Add a CHECK-style guard via the upload policy. Reject anything
-- that can't be parsed into the expected folder layout.
DROP POLICY IF EXISTS "Field users can upload tm-photos" ON storage.objects;
CREATE POLICY "Field users can upload tm-photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'tm-photos'
  AND name ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/[^/]+/[^/]+$'
  AND (
    auth.uid() IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM has_valid_field_session() s
      WHERE s.project_id::text = (storage.foldername(name))[2]
    )
  )
);

-- Verification (manual):
--   SELECT id, public, file_size_limit, allowed_mime_types
--   FROM storage.buckets
--   WHERE id IN ('tm-photos','project-documents');
