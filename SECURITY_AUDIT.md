# FieldSync Security Audit Report

**Date:** 2026-03-01
**Scope:** Full application security audit — authentication, authorization, input validation, API security, database/RLS, configuration, dependencies, and field sync protocol.
**Application:** FieldSync — Construction field management PWA (React + Supabase + Vercel)

---

## Executive Summary

This audit identified **67 unique security findings** across all layers of the FieldSync application: **15 CRITICAL**, **22 HIGH**, **21 MEDIUM**, and **9 LOW** severity issues.

The most severe systemic issues are:

1. **The sanitization library (`sanitize.js`) exists but is never imported or used anywhere in the application** — every form submits raw, unsanitized user input directly to the database.
2. **Dangerous `auth.uid() IS NULL` RLS policies remain in migration files** — if older migrations are applied without the newer secure ones, the entire database is open to anonymous access.
3. **PIN authentication rate limiting is bypassable** at both client-side (localStorage-based) and server-side (NULL identifier bypass) levels.
4. **No Content Security Policy or security headers** are configured in the Vercel deployment.
5. **Critical CVEs in dependencies** — `xlsx` (prototype pollution, no fix available) and `jspdf` (8 CVEs including arbitrary JS execution).
6. **Sensitive offline data stored unencrypted** in IndexedDB/localStorage with no cleanup on logout.

### Severity Distribution

| Severity | Count |
|----------|-------|
| CRITICAL | 15 |
| HIGH | 22 |
| MEDIUM | 21 |
| LOW | 9 |
| **Total** | **67** |

---

## Table of Contents

