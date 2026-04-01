-- ============================================
-- Sage Parity Migration
-- Adds: Cost Codes, RFI Tracking, Submittal Tracking
-- ============================================

-- ============================================
-- 1. Cost Codes (Job Costing Structure)
-- Maps to Sage's job/phase/cost-code hierarchy
-- ============================================

CREATE TABLE IF NOT EXISTS cost_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                    -- e.g. "01-100", "03-200"
  description TEXT NOT NULL,             -- e.g. "General Conditions - Supervision"
  category TEXT NOT NULL DEFAULT 'labor' CHECK (category IN ('labor', 'material', 'equipment', 'subcontractor', 'other')),
  parent_code TEXT,                      -- For hierarchical grouping (phase level)
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_cost_codes_company ON cost_codes(company_id);
CREATE INDEX IF NOT EXISTS idx_cost_codes_category ON cost_codes(category);
CREATE INDEX IF NOT EXISTS idx_cost_codes_active ON cost_codes(company_id, is_active);

ALTER TABLE cost_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company cost codes" ON cost_codes
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can manage cost codes" ON cost_codes
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM user_companies
      WHERE user_id = auth.uid() AND role IN ('administrator', 'admin')
    )
  );

-- Add cost_code_id to T&M tickets for job costing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 't_and_m_tickets' AND column_name = 'cost_code_id') THEN
    ALTER TABLE t_and_m_tickets ADD COLUMN cost_code_id UUID REFERENCES cost_codes(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tm_tickets_cost_code ON t_and_m_tickets(cost_code_id);

-- Add cost_code_id to areas for progress-to-cost mapping
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'areas' AND column_name = 'cost_code_id') THEN
    ALTER TABLE areas ADD COLUMN cost_code_id UUID REFERENCES cost_codes(id);
  END IF;
END $$;

-- Add cost_code_id to custom_costs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_costs' AND column_name = 'cost_code_id') THEN
    ALTER TABLE custom_costs ADD COLUMN cost_code_id UUID REFERENCES cost_codes(id);
  END IF;
END $$;

-- ============================================
-- 2. RFI (Request for Information) Tracking
-- ============================================

CREATE TABLE IF NOT EXISTS rfis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  rfi_number INTEGER NOT NULL,
  subject TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'answered', 'closed')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  cost_impact BOOLEAN DEFAULT false,
  schedule_impact BOOLEAN DEFAULT false,
  cost_impact_amount INTEGER DEFAULT 0,          -- cents
  schedule_impact_days INTEGER DEFAULT 0,
  assigned_to TEXT,                               -- Name or email of responsible party
  submitted_by UUID REFERENCES auth.users(id),
  answered_by TEXT,                               -- Could be external party
  due_date DATE,
  submitted_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, rfi_number)
);

CREATE INDEX IF NOT EXISTS idx_rfis_project ON rfis(project_id);
CREATE INDEX IF NOT EXISTS idx_rfis_status ON rfis(status);
CREATE INDEX IF NOT EXISTS idx_rfis_company ON rfis(company_id);

ALTER TABLE rfis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view project RFIs" ON rfis
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can manage project RFIs" ON rfis
  FOR ALL USING (
    company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid())
  );

-- RFI attachments
CREATE TABLE IF NOT EXISTS rfi_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rfi_id UUID NOT NULL REFERENCES rfis(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rfi_attachments_rfi ON rfi_attachments(rfi_id);

ALTER TABLE rfi_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view RFI attachments" ON rfi_attachments
  FOR SELECT USING (
    rfi_id IN (SELECT id FROM rfis WHERE company_id IN (
      SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "Users can manage RFI attachments" ON rfi_attachments
  FOR ALL USING (
    rfi_id IN (SELECT id FROM rfis WHERE company_id IN (
      SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    ))
  );

-- ============================================
-- 3. Submittal Tracking
-- ============================================

CREATE TABLE IF NOT EXISTS submittals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  submittal_number INTEGER NOT NULL,
  revision INTEGER DEFAULT 0,
  spec_section TEXT,                             -- e.g. "03 30 00" for concrete
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'submitted', 'under_review', 'approved',
    'approved_as_noted', 'revise_resubmit', 'rejected', 'closed'
  )),
  submittal_type TEXT DEFAULT 'shop_drawing' CHECK (submittal_type IN (
    'shop_drawing', 'product_data', 'sample', 'mock_up',
    'test_report', 'certificate', 'design_data', 'other'
  )),
  submitted_to TEXT,                             -- GC, architect, engineer name
  submitted_by UUID REFERENCES auth.users(id),
  responsible_contractor TEXT,                   -- Sub who provides the submittal
  lead_time_days INTEGER DEFAULT 0,
  required_date DATE,
  submitted_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  cost_code_id UUID REFERENCES cost_codes(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, submittal_number, revision)
);

CREATE INDEX IF NOT EXISTS idx_submittals_project ON submittals(project_id);
CREATE INDEX IF NOT EXISTS idx_submittals_status ON submittals(status);
CREATE INDEX IF NOT EXISTS idx_submittals_company ON submittals(company_id);
CREATE INDEX IF NOT EXISTS idx_submittals_spec ON submittals(spec_section);

ALTER TABLE submittals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view project submittals" ON submittals
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can manage project submittals" ON submittals
  FOR ALL USING (
    company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid())
  );

-- Submittal attachments
CREATE TABLE IF NOT EXISTS submittal_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submittal_id UUID NOT NULL REFERENCES submittals(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  is_response BOOLEAN DEFAULT false,             -- true = returned by reviewer
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submittal_attachments_submittal ON submittal_attachments(submittal_id);

ALTER TABLE submittal_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view submittal attachments" ON submittal_attachments
  FOR SELECT USING (
    submittal_id IN (SELECT id FROM submittals WHERE company_id IN (
      SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "Users can manage submittal attachments" ON submittal_attachments
  FOR ALL USING (
    submittal_id IN (SELECT id FROM submittals WHERE company_id IN (
      SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    ))
  );
