# FieldSync Code Review

**Date:** 2026-04-02
**Scope:** Full codebase (~86K lines, 265 JS/JSX files, 57 SQL migrations)
**Stack:** React 19 + Vite 7 + Supabase (PostgreSQL + Realtime + Storage)

---

## Executive Summary

FieldSync is a well-structured construction progress tracking application with solid fundamentals: parameterized Supabase queries prevent SQL injection, React JSX escaping prevents XSS, a centralized error handler exists, and skeleton/loading patterns are good. However, the review uncovered **critical issues** across security, data integrity, architecture, and UX that should be addressed before production use with real financial data.

| Category | Critical | High | Medium |
|----------|----------|------|--------|
| Security | 6 | 12 | 14 |
| Data Integrity & Logic | 5 | 5 | 3 |
| Architecture & Performance | 5 | 8 | 10+ |
| UX & Accessibility | 5 | 4 | 3 |
| **Total** | **21** | **29** | **30+** |

---

## 1. Security

### CRITICAL

#### S1. Demo Mode Bypasses All Authentication in Production
- **File:** `src/lib/supabase.js:90-104`
- **Issue:** When `VITE_SUPABASE_URL` is not set, auth falls back to localStorage-based authentication that skips password validation. If production is misconfigured, any email grants access.
- **Fix:** Hard-block demo mode in production builds. Throw an error if env vars are missing rather than falling through to localStorage auth.

#### S2. Public Storage Bucket Exposes All Documents
- **Files:** `database/fix_documents_rls.sql:256-258`, `database/FIX_DOCUMENT_UPLOAD_RLS.sql:295-297`
- **Issue:** `project-documents` bucket is `public = true`. Any unauthenticated user can read files at `{company_id}/{project_id}/documents/{filename}` — a fully enumerable path.
- **Impact:** Confidential contracts, blueprints, and financial documents are accessible to anyone.
- **Fix:** Set `public = false`; use signed URLs with short expiry for all document access.

#### S3. `USING(true)` RLS Policies Allow Unrestricted Access
- **Files:** `database/schema.sql:37-38`, `database/add_pin.sql:20,33,37`, `database/migration_labor_classes.sql:89,114,139`, `database/migration_photo_reliability.sql:161-209`, `database/migration_documents.sql:348`
- **Issue:** Multiple tables have RLS policies with `USING (true)`, allowing any role (including `anon`) unrestricted read/write. This completely bypasses tenant isolation.
- **Fix:** Audit live database; drop and replace all `USING(true)` policies with company/project-scoped checks.

#### S4. Client-Side Role Assignment Without Server Validation
- **File:** `src/components/auth/RegisterCompany.jsx:100-161`
- **Issue:** When `register_company` RPC fails, the client directly inserts into `companies`, `users`, and `user_companies` with hardcoded `role: 'admin'` and `access_level: 'administrator'`. An attacker can trigger RPC failure to gain admin access.
- **Fix:** Remove client-side fallback entirely; company registration must only go through server-side RPC.

#### S5. Client-Side PIN Rate Limiting Is Bypassable
- **Files:** `src/lib/db/projectOps.js:585-645, 726-762`
- **Issue:** PIN brute-force protection is implemented via `localStorage` (clear it to bypass). PIN keyspace is only 10,000 combinations (4 digits). The fallback `_pinFallbackDirectQuery()` sends raw PIN as an unvalidated Supabase filter.
- **Fix:** Remove fallback; increase PIN to 6+ digits; enforce server-side rate limiting only.

#### S6. Signup Trigger Accepts Arbitrary Role from Client Metadata
- **File:** `database/schema_v2.sql:38-50`
- **Issue:** `handle_new_user()` reads `raw_user_meta_data->>'role'` from client-supplied data and stores it as the user's role. Attacker signs up with `{ role: 'admin' }` to get elevated access.
- **Fix:** Ignore user-supplied role; default to `'member'`; require admin action to elevate.

### HIGH

| ID | Issue | File | Fix |
|----|-------|------|-----|
| S7 | `getCompanyByCode` exposes all company fields (`select('*')`) to anonymous users | `src/lib/db/companyOps.js:15-31` | Restrict to `select('id, name')` |
| S8 | MFA bypass — auth state set before MFA challenge completes | `src/hooks/useAuthState.js:167-193` | Don't set auth state until MFA verified |
| S9 | Cross-tenant signature leakage — `signatures` table has `USING(true)` for authenticated | `database/migration_signatures_anon_access.sql:48-51` | Scope to company membership |
| S10 | `get_labor_classes_for_field` SECURITY DEFINER callable by anon for any company | `database/migration_security_hardening.sql:126-148` | Require valid field session token |
| S11 | `auth_attempts` allows unrestricted anon INSERT — enables rate-limit DoS | `database/migration_security_hardening.sql:39-42,50` | Only allow inserts via SECURITY DEFINER |
| S12 | Invitation token not scoped to user — anyone with URL can accept | `src/components/auth/AcceptInvite.jsx:53-69` | Server-side email matching |
| S13 | Anon DELETE on `punch_list_items` — any field worker can delete any item | `database/fix_punch_list_field_access.sql:26-43` | Restrict to creator or admin |
| S14 | Field session token stored in `sessionStorage` without integrity protection | `src/lib/fieldSession.js:39-46` | Add server-side token-to-project binding |
| S15 | Sensitive PII in injury reports without field-level access controls | `src/components/InjuryReportForm.jsx:21-57` | Field-level encryption; admin-only access |
| S16 | `office_only` doc visibility check is `access_level IN ('member','administrator') OR IS NULL` — equivalent to `true` | `database/fix_documents_rls.sql:105-110` | Change to `access_level = 'administrator'` only |
| S17 | CSRF protection is client-side only — no server-side validation | `src/lib/csrf.js` | Validate tokens server-side |
| S18 | Anon full GRANT (SELECT, INSERT, UPDATE, DELETE) on `field_sessions` | `database/migration_field_sessions.sql:45` | Revoke DELETE/UPDATE from anon |

---

## 2. Data Integrity & Business Logic

### CRITICAL

#### D1. Floating-Point Precision in Labor Cost Calculations
- **File:** `src/lib/corOps.js:275-276, 321-322`
- **Issue:** `regular_rate` is parsed with `parseInt()`. If the rate comes through as `"5000.00"` (string float), `parseInt("5000.00")` returns `5000` (correct by luck), but if it's `"50.00"` for dollars instead of cents, the result is silently wrong. Mixed coercion between `parseFloat` (hours) and `parseInt` (rate) is fragile.
- **Fix:** Standardize all monetary values as integer cents end-to-end. Use `Math.round(parseFloat(x) || 0)` consistently.

#### D2. NaN Propagation in COR Totals
- **File:** `src/lib/corCalculations.js:88-99`
- **Issue:** `parseInt(null)` returns `NaN`, and `NaN || 0` evaluates to `0` — but `sum + NaN = NaN`. If any `item.total` is `null` from the DB, the entire COR total becomes `NaN`, rendering financial reports useless.
- **Fix:** Use `Number(x) || 0` instead of `parseInt(x) || 0`, or add explicit null checks.

#### D3. Offline Sync Race Condition — Double Replay
- **File:** `src/lib/offlineManager.js:467-577`
- **Issue:** Idempotency check happens after locking. If `processAction()` succeeds but `markAsSynced()` fails (storage error/crash), the same action replays on next sync — creating duplicate T&M tickets or area status updates.
- **Fix:** Mark as synced BEFORE processing, or use an atomic DB transaction for the sync operation.

#### D4. COR Status Transitions Missing Authorization
- **File:** `src/lib/corOps.js:1591-1634`
- **Issue:** Status machine checks transition validity (`allowedFromStatuses`) but never checks user role/permission. Any authenticated user can move a COR from `draft` to `approved`.
- **Fix:** Add RLS policy on status column. Enforce role-based transitions server-side.

#### D5. Real-Time Subscriptions Never Unsubscribed — Memory Leak
- **File:** `src/lib/corOps.js:1637-1704`
- **Issue:** `subscribeToCORLog()` returns subscription objects, but components never call `.unsubscribe()`. Each page navigation creates new subscriptions. After 10 navigations: 120+ stale Postgres connections.
- **Fix:** Add `useEffect` cleanup: `return () => subscription?.unsubscribe()`.

### HIGH

| ID | Issue | File | Impact |
|----|-------|------|--------|
| D6 | Division by zero in forecasts — `elapsedDays = 0` produces `Infinity` | `src/lib/forecastCalculations.js:449-450` | Corrupted projections |
| D7 | Invoice cascade delete is non-atomic — partial failure leaves orphaned data | `src/lib/corOps.js:2331` | Financial data corruption |
| D8 | Conflict detection relies on client clock — false conflicts if clock lags | `src/lib/conflictDetection.js:25-31` | False conflict resolution |
| D9 | Basis points rounding: `Math.round(15.005 * 100) = 1500` not `1501` | `src/lib/corCalculations.js:42-44` | Accumulating markup errors on large projects |
| D10 | Missing NOT NULL constraints on cost fields allow NULL propagation | `database/migration_change_orders.sql` | NaN in aggregations |

### TEST COVERAGE GAPS

Tests exist for: `corCalculations`, `earnedValueCalculations`, `sanitize`, `conflictDetection`, `utils`.

**Missing critical tests:**
- `offlineManager.js` — No tests for sync logic, race conditions, crash recovery
- `corOps.js` — No tests for status transitions, authorization, state machine
- `cashFlowCalculations.js` — No tests for receivables/payables projection
- `forecastCalculations.js` — No tests for cost/schedule forecasting
- Real-time subscription cleanup
- Decimal rounding edge cases

---

## 3. Architecture & Performance

### CRITICAL: Oversized Components

| Component | Lines | useState calls | Issue |
|-----------|-------|----------------|-------|
| `TMList.jsx` | 1,568 | 27 | Handles list, filter, pagination, COR association, signatures, deletion, modals |
| `TMForm.jsx` | 1,432 | 35 | 5-step form wizard with crew, materials, equipment, photos, drafts, signatures |
| `Dashboard.jsx` | 1,354 | 29 | Projects, areas, tabs, modals, financials, COR, equipment, draw requests |
| `AppEntry.jsx` | 1,251 | — | Foreman mode, office login, join company, register — 4 flows in one file |
| `CORForm.jsx` | 1,193 | 15 | 4 identical CRUD patterns for labor/materials/equipment/subcontractors |

### HIGH: N+1 Query Pattern
- **File:** `src/components/TMList.jsx:110-132`
- **Issue:** Loads 25 tickets, then makes 2 individual RPC calls per ticket with COR (`isTicketEditable` + `getTicketImportStatus`). That's 50 extra round-trips per page load.
- **Fix:** Create a batch RPC `getMultipleTicketsStatus()` that checks all tickets in a single call.

### HIGH: Excessive Prop Drilling
- `TMForm` ReviewStep receives **40+ props** (lines 1300-1342)
- `Dashboard` tabs receive 20+ props each
- **Fix:** Extract state into context providers or custom hooks (`useTMFormState()`, `useDashboardState()`).

### HIGH: Missing Memoization
- Only ~10 components use `React.memo` out of 200+
- `TMList` regroups tickets by month on every render without `useMemo`
- `CORForm` calls `groupLaborByClassAndType()` + `findIndex()` on every render (lines 681-785)
- `CORForm` has 20+ item `useMemo` dependency array that defeats memoization purpose

### HIGH: Subscription Cascading
- **File:** `src/components/Dashboard.jsx:177-200`
- **Issue:** 13 different subscription callbacks all call `debouncedRefresh()`. If T&M ticket, COR, daily report, and crew checkin all change in quick succession, 4 stacked refresh calls fire even with 150ms debounce.
- **Fix:** Track what changed; only refresh affected sections.

### Code Duplication

**CORForm (4 identical CRUD patterns):**
- `addLaborItem()`, `updateLaborItem()`, `removeLaborItem()` (lines 243-284)
- `addMaterialsItem()`, `updateMaterialsItem()`, `removeMaterialsItem()` (lines 287-313)
- `addEquipmentItem()`, `updateEquipmentItem()`, `removeEquipmentItem()` (lines 316-342)
- `addSubcontractorsItem()`, `updateSubcontractorsItem()`, `removeSubcontractorsItem()` (lines 345-380)
- **Fix:** Extract `useLineItems(initialItems, template)` hook.

**TMForm (3 identical worker management patterns):**
- Supervision (lines 441-496), Operators (lines 497-552), Laborers (lines 553-608)
- **Fix:** `updateWorker(section, index, field, value)`.

### Architectural Recommendations

1. **Immediate:** Add batch queries for ticket status; memoize derived state; use `Promise.allSettled()` instead of `Promise.all()` for non-critical parallel fetches
2. **Short-term:** Split TMForm/TMList/Dashboard into sub-components (<400 LOC each); extract state container hooks; add context providers to eliminate prop drilling
3. **Long-term:** Consider Zustand/Jotai for global state; React Query/SWR for data fetching (built-in deduplication, caching, race condition handling)

---

## 4. UX, Accessibility & Frontend

### CRITICAL

