-- Migration: Project Costs Table
-- Allows users to add custom cost contributors beyond auto-tracked labor and haul-off costs

-- Create project_costs table
CREATE TABLE IF NOT EXISTS project_costs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('labor', 'materials', 'equipment', 'subcontractor', 'disposal', 'other')),
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  cost_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_project_costs_project_id ON project_costs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_costs_company_id ON project_costs(company_id);
CREATE INDEX IF NOT EXISTS idx_project_costs_category ON project_costs(category);
CREATE INDEX IF NOT EXISTS idx_project_costs_cost_date ON project_costs(cost_date);

-- Enable RLS
ALTER TABLE project_costs ENABLE ROW LEVEL SECURITY;

-- Policy: Allow users to view/manage costs for their company's projects
CREATE POLICY "Allow company users to manage project costs" ON project_costs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      INNER JOIN users u ON u.company_id = p.company_id
      WHERE p.id = project_costs.project_id
      AND u.id = auth.uid()
    )
  );

-- Trigger to auto-update updated_at
CREATE TRIGGER update_project_costs_updated_at
  BEFORE UPDATE ON project_costs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
