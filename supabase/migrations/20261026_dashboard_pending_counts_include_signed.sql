-- =====================================================
-- Dashboard pending counts: include signed T&M tickets
-- =====================================================
-- Every field-submitted T&M ticket is foreman-signed before the office sees
-- it, so it carries status 'foreman_signed' (or 'client_signed' once the GC
-- signs on site). The dashboard summary only counted status = 'pending', so
-- the project cards and the pending-approvals banner showed 0 while real
-- tickets waited for approval. Change orders have the same bug: the pending
-- filter matched 'pending' / 'draft', but the real waiting status is
-- 'pending_approval'.
--
-- This redefines get_project_dashboard_summary with the correct filters.
-- Everything else in the function is unchanged from
-- 20241201000140_dashboard_optimization.sql.

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
SET search_path = public
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
      COUNT(*) FILTER (WHERE status IN ('pending', 'foreman_signed', 'client_signed')) AS pending,
      COUNT(*) FILTER (WHERE status IN ('foreman_signed', 'client_signed')) AS submitted,
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
      COUNT(*) FILTER (WHERE status = 'pending_approval') AS pending
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

GRANT EXECUTE ON FUNCTION get_project_dashboard_summary(UUID) TO authenticated;
