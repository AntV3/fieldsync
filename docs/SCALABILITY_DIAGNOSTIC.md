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

---

# Part 2: Cloud Migration & Infrastructure Scaling Roadmap

**Date**: December 2024
**Role**: Principal Platform Engineer
**Status**: Strategic Planning Document (Not Immediate Implementation)

---

## Migration Philosophy

### Guiding Principles

```
┌─────────────────────────────────────────────────────────────────┐
│                   MIGRATION PHILOSOPHY                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. MIGRATE BECAUSE THE SYSTEM TELLS YOU, NOT BECAUSE YOU CAN   │
│     • Wait for real pain points                                 │
│     • Monitor before assuming                                   │
│     • Let data drive decisions                                  │
│                                                                  │
│  2. INCREMENTAL OVER BIG-BANG                                    │
│     • Each phase is independently valuable                      │
│     • Rollback is always possible                               │
│     • Production stays stable throughout                        │
│                                                                  │
│  3. ABSTRACT BEFORE YOU MIGRATE                                  │
│     • Create interfaces first                                   │
│     • Swap implementations behind interfaces                    │
│     • Never migrate tightly coupled code                        │
│                                                                  │
│  4. COMPLEXITY IS THE ENEMY                                      │
│     • Managed services beat self-hosted                         │
│     • Fewer moving parts = fewer failures                       │
│     • Only add infrastructure when benefits are proven          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Why NOT Big-Bang Migration

| Approach | Risk | Recovery Time | Team Stress | Recommendation |
|----------|------|---------------|-------------|----------------|
| Big-bang | Very High | Days/Weeks | Extreme | Never |
| Parallel run | Medium | Hours | Moderate | For critical systems |
| Incremental | Low | Minutes | Low | Default choice |
| Strangler fig | Very Low | Instant rollback | Minimal | Ideal for services |

**Decision**: Incremental migration with strangler fig pattern for service extraction.

---

## Current Architecture Assessment

### Component Classification

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CURRENT ARCHITECTURE COMPONENTS                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STATELESS (Easy to Scale/Migrate)                                          │
│  ─────────────────────────────────────────────────────────────────────────── │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  React SPA      │  │  PDF Generator  │  │  Excel Parser   │             │
│  │  (Vercel)       │  │  (Client-side)  │  │  (Client-side)  │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                              │
│  STATEFUL (Requires Careful Migration)                                       │
│  ─────────────────────────────────────────────────────────────────────────── │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  PostgreSQL     │  │  Supabase Auth  │  │  Real-time      │             │
│  │  (Supabase)     │  │  (JWT + Sessions)│  │  (WebSocket)    │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                                   │
│  │  File Storage   │  │  IndexedDB      │                                   │
│  │  (S3-compat)    │  │  (Client cache) │                                   │
│  └─────────────────┘  └─────────────────┘                                   │
│                                                                              │
│  TIGHTLY COUPLED (High Migration Risk)                                       │
│  ─────────────────────────────────────────────────────────────────────────── │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  RLS Policies   │  │  supabase.js    │  │  Offline Sync   │             │
│  │  (25+ tables)   │  │  (5100 lines)   │  │  (Custom queue) │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### What Scales Well Already

| Component | Current Capacity | Scaling Strategy | Notes |
|-----------|-----------------|------------------|-------|
| Multi-tenancy | 1000+ companies | RLS-based isolation | No code changes needed |
| React SPA | Unlimited | CDN/Edge | Already on Vercel |
| File storage | Petabytes | S3-compatible | Supabase handles this |
| Authentication | 100K+ users | Supabase Auth | Managed service |

### First Bottlenecks (In Order)

```
┌─────────────────────────────────────────────────────────────────┐
│                   BOTTLENECK PRIORITY ORDER                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. UNBOUNDED QUERIES (Immediate - Already a problem)           │
│  ─────────────────────────────────────────────────────────────── │
│  • getTMTickets, getAreas, getChangeOrders                      │
│  • Impact: Memory pressure, slow renders                        │
│  • Fix: Add pagination (no migration needed)                    │
│                                                                  │
│  2. STORAGE COSTS (100+ companies)                               │
│  ─────────────────────────────────────────────────────────────── │
│  • Photo growth: 2GB/day at 100 active projects                 │
│  • Impact: $200+/month in storage alone                         │
│  • Fix: Compression, thumbnails (no migration needed)           │
│                                                                  │
│  3. DATABASE CONNECTIONS (500+ concurrent users)                 │
│  ─────────────────────────────────────────────────────────────── │
│  • Supabase Pro: 60 connections                                 │
│  • Supabase Team: 200 connections                               │
│  • Impact: Connection pool exhaustion                           │
│  • Fix: Upgrade tier OR add connection pooler                   │
│                                                                  │
│  4. REAL-TIME SUBSCRIPTIONS (1000+ concurrent)                   │
│  ─────────────────────────────────────────────────────────────── │
│  • Each project = 1+ WebSocket channels                         │
│  • Impact: Memory on Supabase Realtime servers                  │
│  • Fix: Channel multiplexing or custom pub/sub                  │
│                                                                  │
│  5. COMPUTE LIMITS (Background jobs needed)                      │
│  ─────────────────────────────────────────────────────────────── │
│  • No scheduled tasks currently                                 │
│  • Impact: Can't do nightly reports, cleanup, notifications     │
│  • Fix: Add Edge Functions + pg_cron                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Migration Difficulty Matrix

| Component | Difficulty | Effort | Risk | When to Migrate |
|-----------|-----------|--------|------|-----------------|
| Static frontend | 🟢 Trivial | 1 day | None | Already portable |
| File storage | 🟢 Easy | 1 week | Low | When cost justifies |
| Database schema | 🟡 Medium | 2-3 weeks | Medium | Only if Supabase limits hit |
| RLS policies | 🟡 Hard | 3-4 weeks | High | Avoid if possible |
| Authentication | 🔴 Very Hard | 6-8 weeks | Very High | Last resort only |
| Real-time | 🔴 Very Hard | 4-6 weeks | High | Only at extreme scale |
| Offline sync | 🔴 Very Hard | 4-6 weeks | High | Avoid migration |

---

## Target Infrastructure Options

### Option 1: Stay Managed (Recommended for Now)

```
┌─────────────────────────────────────────────────────────────────┐
│                   OPTION 1: STAY MANAGED                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Current Stack (Enhanced)                                        │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Vercel    │  │  Supabase   │  │  Supabase   │             │
│  │   (SPA)     │  │  (DB+Auth)  │  │  (Storage)  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
│  + Add:                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Supabase   │  │  pg_cron    │  │  Resend/    │             │
│  │  Edge Func  │  │  (Scheduled)│  │  SendGrid   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
│  Scale Path:                                                     │
│  Pro ($25) → Team ($599) → Enterprise (Custom)                  │
│                                                                  │
│  Capacity:                                                       │
│  • 10,000+ companies                                            │
│  • 100,000+ users                                               │
│  • 10TB+ storage                                                │
│                                                                  │
│  When to Choose:                                                 │
│  ✓ Team is small (< 5 engineers)                               │
│  ✓ Growth is predictable                                       │
│  ✓ No unusual compliance requirements                          │
│  ✓ Cost is acceptable                                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Pros:**
- Zero ops burden
- Automatic scaling
- Built-in security
- Fast iteration

**Cons:**
- Higher per-unit cost at scale
- Less customization
- Vendor lock-in

**Cost at Scale:**
| Companies | Supabase Tier | Est. Monthly |
|-----------|--------------|--------------|
| 100 | Pro | $150 |
| 500 | Team | $800 |
| 2000 | Team | $2,500 |
| 5000 | Enterprise | ~$5,000 |

### Option 2: Hybrid (Managed DB + Custom Services)

```
┌─────────────────────────────────────────────────────────────────┐
│                   OPTION 2: HYBRID                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Keep Managed:                                                   │
│  ─────────────────────────────────────────────────────────────── │
│  ┌─────────────┐  ┌─────────────┐                               │
│  │  Supabase   │  │  Supabase   │                               │
│  │  (DB+Auth)  │  │  (Storage)  │                               │
│  └─────────────┘  └─────────────┘                               │
│                                                                  │
│  Add Custom:                                                     │
│  ─────────────────────────────────────────────────────────────── │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  AWS Lambda │  │  AWS SQS    │  │  CloudFront │             │
│  │  (API/Jobs) │  │  (Queues)   │  │  (CDN)      │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐                               │
│  │  Docker on  │  │  Redis      │                               │
│  │  ECS/Fargate│  │  (Caching)  │                               │
│  └─────────────┘  └─────────────┘                               │
│                                                                  │
│  When to Choose:                                                 │
│  ✓ Need custom background processing                           │
│  ✓ Need advanced caching                                       │
│  ✓ Want to reduce Supabase costs                               │
│  ✓ Have DevOps capacity                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Pros:**
- Best of both worlds
- Keep hard things managed (DB, Auth)
- Custom services where needed
- Cost optimization possible

**Cons:**
- More complexity
- Two vendors to manage
- Network latency between services

**When to Trigger:**
- Background jobs exceed Edge Function limits
- Need Redis for session/cache
- Supabase costs exceed $3,000/month

### Option 3: Full Cloud Migration (AWS/GCP)

```
┌─────────────────────────────────────────────────────────────────┐
│                   OPTION 3: FULL CLOUD                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  AWS Architecture                                                │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                     CloudFront (CDN)                      │   │
│  └────────────────────────────┬─────────────────────────────┘   │
│                               │                                  │
│  ┌────────────────────────────┴─────────────────────────────┐   │
│  │                    API Gateway                            │   │
│  └────────────────────────────┬─────────────────────────────┘   │
│                               │                                  │
│         ┌─────────────────────┼─────────────────────┐           │
│         │                     │                     │           │
│         ▼                     ▼                     ▼           │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │   Lambda    │      │  ECS/Fargate│      │   Lambda    │     │
│  │  (API)      │      │  (Workers)  │      │  (Webhooks) │     │
│  └──────┬──────┘      └──────┬──────┘      └──────┬──────┘     │
│         │                    │                    │             │
│         └────────────────────┼────────────────────┘             │
│                              │                                  │
│  ┌───────────────────────────┴───────────────────────────────┐  │
│  │                                                            │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │
│  │  │    RDS      │  │     S3      │  │ ElastiCache │       │  │
│  │  │ (Postgres)  │  │  (Storage)  │  │   (Redis)   │       │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │  │
│  │                                                            │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │
│  │  │   Cognito   │  │     SQS     │  │ EventBridge │       │  │
│  │  │   (Auth)    │  │  (Queues)   │  │  (Events)   │       │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │  │
│  │                                                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  When to Choose:                                                 │
│  ✓ Need complete control                                       │
│  ✓ Compliance requirements (HIPAA, SOC2)                       │
│  ✓ Multi-region required                                       │
│  ✓ Cost optimization at massive scale                          │
│  ✓ Have dedicated DevOps team                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Pros:**
- Maximum control
- Best cost efficiency at massive scale
- Multi-region support
- Enterprise compliance ready

**Cons:**
- Significant ops burden
- 6+ month migration
- Requires dedicated DevOps
- Must rebuild auth, RLS, real-time

**When to Trigger:**
- 5000+ companies
- Compliance requirements force it
- Supabase costs exceed $10,000/month
- Multi-region is mandatory

### Decision Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│                   INFRASTRUCTURE DECISION TREE                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  START: Are you hitting Supabase limits?                        │
│         │                                                        │
│         ├── NO → Stay on Option 1 (Managed)                     │
│         │                                                        │
│         └── YES → What limit?                                   │
│                   │                                              │
│                   ├── Connection pool → Upgrade Supabase tier   │
│                   │                                              │
│                   ├── Edge Function limits → Add AWS Lambda     │
│                   │                     (Move to Option 2)      │
│                   │                                              │
│                   ├── Cost > $5,000/mo → Evaluate Option 2/3    │
│                   │                                              │
│                   ├── Compliance req → Likely need Option 3     │
│                   │                                              │
│                   └── Multi-region → Definitely need Option 3   │
│                                                                  │
│  Decision Triggers (in order):                                   │
│  1. Connection limits → Upgrade tier first                      │
│  2. Background jobs → Add Edge Functions                        │
│  3. Cost optimization → Hybrid approach                         │
│  4. Compliance/region → Full cloud migration                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data & Storage Migration Strategy

### Database Migration (If Required)

```
┌─────────────────────────────────────────────────────────────────┐
│                   DATABASE MIGRATION STRATEGY                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Phase 1: Preparation (2 weeks before)                          │
│  ─────────────────────────────────────────────────────────────── │
│  • Audit all tables and relationships                           │
│  • Document RLS policies                                        │
│  • Create migration scripts                                     │
│  • Set up target database                                       │
│  • Test migration on staging                                    │
│                                                                  │
│  Phase 2: Dual-Write Setup (1 week before)                      │
│  ─────────────────────────────────────────────────────────────── │
│  • Add write-through layer                                      │
│  • All writes go to BOTH databases                              │
│  • Reads still from Supabase                                    │
│  • Monitor for drift                                            │
│                                                                  │
│  Phase 3: Data Sync (Migration window)                          │
│  ─────────────────────────────────────────────────────────────── │
│  • Full data export from Supabase                               │
│  • Transform (if schema changes)                                │
│  • Import to target                                             │
│  • Validate row counts + checksums                              │
│                                                                  │
│  Phase 4: Cutover (1 hour window)                               │
│  ─────────────────────────────────────────────────────────────── │
│  • Enable read-only mode                                        │
│  • Final sync of recent changes                                 │
│  • Update connection strings                                    │
│  • Validate application                                         │
│  • Enable writes on new database                                │
│                                                                  │
│  Phase 5: Rollback Ready (1 week after)                         │
│  ─────────────────────────────────────────────────────────────── │
│  • Keep Supabase active but read-only                           │
│  • Continue dual-write for rollback option                      │
│  • Monitor for issues                                           │
│  • After 1 week stable: disable Supabase                        │
│                                                                  │
│  Zero Downtime Approach:                                         │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  ┌───────────┐     ┌───────────┐     ┌───────────┐             │
│  │   App     │────►│  Proxy    │────►│  Source   │             │
│  │           │     │  Layer    │     │ (Supabase)│             │
│  └───────────┘     └─────┬─────┘     └───────────┘             │
│                          │                                      │
│                          │ (dual-write)                         │
│                          ▼                                      │
│                    ┌───────────┐                                │
│                    │  Target   │                                │
│                    │  (RDS)    │                                │
│                    └───────────┘                                │
│                                                                  │
│  Flip reads from Source → Target when ready                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### File Storage Migration