#### U1. Missing ARIA Labels on Form Inputs
- **Files:** `InjuryReportForm.jsx:229-265`, `TMForm.jsx:51-82`, `CORForm.jsx:42-87`, `Setup.jsx`
- **Issue:** Form inputs (date pickers, number inputs, text fields) lack `aria-label` or `aria-describedby`. Fails WCAG 2.1 Level A.
- **Fix:** Add `aria-label` to all inputs without visible labels.

#### U2. Form Validation Errors Not Announced to Screen Readers
- **Files:** `InjuryReportForm.jsx:84-106`, `Setup.jsx:52-98`, `TMForm.jsx`
- **Issue:** Validation errors shown via toast only, not via `aria-live` regions.
- **Fix:** Add `aria-live="polite"` error summary regions to forms.

#### U3. Missing Error Boundaries on Modal Forms
- **Files:** `TMForm.jsx`, `CORForm.jsx`, `InjuryReportForm.jsx`
- **Issue:** No `ErrorBoundary` wrapping these modal forms — any rendering error crashes the entire app.
- **Fix:** Wrap each modal form with `<ErrorBoundary>`.

#### U4. `setInterval` Without Cleanup
- **Files:** `src/App.jsx` (PendingApprovalScreen), `src/components/spx/SpxDashboard.jsx`
- **Issue:** `setInterval` for status polling continues after component unmounts.
- **Fix:** Add `clearInterval` in `useEffect` cleanup.

#### U5. Numeric Input Bounds Missing
- **Files:** `TMForm.jsx:74-76` (hours), `InjuryReportForm.jsx:584-600` (days away), `CORForm.jsx:66-86` (markup percentages)
- **Issue:** No validation that hours are 0-24, days are non-negative, or percentages are within bounds. Allows negative numbers and unrealistic values.
- **Fix:** Add `min`, `max`, `pattern` HTML5 attributes plus client-side validation.

### HIGH

| ID | Issue | File | Fix |
|----|-------|------|-----|
| U6 | Color contrast in dark mode badges uses 12% opacity backgrounds | `src/styles/components/badges.css:279-313` | Increase opacity; verify WCAG AA 4.5:1 |
| U7 | Catch-all route redirects to `/` silently — no 404 page | `src/App.jsx` | Add friendly 404/error page |
| U8 | Mobile form modals cramped — `max-height: 90vh` reduces content to ~70vh | `InjuryReportForm.jsx`, `Setup.jsx` | Optimize modal layout for 360px viewport |
| U9 | Floating-point weight validation fragile: `Math.abs(total - 100) > 0.1` | `Setup.jsx:89` | Use integer basis points or sum-to-10000 approach |

### Positive Findings
- Excellent `AccessibleStatusBadge` pattern with `role="status"`, `aria-label`, color+icon+text
- Proper Modal ARIA: `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap, Escape key
- Comprehensive `accessibility.css` with `.sr-only`, `prefers-reduced-motion`, `prefers-contrast`, 44px touch targets
- Good skeleton loading components with `aria-busy="true"`
- Keyboard navigation in PhotoTimeline and UniversalSearch
- Chunk-loading error detection for stale PWA deployments

---

## 5. Priority Remediation Roadmap

### Week 1 — Critical Security & Data Integrity
1. Make `project-documents` bucket private; use signed URLs only (S2)
2. Block demo mode auth in production builds (S1)
3. Audit and replace all `USING(true)` RLS policies (S3)
4. Remove client-side role assignment fallback in RegisterCompany (S4)
5. Remove PIN fallback direct query; add server-side rate limiting (S5)
6. Ignore user-supplied role in signup metadata (S6)
7. Fix NaN propagation in COR totals (D2)
8. Fix offline sync race condition (D3)

### Weeks 2-3 — High Security & Architecture
9. Fix MFA bypass race condition (S8)
10. Scope signature/labor class queries to company (S9, S10)
11. Add COR status transition authorization (D4)
12. Add subscription cleanup in all components (D5)
13. Create batch ticket status RPC to fix N+1 (Architecture)
14. Add ErrorBoundary wrapping on modal forms (U3)
15. Fix setInterval memory leaks (U4)

### Weeks 4-6 — Architecture & UX
16. Split oversized components (TMList, TMForm, Dashboard, AppEntry, CORForm)
17. Extract state container hooks; reduce prop drilling
18. Add ARIA labels and live regions to forms (U1, U2)
19. Add numeric input bounds validation (U5)
20. Add missing test coverage (offlineManager, corOps, forecastCalculations)

### Weeks 7-8 — Polish
21. Add 404/error page
22. Improve dark mode contrast
23. Optimize mobile form layouts
24. Add field-level encryption for injury report PII
25. Consider React Query/Zustand adoption
