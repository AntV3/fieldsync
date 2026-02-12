# FieldSync Scalability & Code Quality Audit

**Date:** 2026-02-12
**Scope:** Full codebase audit for scalability bottlenecks, security gaps, and architectural concerns when scaling to larger companies (100+ users, 1000+ projects, 10,000+ records per table).

---

## Executive Summary

FieldSync is a well-structured construction progress tracking application with solid fundamentals: good multi-tenancy isolation via RLS, offline-first architecture, and a clean React frontend. However, several patterns that work fine at small scale will become serious bottlenecks when onboarding larger companies. The most critical issues are **unbounded queries**, **a monolithic 9,275-line database facade**, **real-time subscription scaling**, and **workers stored as JSON arrays instead of normalized tables**.

---

## CRITICAL — Will Break at Scale

### 1. Unbounded Queries Throughout the Data Layer

**Files:** `src/lib/supabase.js` (lines 300-340, 1945-1983, and others)

Multiple core query functions fetch ALL rows without any limit or pagination:

| Function | Line | What it fetches | Risk |
|----------|------|-----------------|------|
| `getProjects(companyId)` | ~300 | ALL projects for company | 1000+ projects = slow + large payload |
| `getTMTickets(projectId)` | ~1945 | ALL tickets with nested workers/items joins | 100+ tickets with 5+ workers each = exponential payload |
| `getMaterialsEquipment(companyId)` | — | ALL materials/equipment catalog | Enterprise companies have 1000+ SKUs |
| `getAreas(projectId)` | — | ALL areas per project | Large projects have 50-100+ areas |
| `getAllUsers()` | — | ALL company users | 100+ employees = large payload |
| `getForemen()` | — | ALL foremen | No limit |
| `getLaborRates(companyId)` | ~3861 | ALL labor rates | No limit |
| `getDocumentVersions(documentId)` | — | ALL document versions | No limit on version history |

Paginated alternatives exist for some (`getProjectsPaginated`, `getTMTicketsPaginated`) but the unpaginated versions are still called in many code paths.

**Recommendation:** Replace all unbounded query calls with their paginated equivalents. Add a hard server-side row limit (e.g. 1000) as a safety net on Supabase.

---

### 2. `crew_checkins.workers` Stored as JSON Array

**Files:** `database/schema.sql`, `src/lib/supabase.js` (lines 3838-3857, 3903-3936)

Workers in crew check-ins are stored as a JSON array column rather than a normalized table:

```javascript
// supabase.js:3903 — nested iteration over JSON arrays
crewHistory.forEach(checkin => {
  (checkin.workers || []).forEach(worker => {
    // Process each worker in application code
  })
})
```

**Why this breaks at scale:**
- Cannot index individual workers (no search by worker name at DB level)
- 365 days of history × 20 workers/day = 7,300 worker records loaded into JS and iterated
- `calculateManDayCosts()` (line 3882) fetches a full year of history then processes in nested loops
- `universalSearch()` (line 588-616) fetches 50 checkins and iterates all workers in JS to find matches
- Row size grows unbounded — a single checkin with 100 workers becomes a multi-KB row

**Recommendation:** Create a `crew_checkin_workers` join table with foreign key to `crew_checkins`, indexed on `worker_name` and `project_id`. Migrate existing JSON arrays.

---

### 3. Real-Time Subscription Explosion

**File:** `src/lib/supabase.js` (lines 1340-1409)

`subscribeToCompanyActivity()` creates one subscription filter **per project × per table**:

```javascript
projectIds.forEach(projectId => {
  channel.on('postgres_changes', { table: 'messages', filter: `project_id=eq.${projectId}` }, ...)
  channel.on('postgres_changes', { table: 'material_requests', filter: `project_id=eq.${projectId}` }, ...)
  channel.on('postgres_changes', { table: 't_and_m_tickets', filter: `project_id=eq.${projectId}` }, ...)
  // ... 7 more tables per project
})
```

For a company with 50 active projects, this creates **~500 filter registrations** on a single channel. Each connected office user creates this independently. With 10 concurrent office users = 5,000 active filter registrations hitting Supabase Realtime.

Supabase Realtime has connection and subscription limits per project tier. This pattern will hit those limits quickly.

**Recommendation:**
- Subscribe at the company level (not per-project) and filter client-side
- Use a single `company_id` filter per table instead of N `project_id` filters
- Consider a dedicated real-time notification service for high-traffic companies

---

### 4. Monolithic Database Facade (9,275 Lines)

