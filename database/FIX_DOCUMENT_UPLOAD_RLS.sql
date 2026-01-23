-- =============================================
-- COMPLETE FIX: Document Upload RLS Policies
-- =============================================
-- This fixes the error:
-- "new row violates row-level security policy for table document_folders"
-- Error code: 42501
--
-- INSTRUCTIONS:
-- 1. Go to Supabase Dashboard
-- 2. Navigate to SQL Editor
-- 3. Click "New Query"
-- 4. Paste this ENTIRE file
-- 5. Click "Run"
-- 6. You should see success messages
-- 7. Try creating a folder/uploading a document again
-- =============================================

BEGIN;

-- =============================================
-- PART 1: DOCUMENT FOLDERS
-- =============================================

-- Create table if not exists
CREATE TABLE IF NOT EXISTS document_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'folder',
  color TEXT DEFAULT 'blue',
  sort_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, name)
);

ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;

-- Drop all existing folder policies
DROP POLICY IF EXISTS "folders_select" ON document_folders;
DROP POLICY IF EXISTS "folders_field_select" ON document_folders;
DROP POLICY IF EXISTS "folders_insert" ON document_folders;
DROP POLICY IF EXISTS "folders_update" ON document_folders;
DROP POLICY IF EXISTS "folders_delete" ON document_folders;
DROP POLICY IF EXISTS "document_folders_select" ON document_folders;
DROP POLICY IF EXISTS "document_folders_insert" ON document_folders;
DROP POLICY IF EXISTS "document_folders_update" ON document_folders;
DROP POLICY IF EXISTS "document_folders_delete" ON document_folders;

-- Create folder policies
CREATE POLICY "folders_select" ON document_folders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
    )
  );

CREATE POLICY "folders_insert" ON document_folders
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
        AND (uc.access_level IN ('member', 'administrator') OR uc.access_level IS NULL)
    )
  );

CREATE POLICY "folders_update" ON document_folders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
        AND (uc.access_level IN ('member', 'administrator') OR uc.access_level IS NULL)
    )
  );

CREATE POLICY "folders_delete" ON document_folders
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
        AND uc.access_level = 'administrator'
    )
  );

-- Grant folder permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON document_folders TO authenticated;

-- Create folder indexes
CREATE INDEX IF NOT EXISTS idx_folders_project ON document_folders(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_folders_company ON document_folders(company_id);

-- =============================================
-- PART 2: DOCUMENTS TABLE
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

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Drop existing document policies
DROP POLICY IF EXISTS "documents_select" ON documents;
DROP POLICY IF EXISTS "documents_insert" ON documents;
DROP POLICY IF EXISTS "documents_update" ON documents;
DROP POLICY IF EXISTS "documents_delete" ON documents;
DROP POLICY IF EXISTS "documents_field_select" ON documents;

-- Create document policies
CREATE POLICY "documents_select" ON documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
    )
  );

CREATE POLICY "documents_insert" ON documents
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
        AND (uc.access_level IN ('member', 'administrator') OR uc.access_level IS NULL)
    )
  );

CREATE POLICY "documents_update" ON documents
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
        AND (uc.access_level IN ('member', 'administrator') OR uc.access_level IS NULL)
    )
  );

CREATE POLICY "documents_delete" ON documents
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
        AND uc.access_level = 'administrator'
    )
  );

-- Grant document permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO authenticated;

-- Create document indexes
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id, uploaded_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_company ON documents(company_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id, uploaded_at DESC) WHERE archived_at IS NULL;

-- =============================================
-- PART 3: UPLOAD QUEUE
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

DROP POLICY IF EXISTS "doc_queue_select" ON document_upload_queue;
DROP POLICY IF EXISTS "doc_queue_insert" ON document_upload_queue;
DROP POLICY IF EXISTS "doc_queue_update" ON document_upload_queue;

CREATE POLICY "doc_queue_select" ON document_upload_queue
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_upload_queue.company_id
        AND uc.status = 'active'
    )
  );

CREATE POLICY "doc_queue_insert" ON document_upload_queue
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_upload_queue.company_id
        AND uc.status = 'active'
        AND (uc.access_level IN ('member', 'administrator') OR uc.access_level IS NULL)
    )
  );

CREATE POLICY "doc_queue_update" ON document_upload_queue
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_upload_queue.company_id
        AND uc.status = 'active'
    )
  );

GRANT SELECT, INSERT, UPDATE ON document_upload_queue TO authenticated;

-- =============================================
-- PART 4: FIX USER ACCESS LEVELS
-- =============================================

-- Set default access_level for users who have NULL
UPDATE user_companies
SET access_level = 'member'
WHERE access_level IS NULL AND status = 'active';

-- Ensure company owners are administrators
UPDATE user_companies uc
SET access_level = 'administrator'
FROM companies c
WHERE c.owner_user_id = uc.user_id
  AND c.id = uc.company_id
  AND (uc.access_level IS NULL OR uc.access_level != 'administrator');

-- =============================================
-- PART 5: STORAGE BUCKET
-- =============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-documents', 'project-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (drop existing first)
DROP POLICY IF EXISTS "document_storage_upload" ON storage.objects;
DROP POLICY IF EXISTS "document_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "document_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "document_storage_delete" ON storage.objects;

CREATE POLICY "document_storage_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM companies c
      JOIN user_companies uc ON c.id = uc.company_id
      WHERE uc.user_id = auth.uid()
        AND uc.status = 'active'
        AND (uc.access_level IN ('member', 'administrator') OR uc.access_level IS NULL)
    )
  );

CREATE POLICY "document_storage_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'project-documents');

CREATE POLICY "document_storage_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM companies c
      JOIN user_companies uc ON c.id = uc.company_id
      WHERE uc.user_id = auth.uid()
        AND uc.status = 'active'
        AND (uc.access_level IN ('member', 'administrator') OR uc.access_level IS NULL)
    )
  );

CREATE POLICY "document_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
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

COMMIT;

-- =============================================
-- SUCCESS MESSAGE
-- =============================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '╔══════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║     DOCUMENT UPLOAD FIX APPLIED SUCCESSFULLY!            ║';
  RAISE NOTICE '╠══════════════════════════════════════════════════════════╣';
  RAISE NOTICE '║ Tables created/verified:                                 ║';
  RAISE NOTICE '║   - document_folders                                     ║';
  RAISE NOTICE '║   - documents                                            ║';
  RAISE NOTICE '║   - document_upload_queue                                ║';
  RAISE NOTICE '║                                                          ║';
  RAISE NOTICE '║ RLS policies configured for:                             ║';
  RAISE NOTICE '║   - Folder creation (member + administrator)             ║';
  RAISE NOTICE '║   - Document upload (member + administrator)             ║';
  RAISE NOTICE '║   - Storage bucket access                                ║';
  RAISE NOTICE '║                                                          ║';
  RAISE NOTICE '║ User access levels fixed (NULL -> member)                ║';
  RAISE NOTICE '╠══════════════════════════════════════════════════════════╣';
  RAISE NOTICE '║ TRY NOW: Create a folder or upload a document!           ║';
  RAISE NOTICE '╚══════════════════════════════════════════════════════════╝';
END $$;
