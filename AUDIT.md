# FieldSync Codebase Audit Report

**Date:** 2026-02-08
**Scope:** Full codebase audit — security, code quality, dependencies, architecture

---

## Executive Summary

FieldSync is a construction progress tracking PWA (~155 source files, ~58k LOC) built with React 19, Vite 7, and Supabase. The codebase is functional and builds/tests cleanly (226 tests pass, 0 lint errors), but has **972 ESLint warnings**, **3 npm audit vulnerabilities** (1 high, 2 critical), and several security and code quality issues that should be addressed.

| Category | Critical | High | Medium | Low | Info |
|---|---|---|---|---|---|
| Security | 2 | 3 | 7 | 2 | 8 (positive) |
| Code Quality | — | 4 | 6 | 5 | — |
| Dependencies | 2 | 1 | — | — | — |
| Build/Tooling | — | — | 2 | 1 | — |

---

## 1. Security Findings

### CRITICAL

#### S1. Unsafe `fetch()` on user-supplied Base64 data
- **File:** `src/lib/supabase.js:3194-3204`
- **Issue:** `uploadPhotoBase64()` calls `fetch(base64Data)` directly on user-supplied input without validating the URI scheme. An attacker could pass a `data:` URL with arbitrary content, or potentially other protocol handlers.
- **Recommendation:** Validate that input starts with `data:image/` before fetching. Reject any other scheme.

#### S2. jsPDF critical vulnerabilities (5 CVEs)
- **File:** `package.json` — `jspdf@<=4.0.0`
- **CVEs:** GHSA-f8cm-6447-x5h2 (path traversal), GHSA-pqxr-3g65-p328 (PDF injection → arbitrary JS), GHSA-95fx-jjr5-f39c (DoS via BMP), GHSA-vm32-vv63-w422 (XMP metadata injection), GHSA-cjw8-79x6-5cj4 (race condition)
- **Recommendation:** Upgrade to `jspdf@4.1.0` (`npm audit fix --force`).

### HIGH

#### S3. Demo mode bypasses password validation
- **File:** `src/lib/supabase.js:190-192`
- **Issue:** In development mode, password validation is completely skipped. The guard relies solely on `import.meta.env.DEV`, which could be misconfigured in staging environments.
- **Recommendation:** Add an explicit `VITE_DEMO_MODE` flag and never skip password validation based on environment alone.

#### S4. Error details leaked to clients
- **File:** `src/lib/supabase.js:784, 893-894` and 139+ `console.error` calls throughout
- **Issue:** Raw Supabase error messages (including `error.details` and `error.hint`) are logged and sometimes returned to the UI. These can reveal database schema information.
- **Recommendation:** Return generic error messages to users. Log detailed errors server-side only.

#### S5. Weak random number generation for tokens
- **File:** `src/lib/supabase.js:966`
- **Issue:** Demo session tokens use `Math.random()` instead of `crypto.getRandomValues()`.
- **Recommendation:** Use `crypto.randomUUID()` or `crypto.getRandomValues()` for any security-relevant tokens.

### MEDIUM

#### S6. CSRF cookies lack `HttpOnly` flag
- **File:** `src/lib/csrf.js:154`
- **Issue:** CSRF tokens set as cookies without `HttpOnly` or `Secure` flags: `document.cookie = \`csrf_token=${token}; path=/; SameSite=Strict\``
- **Recommendation:** Add `Secure` flag. Note: `HttpOnly` cannot be set from JavaScript — consider server-side cookie setting.

#### S7. Client-side-only rate limiting for PIN brute force
- **File:** `src/lib/supabase.js:844-880`
- **Issue:** PIN lockout stored in `localStorage`, which can be cleared by the user.
- **Recommendation:** Rely on the server-side `validate_pin_and_create_session` RPC (already partially implemented at line 884) as the primary rate limiter.

#### S8. File extension not validated against whitelist
- **File:** `src/lib/supabase.js:3152, 3211`
- **Issue:** File extension extracted from user-supplied filename without allowlist validation: `const extension = file.name?.split('.').pop() || 'jpg'`
- **Recommendation:** Validate against an allowlist of image extensions (jpg, jpeg, png, gif, webp).

#### S9. Share/signature tokens exposed in URLs
- **Files:** `src/components/ShareModal.jsx:88`, `src/components/SignatureLinkGenerator.jsx:96`
- **Issue:** Tokens embedded in URL paths are exposed via browser history, referrer headers, and server logs.
- **Recommendation:** Use short-lived tokens with server-side validation. Consider POST-based token exchange.

#### S10. Session data in sessionStorage (XSS-readable)
- **File:** `src/lib/fieldSession.js:24, 42`
- **Issue:** Field session tokens stored in `sessionStorage`, readable by any JavaScript on the same origin.
- **Recommendation:** Accept this as a known trade-off for client-side SPAs, but ensure strong CSP headers to mitigate XSS.

#### S11. HTTP allowed in URL validation
- **File:** `src/lib/sanitize.js:101`
- **Issue:** URL validation accepts `http://` in addition to `https://`.
- **Recommendation:** Enforce HTTPS-only in production.

