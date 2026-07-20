-- Migration: Billing System (Invoices)
-- Adds invoice generation capability for approved CORs and T&M tickets

-- ============================================
-- FIX: Drop FK constraint on created_by if it exists (too strict)
-- ============================================
DO $$
BEGIN
  -- Drop the FK constraint if it exists
  ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_created_by_fkey;
EXCEPTION
  WHEN undefined_table THEN
    -- Table doesn't exist yet, will be created below
    NULL;
END $$;

-- ============================================
-- INVOICES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Invoice identification
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,

  -- Status workflow: draft → sent → partial → paid
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partial', 'paid', 'void')),

  -- Amounts (stored in cents to avoid floating point issues)
  subtotal INTEGER NOT NULL DEFAULT 0,
  retention_percent INTEGER DEFAULT 0, -- basis points (1000 = 10%)
  retention_amount INTEGER DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  amount_paid INTEGER DEFAULT 0,

  -- Bill To information (cached from project at time of invoice)
  bill_to_name TEXT,
  bill_to_address TEXT,
  bill_to_contact TEXT,

  -- Additional fields
  notes TEXT,
  terms TEXT DEFAULT 'Net 30',

  -- Tracking
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_by UUID, -- User who created (no FK constraint - user validation via RLS)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique invoice numbers per company
  UNIQUE(company_id, invoice_number)
);

-- ============================================
-- INVOICE LINE ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,

  -- Item type: 'cor', 'tm_ticket', 'manual'
  item_type TEXT NOT NULL CHECK (item_type IN ('cor', 'tm_ticket', 'manual')),

  -- Reference to source record (null for manual items)
  reference_id UUID,
  reference_number TEXT, -- COR number or T&M ticket number for display

  -- Line item details
  description TEXT NOT NULL,
  amount INTEGER NOT NULL, -- in cents

  -- Sort order for display
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_reference ON invoice_items(item_type, reference_id);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_invoice_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_invoice_updated_at ON invoices;
CREATE TRIGGER trigger_invoice_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_updated_at();

-- ============================================
-- AUTO-CALCULATE TOTALS TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION recalculate_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_subtotal INTEGER;
  v_retention INTEGER;
BEGIN
  -- Get invoice_id based on operation
  IF TG_OP = 'DELETE' THEN
    -- Calculate new subtotal from remaining items
    SELECT COALESCE(SUM(amount), 0) INTO v_subtotal
    FROM invoice_items
    WHERE invoice_id = OLD.invoice_id;

    -- Update invoice totals
    UPDATE invoices
    SET
      subtotal = v_subtotal,
      retention_amount = (v_subtotal * retention_percent / 10000),
      total = v_subtotal - (v_subtotal * retention_percent / 10000),
      updated_at = NOW()
    WHERE id = OLD.invoice_id;
  ELSE
    -- Calculate new subtotal
    SELECT COALESCE(SUM(amount), 0) INTO v_subtotal
    FROM invoice_items
    WHERE invoice_id = NEW.invoice_id;

    -- Update invoice totals
    UPDATE invoices
    SET
      subtotal = v_subtotal,
      retention_amount = (v_subtotal * retention_percent / 10000),
      total = v_subtotal - (v_subtotal * retention_percent / 10000),
      updated_at = NOW()
    WHERE id = NEW.invoice_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_recalculate_invoice_totals ON invoice_items;
CREATE TRIGGER trigger_recalculate_invoice_totals
  AFTER INSERT OR UPDATE OR DELETE ON invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_invoice_totals();

-- ============================================
-- NEXT INVOICE NUMBER FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION get_next_invoice_number(p_company_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_max_num INTEGER;
  v_next_num INTEGER;
BEGIN
  -- Get highest existing invoice number for this company
  SELECT COALESCE(MAX(
    CASE
      WHEN invoice_number ~ '^INV-[0-9]+$'
      THEN CAST(SUBSTRING(invoice_number FROM 5) AS INTEGER)
      ELSE 0
    END
  ), 0) INTO v_max_num
  FROM invoices
  WHERE company_id = p_company_id;

  v_next_num := v_max_num + 1;

  RETURN 'INV-' || LPAD(v_next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

-- Invoices policies
DROP POLICY IF EXISTS "Users can view invoices for their company" ON invoices;
CREATE POLICY "Users can view invoices for their company" ON invoices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = invoices.company_id
      AND uc.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can create invoices for their company" ON invoices;
CREATE POLICY "Users can create invoices for their company" ON invoices
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = invoices.company_id
      AND uc.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can update invoices for their company" ON invoices;
CREATE POLICY "Users can update invoices for their company" ON invoices
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = invoices.company_id
      AND uc.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can delete draft invoices for their company" ON invoices;
CREATE POLICY "Users can delete draft invoices for their company" ON invoices
  FOR DELETE USING (
    status = 'draft' AND
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = invoices.company_id
      AND uc.status = 'active'
    )
  );

-- Invoice items policies
DROP POLICY IF EXISTS "Users can manage invoice items" ON invoice_items;
CREATE POLICY "Users can manage invoice items" ON invoice_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM invoices i
      JOIN user_companies uc ON uc.company_id = i.company_id
      WHERE i.id = invoice_items.invoice_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
    )
  );

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
GRANT ALL ON invoices TO authenticated;
GRANT ALL ON invoice_items TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_invoice_number TO authenticated;
