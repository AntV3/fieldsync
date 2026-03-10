# FieldSync Code Audit & Review Report

**Date:** 2026-03-10
**Scope:** Full codebase audit — security, architecture, code quality, dependencies, testing, and deployment

---

## Executive Summary

FieldSync is a well-structured production React SPA (React 19, Vite 7, Supabase) with offline-first architecture serving construction field management. The codebase demonstrates strong fundamentals — modular organization, security-conscious patterns, and comprehensive error handling. However, the deep-dive audit uncovered **critical security issues in database RLS policies and authentication**, plus several code quality concerns.

**Note:** A prior security audit exists at `SECURITY_AUDIT.md` (2026-03-01) with 67 findings. This report cross-references those findings and adds code quality, architecture, and new security observations.

| Severity | Count | Summary |
|----------|-------|---------|
| **Critical** | 4 | `dist/` in git, dangerous RLS policies in migrations, PIN auth bypass, incomplete sanitization coverage |
| **High** | 6 | Dependency vulns, console spam, Dashboard complexity, membership authorization, field session security, missing deps |
| **Medium** | 5 | No TypeScript, limited test coverage, CSRF client-only, legacy CSS, env files committed |
| **Low** | 4 | No PropTypes, code splitting opportunities, SW cache versioning, bundle size threshold |

---

## 1. Critical Issues

### 1.1 `dist/` Build Artifacts Committed to Git

**Files:** 106 files tracked in `dist/`
**Impact:** Repository bloat, merge conflicts, stale build artifacts in source control

The `.gitignore` has a commented-out rule for `dist/`:
```
# Build output (uncomment if you don't want to track dist)
# dist/
```

**Recommendation:** Uncomment the `dist/` line in `.gitignore`, remove tracked `dist/` files from git (`git rm -r --cached dist/`), and rely on CI/CD to produce build artifacts. This will significantly reduce repo size (~16MB of build output).

### 1.2 Dangerous `auth.uid() IS NULL` RLS Policies in Migration Files

**File:** `supabase/migrations/20241230_field_cor_access.sql` — 15+ policies with `USING (auth.uid() IS NULL)`
**Impact:** If this migration is applied without the later fix (`20260218_secure_field_rls.sql`), the entire database is open to anonymous access for T&M tickets, crew checkins, daily reports, injury reports, material requests, and COR data.

The fix migration exists (`20260218_secure_field_rls.sql`) which replaces these policies with session-token-based validation. However, the dangerous migration file still exists in the repository.

**Recommendation:**
1. Verify that `20260218_secure_field_rls.sql` has been applied to all environments (production, staging)
2. Add a migration guard/check that rejects `auth.uid() IS NULL` policies
3. Consider removing or archiving the old migration file with a note that it's been superseded

### 1.3 PIN Authentication Rate Limiting is Bypassable

**File:** `src/lib/supabase.js` (PIN auth functions)
**Issues:**
- Client-side rate limiting uses localStorage — trivially bypassed via incognito/clearing storage
- The fallback direct query path (`_pinFallbackDirectQuery`) bypasses server-side RPC rate limiting
- Server-side rate limit check skips validation when IP/device_id are NULL (the client always passes null IP)

**Impact:** PIN brute-force attacks are feasible. A 4-digit PIN has only 10,000 combinations.

**Recommendation:**
1. Move all rate limiting server-side with proper IP extraction in the RPC function
2. Remove the fallback direct query path
3. Require 6-digit PINs minimum
4. Add account lockout after N failed attempts

### 1.4 Sanitization Library Not Used Uniformly

**Partial coverage:** `sanitize.text()` and `sanitizeFormData()` are used in `laborOps.js`, `projectOps.js`, and `tmOps.js` — but **NOT** in `fieldOps.js` (1,207 lines), `financialOps.js` (895 lines), `companyOps.js` (535 lines), or `documentOps.js` (780 lines).

**Impact:** ~50% of database write operations bypass input sanitization.

**Recommendation:** Audit all `.insert()` and `.update()` calls in the unsanitized modules and add `sanitizeFormData()` wrapping.

---

## 2. High-Priority Issues

### 2.1 Dependency Vulnerabilities (5 total)

```
npm audit results:
- rollup 4.0.0–4.58.0 — HIGH — Arbitrary File Write via Path Traversal (GHSA-mw96-cpmx-2vgc)
  → Fix: npm audit fix (auto-fixable)

- xlsx * — HIGH — Prototype Pollution (GHSA-4r6h-8v6p-xvw6)
- xlsx * — HIGH — ReDoS (GHSA-5pgg-2g8v-p4x9)
  → No fix available. Consider replacing with SheetJS Pro or an alternative like ExcelJS.

- ajv — MODERATE (2 issues, transitive dependency)
```

