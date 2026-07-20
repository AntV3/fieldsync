-- =============================================
-- DOCUMENT MANAGEMENT SYSTEM MIGRATION
-- =============================================
-- This migration creates the document management infrastructure for FieldSync
-- Allows companies to upload, organize, and manage construction documents

-- =============================================
-- 1. DOCUMENT FOLDERS TABLE
-- =============================================
-- Custom folders created by office/admin for organizing documents per project
CREATE TABLE IF NOT EXISTS document_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Folder details
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'folder', -- lucide icon name
  color TEXT DEFAULT 'blue', -- theme color

  -- Ordering
  sort_order INTEGER DEFAULT 0,

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique folder names per project
  UNIQUE(project_id, name)
);

-- =============================================
-- 2. DOCUMENTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- File metadata
  name TEXT NOT NULL,
  description TEXT,
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,

  -- Organization
  folder_id UUID REFERENCES document_folders(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'general',
  tags TEXT[] DEFAULT '{}',

  -- Versioning
  version INTEGER DEFAULT 1,
  is_current BOOLEAN DEFAULT true,
  parent_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,

  -- Linking to other resources (polymorphic)
  resource_type TEXT, -- 'cor', 'tm_ticket', 'daily_report', null for general
  resource_id UUID,

  -- Access control
  visibility TEXT DEFAULT 'all' CHECK (visibility IN ('all', 'office_only', 'admin_only')),

  -- Approval workflow (for contracts)
  approval_status TEXT DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Audit
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),

  -- Soft delete
  archived_at TIMESTAMPTZ,
  archived_by UUID REFERENCES auth.users(id)
);

-- =============================================
-- 2. DOCUMENT UPLOAD QUEUE (for reliability)
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

-- =============================================
-- 3. DOCUMENT AUDIT LOG
-- =============================================
CREATE TABLE IF NOT EXISTS document_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  operation TEXT NOT NULL CHECK (operation IN (
    'upload_started', 'upload_completed', 'upload_failed',
    'downloaded', 'viewed', 'deleted', 'restored',
    'version_created', 'linked', 'unlinked',
    'approved', 'rejected'
  )),
  details JSONB,
  error_message TEXT,
  triggered_by TEXT DEFAULT 'user' CHECK (triggered_by IN ('user', 'system', 'retry')),
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 4. INDEXES
-- =============================================

-- Folder indexes
CREATE INDEX IF NOT EXISTS idx_folders_project ON document_folders(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_folders_company ON document_folders(company_id);

-- Primary access patterns
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id, uploaded_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_company ON documents(company_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(project_id, category) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id, uploaded_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_resource ON documents(resource_type, resource_id) WHERE resource_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_current ON documents(parent_document_id) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_documents_approval ON documents(company_id, approval_status) WHERE approval_status = 'pending';

-- Queue processing
CREATE INDEX IF NOT EXISTS idx_doc_queue_pending ON document_upload_queue(status, next_retry_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_doc_queue_project ON document_upload_queue(project_id);

-- Audit queries
CREATE INDEX IF NOT EXISTS idx_doc_audit_document ON document_audit_log(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_audit_project ON document_audit_log(project_id, created_at DESC);

-- =============================================
-- 5. ROW LEVEL SECURITY
-- =============================================

-- Enable RLS on all tables
ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_upload_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_audit_log ENABLE ROW LEVEL SECURITY;

-- =============================================
-- FOLDER POLICIES
-- =============================================

-- Folders: All company members can view
CREATE POLICY "folders_select" ON document_folders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
    )
  );

-- Folders: Field users can also view via project access
CREATE POLICY "folders_field_select" ON document_folders
  FOR SELECT USING (
    can_access_project(project_id)
  );

-- Folders: Only office/admin can create
CREATE POLICY "folders_insert" ON document_folders
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
        AND uc.access_level IN ('member', 'administrator')
    )
  );

-- Folders: Only office/admin can update
CREATE POLICY "folders_update" ON document_folders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
        AND uc.access_level IN ('member', 'administrator')
    )
  );

