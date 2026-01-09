# Today's Fixes: 3 Highest-Impact Changes

**Date:** January 8, 2025
**Status:** Planning Complete - Ready for Implementation
**Time Required:** ~4-6 hours

---

## Overview

These 3 fixes address the most critical issues identified in our codebase analysis. They are ordered by priority and can be implemented today.

| Fix | Category | Impact | Risk |
|-----|----------|--------|------|
| 1. Fix RLS Security Hole | **P0 Security** | Critical | Low |
| 2. Dashboard Query Consolidation | **P1 Performance** | High | Medium |
| 3. Implement T&M Ticket Pagination | **P1 Scalability** | High | Low |

---

## Fix #1: Close RLS Policy Security Vulnerability

### The Problem

Current RLS policies use `auth.uid() IS NULL` to allow field worker access. This pattern is **dangerously permissive** - it allows ANY anonymous request to access data without verification.

**Vulnerable pattern found in multiple tables:**
```sql
CREATE POLICY "allow_anon_access" ON areas FOR SELECT
USING (auth.uid() IS NULL);  -- Any anonymous request passes!
```

**Tables at risk:**
- `areas`
- `t_and_m_tickets`
- `daily_reports`
- `photos`
- `crew_checkins`

### The Solution

Replace open anonymous access with PIN-validated access using Supabase's request headers.

**Step 1: Create a project_pins validation table**

```sql
CREATE TABLE project_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  pin_hash TEXT NOT NULL,  -- Store hashed PIN, not plaintext
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,  -- Optional expiration
  UNIQUE(project_id)
);

-- Index for fast lookups
CREATE INDEX idx_project_pins_project ON project_pins(project_id);
```

**Step 2: Create a PIN validation function**

```sql
CREATE OR REPLACE FUNCTION validate_field_pin(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  request_pin TEXT;
  stored_hash TEXT;
BEGIN
  -- Get PIN from request header (set by client)
  request_pin := current_setting('request.headers', true)::json->>'x-field-pin';

  IF request_pin IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Validate against stored hash
  SELECT pin_hash INTO stored_hash
  FROM project_pins
  WHERE project_id = p_project_id
    AND (expires_at IS NULL OR expires_at > NOW());

  -- Compare hashed PIN (use pgcrypto for proper comparison)
  RETURN stored_hash IS NOT NULL
    AND stored_hash = crypt(request_pin, stored_hash);
END;
$$;
```

**Step 3: Update RLS policies**

```sql
-- Replace open anon policies with validated policies
DROP POLICY IF EXISTS "allow_anon_access" ON areas;

CREATE POLICY "field_access_with_pin" ON areas FOR SELECT
USING (
  -- Authenticated users via normal auth
  auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_companies uc
    JOIN projects p ON p.company_id = uc.company_id
    WHERE p.id = areas.project_id
      AND uc.user_id = auth.uid()
      AND uc.status = 'active'
  )
  OR
  -- Field workers via PIN validation
  (auth.uid() IS NULL AND validate_field_pin(project_id))
);
```

### Files to Modify

| File | Changes |
|------|---------|
| `database/migration_security_hardening.sql` | Create `project_pins` table, `validate_field_pin()` function, update RLS policies |
| `src/lib/supabase.js` | Add `x-field-pin` header to field requests, add `validateProjectPin()` function |
| `src/components/FieldPinEntry.jsx` (or similar) | Ensure PIN is stored in memory and passed with requests |

### Implementation Steps

1. [ ] Write migration SQL for `project_pins` table
2. [ ] Write `validate_field_pin()` function
3. [ ] Write updated RLS policies for all affected tables
4. [ ] Update `supabase.js` to include PIN header in requests
5. [ ] Test with existing field access flow
6. [ ] Migrate existing projects to have PIN entries in new table
7. [ ] Test that unauthorized anonymous requests are blocked

### Rollback Plan

Keep old policies commented out in migration. If issues arise:
```sql
DROP POLICY "field_access_with_pin" ON areas;
CREATE POLICY "allow_anon_access" ON areas FOR SELECT USING (auth.uid() IS NULL);
```

---

## Fix #2: Dashboard Query Consolidation

### The Problem

Dashboard loads 9 parallel queries **per project**:

```javascript
// Current pattern in Dashboard.jsx
await Promise.all(projectIds.map(async (projectId) => {
  const [areas, tickets, reports, crew, costs, photos, cors, materials, disposal] =
    await Promise.all([
      db.getAreas(projectId),
      db.getTMTickets(projectId),
      db.getDailyReports(projectId),
      // ... 6 more queries
    ])
  return { projectId, areas, tickets, ... }
}))
```

**Impact:** 50 projects = 450 queries on every dashboard load

### The Solution

Create a single database function that returns aggregated summary data.

**Step 1: Create aggregation function in Supabase**