**Recommendation:**
1. Run `npm audit fix` to address the rollup vulnerability immediately.
2. Evaluate replacing `xlsx` (0.18.5) with a maintained alternative. The `xlsx` package has known unfixed vulnerabilities and the community edition is no longer actively maintained. Consider `ExcelJS` or `SheetJS Pro`.

### 2.2 Excessive Console Statements in Production Code

**Count:** 385 `console.log/warn/error/debug` calls across 79 source files

While some console usage is acceptable (error logging in `observability.js`), 385 instances across the source is excessive for production. Key offenders:

| File | Count | Notes |
|------|-------|-------|
| `src/lib/db/fieldOps.js` | 24 | Database operations |
| `src/lib/drawRequestOps.js` | 23 | Draw request logic |
| `src/lib/db/financialOps.js` | 22 | Financial operations |
| `src/lib/corOps.js` | 22 | Change order operations |
| `src/lib/equipmentOps.js` | 16 | Equipment operations |
| `src/lib/db/companyOps.js` | 12 | Company operations |
| `src/components/TMForm.jsx` | 12 | Form component |
| `src/lib/db/projectOps.js` | 11 | Project operations |
| `src/lib/BrandingContext.jsx` | 10 | Context provider |
| `src/components/AppEntry.jsx` | 10 | App entry |

**Recommendation:** Replace direct `console.*` calls with the existing `observe` logging utility. The project already has `src/lib/observability.js` — route all logs through it so production builds can control verbosity. The CI pipeline already checks for `console.log` but apparently many have slipped through.

### 2.3 Dashboard Component Complexity

**File:** `src/components/Dashboard.jsx` — 1,925 lines
**State variables:** 28+ `useState` calls in the first 60 lines alone

This is the largest component and manages an enormous amount of UI state. While some state has been extracted to custom hooks (`usePortfolioMetrics`, `useProjectEdit`), the core component is still unwieldy.

**Recommendation:**
- Consolidate related state into `useReducer` (e.g., all COR state, all financial sidebar state, all modal states)
- Extract more state groups into dedicated hooks (e.g., `useFinancialsState`, `useCORState`)
- Consider a context provider for the Dashboard subtree to avoid deep prop drilling

### 2.4 Missing `node_modules` / Broken Test Runner

Tests fail with `vitest: not found` — `node_modules` appears to be absent or incomplete. The pre-commit hook and CI both depend on tests passing.

**Recommendation:** Run `npm install` to restore dependencies.

---

## 3. Medium-Priority Issues

### 3.1 No TypeScript — Runtime-Only Type Safety

The entire codebase is JavaScript (.js/.jsx) with no TypeScript, no PropTypes, and no JSDoc type annotations on components. Type safety relies entirely on runtime validation in `sanitize.js` and `client.js`.

**Impact:** Higher risk of type-related bugs in a 200+ file codebase, reduced IDE support, harder onboarding for new developers.

**Recommendation:** Consider incremental TypeScript migration starting with the `lib/` layer (business logic, calculations, DB operations) where type errors have the highest impact. Vite supports `.ts/.tsx` out of the box.

### 3.2 Limited Test Coverage

Only **9 test files** covering:
- Business logic calculations (COR, risk, earned value) ✓
- Security utilities (CSRF, sanitize) ✓
- Conflict detection ✓
- 1 component test (UniversalSearch hook) ✓

**Not tested:**
- Component rendering and interactions
- Database operation modules (7 modules, 6,461 lines)
- Auth flows
- Offline sync behavior
- Form validation flows
- Route protection / auth guards

**Recommendation:** Prioritize integration tests for:
1. Auth flows (login, session management, MFA)
2. Database operations (at least the happy-path CRUD for each module)
3. Offline queue / sync behavior
4. Critical business workflows (COR creation, T&M ticket flow)

### 3.3 CSRF Protection is Client-Side Only

`src/lib/csrf.js` implements CSRF token generation and the double-submit cookie pattern, but validation appears to happen only on the client. Since Supabase handles the backend, there's no custom server to validate CSRF tokens.

**Impact:** The CSRF module provides defense-in-depth but may give false confidence. Supabase's Row Level Security (RLS) and JWT auth are the actual protection layer.

