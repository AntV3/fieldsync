-- Schedule of Values (SOV) and Pay Application Migration
-- Implements contract value tracking and pay app generation
-- Run this in your Supabase SQL Editor

-- ================================================
-- SCHEDULE OF VALUES TABLE
-- ================================================
-- Stores pay application line items (like AIA G703)

CREATE TABLE IF NOT EXISTS schedule_of_values (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Line item details
  line_number TEXT NOT NULL, -- "1", "2.1", "3A", etc.
  description TEXT NOT NULL, -- "Site Work", "Concrete Foundation", etc.

  -- Financial tracking (matches AIA G703 columns)
  scheduled_value DECIMAL(12, 2) NOT NULL DEFAULT 0, -- Original bid amount
  work_completed_prev DECIMAL(12, 2) DEFAULT 0, -- Work from previous pay apps
  work_completed_this_period DECIMAL(12, 2) DEFAULT 0, -- New work this period
  work_completed_to_date DECIMAL(12, 2) DEFAULT 0, -- Total earned (prev + this)
  percent_complete DECIMAL(5, 2) DEFAULT 0, -- 0-100%
  materials_stored DECIMAL(12, 2) DEFAULT 0, -- Materials on site not installed
  balance_to_finish DECIMAL(12, 2) GENERATED ALWAYS AS (
    scheduled_value - work_completed_to_date - materials_stored
  ) STORED,

  -- Metadata
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,

  -- Earned value calculation method
  calc_method TEXT DEFAULT 'area_distribution'
    CHECK (calc_method IN ('area_distribution', 'tm_actual', 'manual')),

  -- Audit fields
  created_by_id UUID REFERENCES auth.users(id),
  created_by_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by_id UUID REFERENCES auth.users(id),
  updated_by_name TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(project_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_sov_project_id ON schedule_of_values(project_id);
CREATE INDEX IF NOT EXISTS idx_sov_active ON schedule_of_values(is_active);
CREATE INDEX IF NOT EXISTS idx_sov_sort ON schedule_of_values(project_id, sort_order);

-- ================================================
-- PAY APPLICATIONS TABLE
-- ================================================
-- Stores pay app submissions (like AIA G702)

CREATE TABLE IF NOT EXISTS pay_applications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Pay app identification
  application_number INTEGER NOT NULL, -- 1, 2, 3...
  period_from DATE,
  period_to DATE NOT NULL,

  -- Financial summary (from G702)
  total_contract_value DECIMAL(12, 2) NOT NULL,
  work_completed_to_date DECIMAL(12, 2) NOT NULL,
  retainage_percent DECIMAL(5, 2) DEFAULT 10.00,
  retainage_amount DECIMAL(12, 2) DEFAULT 0,
  total_earned_less_retainage DECIMAL(12, 2) DEFAULT 0,
  previous_payment DECIMAL(12, 2) DEFAULT 0,
  current_payment_due DECIMAL(12, 2) DEFAULT 0,
  balance_to_finish DECIMAL(12, 2) DEFAULT 0,

  -- Change orders
  change_order_total DECIMAL(12, 2) DEFAULT 0,

  -- Status tracking
  status TEXT DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'paid', 'rejected')),
  submitted_at TIMESTAMP WITH TIME ZONE,
  approved_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,

  -- Approval
  approved_by_id UUID REFERENCES auth.users(id),
  approved_by_name TEXT,

  -- Audit fields
  created_by_id UUID REFERENCES auth.users(id),
  created_by_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by_id UUID REFERENCES auth.users(id),
  updated_by_name TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(project_id, application_number)
);

CREATE INDEX IF NOT EXISTS idx_pay_apps_project_id ON pay_applications(project_id);
CREATE INDEX IF NOT EXISTS idx_pay_apps_status ON pay_applications(status);
CREATE INDEX IF NOT EXISTS idx_pay_apps_period ON pay_applications(period_to);

-- ================================================
-- PAY APPLICATION LINE ITEMS (SNAPSHOT)
-- ================================================
-- Stores a snapshot of SOV values at time of pay app submission

CREATE TABLE IF NOT EXISTS pay_application_line_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pay_app_id UUID NOT NULL REFERENCES pay_applications(id) ON DELETE CASCADE,
  sov_line_id UUID REFERENCES schedule_of_values(id) ON DELETE SET NULL,

  -- Snapshot of SOV line at time of submission
  line_number TEXT NOT NULL,
  description TEXT NOT NULL,
  scheduled_value DECIMAL(12, 2) NOT NULL,
  work_completed_prev DECIMAL(12, 2) DEFAULT 0,
  work_completed_this_period DECIMAL(12, 2) DEFAULT 0,
  work_completed_to_date DECIMAL(12, 2) DEFAULT 0,
  percent_complete DECIMAL(5, 2) DEFAULT 0,
  materials_stored DECIMAL(12, 2) DEFAULT 0,
  retainage_amount DECIMAL(12, 2) DEFAULT 0,
  balance_to_finish DECIMAL(12, 2) DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pay_app_lines_app_id ON pay_application_line_items(pay_app_id);

