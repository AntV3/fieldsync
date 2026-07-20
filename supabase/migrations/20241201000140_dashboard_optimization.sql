-- ============================================================
-- DASHBOARD QUERY OPTIMIZATION MIGRATION
-- ============================================================
-- Run this in Supabase SQL Editor to optimize dashboard loading
--
-- PROBLEM: Dashboard executes 9 queries per project (9N pattern)
-- 100 projects = 900+ database queries on load
--
-- SOLUTION: Single aggregation function returns all project metrics
-- ============================================================

-- ============================================================
-- 1. PROJECT DASHBOARD SUMMARY FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION get_project_dashboard_summary(p_company_id UUID)
RETURNS TABLE (
  project_id UUID,
  project_name TEXT,
  project_status TEXT,
  project_number TEXT,
  project_address TEXT,
  project_pin TEXT,

  -- Financial fields (essential for dashboard)
  contract_value NUMERIC,
  work_type TEXT,
  job_type TEXT,
  general_contractor TEXT,

  -- Area metrics
  total_areas BIGINT,
  completed_areas BIGINT,
  in_progress_areas BIGINT,
  pending_areas BIGINT,

  -- Ticket metrics
  total_tickets BIGINT,
  pending_tickets BIGINT,
  submitted_tickets BIGINT,
  approved_tickets BIGINT,

  -- Crew/Labor metrics
  total_labor_hours NUMERIC,
  today_labor_hours NUMERIC,
  today_worker_count BIGINT,

  -- Activity metrics
  last_activity_at TIMESTAMPTZ,
  daily_reports_this_week BIGINT,

  -- COR metrics
  cor_count BIGINT,
  pending_cor_count BIGINT,

  -- Disposal metrics
  disposal_loads_today BIGINT,

  -- Project dates
  created_at TIMESTAMPTZ,
  start_date DATE,
  end_date DATE
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    p.id AS project_id,
    p.name AS project_name,
    p.status AS project_status,
    p.job_number AS project_number,
    p.address AS project_address,
    p.pin AS project_pin,

    -- Financial fields
    COALESCE(p.contract_value, 0) AS contract_value,
    COALESCE(p.work_type, 'demolition') AS work_type,
    COALESCE(p.job_type, 'standard') AS job_type,
    COALESCE(p.general_contractor, '') AS general_contractor,

    -- Areas aggregation
    COALESCE(a.total, 0) AS total_areas,
    COALESCE(a.completed, 0) AS completed_areas,
    COALESCE(a.in_progress, 0) AS in_progress_areas,
    COALESCE(a.pending, 0) AS pending_areas,

    -- Tickets aggregation
    COALESCE(t.total, 0) AS total_tickets,
    COALESCE(t.pending, 0) AS pending_tickets,
    COALESCE(t.submitted, 0) AS submitted_tickets,
    COALESCE(t.approved, 0) AS approved_tickets,

    -- Crew/Labor aggregation
    COALESCE(c.total_hours, 0) AS total_labor_hours,
    COALESCE(c.today_hours, 0) AS today_labor_hours,
    COALESCE(c.today_workers, 0) AS today_worker_count,

    -- Activity
    GREATEST(
      p.updated_at,
      a.last_update,
      t.last_update,
      c.last_checkin,
      dr.last_report
    ) AS last_activity_at,
    COALESCE(dr.this_week, 0) AS daily_reports_this_week,

    -- CORs
    COALESCE(cor.total, 0) AS cor_count,
    COALESCE(cor.pending, 0) AS pending_cor_count,

    -- Disposal
    COALESCE(disp.today_count, 0) AS disposal_loads_today,

    -- Dates
    p.created_at,
    p.start_date,
    p.end_date

  FROM projects p

  -- Area aggregation (lateral join for per-project stats)
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'done' OR status = 'completed') AS completed,
      COUNT(*) FILTER (WHERE status = 'in_progress' OR status = 'active') AS in_progress,
      COUNT(*) FILTER (WHERE status = 'pending' OR status = 'not_started') AS pending,
      MAX(updated_at) AS last_update
    FROM areas
    WHERE project_id = p.id
  ) a ON TRUE

  -- Ticket aggregation
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'pending' OR status = 'draft') AS pending,
      COUNT(*) FILTER (WHERE status = 'submitted') AS submitted,
      COUNT(*) FILTER (WHERE status = 'approved') AS approved,
      MAX(updated_at) AS last_update
    FROM t_and_m_tickets
    WHERE project_id = p.id
  ) t ON TRUE

  -- Crew/Labor aggregation (workers is JSONB array)
  LEFT JOIN LATERAL (
    SELECT
      SUM(jsonb_array_length(COALESCE(workers, '[]'::jsonb))) AS total_hours,
      SUM(CASE WHEN check_in_date = CURRENT_DATE THEN jsonb_array_length(COALESCE(workers, '[]'::jsonb)) ELSE 0 END) AS today_hours,
      SUM(CASE WHEN check_in_date = CURRENT_DATE THEN jsonb_array_length(COALESCE(workers, '[]'::jsonb)) ELSE 0 END) AS today_workers,
      MAX(check_in_date) AS last_checkin
    FROM crew_checkins
    WHERE project_id = p.id
  ) c ON TRUE

  -- Daily reports this week
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS this_week,
      MAX(report_date) AS last_report
    FROM daily_reports
    WHERE project_id = p.id
      AND report_date >= CURRENT_DATE - INTERVAL '7 days'
  ) dr ON TRUE

  -- COR aggregation
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'pending' OR status = 'draft') AS pending
    FROM change_orders
    WHERE project_id = p.id
  ) cor ON TRUE

  -- Disposal loads today
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS today_count
    FROM disposal_loads
    WHERE project_id = p.id
      AND work_date = CURRENT_DATE
  ) disp ON TRUE

  WHERE p.company_id = p_company_id
  ORDER BY
    CASE p.status
      WHEN 'active' THEN 0
      WHEN 'on_hold' THEN 1
      ELSE 2
    END,
    p.name;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_project_dashboard_summary(UUID) TO authenticated;