```
┌─────────────────────────────────────────────────────────────────┐
│                   STORAGE MIGRATION STRATEGY                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Approach: Lazy Migration (Recommended)                          │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  Instead of moving all files at once:                           │
│                                                                  │
│  1. New uploads → go to new storage (S3)                        │
│  2. Existing files → stay in Supabase                           │
│  3. On access → copy to new storage (cache-through)             │
│  4. Gradually all active files migrate naturally                │
│  5. Bulk migrate cold/archived files later                      │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Storage Proxy                         │    │
│  │                                                          │    │
│  │   Upload ──────────────────────────► New Storage (S3)   │    │
│  │                                                          │    │
│  │   Read ───┬── Check S3 first                            │    │
│  │           │   └── If exists → return                    │    │
│  │           │                                              │    │
│  │           └── If not → fetch from Supabase               │    │
│  │                        copy to S3                        │    │
│  │                        return                            │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Benefits:                                                       │
│  • Zero downtime                                                │
│  • No bulk migration needed                                     │
│  • Frequently accessed files migrate first                      │
│  • Old projects stay cheap in Supabase                         │
│                                                                  │
│  Bulk Migration (for archived data):                            │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  # Use rclone for bulk transfer (handles S3-to-S3)             │
│  rclone sync supabase:tm-photos s3:fieldsync-photos \           │
│    --progress --transfers 32                                    │
│                                                                  │
│  # Validate                                                      │
│  rclone check supabase:tm-photos s3:fieldsync-photos            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Tenant Isolation During Migration

```
┌─────────────────────────────────────────────────────────────────┐
│                   TENANT ISOLATION STRATEGY                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  If migrating from Supabase RLS → Custom Auth:                   │
│                                                                  │
│  Option A: Application-Level Enforcement                         │
│  ─────────────────────────────────────────────────────────────── │
│  • All queries include company_id filter                        │
│  • Middleware validates user → company membership               │
│  • Centralized authorization service                            │
│                                                                  │
│  Option B: Database-Level Enforcement                            │
│  ─────────────────────────────────────────────────────────────── │
│  • Recreate RLS policies in new database                        │
│  • Use connection-level variables (SET app.company_id)          │
│  • Policies reference these variables                           │
│                                                                  │
│  Recommendation: Option A + B (Defense in Depth)                 │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  Application enforces → First line of defense                   │
│  Database enforces → Safety net                                 │
│                                                                  │
│  Migration Validation:                                           │
│  ─────────────────────────────────────────────────────────────── │
│  • Write integration tests that verify:                         │
│    - User A cannot see User B's data                           │
│    - Company A cannot access Company B's projects               │
│    - Removed users have no access                               │
│  • Run these tests before AND after migration                   │
│  • Automate as part of CI/CD                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Docker & Service Decomposition

### When Docker Helps vs Hurts

```
┌─────────────────────────────────────────────────────────────────┐
│                   DOCKER DECISION FRAMEWORK                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DOCKER HELPS WHEN:                                              │
│  ─────────────────────────────────────────────────────────────── │
│  ✓ You need custom runtimes (Python ML, Go services)           │
│  ✓ Long-running background jobs (> 5 min)                       │
│  ✓ Complex dependencies (ImageMagick, FFmpeg)                   │
│  ✓ Need consistent dev/prod environments                        │
│  ✓ Team has container expertise                                 │
│  ✓ Running on Kubernetes already                                │
│                                                                  │
│  DOCKER HURTS WHEN:                                              │
│  ─────────────────────────────────────────────────────────────── │
│  ✗ Simple request-response APIs (use serverless)               │
│  ✗ No DevOps capacity                                          │
│  ✗ Low traffic (< 1000 req/min)                                │
│  ✗ Managed alternatives exist and work                         │
│  ✗ Cold start time matters (use Lambda instead)                │
│                                                                  │
│  For FieldSync Today: NO DOCKER NEEDED                          │
│  ─────────────────────────────────────────────────────────────── │
│  • Serverless (Vercel + Edge Functions) handles everything     │
│  • No custom runtimes required                                  │
│  • No long-running jobs yet                                     │
│  • Team is small                                                │
│                                                                  │
│  Docker Makes Sense When:                                        │
│  ─────────────────────────────────────────────────────────────── │
│  • PDF generation moves server-side (Puppeteer/Chrome)          │
│  • Image processing pipeline (thumbnails, compression)          │
│  • Report generation > 10 minutes                               │
│  • ML-based features (OCR, classification)                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Service Decomposition (If/When Needed)

```
┌─────────────────────────────────────────────────────────────────┐
│                   SERVICE EXTRACTION ORDER                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Extract services in this order (if needed):                     │
│                                                                  │
│  PHASE 1: Background Jobs (Lowest Risk)                         │
│  ─────────────────────────────────────────────────────────────── │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Notification Service                                    │    │
│  │  • Email sending (pending approvals, reports)           │    │
│  │  • Push notifications (future mobile)                   │    │
│  │  • SMS alerts (optional)                                │    │
│  │                                                          │    │
│  │  Implementation: AWS Lambda + SQS or Edge Function      │    │
│  │  Risk: Low (stateless, new code)                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Report Generation Service                               │    │
│  │  • Scheduled daily/weekly reports                       │    │
│  │  • Large PDF generation                                 │    │
│  │  • Data exports                                         │    │
│  │                                                          │    │
│  │  Implementation: Docker on ECS Fargate (if > 15 min)    │    │
│  │  Risk: Low (no user-facing impact if delayed)           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  PHASE 2: Media Processing (Medium Risk)                        │
│  ─────────────────────────────────────────────────────────────── │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Image Processing Service                                │    │
│  │  • Thumbnail generation                                 │    │
│  │  • Image compression                                    │    │
│  │  • OCR (future)                                         │    │
│  │                                                          │    │
│  │  Implementation: Lambda + S3 trigger                    │    │
│  │  Risk: Medium (affects photo viewing if broken)         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  PHASE 3: Real-Time (High Risk - Avoid Unless Necessary)        │
│  ─────────────────────────────────────────────────────────────── │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  WebSocket Service                                       │    │
│  │  • Only if Supabase Realtime hits limits                │    │
│  │  • Requires custom scaling                              │    │
│  │  • Sticky sessions needed                               │    │
│  │                                                          │    │
│  │  Implementation: Docker + Redis Pub/Sub + ALB           │    │
│  │  Risk: Very High (affects all real-time features)       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  NEVER EXTRACT (Keep in Database):                               │
│  ─────────────────────────────────────────────────────────────── │
│  ✗ Authorization logic (keep in RLS/database)                  │
│  ✗ Data validation (keep in constraints)                       │
│  ✗ Audit logging (keep in triggers)                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Container Architecture (When Ready)

```
┌─────────────────────────────────────────────────────────────────┐
│                   CONTAINER ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Recommended: ECS Fargate (Serverless Containers)               │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  Why Fargate over EKS:                                           │
│  • No cluster management                                        │
│  • Pay per container-second                                     │
│  • Simpler for small teams                                      │
│  • Can migrate to EKS later if needed                          │
│                                                                  │
│  Container Strategy:                                             │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      ECR (Container Registry)             │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐           │   │
│  │  │ worker:v1  │ │ reports:v1 │ │ images:v1  │           │   │
│  │  └────────────┘ └────────────┘ └────────────┘           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                               │                                  │
│                               ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    ECS Fargate Cluster                    │   │
│  │                                                           │   │
│  │  ┌──────────────┐  ┌──────────────┐                      │   │
│  │  │  Worker      │  │  Reports     │                      │   │
│  │  │  Service     │  │  Service     │                      │   │
│  │  │              │  │              │                      │   │
│  │  │  Tasks: 2    │  │  Tasks: 1    │                      │   │
│  │  │  CPU: 256    │  │  CPU: 1024   │                      │   │
│  │  │  Mem: 512    │  │  Mem: 2048   │                      │   │
│  │  └──────────────┘  └──────────────┘                      │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Scaling Rules:                                                  │
│  • Min: 1 task (always warm)                                    │
│  • Max: 10 tasks                                                │
│  • Scale on: SQS queue depth                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phased Migration Roadmap

### Phase 0: Preparation & Abstraction (Current → 3 months)

```
┌─────────────────────────────────────────────────────────────────┐
│                   PHASE 0: PREPARATION                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Goals:                                                          │
│  • Make migration POSSIBLE without doing it yet                 │
│  • Abstract away direct Supabase dependencies                   │
│  • Add observability to know when to migrate                    │
│                                                                  │
│  What Changes:                                                   │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  1. Split supabase.js into domain modules                       │
│     Before: src/lib/supabase.js (5100 lines, everything)        │
│     After:  src/lib/                                            │
│             ├── api/                                            │
│             │   ├── projects.js                                 │
│             │   ├── tickets.js                                  │
│             │   ├── areas.js                                    │
│             │   ├── users.js                                    │
│             │   └── storage.js                                  │
│             ├── auth.js                                         │
│             └── realtime.js                                     │
│                                                                  │
│  2. Add abstraction layer                                        │
│     // api/tickets.js                                           │
│     export const ticketApi = {                                  │
│       getAll: (projectId) => supabaseImpl.getTickets(projectId),│
│       create: (data) => supabaseImpl.createTicket(data),        │
│       // Can swap supabaseImpl → customApiImpl later            │
│     }                                                           │
│                                                                  │
│  3. Add monitoring & metrics                                     │
│     • Enable pg_stat_statements                                 │
│     • Track query latencies                                     │
│     • Monitor storage growth                                    │
│     • Alert on error rates                                      │
│                                                                  │
│  What Stays the Same:                                            │
│  ─────────────────────────────────────────────────────────────── │
│  • All infrastructure (Supabase, Vercel)                        │
│  • Database schema                                              │
│  • User experience                                              │
│  • Deployment process                                           │
│                                                                  │
│  Exit Criteria:                                                  │
│  ─────────────────────────────────────────────────────────────── │
│  □ supabase.js split into < 500 line modules                   │
│  □ All DB calls go through abstraction layer                   │
│  □ Query performance metrics visible                            │
│  □ Storage growth tracked                                       │
│  □ Error rates monitored                                        │
│                                                                  │
│  Effort: 2-3 weeks                                               │
│  Risk: Low (refactoring only, no behavior change)               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 1: Observability & Boundaries (3-6 months)

