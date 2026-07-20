-- ============================================
-- MEMBERSHIP APPROVAL MIGRATION
-- Adds approval workflow to company membership
-- ============================================

-- ============================================
-- 1. ADD STATUS COLUMN TO USER_COMPANIES
-- ============================================

-- Add status column with default 'active' for backwards compatibility
ALTER TABLE user_companies
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Add constraint for valid status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_companies_status_check'
  ) THEN
    ALTER TABLE user_companies
    ADD CONSTRAINT user_companies_status_check
    CHECK (status IN ('pending', 'active', 'removed'));
  END IF;
END $$;

-- ============================================
-- 2. ADD AUDIT TRAIL COLUMNS
-- ============================================

-- Approval tracking
ALTER TABLE user_companies
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_by UUID;

-- Removal tracking
ALTER TABLE user_companies
ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS removed_by UUID;

-- Add foreign key constraints (if users table exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_companies_approved_by_fkey'
  ) THEN
    ALTER TABLE user_companies
    ADD CONSTRAINT user_companies_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_companies_removed_by_fkey'
  ) THEN
    ALTER TABLE user_companies
    ADD CONSTRAINT user_companies_removed_by_fkey
    FOREIGN KEY (removed_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

-- ============================================
-- 3. CREATE INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_user_companies_status
ON user_companies(status);

CREATE INDEX IF NOT EXISTS idx_user_companies_company_status
ON user_companies(company_id, status);

CREATE INDEX IF NOT EXISTS idx_user_companies_user_status
ON user_companies(user_id, status);

-- ============================================
-- 4. UPDATE RLS POLICIES TO REQUIRE ACTIVE STATUS
-- ============================================

-- Note: These policies ensure pending/removed users cannot access company data

-- CHANGE_ORDERS POLICY
DROP POLICY IF EXISTS "Authenticated users full access to CORs" ON change_orders;
CREATE POLICY "Authenticated users full access to CORs"
ON change_orders FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = change_orders.company_id
    AND uc.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = change_orders.company_id
    AND uc.status = 'active'
  )
);

-- CHANGE_ORDER_LABOR POLICY
DROP POLICY IF EXISTS "Authenticated users full access to labor items" ON change_order_labor;
CREATE POLICY "Authenticated users full access to labor items"
ON change_order_labor FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    JOIN user_companies uc ON uc.company_id = co.company_id
    WHERE co.id = change_order_labor.change_order_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
  )
);

-- CHANGE_ORDER_MATERIALS POLICY
DROP POLICY IF EXISTS "Authenticated users full access to material items" ON change_order_materials;
CREATE POLICY "Authenticated users full access to material items"
ON change_order_materials FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    JOIN user_companies uc ON uc.company_id = co.company_id
    WHERE co.id = change_order_materials.change_order_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
  )
);

-- CHANGE_ORDER_EQUIPMENT POLICY
DROP POLICY IF EXISTS "Authenticated users full access to equipment items" ON change_order_equipment;
CREATE POLICY "Authenticated users full access to equipment items"
ON change_order_equipment FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    JOIN user_companies uc ON uc.company_id = co.company_id
    WHERE co.id = change_order_equipment.change_order_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
  )
);

-- CHANGE_ORDER_SUBCONTRACTORS POLICY
DROP POLICY IF EXISTS "Authenticated users full access to subcontractor items" ON change_order_subcontractors;
CREATE POLICY "Authenticated users full access to subcontractor items"
ON change_order_subcontractors FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    JOIN user_companies uc ON uc.company_id = co.company_id
    WHERE co.id = change_order_subcontractors.change_order_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
  )
);

-- CHANGE_ORDER_TICKET_ASSOCIATIONS POLICY
DROP POLICY IF EXISTS "Authenticated users full access to ticket associations" ON change_order_ticket_associations;
CREATE POLICY "Authenticated users full access to ticket associations"
ON change_order_ticket_associations FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM change_orders co
    JOIN user_companies uc ON uc.company_id = co.company_id
    WHERE co.id = change_order_ticket_associations.change_order_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
  )
);

-- SIGNATURE_REQUESTS POLICY
DROP POLICY IF EXISTS "Company users manage signature requests" ON signature_requests;
CREATE POLICY "Company users manage signature requests"
ON signature_requests FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = signature_requests.company_id
    AND uc.status = 'active'
  )
);

-- SIGNATURES POLICY (via signature_requests)
DROP POLICY IF EXISTS "Signatures access via signature requests" ON signatures;
CREATE POLICY "Signatures access via signature requests"
ON signatures FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM signature_requests sr
    INNER JOIN user_companies uc ON uc.company_id = sr.company_id
    WHERE sr.id = signatures.signature_request_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
  )
  OR
  -- Allow public access for signing (anon users signing their own signature)
  EXISTS (
    SELECT 1 FROM signature_requests sr
    WHERE sr.id = signatures.signature_request_id
    AND sr.token IS NOT NULL
  )
);

-- ============================================
-- 5. USER_COMPANIES RLS FOR MEMBERSHIP MANAGEMENT
-- ============================================

-- Enable RLS on user_companies if not already enabled
ALTER TABLE user_companies ENABLE ROW LEVEL SECURITY;

-- Users can view their own memberships
DROP POLICY IF EXISTS "Users view own memberships" ON user_companies;
CREATE POLICY "Users view own memberships"
ON user_companies FOR SELECT
USING (user_id = auth.uid());

-- Active admins/owners can view all memberships in their company
DROP POLICY IF EXISTS "Admins view company memberships" ON user_companies;
CREATE POLICY "Admins view company memberships"
ON user_companies FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.role IN ('admin', 'owner')
  )
);

-- Active admins/owners can update memberships (approve/remove)
DROP POLICY IF EXISTS "Admins manage company memberships" ON user_companies;
CREATE POLICY "Admins manage company memberships"
ON user_companies FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.role IN ('admin', 'owner')
  )
);

-- Admins can delete pending memberships (reject)
DROP POLICY IF EXISTS "Admins reject pending memberships" ON user_companies;
CREATE POLICY "Admins reject pending memberships"
ON user_companies FOR DELETE
USING (
  user_companies.status = 'pending'
  AND EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.role IN ('admin', 'owner')
  )
);

-- Authenticated users can insert their own pending membership
DROP POLICY IF EXISTS "Users create pending membership" ON user_companies;
CREATE POLICY "Users create pending membership"
ON user_companies FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND status = 'pending'
);

-- Also allow active admins to create memberships (for manual invites)
DROP POLICY IF EXISTS "Admins create memberships" ON user_companies;
CREATE POLICY "Admins create memberships"
ON user_companies FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = user_companies.company_id
    AND uc.status = 'active'
    AND uc.role IN ('admin', 'owner')
  )
);

-- ============================================
-- 6. GRANT PERMISSIONS
-- ============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON user_companies TO authenticated;

-- ============================================
-- 7. DOCUMENTATION
-- ============================================

COMMENT ON COLUMN user_companies.status IS 'Membership status: pending (awaiting approval), active (approved), removed (soft-deleted)';
COMMENT ON COLUMN user_companies.approved_at IS 'Timestamp when membership was approved';
COMMENT ON COLUMN user_companies.approved_by IS 'User ID of admin who approved the membership';
COMMENT ON COLUMN user_companies.removed_at IS 'Timestamp when membership was removed';
COMMENT ON COLUMN user_companies.removed_by IS 'User ID of admin who removed the membership';