**File:** `src/lib/supabase.js`

All 100+ database methods live in a single file. This creates:
- Merge conflicts when multiple developers touch different features
- Difficulty finding and maintaining specific query logic
- No separation between read/write operations
- Impossible to tree-shake unused methods
- Testing requires mocking the entire module

**Recommendation:** Split into domain modules:
```
src/lib/db/
  projects.js      — project CRUD + queries
  tickets.js       — T&M ticket operations
  changeOrders.js  — COR operations
  crew.js          — check-ins, workers, labor
  documents.js     — document management
  billing.js       — financial operations
  subscriptions.js — real-time subscriptions
  auth.js          — authentication operations
```

---

## HIGH — Will Degrade Performance at Scale

### 5. ILIKE Search Without Full-Text Indexes

**File:** `src/lib/supabase.js` (lines 549, 562, 579)

Universal search uses `ILIKE` with leading wildcards:

```javascript
.or(`name.ilike.%${searchQuery}%,job_number.ilike.%${searchQuery}%,address.ilike.%${searchQuery}%`)
```

Leading wildcard `%term%` prevents PostgreSQL from using B-tree indexes. With 100,000+ records, every search triggers a full table scan.

**Recommendation:** Add GIN indexes with `pg_trgm` extension or full-text search:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_projects_name_trgm ON projects USING GIN (name gin_trgm_ops);
CREATE INDEX idx_projects_search_fts ON projects USING GIN (
  to_tsvector('english', coalesce(name, '') || ' ' || coalesce(address, ''))
);
```

---

### 6. No API-Wide Rate Limiting

**Files:** `src/lib/supabase.js` (lines 844-983), `database/migration_security_hardening.sql`

Rate limiting exists only for PIN authentication (5 attempts / 15 minutes). There is no rate limiting on:
- Data queries (a malicious or buggy client can hammer the API)
- File uploads (could fill storage)
- Real-time subscription creation
- Search queries (expensive ILIKE scans)

**Recommendation:** Implement rate limiting at the reverse proxy level (Cloudflare, Vercel Edge Middleware) with per-user and per-IP limits. Add Supabase Edge Function rate limiting for critical endpoints.

---

### 7. No Soft Deletes on Critical Tables

**File:** `database/` (all migration files)

All deletes are hard deletes with `CASCADE`. Deleted records cannot be recovered.

**Risk at scale:**
- Construction documents have legal retention requirements
- Accidental deletion of a project cascades to all tickets, CORs, reports, and documents
- No audit trail for what was deleted or by whom
- Compliance issues with construction record-keeping regulations

**Recommendation:** Add `deleted_at TIMESTAMPTZ` and `deleted_by UUID` columns to: `projects`, `change_orders`, `t_and_m_tickets`, `documents`, `daily_reports`, `crew_checkins`. Filter with `WHERE deleted_at IS NULL` by default.

---

### 8. Dashboard State Explosion Causing Re-renders

**File:** `src/components/Dashboard.jsx` (~1000+ lines)

The Dashboard component manages 20+ state variables, causing the entire component tree to re-render when any single piece of state changes. Subscription events trigger `debouncedRefresh()` which reloads multiple data sources, causing cascading re-renders.

```javascript
// Every subscription event triggers a full refresh cycle
const debouncedRefresh = useCallback((options = {}) => {
  refreshTimeoutRef.current = setTimeout(async () => {
    if (pendingAreasRefreshRef.current) await loadAreas(projectId)
    if (pendingCORRefreshRef.current) setCORRefreshKey(prev => prev + 1)
    await loadProjects()
  }, 150)
}, [])
```

With 50 projects and active field crews, subscription events arrive frequently, and each triggers loading all projects.

**Recommendation:**
- Split Dashboard into independent feature containers with their own state
- Use React.memo on child components with stable props
- Replace the blanket `loadProjects()` refresh with targeted state updates using subscription payloads
- Consider `useReducer` for related state to batch updates

---

### 9. Missing Database Indexes for Common Query Patterns

**File:** `supabase/migrations/20250118_performance_indexes.sql`

While performance indexes exist for time-series queries, several common patterns lack indexes:

| Missing Index | Query Pattern | Impact |
|---------------|---------------|--------|
| `(company_id, status)` on `projects` | Every project list query | Full scan + filter |
| `worker_name` on normalized workers table | Worker search | N/A until table exists |
| `(project_id, created_at)` on `t_and_m_tickets` | Ticket list with sort | Already has `work_date` index but `created_at` sort uses different column |
| `(company_id)` on `materials_equipment` | Material catalog queries | Full scan on catalog |
| GIN index on JSON columns | Any JSON field search | Full row scan |

---

### 10. Service Worker Cache Has No Size Limit

**File:** `public/sw.js`

The service worker caches all static assets and navigations with no eviction policy:
```javascript
CACHE_NAME = 'fieldsync-v8'  // Manual version bump
```

- Cache grows unbounded on field workers' devices
- Manual version bumping is error-prone
- No maximum cache size configured
- Stale entries persist until full cache clear

**Recommendation:** Implement cache size limits, LRU eviction, and automatic versioning tied to build hash.

---

## MEDIUM — Technical Debt That Compounds

### 11. No Request Timeouts

The Supabase client has no explicit timeout configuration. A slow query or network issue will leave the UI in a loading state indefinitely. The `withRetry` function (line 69) retries 3 times with exponential backoff, but never gives up with a timeout — it waits for the promise to resolve or reject.

**Recommendation:** Add `AbortController` with a 30-second timeout to all critical queries.

---

### 12. Memory Leaks in main.jsx

**File:** `src/main.jsx` (lines 19-49)

```javascript
// Line 19: setInterval never cleared
setInterval(() => {
  registration.update().catch(...)
}, 300000)