#### S12. `xlsx` has known vulnerabilities with no fix available
- **File:** `package.json` — `xlsx@0.18.5`
- **CVEs:** GHSA-4r6h-8v6p-xvw6 (prototype pollution), GHSA-5pgg-2g8v-p9x (ReDoS)
- **Recommendation:** Evaluate alternatives like `ExcelJS` or `SheetJS Pro`. If staying with `xlsx`, ensure untrusted spreadsheet data is never parsed.

### Positive Security Findings

- Supabase parameterized queries used throughout (no raw SQL)
- No `eval()`, `Function()`, or `dangerouslySetInnerHTML` usage
- Comprehensive `sanitize.js` module with XSS/SQL injection pattern detection
- `.env` files properly `.gitignore`'d
- Cross-tenant security enforced with `companyId` checks
- Error boundary implemented to prevent full app crashes
- CSRF protection module exists with token generation/validation
- Row-Level Security (RLS) enabled in database schema

---

## 2. Code Quality Findings

### HIGH

#### Q1. 972 ESLint warnings
- **Breakdown:** ~700 unused variables/imports, ~30 `react-hooks/exhaustive-deps` violations, ~11 auto-fixable `prefer-const`
- **Key files:**
  - `src/lib/supabase.js` — 22 warnings (unused imports, unused variables, `prefer-const`)
  - `src/App.jsx` — 24 warnings (most imports unused)
  - `src/components/AppEntry.jsx` — 5 unused error variables
- **Recommendation:** Run `npx eslint src/ --fix` for auto-fixable issues. Address unused imports and variables in a cleanup pass.

#### Q2. Oversized components
- **Files:**
  - `src/components/Dashboard.jsx` — 3,500+ LOC, 35+ `useState` calls
  - `src/components/TMForm.jsx` — 1,300+ LOC
  - `src/components/cor/CORForm.jsx` — 40+ `useState` calls
  - `src/components/SignaturePage.jsx` — 1,300+ LOC
  - `src/lib/supabase.js` — 3,600+ LOC (monolithic database facade)
- **Recommendation:** Extract sub-components and custom hooks. Split `supabase.js` into domain-specific modules.

#### Q3. Swallowed errors
- **Files:**
  - `src/lib/corExportPipeline.js:603` — `.catch(() => {})` silently ignores failures
  - `src/components/AppEntry.jsx:117-118` — Empty catch in fallback PIN validation
- **Recommendation:** At minimum, log errors. Ideally, surface them to the user or a monitoring service.

#### Q4. Race conditions in async state updates
- **Files:**
  - `src/components/ForemanMetrics.jsx:51-66` — Sequential async loop without mounted check
  - `src/components/Dashboard.jsx:109-136` — Complex debounced refresh with multiple pending refs
- **Recommendation:** Add `AbortController` or mounted-ref checks to prevent state updates on unmounted components.

### MEDIUM

#### Q5. 90+ console.log/warn/error statements in production code
- Throughout `src/lib/supabase.js`, `src/App.jsx`, `src/components/`
- **Recommendation:** Replace with structured logging via the existing `observability.js` module. Use build-time log stripping for production.

#### Q6. Magic numbers throughout the codebase
- **Examples:**
  - `src/main.jsx:19` — `300000` (5 min SW interval)
  - `src/components/Toast.jsx:5` — `3000` ms duration
  - `src/components/Dashboard.jsx:123` — `150` ms debounce
  - `src/lib/corCalculations.js:100-102` — `1500` and `5000` (markup thresholds)
  - `src/lib/supabase.js:93` — `10000000` ($10M limit)
- **Recommendation:** Extract to named constants in `src/lib/constants.js`.

#### Q7. Duplicated patterns across components
- Click-outside handlers duplicated in 5+ components (BillingCenter, CORList, etc.)
- Debounce logic reimplemented in Dashboard, ForemanView, UniversalSearch
- Status display configs repeated across CORList, BillingCenter, constants.js
- **Recommendation:** Create shared hooks: `useClickOutside`, `useDebounce`. Centralize status configs.

#### Q8. Missing null/undefined guards
- `src/components/ForemanView.jsx:64` — `project.id` without null check
- `src/components/Setup.jsx:64` — `array[0]` without bounds check
- `src/components/CrewCheckin.jsx:56` — Direct array access `data.classes[0]`
- **Recommendation:** Add defensive checks or use optional chaining consistently.

#### Q9. `react-hooks/exhaustive-deps` violations (~30 instances)
- Missing dependencies in `useEffect`/`useCallback` across DailyReport, DailyReportsList, BrandingSettings, Dashboard, and others
- **Recommendation:** Fix dependency arrays or document intentional omissions with `// eslint-disable-next-line`.

#### Q10. No TypeScript
- Entire codebase is JavaScript (`.js`/`.jsx`) with minimal JSDoc annotations
- **Recommendation:** Consider incremental TypeScript adoption starting with `lib/` modules. At minimum, add JSDoc type annotations to public APIs.

