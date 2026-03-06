# FieldSync Comprehensive Audit Report

**Date:** 2026-03-06
**Scope:** Full codebase audit covering security, data integrity, real-time sync, and code quality
**Branch:** `claude/audit-field-sync-1wR2i`

---

## Executive Summary

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Security & Auth | 4 | 4 | 7 | 5 | 20 |
| Database Operations | 3 | 11 | 27 | 5 | 46 |
| Real-Time Sync | 0 | 4 | 7 | 3 | 14 |
| Components & Hooks | 1 | 2 | 24 | 16 | 43 |
| Dependencies (npm) | 0 | 3 | 2 | 0 | 5 |
| Lint | 0 | 0 | 0 | 234 | 234 |
| **Total** | **8** | **24** | **67** | **263** | **362** |

**Tests:** 275/275 passing (9 test files)
**Lint:** 0 errors, 234 warnings

---

## CRITICAL Findings (8) -- Immediate Action Required

### SEC-C1. Companies Table Wide-Open RLS Policy
**File:** `supabase/migrations/20260228_fix_foreman_auth_errors.sql:340`
**Severity:** CRITICAL

The migration creates a SELECT policy on `companies` with `USING (true)`, allowing any anonymous user to enumerate all companies -- names, codes, office codes, owner IDs, subscription tiers, and settings. An earlier migration correctly scoped access, but this one overrides it.

**Impact:** Full company data exposure. Combined with plaintext PINs (SEC-C3), enables complete field access compromise.

### SEC-C2. Signature Request INSERT Has No Authorization Check
**File:** `supabase/migrations/20250101_signature_anon_access.sql:19-22`
**Severity:** CRITICAL

The INSERT policy on `signature_requests` only checks `document_type IN ('tm_ticket', 'cor')`. No check that the caller has access to the referenced `document_id`. Any anonymous user can create signature requests for any document, generating valid tokens.

**Impact:** Unauthorized access to any T&M ticket or change order via forged signature requests.

### SEC-C3. PINs Stored in Plaintext
**File:** `src/components/Setup.jsx:529`, `supabase/migrations/20260304_fix_pin_rpc_ambiguous_column.sql:94`
**Severity:** CRITICAL

Project PINs are stored as plaintext and compared via `TRIM(p.pin) = clean_pin`. PINs are only 4 digits (10,000 combinations). Combined with company data exposure (SEC-C1), brute-force is trivial.

### SEC-C4. Server-Side PIN Rate Limiting Bypassed
**File:** `supabase/migrations/20260304_fix_pin_rpc_ambiguous_column.sql:58-59`, `src/lib/db/projectOps.js:610`
**Severity:** CRITICAL

Rate limiting in `validate_pin_and_create_session` is gated behind `IF p_ip_address IS NOT NULL OR p_device_id IS NOT NULL`. The client passes `p_ip_address: null`, and `p_device_id` can be null. When both null, rate limiting is completely skipped.

**Impact:** Unlimited brute-force PIN attempts.

### DB-C1. saveCORSnapshot -- Three Non-Atomic Writes
**File:** `src/lib/db/financialOps.js:204-248`
**Severity:** CRITICAL

Three sequential operations: (1) mark old snapshots `is_current: false`, (2) insert new snapshot, (3) update COR `last_snapshot_version`. No transaction wrapping. If the insert succeeds but version update fails, `getCurrentCORSnapshot` permanently considers the snapshot stale.

### DB-C2. saveCORSnapshot -- Concurrent Race Condition
**File:** `src/lib/db/financialOps.js:208-233`
**Severity:** CRITICAL

Two concurrent calls for the same COR both mark all existing snapshots `is_current: false`, then both insert `is_current: true`, creating two "current" snapshots. No locking or unique constraint prevents this.

### DB-C3. getAllUsers / getForemen -- Cross-Tenant Data Leak
**File:** `src/lib/db/projectOps.js:1424-1450`
**Severity:** CRITICAL (reclassified from High due to multi-tenant context)