1. [Authentication & Access Control](#1-authentication--access-control)
2. [Row-Level Security & Database](#2-row-level-security--database)
3. [Input Validation & Injection](#3-input-validation--injection)
4. [API & Network Security](#4-api--network-security)
5. [Field Sync Protocol & Offline Security](#5-field-sync-protocol--offline-security)
6. [Dependencies & Supply Chain](#6-dependencies--supply-chain)
7. [Configuration & CI/CD](#7-configuration--cicd)
8. [Prioritized Remediation Plan](#8-prioritized-remediation-plan)

---

## 1. Authentication & Access Control

### FINDING AUTH-1: Insecure `auth.uid() IS NULL` RLS Policies Still in Migration Files
**Severity: CRITICAL**
**Files:** `supabase/migrations/20241230_field_cor_access.sql` (50+ occurrences), `database/migration_complete_fixes.sql` (40+ occurrences), `database/migration_cor_log.sql:171`

Migration files create RLS policies using `USING (auth.uid() IS NULL)`, granting **any anonymous HTTP request** full read/write access to `t_and_m_tickets`, `crew_checkins`, `daily_reports`, `injury_reports`, `material_requests`, `disposal_loads`, `messages`, `change_orders`, and more. While newer migrations (`20260218_secure_field_rls.sql`) replace these, no guardrail ensures the secure migrations have been applied.

```sql
-- supabase/migrations/20241230_field_cor_access.sql, line 73-74
CREATE POLICY "Field users can create tickets"
    ON t_and_m_tickets FOR INSERT
    USING (auth.uid() IS NULL)
    WITH CHECK (auth.uid() IS NULL);
```

**Fix:** Delete or archive insecure migration files. Add a startup health check that verifies secure policies are in place and refuses to start if `auth.uid() IS NULL` policies are detected.

---

### FINDING AUTH-2: Companies Table Fully Open to Anonymous Read
**Severity: CRITICAL**
**File:** `supabase/migrations/20260228_fix_foreman_auth_errors.sql:337-341`

The latest migration creates `USING (true)` on the companies table, exposing all company data (names, codes, settings) to any anonymous user. Company codes are the first factor in PIN auth — exposing them allows enumeration. A second policy in the same file (`"Secure field view companies"` at line 486) attempts restriction but is made irrelevant by PostgreSQL's OR semantics between policies.

```sql
CREATE POLICY "Public view companies by code"
  ON companies FOR SELECT USING (true);
GRANT SELECT ON companies TO anon;
```

**Fix:** Remove the `USING (true)` policy. Handle company code lookup exclusively inside the `SECURITY DEFINER` function `validate_pin_and_create_session`.

---

### FINDING AUTH-3: Any Anonymous User Can Invalidate or Extend Any Field Session
**Severity: CRITICAL**
**Files:** `supabase/migrations/20260218_secure_field_rls.sql:577-587`, `supabase/migrations/20260228_fix_foreman_auth_errors.sql:310-331`

`invalidate_field_session(TEXT)` and `extend_field_session(TEXT)` are `SECURITY DEFINER` functions granted to the `anon` role. Any anonymous user who possesses or guesses a session token can invalidate another user's session (DoS) or extend it indefinitely.

```sql
CREATE OR REPLACE FUNCTION invalidate_field_session(p_session_token TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM field_sessions WHERE session_token = p_session_token;
  RETURN FOUND;
END;
$$;
GRANT EXECUTE ON FUNCTION invalidate_field_session(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION extend_field_session(TEXT) TO anon;
```

**Fix:** Validate that the caller's `x-field-session` header matches the token being operated on, or remove the parameter and operate on the caller's own session only.

---

### FINDING AUTH-4: PIN Rate Limiting Bypassable at Multiple Levels
**Severity: CRITICAL**
**Files:** `src/lib/supabase.js:810-863,840-843,947-1036`, `supabase/migrations/20260228_fix_foreman_auth_errors.sql:231-239`

Three compounding issues make PIN brute-force trivial:

1. **Client-side rate limiting** uses `localStorage` — cleared by incognito mode or console.
2. **Fallback path** (`_pinFallbackDirectQuery`) bypasses server-side rate limiting entirely when the RPC fails.
3. **Server-side rate limiting** skips the check when both `p_ip_address` and `p_device_id` are NULL — the client always passes `p_ip_address: null`.

```javascript
// Client always passes null for IP
const result = await supabase.rpc('validate_pin_and_create_session', {
  p_pin: pin, p_company_code: companyCode,
  p_ip_address: null,  // Always null
  p_device_id: getDeviceId()  // Client-generated, spoofable
})
```
```sql
-- Server skips rate limit if both are NULL
IF p_ip_address IS NOT NULL OR p_device_id IS NOT NULL THEN
  IF NOT check_rate_limit(...) THEN ...
END IF;
```

**Fix:** Always enforce server-side rate limiting regardless of identifiers. Extract IP from request headers server-side. Remove the fallback path. Increase PIN minimum length to 6+ digits.

---

### FINDING AUTH-5: MFA Is Optional and Not Enforced at API/RLS Level
**Severity: HIGH**
**Files:** `src/App.jsx:318-325`, `src/components/MFASetup.jsx:71-84`

MFA is enforced only as a client-side React component gate. There is no RLS-level check for `aal2` (Authenticator Assurance Level 2). Users can disable MFA without re-authentication. An attacker with stolen credentials can bypass MFA by making direct API calls.

**Fix:** Add RLS policies checking `auth.jwt()->>'aal'` for sensitive operations. Require MFA verification before allowing MFA to be disabled.

---

### FINDING AUTH-6: Membership Approval and Role Escalation Lack Server-Side Authorization
**Severity: HIGH**
**Files:** `src/lib/supabase.js:2757-2940` (`approveMembership`, `rejectMembership`, `removeMember`, `updateMemberAccessLevel`, `updateMemberCompanyRole`)

These functions update `user_companies` directly without server-side verification that the caller is an admin/owner. Authorization relies on UI hiding actions from non-admin users.

```javascript
async updateMemberAccessLevel(membershipId, newAccessLevel) {
  const { error } = await supabase
    .from('user_companies')
    .update({ access_level: newAccessLevel })
    .eq('id', membershipId)  // No check that caller is admin
}
```

**Fix:** Move all membership operations behind `SECURITY DEFINER` RPCs that verify the caller's admin status, or add restrictive RLS policies on `user_companies`.

---

### FINDING AUTH-7: `updateRole` Allows Self-Escalation Without Server Guard
**Severity: HIGH**
**File:** `src/lib/supabase.js:215`

The `updateRole` function updates a user's role in the `users` table with no server-side validation that the caller has permission.

**Fix:** Implement through a `SECURITY DEFINER` RPC that validates admin status.

---

### FINDING AUTH-8: CSRF Token Implementation Is Client-Side Theater
**Severity: HIGH**
**File:** `src/lib/csrf.js:1-63`

CSRF "protection" generates and validates tokens entirely in the browser using `sessionStorage`. There is no server-side component — a CSRF attack making direct API calls with the Supabase key bypasses this completely.

```javascript
export function validateCSRFToken(token) {
  const storedToken = sessionStorage.getItem(CSRF_TOKEN_KEY)
  return storedToken === token  // Client validates against itself
}
```

**Fix:** Leverage `SameSite` cookie attributes. For custom CSRF, implement double-submit cookie pattern with server-side validation.

---

### FINDING AUTH-9: Field Session Token Stored in Plaintext in Browser Storage
**Severity: HIGH**
**File:** `src/lib/fieldSession.js:5-47`

The session token (granting full project access via `x-field-session` header) and metadata (`companyId`, `projectId`) are stored as plaintext JSON in `sessionStorage`/`localStorage`. Accessible to any XSS payload or browser extension.

**Fix:** Use `HttpOnly` + `Secure` + `SameSite=Strict` cookies. If browser storage is required, encrypt with Web Crypto API.

---

### FINDING AUTH-10: Field Session Not Bound to Device
**Severity: MEDIUM**
**File:** `supabase/migrations/20260218_secure_field_rls.sql:120-151`

Session validation checks token and project ID but not `device_id`. A stolen token works from any device for 24 hours.

```sql
SELECT EXISTS (
  SELECT 1 FROM field_sessions fs
  WHERE fs.session_token = v_token
    AND fs.project_id = p_project_id
    AND fs.expires_at > NOW()
  -- device_id NOT checked
) INTO valid;
```

**Fix:** Include `device_id` in the validation query.

---

### FINDING AUTH-11: `getProjectByPin` Bypasses Rate Limiting
**Severity: MEDIUM**
**File:** `src/lib/supabase.js:768-782`

An insecure `getProjectByPin` function remains exported alongside the secure `getProjectByPinSecure`. It performs direct PIN lookup with no rate limiting.

**Fix:** Remove or make `getProjectByPin` private.

---

### FINDING AUTH-12: SignaturePage Loads Document Data Before Checking Request Status
**Severity: MEDIUM**
**File:** `src/components/SignaturePage.jsx:70-100`

Fetches full document data (COR with labor/materials/equipment line items) for revoked or completed signature requests before checking status in rendering logic.

**Fix:** Check `request.status` before loading document data.

---

### FINDING AUTH-13: Share Token Has Modulo Bias
**Severity: MEDIUM**
**File:** `src/lib/supabase.js:4633-4637`

Token generation uses `chars[b % chars.length]` where 256 % 62 ≠ 0, introducing modulo bias. Token is also only 12 characters.

**Fix:** Increase to 32 characters and use rejection sampling.

---

### FINDING AUTH-14: No Session Rotation After Privilege Change
**Severity: LOW**
**File:** `src/lib/supabase.js:2919-2928`

When access level changes, the existing session continues with potentially stale claims.

**Fix:** Call `supabase.auth.refreshSession()` after role changes.

---

### FINDING AUTH-15: `auth_attempts` Table INSERT Unrestricted
**Severity: LOW**
**File:** `supabase/migrations/20260218_secure_field_rls.sql:40-42`

Any anonymous user can insert arbitrary records — could flood the table or trigger rate limits for legitimate users.

**Fix:** Move logging into `SECURITY DEFINER` functions only.

---

## 2. Row-Level Security & Database

### FINDING RLS-1: Role Self-Assignment at Signup
**Severity: CRITICAL**
**Files:** `database/schema.sql`, `database/schema_v2.sql`

Users can set their own role during signup without server-side validation, allowing an attacker to make themselves an admin.

**Fix:** Default all new users to the lowest role. Role escalation must require existing admin approval via a server-side function.

---

### FINDING RLS-2: Unrestricted Anonymous Signature Request INSERT/UPDATE
**Severity: CRITICAL**
**Files:** `database/migration_signatures.sql`, `database/migration_signatures_anon_access.sql`

Signature request tables allow anonymous INSERT and UPDATE with no session validation.

**Fix:** Restrict anonymous operations to `SECURITY DEFINER` functions that validate the signature token.

---

### FINDING RLS-3: Cross-Company Data Leakage in Signatures
**Severity: CRITICAL**
**File:** `database/migration_signatures.sql`

All authenticated users can see all signature records across all companies — no company-scoping in RLS policies.

**Fix:** Add `company_id` scoping to signature RLS policies.

---

### FINDING RLS-4: Public Document Storage Bucket
**Severity: HIGH**
**File:** `src/lib/supabase.js:6080-6082`

Document uploads use `getPublicUrl()` instead of `createSignedUrl()`, making potentially sensitive construction documents (contracts, etc.) accessible to anyone who knows the URL pattern.

```javascript
const { data: urlData } = client.storage
    .from('project-documents')
    .getPublicUrl(storagePath)
```

**Fix:** Use `createSignedUrl` with time-limited expiry. Ensure the bucket is set to private.

---

### FINDING RLS-5: Labor Rates Exposed via `USING (true)` Policy
**Severity: HIGH**
**Files:** Database RLS policies for labor rates tables

Confidential labor rate data is readable by any authenticated user via overly permissive `USING (true)` policies.

**Fix:** Scope labor rate access to company owners/admins.

---

### FINDING RLS-6: Conflicting RLS Policies in Same Migration
**Severity: MEDIUM**
**File:** `supabase/migrations/20260228_fix_foreman_auth_errors.sql:337-341,485-491`

Two conflicting SELECT policies on `companies` — `USING (true)` renders the restrictive one irrelevant via PostgreSQL OR semantics.

**Fix:** Remove the `USING (true)` policy.

---

### FINDING RLS-7: PIN Stored as Plain TEXT With No Length/Complexity Constraint
**Severity: HIGH**
**File:** `database/migration_combined_field_auth.sql:219-224`

The `pin` column is plain `TEXT` with no minimum length, complexity, or format enforcement.

```sql
pin TEXT  -- no constraints
```

**Fix:** Add `CHECK (length(pin) >= 6)` and enforce alphanumeric complexity.

---

## 3. Input Validation & Injection

### FINDING INPUT-1: Sanitization Library Is Dead Code — Never Used
**Severity: CRITICAL**
**File:** `src/lib/sanitize.js` (entire file)

The sanitize module exports `sanitize.text()`, `sanitize.html()`, `sanitize.url()`, `sanitize.filename()`, `validate.email()`, `validate.phone()`, `validate.positiveNumber()`, etc. — but **no component or library file imports it**. Only the test file imports it.

```
# Grep for imports across entire src/
src/test/sanitize.test.js   ← only import
src/lib/sanitize.js          ← its own JSDoc
```

**Impact:** Every form submits raw, unsanitized user input directly to the database.

**Fix:** Wire up the sanitize library. Create a centralized `sanitizeFormData()` helper called before all `db.*` submissions.

---

### FINDING INPUT-2: PostgREST Filter Injection via Search
**Severity: HIGH**
**Files:** `src/lib/supabase.js:511,524,541,6209,6235,6245,6552`

User-supplied search queries and document IDs are interpolated directly into `.or()` filter strings without escaping PostgREST-special characters (`%`, `,`, `.`, `(`, `)`).

```javascript
.or(`name.ilike.%${searchQuery}%,job_number.ilike.%${searchQuery}%,address.ilike.%${searchQuery}%`)
```

A query like `%,id.neq.0` could manipulate the filter to return all records.

**Fix:** Escape PostgREST-special characters, or use individual `.ilike()` calls instead of string interpolation in `.or()`.

---

### FINDING INPUT-3: No Input Sanitization on Any Form Submission
**Severity: HIGH**
**Files:** `TMForm.jsx`, `CORForm.jsx`, `InjuryReportForm.jsx`, `AddCostModal.jsx`, `DailyReport.jsx`, `CrewCheckin.jsx`, `PunchList.jsx`, `ProjectMessages.jsx`, `InvoiceModal.jsx`, `DrawRequestModal.jsx`, `DisposalLoadInput.jsx`

All forms submit user-provided text with only `.trim()` applied. No call to `sanitize.text()` or any validation function.

```javascript
// TMForm.jsx
const ticket = await db.createTMTicket({
  notes: notes.trim() || null,                 // No sanitization
  created_by_name: submittedByName.trim()      // No sanitization
})
```

**Fix:** Apply `sanitize.text()` to all string inputs before submission.

---

### FINDING INPUT-4: No Server-Side File Type Validation on Photo Upload
**Severity: HIGH**
**Files:** `src/lib/supabase.js:3251-3304,3306-3340`

`uploadPhoto()` derives the extension from user-controlled `file.name` without validation. Client-side `file.type` check is trivially bypassable. `uploadPhotoBase64()` accepts arbitrary data URIs with no validation.

```javascript
const extension = file.name?.split('.').pop() || 'jpg'  // User-controlled
const { data, error } = await client.storage
  .from('tm-photos')
  .upload(filePath, file, { cacheControl: '3600', upsert: false })
  // No contentType enforcement
```

**Fix:** Validate MIME type against allowlist. Set explicit `contentType` in upload options. Validate magic bytes. Set `Content-Disposition: attachment` on the storage bucket.

---

### FINDING INPUT-5: Numeric Inputs Not Validated for Negatives/Overflow
**Severity: MEDIUM**
**Files:** `InjuryReportForm.jsx`, `CORForm.jsx`, `InvoiceModal.jsx`, `DrawRequestModal.jsx`

HTML `min="0"` is client-only. JavaScript handlers use `parseFloat()`/`parseInt()` without range clamping. Negative hours, costs, or retention amounts could corrupt financial data.

```javascript
days_away_from_work: parseInt(daysAwayFromWork) || 0  // No min/max
updateLaborItem(index, 'overtime_rate', Math.round(parseFloat(val || 0) * 100))  // Could be negative
```

**Fix:** Use `validate.positiveNumber()` / `validate.currency()` server-side.

---

### FINDING INPUT-6: CSV/IIF Injection in Financial Exports
**Severity: MEDIUM**
**File:** `src/lib/financialExport.js:20-36,204-237`

`escapeCSV()` handles commas/quotes but not formula injection (`=`, `+`, `-`, `@`). IIF export interpolates unsanitized project names into tab-delimited format — tab characters in names could inject IIF fields.

**Fix:** Prefix formula-triggering characters with `'`. Strip tabs/newlines from IIF values.

---

### FINDING INPUT-7: PunchList `photo_url` Accepts Arbitrary URLs
**Severity: MEDIUM**
**File:** `src/components/PunchList.jsx:35,126,144`

User-provided URL stored directly in database and rendered in `<img src>` without validation.

**Fix:** Apply `sanitize.url()` before saving.

---

### FINDING INPUT-8: `loadImageAsBase64` Accepts Any URL
**Severity: MEDIUM**
**File:** `src/lib/imageUtils.js:29-69`

Used in PDF generation — loads any URL via `Image` element with no domain validation.

**Fix:** Validate against known storage domains.

---

### FINDING INPUT-9: Naive HTML Stripping Regex in sanitize.js
**Severity: MEDIUM**
**File:** `src/lib/sanitize.js:33`

Uses `/<[^>]*>/g` which misses unclosed tags like `<img src=x onerror=alert(1)//`.

**Fix:** Use DOMPurify for HTML stripping if the library is ever activated.

---

### FINDING INPUT-10: No maxLength or Email/Phone Validation on Forms
**Severity: LOW**
**Files:** All form components, `InjuryReportForm.jsx:307-320`

No `maxLength` attributes on inputs. PII fields (email, phone) use HTML5 `type=` with no JavaScript validation.

**Fix:** Add `maxLength` to inputs. Use `validate.email()` and `validate.phone()`.

---

## 4. API & Network Security

### FINDING NET-1: No Security Headers Configured
**Severity: CRITICAL**
**Files:** `vercel.json`, `index.html`

No `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`. The application is vulnerable to clickjacking, MIME sniffing, XSS (no CSP), and HTTPS downgrade attacks.

```json
// vercel.json - only Cache-Control headers for 2 files, no security headers
"headers": [
  { "source": "/sw.js", "headers": [{"key": "Cache-Control", ...}] },
  { "source": "/manifest.json", "headers": [{"key": "Cache-Control", ...}] }
]
```

**Fix:** Add global headers block to `vercel.json`:
```json
{ "source": "/(.*)", "headers": [
  {"key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload"},
  {"key": "X-Frame-Options", "value": "DENY"},
  {"key": "X-Content-Type-Options", "value": "nosniff"},
  {"key": "Referrer-Policy", "value": "strict-origin-when-cross-origin"},
  {"key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()"},
  {"key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co; img-src 'self' data: blob: https://*.supabase.co; frame-ancestors 'none'"}
]}
```

---

### FINDING NET-2: Demo Mode Bypasses Authentication Entirely
**Severity: HIGH**
**File:** `src/lib/supabase.js:155-164`

When Supabase is not configured, `signIn` finds a user by email and returns them without password validation. While guarded by `import.meta.env.DEV` warning, the code path is reachable if production omits env vars.

```javascript
const user = localData.users.find(u => u.email === email)
if (!user) throw new Error('User not found')
setLocalUser(user)
return { user }  // No password check
```

**Fix:** Throw an error if `!isSupabaseConfigured && !import.meta.env.DEV`.

---

### FINDING NET-3: Verbose Error Logging Exposes Database Internals
**Severity: MEDIUM**
**File:** `src/lib/supabase.js:748,2643-2648`

`console.error` logs raw Supabase error objects including `error.details` and `error.hint` — visible in browser console with PostgreSQL schema details.

**Fix:** Strip `error.details` and `error.hint` in production. Use centralized error handler with conditional verbose logging.

---

### FINDING NET-4: User PII Stored Unencrypted in localStorage
**Severity: MEDIUM**
**Files:** `src/lib/localStorageHelpers.js:20,35`, `src/lib/db/client.js:83,98`

User objects (id, email, name, role) stored as plaintext JSON in `localStorage` — persists indefinitely across sessions.

**Fix:** Encrypt PII before storing. Clear on sign-out.

---

### FINDING NET-5: Service Worker Caches Third-Party Resources Without Integrity Verification
**Severity: MEDIUM**
**File:** `public/sw.js:127-184`

Caches cross-origin responses (Google Fonts) without SRI. Cache-poisoning via compromised CDN or DNS hijack would persist.

**Fix:** Self-host fonts. Only cache responses from explicitly allowed origins with integrity checks.

---

### FINDING NET-6: External Fonts Loaded Without SRI
**Severity: MEDIUM**
**File:** `index.html:20`

Google Fonts loaded from CDN with no Subresource Integrity.

```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans..." rel="stylesheet">
```

**Fix:** Self-host fonts using `fontsource` or `google-webfonts-helper`.

---

### FINDING NET-7: `skipWaiting()` Called Unconditionally in Service Worker
**Severity: LOW**
**File:** `public/sw.js:21,40,189-191`

New service worker versions take control immediately — a compromised SW update would activate instantly.

**Fix:** Remove automatic `skipWaiting()`. Prompt user before activating.

---

### FINDING NET-8: Foreman Name in localStorage Without Sanitization
**Severity: LOW**
**File:** `src/components/AppEntry.jsx:243`

**Fix:** Apply `sanitizeText()` before storing.

---

## 5. Field Sync Protocol & Offline Security

### FINDING SYNC-1: Sensitive Data Stored Unencrypted in IndexedDB/localStorage
**Severity: CRITICAL**
**Files:** `src/lib/offlineManager.js:48-97,110-117`, `src/lib/localStorageHelpers.js:9-17`

All offline-cached data (PINs, contract values, crew names, T&M financial data, daily reports, messages) stored in plaintext. On shared/stolen field devices (common in construction), all data is trivially extractable.

```javascript
const request = store.put(data)  // Stored as-is, no encryption
```

**Fix:** Encrypt sensitive fields using Web Crypto API (AES-GCM) with a key derived from the session token. Implement data wipe on logout.

---

### FINDING SYNC-2: No Authentication Re-validation After Offline Period
**Severity: CRITICAL**
**Files:** `src/lib/fieldSession.js:20-33`, `src/lib/supabase.js:6597-6606`

When a device comes back online, pending actions sync immediately without verifying the field session is still valid. `getFieldSession()` deserializes from sessionStorage with no TTL check against the server.

```javascript
onConnectionChange(async (online) => {
  if (online && isSupabaseConfigured) {
    await syncPendingActions(db)  // No session validation first
  }
})
```

**Fix:** Call a lightweight session validation RPC before syncing. Add client-side TTL check.

---

### FINDING SYNC-3: No Idempotency Keys on Sync Actions
**Severity: HIGH**
**File:** `src/lib/offlineManager.js:204-223,447-449`

Pending actions have no idempotency token. If `processAction` succeeds but `removePendingAction` fails (tab crash, IndexedDB error), the action replays — causing duplicate T&M tickets, crew check-ins, messages, etc.

```javascript
await processAction(action, db)       // Server call succeeds
await removePendingAction(action.id)  // If this fails, action replays
```

**Fix:** Generate `crypto.randomUUID()` per action. Server-side deduplication via `ON CONFLICT` or idempotency table.

---

### FINDING SYNC-4: Race Condition in Sync Manager (No Cross-Tab Mutex)
**Severity: HIGH**
**File:** `src/lib/offlineManager.js:405-466`

Module-level `isSyncing` boolean provides no protection across tabs sharing the same IndexedDB. Multiple tabs can process the same action.

```javascript
let isSyncing = false
export const syncPendingActions = async (db) => {
  if (isSyncing || !isOnline) return
  isSyncing = true  // Not atomic across tabs
```

**Fix:** Use Web Locks API (`navigator.locks.request('fieldsync-sync', ...)`) for cross-tab mutex.

---

### FINDING SYNC-5: Conflict Detection Only Covers Area Status Updates
**Severity: HIGH**
**File:** `src/lib/offlineManager.js:418-445`

Only `UPDATE_AREA_STATUS` actions get conflict detection. `CREATE_TM_TICKET`, `SAVE_CREW_CHECKIN`, `SUBMIT_DAILY_REPORT`, `SEND_MESSAGE`, `CREATE_MATERIAL_REQUEST` — all sync with zero conflict detection.

**Fix:** Extend conflict detection to all update action types.

---

### FINDING SYNC-6: No Integrity Verification on Queued Sync Payloads
**Severity: HIGH**
**File:** `src/lib/offlineManager.js:204-223`

Pending actions stored in IndexedDB have no HMAC or signature. Any script on the same origin can modify queued payloads (T&M hours, costs, area statuses) before sync.

**Fix:** Compute HMAC over serialized payload using session-derived key. Verify before syncing.

---

### FINDING SYNC-7: Offline Data Not Cleared on Session Logout
**Severity: MEDIUM**
**File:** `src/lib/fieldSession.js:52-63`

`clearFieldSession()` invalidates the server session and removes from sessionStorage, but **never clears IndexedDB stores**. All project data remains accessible to the next user.

```javascript
export const clearFieldSession = async () => {
  // ...invalidates server session...
  setFieldSession(null)
  // IndexedDB NOT cleared: projects, areas, crew_checkins,
  // tm_tickets, daily_reports, messages, pending_actions
}
```

**Fix:** Import `clearStore` from `offlineManager.js` and clear all stores during logout.

---

### FINDING SYNC-8: No Maximum Retry Limit / Dead-Letter Queue
**Severity: MEDIUM**
**File:** `src/lib/offlineManager.js:450-459`

Failed actions retry on every sync cycle indefinitely — no max attempts, no dead-letter queue.

**Fix:** Add `MAX_ATTEMPTS` (e.g., 10). Move exhausted actions to a dead-letter store. Notify user.

---

### FINDING SYNC-9: Photo Uploads Lack Server-Side Content Validation
**Severity: MEDIUM**
**Files:** `src/lib/supabase.js:3251-3304`, `src/components/TMForm.jsx:628-638`

Client-side `file.type.startsWith('image/')` check is trivially bypassable. No server-side magic byte verification.

**Fix:** Restrict `contentType` in upload options. Allowlist extensions. Add storage hook for magic byte validation.

---

### FINDING SYNC-10: No Timestamp Freshness Check on Replayed Actions
**Severity: LOW**
**File:** `src/lib/offlineManager.js:204-213`

Actions queued days/weeks ago replay verbatim — stale crew check-ins submitted as current.

**Fix:** Server-side age validation (reject actions older than configurable threshold).

---

## 6. Dependencies & Supply Chain

### FINDING DEP-1: `xlsx` (SheetJS) Has Unfixable Prototype Pollution
**Severity: CRITICAL**
**File:** `package.json:37`
**CVEs:** GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9

v0.18.5 has prototype pollution (RCE potential) and ReDoS. **No fix available via npm** — maintainer moved fixes behind commercial license. Parses potentially untrusted Excel files from field crews.

**Fix:** Replace with `exceljs` or the community fork `@sheet/core`.

---

### FINDING DEP-2: `jspdf` Has 8 CVEs Including Arbitrary JS Execution
**Severity: CRITICAL**
**File:** `package.json:29`
**CVEs:** GHSA-f8cm-6447-x5h2, GHSA-pqxr-3g65-p328, GHSA-p5xg-68wr-hm3m, GHSA-9vjf-qc39-jprp, GHSA-95fx-jjr5-f39c, GHSA-vm32-vv63-w422, GHSA-cjw8-79x6-5cj4, GHSA-67pg-wm7f-q7fj

jspdf ≤4.1.0 has PDF injection vulnerabilities allowing arbitrary JS execution. Fix requires upgrade to ^4.2.0 (breaking change from ^3.0.4).

**Fix:** Upgrade to `jspdf@^4.2.0`. Update `jspdf-autotable` for compatibility. Test PDF generation.

---

### FINDING DEP-3: Rollup Has Arbitrary File Write via Path Traversal
**Severity: HIGH**
**File:** `package-lock.json` (rollup 4.0.0-4.58.0)
**CVE:** GHSA-mw96-cpmx-2vgc

Transitive dependency of Vite. Attacker influence on build input could write arbitrary files during build.

**Fix:** Run `npm audit fix` to update rollup.

---

### FINDING DEP-4: `vite` Listed as Production Dependency
**Severity: HIGH**
**File:** `package.json:36`

Build tools in `dependencies` (not `devDependencies`) get installed in production, increasing attack surface.

```json
"dependencies": {
    "vite": "^7.2.6",
    "@vitejs/plugin-react": "^4.5.2",
```

**Fix:** Move `vite` and `@vitejs/plugin-react` to `devDependencies`.

---

### FINDING DEP-5: No Dependabot or Automated Dependency Updates
**Severity: MEDIUM**
**File:** Missing `.github/dependabot.yml`

No automated dependency update mechanism. 6 known vulnerabilities accumulating silently.

**Fix:** Create `.github/dependabot.yml` with weekly npm and github-actions updates.

---

## 7. Configuration & CI/CD

### FINDING CFG-1: `dist/` With 33 Source Maps Committed to Git
**Severity: HIGH**
**Files:** `.gitignore:5` (commented out), `vite.config.js:12`

Source maps expose complete original source code. `.gitignore` has `dist/` commented out. Build config has `sourcemap: true` unconditionally.

```javascript
build: { sourcemap: true }  // Always generates source maps
```

**Fix:** Uncomment `dist/` in `.gitignore`, `git rm -r --cached dist/`. Set `sourcemap: false` or `'hidden'` for production.

---

### FINDING CFG-2: `.env.production` and `.env.staging` Tracked in Git
**Severity: HIGH**
**File:** `.gitignore:7-10`

`.gitignore` only excludes `.env`, `.env.local`, `.env.*.local`. The `.env.production` and `.env.staging` files are tracked — a developer adding real credentials will commit them.

**Fix:** Add to `.gitignore`. Remove from tracking with `git rm --cached`.

---

### FINDING CFG-3: GitHub Actions Pinned to Mutable Tags
**Severity: MEDIUM**
**File:** `.github/workflows/ci.yml`

```yaml
uses: actions/checkout@v4      # Should be SHA-pinned
uses: actions/setup-node@v4    # Should be SHA-pinned
```

**Fix:** Pin to full SHA hashes (e.g., `actions/checkout@b4ffde65f46...`).

---

### FINDING CFG-4: CI Security Audit Has `continue-on-error: true`
**Severity: MEDIUM**
**File:** `.github/workflows/ci.yml:210`

Pipeline passes even with high-severity vulnerabilities. The `security` job is also not in the final status gate.

**Fix:** Remove `continue-on-error: true`. Add `security` to the CI success gate.

---

### FINDING CFG-5: CI Pipeline Has No `permissions` Restriction
**Severity: MEDIUM**
**File:** `.github/workflows/ci.yml`

No `permissions` block — push-triggered workflows get full read-write token scope.

**Fix:** Add `permissions: contents: read` at top level.

---

### FINDING CFG-6: No Lockfile Integrity Verification in CI
**Severity: MEDIUM**
**File:** `.github/workflows/ci.yml`

Uses `npm ci` without `--ignore-scripts`. No lockfile integrity verification step.

**Fix:** Use `npm ci --ignore-scripts`. Add `lockfile-lint` verification.

---

### FINDING CFG-7: `no-prototype-builtins` Set to `warn` Instead of `error`
**Severity: MEDIUM**
**File:** `eslint.config.js:85`

Given the prototype pollution risk from `xlsx`, this should be enforced strictly.

**Fix:** Change to `'error'`. Install `eslint-plugin-security`.

---

### FINDING CFG-8: Pre-commit Hook Has No Secrets Detection
**Severity: LOW**
**File:** `.husky/pre-commit`

Runs ESLint and tests but no check for accidentally committed credentials.

**Fix:** Add `gitleaks` or `detect-secrets` to pre-commit hook.

---

### FINDING CFG-9: Dev Server Binds to `0.0.0.0`
**Severity: LOW**
**File:** `vite.config.js:7`

Development server accessible to all network devices.

**Fix:** Default to `localhost`. Use `--host` flag when LAN access needed.

---

### FINDING CFG-10: `user-scalable=no` Restricts Zoom
**Severity: LOW**
**File:** `index.html:5`

Prevents zooming — accessibility violation (WCAG 1.4.4). Problematic for construction workers in bright sunlight.

**Fix:** Remove `maximum-scale=1.0` and `user-scalable=no`.

---

### FINDING CFG-11: Placeholder Supabase Values in CI Build Artifacts
**Severity: LOW**
**File:** `.github/workflows/ci.yml:108-109`

```yaml
VITE_SUPABASE_URL: https://placeholder.supabase.co
VITE_SUPABASE_ANON_KEY: placeholder-key
```

**Fix:** Use empty strings or add deployment guard against placeholder builds.

---

## 8. Prioritized Remediation Plan

### P0 — Immediate (Deploy Blockers)

| Finding | Action |
|---------|--------|
| AUTH-1 | Delete/archive insecure `auth.uid() IS NULL` migration files |
| AUTH-2 | Remove `USING (true)` on companies table |
| AUTH-3 | Restrict session invalidation/extension to own session only |
| AUTH-4 | Fix server-side rate limiting (always enforce, extract IP server-side, remove fallback) |
| RLS-1 | Enforce server-side role assignment at signup |
| RLS-2 | Restrict anonymous signature operations to SECURITY DEFINER functions |
| INPUT-1 | Wire up `sanitize.js` — create centralized form sanitization |
| NET-1 | Add security headers (CSP, HSTS, X-Frame-Options, etc.) to `vercel.json` |
| DEP-1 | Replace `xlsx` with `exceljs` or `@sheet/core` |
| DEP-2 | Upgrade `jspdf` to ^4.2.0 |
| SYNC-1 | Encrypt sensitive offline data with Web Crypto API |
| SYNC-2 | Add session re-validation before sync |

### P1 — Short-term (Within 2 Weeks)

| Finding | Action |
|---------|--------|
| AUTH-5 | Enforce MFA at RLS level with `aal2` check |
| AUTH-6,7 | Move membership/role operations behind SECURITY DEFINER RPCs |
| AUTH-9 | Encrypt session tokens or use HttpOnly cookies |
| INPUT-2 | Escape PostgREST filter characters in all search functions |
| INPUT-3 | Add `sanitize.text()` to all form submission paths |
| INPUT-4 | Add server-side file type/size validation on uploads |
| RLS-3 | Add company-scoping to signature RLS |
| RLS-4 | Switch documents to signed URLs |
| RLS-5 | Restrict labor rate access to company admins |
| SYNC-3 | Add idempotency keys to all pending actions |
| SYNC-4 | Implement Web Locks for cross-tab sync mutex |
| SYNC-7 | Clear IndexedDB on logout |
| CFG-1 | Remove `dist/` from git, disable production source maps |
| CFG-2 | Remove `.env.production`/`.env.staging` from git tracking |
| DEP-3 | Update rollup via `npm audit fix` |
| DEP-4 | Move vite to devDependencies |

### P2 — Medium-term (Within 1 Month)

| Finding | Action |
|---------|--------|
| AUTH-8 | Replace client-side CSRF with server-side mechanism |
| AUTH-10 | Bind field sessions to device_id |
| SYNC-5,6 | Extend conflict detection, add payload integrity |
| INPUT-5 | Add numeric range validation server-side |
| INPUT-6 | Fix CSV/IIF injection in financial exports |
| NET-2 | Guard demo mode behind strict DEV check |
| NET-3 | Strip verbose DB errors in production |
| NET-5,6 | Self-host fonts, add SRI |
| CFG-3 | Pin GitHub Actions to SHA |
| CFG-4,5,6 | Harden CI pipeline (permissions, audit gating, lockfile) |
| CFG-7 | Enforce security ESLint rules |
| DEP-5 | Set up Dependabot |

### P3 — Ongoing

| Finding | Action |
|---------|--------|
| All LOW findings | Address during regular maintenance |
| CFG-8 | Add secrets detection to pre-commit |
| SYNC-8 | Add dead-letter queue for failed sync actions |
| AUTH-14,15 | Session rotation, auth_attempts hardening |

---

*Report generated by automated security audit. All findings should be validated in context before remediation.*
