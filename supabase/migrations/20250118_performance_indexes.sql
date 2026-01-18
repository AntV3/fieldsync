-- ============================================================
-- PERFORMANCE INDEXES FOR SCALABILITY
-- ============================================================
-- These indexes address critical N+1 query patterns and slow
-- filtering operations identified in the codebase audit.
--
-- Impact: 10-100x improvement on filtered queries at scale
-- ============================================================

-- ============================================================
-- 1. CREW CHECKINS - Frequent date-based lookups
-- ============================================================
-- Used by: calculateManDayCosts(), getCrewCheckinHistory()
-- Query pattern: WHERE project_id = ? AND check_in_date >= ?
CREATE INDEX IF NOT EXISTS idx_crew_checkins_project_date
ON crew_checkins(project_id, check_in_date DESC);

-- ============================================================
-- 2. T&M TICKETS - Primary access pattern
-- ============================================================
-- Used by: getTMTickets(), getTMTicketsPaginated(), getPreviousTicketCrew()
-- Query pattern: WHERE project_id = ? ORDER BY work_date DESC
CREATE INDEX IF NOT EXISTS idx_tm_tickets_project_workdate
ON t_and_m_tickets(project_id, work_date DESC);

-- Status filtering for approval workflows
-- Query pattern: WHERE project_id = ? AND status = ?
CREATE INDEX IF NOT EXISTS idx_tm_tickets_project_status
ON t_and_m_tickets(project_id, status);

-- ============================================================
-- 3. CHANGE ORDERS (CORs) - Filtered views
-- ============================================================
-- Used by: getCORs(), getCORStats()
-- Query pattern: WHERE project_id = ? AND status = ?
CREATE INDEX IF NOT EXISTS idx_change_orders_project_status
ON change_orders(project_id, status);

-- ============================================================
-- 4. DISPOSAL LOADS - Date range queries
-- ============================================================
-- Used by: getDisposalLoads(), calculateHaulOffCosts()
-- Query pattern: WHERE project_id = ? ORDER BY work_date DESC
CREATE INDEX IF NOT EXISTS idx_disposal_loads_project_date
ON disposal_loads(project_id, work_date DESC);

-- ============================================================
-- 5. PROJECT COSTS - Custom cost tracking
-- ============================================================
-- Used by: getProjectCosts()
-- Query pattern: WHERE project_id = ? ORDER BY cost_date DESC
CREATE INDEX IF NOT EXISTS idx_project_costs_project_date
ON project_costs(project_id, cost_date DESC);

-- ============================================================
-- 6. DAILY REPORTS - Recent activity queries
-- ============================================================
-- Used by: getDailyReports()
-- Query pattern: WHERE project_id = ? ORDER BY report_date DESC
CREATE INDEX IF NOT EXISTS idx_daily_reports_project_date
ON daily_reports(project_id, report_date DESC);

-- ============================================================
-- 7. AREAS - Sorted area lists
-- ============================================================
-- Used by: getAreas()
-- Query pattern: WHERE project_id = ? ORDER BY sort_order
CREATE INDEX IF NOT EXISTS idx_areas_project_sort
ON areas(project_id, sort_order);

-- ============================================================
-- 8. DOCUMENTS - Folder and search optimization
-- ============================================================
-- Used by: getFolderDocuments(), searchDocuments()
-- Note: documents table uses uploaded_at, not created_at
CREATE INDEX IF NOT EXISTS idx_documents_folder_perf
ON documents(folder_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_project_category
ON documents(project_id, category);

-- ============================================================
-- 9. COMPANIES - Code lookup for PIN validation
-- ============================================================
-- Used by: getCompanyByCode() (critical for field user auth)
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_code
ON companies(code) WHERE code IS NOT NULL;

-- ============================================================
-- 10. FIELD SESSIONS - Active session lookups
-- ============================================================
-- Used by: PIN validation and session verification
CREATE INDEX IF NOT EXISTS idx_field_sessions_token
ON field_sessions(session_token) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_field_sessions_project_device
ON field_sessions(project_id, device_id, created_at DESC);

-- ============================================================
-- 11. USER COMPANIES - Role-based access checks
-- ============================================================
-- Used by: RLS policies for company membership verification
CREATE INDEX IF NOT EXISTS idx_user_companies_user_status
ON user_companies(user_id, status) WHERE status = 'active';

-- ============================================================
-- VERIFICATION
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'PERFORMANCE INDEXES CREATED SUCCESSFULLY';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Indexes created for:';
  RAISE NOTICE '  - crew_checkins (project_id, check_in_date)';
  RAISE NOTICE '  - t_and_m_tickets (project_id, work_date), (project_id, status)';
  RAISE NOTICE '  - change_orders (project_id, status)';
  RAISE NOTICE '  - disposal_loads (project_id, work_date)';
  RAISE NOTICE '  - project_costs (project_id, cost_date)';
  RAISE NOTICE '  - daily_reports (project_id, report_date)';
  RAISE NOTICE '  - areas (project_id, sort_order)';
  RAISE NOTICE '  - documents (folder_id), (project_id, category)';
  RAISE NOTICE '  - companies (code) UNIQUE';
  RAISE NOTICE '  - field_sessions (session_token), (project_id, device_id)';
  RAISE NOTICE '  - user_companies (user_id, status)';
  RAISE NOTICE '';
  RAISE NOTICE 'These indexes will significantly improve query performance';
  RAISE NOTICE 'as the database scales to thousands of records.';
  RAISE NOTICE '';
END $$;