`getAllUsers` fetches ALL users with `select('*')` and no company filter. `getForemen` has the same issue. Exposes every user across every tenant.

### COMP-C1. State Mutation Inside useMemo
**File:** `src/hooks/useFilteredPagination.js:36-38`
**Severity:** CRITICAL

`pagination.setTotalItems(filteredItems.length)` is a state mutation called inside `useMemo`. React forbids state updates during render. This can trigger infinite re-render loops.

---

## HIGH Findings (24)

### Security (4)

| ID | Finding | File | Line |
|----|---------|------|------|
| SEC-H1 | CSRF protection is client-side only -- never validated server-side | `src/lib/csrf.js` | 77-83 |
| SEC-H2 | Sanitization library exists but unused in all user-input components (RegisterCompany, Setup, FieldLogin, signatures) | `src/lib/sanitize.js` | all |
| SEC-H3 | Signature request UPDATE policy has no ownership check -- any anon user can update any request | `supabase/migrations/20250101_signature_anon_access.sql` | 26-31 |
| SEC-H4 | Anon key exposed in production bundle; entire security relies on (broken) RLS | `src/lib/supabaseClient.js` | 29 |

### Database Operations (11)

| ID | Finding | File | Line |
|----|---------|------|------|
| DB-H1 | deleteProject -- five sequential destructive steps with no rollback | `src/lib/db/projectOps.js` | 893-957 |
| DB-H2 | deleteProject -- incomplete cascade (misses areas, crew, messages, materials, injuries, disposal, CORs, shares, docs, punch list, etc.) | `src/lib/db/projectOps.js` | 932-935 |
| DB-H3 | archiveProjectDeep -- four non-atomic steps | `src/lib/db/projectOps.js` | 417-469 |
| DB-H4 | updateProjectShare -- no field whitelist, caller can inject `project_id` override | `src/lib/db/financialOps.js` | 393-423 |
| DB-H5 | updateDumpSite -- no field whitelist, can overwrite `company_id` | `src/lib/db/financialOps.js` | 921-947 |
| DB-H6 | deleteProject -- optional companyId allows cross-tenant deletion | `src/lib/db/projectOps.js` | 893 |
| DB-H7 | saveCORSnapshot -- no version check on write (stale snapshot marked current) | `src/lib/db/financialOps.js` | 239 |
| DB-H8 | getTMTickets -- unbounded query with heavy joins, no LIMIT | `src/lib/db/tmOps.js` | 23-63 |
| DB-H9 | getTMTicketsByStatus -- leaks cost_per_unit to field users | `src/lib/db/tmOps.js` | 164-186 |
| DB-H10 | getCORTickets -- leaks cost_per_unit to field users | `src/lib/db/tmOps.js` | 189-210 |
| DB-H11 | getProjects -- no LIMIT when companyId is null (fetches all projects cross-tenant) | `src/lib/db/projectOps.js` | 26-77 |

### Real-Time Sync (4)

| ID | Finding | File | Line |
|----|---------|------|------|
| SYNC-H1 | No subscription error/status handling -- channel failures are completely silent | `src/lib/db/projectOps.js` | 1117-1332 |
| SYNC-H2 | Stale data after reconnection -- no full refresh on reconnect, changes during disconnect are lost | Multiple files | -- |
| SYNC-H3 | Duplicate subscriptions on same tables (company-wide + per-project) double event processing | Dashboard component | -- |
| SYNC-H4 | Race condition in optimistic updates vs real-time subscription refreshes | `src/components/ForemanView.jsx` | 181-194 |

### Components (2)

| ID | Finding | File | Line |
|----|---------|------|------|
| COMP-H1 | Uncleaned setTimeout in InjuryReportForm after submission | `src/components/InjuryReportForm.jsx` | 185 |
| COMP-H2 | Stale closure in applyBatchHours -- uses direct state instead of functional updater | `src/components/TMForm.jsx` | 205-226 |

### Dependencies (3)

