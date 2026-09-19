-- ============================================
-- Close the pending/removed-member RLS gap on Sage-parity tables
-- ============================================
--
-- The original policies in 20260401_sage_parity.sql use the inline
-- subquery
--   company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid())
-- with no `status = 'active'` filter. Because JoinCompany.jsx inserts a
-- user_companies row with status='pending' the moment a user requests to
-- join a company, and companyOps.removeMember() soft-deletes to
-- status='removed', both a not-yet-approved joiner and an ex-employee
-- keep full CRUD access to that company's RFIs, submittals, cost codes,
-- and their attachments — until the row is hard-deleted.
--
-- can_access_project() (20260218_secure_field_rls.sql) and
-- user_company_ids() (20260720_enable_rls_remaining_tables.sql) both
-- correctly check status; mirror that here.
--
-- Idempotent: drops the old permissive policies by name and recreates
-- them with the status guard.

-- ----- cost_codes -----
DROP POLICY IF EXISTS "Users can view their company cost codes" ON cost_codes;
DROP POLICY IF EXISTS "Admins can manage cost codes"            ON cost_codes;

CREATE POLICY "Users can view their company cost codes" ON cost_codes
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM user_companies
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Admins can manage cost codes" ON cost_codes
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM user_companies
      WHERE user_id = auth.uid()
        AND status = 'active'
        AND role IN ('administrator', 'admin')
    )
  );

-- ----- rfis -----
DROP POLICY IF EXISTS "Users can view project RFIs"   ON rfis;
DROP POLICY IF EXISTS "Users can manage project RFIs" ON rfis;

CREATE POLICY "Users can view project RFIs" ON rfis
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM user_companies
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Users can manage project RFIs" ON rfis
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM user_companies
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ----- rfi_attachments -----
DROP POLICY IF EXISTS "Users can view RFI attachments"   ON rfi_attachments;
DROP POLICY IF EXISTS "Users can manage RFI attachments" ON rfi_attachments;

CREATE POLICY "Users can view RFI attachments" ON rfi_attachments
  FOR SELECT USING (
    rfi_id IN (
      SELECT id FROM rfis WHERE company_id IN (
        SELECT company_id FROM user_companies
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

CREATE POLICY "Users can manage RFI attachments" ON rfi_attachments
  FOR ALL USING (
    rfi_id IN (
      SELECT id FROM rfis WHERE company_id IN (
        SELECT company_id FROM user_companies
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

-- ----- submittals -----
DROP POLICY IF EXISTS "Users can view project submittals"   ON submittals;
DROP POLICY IF EXISTS "Users can manage project submittals" ON submittals;

CREATE POLICY "Users can view project submittals" ON submittals
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM user_companies
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Users can manage project submittals" ON submittals
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM user_companies
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ----- submittal_attachments -----
DROP POLICY IF EXISTS "Users can view submittal attachments"   ON submittal_attachments;
DROP POLICY IF EXISTS "Users can manage submittal attachments" ON submittal_attachments;

CREATE POLICY "Users can view submittal attachments" ON submittal_attachments
  FOR SELECT USING (
    submittal_id IN (
      SELECT id FROM submittals WHERE company_id IN (
        SELECT company_id FROM user_companies
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

CREATE POLICY "Users can manage submittal attachments" ON submittal_attachments
  FOR ALL USING (
    submittal_id IN (
      SELECT id FROM submittals WHERE company_id IN (
        SELECT company_id FROM user_companies
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );
