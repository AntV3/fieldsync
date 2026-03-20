# Launch Blocker Fix Plan

## Summary

6 focused tasks to resolve launch-blocking issues. Estimated ~200 lines of code changes.

---

## Task 1: Fix PIN Rate Limiting Bypass (CRITICAL)

**Problem:** The server-side `check_rate_limit()` SQL function uses `WHERE (ip_address = p_ip_address OR device_id = p_device_id)` — when both are NULL, SQL NULL comparisons return false, so the rate limit check matches zero rows and always passes. The client always sends `p_ip_address: null`, so rate limiting only works if `device_id` is set. Worse, `_pinFallbackDirectQuery()` bypasses server-side rate limiting entirely.

**Fix (client-side — `src/lib/db/projectOps.js`):**
- Ensure `getDeviceId()` is always called and passed (it already generates a UUID in localStorage — just verify it's never null)
- Remove the `_pinFallbackDirectQuery()` fallback path. If the RPC fails, return an error instead of silently falling back to an unprotected query
- This is safe because the `validate_pin_and_create_session` RPC is already deployed (it's in the migration path)

**Fix (SQL — new migration file `database/migration_fix_rate_limit_null.sql`):**
- Patch `check_rate_limit()` to deny access when BOTH identifiers are NULL (fail-closed)
- This is a safety net in case a client bug sends nulls

**Files changed:**
- `src/lib/db/projectOps.js` — Remove fallback, ensure deviceId is always passed
- `database/migration_fix_rate_limit_null.sql` — New file, ~15 lines

---

## Task 2: Sanitize Remaining Unsanitized Input Paths (HIGH)

**Problem:** The DB layer (`tmOps`, `fieldOps`, `projectOps`, etc.) properly uses `sanitizeFormData()` and `sanitize.text()` on all data going to Supabase. However, three components submit data without going through the sanitized DB layer:
- `FieldLogin.jsx` — foreman name stored in localStorage and passed to parent
- `AccountSettings.jsx` — full name sent directly via `supabase.from('users').update()`
- `BrandingSettings.jsx` — app name, colors, email fields via BrandingContext

**Fix:**
- Import `sanitize` from `../../lib/sanitize` in each component
- Sanitize text inputs before storing/submitting: `sanitize.text(foremanName)`, `sanitize.text(fullName)`, etc.
- Validate email fields with `validate.email()` where applicable

**Files changed:**
- `src/components/auth/FieldLogin.jsx` — ~3 lines added
- `src/components/AccountSettings.jsx` — ~5 lines added
- `src/components/BrandingSettings.jsx` — ~5 lines added

---

## Task 3: Fix npm Dependency Vulnerabilities (HIGH)

**Problem:** `npm audit` reports 7 vulnerabilities (1 critical, 4 high, 2 moderate). Most have fixes available via `npm audit fix`.

**Fix:**
- Run `npm audit fix` to auto-fix: jsPDF, flatted, ajv, dompurify, minimatch, rollup
- For `xlsx` (no fix available): replace with `SheetJS/sheetjs` community edition or add a comment documenting the accepted risk (xlsx is only used server-side for export, not for parsing untrusted input)
- Run tests after to confirm nothing breaks

**Files changed:**
- `package.json` / `package-lock.json` — version bumps

---

## Task 4: Prepare Consolidated Security Migration (CRITICAL — DB action needed)

**Problem:** The existing migration `supabase/migrations/20260218_secure_field_rls.sql` already removes the dangerous `auth.uid() IS NULL` policies, but it needs to be applied to the production database. I'll also create a single consolidated "pre-launch" migration that combines all outstanding security fixes.

**Fix:**
- Create `database/migration_prelaunch_security.sql` that:
  1. Fixes `check_rate_limit()` NULL handling (from Task 1)
  2. Documents which migrations must be applied and in what order
  3. Includes a verification query that checks all critical policies are correct
- Add clear instructions at the top of the file

**Files changed:**
- `database/migration_prelaunch_security.sql` — New file, ~50 lines

---

## Task 5: Add Lightweight Error Tracking (MEDIUM)

**Problem:** No crash reporting — if the app errors in production, you'll have no visibility.

**Fix:**
- Install a lightweight, free error tracking solution. Use the existing `errorHandler.js` as the integration point
- Add a `reportError()` function that sends errors to a configurable endpoint (Sentry DSN or custom webhook)
- Wire it into the existing `ErrorBoundary.jsx` component's `componentDidCatch`
- Keep it vendor-agnostic: default to `console.error` if no DSN is configured, so it doesn't block launch

**Files changed:**
- `src/lib/errorReporter.js` — New file, ~40 lines
- `src/lib/errorHandler.js` — ~5 lines to call `reportError()`
- `src/components/ErrorBoundary.jsx` — ~3 lines to report caught errors
- `.env.example` — Add `VITE_SENTRY_DSN` placeholder

---

## Task 6: Run Tests & Verify Build (VALIDATION)

**Fix:**
- Run `npm test` to confirm all 275+ tests still pass
- Run `npm run build` to confirm the production bundle builds
- Run `npm audit` to confirm vulnerability count is reduced
- Commit all changes with a clear message

**Files changed:** None (validation only)

---

## What This Does NOT Cover (requires manual Supabase action)

These items need you to run SQL in your Supabase dashboard — I'll prepare the scripts but can't execute them:

1. **Apply `20260218_secure_field_rls.sql`** — Removes all `auth.uid() IS NULL` RLS policies
2. **Apply `migration_launch_security.sql`** — Fixes photo bucket access
3. **Apply `migration_prelaunch_security.sql`** (Task 4) — Fixes rate limit NULL bypass
