# FieldSync Scaling Strategy
## Transforming FieldSync into an Industry-Leading Construction SaaS

**Author:** Strategic Architecture Review
**Date:** January 8, 2025
**Status:** Planning Phase

---

## Executive Summary

FieldSync has strong product-market fit with core features that construction teams need. However, the current architecture will **collapse at scale**. This document outlines a phased approach to transform FieldSync from a 10-company app into a platform capable of serving 10,000+ companies with millions of daily transactions.

### Current State Assessment

| Metric | Current Limit | Target | Gap |
|--------|---------------|--------|-----|
| Companies | ~50 | 10,000+ | 200x |
| Projects per company | ~20 | 500+ | 25x |
| T&M Tickets | ~1,000 | 1,000,000+ | 1000x |
| Concurrent users | ~100 | 50,000+ | 500x |
| Dashboard load time | 3-8s | <1s | 8x |

### Critical Breaking Points Identified

1. **Query Multiplication** - Dashboard executes 9N queries (N = project count)
2. **RLS Policy Performance** - Nested EXISTS queries execute per-row
3. **Subscription Explosion** - 7N+ WebSocket channels per company
4. **No Pagination** - Full table loads for tickets, areas, reports
5. **Client-Side Aggregation** - JavaScript processing millions of rows
6. **Zero Caching** - Every navigation re-fetches all data
7. **Monolithic Components** - 2,700+ line components with 38 useState hooks

---

## Phase 1: Foundation Fixes (Week 1-2)
### Goal: Stop the bleeding - fix critical bottlenecks

### 1.1 Database Query Consolidation

**Problem:** Dashboard loads 9 parallel queries per project
**Impact:** 100 projects = 900+ database queries on load

**Solution:** Create server-side aggregation functions

```sql
-- Single query returns all project metrics
CREATE FUNCTION get_project_dashboard_summary(p_company_id UUID)
RETURNS TABLE (
  project_id UUID,
  project_name TEXT,
  area_count INTEGER,
  completed_areas INTEGER,
  ticket_count INTEGER,
  pending_tickets INTEGER,
  total_labor_hours NUMERIC,
  total_costs INTEGER,
  last_activity TIMESTAMPTZ
) AS $$
  -- Aggregate in database, not JavaScript
$$;
```

**Files to modify:**
- `src/lib/supabase.js` - Add `getProjectDashboardSummary()`
- `src/components/Dashboard.jsx` - Replace 9-way Promise.all with single call
- `database/` - New migration for aggregation functions

---

### 1.2 Implement Universal Pagination

**Problem:** `getTMTickets()`, `getAreas()`, `getDailyReports()` load ALL records
**Impact:** Single project with 10,000 tickets times out

**Solution:** Paginated queries with cursor-based navigation

```javascript
// Before (current)
async getTMTickets(projectId) {
  return supabase.from('t_and_m_tickets').select('*').eq('project_id', projectId)
}

// After (scalable)
async getTMTickets(projectId, { cursor, limit = 50 } = {}) {
  let query = supabase
    .from('t_and_m_tickets')
    .select('id, work_date, status, created_by_name, total_hours')  // Slim select
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (cursor) query = query.lt('created_at', cursor)
  return query
}
```

**Priority tables:**
1. `t_and_m_tickets` - Highest row count
2. `areas` - Can reach millions
3. `daily_reports` - Grows linearly with time
4. `disposal_loads` - High frequency logging

---

### 1.3 RLS Policy Optimization

**Problem:** Nested EXISTS subqueries execute for EVERY row
**Impact:** 1M areas = 1M subquery executions

**Current problematic pattern:**
```sql
CREATE POLICY "Active members view areas" ON areas FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM projects p
    LEFT JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = areas.project_id
    AND uc.user_id = auth.uid() AND uc.status = 'active'
  )
);
```

**Optimized pattern:**
```sql
-- Pre-compute accessible projects in a security definer function
CREATE FUNCTION user_accessible_project_ids()
RETURNS SETOF UUID
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT p.id FROM projects p
  INNER JOIN user_companies uc ON uc.company_id = p.company_id
  WHERE uc.user_id = auth.uid() AND uc.status = 'active'
$$;

-- Simple IN check instead of nested EXISTS
CREATE POLICY "Active members view areas" ON areas FOR SELECT
USING (project_id IN (SELECT user_accessible_project_ids()));
```

