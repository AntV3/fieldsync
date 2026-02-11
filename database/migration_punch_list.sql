-- ============================================
-- Punch List Items
-- ============================================
-- Tracks deficiency items that need resolution before project closeout.
-- Items are linked to projects and optionally to work areas.

CREATE TABLE IF NOT EXISTS punch_list_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  area_id UUID REFERENCES areas(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'complete')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  assigned_to TEXT,
  notes TEXT,
  photo_url TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_punch_list_project ON punch_list_items(project_id);
CREATE INDEX IF NOT EXISTS idx_punch_list_status ON punch_list_items(project_id, status);
CREATE INDEX IF NOT EXISTS idx_punch_list_area ON punch_list_items(area_id);

-- Row Level Security
ALTER TABLE punch_list_items ENABLE ROW LEVEL SECURITY;

-- Users can read punch items for projects they belong to
CREATE POLICY punch_list_select ON punch_list_items
  FOR SELECT USING (
    company_id IN (
      SELECT uc.company_id FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.status = 'active'
    )
  );

-- Users can insert punch items for their company's projects
CREATE POLICY punch_list_insert ON punch_list_items
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT uc.company_id FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.status = 'active'
    )
  );

-- Users can update punch items for their company's projects
CREATE POLICY punch_list_update ON punch_list_items
  FOR UPDATE USING (
    company_id IN (
      SELECT uc.company_id FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.status = 'active'
    )
  );

-- Users can delete punch items for their company's projects
CREATE POLICY punch_list_delete ON punch_list_items
  FOR DELETE USING (
    company_id IN (
      SELECT uc.company_id FROM user_companies uc
      WHERE uc.user_id = auth.uid()
      AND uc.status = 'active'
    )
  );