| ID | Finding | Package | Severity |
|----|---------|---------|----------|
| DEP-H1 | xlsx has prototype pollution vulnerability (no fix available) | `xlsx` | High |
| DEP-H2 | rollup 4.0.0-4.58.0 has arbitrary file write via path traversal | `rollup` | High |
| DEP-H3 | minimatch <=3.1.3 has multiple ReDoS vulnerabilities | `minimatch` | High |

---

## MEDIUM Findings (67)

### Security (7)

| ID | Finding | File |
|----|---------|------|
| SEC-M1 | Password minimum length inconsistency (6 in registration, 8 in settings) | RegisterCompany.jsx / AccountSettings.jsx |
| SEC-M2 | MembershipManager admin operations lack server-side authorization | MembershipManager.jsx |
| SEC-M3 | RegisterCompany fallback creates admin role without proper auth | RegisterCompany.jsx:101-161 |
| SEC-M4 | `password_hash: 'managed_by_supabase_auth'` sentinel in users table | RegisterCompany.jsx:128 |
| SEC-M5 | Foreman name persists in unprotected localStorage on shared devices | FieldLogin.jsx:110 |
| SEC-M6 | Field session token in sessionStorage, accessible to any same-origin JS | fieldSession.js:42 |
| SEC-M7 | No input validation on signature signer fields (name, title, company) | TMForemanSignature.jsx / TMClientSignature.jsx |

### Database Operations (27)

| ID | Finding | File |
|----|---------|------|
| DB-M1 | setDumpSiteRate -- TOCTOU race (check-then-insert, should use upsert) | financialOps.js:955-1001 |
| DB-M2 | getCurrentCORSnapshot -- two separate reads with no consistency | financialOps.js:177-201 |
| DB-M3 | No optimistic locking on any update operation (last-write-wins silently) | All db ops files |
| DB-M4 | addTMWorkers -- no hours validation (negative/extreme values pass) | tmOps.js:281-302 |
| DB-M5 | approveTMTicket -- silent coercion of invalid changeOrderValue to 0 | tmOps.js:451 |
| DB-M6 | createHaulOff -- no numeric validation on loads/estimatedCost | financialOps.js:1070-1107 |
| DB-M7 | updateLaborClass -- missing sanitization (inconsistent with other ops) | laborOps.js:291-303 |
| DB-M8 | updateArea -- missing sanitization | projectOps.js:1071 |
| DB-M9 | saveExportSnapshot -- no corId UUID validation | financialOps.js:23-57 |
| DB-M10 | getUserCompanies -- no null check on joined company | companyOps.js:75-80 |
| DB-M11 | getAssignedProjects -- null entries in result (no .filter(Boolean)) | projectOps.js:1355 |
| DB-M12 | getProjectAssignments -- null entries in result | projectOps.js:1415 |
| DB-M13 | documentOps -- every function calls getClient() without null guard | documentOps.js (all) |
| DB-M14 | setProjectNotificationPreferences -- sequential loop, partial failure | financialOps.js:713-725 |
| DB-M15 | updateAreaStatus offline sync -- no conflict resolution | projectOps.js:1016-1064 |
| DB-M16 | getProjects error fallback -- stale cache returned without indication | projectOps.js:54-60 |
| DB-M17 | increment_share_view_count -- unchecked result | financialOps.js:364 |
| DB-M18 | Multiple functions return [] on error, masking failures | financialOps.js (various) |
| DB-M19 | updateArea / deleteArea -- optional projectId bypasses tenant scoping | projectOps.js:1067, 1095 |
| DB-M20 | getTMTicketsByStatus -- unbounded, no LIMIT | tmOps.js:164-186 |
| DB-M21 | getCORTickets -- unbounded, no LIMIT | tmOps.js:189-210 |
| DB-M22 | getExportSnapshots -- unbounded, no LIMIT | financialOps.js:60-74 |
| DB-M23 | getHaulOffs -- unbounded, no LIMIT | financialOps.js:1045-1067 |
| DB-M24 | getAllUsers -- unbounded, fetches entire table | projectOps.js:1424-1435 |
| DB-M25 | Subscription string interpolation in PostgREST filters | projectOps.js (1117-1332) |
| DB-M26 | companyOps.getPunchListItems -- no null guard on getClient() | companyOps.js:443 |
| DB-M27 | Non-atomic draw request item delete-then-insert | drawRequestOps.js:196-232 |

