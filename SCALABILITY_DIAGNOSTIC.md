# FieldSync Scalability & Architecture Diagnostic

**Date**: December 2024
**Role**: Principal Software Architect
**Scope**: Full system diagnostic for multi-tenant SaaS scaling

---

## Executive Summary

FieldSync is a well-architected multi-tenant construction SaaS with solid foundational choices. The system can currently support **hundreds of companies** and **thousands of users** without significant changes. However, several architectural patterns will become bottlenecks at scale and should be addressed proactively.

### Overall Assessment

| Category | Current State | Scale Readiness | Priority |
|----------|--------------|-----------------|----------|
| Multi-Tenancy | Explicit, well-isolated | Ready for 1000+ companies | Low |
| Database Queries | Functional but unbounded | Needs pagination | High |
| RLS Policies | Functional, some recursion risk | Needs audit | Medium |
| Storage | Basic structure | Needs optimization | Medium |
| Frontend Performance | Good with debouncing | Needs virtualization | Medium |
| Observability | Minimal | Needs implementation | High |

---

## Phase 1: System Diagnostics & Baseline

### 1.1 Application Architecture Audit

#### Current Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ Foreman App │  │ Office App  │  │ Public View │             │
│  │ (Field)     │  │ (Dashboard) │  │ (Shares)    │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│  ┌──────┴────────────────┴────────────────┴──────┐             │
│  │              React SPA (Vite)                  │             │
│  │  • AuthContext (user, company, subscription)  │             │
│  │  • BrandingContext (per-company theming)      │             │
│  │  • IndexedDB (offline cache)                  │             │
│  │  • Real-time subscriptions                    │             │
│  └──────────────────────┬────────────────────────┘             │
└─────────────────────────┼───────────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────────┐
│                    SUPABASE LAYER                                │
├─────────────────────────┼───────────────────────────────────────┤
│  ┌──────────────────────┴────────────────────────┐             │
│  │              Supabase Client                   │             │
│  │  • Auth (JWT tokens)                          │             │
│  │  • PostgREST (database queries)               │             │
│  │  • Realtime (WebSocket subscriptions)         │             │
│  │  • Storage (S3-compatible)                    │             │
│  └──────────────────────┬────────────────────────┘             │
│                         │                                       │
│  ┌──────────────────────┴────────────────────────┐             │
│  │              PostgreSQL                        │             │
│  │  • Row Level Security (RLS)                   │             │
│  │  • RPC Functions (SECURITY DEFINER)           │             │
│  │  • 25+ domain tables                          │             │
│  │  • company_id as tenant isolation key         │             │
│  └───────────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

#### Identified Tight Couplings

| Coupling | Location | Risk | Recommendation |
|----------|----------|------|----------------|
| Photos in JSONB | t_and_m_tickets.photos | Row size growth | Extract to photos table |
| Dashboard queries | Dashboard.jsx:186-200 | N+1 pattern | Add materialized views |
| Legacy user repair | App.jsx auto-repair | Runs on every login | Move to background job |
| Company switching | Full data reload | Expensive | Add caching layer |

#### Hidden Assumptions

1. **All users are online most of the time** - Offline sync has basic conflict resolution
2. **Projects are small-medium sized** - No pagination on areas, tickets
3. **Photo counts are manageable** - No lazy loading for large photo libraries
4. **Single company focus** - Multi-company users trigger full reloads on switch

---

### 1.2 Database & Query Diagnostics

#### Query Statistics

| Metric | Value | Assessment |
|--------|-------|------------|
| Total database functions | 183 | Comprehensive coverage |
| Functions with `.limit()` | 8 | **Critical gap** - 4% paginated |
| Real-time subscriptions | 11 | Good coverage |
| RPC functions | 8+ | Appropriate use |

#### Query Hot-Spots

**Critical (Unbounded, High-Frequency)**

| Function | Table | Issue | Impact |
|----------|-------|-------|--------|
| `getTMTickets(projectId)` | t_and_m_tickets | No limit | Large projects crash |
| `getAreas(projectId)` | areas | No limit | 1000+ areas = slow |
| `getChangeOrders(projectId)` | change_orders + 4 joins | Deep joins | Large CORs slow |
| `getInjuryReports(companyId)` | injury_reports | Company-wide scan | Grows indefinitely |
| `getActivityLog(projectId)` | activity_log | No limit | Audit trail grows |

