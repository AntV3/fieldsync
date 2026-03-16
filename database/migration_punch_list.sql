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

-- Unified policies using can_access_project() — works for both
-- authenticated (office) and anon (field/foreman) users.
CREATE POLICY punch_list_select ON punch_list_items
  FOR SELECT USING (can_access_project(project_id));

CREATE POLICY punch_list_insert ON punch_list_items
  FOR INSERT WITH CHECK (can_access_project(project_id));

CREATE POLICY punch_list_update ON punch_list_items
  FOR UPDATE
  USING (can_access_project(project_id))
  WITH CHECK (can_access_project(project_id));

CREATE POLICY punch_list_delete ON punch_list_items
  FOR DELETE USING (can_access_project(project_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON punch_list_items TO anon;