```
┌─────────────────────────────────────────────────────────────────┐
│                   PHASE 1: OBSERVABILITY                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Goals:                                                          │
│  • Know exactly where bottlenecks are                           │
│  • Have data to justify any migration decision                  │
│  • Establish performance baselines                              │
│                                                                  │
│  What Changes:                                                   │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  1. Query Performance Tracking                                   │
│     • Instrument all database calls with timing                 │
│     • Track slow queries (> 500ms)                              │
│     • Dashboard for top 20 slowest queries                      │
│                                                                  │
│  2. Resource Usage Monitoring                                    │
│     • Database connections in use                               │
│     • Real-time subscription count                              │
│     • Storage by company                                        │
│     • Bandwidth by endpoint                                     │
│                                                                  │
│  3. Cost Attribution                                             │
│     • Track costs per company (for billing)                     │
│     • Identify cost outliers                                    │
│     • Project growth trends                                     │
│                                                                  │
│  4. Define Service Boundaries                                    │
│     • Document what could be extracted                          │
│     • Define clear interfaces                                   │
│     • No extraction yet - just documentation                    │
│                                                                  │
│  What Stays the Same:                                            │
│  ─────────────────────────────────────────────────────────────── │
│  • All infrastructure                                           │
│  • All user-facing functionality                                │
│  • Database schema                                              │
│                                                                  │
│  Exit Criteria:                                                  │
│  ─────────────────────────────────────────────────────────────── │
│  □ Health dashboard operational                                 │
│  □ Can answer: "What's our slowest query?"                     │
│  □ Can answer: "Which company uses most storage?"              │
│  □ Can answer: "What will we hit first at 2x scale?"           │
│  □ Service boundaries documented                                │
│                                                                  │
│  Effort: 2-4 weeks                                               │
│  Risk: Very Low (adding visibility, no changes)                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 2: Optimization & Edge Functions (6-12 months)

```
┌─────────────────────────────────────────────────────────────────┐
│                   PHASE 2: OPTIMIZATION                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Goals:                                                          │
│  • Extend Supabase capabilities with Edge Functions             │
│  • Address performance issues found in Phase 1                  │
│  • Add background processing                                    │
│                                                                  │
│  Trigger: Phase 1 metrics show specific bottlenecks             │
│                                                                  │
│  What Changes:                                                   │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  1. Add Supabase Edge Functions                                  │
│     ├── stripe-webhooks (payment processing)                   │
│     ├── send-notifications (email/push)                        │
│     ├── generate-thumbnails (image processing)                 │
│     └── scheduled-reports (via pg_cron trigger)                │
│                                                                  │
│  2. Performance Optimizations                                    │
│     • Add materialized views for dashboards                     │
│     • Implement query caching (React Query)                     │
│     • Add missing indexes                                       │
│     • Paginate remaining unbounded queries                      │
│                                                                  │
│  3. Storage Optimizations                                        │
│     • Client-side image compression                             │
│     • Thumbnail generation pipeline                             │
│     • Archive policy for old projects                           │
│                                                                  │
│  What Stays the Same:                                            │
│  ─────────────────────────────────────────────────────────────── │
│  • Core infrastructure (Supabase, Vercel)                       │
│  • Database as single source of truth                           │
│  • Authentication via Supabase                                  │
│                                                                  │
│  Architecture After Phase 2:                                     │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                      Vercel (SPA)                        │    │
│  └────────────────────────────┬────────────────────────────┘    │
│                               │                                  │
│  ┌────────────────────────────┴────────────────────────────┐    │
│  │                    Supabase                              │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │    │
│  │  │   DB    │ │  Auth   │ │ Storage │ │ Realtime│       │    │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │    │
│  │                                                          │    │
│  │  ┌──────────────────────────────────────────────────┐   │    │
│  │  │              Edge Functions                       │   │    │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐         │   │    │
│  │  │  │ Webhooks │ │ Notify   │ │ Reports  │         │   │    │
│  │  │  └──────────┘ └──────────┘ └──────────┘         │   │    │
│  │  └──────────────────────────────────────────────────┘   │    │
│  │                                                          │    │
│  │  ┌──────────────────────────────────────────────────┐   │    │
│  │  │              pg_cron (Scheduled Jobs)             │   │    │
│  │  │  • Nightly reports • Cleanup • Metrics refresh   │   │    │
│  │  └──────────────────────────────────────────────────┘   │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Exit Criteria:                                                  │
│  ─────────────────────────────────────────────────────────────── │
│  □ All payment processing via Edge Functions                   │
│  □ Email notifications automated                                │
│  □ Query p95 latency < 500ms                                   │
│  □ Storage cost reduced 50% via compression                    │
│  □ Background jobs running for reports/cleanup                 │
│                                                                  │
│  Effort: 4-8 weeks                                               │
│  Risk: Low-Medium (new capabilities, not replacing existing)   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 3: Hybrid Cloud (Only If Needed) (12-18 months)

```
┌─────────────────────────────────────────────────────────────────┐
│                   PHASE 3: HYBRID CLOUD                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Goals:                                                          │
│  • Add AWS services for specific needs                          │
│  • Keep Supabase for core DB/Auth                               │
│  • Optimize costs at scale                                      │
│                                                                  │
│  Trigger: ONE of these conditions:                              │
│  • Edge Functions hit execution limits                          │
│  • Supabase costs exceed $3,000/month                          │
│  • Need services Supabase doesn't offer                         │
│                                                                  │
│  What Changes:                                                   │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  1. Add AWS Infrastructure                                       │
│     • CloudFront CDN for static assets + photos                 │
│     • Lambda for complex background jobs                        │
│     • SQS for job queuing                                       │
│     • S3 for new photo uploads (cost optimization)              │
│                                                                  │
│  2. Migrate Storage (Lazy)                                       │
│     • New uploads → S3                                          │
│     • Old files → accessed via proxy, migrated on-demand        │
│     • Archived projects → move to S3 Glacier                    │
│                                                                  │
│  3. Add Caching Layer                                            │
│     • ElastiCache Redis for frequently accessed data            │
│     • Session storage                                           │
│     • Query result caching                                      │
│                                                                  │
│  What Stays the Same:                                            │
│  ─────────────────────────────────────────────────────────────── │
│  • Database in Supabase (PostgreSQL)                            │
│  • Authentication via Supabase                                  │
│  • Real-time via Supabase                                       │
│  • RLS policies unchanged                                       │
│                                                                  │
│  Architecture After Phase 3:                                     │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   CloudFront CDN                         │    │
│  └────────────────────────┬────────────────────────────────┘    │
│                           │                                      │
│         ┌─────────────────┼─────────────────┐                   │
│         │                 │                 │                   │
│         ▼                 ▼                 ▼                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Vercel    │  │  Supabase   │  │    AWS      │             │
│  │   (SPA)     │  │ (DB/Auth/RT)│  │ (Storage/   │             │
│  │             │  │             │  │  Compute)   │             │
│  └─────────────┘  └──────┬──────┘  └──────┬──────┘             │
│                          │                │                     │
│                          │    ┌───────────┘                     │
│                          │    │                                 │
│                          ▼    ▼                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │  │
│  │  │    S3    │ │  Lambda  │ │   SQS    │ │  Redis   │    │  │
│  │  │ (Photos) │ │  (Jobs)  │ │ (Queues) │ │ (Cache)  │    │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Exit Criteria:                                                  │
│  ─────────────────────────────────────────────────────────────── │
│  □ All new photos stored in S3                                 │
│  □ CloudFront serving static assets                            │
│  □ Background jobs running on Lambda                           │
│  □ Redis caching reducing DB load by 40%                       │
│  □ Monthly costs optimized vs pure Supabase                    │
│                                                                  │
│  Effort: 8-12 weeks                                              │
│  Risk: Medium (adding complexity, but Supabase is fallback)    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 4: Full Cloud Migration (Only If Required) (18+ months)

```
┌─────────────────────────────────────────────────────────────────┐
│                   PHASE 4: FULL CLOUD (IF NEEDED)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ⚠️  WARNING: Only pursue if absolutely necessary               │
│                                                                  │
│  Trigger: ALL of these conditions:                               │
│  • Supabase fundamentally cannot support requirements           │
│  • Multi-region is mandatory (compliance)                       │
│  • Have dedicated DevOps team (3+ engineers)                    │
│  • Budget for 6+ month migration                                │
│                                                                  │
│  What Changes:                                                   │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  1. Database Migration                                           │
│     • PostgreSQL → Amazon RDS or Aurora                         │
│     • Recreate RLS as application-level auth                    │
│     • Add read replicas for scaling                             │
│                                                                  │
│  2. Authentication Migration                                     │
│     • Supabase Auth → Amazon Cognito                            │
│     • Migrate all users (password reset required)               │
│     • Update all JWT validation                                 │
│                                                                  │
│  3. Real-Time Migration                                          │
│     • Supabase Realtime → Custom WebSocket service              │
│     • Redis Pub/Sub for scaling                                 │
│     • Sticky sessions via ALB                                   │
│                                                                  │
│  4. Full API Layer                                               │
│     • Add API Gateway                                           │
│     • Lambda or ECS for all business logic                      │
│     • Rate limiting, throttling                                 │
│                                                                  │
│  What This Enables:                                              │
│  ─────────────────────────────────────────────────────────────── │
│  • Multi-region deployment                                      │
│  • Complete control over scaling                                │
│  • Custom compliance requirements                               │
│  • No vendor dependency                                         │
│                                                                  │
│  What This Costs:                                                │
│  ─────────────────────────────────────────────────────────────── │
│  • 6-12 months of development                                   │
│  • Dedicated DevOps team                                        │
│  • Increased operational complexity                             │
│  • Higher base infrastructure cost                              │
│                                                                  │
│  Full Architecture:                                              │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Route 53 (DNS)                          │   │
│  └────────────────────────────┬─────────────────────────────┘   │
│                               │                                  │
│  ┌────────────────────────────┴─────────────────────────────┐   │
│  │                   CloudFront (CDN)                        │   │
│  └────────────────────────────┬─────────────────────────────┘   │
│                               │                                  │
│  ┌────────────────────────────┴─────────────────────────────┐   │
│  │                   Application Load Balancer               │   │
│  └──────────────┬─────────────┬─────────────┬───────────────┘   │
│                 │             │             │                    │
│        ┌────────┴───┐  ┌──────┴─────┐  ┌────┴────────┐         │
│        │   Static   │  │    API     │  │  WebSocket  │         │
│        │   (S3)     │  │  Gateway   │  │   (ALB)     │         │
│        └────────────┘  └──────┬─────┘  └──────┬──────┘         │
│                               │               │                  │
│         ┌─────────────────────┼───────────────┼─────────┐       │
│         │                     ▼               ▼         │       │
│         │  ┌─────────────┐ ┌─────────────┐ ┌─────────┐ │       │
│         │  │   Lambda    │ │    ECS      │ │   ECS   │ │       │
│         │  │   (APIs)    │ │  (Workers)  │ │  (WS)   │ │       │
│         │  └──────┬──────┘ └──────┬──────┘ └────┬────┘ │       │
│         │         │               │             │       │       │
│         │         └───────────────┼─────────────┘       │       │
│         │                         │                     │       │
│         │  ┌──────────────────────┴───────────────────┐ │       │
│         │  │              Data Layer                   │ │       │
│         │  │                                           │ │       │
│         │  │ ┌────────┐ ┌────────┐ ┌────────┐        │ │       │
│         │  │ │  RDS   │ │   S3   │ │ Redis  │        │ │       │
│         │  │ │(Aurora)│ │        │ │(Cache) │        │ │       │
│         │  │ └────────┘ └────────┘ └────────┘        │ │       │
│         │  │                                           │ │       │
│         │  │ ┌────────┐ ┌────────┐ ┌────────┐        │ │       │
│         │  │ │Cognito │ │  SQS   │ │  SNS   │        │ │       │
│         │  │ │ (Auth) │ │(Queues)│ │(Events)│        │ │       │
│         │  │ └────────┘ └────────┘ └────────┘        │ │       │
│         │  └───────────────────────────────────────────┘ │       │
│         └───────────────────────────────────────────────┘       │
│                                                                  │
│  Exit Criteria:                                                  │
│  ─────────────────────────────────────────────────────────────── │
│  □ All services running on AWS                                  │
│  □ Multi-region deployment active                               │
│  □ Supabase fully decommissioned                                │
│  □ All compliance requirements met                              │
│  □ Disaster recovery tested                                     │
│                                                                  │
│  Effort: 6-12 months                                             │
│  Risk: High (complete platform change)                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Risks & Mitigations