-- ================================================
-- LINK AREAS TO SOV LINES
-- ================================================

ALTER TABLE areas
ADD COLUMN IF NOT EXISTS sov_line_id UUID REFERENCES schedule_of_values(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS earned_value DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS earned_value_method TEXT DEFAULT 'auto'
  CHECK (earned_value_method IN ('auto', 'manual'));

CREATE INDEX IF NOT EXISTS idx_areas_sov_line ON areas(sov_line_id);

-- ================================================
-- LINK T&M TICKETS TO SOV LINES
-- ================================================

ALTER TABLE t_and_m_tickets
ADD COLUMN IF NOT EXISTS sov_line_id UUID REFERENCES schedule_of_values(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS earned_value DECIMAL(12, 2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tm_tickets_sov_line ON t_and_m_tickets(sov_line_id);

-- ================================================
-- FUNCTIONS FOR EARNED VALUE CALCULATION
-- ================================================

-- Function to calculate total earned value for an SOV line
CREATE OR REPLACE FUNCTION calculate_sov_earned_value(sov_line_id UUID)
RETURNS DECIMAL(12, 2) AS $$
DECLARE
  earned_from_areas DECIMAL(12, 2);
  earned_from_tm DECIMAL(12, 2);
  calc_method TEXT;
  scheduled_val DECIMAL(12, 2);
  total_areas INTEGER;
BEGIN
  -- Get the calculation method and scheduled value
  SELECT calc_method, scheduled_value INTO calc_method, scheduled_val
  FROM schedule_of_values WHERE id = sov_line_id;

  -- Calculate earned value from completed areas
  IF calc_method = 'area_distribution' THEN
    -- Count total areas linked to this SOV line
    SELECT COUNT(*) INTO total_areas
    FROM areas WHERE sov_line_id = sov_line_id;

    -- Equal distribution: completed areas * (scheduled_value / total_areas)
    IF total_areas > 0 THEN
      SELECT (COUNT(*) FILTER (WHERE status = 'done') * scheduled_val / total_areas)
      INTO earned_from_areas
      FROM areas WHERE areas.sov_line_id = sov_line_id;
    ELSE
      earned_from_areas := 0;
    END IF;
  ELSIF calc_method = 'manual' THEN
    -- Sum manual earned_value entries
    SELECT COALESCE(SUM(earned_value), 0) INTO earned_from_areas
    FROM areas WHERE areas.sov_line_id = sov_line_id AND status = 'done';
  ELSE
    earned_from_areas := 0;
  END IF;

  -- Calculate earned value from approved T&M tickets
  IF calc_method = 'tm_actual' THEN
    -- Sum actual costs from approved T&M tickets
    SELECT COALESCE(SUM(tm.earned_value), 0) INTO earned_from_tm
    FROM t_and_m_tickets tm
    WHERE tm.sov_line_id = sov_line_id AND tm.status = 'approved';
  ELSE
    earned_from_tm := 0;
  END IF;

  RETURN COALESCE(earned_from_areas, 0) + COALESCE(earned_from_tm, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to update SOV line when area status changes
CREATE OR REPLACE FUNCTION update_sov_on_area_change()
RETURNS TRIGGER AS $$
DECLARE
  new_earned DECIMAL(12, 2);
BEGIN
  -- Only update if area is linked to SOV line
  IF NEW.sov_line_id IS NOT NULL THEN
    -- Recalculate earned value for this SOV line
    new_earned := calculate_sov_earned_value(NEW.sov_line_id);

    -- Update the SOV line
    UPDATE schedule_of_values
    SET work_completed_this_period = new_earned - work_completed_prev,
        work_completed_to_date = new_earned,
        percent_complete = CASE
          WHEN scheduled_value > 0 THEN (new_earned / scheduled_value * 100)
          ELSE 0
        END,
        updated_at = NOW()
    WHERE id = NEW.sov_line_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update SOV when area status changes
DROP TRIGGER IF EXISTS trigger_update_sov_on_area_change ON areas;
CREATE TRIGGER trigger_update_sov_on_area_change
  AFTER UPDATE OF status ON areas
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION update_sov_on_area_change();

-- Function to update SOV line when T&M ticket is approved
CREATE OR REPLACE FUNCTION update_sov_on_tm_approval()
RETURNS TRIGGER AS $$
DECLARE
  new_earned DECIMAL(12, 2);
  labor_cost DECIMAL(12, 2);
  materials_cost DECIMAL(12, 2);
BEGIN
  -- Only update if ticket is linked to SOV line and was just approved
  IF NEW.sov_line_id IS NOT NULL AND NEW.status = 'approved' AND OLD.status != 'approved' THEN
    -- Calculate labor costs
    SELECT COALESCE(SUM(hours * 75 + overtime_hours * 112.5), 0) INTO labor_cost
    FROM t_and_m_workers WHERE ticket_id = NEW.id;
    -- Assumes $75/hr regular, $112.50/hr overtime (1.5x)

    -- Calculate materials costs (if you have pricing in materials_equipment)
    SELECT COALESCE(SUM(i.quantity * COALESCE(m.cost_per_unit, 0)), 0) INTO materials_cost
    FROM t_and_m_items i
    LEFT JOIN materials_equipment m ON i.material_equipment_id = m.id
    WHERE i.ticket_id = NEW.id;

    -- Update earned_value on the ticket
    UPDATE t_and_m_tickets
    SET earned_value = labor_cost + materials_cost
    WHERE id = NEW.id;

    -- Recalculate earned value for this SOV line
    new_earned := calculate_sov_earned_value(NEW.sov_line_id);

    -- Update the SOV line
    UPDATE schedule_of_values
    SET work_completed_this_period = new_earned - work_completed_prev,
        work_completed_to_date = new_earned,
        percent_complete = CASE
          WHEN scheduled_value > 0 THEN (new_earned / scheduled_value * 100)
          ELSE 0
        END,
        updated_at = NOW()
    WHERE id = NEW.sov_line_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update SOV when T&M ticket is approved
DROP TRIGGER IF EXISTS trigger_update_sov_on_tm_approval ON t_and_m_tickets;
CREATE TRIGGER trigger_update_sov_on_tm_approval
  AFTER UPDATE OF status ON t_and_m_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_sov_on_tm_approval();

-- ================================================
-- ENABLE ROW LEVEL SECURITY
-- ================================================

ALTER TABLE schedule_of_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_application_line_items ENABLE ROW LEVEL SECURITY;

-- Office/Admin can manage SOV
CREATE POLICY "Office can manage SOV" ON schedule_of_values
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('office', 'admin')
    )
  );

-- Field users can view SOV for assigned projects
CREATE POLICY "Users can view SOV for assigned projects" ON schedule_of_values
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      LEFT JOIN project_assignments pa ON pa.project_id = p.id
      LEFT JOIN profiles pr ON pr.id = auth.uid()
      WHERE p.id = schedule_of_values.project_id
      AND (pr.role IN ('office', 'admin') OR pa.user_id = auth.uid())
    )
  );

