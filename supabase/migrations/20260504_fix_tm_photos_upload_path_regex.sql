-- ============================================================
-- FIX: Daily report (and T&M / observation) photo uploads fail
-- since the launch-readiness hardening on 2026-04-23.
--
-- SYMPTOM:
--   Foremen on the field app cannot submit daily reports that
--   include photos. The submit attempt surfaces "Error submitting
--   report" in the UI; in the browser network tab the upload to
--   storage.objects returns 403 ("new row violates row-level
--   security policy").
--
-- ROOT CAUSE:
--   20260423_storage_mime_size_limits.sql replaced the
--   "Field users can upload tm-photos" policy with a path regex
--   that only matches THREE segments:
--     ^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/[^/]+$
--   i.e. `companyId/projectId/filename`.
--
--   Every uploadPhoto / uploadPhotoBase64 caller in the app
--   (TMForm.jsx, DailyReport.jsx, FieldObservations.jsx) builds
--   a FOUR-segment path:
--     `companyId/projectId/ticketId/filename`
--   so the WITH CHECK predicate is false and the upload is
--   denied at the RLS layer for every field-session caller. The
--   pre-launch policy (migration_field_photo_uploads.sql)
--   correctly validated `(string_to_array(name, '/'))[2]` against
--   the projects table for that 4-segment layout.
--
-- FIX:
--   Recreate the upload policy with a regex that matches the
--   actual layout (uuid/uuid/<ticket>/<file>). Keep the same
--   server-side guards: bucket id, MIME/size still enforced by
--   storage.buckets, and either an authenticated office user OR
--   a valid field session whose project_id matches the second
--   path segment.
--
-- IDEMPOTENT — safe to re-run.
-- ============================================================

DROP POLICY IF EXISTS "Field users can upload tm-photos" ON storage.objects;
CREATE POLICY "Field users can upload tm-photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'tm-photos'
  -- Path layout: companyId/projectId/ticketId/filename
  AND name ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/[^/]+/[^/]+$'
  AND (
    auth.uid() IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM has_valid_field_session() s
      WHERE s.project_id::text = (storage.foldername(name))[2]
    )
  )
);

DO $$
BEGIN
  RAISE NOTICE 'Migration 20260504_fix_tm_photos_upload_path_regex applied: tm-photos upload policy now accepts the 4-segment companyId/projectId/ticketId/filename path used by the app';
END $$;
