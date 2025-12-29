-- ============================================================
-- FIELDSYNC OBSERVABILITY TABLES
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/YOUR_PROJECT/sql
-- ============================================================

-- 1. ERROR LOG
-- Tracks all errors with context (company, user, operation)
CREATE TABLE IF NOT EXISTS error_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Classification
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  category TEXT NOT NULL, -- 'database', 'storage', 'auth', 'network', 'sync'
  error_code TEXT,
  message TEXT NOT NULL,

  -- Context (who/what/where)
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  operation TEXT, -- 'getTMTickets', 'uploadPhoto', etc.

  -- Additional data
  context JSONB DEFAULT '{}'
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_error_log_created ON error_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_company ON error_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_severity ON error_log(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_category ON error_log(category, created_at DESC);

-- 2. QUERY METRICS
-- Tracks slow queries for performance monitoring
CREATE TABLE IF NOT EXISTS query_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Query info
  operation TEXT NOT NULL, -- 'getTMTickets', 'getAreas', etc.
  duration_ms INTEGER NOT NULL,
  rows_returned INTEGER,

  -- Context
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Additional data
  context JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_query_metrics_created ON query_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_metrics_operation ON query_metrics(operation, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_metrics_slow ON query_metrics(duration_ms DESC);
CREATE INDEX IF NOT EXISTS idx_query_metrics_company ON query_metrics(company_id, created_at DESC);

-- 3. TENANT HEALTH SNAPSHOTS
-- Daily rollup of per-company health metrics
CREATE TABLE IF NOT EXISTS tenant_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,

  -- Health score (0-100)
  health_score INTEGER CHECK (health_score BETWEEN 0 AND 100),
  status TEXT CHECK (status IN ('healthy', 'warning', 'critical')),

  -- Usage metrics
  active_users INTEGER DEFAULT 0,
  total_users INTEGER DEFAULT 0,
  active_projects INTEGER DEFAULT 0,
  total_projects INTEGER DEFAULT 0,
  storage_bytes BIGINT DEFAULT 0,

  -- Activity metrics
  daily_tickets INTEGER DEFAULT 0,
  daily_actions INTEGER DEFAULT 0,
  daily_errors INTEGER DEFAULT 0,
  avg_query_latency_ms INTEGER,

  -- Flags and recommendations
  flags TEXT[] DEFAULT '{}',
  recommended_actions TEXT[] DEFAULT '{}',

  -- Ensure one snapshot per company per day
  UNIQUE(snapshot_date, company_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenant_health_company ON tenant_health_snapshots(company_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_health_status ON tenant_health_snapshots(status, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_health_date ON tenant_health_snapshots(snapshot_date DESC);

-- 4. STORAGE METRICS
-- Tracks storage usage per company
CREATE TABLE IF NOT EXISTS storage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date DATE NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,

  -- Storage totals
  total_bytes BIGINT DEFAULT 0,
  photo_bytes BIGINT DEFAULT 0,
  document_bytes BIGINT DEFAULT 0,

  -- Daily activity
  files_uploaded INTEGER DEFAULT 0,
  bytes_uploaded BIGINT DEFAULT 0,
  files_deleted INTEGER DEFAULT 0,
  bytes_deleted BIGINT DEFAULT 0,
  upload_errors INTEGER DEFAULT 0,

  -- Ensure one record per company per day
  UNIQUE(metric_date, company_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_storage_metrics_company ON storage_metrics(company_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_storage_metrics_date ON storage_metrics(metric_date DESC);

-- 5. PLATFORM ADMINS
-- Separate from company admins - for system operators only
CREATE TABLE IF NOT EXISTS platform_admins (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Only platform admins can see observability data
-- ============================================================

ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- Platform admins can see all observability data
CREATE POLICY "Platform admins can view error_log"
  ON error_log FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM platform_admins)
  );

CREATE POLICY "Platform admins can insert error_log"
  ON error_log FOR INSERT
  WITH CHECK (true); -- Anyone can log errors

CREATE POLICY "Platform admins can view query_metrics"
  ON query_metrics FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM platform_admins)
  );

CREATE POLICY "Platform admins can insert query_metrics"
  ON query_metrics FOR INSERT
  WITH CHECK (true); -- Anyone can log metrics

CREATE POLICY "Platform admins can view tenant_health"
  ON tenant_health_snapshots FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM platform_admins)
  );

CREATE POLICY "Platform admins can manage tenant_health"
  ON tenant_health_snapshots FOR ALL
  USING (
    auth.uid() IN (SELECT user_id FROM platform_admins)
  );

CREATE POLICY "Platform admins can view storage_metrics"
  ON storage_metrics FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM platform_admins)
  );

CREATE POLICY "Platform admins can manage storage_metrics"
  ON storage_metrics FOR ALL
  USING (
    auth.uid() IN (SELECT user_id FROM platform_admins)
  );

CREATE POLICY "Platform admins can view platform_admins"
  ON platform_admins FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM platform_admins)
  );

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Function to log errors (callable from app)
CREATE OR REPLACE FUNCTION log_error(
  p_severity TEXT,
  p_category TEXT,
  p_message TEXT,
  p_company_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_operation TEXT DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_context JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO error_log (
    severity, category, message, company_id, user_id,
    project_id, operation, error_code, context
  ) VALUES (
    p_severity, p_category, p_message, p_company_id, p_user_id,
    p_project_id, p_operation, p_error_code, p_context
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Function to log slow queries (callable from app)
CREATE OR REPLACE FUNCTION log_query_metric(
  p_operation TEXT,
  p_duration_ms INTEGER,
  p_rows_returned INTEGER DEFAULT NULL,
  p_company_id UUID DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_context JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Only log queries slower than 200ms to avoid noise
  IF p_duration_ms >= 200 THEN
    INSERT INTO query_metrics (
      operation, duration_ms, rows_returned, company_id,
      project_id, user_id, context
    ) VALUES (
      p_operation, p_duration_ms, p_rows_returned, p_company_id,
      p_project_id, p_user_id, p_context
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

-- ============================================================
-- GRANT EXECUTE ON FUNCTIONS
-- ============================================================

GRANT EXECUTE ON FUNCTION log_error TO authenticated;
GRANT EXECUTE ON FUNCTION log_query_metric TO authenticated;

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE 'Observability tables created successfully!';
  RAISE NOTICE 'Tables: error_log, query_metrics, tenant_health_snapshots, storage_metrics, platform_admins';
  RAISE NOTICE 'Functions: log_error(), log_query_metric()';
END $$;