-- Office/Admin can manage pay applications
CREATE POLICY "Office can manage pay apps" ON pay_applications
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('office', 'admin')
    )
  );

-- Field users can view pay apps for assigned projects
CREATE POLICY "Users can view pay apps for assigned projects" ON pay_applications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      LEFT JOIN project_assignments pa ON pa.project_id = p.id
      LEFT JOIN profiles pr ON pr.id = auth.uid()
      WHERE p.id = pay_applications.project_id
      AND (pr.role IN ('office', 'admin') OR pa.user_id = auth.uid())
    )
  );

-- Line items inherit pay app permissions
CREATE POLICY "Users can view pay app line items" ON pay_application_line_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pay_applications pa
      WHERE pa.id = pay_application_line_items.pay_app_id
    )
  );

-- ================================================
-- UPDATE TRIGGERS FOR TIMESTAMP
-- ================================================

CREATE TRIGGER update_sov_updated_at
  BEFORE UPDATE ON schedule_of_values
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pay_apps_updated_at
  BEFORE UPDATE ON pay_applications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- ENABLE REALTIME (OPTIONAL)
-- ================================================

-- ALTER PUBLICATION supabase_realtime ADD TABLE schedule_of_values;
-- ALTER PUBLICATION supabase_realtime ADD TABLE pay_applications;

-- ================================================
-- SAMPLE DATA (FOR TESTING)
-- ================================================

-- Uncomment to insert sample SOV for a project:
/*
INSERT INTO schedule_of_values (project_id, line_number, description, scheduled_value, calc_method)
VALUES
  ('YOUR-PROJECT-ID', '1', 'Site Work & Demolition', 45000.00, 'area_distribution'),
  ('YOUR-PROJECT-ID', '2', 'Concrete Foundation', 125000.00, 'area_distribution'),
  ('YOUR-PROJECT-ID', '3', 'Structural Steel', 85000.00, 'tm_actual'),
  ('YOUR-PROJECT-ID', '4', 'Framing', 95000.00, 'area_distribution'),
  ('YOUR-PROJECT-ID', '5', 'Electrical', 55000.00, 'tm_actual'),
  ('YOUR-PROJECT-ID', '6', 'Plumbing', 48000.00, 'tm_actual'),
  ('YOUR-PROJECT-ID', '7', 'HVAC', 67000.00, 'tm_actual'),
  ('YOUR-PROJECT-ID', '8', 'Finishes', 78000.00, 'area_distribution');
*/