### Risk Matrix

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Supabase outage | Low | High | Multi-region future, offline mode |
| Migration data loss | Low | Critical | Dual-write, checksums, backups |
| Auth migration breaks users | Medium | High | Gradual rollout, parallel auth |
| Cost overrun | Medium | Medium | Monitoring, alerts, budgets |
| Team capacity | Medium | High | Phase work, external help |
| Real-time migration failure | High | High | Avoid unless necessary |

### Rollback Strategies

```
┌─────────────────────────────────────────────────────────────────┐
│                   ROLLBACK STRATEGIES                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Phase 0-1 (Refactoring):                                        │
│  • Rollback: Revert code changes                                │
│  • Time: Minutes (git revert)                                   │
│  • Data impact: None                                            │
│                                                                  │
│  Phase 2 (Edge Functions):                                       │
│  • Rollback: Disable Edge Functions, use client-side fallback  │
│  • Time: Minutes (disable in dashboard)                         │
│  • Data impact: None                                            │
│                                                                  │
│  Phase 3 (Hybrid):                                               │
│  • Rollback: Point traffic back to Supabase storage            │
│  • Time: Hours (DNS + config)                                   │
│  • Data impact: Sync any new S3 data back                       │
│                                                                  │
│  Phase 4 (Full Cloud):                                           │
│  • Rollback: Not practical - Supabase decommissioned            │
│  • Mitigation: Keep Supabase on standby for 3 months           │
│  • Time: Days to restore from backup                            │
│                                                                  │
│  General Principles:                                             │
│  ─────────────────────────────────────────────────────────────── │
│  • Always have working rollback before cutover                  │
│  • Test rollback in staging first                               │
│  • Document rollback steps for on-call                          │
│  • Set clear go/no-go criteria for each phase                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Decision Triggers Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                   WHEN TO ACT                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  DO NOTHING (Stay on Current Supabase Setup) If:                │
│  • Query latency p95 < 500ms                                    │
│  • Storage costs < $500/month                                   │
│  • No connection pool exhaustion                                │
│  • Real-time works for all projects                             │
│  • Team is happy with velocity                                  │
│                                                                  │
│  DO PHASE 0-1 (Abstraction + Observability) When:               │
│  • Planning for growth                                          │
│  • Want migration optionality                                   │
│  • Need to understand bottlenecks                               │
│  • supabase.js is hard to maintain                              │
│                                                                  │
│  DO PHASE 2 (Edge Functions) When:                               │
│  • Need background jobs                                         │
│  • Need payment processing                                      │
│  • Need scheduled reports                                       │
│  • Edge Function limits not hit                                 │
│                                                                  │
│  DO PHASE 3 (Hybrid Cloud) When:                                 │
│  • Storage costs > $2,000/month                                 │
│  • Edge Functions hitting limits                                │
│  • Need Redis caching                                           │
│  • CDN would significantly reduce bandwidth costs               │
│                                                                  │
│  DO PHASE 4 (Full Cloud) When:                                   │
│  • Multi-region is mandatory                                    │
│  • Compliance requires self-hosting                             │
│  • Supabase fundamentally can't scale                           │
│  • Have DevOps team to support                                  │
│  • CEO says "we're going enterprise"                            │
│                                                                  │
│  NEVER DO Phase 4 Just Because:                                  │
│  ✗ "AWS is more professional"                                  │
│  ✗ "We might need it someday"                                  │
│  ✗ "Other companies use Kubernetes"                            │
│  ✗ "I want to learn AWS"                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Appendix: Migration Checklist Templates

### Pre-Migration Checklist (Any Phase)

- [ ] Metrics baseline established
- [ ] Rollback procedure documented and tested
- [ ] Team briefed on changes
- [ ] Staging environment mirrors production
- [ ] Migration scripts tested in staging
- [ ] Communication plan for users (if downtime)
- [ ] On-call schedule for migration window

### Post-Migration Validation

- [ ] All automated tests passing
- [ ] Manual smoke tests completed
- [ ] Performance metrics within acceptable range
- [ ] Error rates not increased
- [ ] User feedback collected
- [ ] Rollback window (keep old system warm)
- [ ] Documentation updated

---

*This roadmap is a living document. Update when:*
- *Scale triggers are hit*
- *New constraints emerge*
- *Technology options change*
- *Team capacity changes*

---

# Part 3: Observability & Scaling Decision Signals

**Date**: December 2024
**Role**: Principal Platform Engineer
**Status**: Foundational Strategy Document

---

## Executive Principle

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│      "We cannot scale what we cannot see.                       │
│       And we should not migrate until the system tells us to."  │
│                                                                  │
│      Observability is not about dashboards.                     │
│      It's about clarity, confidence, and timing.                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

This section answers one core question:

**Where and how will we see the signals that tell us it's time to scale or migrate infrastructure?**

---

## 1. What Should We Observe?

### 1.1 Minimum Critical Signals

These are the non-negotiable signals that must be visible before any scaling decision:

```
┌─────────────────────────────────────────────────────────────────┐
│                   CRITICAL SIGNAL CATEGORIES                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  1. PERFORMANCE DEGRADATION                               │   │
│  │  ─────────────────────────────────────────────────────────│   │
│  │  • Query latency (p50, p95, p99)                         │   │
│  │  • Page load time                                         │   │
│  │  • Real-time subscription delay                           │   │
│  │  • File upload/download duration                          │   │
│  │                                                            │   │
│  │  WHY: First sign users will notice degradation            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  2. COST RISK                                             │   │
│  │  ─────────────────────────────────────────────────────────│   │
│  │  • Storage growth rate (GB/month)                         │   │
│  │  • Egress bandwidth consumption                           │   │
│  │  • Database compute utilization                           │   │
│  │  • Edge Function invocation count                         │   │
│  │                                                            │   │
│  │  WHY: Cost spikes are preventable with early warning      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  3. ARCHITECTURAL STRAIN                                  │   │
│  │  ─────────────────────────────────────────────────────────│   │
│  │  • Connection pool utilization                            │   │
│  │  • Real-time subscription count                           │   │
│  │  • RLS policy execution time                              │   │
│  │  • Background job queue depth                             │   │
│  │                                                            │   │
│  │  WHY: Infrastructure limits approach silently             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  4. TENANT-SPECIFIC ISSUES                                │   │
│  │  ─────────────────────────────────────────────────────────│   │
│  │  • Per-company query latency                              │   │
│  │  • Per-company storage consumption                        │   │
│  │  • Per-company error rates                                │   │
│  │  • Per-company active user count                          │   │
│  │                                                            │   │
│  │  WHY: One tenant can degrade experience for all           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  5. ERROR RATES                                           │   │
│  │  ─────────────────────────────────────────────────────────│   │
│  │  • 500 errors (server failures)                           │   │
│  │  • 403 errors (RLS/permission failures)                   │   │
│  │  • 429 errors (rate limiting)                             │   │
│  │  • Network/timeout errors                                 │   │
│  │  • Sync conflict errors                                   │   │
│  │                                                            │   │
│  │  WHY: Error spikes precede outages                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Database Query Performance Signals