-- Folders: Only admin can delete
CREATE POLICY "folders_delete" ON document_folders
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_folders.company_id
        AND uc.status = 'active'
        AND uc.access_level = 'administrator'
    )
  );

-- Documents: Company members can access their company's documents
CREATE POLICY "documents_select" ON documents
  FOR SELECT USING (
    -- Must be company member
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
    )
    AND (
      -- Visibility check based on access level
      visibility = 'all'
      OR (visibility = 'office_only' AND EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
          AND uc.company_id = documents.company_id
          AND uc.access_level IN ('member', 'administrator')
      ))
      OR (visibility = 'admin_only' AND EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
          AND uc.company_id = documents.company_id
          AND uc.access_level = 'administrator'
      ))
    )
    AND (
      -- Approval check: pending documents only visible to admins
      approval_status = 'approved'
      OR EXISTS (
        SELECT 1 FROM user_companies uc
        WHERE uc.user_id = auth.uid()
          AND uc.company_id = documents.company_id
          AND uc.access_level = 'administrator'
      )
    )
  );

-- Documents: Only office/admin can insert
CREATE POLICY "documents_insert" ON documents
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
        AND uc.access_level IN ('member', 'administrator')
    )
  );

-- Documents: Only office/admin can update
CREATE POLICY "documents_update" ON documents
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
        AND uc.access_level IN ('member', 'administrator')
    )
  );

-- Documents: Only admin can delete
CREATE POLICY "documents_delete" ON documents
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = documents.company_id
        AND uc.status = 'active'
        AND uc.access_level = 'administrator'
    )
  );

-- Field users can view 'all' visibility, approved documents
CREATE POLICY "documents_field_select" ON documents
  FOR SELECT USING (
    visibility = 'all'
    AND approval_status = 'approved'
    AND archived_at IS NULL
    AND can_access_project(project_id)
  );

-- Upload queue policies
CREATE POLICY "doc_queue_select" ON document_upload_queue
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_upload_queue.company_id
        AND uc.status = 'active'
    )
  );

CREATE POLICY "doc_queue_insert" ON document_upload_queue
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_upload_queue.company_id
        AND uc.status = 'active'
        AND uc.access_level IN ('member', 'administrator')
    )
  );

CREATE POLICY "doc_queue_update" ON document_upload_queue
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_upload_queue.company_id
        AND uc.status = 'active'
    )
  );

-- Audit log: read-only for users, system can insert
CREATE POLICY "doc_audit_select" ON document_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
        AND uc.company_id = document_audit_log.company_id
        AND uc.status = 'active'
    )
  );

CREATE POLICY "doc_audit_insert" ON document_audit_log
  FOR INSERT WITH CHECK (true);

-- =============================================
-- 6. STORAGE BUCKET
-- =============================================
-- Note: Run this in Supabase Dashboard or via API

-- Create bucket (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-documents', 'project-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "document_storage_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM companies c
      JOIN user_companies uc ON c.id = uc.company_id
      WHERE uc.user_id = auth.uid()
        AND uc.status = 'active'
        AND uc.access_level IN ('member', 'administrator')
    )
  );

CREATE POLICY "document_storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'project-documents');

CREATE POLICY "document_storage_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM companies c
      JOIN user_companies uc ON c.id = uc.company_id
      WHERE uc.user_id = auth.uid()
        AND uc.status = 'active'
        AND uc.access_level IN ('member', 'administrator')
    )
  );