---

## Phase 2: Performance Architecture (Week 3-4)
### Goal: 10x performance improvement

### 2.1 Implement Request-Level Caching

**Problem:** Zero caching - every click re-fetches
**Solution:** React Query or custom cache layer

```javascript
// Cache configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,      // 5 minutes
      cacheTime: 30 * 60 * 1000,     // 30 minutes
      refetchOnWindowFocus: false,
      retry: 2
    }
  }
})

// Usage
const { data: projects } = useQuery(
  ['projects', companyId],
  () => db.getProjects(companyId),
  { staleTime: 5 * 60 * 1000 }
)
```

**Benefits:**
- Deduplicates simultaneous requests
- Prevents re-fetch on tab switch
- Enables optimistic updates
- Automatic background refresh

---

### 2.2 Consolidate Real-Time Subscriptions

**Problem:** 7N+ subscriptions per company (N = projects)
**Impact:** 50 projects = 350+ WebSocket channels

**Solution:** Single multiplexed channel per company

```javascript
// Before: N channels
projectIds.forEach(id => {
  supabase.channel(`project-${id}`)
    .on('postgres_changes', { table: 'areas', filter: `project_id=eq.${id}` }, handler)
    .subscribe()
})

// After: 1 channel with client-side routing
const companyChannel = supabase.channel(`company-${companyId}`)
  .on('postgres_changes', { table: 'areas' }, (payload) => {
    // Route to correct handler based on project_id
    const handler = projectHandlers.get(payload.new.project_id)
    if (handler) handler(payload)
  })
  .subscribe()
```

**Expected reduction:** 350 channels → 5-10 channels

---

### 2.3 Move Aggregations to Database

**Problem:** JavaScript calculates costs, totals, metrics
**Impact:** Client processes millions of rows

**Current (slow):**
```javascript
async calculateManDayCosts(projectId, companyId) {
  const crewHistory = await this.getCrewCheckinHistory(projectId, 365)  // Load 365 days
  let total = 0
  crewHistory.forEach(checkin => {
    checkin.workers.forEach(worker => {
      total += worker.hours * this.getRate(worker.labor_class_id)  // N×M iterations
    })
  })
  return total
}
```

**Optimized (fast):**
```sql
CREATE FUNCTION calculate_project_labor_costs(p_project_id UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE (total_hours NUMERIC, total_cost INTEGER, by_class JSONB)
LANGUAGE sql STABLE
AS $$
  SELECT
    SUM(w.regular_hours + w.overtime_hours) as total_hours,
    SUM(
      w.regular_hours * COALESCE(r.regular_rate, 0) +
      w.overtime_hours * COALESCE(r.overtime_rate, 0)
    ) as total_cost,
    jsonb_object_agg(w.labor_class_id, SUM(w.regular_hours)) as by_class
  FROM crew_checkins c
  JOIN crew_checkin_workers w ON w.checkin_id = c.id
  LEFT JOIN labor_class_rates r ON r.class_id = w.labor_class_id
  WHERE c.project_id = p_project_id
    AND c.check_in_date >= CURRENT_DATE - p_days
  GROUP BY w.labor_class_id
$$;
```

---

## Phase 3: Component Architecture (Week 5-6)
### Goal: Maintainable, testable codebase

### 3.1 Split Monolithic Components

**Current state:**
| Component | Lines | useState | Problem |
|-----------|-------|----------|---------|
| TMForm.jsx | 2,728 | 38 | Unmaintainable |
| Dashboard.jsx | 2,046 | 22 | Too many responsibilities |
| supabase.js | 6,800 | N/A | God object |

