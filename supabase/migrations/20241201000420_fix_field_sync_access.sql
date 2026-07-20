-- ============================================================
-- FIX: Field Sync Access for CORs and Documents
-- ============================================================
-- This migration fixes two critical issues:
-- 1. CORs created by office not showing for foreman
-- 2. Documents uploaded by office not visible to foreman
--
-- Root causes:
-- - Conflicting RLS policies for CORs
-- - Document policies too restrictive (require approval)
-- - Document folder policies may not have been created
-- ============================================================

-- ============================================================
-- STEP 1: Ensure can_access_project function exists
-- ============================================================

CREATE OR REPLACE FUNCTION can_access_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
BEGIN
  -- Check authenticated user access
  IF auth.uid() IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM user_companies uc
      JOIN projects p ON p.company_id = uc.company_id
      WHERE p.id = p_project_id
        AND uc.user_id = auth.uid()
        AND uc.status = 'active'
    );
  END IF;

  -- Check field session access
  RETURN validate_field_session(p_project_id);
END;
$$;

GRANT EXECUTE ON FUNCTION can_access_project(UUID) TO anon;
GRANT EXECUTE ON FUNCTION can_access_project(UUID) TO authenticated;

-- ============================================================
-- STEP 2: Fix Change Orders (COR) access for field users
-- ============================================================

-- Drop ALL conflicting policies for change_orders SELECT
DROP POLICY IF EXISTS "Field users can view CORs by project" ON change_orders;
DROP POLICY IF EXISTS "Secure field view CORs" ON change_orders;
DROP POLICY IF EXISTS "change_orders_field_select" ON change_orders;

-- Create single, correct policy for field COR access
CREATE POLICY "Field users can view project CORs"
ON change_orders FOR SELECT
TO anon
USING (can_access_project(project_id));

-- Ensure anon role has SELECT permission
GRANT SELECT ON change_orders TO anon;

-- ============================================================
-- STEP 3: Fix Document Folders access for field users
-- ============================================================

-- Drop existing field policies
DROP POLICY IF EXISTS "folders_field_select" ON document_folders;
DROP POLICY IF EXISTS "document_folders_field_select" ON document_folders;

-- Create field access policy (no restrictions, just project access)
CREATE POLICY "Field users can view project folders"
ON document_folders FOR SELECT
TO anon
USING (can_access_project(project_id));

-- Ensure anon role has SELECT permission
GRANT SELECT ON document_folders TO anon;

-- ============================================================
-- STEP 4: Fix Documents access for field users
-- ============================================================

-- Drop existing field policies
DROP POLICY IF EXISTS "documents_field_select" ON document_folders;
DROP POLICY IF EXISTS "Field users can view documents" ON documents;

-- Create field access policy
-- Documents should be visible immediately after upload if:
-- 1. visibility is 'all' (not office_only or admin_only)
-- 2. document is not archived
-- NOTE: Removed approval_status check for immediate visibility
CREATE POLICY "Field users can view project documents"
ON documents FOR SELECT
TO anon
USING (
  can_access_project(project_id)
  AND visibility = 'all'
  AND archived_at IS NULL
  AND is_current = true
);

-- Ensure anon role has SELECT permission
GRANT SELECT ON documents TO anon;

-- ============================================================
-- STEP 5: Fix Change Order Ticket Associations
-- ============================================================

DROP POLICY IF EXISTS "Field users can view ticket associations" ON change_order_ticket_associations;
DROP POLICY IF EXISTS "Secure field view ticket associations" ON change_order_ticket_associations;
DROP POLICY IF EXISTS "Field users can create ticket associations" ON change_order_ticket_associations;
DROP POLICY IF EXISTS "Secure field create ticket associations" ON change_order_ticket_associations;

CREATE POLICY "Field users can view COR ticket links"
ON change_order_ticket_associations FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_ticket_associations.change_order_id
      AND can_access_project(cor.project_id)
  )
);

CREATE POLICY "Field users can link tickets to CORs"
ON change_order_ticket_associations FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_ticket_associations.change_order_id
      AND can_access_project(cor.project_id)
  )
);

GRANT SELECT, INSERT ON change_order_ticket_associations TO anon;

-- ============================================================
-- STEP 6: Ensure supporting COR line item tables are accessible
-- ============================================================

-- Labor items
DROP POLICY IF EXISTS "Field users can view labor items" ON change_order_labor;
DROP POLICY IF EXISTS "Secure field view labor items" ON change_order_labor;

CREATE POLICY "Field users can view COR labor"
ON change_order_labor FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_labor.change_order_id
      AND can_access_project(cor.project_id)
  )
);

GRANT SELECT ON change_order_labor TO anon;

-- Materials items
DROP POLICY IF EXISTS "Field users can view material items" ON change_order_materials;
DROP POLICY IF EXISTS "Secure field view material items" ON change_order_materials;

CREATE POLICY "Field users can view COR materials"
ON change_order_materials FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_materials.change_order_id
      AND can_access_project(cor.project_id)
  )
);

GRANT SELECT ON change_order_materials TO anon;

-- Equipment items
DROP POLICY IF EXISTS "Field users can view equipment items" ON change_order_equipment;
DROP POLICY IF EXISTS "Secure field view equipment items" ON change_order_equipment;

CREATE POLICY "Field users can view COR equipment"
ON change_order_equipment FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM change_orders cor
    WHERE cor.id = change_order_equipment.change_order_id
      AND can_access_project(cor.project_id)
  )
);

GRANT SELECT ON change_order_equipment TO anon;

-- ============================================================
-- STEP 7: Verify document upload defaults
-- ============================================================

-- Ensure new documents default to visibility='all' so they're
-- immediately visible to field users
ALTER TABLE documents
ALTER COLUMN visibility SET DEFAULT 'all';

-- ============================================================
-- VERIFICATION
-- ============================================================

DO $$
DECLARE
  cor_policies INTEGER;
  folder_policies INTEGER;
  doc_policies INTEGER;
BEGIN
  SELECT COUNT(*) INTO cor_policies
  FROM pg_policies WHERE tablename = 'change_orders' AND policyname LIKE '%Field%';

  SELECT COUNT(*) INTO folder_policies
  FROM pg_policies WHERE tablename = 'document_folders' AND policyname LIKE '%Field%';

  SELECT COUNT(*) INTO doc_policies
  FROM pg_policies WHERE tablename = 'documents' AND policyname LIKE '%Field%';

  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'FIELD SYNC ACCESS FIX APPLIED SUCCESSFULLY';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Policies created:';
  RAISE NOTICE '  - Change Orders (COR): % field policies', cor_policies;
  RAISE NOTICE '  - Document Folders: % field policies', folder_policies;
  RAISE NOTICE '  - Documents: % field policies', doc_policies;
  RAISE NOTICE '';
  RAISE NOTICE 'Fixed issues:';
  RAISE NOTICE '  1. CORs created by office now visible to foreman';
  RAISE NOTICE '  2. Documents uploaded by office immediately visible';
  RAISE NOTICE '';
  RAISE NOTICE 'Field users can now:';
  RAISE NOTICE '  - View all CORs for their project (draft, pending, approved)';
  RAISE NOTICE '  - Link T&M tickets to CORs';
  RAISE NOTICE '  - View document folders and download documents';
  RAISE NOTICE '============================================================';
END $$;