CREATE POLICY "document_storage_delete" ON storage.objects
  FOR DELETE USING (
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
-- 7. RPC FUNCTIONS
-- =============================================

-- Confirm document upload (atomic operation)
CREATE OR REPLACE FUNCTION confirm_document_upload(
  p_queue_id UUID,
  p_document_id UUID,
  p_storage_path TEXT,
  p_uploaded_url TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update queue entry
  UPDATE document_upload_queue
  SET status = 'confirmed',
      document_id = p_document_id,
      storage_path = p_storage_path,
      uploaded_url = p_uploaded_url,
      confirmed_at = NOW()
  WHERE id = p_queue_id;

  -- Log the operation
  INSERT INTO document_audit_log (document_id, project_id, company_id, operation, triggered_by, user_id)
  SELECT p_document_id, project_id, company_id, 'upload_completed', 'system', auth.uid()
  FROM document_upload_queue WHERE id = p_queue_id;

  RETURN true;
END;
$$;

-- Mark document upload failed
CREATE OR REPLACE FUNCTION mark_document_upload_failed(
  p_queue_id UUID,
  p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE document_upload_queue
  SET status = 'failed',
      attempts = attempts + 1,
      last_error = p_error,
      last_attempt = NOW(),
      next_retry_at = CASE
        WHEN attempts + 1 < max_attempts
          THEN NOW() + (POWER(2, attempts + 1) || ' seconds')::INTERVAL
        ELSE NULL
      END
  WHERE id = p_queue_id;

  -- Log the failure
  INSERT INTO document_audit_log (project_id, company_id, operation, error_message, triggered_by, user_id)
  SELECT project_id, company_id, 'upload_failed', p_error, 'system', auth.uid()
  FROM document_upload_queue WHERE id = p_queue_id;

  RETURN true;
END;
$$;

-- Approve document
CREATE OR REPLACE FUNCTION approve_document(
  p_document_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  -- Check if user is admin
  SELECT company_id INTO v_company_id FROM documents WHERE id = p_document_id;

  IF NOT EXISTS (
    SELECT 1 FROM user_companies
    WHERE user_id = auth.uid()
      AND company_id = v_company_id
      AND access_level = 'administrator'
  ) THEN
    RAISE EXCEPTION 'Only administrators can approve documents';
  END IF;

  -- Update document
  UPDATE documents
  SET approval_status = 'approved',
      approved_by = auth.uid(),
      approved_at = NOW()
  WHERE id = p_document_id;

  -- Log the approval
  INSERT INTO document_audit_log (document_id, project_id, company_id, operation, triggered_by, user_id)
  SELECT id, project_id, company_id, 'approved', 'user', auth.uid()
  FROM documents WHERE id = p_document_id;

  RETURN true;
END;
$$;

-- Reject document
CREATE OR REPLACE FUNCTION reject_document(
  p_document_id UUID,
  p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  -- Check if user is admin
  SELECT company_id INTO v_company_id FROM documents WHERE id = p_document_id;

  IF NOT EXISTS (
    SELECT 1 FROM user_companies
    WHERE user_id = auth.uid()
      AND company_id = v_company_id
      AND access_level = 'administrator'
  ) THEN
    RAISE EXCEPTION 'Only administrators can reject documents';
  END IF;

  -- Update document
  UPDATE documents
  SET approval_status = 'rejected',
      rejection_reason = p_reason
  WHERE id = p_document_id;

  -- Log the rejection
  INSERT INTO document_audit_log (document_id, project_id, company_id, operation, details, triggered_by, user_id)
  SELECT id, project_id, company_id, 'rejected', jsonb_build_object('reason', p_reason), 'user', auth.uid()
  FROM documents WHERE id = p_document_id;

  RETURN true;
END;
$$;

-- =============================================
-- 8. REALTIME SUBSCRIPTION
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE document_folders;
ALTER PUBLICATION supabase_realtime ADD TABLE documents;
ALTER PUBLICATION supabase_realtime ADD TABLE document_upload_queue;

-- =============================================
-- 9. GRANTS
-- =============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON document_folders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO authenticated;
GRANT SELECT, INSERT, UPDATE ON document_upload_queue TO authenticated;
GRANT SELECT, INSERT ON document_audit_log TO authenticated;

GRANT EXECUTE ON FUNCTION confirm_document_upload TO authenticated;
GRANT EXECUTE ON FUNCTION mark_document_upload_failed TO authenticated;
GRANT EXECUTE ON FUNCTION approve_document TO authenticated;
GRANT EXECUTE ON FUNCTION reject_document TO authenticated;