**Target structure:**
```
src/
├── components/
│   ├── tm/
│   │   ├── TMFormContainer.jsx      # Orchestrator
│   │   ├── TMWorkInfoStep.jsx       # Step 1
│   │   ├── TMCrewStep.jsx           # Step 2
│   │   ├── TMMaterialsStep.jsx      # Step 3
│   │   ├── TMReviewStep.jsx         # Step 4
│   │   └── hooks/
│   │       ├── useTMFormState.js    # useReducer for form state
│   │       └── useTMSubmission.js   # Submit logic
│   │
│   ├── dashboard/
│   │   ├── DashboardContainer.jsx
│   │   ├── ProjectList.jsx
│   │   ├── ProjectDetail.jsx
│   │   ├── MetricsPanel.jsx
│   │   └── hooks/
│   │       └── useDashboardData.js
│   │
├── lib/
│   ├── db/
│   │   ├── index.js                 # Re-exports
│   │   ├── projects.js              # Project queries
│   │   ├── tickets.js               # T&M queries
│   │   ├── areas.js                 # Area queries
│   │   ├── cors.js                  # COR queries
│   │   └── users.js                 # User/auth queries
```

---

### 3.2 Implement List Virtualization

**Problem:** Rendering 100+ project cards kills mobile performance
**Solution:** react-window for large lists

```javascript
import { FixedSizeList } from 'react-window'

function ProjectList({ projects }) {
  const Row = ({ index, style }) => (
    <div style={style}>
      <ProjectCard project={projects[index]} />
    </div>
  )

  return (
    <FixedSizeList
      height={600}
      itemCount={projects.length}
      itemSize={120}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  )
}
```

**Apply to:**
- Project list (Dashboard)
- T&M ticket list (TMList)
- Area list (ForemanView)
- Daily reports list

---

### 3.3 Implement Global State Management

**Problem:** Prop drilling, duplicate fetches, no single source of truth
**Solution:** Zustand for lightweight global state

```javascript
// stores/companyStore.js
import { create } from 'zustand'

export const useCompanyStore = create((set, get) => ({
  // State
  company: null,
  projects: [],
  selectedProjectId: null,

  // Actions
  setCompany: (company) => set({ company }),
  loadProjects: async () => {
    const projects = await db.getProjects(get().company.id)
    set({ projects })
  },
  selectProject: (id) => set({ selectedProjectId: id }),

  // Derived
  get selectedProject() {
    return get().projects.find(p => p.id === get().selectedProjectId)
  }
}))
```

---

## Phase 4: Scale Infrastructure (Week 7-8)
### Goal: Multi-tenant enterprise readiness

### 4.1 Database Indexing Strategy

**Critical missing indexes:**

```sql
-- Composite indexes for common query patterns
CREATE INDEX CONCURRENTLY idx_areas_project_status
  ON areas(project_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY idx_tickets_project_date
  ON t_and_m_tickets(project_id, work_date DESC, status);

CREATE INDEX CONCURRENTLY idx_tickets_cor_assignment
  ON t_and_m_tickets(assigned_cor_id, created_at DESC)
  WHERE assigned_cor_id IS NOT NULL;

CREATE INDEX CONCURRENTLY idx_cors_company_status
  ON change_orders(company_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY idx_crew_project_date
  ON crew_checkins(project_id, check_in_date DESC);

-- Partial indexes for hot paths
CREATE INDEX CONCURRENTLY idx_active_projects
  ON projects(company_id, created_at DESC)
  WHERE status = 'active';

CREATE INDEX CONCURRENTLY idx_pending_tickets
  ON t_and_m_tickets(project_id, created_at DESC)
  WHERE status = 'pending';
```

---

### 4.2 Implement Rate Limiting

**Problem:** No protection against rapid API calls
**Solution:** Supabase Edge Function rate limiter

```typescript
// supabase/functions/rate-limiter/index.ts
const LIMITS = {
  read: { requests: 100, window: 60 },   // 100/min
  write: { requests: 30, window: 60 },   // 30/min
  export: { requests: 5, window: 300 }   // 5/5min
}

export async function rateLimit(userId: string, operation: string) {
  const key = `rate:${userId}:${operation}`
  const count = await redis.incr(key)

  if (count === 1) {
    await redis.expire(key, LIMITS[operation].window)
  }

  if (count > LIMITS[operation].requests) {
    throw new RateLimitError(`Rate limit exceeded for ${operation}`)
  }
}
```

---

### 4.3 Implement Connection Pooling

**Problem:** Each user opens multiple Supabase connections
**Solution:** Connection management + pooling