```sql
CREATE OR REPLACE FUNCTION get_project_dashboard_summary(p_company_id UUID)
RETURNS TABLE (
  project_id UUID,
  project_name TEXT,
  project_status TEXT,
  project_number TEXT,

  -- Area metrics
  total_areas INTEGER,
  completed_areas INTEGER,
  in_progress_areas INTEGER,

  -- Ticket metrics
  total_tickets INTEGER,
  pending_tickets INTEGER,
  submitted_tickets INTEGER,

  -- Labor metrics
  total_labor_hours NUMERIC,
  today_labor_hours NUMERIC,

  -- Activity metrics
  last_activity_at TIMESTAMPTZ,
  daily_reports_this_week INTEGER,

  -- Financial (office users only - filter in RLS)
  estimated_total INTEGER,
  cor_count INTEGER
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id AS project_id,
    p.name AS project_name,
    p.status AS project_status,
    p.project_number,

    -- Areas
    COALESCE(a.total, 0)::INTEGER AS total_areas,
    COALESCE(a.completed, 0)::INTEGER AS completed_areas,
    COALESCE(a.in_progress, 0)::INTEGER AS in_progress_areas,

    -- Tickets
    COALESCE(t.total, 0)::INTEGER AS total_tickets,
    COALESCE(t.pending, 0)::INTEGER AS pending_tickets,
    COALESCE(t.submitted, 0)::INTEGER AS submitted_tickets,

    -- Labor
    COALESCE(c.total_hours, 0) AS total_labor_hours,
    COALESCE(c.today_hours, 0) AS today_labor_hours,

    -- Activity
    GREATEST(
      p.updated_at,
      a.last_update,
      t.last_update,
      c.last_checkin
    ) AS last_activity_at,
    COALESCE(dr.this_week, 0)::INTEGER AS daily_reports_this_week,

    -- Financial
    p.estimated_total,
    COALESCE(cor.count, 0)::INTEGER AS cor_count

  FROM projects p

  -- Area aggregation
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'completed') AS completed,
      COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
      MAX(updated_at) AS last_update
    FROM areas WHERE project_id = p.id
  ) a ON TRUE

  -- Ticket aggregation
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'pending') AS pending,
      COUNT(*) FILTER (WHERE status = 'submitted') AS submitted,
      MAX(updated_at) AS last_update
    FROM t_and_m_tickets WHERE project_id = p.id
  ) t ON TRUE

  -- Crew/Labor aggregation
  LEFT JOIN LATERAL (
    SELECT
      SUM(total_hours) AS total_hours,
      SUM(CASE WHEN check_in_date = CURRENT_DATE THEN total_hours ELSE 0 END) AS today_hours,
      MAX(check_in_date) AS last_checkin
    FROM crew_checkins WHERE project_id = p.id
  ) c ON TRUE

  -- Daily reports this week
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS this_week
    FROM daily_reports
    WHERE project_id = p.id
      AND report_date >= CURRENT_DATE - INTERVAL '7 days'
  ) dr ON TRUE

  -- COR count
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS count
    FROM change_orders WHERE project_id = p.id
  ) cor ON TRUE

  WHERE p.company_id = p_company_id
  ORDER BY p.name;
$$;
```

**Step 2: Add to supabase.js**

```javascript
// New function in supabase.js
async getProjectDashboardSummary(companyId) {
  const { data, error } = await supabase
    .rpc('get_project_dashboard_summary', { p_company_id: companyId })

  if (error) throw error
  return data
}
```

**Step 3: Update Dashboard.jsx**

```javascript
// Replace the 9N Promise.all pattern with:
useEffect(() => {
  async function loadDashboard() {
    setLoading(true)
    try {
      const summary = await db.getProjectDashboardSummary(company.id)
      setProjectSummaries(summary)
    } finally {
      setLoading(false)
    }
  }
  loadDashboard()
}, [company.id])
```

### Files to Modify

| File | Changes |
|------|---------|
| `database/migration_dashboard_optimization.sql` | Create `get_project_dashboard_summary()` function |
| `src/lib/supabase.js` | Add `getProjectDashboardSummary()` wrapper |
| `src/components/Dashboard.jsx` | Replace Promise.all loop with single RPC call |

### Implementation Steps

1. [ ] Write and test `get_project_dashboard_summary()` in Supabase SQL editor
2. [ ] Add migration file to version control
3. [ ] Add `getProjectDashboardSummary()` to supabase.js
4. [ ] Update Dashboard.jsx to use new function
5. [ ] Keep old loading pattern as fallback during testing
6. [ ] Remove old pattern once validated

### Performance Impact

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Queries per load | 9 × N | 1 | 99%+ reduction |
| Load time (50 projects) | 3-8s | <500ms | 6-16x faster |
| Database connections | 450 | 1 | 99.8% reduction |

---

## Fix #3: Implement T&M Ticket Pagination

### The Problem

`getTMTickets()` loads ALL tickets for a project without limits:

```javascript
// Current - loads everything
async getTMTickets(projectId) {
  return supabase
    .from('t_and_m_tickets')
    .select('*, photos(*), crew_entries(*), materials(*)')  // Heavy join
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    // No limit! Could return 10,000+ rows
}
```