// Line 29: Event listener never removed
navigator.serviceWorker.addEventListener('message', (event) => { ... })
```

These run for the lifetime of the application. While not critical for a single-page app, they represent a pattern that could compound with additional listeners.

---

### 13. No API Versioning Strategy

All clients hit the same Supabase endpoint with no version negotiation. When database schema changes are deployed, all connected clients must be compatible. There's no mechanism for:
- Gradual rollout of breaking changes
- Backward-compatible API evolution
- Client version enforcement

**Recommendation:** Use Supabase database views as a stable API layer. Clients query views, and views can be evolved independently of underlying tables.

---

### 14. Export Operations Block the Main Thread

**Files:** `src/lib/corPdfExport.js` (49KB), `src/lib/corPdfGenerator.js` (29KB)

PDF generation with jsPDF happens entirely on the main thread. For large CORs with many line items and embedded images, this can freeze the UI for several seconds.

**Recommendation:** Move PDF generation to a Web Worker or use the existing `requestCORExport()` RPC pattern to generate server-side.

---

### 15. Photo Storage Stats Computed Client-Side

**File:** `src/lib/supabase.js` (lines 652-678)

```javascript
// Fetches ALL tickets' photo arrays just to count them
const { data: tickets } = await supabase
  .from('t_and_m_tickets')
  .select('photos')
  .eq('project_id', projectId)
```

This downloads every photo URL array for every ticket in a project just to compute storage statistics. For a project with 500 tickets averaging 5 photos each, this is 2,500 URLs transferred and counted in JS.

**Recommendation:** Use a PostgreSQL aggregate function:
```sql
SELECT COUNT(*) as photo_count,
       SUM(jsonb_array_length(photos)) as total_photos