**Recommendation:** Document that CSRF protection is supplementary. If custom Edge Functions are added, ensure they validate the CSRF token server-side.

### 3.4 Legacy `index.css` Still Present

**File:** `src/index.css` — a large legacy CSS file that coexists with the modern modular CSS architecture in `src/styles/`.

**Recommendation:** Continue migrating remaining styles to the modular `src/styles/` structure and remove `index.css` once complete.

### 3.5 `.env.production` and `.env.staging` Committed (Empty Values)

While the env files don't contain actual secrets (values are blank/placeholder), committing `.env.production` and `.env.staging` is a risk vector. Someone could accidentally commit real credentials.

**Recommendation:** Rename to `.env.production.example` and `.env.staging.example`, add the originals to `.gitignore`, and set real values only in the deployment platform (Vercel).

---

## 4. Low-Priority Issues

### 4.1 No PropTypes or Runtime Component Validation

No components use React PropTypes. Combined with no TypeScript, component interfaces are entirely implicit.

**Recommendation:** If TypeScript migration isn't feasible short-term, add PropTypes to key shared components in `src/components/ui/`.

### 4.2 Code Splitting Opportunities

`src/lib/corOps.js` (2,409 lines) and `src/lib/db/projectOps.js` (1,480 lines) are very large single-module files.

**Recommendation:** Consider splitting `corOps.js` into focused submodules (e.g., `corCrud.js`, `corWorkflow.js`, `corPdf.js`) for better tree-shaking and maintainability.

### 4.3 Service Worker Cache Versioning

`public/sw.js` uses manual cache versioning (`CACHE_NAME = 'fieldsync-v8'`). This requires manual bumps on each deploy.

**Recommendation:** Consider generating the cache version from the build hash or deploy timestamp via Vite.

### 4.4 Bundle Size Monitoring Threshold

CI warns at 500KB bundle size but doesn't fail. As features grow, this should be tightened.

---

## 5. Security Review

### 5.1 What's Done Well

| Area | Status | Notes |
|------|--------|-------|
| **No hardcoded secrets** | PASS | `.env` files use placeholders only |
| **No `eval()`** | PASS | Zero instances found in source |
| **No `dangerouslySetInnerHTML`** | PASS | Zero instances in source (only in dist/) |
| **Input sanitization** | PASS | Comprehensive `sanitize.js` with XSS/SQLi detection |
| **PostgREST filter escaping** | PASS | `escapePostgrestFilter()` prevents filter injection |
| **URL sanitization** | PASS | Blocks `javascript:`, `data:`, `vbscript:` protocols |
| **Filename sanitization** | PASS | Prevents path traversal and dangerous characters |
| **CSP headers** | PASS | Strict Content-Security-Policy in `vercel.json` |
| **HSTS** | PASS | 2-year max-age with includeSubDomains |
| **X-Frame-Options** | PASS | Set to DENY |
| **Permissions-Policy** | PASS | Camera/geolocation self-only, no microphone |
| **Service Worker security** | PASS | Skips non-GET, skips cross-origin Supabase calls |
| **Error boundaries** | PASS | `ErrorBoundary.jsx` exists for React error catching |
| **Object sanitization** | PASS | `sanitizeObject()` deep-cleans form data |

### 5.2 Areas to Harden

1. **Supabase anon key exposure:** The `supabaseAnonKey` is exported from `supabaseClient.js` (line 29). While Supabase anon keys are designed to be public, exporting it makes it available throughout the app. Ensure RLS policies are robust.

2. **localStorage for sensitive data:** `fieldSession.js` stores session data in localStorage which persists beyond browser sessions. Consider using sessionStorage for sensitive auth tokens.

3. **Service Worker `skipWaiting()`:** Called unconditionally on install. This could cause issues if a breaking change is deployed — users mid-session would get new code without a page reload. The `SW_UPDATED` message is sent but handling depends on the client.

4. **Membership operations lack server-side authorization:** Functions like `approveMembership`, `rejectMembership`, `removeMember`, `updateMemberAccessLevel` in `supabase.js` update `user_companies` without server-side verification that the caller is an admin. Authorization is enforced only in the React UI. Direct API calls could escalate privileges.

5. **MFA enforced only in React UI:** MFA challenge is checked at the component level in `App.jsx` but not at the RLS or API level. Direct Supabase API calls bypass MFA entirely. Consider adding `aal2` (Authenticator Assurance Level 2) checks in RLS policies for sensitive operations.