```
┌─────────────────────────────────────────────────────────────────┐
│                   DATABASE OBSERVABILITY                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Critical Queries to Monitor (from supabase.js analysis):       │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  HIGH FREQUENCY (Every page load)                                │
│  ┌────────────────────────┬─────────────┬──────────────────┐    │
│  │ Function               │ Complexity  │ Monitor For      │    │
│  ├────────────────────────┼─────────────┼──────────────────┤    │
│  │ getProjects()          │ Multi-join  │ Latency, count   │    │
│  │ getAreas()             │ N per proj  │ Unbounded growth │    │
│  │ getTMTickets()         │ 3-table join│ Row explosion    │    │
│  │ getMessages()          │ Paginated   │ Subscription lag │    │
│  └────────────────────────┴─────────────┴──────────────────┘    │
│                                                                  │
│  HEAVY COMPUTE (Dashboard/Reports)                               │
│  ┌────────────────────────┬─────────────┬──────────────────┐    │
│  │ Function               │ Complexity  │ Monitor For      │    │
│  ├────────────────────────┼─────────────┼──────────────────┤    │
│  │ calculateManDayCosts() │ 365-day agg │ Memory, duration │    │
│  │ getCORStats()          │ Multi-agg   │ CPU time         │    │
│  │ getProjectActivity()   │ Audit scan  │ Row count        │    │
│  │ compileDailyReport()   │ 3 queries   │ Total duration   │    │
│  └────────────────────────┴─────────────┴──────────────────┘    │
│                                                                  │
│  RLS Policy Execution Cost                                       │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  SELECT * FROM pg_stat_statements                                │
│  WHERE query ILIKE '%user_companies%'  -- RLS subquery           │
│  ORDER BY mean_exec_time DESC;                                   │
│                                                                  │
│  Watch for:                                                      │
│  • Recursive policy checks (user_companies self-reference)      │
│  • Per-row policy evaluation (linear cost growth)               │
│  • Missing indexes on policy columns                             │
│                                                                  │
│  Metrics to Capture:                                             │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  {                                                               │
│    "query_id": "getTMTickets",                                  │
│    "company_id": "uuid",                                        │
│    "project_id": "uuid",                                        │
│    "duration_ms": 234,                                          │
│    "rows_returned": 847,                                        │
│    "timestamp": "2024-12-28T10:30:00Z"                          │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Storage & File Operation Signals

```
┌─────────────────────────────────────────────────────────────────┐
│                   STORAGE OBSERVABILITY                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Upload Monitoring                                               │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  Per Upload Event:                                               │
│  {                                                               │
│    "operation": "photo_upload",                                 │
│    "company_id": "uuid",                                        │
│    "project_id": "uuid",                                        │
│    "file_size_bytes": 2456789,                                  │
│    "compressed_size_bytes": 489123,                             │
│    "compression_ratio": 0.80,                                   │
│    "duration_ms": 1234,                                         │
│    "success": true,                                             │
│    "error_type": null                                           │
│  }                                                               │
│                                                                  │
│  Storage Growth Signals                                          │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  ┌───────────────────┬────────────┬────────────────────────┐    │
│  │ Metric            │ Frequency  │ Source                 │    │
│  ├───────────────────┼────────────┼────────────────────────┤    │
│  │ Total storage     │ Daily      │ Supabase Dashboard API │    │
│  │ Per-company usage │ Daily      │ Path prefix aggregation│    │
│  │ Growth rate       │ Weekly     │ Calculated from daily  │    │
│  │ Top 10 companies  │ Weekly     │ Sorted by usage        │    │
│  └───────────────────┴────────────┴────────────────────────┘    │
│                                                                  │
│  Access Pattern Signals                                          │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  • Download frequency by file age (hot vs cold data)            │
│  • Egress by company (identify bandwidth-heavy tenants)         │
│  • Cache hit rate (browser + CDN if applicable)                 │
│  • Failed download attempts (broken links, deleted files)       │
│                                                                  │
│  Archive Operations (archiveProjectDeep)                         │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  {                                                               │
│    "operation": "project_archive",                              │
│    "company_id": "uuid",                                        │
│    "project_id": "uuid",                                        │
│    "files_deleted": 847,                                        │
│    "storage_freed_mb": 1234,                                    │
│    "duration_ms": 45678,                                        │
│    "batch_count": 9,                                            │
│    "success": true                                              │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.4 Error Rate Signals

```
┌─────────────────────────────────────────────────────────────────┐
│                   ERROR OBSERVABILITY                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Error Classification (Priority Order)                           │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  CRITICAL (Immediate Action)                                     │
│  ┌────────────────┬────────────────────────────────────────┐    │
│  │ Type           │ Indicates                               │    │
│  ├────────────────┼────────────────────────────────────────┤    │
│  │ 500 errors     │ Server/database failure                 │    │
│  │ Auth failures  │ Token expiry, session issues            │    │
│  │ RLS violations │ Security policy blocking valid access   │    │
│  │ Connection err │ Pool exhaustion, network issues         │    │
│  └────────────────┴────────────────────────────────────────┘    │
│                                                                  │
│  WARNING (Monitor Trend)                                         │
│  ┌────────────────┬────────────────────────────────────────┐    │
│  │ Type           │ Indicates                               │    │
│  ├────────────────┼────────────────────────────────────────┤    │
│  │ 429 rate limit │ Approaching platform limits             │    │
│  │ Timeout errors │ Slow queries or network                 │    │
│  │ Sync conflicts │ Offline/concurrent edit issues          │    │
│  │ Storage errors │ Quota or upload failures                │    │
│  └────────────────┴────────────────────────────────────────┘    │
│                                                                  │
│  INFORMATIONAL (Aggregate Weekly)                                │
│  ┌────────────────┬────────────────────────────────────────┐    │
│  │ Type           │ Indicates                               │    │
│  ├────────────────┼────────────────────────────────────────┤    │
│  │ 404 not found  │ Broken links, deleted resources         │    │
│  │ Validation err │ UI/UX issues                            │    │
│  │ Client errors  │ Browser compatibility                   │    │
│  └────────────────┴────────────────────────────────────────┘    │
│                                                                  │
│  Error Event Schema                                              │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  {                                                               │
│    "error_id": "uuid",                                          │
│    "timestamp": "ISO8601",                                      │
│    "severity": "critical|warning|info",                         │
│    "category": "database|storage|auth|network|sync",            │
│    "error_code": "500|403|429|TIMEOUT",                         │
│    "message": "Connection pool exhausted",                      │
│    "company_id": "uuid|null",                                   │
│    "user_id": "uuid|null",                                      │
│    "operation": "getTMTickets",                                 │
│    "context": {                                                 │
│      "project_id": "uuid",                                     │
│      "query_duration_ms": 30000                                │
│    }                                                            │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.5 Tenant Activity Variance Signals

```
┌─────────────────────────────────────────────────────────────────┐
│                   TENANT HEALTH SIGNALS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Per-Company Health Score Components                             │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  ┌────────────────────┬────────┬───────────────────────────┐    │
│  │ Metric             │ Weight │ Calculation               │    │
│  ├────────────────────┼────────┼───────────────────────────┤    │
│  │ Query latency      │ 30%    │ Avg ms vs platform avg    │    │
│  │ Error rate         │ 25%    │ Errors/100 requests       │    │
│  │ Storage growth     │ 20%    │ GB/month vs tier limit    │    │
│  │ Active user ratio  │ 15%    │ DAU / licensed seats      │    │
│  │ Feature usage      │ 10%    │ Features used / available │    │
│  └────────────────────┴────────┴───────────────────────────┘    │
│                                                                  │
│  Health Score Output                                             │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  {                                                               │
│    "company_id": "uuid",                                        │
│    "company_name": "Acme Construction",                         │
│    "health_score": 87,                                          │
│    "status": "healthy|warning|critical",                        │
│    "signals": {                                                 │
│      "avg_query_latency_ms": 156,                              │
│      "error_rate_pct": 0.3,                                    │
│      "storage_used_gb": 23.4,                                  │
│      "storage_limit_gb": 50,                                   │
│      "daily_active_users": 12,                                 │
│      "total_users": 18                                         │
│    },                                                           │
│    "flags": ["storage_growing_fast"],                          │
│    "recommended_actions": ["Review photo compression"]          │
│  }                                                               │
│                                                                  │
│  Noisy Tenant Detection                                          │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  Flag tenant if ANY of:                                          │
│  • Query latency > 2x platform average                          │
│  • Storage growth > 3x subscription tier rate                   │
│  • Error rate > 5x platform average                             │
│  • Real-time subscriptions > 50 concurrent                      │
│  • Bandwidth > 10x per-user average                             │
│                                                                  │
│  Noisy Tenant Report (Weekly)                                    │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  ┌─────────────────┬────────────┬───────────┬────────────┐      │
│  │ Company         │ Issue      │ Impact    │ Action     │      │
│  ├─────────────────┼────────────┼───────────┼────────────┤      │
│  │ BigBuild Co     │ High I/O   │ 15% CPU   │ Pagination │      │
│  │ Metro Projects  │ Large sync │ 8% egress │ Compress   │      │
│  │ FastTrack Inc   │ RT subs    │ 200 conns │ Throttle   │      │
│  └─────────────────┴────────────┴───────────┴────────────┘      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Where Should Observability Live?

### 2.1 Observability Surface Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   OBSERVABILITY SURFACES                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PRINCIPLE: Separate Engineering Observability from              │
│             Business Awareness. Never clutter the product UI.    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                                                            │   │
│  │   LAYER 1: SYSTEM OPERATIONS (Engineering Only)           │   │
│  │   ─────────────────────────────────────────────────────── │   │
│  │                                                            │   │
│  │   WHO SEES: Platform engineers, DevOps, on-call           │   │
│  │   WHERE: Separate admin portal (/admin/ops)               │   │
│  │   NEVER: In the main FieldSync product                    │   │
│  │                                                            │   │
│  │   Contains:                                                │   │
│  │   • Real-time query latency graphs                        │   │
│  │   • Error rate dashboards                                 │   │
│  │   • Connection pool status                                │   │
│  │   • Storage growth projections                            │   │
│  │   • Per-tenant resource consumption                       │   │
│  │   • Background job status                                 │   │
│  │                                                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                                                            │   │
│  │   LAYER 2: COMPANY HEALTH (Admin Visibility)              │   │
│  │   ─────────────────────────────────────────────────────── │   │
│  │                                                            │   │
│  │   WHO SEES: Company administrators                        │   │
│  │   WHERE: Settings → Company Health (new section)          │   │
│  │   SCOPE: Their company's data only                        │   │
│  │                                                            │   │
│  │   Contains:                                                │   │
│  │   • Storage usage vs limit                                │   │
│  │   • Active user count                                     │   │
│  │   • Monthly sync activity                                 │   │
│  │   • Subscription tier information                         │   │
│  │   • Simple "all systems normal" status                    │   │
│  │                                                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                                                            │   │
│  │   LAYER 3: BUSINESS INTELLIGENCE (Leadership)             │   │
│  │   ─────────────────────────────────────────────────────── │   │
│  │                                                            │   │
│  │   WHO SEES: FieldSync business team                       │   │
│  │   WHERE: Internal BI tool / weekly reports                │   │
│  │   SCOPE: Aggregate, anonymized where appropriate          │   │
│  │                                                            │   │
│  │   Contains:                                                │   │
│  │   • Total companies, users, projects                      │   │
│  │   • Growth trends                                         │   │
│  │   • Feature adoption rates                                │   │
│  │   • Churn risk indicators                                 │   │
│  │   • Revenue-relevant usage metrics                        │   │
│  │                                                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 System Operations Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│            FIELDSYNC OPERATIONS DASHBOARD                        │
│            /admin/ops (Engineering Access Only)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─ SYSTEM STATUS ──────────────────────────────────────────┐   │
│  │                                                            │   │
│  │  [●] Database: Healthy        [●] Auth: Healthy           │   │
│  │  [●] Storage: Healthy         [●] Realtime: Healthy       │   │
│  │  [○] Edge Functions: 1 warning                            │   │
│  │                                                            │   │
│  │  Last incident: None in 7 days                            │   │
│  │                                                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ QUERY PERFORMANCE (Last 24h) ───────────────────────────┐   │
│  │                                                            │   │
│  │  p50: 45ms   p95: 234ms   p99: 892ms                      │   │
│  │                                                            │   │
│  │  ████████████████░░░░░░░░░░░░░░░░  234ms (target: 500ms)  │   │
│  │                                                            │   │
│  │  Slow Queries:                                            │   │
│  │  1. calculateManDayCosts - 1.2s avg (12 calls/hr)        │   │
│  │  2. getChangeOrders - 567ms avg (89 calls/hr)            │   │
│  │  3. archiveProjectDeep - 45s avg (2 calls/day)           │   │
│  │                                                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ RESOURCE UTILIZATION ───────────────────────────────────┐   │
│  │                                                            │   │
│  │  Connections:  42/60 (70%) ████████████████░░░░           │   │
│  │  RT Subs:      234/500     ██████████░░░░░░░░░░           │   │
│  │  Storage:      487GB       Growing 2.3 GB/day            │   │
│  │  Egress:       1.2TB/mo    On track for $108             │   │
│  │                                                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ ERROR RATES (Last 24h) ─────────────────────────────────┐   │
│  │                                                            │   │
│  │  Total Requests: 45,678    Errors: 23 (0.05%)            │   │
│  │                                                            │   │
│  │  By Type:                                                 │   │
│  │  • 500 errors: 3 (database timeout)                       │   │
│  │  • 403 errors: 8 (RLS - mostly demo attempts)             │   │
│  │  • 429 errors: 0                                          │   │
│  │  • Timeout: 12 (photo uploads on slow connections)        │   │
│  │                                                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ TENANT HEALTH SUMMARY ──────────────────────────────────┐   │
│  │                                                            │   │
│  │  Total Companies: 127      Healthy: 119 (94%)             │   │
│  │                            Warning: 6   (5%)              │   │
│  │                            Critical: 2  (1%)              │   │
│  │                                                            │   │
│  │  ⚠ BigBuild Co: Storage at 95% of tier limit             │   │
│  │  ⚠ Metro Projects: High error rate (2.3%)                 │   │
│  │                                                            │   │
│  │  [View Tenant Details →]                                  │   │
│  │                                                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ SCALING SIGNALS ────────────────────────────────────────┐   │
│  │                                                            │   │
│  │  Current Phase: Option 1 (Managed Supabase)              │   │
│  │  Next Trigger: Connection pool at 80%                    │   │
│  │  Estimated Time: ~3 months at current growth             │   │
│  │                                                            │   │
│  │  Recommendations:                                         │   │
│  │  • [Low] Consider pagination for getInjuryReports        │   │
│  │  • [Med] Add index for activity_log queries              │   │
│  │                                                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Company Health View (For Administrators)

```
┌─────────────────────────────────────────────────────────────────┐
│            COMPANY HEALTH                                        │
│            Settings → Company Health                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Acme Construction LLC                                           │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  ┌─ STATUS ─────────────────────────────────────────────────┐   │
│  │                                                            │   │
│  │     ●  All Systems Operational                            │   │
│  │                                                            │   │
│  │     Last sync: 2 minutes ago                              │   │
│  │     Uptime this month: 99.9%                              │   │
│  │                                                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ USAGE THIS MONTH ───────────────────────────────────────┐   │
│  │                                                            │   │
│  │  Storage                                                  │   │
│  │  ██████████████░░░░░░░░░░░░  23.4 GB / 50 GB (47%)       │   │
│  │                                                            │   │
│  │  Active Users                                             │   │
│  │  12 of 20 licensed seats                                  │   │
│  │                                                            │   │
│  │  Projects                                                 │   │
│  │  Active: 8   |   Archived: 34   |   Total: 42            │   │
│  │                                                            │   │
│  │  T&M Tickets Created: 234                                 │   │
│  │  Photos Uploaded: 1,847                                   │   │
│  │                                                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ SUBSCRIPTION ───────────────────────────────────────────┐   │
│  │                                                            │   │
│  │  Plan: Professional                                       │   │
│  │  Billing cycle: Monthly                                   │   │
│  │  Next invoice: January 15, 2025                          │   │
│  │                                                            │   │
│  │  [Manage Subscription →]                                  │   │
│  │                                                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Note: Detailed system metrics are not shown here.              │
│  Contact support if you're experiencing performance issues.     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.4 Who Sees What Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│                   VISIBILITY MATRIX                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────────┬─────┬─────┬─────┬─────┬─────────┐   │
│  │ Metric                │ Eng │ Ops │ Biz │Admin│ Member  │   │
│  ├───────────────────────┼─────┼─────┼─────┼─────┼─────────┤   │
│  │ Query latency         │  ●  │  ●  │     │     │         │   │
│  │ Error rates (detail)  │  ●  │  ●  │     │     │         │   │
│  │ Connection pool       │  ●  │  ●  │     │     │         │   │
│  │ Per-tenant resources  │  ●  │  ●  │     │     │         │   │
│  │ Storage per company   │  ●  │  ●  │  ○  │  ●  │         │   │
│  │ Total platform stats  │  ●  │  ●  │  ●  │     │         │   │
│  │ Growth trends         │  ●  │  ●  │  ●  │     │         │   │
│  │ Company health score  │  ●  │  ●  │  ●  │     │         │   │
│  │ Own storage usage     │     │     │     │  ●  │    ○    │   │
│  │ Own user count        │     │     │     │  ●  │         │   │
│  │ Subscription status   │     │     │  ●  │  ●  │         │   │
│  │ "System normal" badge │     │     │     │  ●  │    ●    │   │
│  └───────────────────────┴─────┴─────┴─────┴─────┴─────────┘   │
│                                                                  │
│  Legend:                                                         │
│  ● = Full access                                                │
│  ○ = Limited/aggregated view                                    │
│  (blank) = No access                                            │
│                                                                  │
│  Roles:                                                          │
│  Eng = Engineering team                                          │
│  Ops = Operations/on-call                                        │
│  Biz = Business/leadership                                       │
│  Admin = Company administrator                                   │
│  Member = Regular company member                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. How Do These Signals Drive Decisions?

### 3.1 Decision-Trigger Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│                   DECISION-TRIGGER MATRIX                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  For each metric: NORMAL → WARNING → ACTION                      │
│                                                                  │
│  ═══════════════════════════════════════════════════════════════│
│                                                                  │
│  DATABASE QUERY LATENCY                                          │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  │ Zone    │ p95 Value    │ Response                           │ │
│  │─────────│──────────────│────────────────────────────────────│ │
│  │ NORMAL  │ < 300ms      │ No action needed                   │ │
│  │ WARNING │ 300-500ms    │ Investigate slow queries           │ │
│  │         │              │ Check for missing indexes          │ │
│  │ ACTION  │ > 500ms      │ Add pagination to unbounded queries│ │
│  │         │              │ Add/optimize indexes               │ │
│  │         │              │ Consider materialized views        │ │
│  │ CRISIS  │ > 2000ms     │ Emergency: connection pool issue?  │ │
│  │         │              │ Check for runaway queries          │ │
│                                                                  │
│  WHO ACTS: Engineering                                           │
│  OPTIONS: Pagination, Indexing, Caching, Query optimization      │
│                                                                  │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  CONNECTION POOL UTILIZATION                                     │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  │ Zone    │ Usage        │ Response                           │ │
│  │─────────│──────────────│────────────────────────────────────│ │
│  │ NORMAL  │ < 60%        │ No action needed                   │ │
│  │ WARNING │ 60-80%       │ Monitor growth rate                │ │
│  │         │              │ Plan tier upgrade                  │ │
│  │ ACTION  │ > 80%        │ Upgrade Supabase tier (Pro→Team)   │ │
│  │         │              │ Or: Add connection pooler          │ │
│  │ CRISIS  │ 100%         │ Emergency tier upgrade             │ │
│  │         │              │ Enable connection queuing          │ │
│                                                                  │
│  WHO ACTS: Operations + Finance (budget approval)                │
│  OPTIONS: Tier upgrade, External pooler (PgBouncer)              │
│                                                                  │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  STORAGE GROWTH                                                  │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  │ Zone    │ Growth/Month │ Response                           │ │
│  │─────────│──────────────│────────────────────────────────────│ │
│  │ NORMAL  │ < 50GB       │ No action needed                   │ │
│  │ WARNING │ 50-100GB     │ Implement image compression        │ │
│  │         │              │ Add thumbnail generation           │ │
│  │ ACTION  │ > 100GB      │ Enforce compression client-side    │ │
│  │         │              │ Implement tiered storage           │ │
│  │         │              │ Review heavy-usage tenants         │ │
│  │ CRISIS  │ > 200GB      │ Emergency: Add S3 + lazy migration │ │
│                                                                  │
│  WHO ACTS: Engineering + Finance                                 │
│  OPTIONS: Compression, Thumbnails, Tiered storage, CDN           │
│                                                                  │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  RLS POLICY EXECUTION TIME                                       │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  │ Zone    │ Avg Time     │ Response                           │ │
│  │─────────│──────────────│────────────────────────────────────│ │
│  │ NORMAL  │ < 5ms        │ Policies efficient                 │ │
│  │ WARNING │ 5-20ms       │ Check for recursive policies       │ │
│  │         │              │ Add indexes on policy columns      │ │
│  │ ACTION  │ > 20ms       │ Refactor complex policies          │ │
│  │         │              │ Consider SECURITY DEFINER RPCs     │ │
│  │ CRISIS  │ > 100ms      │ RLS causing cascading slowdowns    │ │
│  │         │              │ May need architectural change      │ │
│                                                                  │
│  WHO ACTS: Database Engineer                                     │
│  OPTIONS: Index optimization, RPC refactoring, Policy simplify   │
│                                                                  │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  ERROR RATES                                                     │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  │ Zone    │ Error Rate   │ Response                           │ │
│  │─────────│──────────────│────────────────────────────────────│ │
│  │ NORMAL  │ < 0.1%       │ No action needed                   │ │
│  │ WARNING │ 0.1-1%       │ Review error logs                  │ │
│  │         │              │ Identify patterns                  │ │
│  │ ACTION  │ 1-5%         │ Investigate root cause             │ │
│  │         │              │ Deploy fixes                       │ │
│  │ CRISIS  │ > 5%         │ Incident response                  │ │
│  │         │              │ Consider rollback                  │ │
│                                                                  │
│  WHO ACTS: On-call engineer                                      │
│  OPTIONS: Bug fix, Rollback, Scale resources                     │
│                                                                  │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  REAL-TIME SUBSCRIPTIONS                                         │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  │ Zone    │ Count        │ Response                           │ │
│  │─────────│──────────────│────────────────────────────────────│ │
│  │ NORMAL  │ < 300        │ No action needed                   │ │
│  │ WARNING │ 300-500      │ Monitor subscription patterns      │ │
│  │         │              │ Consider channel multiplexing      │ │
│  │ ACTION  │ > 500        │ Implement channel consolidation    │ │
│  │         │              │ Upgrade Supabase tier              │ │
│  │ CRISIS  │ Tier limit   │ Immediate tier upgrade             │ │
│  │         │              │ Or: Custom WebSocket service       │ │
│                                                                  │
│  WHO ACTS: Engineering                                           │
│  OPTIONS: Channel multiplexing, Tier upgrade, Custom pub/sub     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Scaling Decision Flowchart

```
┌─────────────────────────────────────────────────────────────────┐
│                   WHEN TO SCALE: DECISION FLOW                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  START: Observability signal detected                            │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────┐                │
│  │  Is this a single-tenant issue?             │                │
│  └─────────────────────────┬───────────────────┘                │
│                            │                                     │
│         ┌──────────────────┴──────────────────┐                 │
│         │ YES                                 │ NO              │
│         ▼                                     ▼                 │
│  ┌─────────────────────┐            ┌─────────────────────┐    │
│  │ Contact tenant      │            │ Is it query-related? │    │
│  │ Review their usage  │            └──────────┬──────────┘    │
│  │ Consider throttling │                       │               │
│  └─────────────────────┘            ┌──────────┴──────────┐    │
│                                     │ YES                │ NO  │
│                                     ▼                    │     │
│  ┌─────────────────────────────────────────────┐        │     │
│  │  Can it be fixed with:                      │        │     │
│  │  • Pagination?                              │        │     │
│  │  • Indexes?                                 │        │     │
│  │  • Query optimization?                      │        │     │
│  └─────────────────────────┬───────────────────┘        │     │
│                            │                            │     │
│         ┌──────────────────┴──────────────────┐        │     │
│         │ YES                                 │ NO     │     │
│         ▼                                     │        │     │
│  ┌─────────────────────┐                      │        │     │
│  │ Implement fix       │                      │        │     │
│  │ (No scaling needed) │                      │        │     │
│  └─────────────────────┘                      │        │     │
│                                               │        │     │
│         ┌─────────────────────────────────────┘        │     │
│         │                                              │     │
│         ▼                                              ▼     │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Is it a resource limit? (Connections, Storage, etc.)   │ │
│  └─────────────────────────────┬───────────────────────────┘ │
│                                │                             │
│         ┌──────────────────────┴──────────────────┐         │
│         │ YES                                     │ NO      │
│         ▼                                         ▼         │
│  ┌─────────────────────┐            ┌─────────────────────┐ │
│  │ Upgrade tier?       │            │ Architecture issue  │ │
│  │ (Pro → Team)        │            │ Plan for Phase 2/3  │ │
│  │                     │            │ (Edge Functions,    │ │
│  │ Cost justified?     │            │  Hybrid cloud)      │ │
│  │ ● Yes → Upgrade     │            └─────────────────────┘ │
│  │ ● No → Optimize     │                                    │
│  └─────────────────────┘                                    │
│                                                              │
│  KEY PRINCIPLE:                                              │
│  ─────────────────────────────────────────────────────────── │
│  Optimize first. Scale second. Migrate last.                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Migration Trigger Signals

```
┌─────────────────────────────────────────────────────────────────┐
│                   MIGRATION DECISION TRIGGERS                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STAY ON SUPABASE (Option 1) If ALL True:                       │
│  ───────────────────────────────────────────────────────────────│
│  □ Query p95 < 500ms consistently                               │
│  □ Connection pool < 80%                                        │
│  □ Storage costs < $500/month                                   │
│  □ No compliance requirements                                   │
│  □ Single region is acceptable                                  │
│  □ Team < 5 engineers                                           │
│                                                                  │
│  ═══════════════════════════════════════════════════════════════│
│                                                                  │
│  MOVE TO HYBRID (Option 2) When ANY True:                       │
│  ───────────────────────────────────────────────────────────────│
│  □ Edge Functions hitting execution limits (>25s regularly)     │
│  □ Need Redis for caching/sessions                              │
│  □ Storage costs > $2,000/month (S3 would save 40%+)           │
│  □ Background jobs need > 10 min execution                      │
│  □ CDN would reduce egress costs significantly                  │
│                                                                  │
│  DECISION: Keep Supabase for DB/Auth, add AWS for specific      │
│  services (Lambda, S3, CloudFront, ElastiCache)                 │
│                                                                  │
│  ═══════════════════════════════════════════════════════════════│
│                                                                  │
│  FULL CLOUD MIGRATION (Option 3) When ALL True:                 │
│  ───────────────────────────────────────────────────────────────│
│  □ Multi-region is mandatory (compliance, latency)              │
│  □ Supabase fundamentally cannot meet requirements              │
│  □ Have 3+ DevOps engineers                                     │
│  □ 6+ month migration timeline acceptable                       │
│  □ Budget for 2x infrastructure costs during migration          │
│                                                                  │
│  ═══════════════════════════════════════════════════════════════│
│                                                                  │
│  NEVER MIGRATE Just Because:                                     │
│  ───────────────────────────────────────────────────────────────│
│  ✗ "AWS is more professional"                                   │
│  ✗ "We might need it someday"                                   │
│  ✗ "Other companies use Kubernetes"                             │
│  ✗ Query latency is 400ms (still in normal range)              │
│  ✗ Storage is 100GB (well within Supabase capacity)            │
│                                                                  │
│  THE SYSTEM TELLS YOU WHEN TO MIGRATE.                          │
│  OBSERVABILITY GIVES YOU THE DATA TO JUSTIFY IT.                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. How Does This Support Multi-Tenant Scaling?

### 4.1 Tenant Isolation in Observability

```
┌─────────────────────────────────────────────────────────────────┐
│                   MULTI-TENANT OBSERVABILITY                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PRINCIPLE: Every metric must be attributable to a tenant       │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  All observability events include:                               │
│  {                                                               │
│    "company_id": "uuid",      // Always present                 │
│    "project_id": "uuid|null", // When applicable                │
│    "user_id": "uuid|null",    // When applicable                │
│    ...metric data                                                │
│  }                                                               │
│                                                                  │
│  This enables:                                                   │
│  • Per-tenant dashboards                                        │
│  • Noisy neighbor detection                                     │
│  • Fair usage enforcement                                       │
│  • Cost attribution for billing                                 │
│                                                                  │
│  ═══════════════════════════════════════════════════════════════│
│                                                                  │
│  NOISY TENANT DETECTION                                          │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  Automated alerts when tenant exceeds thresholds:               │
│                                                                  │
│  ┌─────────────────────────┬──────────────┬─────────────────┐   │
│  │ Metric                  │ Threshold    │ Alert Type      │   │
│  ├─────────────────────────┼──────────────┼─────────────────┤   │
│  │ Query latency           │ > 2x avg     │ Engineering     │   │
│  │ Storage usage           │ > 90% tier   │ Billing + Eng   │   │
│  │ Error rate              │ > 5x avg     │ Support + Eng   │   │
│  │ RT subscriptions        │ > 50         │ Engineering     │   │
│  │ Bandwidth               │ > 10x avg    │ Billing         │   │
│  │ API calls/min           │ > 1000       │ Engineering     │   │
│  └─────────────────────────┴──────────────┴─────────────────┘   │
│                                                                  │
│  Response Playbook:                                              │
│  1. Investigate: Is usage legitimate or problematic?            │
│  2. Optimize: Can we fix it with pagination, caching?           │
│  3. Communicate: Reach out to tenant about usage patterns       │
│  4. Throttle: If necessary, apply fair-use limits              │
│  5. Upgrade: Help tenant move to appropriate tier               │
│                                                                  │
│  ═══════════════════════════════════════════════════════════════│
│                                                                  │
│  PREVENTING CROSS-TENANT IMPACT                                  │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  Observability helps identify:                                   │
│                                                                  │
│  1. Shared Resource Contention                                   │
│     • One tenant's heavy queries affecting connection pool      │
│     • Large file uploads blocking storage operations            │
│     • RT subscription storms                                    │
│                                                                  │
│  2. Early Warning Signs                                          │
│     • Tenant approaching resource limits                        │
│     • Unusual activity patterns (bulk operations)               │
│     • Sync storms (many offline devices reconnecting)           │
│                                                                  │
│  3. Isolation Verification                                       │
│     • Audit logs show no cross-tenant data access               │
│     • RLS policy effectiveness metrics                          │
│     • Tenant-specific error isolation                           │
│                                                                  │
│  ═══════════════════════════════════════════════════════════════│
│                                                                  │
│  FAIR USAGE POLICIES (Future)                                    │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  Observability data enables tier-based limits:                   │
│                                                                  │
│  ┌─────────────┬───────────┬───────────┬───────────────────┐    │
│  │ Resource    │ Starter   │ Pro       │ Enterprise        │    │
│  ├─────────────┼───────────┼───────────┼───────────────────┤    │
│  │ Storage     │ 10 GB     │ 50 GB     │ Unlimited         │    │
│  │ Users       │ 10        │ 50        │ Unlimited         │    │
│  │ API calls   │ 10K/mo    │ 100K/mo   │ Unlimited         │    │
│  │ RT subs     │ 10        │ 50        │ 200               │    │
│  │ File size   │ 5 MB      │ 25 MB     │ 100 MB            │    │
│  └─────────────┴───────────┴───────────┴───────────────────┘    │
│                                                                  │
│  Enforcement via observability:                                  │
│  • Soft limits: Warning at 80%, notify at 90%                   │
│  • Hard limits: Block at 100% with upgrade prompt               │
│  • Grace period: 7 days before enforcement                      │
│                                                                  │
│  ═══════════════════════════════════════════════════════════════│
│                                                                  │
│  COST ATTRIBUTION                                                │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  Per-tenant cost calculation (for internal/future billing):     │
│                                                                  │
│  tenant_monthly_cost = (                                         │
│    (storage_gb × $0.023) +                                      │
│    (egress_gb × $0.09) +                                        │
│    (compute_seconds × $0.00001) +                               │
│    (rt_subscription_hours × $0.001)                             │
│  )                                                               │
│                                                                  │
│  Weekly report: Top 10 tenants by resource consumption          │
│  Monthly report: Cost per tenant vs subscription revenue        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Tenant Health Dashboard Data

```
┌─────────────────────────────────────────────────────────────────┐
│                   TENANT HEALTH QUERY                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  -- Daily tenant health snapshot (store in tenant_health table) │
│                                                                  │
│  INSERT INTO tenant_health_snapshots                             │
│  SELECT                                                          │
│    c.id as company_id,                                          │
│    c.name as company_name,                                      │
│    DATE(NOW()) as snapshot_date,                                │
│                                                                  │
│    -- Usage metrics                                              │
│    (SELECT COUNT(*) FROM users u                                │
│     JOIN user_companies uc ON u.id = uc.user_id                 │
│     WHERE uc.company_id = c.id                                  │
│     AND uc.status = 'active') as active_users,                  │
│                                                                  │
│    (SELECT COUNT(*) FROM projects p                             │
│     WHERE p.company_id = c.id                                   │
│     AND p.status = 'active') as active_projects,                │
│                                                                  │
│    -- Storage (calculated from storage metadata)                 │
│    (SELECT COALESCE(SUM(file_size), 0)                          │
│     FROM storage_objects                                        │
│     WHERE path LIKE c.id || '/%') as storage_bytes,             │
│                                                                  │
│    -- Activity (last 24 hours)                                   │
│    (SELECT COUNT(*) FROM activity_log al                        │
│     JOIN projects p ON al.project_id = p.id                     │
│     WHERE p.company_id = c.id                                   │
│     AND al.created_at > NOW() - INTERVAL '24 hours'             │
│    ) as daily_actions,                                          │
│                                                                  │
│    -- Error rate (last 24 hours, from error_log table)          │
│    (SELECT COUNT(*) FROM error_log el                           │
│     WHERE el.company_id = c.id                                  │
│     AND el.created_at > NOW() - INTERVAL '24 hours'             │
│    ) as daily_errors                                            │
│                                                                  │
│  FROM companies c                                                │
│  WHERE c.status = 'active';                                      │
│                                                                  │
│  -- Health score calculation                                     │
│  UPDATE tenant_health_snapshots                                  │
│  SET health_score = (                                           │
│    100                                                          │
│    - (CASE WHEN daily_errors > 10 THEN 20 ELSE 0 END)          │
│    - (CASE WHEN storage_bytes > tier_limit * 0.9                │
│            THEN 15 ELSE 0 END)                                  │
│    - (CASE WHEN avg_query_latency > 500 THEN 15 ELSE 0 END)    │
│  ),                                                              │
│  status = CASE                                                   │
│    WHEN health_score >= 80 THEN 'healthy'                       │
│    WHEN health_score >= 50 THEN 'warning'                       │
│    ELSE 'critical'                                              │
│  END                                                             │
│  WHERE snapshot_date = DATE(NOW());                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. How Do We Avoid Tool Lock-In?

### 5.1 Abstraction Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   OBSERVABILITY ABSTRACTION                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PRINCIPLE: Collect and structure metrics once, export anywhere │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│                    ┌───────────────────────────┐                │
│                    │     Application Code      │                │
│                    │   (supabase.js, etc)      │                │
│                    └─────────────┬─────────────┘                │
│                                  │                               │
│                                  ▼                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                            │  │
│  │              OBSERVABILITY INTERFACE                       │  │
│  │              (src/lib/observability.js)                    │  │
│  │                                                            │  │
│  │   // Vendor-agnostic metric collection                    │  │
│  │   observe.query('getTMTickets', { duration, rows, ... }); │  │
│  │   observe.error('database', { code, message, ... });      │  │
│  │   observe.storage('upload', { size, duration, ... });     │  │
│  │   observe.tenant('health', { company_id, ... });          │  │
│  │                                                            │  │
│  └───────────────────────────┬───────────────────────────────┘  │
│                              │                                   │
│              ┌───────────────┼───────────────┐                  │
│              │               │               │                  │
│              ▼               ▼               ▼                  │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │   Console     │  │   Supabase    │  │   External    │       │
│  │   (Dev only)  │  │   (Built-in)  │  │   (Future)    │       │
│  │               │  │               │  │               │       │
│  │ console.log   │  │ metrics table │  │ DataDog      │       │
│  │ console.error │  │ error_log     │  │ New Relic    │       │
│  │               │  │ audit_log     │  │ Grafana      │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
│                                                                  │
│  Current: Supabase tables only                                   │
│  Future: Add external exporters as needed                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Implementation Pattern

```javascript
// src/lib/observability.js
// Vendor-agnostic observability layer

const adapters = {
  console: createConsoleAdapter(),    // Development
  supabase: createSupabaseAdapter(),  // Production (default)
  // datadog: createDatadogAdapter(), // Future: add when needed
};

const activeAdapters = [
  process.env.NODE_ENV === 'development' && adapters.console,
  adapters.supabase,
].filter(Boolean);

export const observe = {
  /**
   * Track database query performance
   */
  query(operation, context) {
    const event = {
      type: 'query',
      operation,
      company_id: context.company_id,
      project_id: context.project_id,
      duration_ms: context.duration,
      rows_returned: context.rows,
      timestamp: new Date().toISOString(),
    };
    activeAdapters.forEach(a => a.emit(event));
  },

  /**
   * Track errors with context
   */
  error(category, context) {
    const event = {
      type: 'error',
      category,  // 'database', 'storage', 'auth', 'network'
      severity: context.severity || 'error',
      code: context.code,
      message: context.message,
      company_id: context.company_id,
      user_id: context.user_id,
      operation: context.operation,
      timestamp: new Date().toISOString(),
    };
    activeAdapters.forEach(a => a.emit(event));
  },

  /**
   * Track storage operations
   */
  storage(operation, context) {
    const event = {
      type: 'storage',
      operation, // 'upload', 'download', 'delete'
      company_id: context.company_id,
      file_size_bytes: context.size,
      duration_ms: context.duration,
      success: context.success,
      timestamp: new Date().toISOString(),
    };
    activeAdapters.forEach(a => a.emit(event));
  },

  /**
   * Track tenant health metrics
   */
  tenant(metric, context) {
    const event = {
      type: 'tenant',
      metric, // 'health', 'usage', 'activity'
      company_id: context.company_id,
      data: context.data,
      timestamp: new Date().toISOString(),
    };
    activeAdapters.forEach(a => a.emit(event));
  },
};

// Supabase adapter - stores in database tables
function createSupabaseAdapter() {
  return {
    async emit(event) {
      if (event.type === 'error') {
        await supabase.from('error_log').insert(event);
      } else if (event.type === 'query' && event.duration_ms > 500) {
        // Only log slow queries to avoid noise
        await supabase.from('query_metrics').insert(event);
      }
      // Lightweight metrics can be aggregated client-side
      // and sent in batches
    }
  };
}

// Console adapter - development only
function createConsoleAdapter() {
  return {
    emit(event) {
      const prefix = {
        error: '❌',
        query: '🔍',
        storage: '📁',
        tenant: '🏢',
      }[event.type];
      console.log(`${prefix} [${event.type}]`, event);
    }
  };
}
```

### 5.3 Migration Path to External Tools

```
┌─────────────────────────────────────────────────────────────────┐
│                   OBSERVABILITY MIGRATION PATH                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PHASE 1: Supabase-Native (Current)                             │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  • Store metrics in Supabase tables                             │
│  • Query via SQL for dashboards                                 │
│  • Use Supabase Dashboard for basic monitoring                  │
│  • pg_stat_statements for query performance                     │
│                                                                  │
│  Cost: $0 additional                                             │
│  Effort: 1-2 weeks to implement                                  │
│                                                                  │
│  ═══════════════════════════════════════════════════════════════│
│                                                                  │
│  PHASE 2: Add Structured Logging (When Needed)                   │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  Trigger: Need for better search, alerting, or compliance       │
│                                                                  │
│  Options:                                                        │
│  • Logtail/Axiom: $0-25/mo, good for startups                  │
│  • Papertrail: $0-7/mo, simple log aggregation                  │
│  • Better Stack: $0-24/mo, includes uptime monitoring          │
│                                                                  │
│  Implementation:                                                 │
│  // Add new adapter                                              │
│  adapters.logtail = createLogtailAdapter(LOGTAIL_TOKEN);        │
│  activeAdapters.push(adapters.logtail);                         │
│                                                                  │
│  Effort: 1 day to add adapter                                    │
│                                                                  │
│  ═══════════════════════════════════════════════════════════════│
│                                                                  │
│  PHASE 3: Full APM (At Scale)                                    │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  Trigger: >1000 companies, need distributed tracing             │
│                                                                  │
│  Options:                                                        │
│  • DataDog: $15/host/mo, comprehensive                         │
│  • New Relic: $0-99/mo, good free tier                         │
│  • Grafana Cloud: $0-29/mo, open standards                     │
│                                                                  │
│  Implementation:                                                 │
│  // Add new adapter, same interface                              │
│  adapters.datadog = createDatadogAdapter(DD_API_KEY);           │
│  activeAdapters.push(adapters.datadog);                         │
│                                                                  │
│  Benefits:                                                       │
│  • Distributed tracing                                          │
│  • Advanced alerting                                            │
│  • Anomaly detection                                            │
│  • Dashboards as code                                           │
│                                                                  │
│  Effort: 1 week to add adapter + configure dashboards           │
│                                                                  │
│  ═══════════════════════════════════════════════════════════════│
│                                                                  │
│  KEY: Same observe.* calls work with any backend                │
│  No application code changes when switching tools               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Incremental Rollout Plan

### 6.1 Implementation Phases

```
┌─────────────────────────────────────────────────────────────────┐
│                   OBSERVABILITY ROLLOUT PHASES                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PHASE 0: Foundation (Week 1-2)                                  │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  □ Create observability.js abstraction layer                    │
│  □ Create database tables:                                       │
│    • error_log (errors with context)                            │
│    • query_metrics (slow query samples)                         │
│    • tenant_health_snapshots (daily rollups)                    │
│  □ Enable pg_stat_statements in Supabase                        │
│  □ Add basic error tracking wrapper                              │
│                                                                  │
│  Exit Criteria:                                                  │
│  • Errors are captured with company_id context                  │
│  • Slow queries (>500ms) are logged                             │
│  • Can query "errors by company" from database                  │
│                                                                  │
│  ═══════════════════════════════════════════════════════════════│
│                                                                  │
│  PHASE 1: Query Performance (Week 3-4)                           │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  □ Instrument top 10 heaviest queries:                          │
│    • getTMTickets, getAreas, getProjects                        │
│    • calculateManDayCosts, getCORStats                          │
│    • getProjectActivity, getDailyReports                        │
│  □ Add timing wrapper to db.* functions                         │
│  □ Create slow query alert (p95 > 500ms)                        │
│  □ Build basic query performance view                            │
│                                                                  │
│  Exit Criteria:                                                  │
│  • Can answer: "What's our slowest query today?"               │
│  • Can answer: "Which company has slowest queries?"            │
│  • Alert fires when p95 exceeds threshold                       │
│                                                                  │
│  ═══════════════════════════════════════════════════════════════│
│                                                                  │
│  PHASE 2: Storage & Upload Monitoring (Week 5-6)                 │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  □ Instrument uploadPhoto, uploadPhotoBase64                    │
│  □ Track upload success/failure with file size                  │
│  □ Calculate per-company storage usage (daily job)              │
│  □ Add storage growth projections                               │
│  □ Create storage usage alert (>80% of tier)                    │
│                                                                  │
│  Exit Criteria:                                                  │
│  • Can answer: "Which company uses most storage?"              │
│  • Can answer: "What's our monthly storage growth?"            │
│  • Alert fires when company approaches limit                    │
│                                                                  │
│  ═══════════════════════════════════════════════════════════════│
│                                                                  │
│  PHASE 3: Tenant Health Dashboard (Week 7-8)                     │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  □ Build tenant health score calculation                        │
│  □ Create noisy tenant detection                                │
│  □ Build operations dashboard (/admin/ops)                      │
│  □ Add company health view (Settings → Health)                  │
│  □ Set up weekly health report email                            │
│                                                                  │
│  Exit Criteria:                                                  │
│  • Ops dashboard shows real-time system health                  │
│  • Noisy tenants flagged automatically                          │
│  • Company admins can see their usage                           │
│                                                                  │
│  ═══════════════════════════════════════════════════════════════│
│                                                                  │
│  PHASE 4: Decision Intelligence (Week 9-10)                      │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  □ Implement threshold alerting for all metrics                 │
│  □ Create scaling recommendation engine                         │
│  □ Build capacity planning projections                          │
│  □ Add decision-trigger notifications                           │
│  □ Document runbooks for each trigger                           │
│                                                                  │
│  Exit Criteria:                                                  │
│  • System recommends "time to add index" automatically         │
│  • Capacity projections show "X months until limit"            │
│  • On-call has clear playbook for each alert                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Database Schema for Observability

```sql
-- Part 3 Observability Tables
-- Add to Supabase schema

-- Error log with full context
CREATE TABLE error_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Classification
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  category TEXT NOT NULL, -- 'database', 'storage', 'auth', 'network', 'sync'
  error_code TEXT,
  message TEXT NOT NULL,

  -- Context
  company_id UUID REFERENCES companies(id),
  user_id UUID REFERENCES users(id),
  project_id UUID REFERENCES projects(id),
  operation TEXT,

  -- Additional data
  context JSONB DEFAULT '{}'
);

