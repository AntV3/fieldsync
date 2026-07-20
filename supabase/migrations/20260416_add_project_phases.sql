-- ============================================================
-- FieldSync Migration: PROJECT PHASES
-- ============================================================
-- Adds a first-class `project_phases` metadata table keyed by
-- (project_id, name). The `areas.group_name` column continues
-- to be the string join key so existing data keeps working.
--
-- Run in Supabase SQL Editor. Safe to re-run (idempotent).
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLE
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS project_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  planned_start_date DATE,
  planned_end_date DATE,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','done')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_project_phases_project
  ON project_phases(project_id, sort_order);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_project_phases_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_phases_updated_at ON project_phases;
CREATE TRIGGER trg_project_phases_updated_at
BEFORE UPDATE ON project_phases
FOR EACH ROW EXECUTE FUNCTION set_project_phases_updated_at();

-- ------------------------------------------------------------
-- 2. ROW-LEVEL SECURITY
-- ------------------------------------------------------------

ALTER TABLE project_phases ENABLE ROW LEVEL SECURITY;

-- SELECT: office members via can_access_project(), foremen via valid
-- x-field-session header (same helper used for areas / projects).
DROP POLICY IF EXISTS "Phases: read via project access" ON project_phases;
CREATE POLICY "Phases: read via project access"
ON project_phases FOR SELECT
USING (can_access_project(project_id));

-- INSERT/UPDATE/DELETE: authenticated office users only, gated by
-- company membership. Mirrors the office write pattern for areas.
DROP POLICY IF EXISTS "Phases: office insert" ON project_phases;
CREATE POLICY "Phases: office insert"
ON project_phases FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM projects p
    JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = project_phases.project_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
  )
);

DROP POLICY IF EXISTS "Phases: office update" ON project_phases;
CREATE POLICY "Phases: office update"
ON project_phases FOR UPDATE
USING (
  auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM projects p
    JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = project_phases.project_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM projects p
    JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = project_phases.project_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
  )
);

DROP POLICY IF EXISTS "Phases: office delete" ON project_phases;
CREATE POLICY "Phases: office delete"
ON project_phases FOR DELETE
USING (
  auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM projects p
    JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = project_phases.project_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
  )
);

-- Field sessions run as anon; SELECT needs to reach them via RLS.
GRANT SELECT ON project_phases TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON project_phases TO authenticated;

-- ------------------------------------------------------------
-- 3. BACKFILL FROM EXISTING areas.group_name
-- ------------------------------------------------------------
-- Seed one phase row per distinct (project_id, group_name) so existing
-- projects render via the new table instead of the derived fallback.
-- sort_order is re-ranked per project below so phases appear in the
-- same order they show today (earliest area.sort_order wins).

INSERT INTO project_phases (project_id, name, sort_order)
SELECT a.project_id, a.group_name, MIN(COALESCE(a.sort_order, 0))
FROM areas a
WHERE a.group_name IS NOT NULL AND a.group_name <> ''
GROUP BY a.project_id, a.group_name
ON CONFLICT (project_id, name) DO NOTHING;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY project_id
           ORDER BY sort_order, created_at, name
         ) - 1 AS new_order
  FROM project_phases
)
UPDATE project_phases p
SET sort_order = r.new_order
FROM ranked r
WHERE p.id = r.id
  AND p.sort_order IS DISTINCT FROM r.new_order;

-- ------------------------------------------------------------
-- SUCCESS
-- ------------------------------------------------------------

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'PROJECT PHASES MIGRATION COMPLETE';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '  - Created project_phases table + RLS policies';
  RAISE NOTICE '  - Backfilled phases from distinct areas.group_name values';
  RAISE NOTICE '  - Reseeded sort_order to match first-appearance ordering';
  RAISE NOTICE '';
END $$;
