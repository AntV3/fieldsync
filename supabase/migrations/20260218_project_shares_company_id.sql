-- ============================================================
-- CRITICAL-3 FIX: Add company_id to project_shares
-- ============================================================
-- The project_shares table had no company_id column, requiring
-- all company-level filtering to JOIN through projects.
-- This is slow at scale and inconsistent with every other table
-- in the schema that has a direct company_id column.
--
-- This migration:
--  1. Adds company_id column
--  2. Backfills it from the linked project
--  3. Adds NOT NULL constraint and FK
--  4. Adds index for fast company-level queries
--  5. Updates the management RLS policy to use company_id directly
-- ============================================================

-- Step 1: Add nullable column first to allow backfill
ALTER TABLE project_shares
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Step 2: Backfill from linked project
UPDATE project_shares ps
SET company_id = p.company_id
FROM projects p
WHERE p.id = ps.project_id
  AND ps.company_id IS NULL;

-- Step 3: Make NOT NULL now that all rows are populated
ALTER TABLE project_shares
  ALTER COLUMN company_id SET NOT NULL;

-- Step 4: Index for company-level listing queries
CREATE INDEX IF NOT EXISTS idx_project_shares_company
  ON project_shares(company_id);

-- Step 5: Update management policy to use company_id directly (avoids JOIN)
DROP POLICY IF EXISTS "Allow company users to manage shares" ON project_shares;
CREATE POLICY "Allow company users to manage shares"
ON project_shares FOR ALL
USING (
  company_id IN (
    SELECT uc.company_id FROM user_companies uc
    WHERE uc.user_id = auth.uid()
      AND uc.status = 'active'
  )
);

-- Step 6: Ensure future inserts always provide company_id.
-- Add a trigger to auto-populate it if omitted.
CREATE OR REPLACE FUNCTION set_project_share_company_id()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    SELECT company_id INTO NEW.company_id
    FROM projects WHERE id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_shares_company_id ON project_shares;
CREATE TRIGGER trg_project_shares_company_id
  BEFORE INSERT ON project_shares
  FOR EACH ROW EXECUTE FUNCTION set_project_share_company_id();

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'CRITICAL-3 FIX APPLIED: company_id added to project_shares';
  RAISE NOTICE 'RLS policy updated to use direct company_id lookup (no JOIN)';
  RAISE NOTICE '============================================================';
END $$;