CREATE INDEX idx_error_log_company ON error_log(company_id, created_at DESC);
CREATE INDEX idx_error_log_severity ON error_log(severity, created_at DESC);

-- Query performance samples (slow queries only)
CREATE TABLE query_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  operation TEXT NOT NULL, -- 'getTMTickets', 'getAreas', etc.
  duration_ms INTEGER NOT NULL,
  rows_returned INTEGER,

  company_id UUID REFERENCES companies(id),
  project_id UUID REFERENCES projects(id),

  context JSONB DEFAULT '{}'
);

CREATE INDEX idx_query_metrics_operation ON query_metrics(operation, created_at DESC);
CREATE INDEX idx_query_metrics_slow ON query_metrics(duration_ms DESC);

-- Daily tenant health snapshots
CREATE TABLE tenant_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  company_id UUID REFERENCES companies(id) NOT NULL,

  -- Health score
  health_score INTEGER CHECK (health_score BETWEEN 0 AND 100),
  status TEXT CHECK (status IN ('healthy', 'warning', 'critical')),

  -- Usage metrics
  active_users INTEGER DEFAULT 0,
  total_users INTEGER DEFAULT 0,
  active_projects INTEGER DEFAULT 0,
  storage_bytes BIGINT DEFAULT 0,
  daily_actions INTEGER DEFAULT 0,
  daily_errors INTEGER DEFAULT 0,
  avg_query_latency_ms INTEGER,

  -- Flags
  flags TEXT[] DEFAULT '{}',
  recommended_actions TEXT[] DEFAULT '{}',

  UNIQUE(snapshot_date, company_id)
);