### LOW

#### Q11. Unused code in `src/lib/supabase.js`
- Lines 11-18: Imported but unused: `getCachedCrewCheckin`, `getCachedTMTickets`, `getCachedMessages`
- Lines 69, 90, 96, 101: Defined but unused: `withRetry`, `validateAmount`, `validateTextLength`, `sanitizeText`
- **Recommendation:** Remove dead imports and unused functions.

#### Q12. Hardcoded PDF colors
- `src/lib/corPdfGenerator.js` — 14+ hardcoded RGB values
- `src/lib/fieldDocumentExport.js` — 3+ hardcoded RGB values
- **Recommendation:** Extract to a PDF color palette constant.

#### Q13. `pendingMetrics` in observability.js assigned but never used (line 35)

#### Q14. Service worker interval never cleaned up (`src/main.jsx:19`)

#### Q15. Inconsistent naming: mix of `loading`/`isLoading`, `load*`/`fetch*` prefixes

---

## 3. Dependency Audit

### npm audit results

| Package | Severity | Issue | Fix Available |
|---|---|---|---|
| `jspdf@<=4.0.0` | **Critical** | 5 CVEs (path traversal, PDF injection, DoS, XMP injection, race condition) | Yes → `4.1.0` |
| `jspdf-autotable@2.0.9-5.0.2` | **Critical** | Depends on vulnerable jspdf | Yes (via jspdf upgrade) |
| `xlsx@0.18.5` | **High** | Prototype pollution, ReDoS | **No fix available** |

### Dependency health

- All other dependencies are on current major versions (React 19, Vite 7, Supabase 2.86)
- No obviously EOL or abandoned packages detected
- DevDependencies are current (ESLint 9+, Vitest 4+)

---

## 4. Build & Tooling

### Build output (production)
- Build succeeds in ~17s
- **2 oversized chunks** (>500 kB after minification):
  - `index-*.js` — **873 kB** (241 kB gzipped) — main application bundle
  - `xlsx-*.js` — **429 kB** (143 kB gzipped) — Excel library
  - `pdf-*.js` — **417 kB** (136 kB gzipped) — PDF library
- **Recommendation:** The main bundle at 873 kB is large. Consider further code-splitting Dashboard (241 kB chunk) and lazy-loading more routes.

### Test suite
- **7 test files, 226 tests — all passing**
- Test duration: ~6s
- Coverage: V8 provider configured but not run in this audit
- **Gap:** No test files for core components (Dashboard, ForemanView, AppEntry, Setup) or for `supabase.js` (the largest file)

### Linting
- **0 errors, 972 warnings**
- 11 warnings auto-fixable with `--fix`
- Most warnings are unused variables/imports — suggests code was refactored but imports weren't cleaned up

### CI/CD
- GitHub Actions workflow exists (`.github/workflows/ci.yml`)
- Husky pre-commit hook configured for lint + test

---

## 5. Architecture Observations

### Strengths
1. Clean separation: components / lib / hooks / styles
2. Effective code-splitting with `React.lazy()` for heavy views
3. Offline-first design with IndexedDB + sync queue
4. PWA support with service worker and manifest
5. Comprehensive CSS custom property system for theming
6. Good domain modeling in `lib/` modules

### Concerns
1. **`supabase.js` is a 3,600+ line monolith** — it handles auth, CRUD for every entity, file uploads, subscriptions, and more. This is the single biggest maintenance risk.
2. **Dashboard.jsx at 3,500+ lines with 35+ useState** — this component does too much and is difficult to test.
3. **No state management library** — complex state is managed via prop drilling and context. As the app grows, this will become harder to maintain.
4. **Test coverage gaps** — only utility/calculation modules are tested. Core UI flows and the database layer have no tests.

---

## 6. Prioritized Recommendations

### Immediate (security)
1. Upgrade `jspdf` to `4.1.0` to fix 5 CVEs
2. Validate base64 URI scheme in `uploadPhotoBase64()`
3. Add file extension allowlist for uploads
4. Evaluate `xlsx` alternatives due to unfixed vulnerabilities

### Short-term (quality)
5. Run `eslint --fix` and clean up unused imports/variables (targets ~700 of 972 warnings)
6. Fix swallowed errors in `corExportPipeline.js` and `AppEntry.jsx`
7. Extract magic numbers to constants
8. Add `HttpOnly`-equivalent protections (CSP headers, strict cookie flags)

### Medium-term (maintainability)
9. Split `supabase.js` into domain modules (`auth.js`, `projects.js`, `tickets.js`, etc.)
10. Refactor Dashboard with custom hooks and sub-components
11. Create shared hooks: `useClickOutside`, `useDebounce`, `useAsync`
12. Fix `react-hooks/exhaustive-deps` warnings
13. Add tests for critical UI flows and the database layer

### Long-term (architecture)
14. Consider TypeScript migration starting with `lib/` modules
15. Implement structured logging to replace console statements
16. Add state management (Zustand, Jotai) to reduce prop drilling
17. Further code-split the 873 kB main bundle