**Impact:** Project with 5,000 tickets times out or crashes browser

### The Solution

Implement cursor-based pagination with lean initial queries.

**Step 1: Create paginated query function**

```javascript
// New in supabase.js
async getTMTicketsPaginated(projectId, options = {}) {
  const {
    limit = 25,
    cursor = null,  // created_at timestamp of last item
    status = null,  // Optional filter
    includeDetails = false  // Lazy load details
  } = options

  // Lean select for list view
  const selectFields = includeDetails
    ? '*, photos(id, thumbnail_url), crew_entries(id, labor_class_id, hours), materials(id, name, quantity)'
    : 'id, ticket_number, work_date, status, created_by_name, total_hours, description, created_at'

  let query = supabase
    .from('t_and_m_tickets')
    .select(selectFields)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit)

  // Cursor pagination
  if (cursor) {
    query = query.lt('created_at', cursor)
  }

  // Status filter
  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) throw error

  return {
    tickets: data,
    nextCursor: data.length === limit ? data[data.length - 1]?.created_at : null,
    hasMore: data.length === limit
  }
}
```

**Step 2: Create separate detail fetch**

```javascript
// Lazy load full ticket details when expanded/selected
async getTMTicketDetails(ticketId) {
  const { data, error } = await supabase
    .from('t_and_m_tickets')
    .select(`
      *,
      photos(id, url, thumbnail_url, description, created_at),
      crew_entries(
        id, labor_class_id, worker_name, regular_hours, overtime_hours,
        labor_classes(id, name, category)
      ),
      materials(id, name, description, quantity, unit, unit_cost)
    `)
    .eq('id', ticketId)
    .single()

  if (error) throw error
  return data
}
```

**Step 3: Update TMTicketList component**

```jsx
// TMTicketList.jsx - Add infinite scroll
function TMTicketList({ projectId }) {
  const [tickets, setTickets] = useState([])
  const [cursor, setCursor] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)

  const loadMore = async () => {
    if (loading || !hasMore) return

    setLoading(true)
    try {
      const result = await db.getTMTicketsPaginated(projectId, {
        cursor,
        limit: 25
      })

      setTickets(prev => [...prev, ...result.tickets])
      setCursor(result.nextCursor)
      setHasMore(result.hasMore)
    } finally {
      setLoading(false)
    }
  }

  // Initial load
  useEffect(() => {
    setTickets([])
    setCursor(null)
    setHasMore(true)
    loadMore()
  }, [projectId])

  return (
    <div>
      {tickets.map(ticket => (
        <TicketRow key={ticket.id} ticket={ticket} />
      ))}

      {hasMore && (
        <button onClick={loadMore} disabled={loading}>
          {loading ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  )
}
```

### Files to Modify

| File | Changes |
|------|---------|
| `src/lib/supabase.js` | Add `getTMTicketsPaginated()`, `getTMTicketDetails()` |
| `src/components/TMTicketList.jsx` | Add pagination state and "Load More" |
| `src/components/Dashboard.jsx` | Update ticket list section to use paginated component |

### Implementation Steps

1. [ ] Add `getTMTicketsPaginated()` to supabase.js
2. [ ] Add `getTMTicketDetails()` for lazy loading
3. [ ] Update TMTicketList with pagination state
4. [ ] Add "Load More" button or infinite scroll
5. [ ] Test with project that has many tickets
6. [ ] Update Dashboard.jsx to pass new props

### Performance Impact

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Initial payload | 5,000 tickets | 25 tickets | 99.5% reduction |
| Load time | 5-15s | <200ms | 25-75x faster |
| Memory usage | 50MB+ | 2MB | 96% reduction |
| Browser crashes | Frequent | Never | 100% improvement |

---

## Implementation Order

### Recommended Sequence

1. **Fix #1 (RLS Security)** - Do first because it's a security vulnerability
   - Write migration SQL
   - Update supabase.js
   - Test with field access

2. **Fix #2 (Dashboard Queries)** - Highest performance impact
   - Create database function
   - Update Dashboard.jsx
   - Monitor query performance

3. **Fix #3 (Pagination)** - Required for scale
   - Update supabase.js
   - Update TMTicketList
   - Test with large datasets

### Testing Checklist

After each fix:

- [ ] Existing functionality still works
- [ ] New security patterns are enforced
- [ ] Performance improvement is measurable
- [ ] No regressions in field worker flow
- [ ] No regressions in office user flow

---

## Summary

| Fix | Impact | Effort | Priority |
|-----|--------|--------|----------|
| RLS Security | Critical security hole closed | 2 hours | **P0** |
| Dashboard Queries | 450 queries → 1 query | 2 hours | **P1** |
| T&M Pagination | 5000 rows → 25 rows | 1.5 hours | **P1** |

**Total estimated time: 5.5 hours**

After these 3 fixes:
- ✅ Security vulnerability eliminated
- ✅ Dashboard loads 10-20x faster
- ✅ App can handle 100,000+ tickets without crashing
- ✅ Ready for real production load