CREATE INDEX idx_tenant_health_company ON tenant_health_snapshots(company_id, snapshot_date DESC);
CREATE INDEX idx_tenant_health_status ON tenant_health_snapshots(status, snapshot_date DESC);

-- Storage metrics (aggregated)
CREATE TABLE storage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date DATE NOT NULL,
  company_id UUID REFERENCES companies(id) NOT NULL,

  total_bytes BIGINT DEFAULT 0,
  photo_bytes BIGINT DEFAULT 0,
  document_bytes BIGINT DEFAULT 0,

  files_uploaded INTEGER DEFAULT 0,
  bytes_uploaded BIGINT DEFAULT 0,
  upload_errors INTEGER DEFAULT 0,

  UNIQUE(metric_date, company_id)
);

CREATE INDEX idx_storage_metrics_company ON storage_metrics(company_id, metric_date DESC);

-- RLS Policies (restrict to own company or admin access)
ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_metrics ENABLE ROW LEVEL SECURITY;

-- Engineering access (via admin flag or specific role)
CREATE POLICY "Engineering access to error_log"
  ON error_log FOR ALL
  USING (
    auth.uid() IN (
      SELECT user_id FROM user_companies
      WHERE access_level = 'administrator'
      -- Add: AND is_platform_admin = true for full access
    )
  );