-- ============================================================
-- 2. SINGLE PROJECT DETAIL FUNCTION (for expanded view)
-- ============================================================

CREATE OR REPLACE FUNCTION get_project_detail(p_project_id UUID)
RETURNS TABLE (
  project_id UUID,
  project_name TEXT,
  project_status TEXT,
  project_number TEXT,
  project_address TEXT,
  general_contractor TEXT,
  client_contact TEXT,
  client_phone TEXT,
  estimated_total BIGINT,
  project_pin TEXT,

  -- Full area breakdown
  areas_by_status JSONB,

  -- Recent tickets (last 5)
  recent_tickets JSONB,

  -- Today's crew
  todays_crew JSONB,

  -- Recent activity summary
  recent_activity JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    p.id AS project_id,
    p.name AS project_name,
    p.status AS project_status,
    p.job_number AS project_number,
    p.address AS project_address,
    p.general_contractor,
    p.client_contact,
    p.client_phone,
    p.estimated_total,
    p.pin AS project_pin,

    -- Areas by status
    (
      SELECT COALESCE(jsonb_object_agg(status, cnt), '{}'::jsonb)
      FROM (
        SELECT status, COUNT(*) as cnt
        FROM areas
        WHERE project_id = p.id
        GROUP BY status
      ) area_counts
    ) AS areas_by_status,

    -- Recent tickets
    (
      SELECT COALESCE(jsonb_agg(ticket_info), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'id', id,
          'work_date', work_date,
          'status', status,
          'created_by_name', created_by_name,
          'total_hours', (
            SELECT COALESCE(SUM(
              COALESCE(regular_hours, 0) + COALESCE(overtime_hours, 0)
            ), 0)
            FROM t_and_m_workers WHERE ticket_id = t.id
          )
        ) as ticket_info
        FROM t_and_m_tickets t
        WHERE project_id = p.id
        ORDER BY created_at DESC
        LIMIT 5
      ) recent
    ) AS recent_tickets,

    -- Today's crew
    (
      SELECT COALESCE(
        jsonb_build_object(
          'worker_count', worker_count,
          'total_hours', total_hours,
          'workers', workers
        ),
        jsonb_build_object('worker_count', 0, 'total_hours', 0, 'workers', '[]'::jsonb)
      )
      FROM crew_checkins
      WHERE project_id = p.id
        AND check_in_date = CURRENT_DATE
      LIMIT 1
    ) AS todays_crew,

    -- Recent activity (last 24 hours)
    (
      SELECT COALESCE(jsonb_agg(activity), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'type', 'area_update',
          'name', name,
          'status', status,
          'at', updated_at
        ) as activity
        FROM areas
        WHERE project_id = p.id
          AND updated_at >= NOW() - INTERVAL '24 hours'
        ORDER BY updated_at DESC
        LIMIT 10
      ) recent_activity
    ) AS recent_activity

  FROM projects p
  WHERE p.id = p_project_id;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_project_detail(UUID) TO authenticated;

-- ============================================================
-- 3. INDEXES FOR OPTIMIZATION
-- ============================================================

-- Composite indexes for the aggregation queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_areas_project_status_updated
  ON areas(project_id, status, updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_project_status_created
  ON t_and_m_tickets(project_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crew_project_date
  ON crew_checkins(project_id, check_in_date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_reports_project_date
  ON daily_reports(project_id, report_date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cors_project_status
  ON change_orders(project_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_disposal_project_date
  ON disposal_loads(project_id, load_date DESC);

-- Active projects index for faster company dashboard
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_company_status
  ON projects(company_id, status, name);

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'DASHBOARD OPTIMIZATION COMPLETE';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'New functions:';
  RAISE NOTICE '  - get_project_dashboard_summary(company_id)';
  RAISE NOTICE '    Returns all project metrics in a single query';
  RAISE NOTICE '  - get_project_detail(project_id)';
  RAISE NOTICE '    Returns full project details for expanded view';
  RAISE NOTICE '';
  RAISE NOTICE 'Performance impact:';
  RAISE NOTICE '  Before: 9 × N queries (N = project count)';
  RAISE NOTICE '  After: 1 query for all projects';
  RAISE NOTICE '';
  RAISE NOTICE 'New indexes created for optimal aggregation performance.';
  RAISE NOTICE '';
END $$;
