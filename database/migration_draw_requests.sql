-- Migration: Progress Billing / Draw Requests
-- Create draw requests (pay applications) based on schedule of values

-- ============================================
-- DRAW REQUESTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS draw_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Draw identification
  draw_number INTEGER NOT NULL,
  period_start DATE,
  period_end DATE,

  -- Status workflow: draft → submitted → approved → paid
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'paid', 'rejected')),

  -- Contract amounts (stored in cents)
  original_contract INTEGER NOT NULL DEFAULT 0,
  approved_changes INTEGER NOT NULL DEFAULT 0, -- Sum of approved CORs
  revised_contract INTEGER GENERATED ALWAYS AS (original_contract + approved_changes) STORED,

  -- Billing amounts (stored in cents)
  previous_billings INTEGER NOT NULL DEFAULT 0,
  current_billing INTEGER NOT NULL DEFAULT 0,
  total_completed INTEGER GENERATED ALWAYS AS (previous_billings + current_billing) STORED,

  -- Retention
  retention_percent INTEGER NOT NULL DEFAULT 1000, -- basis points (1000 = 10%)
  retention_held INTEGER NOT NULL DEFAULT 0,
  previous_retention INTEGER NOT NULL DEFAULT 0,

  -- Net amounts
  current_payment_due INTEGER GENERATED ALWAYS AS (current_billing - (retention_held - previous_retention)) STORED,

  -- Balance
  balance_to_finish INTEGER GENERATED ALWAYS AS (original_contract + approved_changes - previous_billings - current_billing) STORED,

  -- Metadata
  notes TEXT,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  -- Tracking
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique draw numbers per project
  UNIQUE(project_id, draw_number)
);

-- ============================================
-- DRAW REQUEST LINE ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS draw_request_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  draw_request_id UUID NOT NULL REFERENCES draw_requests(id) ON DELETE CASCADE,

  -- Reference to area (schedule of values item)
  area_id UUID REFERENCES areas(id) ON DELETE SET NULL,
  item_number TEXT, -- e.g., "1", "1.1", "2"
  description TEXT NOT NULL, -- Area name or description

  -- Scheduled value (from area's contract value, in cents)
  scheduled_value INTEGER NOT NULL DEFAULT 0,

  -- Previous work (percentage in basis points, amount in cents)
  previous_percent INTEGER NOT NULL DEFAULT 0, -- basis points (5000 = 50%)
  previous_amount INTEGER NOT NULL DEFAULT 0,

  -- This period work
  current_percent INTEGER NOT NULL DEFAULT 0, -- basis points
  current_amount INTEGER NOT NULL DEFAULT 0,

  -- Total completed
  total_percent INTEGER GENERATED ALWAYS AS (previous_percent + current_percent) STORED,
  total_amount INTEGER GENERATED ALWAYS AS (previous_amount + current_amount) STORED,

  -- Balance to finish
  balance_to_finish INTEGER GENERATED ALWAYS AS (scheduled_value - previous_amount - current_amount) STORED,

  -- Sort order
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_draw_requests_project ON draw_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_draw_requests_company ON draw_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_draw_requests_status ON draw_requests(status);
CREATE INDEX IF NOT EXISTS idx_draw_requests_number ON draw_requests(project_id, draw_number DESC);
CREATE INDEX IF NOT EXISTS idx_draw_request_items_draw ON draw_request_items(draw_request_id);
CREATE INDEX IF NOT EXISTS idx_draw_request_items_area ON draw_request_items(area_id);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_draw_request_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_draw_request_updated_at ON draw_requests;
CREATE TRIGGER trigger_draw_request_updated_at
  BEFORE UPDATE ON draw_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_draw_request_updated_at();

-- ============================================
-- AUTO-CALCULATE TOTALS TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION recalculate_draw_request_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_current_billing INTEGER;
  v_draw_id UUID;
  v_retention_percent INTEGER;
  v_previous_retention INTEGER;
BEGIN
  -- Get draw_request_id based on operation
  IF TG_OP = 'DELETE' THEN
    v_draw_id := OLD.draw_request_id;
  ELSE
    v_draw_id := NEW.draw_request_id;
  END IF;

  -- Calculate current billing from all items
  SELECT COALESCE(SUM(current_amount), 0) INTO v_current_billing
  FROM draw_request_items
  WHERE draw_request_id = v_draw_id;

  -- Get retention info
  SELECT retention_percent, previous_retention INTO v_retention_percent, v_previous_retention
  FROM draw_requests
  WHERE id = v_draw_id;

  -- Update draw request totals
  UPDATE draw_requests
  SET
    current_billing = v_current_billing,
    retention_held = ((previous_billings + v_current_billing) * retention_percent / 10000),
    updated_at = NOW()
  WHERE id = v_draw_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_recalculate_draw_totals ON draw_request_items;
CREATE TRIGGER trigger_recalculate_draw_totals
  AFTER INSERT OR UPDATE OR DELETE ON draw_request_items
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_draw_request_totals();

-- ============================================
-- GET NEXT DRAW NUMBER FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION get_next_draw_number(p_project_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_max_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(draw_number), 0) INTO v_max_num
  FROM draw_requests
  WHERE project_id = p_project_id;

  RETURN v_max_num + 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- GET PREVIOUS BILLING TOTALS FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION get_previous_billing_totals(p_project_id UUID)
RETURNS TABLE(
  total_billed INTEGER,
  total_retention INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(current_billing), 0)::INTEGER as total_billed,
    COALESCE(MAX(retention_held), 0)::INTEGER as total_retention
  FROM draw_requests
  WHERE project_id = p_project_id
  AND status IN ('submitted', 'approved', 'paid');
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE draw_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE draw_request_items ENABLE ROW LEVEL SECURITY;

-- Draw requests policies
DROP POLICY IF EXISTS "Users can view draw requests for their company" ON draw_requests;
CREATE POLICY "Users can view draw requests for their company" ON draw_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = draw_requests.company_id
      AND uc.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can create draw requests for their company" ON draw_requests;
CREATE POLICY "Users can create draw requests for their company" ON draw_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = draw_requests.company_id
      AND uc.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can update draw requests for their company" ON draw_requests;
CREATE POLICY "Users can update draw requests for their company" ON draw_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = draw_requests.company_id
      AND uc.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can delete draft draw requests" ON draw_requests;
CREATE POLICY "Users can delete draft draw requests" ON draw_requests
  FOR DELETE USING (
    status = 'draft' AND
    EXISTS (
      SELECT 1 FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.company_id = draw_requests.company_id
      AND uc.status = 'active'
    )
  );

-- Draw request items policies
DROP POLICY IF EXISTS "Users can manage draw request items" ON draw_request_items;
CREATE POLICY "Users can manage draw request items" ON draw_request_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM draw_requests dr
      JOIN user_companies uc ON uc.company_id = dr.company_id
      WHERE dr.id = draw_request_items.draw_request_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
    )
  );

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
GRANT ALL ON draw_requests TO authenticated;
GRANT ALL ON draw_request_items TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_draw_number TO authenticated;
GRANT EXECUTE ON FUNCTION get_previous_billing_totals TO authenticated;
