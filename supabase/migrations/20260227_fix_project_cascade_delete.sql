-- ============================================================
-- FIX: Project deletion cascade + photos column on daily_reports
-- ============================================================
-- Problems fixed:
--   1. Deleting a project fails (FK violation) or leaves orphaned rows
--      because t_and_m_tickets and daily_reports lack ON DELETE CASCADE.
--   2. PhotoTimeline 400 errors: daily_reports may be missing the
--      `photos` column; t_and_m_tickets also gets the guard.
-- ============================================================

-- ============================================================
-- PART 1: Ensure photos column exists on both tables
-- ============================================================

ALTER TABLE t_and_m_tickets
  ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb;

ALTER TABLE daily_reports
  ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb;

-- ============================================================
-- PART 2: Add / replace FK on t_and_m_tickets → projects
--         with ON DELETE CASCADE
-- ============================================================

DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT kcu.constraint_name INTO v_constraint
  FROM information_schema.key_column_usage kcu
  JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = kcu.constraint_name
  WHERE kcu.table_schema = 'public'
    AND kcu.table_name   = 't_and_m_tickets'
    AND kcu.column_name  = 'project_id'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE 'ALTER TABLE t_and_m_tickets DROP CONSTRAINT ' || quote_ident(v_constraint);
  END IF;
END $$;

ALTER TABLE t_and_m_tickets
  ADD CONSTRAINT t_and_m_tickets_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- ============================================================
-- PART 3: Add / replace FK on daily_reports → projects
--         with ON DELETE CASCADE
-- ============================================================

DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT kcu.constraint_name INTO v_constraint
  FROM information_schema.key_column_usage kcu
  JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = kcu.constraint_name
  WHERE kcu.table_schema = 'public'
    AND kcu.table_name   = 'daily_reports'
    AND kcu.column_name  = 'project_id'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE 'ALTER TABLE daily_reports DROP CONSTRAINT ' || quote_ident(v_constraint);
  END IF;
END $$;

ALTER TABLE daily_reports
  ADD CONSTRAINT daily_reports_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- ============================================================
-- PART 4: crew_checkins — same treatment if it exists
-- ============================================================

DO $$
DECLARE
  v_constraint TEXT;
  v_table_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crew_checkins'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RETURN;
  END IF;

  SELECT kcu.constraint_name INTO v_constraint
  FROM information_schema.key_column_usage kcu
  JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = kcu.constraint_name
  WHERE kcu.table_schema = 'public'
    AND kcu.table_name   = 'crew_checkins'
    AND kcu.column_name  = 'project_id'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE 'ALTER TABLE crew_checkins DROP CONSTRAINT ' || quote_ident(v_constraint);
  END IF;

  EXECUTE 'ALTER TABLE crew_checkins
    ADD CONSTRAINT crew_checkins_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'APPLIED: 20260227_fix_project_cascade_delete';
  RAISE NOTICE '  - photos column ensured on t_and_m_tickets and daily_reports';
  RAISE NOTICE '  - t_and_m_tickets.project_id FK → CASCADE DELETE';
  RAISE NOTICE '  - daily_reports.project_id FK → CASCADE DELETE';
  RAISE NOTICE '  - crew_checkins.project_id FK → CASCADE DELETE (if table exists)';
END $$;
