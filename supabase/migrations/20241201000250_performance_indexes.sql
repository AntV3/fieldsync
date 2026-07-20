-- ============================================
-- Performance Indexes Migration
-- ============================================
-- Run this migration to add missing indexes for improved query performance at scale.
-- These indexes are critical for applications with 100k+ records.
--
-- Run in Supabase SQL Editor or via migration tool.

-- ============================================
-- 1. Projects Table Indexes
-- ============================================

-- Index for date-range queries on created_at
CREATE INDEX IF NOT EXISTS idx_projects_created_at
ON projects (created_at DESC);

-- Compound index for company + status (common filter pattern)
CREATE INDEX IF NOT EXISTS idx_projects_company_status
ON projects (company_id, status);

-- Index for archived projects lookup
CREATE INDEX IF NOT EXISTS idx_projects_archived
ON projects (company_id, archived) WHERE archived = true;

-- ============================================
-- 2. Areas Table Indexes
-- ============================================

-- Compound index for project + status
CREATE INDEX IF NOT EXISTS idx_areas_project_status
ON areas (project_id, status);

-- Index for created_at for history queries
CREATE INDEX IF NOT EXISTS idx_areas_created_at
ON areas (created_at DESC);

-- ============================================
-- 3. T&M Tickets Table Indexes
-- ============================================

-- Compound index for project + work_date (common sort)
CREATE INDEX IF NOT EXISTS idx_tm_tickets_project_date
ON tm_tickets (project_id, work_date DESC);

-- Compound index for project + status
CREATE INDEX IF NOT EXISTS idx_tm_tickets_project_status
ON tm_tickets (project_id, status);

-- Index for company-wide ticket queries
CREATE INDEX IF NOT EXISTS idx_tm_tickets_company
ON tm_tickets (company_id, created_at DESC);

-- Index for COR assignment lookup
CREATE INDEX IF NOT EXISTS idx_tm_tickets_cor
ON tm_tickets (change_order_id) WHERE change_order_id IS NOT NULL;

-- ============================================
-- 4. Change Orders (CORs) Table Indexes
-- ============================================

-- Compound index for project + status
CREATE INDEX IF NOT EXISTS idx_change_orders_project_status
ON change_orders (project_id, status);

-- Index for created_at for history queries
CREATE INDEX IF NOT EXISTS idx_change_orders_created_at
ON change_orders (created_at DESC);

-- ============================================
-- 5. Daily Reports Table Indexes
-- ============================================

-- Compound index for project + date (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_daily_reports_project_date
ON daily_reports (project_id, report_date DESC);

-- Index for submitted reports
CREATE INDEX IF NOT EXISTS idx_daily_reports_submitted
ON daily_reports (project_id, submitted) WHERE submitted = true;

-- ============================================
-- 6. Crew Checkins Table Indexes
-- ============================================

-- Compound index for project + check_in_date
CREATE INDEX IF NOT EXISTS idx_crew_checkins_project_date
ON crew_checkins (project_id, check_in_date DESC);

-- ============================================
-- 7. Messages Table Indexes
-- ============================================

-- Compound index for project + created_at (chat queries)
CREATE INDEX IF NOT EXISTS idx_messages_project_created
ON messages (project_id, created_at DESC);

-- ============================================
-- 8. Injury Reports Table Indexes
-- ============================================

-- Compound index for project + incident_date
CREATE INDEX IF NOT EXISTS idx_injury_reports_project_date
ON injury_reports (project_id, incident_date DESC);

-- Index for company-wide queries
CREATE INDEX IF NOT EXISTS idx_injury_reports_company
ON injury_reports (company_id, incident_date DESC);

-- ============================================
-- 9. User Companies (Junction) Table Indexes
-- ============================================

-- Compound index for user lookups
CREATE INDEX IF NOT EXISTS idx_user_companies_user
ON user_companies (user_id, role);

-- Compound index for company member lookups
CREATE INDEX IF NOT EXISTS idx_user_companies_company
ON user_companies (company_id, role);

-- ============================================
-- 10. Documents Table Indexes
-- ============================================

-- Compound index for folder + created_at
CREATE INDEX IF NOT EXISTS idx_documents_folder_created
ON documents (folder_id, created_at DESC);

-- Index for project document lookups
CREATE INDEX IF NOT EXISTS idx_documents_project
ON documents (project_id, created_at DESC) WHERE project_id IS NOT NULL;

-- ============================================
-- 11. Field Sessions Table Indexes
-- ============================================

-- Index for session token lookups
CREATE INDEX IF NOT EXISTS idx_field_sessions_token
ON field_sessions (session_token);

-- Index for cleanup of expired sessions
CREATE INDEX IF NOT EXISTS idx_field_sessions_expires
ON field_sessions (expires_at) WHERE is_valid = true;

-- ============================================
-- 12. Project Costs Table Indexes
-- ============================================

-- Compound index for project + cost_date
CREATE INDEX IF NOT EXISTS idx_project_costs_project_date
ON project_costs (project_id, cost_date DESC);

-- ============================================
-- Analyze Tables After Index Creation
-- ============================================
-- Run ANALYZE to update statistics for query planner
-- (This should be done after bulk data loads or major index changes)

ANALYZE projects;
ANALYZE areas;
ANALYZE tm_tickets;
ANALYZE change_orders;
ANALYZE daily_reports;
ANALYZE crew_checkins;
ANALYZE messages;
ANALYZE injury_reports;
ANALYZE user_companies;
ANALYZE documents;
ANALYZE field_sessions;
ANALYZE project_costs;

-- ============================================
-- Verification Query
-- ============================================
-- Run this to verify indexes were created:
/*
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
*/