FROM t_and_m_tickets
WHERE project_id = $1;
```

---

### 16. Field Session Cleanup Not Scheduled

**File:** `database/cleanup_field_sessions.sql`

A `cleanup_expired_sessions()` function exists but there's no evidence of it being scheduled via `pg_cron` or any external scheduler. Expired sessions accumulate indefinitely in the `field_sessions` table.

**Recommendation:** Schedule via `pg_cron`:
```sql
SELECT cron.schedule('cleanup-sessions', '0 * * * *', 'SELECT cleanup_expired_sessions()');
SELECT cron.schedule('cleanup-auth-attempts', '0 0 * * *', 'SELECT cleanup_old_auth_attempts()');
```

---

### 17. Realtime Subscriptions Not Resilient to Reconnection

**File:** `src/lib/supabase.js` (lines 1242-1416)

Subscriptions are created once in `useEffect` hooks. If the WebSocket connection drops and reconnects (common on mobile/field devices), subscriptions may not automatically re-establish. There's no:
- Connection state monitoring for subscriptions
- Automatic resubscription on reconnect
- Subscription health checking

**Recommendation:** Monitor the Supabase channel status and resubscribe on `CLOSED` or `CHANNEL_ERROR` events.

---

### 18. No Data Archival Strategy

There's no mechanism to archive old project data. Over years, tables like `crew_checkins`, `t_and_m_tickets`, and `daily_reports` will grow continuously. Queries on active projects will slow as they share tables with years of historical data.

**Recommendation:**
- Implement table partitioning by date for time-series tables
- Add an archival pipeline that moves completed project data to archive tables
- Use Supabase's `pg_partman` extension for automatic partition management

---

### 19. CSRF Tokens Not Server-Validated

**File:** `src/lib/csrf.js`

CSRF tokens are generated and managed entirely client-side. The `X-CSRF-Token` header is set but there's no server-side middleware to validate it. Supabase PostgREST doesn't validate custom CSRF headers.

For a BaaS architecture where the client talks directly to the database, CSRF protection relies on:
- SameSite cookie attributes (configured)
- Bearer token authentication (Supabase handles this)
- RLS policies (configured)

The client-side CSRF implementation adds complexity without real protection since there's no server to validate against.

**Recommendation:** Either remove the client-side CSRF implementation (since Supabase JWT + SameSite provides equivalent protection) or implement validation via Supabase Edge Functions.

---

### 20. `t_and_m_tickets.photos` Stored as Array Column

Similar to the `crew_checkins.workers` issue, photos are stored as an array column rather than a separate table. This means:
- Cannot query/filter individual photos
- Cannot add metadata per photo (uploaded_by, timestamp, GPS coordinates)
- Array grows unbounded
- Photo deletion requires fetching + modifying the entire array

**Recommendation:** Already partially addressed with `tm_ticket_photos` table in migrations, but usage needs to be verified and the array column deprecated.

---

## LOW — Good Practices to Adopt

### 21. Bundle Size Monitoring

The CI pipeline checks bundle size (`>500KB` warning) but there's no tracking of size over time. Large dependency additions could slip through.

**Recommendation:** Add bundle size comparison to PR checks (e.g., `size-limit` package).

### 22. No Content Security Policy Headers

No CSP headers are configured in Vercel or the application. This is a defense-in-depth measure against XSS.

**Recommendation:** Add CSP headers via `vercel.json`:
```json
{
  "headers": [{
    "source": "/(.*)",
    "headers": [{
      "key": "Content-Security-Policy",
      "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co"
    }]
  }]
}
```

### 23. Test Coverage Gaps

8 test suites exist covering utilities, calculations, CSRF, and sanitization. Missing test coverage for:
- Database query functions (the 100+ methods in `supabase.js`)
- Component integration tests for critical flows (T&M ticket creation, COR approval)
- Offline sync and conflict resolution flows
- Real-time subscription behavior

### 24. No Health Check Endpoint

There's no way to monitor application health. A simple health check that verifies Supabase connectivity would enable monitoring and alerting.

### 25. Error Boundaries Are Coarse-Grained

`ErrorBoundary` wraps entire views. A failure in any component within the Dashboard takes down the entire Dashboard rather than just the failing section.

**Recommendation:** Add granular error boundaries around each Dashboard tab and each modal.

---

## Scalability Readiness Matrix

| Category | Current Capacity | Limit Before Issues | Priority |
|----------|-----------------|-------------------|----------|
| Projects per company | ~50 | ~200 (unbounded queries) | CRITICAL |
| T&M tickets per project | ~100 | ~500 (no pagination in primary calls) | CRITICAL |
| Concurrent office users | ~5 | ~20 (subscription explosion) | CRITICAL |
| Workers per check-in | ~20 | ~50 (JSON array size) | CRITICAL |
| Search performance | ~10K records | ~50K (ILIKE full scan) | HIGH |
| Materials catalog | ~200 items | ~1000 (unbounded query) | HIGH |
| Field devices | ~20 | ~100 (session cleanup) | MEDIUM |
| Document versions | ~10 | ~50 (no pagination) | MEDIUM |
| Total data volume | <1GB | ~10GB (no partitioning/archival) | MEDIUM |

---

## Recommended Priority Order

1. **Add pagination to all unbounded queries** — Immediate, prevents outages
2. **Normalize `crew_checkins.workers` to join table** — Data model fix, blocks other improvements
3. **Consolidate real-time subscriptions** — Prevents hitting Supabase limits
4. **Split `supabase.js` into domain modules** — Developer velocity
5. **Add full-text search indexes** — Search performance
6. **Implement soft deletes** — Compliance and safety
7. **Add API-wide rate limiting** — Security at scale
8. **Split Dashboard component** — Frontend performance
9. **Schedule session/attempt cleanup** — Operational hygiene
10. **Add request timeouts** — Reliability