### Real-Time Sync (7)

| ID | Finding | File |
|----|---------|------|
| SYNC-M1 | Conflict resolution default is silent overwrite (no onConflict handler wired) | offlineManager.js:496-511 |
| SYNC-M2 | Conflict detection only covers area status updates, not other types | offlineManager.js:484-509 |
| SYNC-M3 | Failed offline actions retry forever without max attempt limit | offlineManager.js:516-524 |
| SYNC-M4 | isSyncing flag race condition (async function with module-level boolean) | offlineManager.js:438, 466-469 |
| SYNC-M5 | Module-level onConnectionChange listener never cleaned up (HMR leak) | supabase.js:211 |
| SYNC-M6 | Field client not closed on token refresh (old WebSocket persists) | fieldSession.js:66-97 |
| SYNC-M7 | No field session expiration validation on client | fieldSession.js:20-33 |

### Components & Hooks (24)

| ID | Finding | File |
|----|---------|------|
| COMP-M1 | No unmount guard on async loadReport() | DailyReport.jsx:20-58 |
| COMP-M2 | State updates after unmount in handleSubmit | DailyReport.jsx:96-152 |
| COMP-M3 | No unmount guard on async loadMessages() | ProjectMessages.jsx:14-67 |
| COMP-M4 | Unhandled promise from markMessagesRead | ProjectMessages.jsx:40 |
| COMP-M5 | No unmount guard on async loadRequests() | MaterialRequestsList.jsx:30-39 |
| COMP-M6 | No error state in MaterialRequestsList UI | MaterialRequestsList.jsx |
| COMP-M7 | No error state in ProjectMessages UI | ProjectMessages.jsx |
| COMP-M8 | loadReport not in useEffect dependency array | DailyReport.jsx:20-24 |
| COMP-M9 | loadMessages not in useEffect dependency array | ProjectMessages.jsx:14-34 |
| COMP-M10 | loadTodaysCrew/loadAssignableCORs not in useEffect deps | TMForm.jsx:103-114 |
| COMP-M11 | fetchFn instability causes refetch loops in useAsyncData | useAsyncData.js:95 |
| COMP-M12 | Unhandled promise rejection in DailyReportsList exportToPDF | DailyReportsList.jsx:238-454 |
| COMP-M13 | Unhandled promise rejection in InjuryReportsList exportToPDF | InjuryReportsList.jsx:208-345 |
| COMP-M14 | Multiple decimal points accepted in amount field | AddCostModal.jsx:124 |
| COMP-M15 | No email format validation in InjuryReportForm | InjuryReportForm.jsx |
| COMP-M16 | Password min length constant (8) not used -- validation checks 6 | AppEntry.jsx:350, constants.js:134 |
| COMP-M17 | Back buttons lack aria-label | DailyReport.jsx:166, 179, 195 |
| COMP-M18 | Clickable div without keyboard accessibility | DailyReportsList.jsx:464 |
| COMP-M19 | Clickable div without keyboard accessibility | MaterialRequestsList.jsx:184 |
| COMP-M20 | Clickable div without keyboard accessibility | ProjectMessages.jsx:126 |
| COMP-M21 | Crash on null report.status in InjuryReportCard | InjuryReportCard.jsx:52 |
| COMP-M22 | Crash on null incident_description | InjuryReportCard.jsx:77 |
| COMP-M23 | Non-atomic sequential area updates in useProjectEdit | useProjectEdit.js:139-162 |
| COMP-M24 | Non-atomic draw request item replacement | drawRequestOps.js:196-232 |

### Dependencies (2)