-- Similar policies for other tables...
```

---

## 7. Success Criteria

```
┌─────────────────────────────────────────────────────────────────┐
│                   DEFINITION OF SUCCESS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  After implementing this observability strategy, we can         │
│  clearly answer:                                                 │
│                                                                  │
│  ═══════════════════════════════════════════════════════════════│
│                                                                  │
│  "ARE WE SCALING WELL?"                                          │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  □ Query latency trends visible over time                       │
│  □ Error rates tracked and compared to baseline                 │
│  □ Resource utilization graphed with projections                │
│  □ Per-tenant health scores calculated daily                    │
│                                                                  │
│  Answer: "Yes, p95 latency is 234ms (target <500ms), error     │
│  rate is 0.05%, we're using 70% of connection pool with        │
│  ~3 months runway at current growth rate."                      │
│                                                                  │
│  ═══════════════════════════════════════════════════════════════│
│                                                                  │
│  "WHERE ARE WE UNDER STRESS?"                                    │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  □ Slow queries identified with specific operations             │
│  □ Noisy tenants flagged automatically                          │
│  □ Resource bottlenecks ranked by severity                      │
│  □ Storage growth tracked per company                           │
│                                                                  │
│  Answer: "calculateManDayCosts is our slowest query at 1.2s.   │
│  BigBuild Co is at 95% storage. Connection pool is our next    │
│  constraint at current growth."                                  │
│                                                                  │
│  ═══════════════════════════════════════════════════════════════│
│                                                                  │
│  "IS IT TIME TO MIGRATE?"                                        │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  □ Clear thresholds defined for each migration trigger          │
│  □ Current metrics compared against thresholds                  │
│  □ Time-to-threshold projected                                   │
│  □ Recommended actions surfaced automatically                   │
│                                                                  │
│  Answer: "No. We're in 'Normal' zone for all metrics.          │
│  Nearest trigger is connection pool at 80% (currently 70%),    │
│  estimated 3 months away. Action then: upgrade Supabase tier   │
│  before considering hybrid architecture."                        │
│                                                                  │
│  ═══════════════════════════════════════════════════════════════│
│                                                                  │
│  INFRASTRUCTURE DECISIONS ARE NOW:                               │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  ✓ Data-driven (based on actual metrics, not assumptions)      │
│  ✓ Calm (we see problems before they become emergencies)        │
│  ✓ Justified (every decision has supporting data)               │
│                                                                  │
│  THE SYSTEM TELLS US WHAT IT NEEDS — BEFORE USERS DO.           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Appendix: Quick Reference

### A.1 Metric Thresholds At-a-Glance

| Metric | Normal | Warning | Action | Crisis |
|--------|--------|---------|--------|--------|
| Query p95 | <300ms | 300-500ms | >500ms | >2000ms |
| Connection Pool | <60% | 60-80% | >80% | 100% |
| Storage Growth | <50GB/mo | 50-100GB | >100GB | >200GB |
| Error Rate | <0.1% | 0.1-1% | 1-5% | >5% |
| RT Subscriptions | <300 | 300-500 | >500 | Tier limit |
| RLS Execution | <5ms | 5-20ms | >20ms | >100ms |

### A.2 Files to Create/Modify

| File | Purpose | Priority |
|------|---------|----------|
| `src/lib/observability.js` | Abstraction layer | Phase 0 |
| `src/lib/supabase.js` | Add timing instrumentation | Phase 1 |
| `src/components/admin/OpsBoard.jsx` | Operations dashboard | Phase 3 |
| `src/components/CompanyHealth.jsx` | Company health view | Phase 3 |
| `supabase/migrations/xxx_observability.sql` | DB schema | Phase 0 |

### A.3 Key Queries for Dashboards

```sql
-- Slow queries today
SELECT operation, AVG(duration_ms), COUNT(*)
FROM query_metrics
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY operation
ORDER BY AVG(duration_ms) DESC;

-- Errors by company
SELECT company_id, COUNT(*), MAX(created_at)
FROM error_log
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY company_id
ORDER BY COUNT(*) DESC;

-- Tenant health summary
SELECT status, COUNT(*)
FROM tenant_health_snapshots
WHERE snapshot_date = CURRENT_DATE
GROUP BY status;

-- Storage leaders
SELECT company_id, total_bytes / 1024 / 1024 / 1024 as gb
FROM storage_metrics
WHERE metric_date = CURRENT_DATE
ORDER BY total_bytes DESC
LIMIT 10;
```

---

*This observability strategy is a living reference. Update when:*
- *New metrics become relevant*
- *Thresholds need adjustment based on experience*
- *New tools are adopted*
- *Scale triggers are reached*

*Last updated: December 2024*
