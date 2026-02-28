# FieldSync Production Codebase Audit Report

**Date:** February 28, 2026
**Scope:** Full codebase audit — code quality, security, performance, architecture, database, testing, observability
**Codebase:** ~33,000 lines across 129 source files (React/Vite + Supabase)
**Tests:** 275 passing (9 test suites)

---

## Executive Summary

FieldSync is a well-structured construction management SPA with solid architectural foundations. The codebase demonstrates good practices in many areas (RLS policies, offline support, error boundaries, code splitting). However, several critical issues require attention before handling 100k+ concurrent users.

**Changes Implemented in This Audit:**
- Reduced main bundle from **944KB → 378KB** (60% reduction)
- Fixed **29 ESLint warnings** (189 → 160)
- Added **security headers** (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
- Disabled **public source maps** in production (changed to `hidden`)
- Fixed **4 npm audit vulnerabilities** (minimatch, rollup)
- Replaced all **6 `alert()` calls** with proper toast notifications
- Removed **dead code** (unused imports, unused validation helpers, unused variables)
- Added **query limits** to unbounded `getAllUsers()` and `getForemen()`
- **Lazy-loaded ForemanView** component (was eagerly loaded, 120KB)
- Split **react-router-dom** into its own cached chunk (49KB)

---

## 1. Critical Issues (Must Fix Before Production)

### 1.1 SECURITY: Remaining Dependency Vulnerabilities
| Package | Severity | Issue | Fix |
|---------|----------|-------|-----|
| `xlsx` | High+Critical | Prototype Pollution + ReDoS | No fix available — evaluate switching to `SheetJS/sheetjs` community edition or `exceljs` |
| `jspdf` | High | PDF Object Injection + DoS via GIF | Upgrade to `jspdf@4.x` (breaking change — requires testing) |

**Effort:** 2-4 hours for jspdf upgrade, 1-2 days for xlsx replacement

### 1.2 SECURITY: Missing CSP for Google Fonts
**Status:** FIXED in this audit — CSP headers added to `vercel.json`
**Note:** Test thoroughly after deploy. If Google Fonts break, add `https://fonts.googleapis.com` to `style-src` and `https://fonts.gstatic.com` to `font-src` (already included).

### 1.3 TESTING: Zero Test Coverage on Authentication
**File:** `src/lib/supabase.js` (auth section, lines 108-250)
**Impact:** Auth bypass, session hijacking, rate limit bypass all untestable
**Missing tests:**
- `auth.signUp()`, `auth.signIn()`, `auth.signOut()`
- PIN validation with rate limiting (`getProjectByPinSecure`)
- Field session token lifecycle
- MFA challenge flow

**Effort:** 1-2 days

### 1.4 TESTING: Zero Test Coverage on Data Mutations
**Files:** `src/lib/corOps.js` (2,232 lines), `src/lib/equipmentOps.js`, `src/lib/drawRequestOps.js`
**Impact:** Data corruption, silent failures in financial operations
**Missing tests:** All CRUD operations for CORs, T&M tickets, equipment, draw requests

**Effort:** 2-3 days

### 1.5 DATABASE: Missing CHECK Constraints
**Location:** Database migration files
**Issues:**
- No positive-amount constraints on financial fields (negative labor rates possible)
- No percentage bounds (markup could exceed 100%)
- No max length on TEXT fields (`cor_number`, `title`, `description` — could be multi-MB)

**Recommended migration:**
```sql
ALTER TABLE change_orders ADD CHECK (labor_markup_percent >= 0 AND labor_markup_percent <= 10000);
ALTER TABLE change_order_labor ADD CHECK (regular_rate >= 0 AND overtime_rate >= 0);
ALTER TABLE change_orders ADD CHECK (LENGTH(title) <= 500);
ALTER TABLE change_orders ADD CHECK (LENGTH(description) <= 10000);
```

**Effort:** 2-4 hours + migration testing

---

## 2. High Priority (Impact Scaling/Performance)

### 2.1 ARCHITECTURE: Monolithic `supabase.js` (6,607 lines)
**File:** `src/lib/supabase.js`
**Issue:** Single file containing ALL database operations — projects, areas, tickets, CORs, crew, reports, search, photos, documents, etc.
**Impact:** Import bloat (every component pulls entire data layer), difficult to maintain, no tree-shaking
**Recommendation:** Split into domain modules:
- `src/lib/db/projects.js`
- `src/lib/db/tickets.js`
- `src/lib/db/areas.js`
- `src/lib/db/reports.js`
- `src/lib/db/photos.js`
- `src/lib/db/search.js`
- Re-export from `src/lib/db/index.js` for backward compatibility

**Effort:** 1-2 days (mechanical refactor, backward compatible via re-exports)

### 2.2 ARCHITECTURE: Dashboard.jsx (2,735 lines, 80+ state variables)
**File:** `src/components/Dashboard.jsx`
**Issue:** Monolithic component managing the entire office dashboard
**Impact:** Unnecessary re-renders, difficult to test, poor code splitting
**Recommendation:** Extract into:
- `ProjectSelector` component
- `ProjectOverview` tab component
- `ProjectFinancials` tab component
- `useAuth()` custom hook for auth state (currently scattered in App.jsx)
- `useReducer` for related modal states

**Effort:** 2-3 days

### 2.3 PERFORMANCE: 363 Console Statements Across 66 Files
**Status:** Partially addressed (observability.js exists but underutilized)
**Impact:** Performance degradation in production, information leakage
**Top offenders:**
| File | Count |
|------|-------|
| `src/lib/supabase.js` | 81 |
| `src/lib/drawRequestOps.js` | 23 |
| `src/lib/corOps.js` | 21 |
| `src/lib/equipmentOps.js` | 16 |
| `src/lib/BrandingContext.jsx` | 10 |

**Recommendation:** Replace with `observe.error()` / `observe.query()` calls from the existing observability module. Add ESLint rule `"no-console": ["warn", { "allow": ["warn", "error"] }]`.

**Effort:** 4-6 hours

### 2.4 PERFORMANCE: N+1 Query in TMList Editability Check
**File:** `src/components/TMList.jsx` (lines 113-127)
**Issue:** After loading tickets, makes individual API calls per ticket to check editability
**Impact:** O(N) API calls where N = tickets with assigned CORs
**Fix:** Batch editability checks into a single query or include in initial ticket fetch

**Effort:** 2-4 hours

### 2.5 DATABASE: RLS Policy Tests Not Executed in CI
**File:** `supabase/tests/rls_policy_tests.sql` (385 lines of tests exist but are never run)
**Impact:** RLS regressions undetectable, potential data leaks
**Fix:** Add to CI pipeline: `supabase db test`

**Effort:** 1-2 hours

---

## 3. Medium Priority (Code Quality Improvements)

### 3.1 Toast Notification Duality
**Issue:** App.jsx implements its own toast state AND ToastContext exists — inconsistent usage
**Impact:** Confusing API, some components use `onShowToast` prop, others could use `useToast()` hook
**Fix:** Migrate all toast usage to ToastContext, remove callback pattern

### 3.2 Inline Arrow Functions in JSX (20+ instances in Dashboard)
**Issue:** `onClick={() => handleAction(index)}` creates new function references on every render
**Impact:** Breaks React.memo optimization on child components
**Fix:** Extract to useCallback or move handlers outside render

### 3.3 Missing React.memo on Expensive Components
**Candidates:** TMList, CORForm, DailyReportsList, SignaturePage
**Impact:** Unnecessary re-renders when parent state changes

### 3.4 Empty Catch Blocks (30+ instances)
**Pattern:** `} catch { /* skip */ }` or `} catch { return null }`
**Impact:** Silent failures, difficult production debugging
**Fix:** Add `observe.error()` calls in catch blocks for visibility

### 3.5 Hardcoded Magic Numbers (40+ instances)
**Examples:**
- `setTimeout(() => ..., 150)` — debounce delays
- `setInterval(..., 300000)` — SW update interval
- `Date.now() - 7 * 24 * 60 * 60 * 1000` — 7-day window

**Fix:** Extract to constants in `src/lib/constants.js` (file already exists)

### 3.6 Duplicated Currency Conversion (105 instances)
**Pattern:** `Math.round(parseFloat(rate) * 100)` repeated throughout codebase
**Fix:** Extract to `toCents()` / `fromCents()` utility functions

---

## 4. Low Priority (Nice-to-Have Refactors)

### 4.1 Inconsistent Function Declaration Style
Mix of arrow functions and function declarations within same files

### 4.2 Large Component Files (6 files > 1,000 lines)
- `corOps.js` (2,232), `corPdfExport.js` (1,483), `SignaturePage.jsx` (1,290)
- `TMForm.jsx` (1,177), `AppEntry.jsx` (1,173), `corPdfGenerator.js` (1,122)

### 4.3 UUID Generation Inconsistency in DB
Two different functions used: `gen_random_uuid()` and `uuid_generate_v4()`
Standardize to `gen_random_uuid()` (built-in, no extension needed)

### 4.4 Add TypeScript
Session data, auth state, and database response types would benefit from static typing

---

## 5. Scalability Roadmap: 100k+ Concurrent Users

### Phase 1: Immediate (Pre-Launch)
1. **Fix unbounded queries** — `getAllUsers()`, `getForemen()` now have limits (**DONE**)
2. **Add database CHECK constraints** — prevent invalid financial data
3. **Deploy security headers** — CSP, X-Frame-Options (**DONE**)
4. **Add auth tests** — prevent regression on critical paths
5. **Run RLS policy tests in CI** — prevent data leaks

### Phase 2: Short-Term (1-3 Months)
1. **Split supabase.js** — enable tree-shaking, reduce import weight
2. **Implement server-side rate limiting** — Edge Functions with Redis/Durable Objects
3. **Add CDN caching** for static assets (Vercel handles this, but verify headers)
4. **Replace xlsx** with `exceljs` to eliminate critical vulnerability
5. **Add structured logging** — replace console.log with observability module
6. **Add E2E tests** with Playwright for critical flows

### Phase 3: Medium-Term (3-6 Months)
1. **Database connection pooling** — PgBouncer (Supabase supports this natively)
2. **Read replicas** for reporting queries (Supabase Pro tier)
3. **Implement request caching** — Redis for repeated reads (project summaries, user lists)
4. **Add database query monitoring** — pg_stat_statements for slow query detection
5. **Implement pagination everywhere** — currently 70% covered
6. **Add health check endpoint** — for load balancer readiness probes

### Phase 4: Long-Term (6-12 Months)
1. **Horizontal scaling** — stateless design is already in place (sessions in DB, not memory)
2. **Background job queue** — for PDF generation, email notifications (currently synchronous)
3. **Event-driven architecture** — Supabase Realtime already used, extend for inter-service comms
4. **Multi-region deployment** — Vercel Edge + Supabase regional replicas
5. **Implement feature flags** — gradual rollout for new features
6. **Performance budgets** — bundle size limits in CI, Lighthouse scores in PR checks

---

## Security Posture Summary

| Area | Status | Notes |
|------|--------|-------|
| XSS Prevention | PASS | No dangerouslySetInnerHTML, React's built-in escaping |
| SQL Injection | PASS | Supabase parameterized queries exclusively |
| Input Validation | PASS | Comprehensive sanitize.js module (347 lines) |
| CSRF Protection | PASS | Client-side CSRF tokens with 30-min TTL |
| Auth/Session | GOOD | Supabase Auth + field session tokens |
| RLS Policies | EXCELLENT | Multi-tenant isolation, field user restrictions |
| Secrets Management | PASS | No hardcoded secrets, env vars via Vercel |
| Security Headers | FIXED | CSP, X-Frame-Options, X-Content-Type-Options added |
| Source Maps | FIXED | Changed from `true` to `hidden` |
| Dependencies | PARTIAL | 2 remaining vulnerabilities (xlsx, jspdf) |
| Rate Limiting | GOOD | PIN auth rate-limited, API endpoints need more |
| File Upload | EXCELLENT | MIME validation, size limits, path sanitization |

---

## Test Coverage Summary

| Area | Coverage | Status |
|------|----------|--------|
| COR Calculations | 95% | 645 lines of thorough tests |
| Sanitization/XSS | 90% | 303 lines covering edge cases |
| Risk Calculations | 85% | 390 lines with all risk factors |
| Earned Value | 80% | 172 lines for financial projections |
| Conflict Detection | 75% | Basic scenarios covered |
| CSRF | 70% | Token generation and validation |
| Component Logic | 40% | Only hooks and utility logic |
| Authentication | 0% | **CRITICAL GAP** |
| Data Mutations (CRUD) | 0% | **CRITICAL GAP** |
| Integration/E2E | 0% | **No integration tests** |
| RLS Policies | Written | **Not executed in CI** |

**Overall Estimated Coverage:** ~20% of business-critical logic

---

## Build Metrics (After Audit Fixes)

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Main bundle (index.js) | 944 KB | 378 KB | **-60%** |
| ForemanView chunk | (in main) | 120 KB | Lazy-loaded |
| Router chunk | (in main) | 49 KB | Separated |
| ESLint warnings | 189 | 160 | -15% |
| npm vulnerabilities | 6 | 2 | -67% |
| Tests passing | 275/275 | 275/275 | No regression |
| Build time | 20.5s | 20.5s | No change |