**Medium (Bounded but Complex)**

| Function | Issue | Recommendation |
|----------|-------|----------------|
| `calculateManDayCosts()` | Aggregates all crew data | Pre-calculate daily |
| `getCORStats()` | Multiple aggregations | Materialized view |
| `compileDailyReport()` | 3 queries per report | Batch processing |

#### Index Recommendations

```sql
-- High Priority: Frequently queried, no index
CREATE INDEX CONCURRENTLY idx_tm_tickets_project_date
  ON t_and_m_tickets(project_id, work_date DESC);

CREATE INDEX CONCURRENTLY idx_areas_project_status
  ON areas(project_id, status);

CREATE INDEX CONCURRENTLY idx_messages_project_created
  ON messages(project_id, created_at DESC);

-- Medium Priority: Growing tables
CREATE INDEX CONCURRENTLY idx_activity_log_project_date
  ON activity_log(project_id, created_at DESC);

CREATE INDEX CONCURRENTLY idx_injury_reports_company_date
  ON injury_reports(company_id, incident_date DESC);

-- Composite for membership lookups
CREATE INDEX CONCURRENTLY idx_user_companies_lookup
  ON user_companies(user_id, company_id, status, access_level);
```

#### RLS Performance Risk Report

| Policy Pattern | Risk | Tables Affected |
|----------------|------|-----------------|
| Subquery on user_companies | Medium | All tenant tables |
| SECURITY DEFINER bypass | Low | RPC functions only |
| Recursive policy potential | High | user_companies self-reference |

**Recommendation**: Audit RLS policies for:
1. Recursive references (infinite loops)
2. Missing indexes on policy columns
3. Complex subqueries that run per-row

---

### 1.3 Storage & Media Pipeline Review

#### Current Bucket Structure

```
supabase-storage/
├── tm-photos/
│   └── {companyId}/{projectId}/{ticketId}/{timestamp}.{ext}
├── company-logos/
│   └── {companyId}/logo.{ext}
├── project-photos/
│   └── {companyId}/{projectId}/{filename}
└── documents/
    └── {companyId}/{projectId}/{docId}.pdf
```

#### Storage Growth Model

| Scenario | Photos/Day | Monthly Growth | Annual Storage |
|----------|-----------|----------------|----------------|
| Small (5 projects) | 20 | 12 GB | 144 GB |
| Medium (50 projects) | 200 | 120 GB | 1.4 TB |
| Large (500 projects) | 2,000 | 1.2 TB | 14 TB |

**Assumptions**: 2MB average photo size, 20 photos/project/day

#### Access Patterns

| Access Type | Frequency | Caching | Optimization |
|-------------|-----------|---------|--------------|
| Photo upload | High (field) | None | Compress client-side |
| Photo view | Medium | 1 hour | Add thumbnails |
| PDF export | Low | None | Generate on-demand |
| Logo fetch | High | Browser | CDN candidate |

#### Cost Sensitivity Analysis

| Cost Driver | Current | At 100 Companies | At 1000 Companies |
|-------------|---------|------------------|-------------------|
| Storage (GB) | ~10 GB | ~500 GB | ~5 TB |
| Egress (GB/mo) | ~50 GB | ~2.5 TB | ~25 TB |
| Est. Monthly | ~$25 | ~$200 | ~$1,500 |

**Recommendations**:
1. Implement image compression (50-70% reduction possible)
2. Add thumbnail generation for gallery views
3. Consider tiered storage for archived projects

---

### 1.4 Frontend Performance Diagnostics

#### Initial Load Analysis

| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| Bundle size | ~720 KB | <500 KB | Code split needed |
| Initial queries | 10+ per project | 3-5 | Aggregate views |
| Time to interactive | 2-3s | <1.5s | Lazy loading |

#### Performance Bottlenecks