```javascript
// Singleton Supabase client with connection reuse
let supabaseInstance = null

export function getSupabase() {
  if (!supabaseInstance) {
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: {
        params: {
          eventsPerSecond: 10  // Throttle realtime
        }
      },
      db: {
        schema: 'public'
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    })
  }
  return supabaseInstance
}
```

---

## Phase 5: Field Performance (Week 9-10)
### Goal: Sub-second response on 3G networks

### 5.1 Offline-First Architecture

**Enhance IndexedDB caching:**

```javascript
// Preload critical data for offline
async function preloadOfflineData(projectId) {
  const [areas, materials, laborClasses, recentCrew] = await Promise.all([
    db.getAreas(projectId),
    db.getMaterialsLibrary(companyId),
    db.getLaborClasses(companyId),
    db.getRecentCrewCheckins(projectId, 7)  // Last 7 days
  ])

  await Promise.all([
    cacheAreas(areas),
    cacheMaterials(materials),
    cacheLaborClasses(laborClasses),
    cacheCrewHistory(recentCrew)
  ])
}
```

### 5.2 Progressive Image Loading

```javascript
// Thumbnail generation + lazy loading
async function uploadPhoto(file) {
  const thumbnail = await generateThumbnail(file, 200)  // 200px thumb
  const full = await compressImage(file, 1920)

  const [thumbUrl, fullUrl] = await Promise.all([
    storage.upload(`thumbs/${id}.jpg`, thumbnail),
    storage.upload(`photos/${id}.jpg`, full)
  ])

  return { thumbnail: thumbUrl, full: fullUrl }
}

// Display with lazy loading
<img
  src={photo.thumbnail}
  data-full={photo.full}
  loading="lazy"
  onClick={() => showFullImage(photo.full)}
/>
```

### 5.3 Request Batching

```javascript
// Batch multiple operations into single request
const batchQueue = []
let batchTimer = null

function queueOperation(operation) {
  batchQueue.push(operation)

  if (!batchTimer) {
    batchTimer = setTimeout(async () => {
      const batch = [...batchQueue]
      batchQueue.length = 0
      batchTimer = null

      await supabase.rpc('batch_operations', { operations: batch })
    }, 50)  // 50ms debounce
  }
}
```

---

## Success Metrics

### Performance Targets

| Metric | Current | Phase 1 | Phase 2 | Phase 5 |
|--------|---------|---------|---------|---------|
| Dashboard load | 3-8s | 1-2s | <500ms | <300ms |
| T&M form load | 2-4s | <1s | <500ms | <200ms |
| API calls per dashboard | 9N | N+1 | 3-5 | 1-2 |
| Subscription channels | 7N | 2N | 5-10 | 3-5 |
| Offline capability | Partial | Full | Full | Full |
| 3G field performance | Poor | Usable | Good | Excellent |

### Scale Targets

| Metric | Current Limit | After Phase 5 |
|--------|---------------|---------------|
| Companies | 50 | 10,000+ |
| Projects/company | 20 | 1,000+ |
| Users/company | 50 | 500+ |
| Tickets/project | 1,000 | 100,000+ |
| Concurrent users | 100 | 50,000+ |

---

## Risk Mitigation

### Data Migration Risks
- Run new indexes with CONCURRENTLY to avoid locks
- Dual-write during transition period
- Rollback scripts for each migration

### Breaking Changes
- Version API endpoints (v1, v2)
- Feature flags for gradual rollout
- A/B testing new components

### Performance Regression
- Automated performance benchmarks in CI
- Lighthouse scores tracking
- Real user monitoring (RUM)

---

## Investment Estimate

| Phase | Duration | Complexity | Dependencies |
|-------|----------|------------|--------------|
| Phase 1 | 2 weeks | High | Database access |
| Phase 2 | 2 weeks | Medium | Phase 1 |
| Phase 3 | 2 weeks | Medium | None |
| Phase 4 | 2 weeks | High | Database access |
| Phase 5 | 2 weeks | Medium | Phases 1-4 |

**Total: 10 weeks to enterprise-ready scale**

---

## Next Steps: Today's Fixes

See **TODAY_FIXES.md** for the 3 highest-impact changes we can implement immediately.
