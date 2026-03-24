# FieldSync Security Vulnerability Audit

**Date:** 2026-03-23
**Scope:** Full application — authentication, database/RLS, frontend, data handling
**Codebase:** React 19 + Supabase (PostgreSQL) construction field management PWA

---

## Executive Summary

**62 vulnerabilities** identified across 4 audit domains:

| Severity | Count | Description |
|----------|-------|-------------|
| **CRITICAL** | 6 | Authentication bypass, public storage bucket, open RLS policies |
| **HIGH** | 12 | MFA bypass, privilege escalation, cross-tenant data leakage |
| **MEDIUM** | 14 | IDOR, session issues, missing authorization, info disclosure |
| **LOW** | 10 | Weak validation, minor leakage, incomplete escaping |

The most dangerous findings: demo mode auth bypass in production (V-A01), public document storage bucket (V-D01), `USING(true)` RLS policies (V-D02), and role injection via signup metadata (V-D05).

---

## CRITICAL Vulnerabilities

### V-A01: Demo Mode Bypasses All Authentication
- **File:** `src/lib/supabase.js:90-104`
- **Severity:** CRITICAL
- **Description:** When `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are not set, `auth.signIn()` skips password validation entirely. Any email in localStorage grants access. The `import.meta.env.DEV` guard only controls a console warning — it does not prevent execution in production.
- **Impact:** If a production deployment fails to set environment variables, the app falls into localStorage-based auth where any known email logs in without a password.
- **Remediation:** Add a hard block (throw error or render error page) when Supabase is not configured. Never allow fallback auth in production builds.

### V-A02: Client-Side-Only PIN Rate Limiting Is Trivially Bypassable
- **File:** `src/lib/db/projectOps.js:585-602, 634-645, 726-762`
- **Severity:** CRITICAL
- **Description:** PIN brute-force rate limiting is implemented via `localStorage`. Clear localStorage, use incognito, or call the API directly to bypass. The PIN keyspace is only 4 digits (10,000 combinations). When the server-side RPC (`validate_pin_and_create_session`) fails, the system falls back to `_pinFallbackDirectQuery` which sends the PIN as a plaintext Supabase filter: `.eq('pin', pin.trim())`.
- **Impact:** Full project access via trivial brute-force.
- **Remediation:** Remove the direct-query fallback entirely. Enforce rate limiting server-side only. Increase PIN length to 6+ digits.

### V-A03: Client-Side Role Assignment Without Server Validation
- **File:** `src/components/auth/RegisterCompany.jsx:100-161`
- **Severity:** CRITICAL
- **Description:** When the `register_company` RPC fails, the client directly inserts into `companies`, `users`, and `user_companies` tables with `role: 'admin'` and `access_level: 'administrator'`. If RLS is not perfectly configured, any user can set their own role.
- **Impact:** Privilege escalation to administrator of any newly created or existing company.
- **Remediation:** Remove client-side fallback. Company registration must only go through server-side RPC with proper validation.

### V-D01: Public Storage Bucket Exposes All Project Documents
- **File:** `database/fix_documents_rls.sql:256-258, 289-292`, `database/FIX_DOCUMENT_UPLOAD_RLS.sql:295-297`
- **Severity:** CRITICAL
- **Description:** The `project-documents` storage bucket is created with `public = true`, and the storage SELECT policy grants access `TO public` with `USING (bucket_id = 'project-documents')`. Any unauthenticated user can read any file if they know the storage path.
- **Impact:** Confidential project documents (contracts, blueprints, financials) accessible to anyone on the internet who guesses the path pattern `{company_id}/{project_id}/documents/{filename}`.
- **Remediation:** Set `public = false`. Use signed URLs with short expiry for all document access. Enforce per-user/per-company RLS on storage.

### V-D02: `USING(true)` RLS Policies Allow Unrestricted Access
- **Files:** `database/schema.sql:37-38`, `database/add_pin.sql:20,33,37`, `database/migration_labor_classes.sql:89,114,139`, `database/migration_photo_reliability.sql:161-209`, `database/migration_documents.sql:348`
- **Severity:** CRITICAL
- **Description:** Multiple migration files create RLS policies with `USING (true)` or `WITH CHECK (true)`, meaning any role (including `anon`) can read/write rows. While some may be superseded by later migrations, migration ordering is not enforced.
- **Impact:** Complete bypass of tenant isolation if any of these policies remain active.
- **Remediation:** Audit live database for any `USING(true)` policies. Drop and replace with company/project-scoped policies. Add migration ordering enforcement.

### V-D03: Full GRANT to Anon on `field_sessions` Table
- **File:** `database/migration_combined_field_auth.sql:99`
- **Severity:** CRITICAL
- **Description:** `GRANT SELECT, INSERT, UPDATE, DELETE ON field_sessions TO anon`. The RLS policy (`USING (false)`) denies direct access, but if the policy is ever dropped, anon has full control over all sessions.
- **Impact:** Session forgery, hijacking, or mass deletion (DoS for all field workers) if RLS policy is removed.
- **Remediation:** Revoke DELETE and UPDATE grants from anon. Only grant the minimum needed (INSERT via SECURITY DEFINER functions).

---

## HIGH Vulnerabilities

### V-A04: Weak PIN Keyspace (4 Digits Only)
- **File:** `src/components/auth/FieldLogin.jsx:63`
- **Severity:** HIGH
- **Description:** Project PINs are exactly 4 digits (10,000 combinations). Even with server-side rate limiting, distributed attacks can enumerate the full space.
- **Remediation:** Increase to 6+ digit PINs. Add account lockout after N failures.

### V-A05: MFA Bypass — Full Auth State Set Before MFA Challenge
- **File:** `src/hooks/useAuthState.js:167-193`
- **Severity:** HIGH
- **Description:** `handleOfficeLogin` calls `loadUserAndCompany(data.user.id)` which sets `user`, `company`, and `authReady` before checking MFA at line 186. A race condition with `onAuthStateChange` (line 235) could navigate to `/dashboard` before MFA completes.
- **Remediation:** Do not set auth state until MFA is verified. Check MFA status before loading user data.

### V-A06: Field Session Token in sessionStorage Without Integrity Protection
- **File:** `src/lib/fieldSession.js:39-46`
- **Severity:** HIGH
- **Description:** Session data (token, projectId, companyId) stored as plain JSON. No HMAC or signature to detect tampering.
- **Remediation:** Add server-side token-to-project binding. Do not trust client-side projectId/companyId.

### V-A07: Unauthenticated Company Data Exposure via `getCompanyByCode`
- **File:** `src/lib/db/companyOps.js:15-21`
- **Severity:** HIGH
- **Description:** Queries `companies` table with `select('*')` using the anonymous key. Exposes all company fields including `office_code` and `owner_user_id`.
- **Remediation:** Use `select('id, name')` — return only fields needed for the login flow. Lock down RLS for anon SELECT.

### V-A08: Invitation Token Not Scoped to User
- **File:** `src/components/auth/AcceptInvite.jsx:53-69`
- **Severity:** HIGH
- **Description:** Any authenticated user who obtains an invitation URL can accept it, regardless of whether the invite was addressed to them.
- **Remediation:** Server-side email matching — only the invited email can accept.

### V-D04: Anon DELETE on `punch_list_items`
- **File:** `database/fix_punch_list_field_access.sql:26-43`
- **Severity:** HIGH
- **Description:** Any field worker with a valid session can delete any punch list item in the project, including those created by other users.
- **Remediation:** Restrict DELETE to item creator or admin role.

### V-D05: `handle_new_user()` Accepts Arbitrary Role from Signup Metadata
- **File:** `database/schema_v2.sql:38-50`
- **Severity:** HIGH
- **Description:** The trigger reads `raw_user_meta_data->>'role'` from the signup payload and stores it in `profiles`. Users control their own metadata during signup.
- **Impact:** Attacker signs up with `{ role: 'admin' }` to get elevated access.
- **Remediation:** Ignore user-supplied role. Default to 'member' and require admin action to elevate.

### V-D06: `office_only` Document Visibility Check Is Ineffective
- **File:** `database/fix_documents_rls.sql:105-110`
- **Severity:** HIGH
- **Description:** The check allows access when `access_level IN ('member', 'administrator') OR access_level IS NULL`. This is equivalent to `true` — all company members see "office only" documents.
- **Remediation:** Change to `access_level = 'administrator'` or add a proper `user_type` column.

### V-D07: `auth_attempts` Table Allows Unrestricted Anonymous Inserts
- **File:** `database/migration_security_hardening.sql:39-42,50`
- **Severity:** HIGH
- **Description:** `WITH CHECK (true)` + `GRANT INSERT TO anon`. An attacker can flood with fake failure records for a target IP, causing DoS by triggering rate limits for legitimate users.
- **Remediation:** Only allow inserts via SECURITY DEFINER functions. Remove direct anon INSERT.

### V-D08: Cross-Tenant Signature Leakage
- **File:** `database/migration_signatures_anon_access.sql:48-51`
- **Severity:** HIGH
- **Description:** `USING (true)` for authenticated SELECT on `signatures`. Any authenticated user can read all signatures across all companies.
- **Remediation:** Scope to company: `USING (company_id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid()))`.

### V-D09: `get_labor_classes_for_field` Bypasses RLS for Any Company
- **File:** `database/migration_security_hardening.sql:126-148`
- **Severity:** HIGH
- **Description:** `SECURITY DEFINER` function callable by `anon` accepts any `company_id` with no session validation.
- **Remediation:** Require valid field session token and verify company matches.

### V-F01: Sensitive PII in Injury Reports Without Field-Level Access Controls
- **File:** `src/components/InjuryReportForm.jsx:21-57, 124-174`
- **Severity:** HIGH
- **Description:** Collects employee home address, medical facility details, hospitalization status, workers' comp claims — all sent as plaintext to the database. Any project member (including PIN-only field workers) can query this data.
- **Remediation:** Add field-level encryption for PII. Restrict query access to administrators only.

---

## MEDIUM Vulnerabilities

### V-A09: CSRF Protection Is Client-Side Only
- **File:** `src/lib/csrf.js:38-64, 79-83`
- **Description:** CSRF tokens are generated and validated entirely client-side. No server-side validation exists.

### V-A10: No Password Complexity Beyond 6-Char Minimum
- **Files:** `src/components/auth/AcceptInvite.jsx:75`, `JoinCompany.jsx:93`, `RegisterCompany.jsx:29`
- **Description:** Minimum 6 characters, no complexity requirements. "123456" passes.

### V-A11: Sensitive Data Logged to Console in Production
- **Files:** `src/components/auth/FieldLogin.jsx:88`, `src/lib/db/projectOps.js:617`
- **Description:** Error details from auth and PIN validation logged via `console.error`, exposing RPC names and architecture.

### V-A12: No Authorization Check on Company Switching
- **File:** `src/hooks/useAuthState.js:247-265`
- **Description:** `handleSwitchCompany` accepts any `companyId` without verifying membership.

### V-A13: Signature Page Exposes Full Document Data Without Auth
- **File:** `src/components/SignaturePage.jsx:50-143`
- **Description:** `/sign/:token` is fully public. Anyone with a token sees complete COR/TM data including financials.

### V-D10: `save_cor_snapshot` Has No Company Authorization Check
- **File:** `database/migration_audit_hardening.sql:77-123`
- **Description:** SECURITY DEFINER function accepts any COR ID without verifying caller belongs to the COR's company.

### V-D11: IDOR in `deleteDisposalLoad` and `updateDisposalLoad`
- **File:** `src/lib/db/fieldOps.js:131-176`
- **Description:** Delete/update by ID alone with no project_id filter. Cross-project modification possible if RLS is weak.

### V-D12: Non-Atomic COR Snapshot Save
- **File:** `src/lib/db/financialOps.js:204-256`
- **Description:** Three separate DB operations without a transaction. Partial failure leaves inconsistent state.

### V-D13: `updateLaborClass` Has No Input Sanitization or Field Allowlist
- **File:** `src/lib/db/laborOps.js:291-303`
- **Description:** Passes raw `updates` object to `.update()`. Could overwrite `company_id` or other protected fields.

### V-F02: Document Download URLs Use Public Paths Instead of Signed URLs
- **File:** `src/components/documents/DocumentDetail.jsx:66`
- **Description:** Constructs `/storage/v1/object/public/project-documents/${storage_path}`. No access control on downloads. Potential path traversal.

### V-F03: Client-Side Authorization Checks Can Be Bypassed
- **Files:** `src/components/documents/DocumentsTab.jsx:71`, `src/components/cor/CORDetail.jsx:126-128`
- **Description:** Admin actions gated by client-side `userRole` checks. Bypassable via React DevTools.

### V-F04: T&M Draft Data Persists Indefinitely in localStorage
- **File:** `src/components/TMForm.jsx:23, 124-153`
- **Description:** Worker names, hours, and notes cached without expiry. Accessible on shared devices.

### V-F05: IndexedDB Offline Storage Contains Full Business Data Unencrypted
- **File:** `src/lib/offlineManager.js:12-20, 62-116`
- **Description:** Complete project data, crew checkins, T&M tickets, daily reports stored in plaintext IndexedDB.

### V-F06: Field Session Token Replay — No Client-Side Expiration Check
- **File:** `src/lib/fieldSession.js:20-46, 75-100`
- **Description:** Token attached to all requests with no expiration check. `extend_field_session` can be called by anyone with the token to keep it alive indefinitely.

---

## LOW Vulnerabilities

### V-A14: Foreman Name in localStorage Without Validation or Expiry
- **File:** `src/components/auth/FieldLogin.jsx:17-19, 110`

### V-A15: Password Hash Placeholder in Users Table
- **Files:** `AcceptInvite.jsx:117`, `JoinCompany.jsx:174`, `RegisterCompany.jsx:128`

### V-A16: Signature Links Allow "No Expiration" Option
- **File:** `src/components/SignatureLinkGenerator.jsx:36-42`

### V-A17: `updateRole` Has No Authorization Check
- **File:** `src/lib/supabase.js:150-172`

### V-D14: Incomplete PostgREST Filter Escaping
- **File:** `src/lib/db/client.js:154-165`

### V-D15: Missing `search_path` on SECURITY DEFINER Functions
- **Files:** `database/migration_security_hardening.sql`, `migration_combined_field_auth.sql`

### V-D16: `cost_per_unit` Exposed to Field Users in `getTMTicketsByStatus`
- **File:** `src/lib/db/tmOps.js:180-201`

### V-D17: Activity Log Has No Company/Tenant Isolation
- **File:** `database/schema_v2.sql:134-163`

### V-D18: Rate Limiting OR Logic Allows Bypass with Rotating IP+Device
- **File:** `database/migration_security_hardening.sql:54-70`

### V-D19: Client-Side `deviceId` Is Trivially Forgeable
- **File:** `src/lib/db/client.js:109-117`

---

## Positive Findings

The following security measures are properly implemented:

- No `dangerouslySetInnerHTML` or `innerHTML` usage anywhere
- No `eval()` or `new Function()` calls
- No hardcoded API keys or secrets in source code
- React JSX escaping prevents most XSS vectors
- Supabase parameterized queries prevent SQL injection
- HTTPS enforced with HSTS (2-year preload)
- Strong CSP headers configured in Vercel
- X-Frame-Options: DENY prevents clickjacking
- Image compression reduces upload surface area
- Signed URLs used for photo access (1-hour expiry)
- `crypto.getRandomValues()` used for token generation

---

## Priority Remediation Roadmap

### Immediate (Week 1)
1. **V-A01:** Block demo mode auth in production builds
2. **V-D01:** Make `project-documents` bucket private; use signed URLs
3. **V-D02:** Audit live DB for `USING(true)` policies; replace all
4. **V-D05:** Ignore user-supplied role in `handle_new_user()` trigger
5. **V-A02:** Remove PIN fallback direct query; enforce server-side rate limiting

### Short-Term (Weeks 2-3)
6. **V-A03:** Remove client-side role assignment fallback
7. **V-D08:** Scope signature SELECT to company
8. **V-D07:** Move auth_attempts INSERT behind SECURITY DEFINER
9. **V-A05:** Fix MFA bypass race condition
10. **V-A07:** Restrict `getCompanyByCode` SELECT columns

### Medium-Term (Weeks 4-6)
11. **V-F01:** Add field-level encryption for injury report PII
12. **V-A04:** Increase PIN length to 6+ digits
13. **V-D06:** Fix `office_only` document visibility
14. **V-F02:** Switch documents to signed URL downloads
15. **V-D09:** Require session validation in `get_labor_classes_for_field`

### Ongoing
16. Implement comprehensive server-side input sanitization (the `sanitize.js` library exists but is never imported)
17. Add audit logging for all sensitive operations
18. Rotate all existing PINs and session tokens after fixes are deployed
19. Add automated security testing to CI/CD pipeline