| Screen | Issue | Impact | Fix |
|--------|-------|--------|-----|
| Dashboard (many projects) | 10 queries × N projects | Slow initial load | Paginate projects |
| T&M Ticket List | All tickets loaded | Memory pressure | Virtual scroll |
| Photo Gallery | All photos fetched | Bandwidth | Lazy load + thumbnails |
| Activity Log | Unbounded history | Slow scroll | Pagination |
| COR Detail | Deep joins | Large payloads | Lazy load sections |

#### Missing Optimizations

- [ ] **React.memo** on list items
- [ ] **Virtual scrolling** for long lists (100+ items)
- [ ] **Lazy loading** for below-fold content
- [ ] **Image lazy loading** with IntersectionObserver
- [ ] **Query caching** layer (currently direct Supabase calls)

---

## Phase 2: Multi-Tenant Readiness Hardening

### 2.1 Tenant Boundary Enforcement

#### Audit Results

| Table | Has company_id | RLS Enabled | Isolation Status |
|-------|---------------|-------------|------------------|
| companies | N/A (is tenant) | Yes | OK |
| users | Yes (legacy) | Yes | OK |
| user_companies | Yes | Yes | OK |
| projects | Yes | Yes | OK |
| areas | Via project | Yes | OK |
| t_and_m_tickets | Via project | Yes | OK |
| change_orders | Yes + project | Yes | OK |
| injury_reports | Yes | Yes | OK |
| materials_equipment | Yes | Yes | OK |
| pricing_* | Yes | Yes | OK |

**Finding**: All tables properly scoped. No cross-tenant access possible with RLS.

#### Violations Identified

| Issue | Severity | Location | Fix |
|-------|----------|----------|-----|
| Legacy users.company_id | Low | Schema | Deprecate, use user_companies |
| Demo mode localStorage | Low | App.jsx | Separate demo tenant |

### 2.2 Authorization Model Assessment

#### Current Model

```
User
  └── user_companies (junction)
        ├── company_id (tenant)
        ├── access_level: 'administrator' | 'member'
        ├── company_role: 'Project Manager' | 'Superintendent' | etc.
        └── status: 'pending' | 'active' | 'removed'

Project
  └── project_users (junction)
        ├── user_id
        ├── project_role: Display name only
        └── notes
```

#### Scaling Analysis

| Operation | Current Complexity | At Scale | Recommendation |
|-----------|-------------------|----------|----------------|
| Check admin access | O(1) via RPC | O(1) | OK |
| List user's companies | O(n) companies | O(n) | OK, n is small |
| List company members | O(n) members | O(n) | Add pagination |
| Check project access | O(1) via RLS | O(1) | OK |

#### Simplified Access Model

The current model is appropriately simple:
- **2 access levels** (admin/member) - sufficient
- **Company roles** are informational only - good separation
- **Project roles** are display only - good separation

**No changes needed** - model scales linearly.

### 2.3 Document & Ticket Scaling Strategy

#### Current State

| Entity | Pagination | Time Filtering | Archival |
|--------|------------|----------------|----------|
| Projects | None | None | Yes (manual) |
| T&M Tickets | None | None | No |
| Change Orders | None | None | Status-based |
| Messages | Yes (limit=50) | None | No |
| Daily Reports | None | By date | No |
| Injury Reports | None | Date range | Closed status |

#### Required Changes

```javascript
// Example: Paginated T&M tickets
async getTMTickets(projectId, {
  limit = 20,
  offset = 0,
  status = null,
  dateFrom = null,
  dateTo = null
} = {}) {
  let query = supabase
    .from('t_and_m_tickets')
    .select('*, t_and_m_workers(*), t_and_m_items(*)')
    .eq('project_id', projectId)
    .order('work_date', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  if (dateFrom) query = query.gte('work_date', dateFrom);
  if (dateTo) query = query.lte('work_date', dateTo);

  return query;
}
```

#### Data Lifecycle Plan

| Stage | Criteria | Action | Storage |
|-------|----------|--------|---------|
| Active | Project status = 'active' | Full access | Hot |
| Completed | Project archived, < 1 year | Read-only | Warm |
| Archived | Project archived, > 1 year | Export-only | Cold |
| Deleted | User request + 30 days | Permanent delete | None |

---

## Phase 3: Performance & Cost Optimization

### 3.1 Compute & Query Optimization

#### When to Compute vs Store