| ID | Finding | Package |
|----|---------|---------|
| DEP-M1 | DOMPurify 3.1.3-3.3.1 contains XSS vulnerability | `dompurify` |
| DEP-M2 | ajv <6.14.0 has ReDoS with `$data` option | `ajv` |

---

## Recommended Remediation Priority

### Tier 1 -- Security Critical (fix immediately)

1. **Fix companies table RLS** -- Replace `USING(true)` with proper company-scoped policy
2. **Fix PIN rate limiting** -- Remove the `IF p_ip_address IS NOT NULL OR p_device_id IS NOT NULL` guard
3. **Scope signature_requests policies** -- Add `can_access_project()` checks to INSERT and UPDATE
4. **Hash PINs server-side** -- Use bcrypt/pgcrypto instead of plaintext comparison
5. **Add company filters to getAllUsers/getForemen** -- Prevent cross-tenant data leaks

### Tier 2 -- Data Integrity (fix this sprint)

6. **Wrap saveCORSnapshot in a database transaction** (or server-side RPC)
7. **Add field whitelists to updateProjectShare and updateDumpSite**
8. **Make companyId mandatory in deleteProject and complete the cascade**
9. **Add LIMIT to getTMTickets** or migrate callers to paginated version
10. **Wire up conflict detection** -- pass onConflict handler in syncPendingActions

### Tier 3 -- Real-Time Sync (fix next sprint)

11. **Add subscription status callbacks** to detect channel errors
12. **Implement reconnection data refresh** -- full reload on coming back online
13. **Deduplicate subscriptions** -- remove per-project subs that overlap company-wide
14. **Add max retry limit** for failed offline actions
15. **Close old field clients** when token refreshes

### Tier 4 -- Code Quality (ongoing)

16. **Move setTotalItems out of useMemo** in useFilteredPagination
17. **Add unmount guards** (AbortController) to all async useEffect patterns
18. **Add null guards** on InjuryReportCard.status and incident_description
19. **Fix password length validation** to use MIN_PASSWORD_LENGTH constant
20. **Wire sanitization library** into all user-input components
21. **Fix accessibility** -- add aria-labels, keyboard handlers to clickable divs
22. **Update dependencies** -- run `npm audit fix`, replace xlsx with a maintained alternative

---

## Dependency Vulnerabilities

| Package | Severity | Fix Available |
|---------|----------|---------------|
| xlsx | High (Prototype Pollution, ReDoS) | No fix -- consider replacing with SheetJS-CE or exceljs |
| rollup | High (Arbitrary File Write) | Yes -- `npm audit fix` |
| minimatch | High (ReDoS x3) | Yes -- `npm audit fix` |
| dompurify | Moderate (XSS) | Yes -- `npm audit fix` |
| ajv | Moderate (ReDoS) | Yes -- `npm audit fix` |

---

## Lint Summary

234 warnings, 0 errors. Key categories:
- **Unused variables/imports** (most common): fieldOps.js, tmOps.js, projectOps.js, financialOps.js
- **Unused caught errors** (`e` should be `_e`): corPdfGenerator.js, fieldSession.js, imageUtils.js
- **prefer-const**: companyOps.js, documentOps.js, observability.js
- **Unused function parameters**: forecastCalculations.js, resourceCalculations.js, financialExport.js

---

## Test Coverage

All 275 tests pass across 9 test files:
- `conflictDetection.test.js` -- Offline conflict detection
- `csrf.test.js` -- CSRF token management
- `sanitize.test.js` -- Input sanitization
- `earnedValueCalculations.test.js` -- Earned value metrics
- `corCalculations.test.js` -- Change order calculations
- `riskCalculations.test.js` -- Risk analysis
- `fieldOfficeSyncAudit.test.js` -- Field-office sync
- `components.test.js` -- Component logic
- `utils.test.js` -- Utility functions

**Notable gaps in test coverage:**
- No integration tests for real-time subscriptions
- No tests for offline sync/replay
- No tests for database operations (projectOps, tmOps, fieldOps, etc.)
- No tests for authentication flows
- No tests for PDF export functions
