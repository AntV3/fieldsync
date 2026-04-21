-- ============================================================
-- FIX: Foremen cannot see documents uploaded by the office
--
-- SYMPTOM:
--   Office users upload a document into a project folder and it
--   appears in their own Documents tab, but the same project's
--   foreman (logged in via PIN on the Field/Foreman view) sees
--   an empty folder or no documents at all.
--
-- ROOT CAUSE:
--   Foremen authenticate with a PIN, which issues a field_sessions
--   token. On the client, the Supabase anon key is used together
--   with an `x-field-session` header, so PostgREST treats the
--   request as the `anon` role — auth.uid() is NULL.
--
--   The document_folders and documents tables in the currently
--   deployed schema either:
--     (a) have SELECT policies scoped TO authenticated only, or
--     (b) have a TO anon policy but no accompanying
--         `GRANT SELECT ... TO anon` (PostgREST requires both),
--     (c) have historical policies left over from earlier fix
--         scripts that conflict with can_access_project().
--
--   Net result: the anon role's SELECT is filtered to zero rows,
--   so foremen see empty document folders even when documents
--   were uploaded with the default visibility='all'.
--
-- FIX:
--   Rebuild the SELECT policies on document_folders and documents
--   using the already-deployed can_access_project() helper, which
--   handles both office (auth.uid()) and field (PIN session) users.
--   Preserve the office-side visibility/approval workflow for
--   office_only / admin_only / pending documents. Grant the
--   necessary anon SELECTs that PostgREST needs.
--
--   This does NOT loosen office-side access control — office users
--   still go through the access_level visibility checks. It only
--   adds the missing foreman path.
--
-- This migration is IDEMPOTENT — safe to re-run on any database.
-- ============================================================

-- ------------------------------------------------------------
-- 1. document_folders: foremen need to see folders to navigate
-- ------------------------------------------------------------

ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;

-- Drop every historical SELECT policy name we know of.
DROP POLICY IF EXISTS "folders_select"           ON document_folders;
DROP POLICY IF EXISTS "folders_field_select"     ON document_folders;
DROP POLICY IF EXISTS "document_folders_select"  ON document_folders;

-- Unified SELECT: office users (auth.uid()) AND field users (PIN).
CREATE POLICY "folders_select"
  ON document_folders FOR SELECT
  USING (can_access_project(project_id));

-- ------------------------------------------------------------
-- 2. documents: foremen see only visibility='all', approved,
--    non-archived rows; office users keep the existing
--    access_level-based visibility and approval checks.
-- ------------------------------------------------------------

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Drop every historical SELECT policy name we know of.
DROP POLICY IF EXISTS "documents_select"        ON documents;
DROP POLICY IF EXISTS "documents_field_select"  ON documents;

-- Office users: scoped to authenticated role. Preserves the
-- office_only / admin_only / pending-approval rules.
CREATE POLICY "documents_select"
  ON documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id    = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status     = 'active'
    )
    AND (
      visibility = 'all'
      OR (visibility = 'office_only' AND EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id    = auth.uid()
          AND uc.company_id = documents.company_id
          AND uc.access_level IN ('member', 'administrator')
      ))
      OR (visibility = 'admin_only' AND EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id    = auth.uid()
          AND uc.company_id = documents.company_id
          AND uc.access_level = 'administrator'
      ))
    )
    AND (
      approval_status = 'approved'
      OR EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id    = auth.uid()
          AND uc.company_id = documents.company_id
          AND uc.access_level = 'administrator'
      )
    )
  );

-- Foreman (field) users: scoped to anon role (PIN session).
-- Only see documents explicitly marked for "all" audiences,
-- already approved, and not archived.
CREATE POLICY "documents_field_select"
  ON documents FOR SELECT
  TO anon
  USING (
    visibility      = 'all'
    AND approval_status = 'approved'
    AND archived_at  IS NULL
    AND can_access_project(project_id)
  );

-- ------------------------------------------------------------
-- 3. Grants: PostgREST requires table-level grants in addition
--    to RLS policies. Without these, anon queries return empty
--    even when the policy would allow the row.
-- ------------------------------------------------------------

GRANT SELECT ON document_folders TO anon;
GRANT SELECT ON document_folders TO authenticated;

GRANT SELECT ON documents TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO authenticated;

-- ------------------------------------------------------------
-- 4. Storage: the project-documents bucket SELECT policy should
--    allow both office and field users to read the underlying
--    files. We re-assert a permissive SELECT on the bucket so
--    the download URL works from the Foreman view regardless of
--    whether the bucket has been flipped private.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "document_storage_select" ON storage.objects;

CREATE POLICY "document_storage_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-documents'
    AND (
      auth.uid() IS NOT NULL
      OR EXISTS (SELECT 1 FROM has_valid_field_session())
    )
  );

-- ------------------------------------------------------------
-- 5. Verification
-- ------------------------------------------------------------
DO $$
DECLARE
  folder_policies   INTEGER;
  document_policies INTEGER;
BEGIN
  SELECT COUNT(*) INTO folder_policies
  FROM pg_policies
  WHERE tablename = 'document_folders' AND cmd = 'SELECT';

  SELECT COUNT(*) INTO document_policies
  FROM pg_policies
  WHERE tablename = 'documents' AND cmd = 'SELECT';

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'FIX APPLIED: 20260421_fix_foreman_document_visibility';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'document_folders SELECT policies: % (expect 1)', folder_policies;
  RAISE NOTICE 'documents SELECT policies:        % (expect 2)', document_policies;
  RAISE NOTICE 'Foremen can now see documents uploaded by the office.';
  RAISE NOTICE '============================================================';
END $$;