| Data Type | Frequency | Freshness Need | Recommendation |
|-----------|-----------|----------------|----------------|
| Project progress % | Every view | Real-time | Compute |
| Man-day costs | Dashboard load | Near real-time | Cache 5 min |
| COR totals | On view | Real-time | Compute |
| Burn rate | Dashboard | Daily | Store daily |
| Injury stats | Reports | Daily | Materialized view |
| Monthly usage | Billing | Monthly | Store |

#### Recommended Materialized Views

```sql
-- Dashboard metrics (refresh every 15 min)
CREATE MATERIALIZED VIEW mv_project_metrics AS
SELECT
  p.id as project_id,
  p.company_id,
  COUNT(DISTINCT a.id) as total_areas,
  COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'done') as completed_areas,
  COALESCE(SUM(a.weight) FILTER (WHERE a.status = 'done'), 0) /
    NULLIF(SUM(a.weight), 0) * 100 as progress_pct,
  COUNT(DISTINCT t.id) as ticket_count,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'pending') as pending_tickets
FROM projects p
LEFT JOIN areas a ON a.project_id = p.id
LEFT JOIN t_and_m_tickets t ON t.project_id = p.id
GROUP BY p.id, p.company_id;

CREATE UNIQUE INDEX ON mv_project_metrics(project_id);

-- Refresh via pg_cron or Edge Function
SELECT cron.schedule('refresh-metrics', '*/15 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_project_metrics');
```

### 3.2 Storage Optimization Strategy

#### Image Compression Pipeline

```javascript
// Client-side compression before upload
async function compressAndUpload(file, maxWidth = 1920, quality = 0.8) {
  const compressed = await compressImage(file, { maxWidth, quality });
  // Typical reduction: 4MB → 400KB (90% savings)
  return db.uploadPhoto(compressed);
}

// Generate thumbnail on upload (Edge Function)
async function generateThumbnail(originalPath) {
  // Create 200px thumbnail for gallery views
  // Store at: {path}/thumb_{filename}
}
```

#### Tiered Storage Plan

| Tier | Criteria | Storage Class | Cost |
|------|----------|---------------|------|
| Hot | Active projects, < 30 days | Standard | $0.023/GB |
| Warm | Active projects, 30-365 days | Infrequent | $0.0125/GB |
| Cold | Archived projects | Archive | $0.004/GB |

#### Storage Cost Control

1. **Immediate**: Compress images client-side (50-70% reduction)
2. **Short-term**: Generate thumbnails, lazy-load full resolution
3. **Medium-term**: Implement lifecycle policies for archived data
4. **Long-term**: Consider CDN for frequently accessed assets

---

## Phase 4: Observability & Long-Term Health

### 4.1 Recommended Monitoring Stack

#### Query Performance

```sql
-- Enable pg_stat_statements
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Top slow queries
SELECT
  query,
  calls,
  mean_exec_time,
  total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;
```

#### Key Metrics to Track

| Category | Metric | Alert Threshold | Tool |
|----------|--------|-----------------|------|
| Database | Query latency p95 | > 500ms | Supabase Dashboard |
| Database | Connection pool usage | > 80% | Supabase Dashboard |
| Storage | Monthly growth rate | > 50 GB | Custom |
| API | Error rate | > 1% | Supabase Dashboard |
| API | Request rate | > 1000/min | Custom |
| Frontend | LCP | > 2.5s | Web Vitals |
| Frontend | Bundle size | > 600 KB | Build pipeline |

### 4.2 Recommended Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│                    FIELDSYNC HEALTH DASHBOARD                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Companies  │  │   Users     │  │  Projects   │             │
│  │    127      │  │   1,842     │  │    3,291    │             │
│  │   +12/mo    │  │   +156/mo   │  │   +284/mo   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
│  ┌─────────────────────────────────────────────────┐           │
│  │  Database Query Latency (p95)                    │           │
│  │  ████████████░░░░░░░░░░░░░░░░░░░░  234ms         │           │
│  │  Target: < 500ms                                 │           │
│  └─────────────────────────────────────────────────┘           │
│                                                                  │
│  ┌─────────────────────────────────────────────────┐           │
│  │  Storage Usage                                   │           │
│  │  Photos: 487 GB  │  Documents: 23 GB            │           │
│  │  Growth: +2.3 GB/day                            │           │
│  └─────────────────────────────────────────────────┘           │
│                                                                  │
│  ┌─────────────────────────────────────────────────┐           │
│  │  Top Slow Queries (last 24h)                     │           │
│  │  1. getChangeOrders - 892ms                     │           │
│  │  2. calculateManDayCosts - 567ms                │           │
│  │  3. getInjuryStatistics - 445ms                 │           │
│  └─────────────────────────────────────────────────┘           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Roadmap