6. **Share token generation has modulo bias:** Token generation uses `chars[b % chars.length]` with 256 % 62 ≠ 0, creating non-uniform distribution. Combined with only 12 characters, tokens are more guessable than intended. Use rejection sampling or `crypto.getRandomValues()` with proper mapping.

7. **Offline data not cleaned on logout:** Sensitive construction data cached in IndexedDB (projects, tickets, daily reports) persists after logout. On shared devices, the next user could access cached data.

---

## 6. Architecture Assessment

### Strengths
- **Offline-first design** with IndexedDB + pending action queue is production-grade
- **Domain-driven DB layer** (7 focused modules) provides clean separation
- **Custom hooks** extract reusable patterns effectively
- **Lazy loading** of heavy components (Dashboard tabs, modals, PDF/XLSX)
- **Observability layer** provides structured logging foundation
- **Error handling** is thorough with categorization, retry logic, and user-friendly messages
- **CI/CD pipeline** has 5 validation stages including security audit

### Weaknesses
- **No TypeScript** limits compile-time safety in a 200+ file codebase
- **Dashboard god component** (1,925 lines) violates single responsibility
- **Test coverage gaps** — critical paths (auth, DB ops, offline sync) untested
- **Console logging** bypasses the observability layer in most files
- **Build artifacts in git** cause unnecessary repo bloat

---

## 7. Recommendations Priority Matrix

| Priority | Action | Effort | Impact |
|----------|--------|--------|--------|
| **P0** | Verify secure RLS migration applied to all environments | Low | Critical |
| **P0** | Fix PIN rate limiting — move server-side, remove bypass | Medium | Critical |
| **P0** | Remove `dist/` from git tracking | Low | High |
| **P0** | Run `npm audit fix` for rollup vulnerability | Low | High |
| **P1** | Add `sanitizeFormData()` to fieldOps, financialOps, companyOps, documentOps | Medium | High |
| **P1** | Add server-side authorization for membership operations | Medium | High |
| **P1** | Replace or sandbox `xlsx` dependency | Medium | High |
| **P1** | Replace console.* with observability layer | Medium | Medium |
| **P1** | Refactor Dashboard into smaller components | Medium | High |
| **P2** | Add `aal2` MFA enforcement at RLS level | Medium | High |
| **P2** | Clear IndexedDB/localStorage on logout | Low | Medium |
| **P2** | Fix share token modulo bias + increase length | Low | Medium |
| **P2** | Add integration tests for auth & DB ops | High | High |
| **P2** | Rename `.env.production` → `.env.production.example` | Low | Medium |
| **P2** | Begin TypeScript migration (lib/ layer first) | High | High |
| **P3** | Add PropTypes to shared UI components | Low | Low |
| **P3** | Split large utility files (corOps.js) | Medium | Medium |
| **P3** | Automate SW cache versioning | Low | Low |

---

## 8. Metrics Summary

| Metric | Value |
|--------|-------|
| Source files | 211 (JS/JSX + CSS) |
| Source code size | ~4.5 MB |
| React components | 100+ |
| Custom hooks | 10 |
| DB operation modules | 7 (6,461 lines total) |
| Test files | 9 |
| CSS files | 54 (modular) + 1 legacy |
| npm dependencies | 15 direct |
| Known vulnerabilities | 5 (3 high, 2 moderate) |
| Console statements | 385 across 79 files |
| Database migrations | 30 |
| CI/CD stages | 5 |
| Largest component | Dashboard.jsx (1,925 lines) |
| Largest utility | corOps.js (2,409 lines) |

---

## 9. Cross-Reference: Existing Security Audit

A detailed security-focused audit exists at `/SECURITY_AUDIT.md` (dated 2026-03-01) with **67 findings** (15 critical, 22 high, 21 medium, 9 low). Key findings from that report confirmed in this audit:

1. **AUTH-1:** Insecure `auth.uid() IS NULL` RLS policies — CONFIRMED, fix migration exists but old file remains
2. **AUTH-3:** PIN rate limiting bypassable — CONFIRMED
3. **INPUT-1:** Sanitization library coverage gaps — PARTIALLY CONFIRMED (used in 3 of 7 DB modules, not zero)
4. **API-2:** CSRF client-side only — CONFIRMED
5. **SYNC-1:** Offline data unencrypted — CONFIRMED
6. **DEP-1:** xlsx/jspdf vulnerabilities — CONFIRMED

Refer to `SECURITY_AUDIT.md` for the complete 67-finding breakdown with detailed remediation steps.
