-- =============================================
-- FIX: Documents Table RLS Policies
-- =============================================
-- This migration fixes RLS policies for the documents table
-- to allow document uploads and management
--
-- Run this in Supabase SQL Editor AFTER fix_document_folders_rls.sql
-- =============================================

-- =============================================
-- STEP 1: Ensure documents table exists
-- =============================================

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  folder_id UUID REFERENCES document_folders(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'general',
  tags TEXT[] DEFAULT '{}',
  version INTEGER DEFAULT 1,
  is_current BOOLEAN DEFAULT true,
  parent_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  resource_type TEXT,
  resource_id UUID,
  visibility TEXT DEFAULT 'all' CHECK (visibility IN ('all', 'office_only', 'admin_only')),
  approval_status TEXT DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archived_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- =============================================
-- STEP 2: Ensure upload queue table exists
-- =============================================

CREATE TABLE IF NOT EXISTS document_upload_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  temp_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER,
  category TEXT DEFAULT 'general',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'confirmed', 'failed', 'cancelled')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  last_attempt TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  uploaded_url TEXT,
  storage_path TEXT,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  UNIQUE(project_id, temp_id)
);

ALTER TABLE document_upload_queue ENABLE ROW LEVEL SECURITY;

-- =============================================
-- STEP 3: Drop existing policies
-- =============================================

DROP POLICY IF EXISTS "documents_select" ON documents;
DROP POLICY IF EXISTS "documents_insert" ON documents;
DROP POLICY IF EXISTS "documents_update" ON documents;
DROP POLICY IF EXISTS "documents_delete" ON documents;
DROP POLICY IF EXISTS "documents_field_select" ON documents;

DROP POLICY IF EXISTS "doc_queue_select" ON document_upload_queue;
DROP POLICY IF EXISTS "doc_queue_insert" ON document_upload_queue;
DROP POLICY IF EXISTS "doc_queue_update" ON document_upload_queue;

-- =============================================
-- STEP 4: Create documents policies
-- =============================================

-- SELECT: Company members can view documents (with visibility checks)
CREATE POLICY "documents_select" ON documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
    )
    AND (
      visibility = 'all'
      OR (visibility = 'office_only' AND EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
          AND uc.company_id = documents.company_id
          AND (uc.access_level IN ('member', 'administrator') OR uc.access_level IS NULL)
      ))
      OR (visibility = 'admin_only' AND EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
          AND uc.company_id = documents.company_id
          AND uc.access_level = 'administrator'
      ))
    )
  );

-- INSERT: Office users can upload documents
CREATE POLICY "documents_insert" ON documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
        AND (
          uc.access_level IN ('member', 'administrator')
          OR uc.access_level IS NULL
        )
    )
  );

-- UPDATE: Office users can update documents
CREATE POLICY "documents_update" ON documents
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
        AND (
          uc.access_level IN ('member', 'administrator')
          OR uc.access_level IS NULL
        )
    )
  );

-- DELETE: Only administrators can delete
CREATE POLICY "documents_delete" ON documents
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
        AND uc.access_level = 'administrator'
    )
  );

-- Field users can view public approved documents
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'can_access_project') THEN
    EXECUTE '
      CREATE POLICY "documents_field_select" ON documents
        FOR SELECT
        TO anon
        USING (
          visibility = ''all''
          AND approval_status = ''approved''
          AND archived_at IS NULL
          AND can_access_project(project_id)
        )
    ';
  END IF;
END $$;

-- =============================================
-- STEP 5: Create upload queue policies
-- =============================================

-- SELECT: Company members can view queue
CREATE POLICY "doc_queue_select" ON document_upload_queue
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_upload_queue.company_id
        AND uc.status = 'active'
    )
  );

-- INSERT: Office users can add to queue
CREATE POLICY "doc_queue_insert" ON document_upload_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_upload_queue.company_id
        AND uc.status = 'active'
        AND (
          uc.access_level IN ('member', 'administrator')
          OR uc.access_level IS NULL
        )
    )
  );

-- UPDATE: Company members can update queue entries
CREATE POLICY "doc_queue_update" ON document_upload_queue
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_upload_queue.company_id
        AND uc.status = 'active'
    )
  );

-- =============================================
-- STEP 6: Grant permissions
-- =============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO authenticated;
GRANT SELECT ON documents TO anon;
GRANT SELECT, INSERT, UPDATE ON document_upload_queue TO authenticated;

-- =============================================
-- STEP 7: Create indexes
-- =============================================

CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id, uploaded_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_company ON documents(company_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(project_id, category) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id, uploaded_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_doc_queue_pending ON document_upload_queue(status, next_retry_at) WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_doc_queue_project ON document_upload_queue(project_id);

-- =============================================
-- STEP 8: Setup storage bucket (if not exists)
-- =============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-documents', 'project-documents', true)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- STEP 9: Storage RLS policies
-- =============================================

-- Drop existing storage policies for this bucket
DROP POLICY IF EXISTS "document_storage_upload" ON storage.objects;
DROP POLICY IF EXISTS "document_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "document_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "document_storage_delete" ON storage.objects;

-- Upload: Office users can upload to their company's folder
CREATE POLICY "document_storage_upload" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM companies c
      JOIN user_companies uc ON c.id = uc.company_id
      WHERE uc.user_id = auth.uid()
        AND uc.status = 'active'
        AND (
          uc.access_level IN ('member', 'administrator')
          OR uc.access_level IS NULL
        )
    )
  );

-- Select: Anyone can view documents (public bucket)
CREATE POLICY "document_storage_select" ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'project-documents');

-- Update: Office users can update files
CREATE POLICY "document_storage_update" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM companies c
      JOIN user_companies uc ON c.id = uc.company_id
      WHERE uc.user_id = auth.uid()
        AND uc.status = 'active'
        AND (
          uc.access_level IN ('member', 'administrator')
          OR uc.access_level IS NULL
        )
    )
  );

-- Delete: Only admins can delete files
CREATE POLICY "document_storage_delete" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM companies c
      JOIN user_companies uc ON c.id = uc.company_id
      WHERE uc.user_id = auth.uid()
        AND uc.status = 'active'
        AND uc.access_level = 'administrator'
    )
  );

-- =============================================
-- VERIFICATION
-- =============================================

DO $$
DECLARE
  doc_policies INTEGER;
  queue_policies INTEGER;
  storage_policies INTEGER;
BEGIN
  SELECT COUNT(*) INTO doc_policies
  FROM pg_policies WHERE tablename = 'documents';

  SELECT COUNT(*) INTO queue_policies
  FROM pg_policies WHERE tablename = 'document_upload_queue';

  SELECT COUNT(*) INTO storage_policies
  FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE 'document_storage%';

  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'DOCUMENTS RLS FIX APPLIED SUCCESSFULLY';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Documents table policies: %', doc_policies;
  RAISE NOTICE 'Upload queue policies: %', queue_policies;
  RAISE NOTICE 'Storage policies: %', storage_policies;
  RAISE NOTICE '';
  RAISE NOTICE 'You can now upload and manage documents!';
  RAISE NOTICE '============================================================';
END $$;