### Immediate (This Week)

| Task | Effort | Impact | Owner |
|------|--------|--------|-------|
| Add pagination to T&M tickets | 2 hours | High | Backend |
| Add pagination to areas list | 1 hour | High | Backend |
| Add composite indexes | 1 hour | Medium | DBA |
| Enable pg_stat_statements | 30 min | High | DBA |

### Short Term (1-2 Weeks)

| Task | Effort | Impact | Owner |
|------|--------|--------|-------|
| Implement image compression | 4 hours | High | Frontend |
| Add virtual scrolling to lists | 8 hours | Medium | Frontend |
| Create project metrics view | 4 hours | Medium | Backend |
| Add query monitoring dashboard | 4 hours | High | DevOps |

### Medium Term (1 Month)

| Task | Effort | Impact | Owner |
|------|--------|--------|-------|
| Extract photos to separate table | 8 hours | High | Backend |
| Implement thumbnail generation | 8 hours | Medium | Backend |
| Add caching layer (Redis) | 16 hours | Medium | Backend |
| Implement data lifecycle policies | 8 hours | Medium | Backend |

### Long Term (Quarterly)

| Task | Effort | Impact | Owner |
|------|--------|--------|-------|
| Table partitioning strategy | 24 hours | High | DBA |
| CDN implementation | 16 hours | Medium | DevOps |
| Event sourcing for audit | 40 hours | Medium | Backend |
| Full observability platform | 40 hours | High | DevOps |

---

## Cost Projections

### Current State (Estimated)

| Resource | Usage | Monthly Cost |
|----------|-------|--------------|
| Supabase Pro | Base | $25 |
| Database | 10 GB | Included |
| Storage | 50 GB | $1.15 |
| Egress | 100 GB | $9 |
| **Total** | | **~$35/mo** |

### At 100 Companies

| Resource | Usage | Monthly Cost |
|----------|-------|--------------|
| Supabase Pro | Base | $25 |
| Database | 50 GB | $12.50 |
| Storage | 500 GB | $11.50 |
| Egress | 1 TB | $90 |
| **Total** | | **~$140/mo** |

### At 1000 Companies

| Resource | Usage | Monthly Cost |
|----------|-------|--------------|
| Supabase Team | Base | $599 |
| Database | 500 GB | $125 |
| Storage | 5 TB | $115 |
| Egress | 10 TB | $900 |
| **Total** | | **~$1,740/mo** |

**Key Insight**: Egress (bandwidth) is the dominant cost at scale. Implement:
1. Image compression (50% egress reduction)
2. Thumbnail galleries (70% reduction for browsing)
3. CDN for static assets (lower egress costs)

---

## Definition of Done Checklist

- [ ] System supports 1000+ companies without degradation
- [ ] No single tenant can impact others (verified via load test)
- [ ] All list queries paginated with sensible defaults
- [ ] Storage growth is predictable and monitored
- [ ] Query performance is tracked with alerting
- [ ] Architecture documented for new engineers
- [ ] Scaling decisions are data-driven (metrics available)
- [ ] Cost growth is linear, not exponential

---

## Appendix: Key Files Reference

| File | Purpose | Scaling Relevance |
|------|---------|-------------------|
| `src/lib/supabase.js` | All database queries | Query optimization |
| `src/components/Dashboard.jsx` | Main office view | N+1 queries |
| `src/components/TMForm.jsx` | T&M ticket creation | Photo uploads |
| `src/lib/offlineManager.js` | Offline sync | Conflict resolution |
| `PROJECT_CONTEXT.md` | Architecture docs | Onboarding |

---

*Document generated by architectural review. Update quarterly or after major releases.*
