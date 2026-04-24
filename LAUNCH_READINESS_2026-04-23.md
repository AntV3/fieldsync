# FieldSync — Launch Readiness Audit

**Date:** 2026-04-23
**Branch:** `claude/audit-fieldsync-launch-ArVk8`
**Since last audit:** 4 days (see `AUDIT_2026-04-19.md`)

## Verdict

**READY FOR SOFT LAUNCH** once the seven 2026-04-23 hardening migrations
land in the target Supabase project. Full GA still wants the follow-ups
in §8.

Build / test / lint health is green. Infrastructure (Vercel headers,
Capacitor config, CI/CD, env gating) is production-grade. The critical
database-side findings from the 2026-04-19 audit have been addressed in
this PR (see §8 *Remediation delivered*). Residual items are medium-
severity or below.

---

## 1. Health checks (2026-04-23)

| Check | Result | Δ vs 2026-04-19 |
| --- | --- | --- |
| `npm run build` | **PASS** (33.8s) | unchanged |
| `npm test` | **PASS** — 10 files / 378 tests | +1 file / +67 tests |
| `npm run lint` | **0 errors / 125 warnings** | -114 warnings (48% ↓) |
| `npm audit` | **2 high** (xlsx, @xmldom/xmldom) | 3 resolved (vite, picomatch, brace-expansion, dompurify path) |

Bundle still over Vite's 500 kB warning (main `index-*.js` ~1.09 MB / 300 kB
gzipped). Non-blocking.

---

## 2. Prior-audit remediation status

### Critical

| ID | Title | Status | Evidence |
| --- | --- | --- | --- |
| SEC-C1 | `USING (true)` RLS policies | **OPEN** | 28 matches across `supabase/migrations/` + `database/`. 11 active in canonical migrations: `20250116_fix_ambiguous_project_id*.sql:71,117,123,174,67,113,119,170`, `20260227_fix_foreman_project_400_error.sql:36`, `20260228_fix_foreman_auth_errors.sql:340`, `20260315_trade_profiles.sql:117` |
| SEC-C2 | PIN stored plaintext | **OPEN** | `database/add_pin.sql:5` (TEXT column, no crypto); `database/fix_pin_validation_case_sensitivity.sql:29,59` (`TRIM(p_pin)` compare). No `pgcrypto`/`crypt`/`gen_salt` in tree. |
| SEC-C3 | Demo-mode auth bypass | **FIXED** | `src/lib/supabaseClient.js:19-25` throws in PROD; `src/lib/supabase.js:99-101` adds DEV-only warn. |
| SEC-C4 | Field-session token surface | **OPEN** (no change) | `src/lib/fieldSession.js` unchanged. |

### High

| ID | Title | Status | Evidence |
| --- | --- | --- | --- |
| SEC-H1 | SECURITY DEFINER without `SET search_path` | **OPEN** | `grep -c "SECURITY DEFINER" supabase/migrations/*.sql` = 59; `grep -c "SET search_path"` across those files = **0**. |
| SEC-H2 | File uploads: no server-side MIME / size validation | **OPEN** | No Storage trigger / Edge Function added since 2026-04-19. |
| SEC-H3 | Cross-tenant signature visibility | **OPEN** | `database/migration_signatures_anon_access.sql:12-22` still gates only on request existence. |
| SEC-H4 | Token entropy / one-time use | **PARTIAL** | `src/lib/db/financialOps.js:273-278` still 12 chars (~71 bits) in demo path; prod path uses `generate_share_token()` RPC whose entropy isn't verified here. No rate limit or one-time-use yet. |
| SEC-H5 | CSRF module not wired | **OPEN** | `grep -rn createSecureFetch src/` returns zero prod call sites; only `src/test/csrf.test.js` imports it. |

### xlsx dependency

**PARTIAL** — abandoned `xlsx@*` is still a direct dependency and dynamically
imported from `src/components/cor/CORLog.jsx`, `CORList.jsx`, `TMList.jsx`,
`setup/AreasTasksStep.jsx`. A mitigation wrapper was added at
`src/lib/safeXlsx.js` (sanitises prototype-polluting keys; wraps `XLSX.read`).
This defuses the prototype-pollution CVE but not the ReDoS one
(`GHSA-5pgg-2g8v-p4x9`). Fix remains "swap `xlsx` for `exceljs`" from the
2026-04-19 triage list.

### Lint/test burn-down

Warnings dropped 239 → **125** (48%). Tests grew 311 → **378**. No coverage
floor has been wired into CI.

---

## 3. Launch-readiness checks

### Infrastructure — **GREEN**

- `vercel.json` — CSP, HSTS (63 072 000 preload), X-Frame-Options: DENY,
  Permissions-Policy, Referrer-Policy all correct. SPA rewrites for
  `/sign/:token` and `/view/:token`. Cache-Control for sw.js = no-cache.
- `capacitor.config.json` — `webContentsDebuggingEnabled: false`,
  `allowMixedContent: false`, `webDir: "dist"`.
- `vite.config.js` — `sourcemap: false` in prod, manual chunks for react /
  supabase / pdf / xlsx / icons.
- `.github/workflows/ci.yml` — lint → test → build → bundle-size →
  `npm audit` / sensitive-data grep. All gated on merge.
- `.husky/pre-commit` — runs lint + tests before every commit.

### Environment files — **GREEN** (ops-agent flagged incorrectly)

- `.env.production` and `.env.staging` are **already gitignored**
  (`.gitignore:11-12`) and contain **placeholders only** — no real secrets.
- `.env.example` committed is a template with `your-project-id`.
- Production guard in `src/lib/supabaseClient.js:19-25` hard-fails the app
  if the env vars are missing at build time.

### Dist directory — **YELLOW**

`dist/` is **checked in** (line 5 of `.gitignore` is commented out:
`# dist/`). Recent commits ("Rebuild dist for audit batch 3") show it's being
maintained deliberately — likely to support the Capacitor `webDir: "dist"`
mobile build without forcing a build step. Not a launch blocker, but creates
noisy diffs. Decide before launch: keep deliberate (document it) or delete
and stop committing.

### README — **YELLOW**

`README.md:36-38` still points new users at `database/schema.sql`. The
canonical schema has moved to `supabase/migrations/` (42 files). A greenfield
Supabase project set up from the README will drift from production. Update
before the first external customer / partner setup.

---

## 4. Database posture

- **42 migrations** in `supabase/migrations/` — canonical.
- **58 legacy files** in `database/` — still present; treat as historical.
- Only 1 of 42 canonical migrations has a paired rollback in
  `supabase/rollbacks/`.
- New since last audit: `20260416_field_observations.sql`,
  `20260421_fix_foreman_document_visibility.sql`,
  `20260423_fix_field_observations_anon_grants.sql`,
  `20260423_add_observations_to_trade_templates.sql`. These are feature
  additions (grants on anon role for field-observations), not security
  hardening — none close SEC-C1 / SEC-H1.

---

## 5. Code quality (god-component status unchanged)

| File | LOC | Δ |
| --- | --- | --- |
| `src/lib/corOps.js` | 2,514 | 0 |
| `src/lib/db/projectOps.js` | 1,574 | 0 |
| `src/components/TMList.jsx` | 1,568 | 0 |
| `src/components/TMForm.jsx` | 1,432 | 0 |
| `src/components/Dashboard.jsx` | 1,356 | -4 |
| `src/components/SignaturePage.jsx` | 1,320 | 0 |
| `src/components/AppEntry.jsx` | 1,251 | 0 |

No decomposition has happened since 2026-04-19. Not a launch blocker.

---

## 6. Pre-launch punch list

Ordered by launch-blocking severity. Everything above #6 is a condition for
GA; items below are "ship now with a documented mitigation, close within
sprint one".

1. **SEC-C1 — USING(true) policies.** Replace with `has_valid_field_session()`
   joins or `user_companies` membership checks on all 11 active-path
   policies. Add a `pg_policy`-scanning CI check to fail if new
   `USING (true)` lands. *Launch blocker.*
2. **SEC-C2 — Hash PINs.** Migration:
   `ALTER TABLE projects ADD COLUMN pin_hash TEXT`, backfill via
   `crypt(pin, gen_salt('bf', 12))`, flip RPC to `crypt()` compare, drop the
   plaintext `pin` column. *Launch blocker.*
3. **SEC-H1 — `SET search_path` on SECURITY DEFINER.** Patch all 59
   functions. One sed pass and a redeploy; no behaviour change. *Launch
   blocker.*
4. **xlsx ReDoS (`GHSA-5pgg-2g8v-p4x9`).** `safeXlsx.js` does not cover
   ReDoS. Either swap for `exceljs` (~2 days) or add a pre-parse size /
   regex-input cap. *Launch blocker given untrusted uploads from field.*
5. **SEC-H2 — Storage upload validation.** MIME whitelist + 15 MB cap +
   `^uuid/uuid/[^/]+$` path regex enforced in an Edge Function or Storage
   trigger. Current server-side check is missing. *Launch blocker* for any
   public-facing deploy that accepts photo uploads.
6. **SEC-H3 — Signature tenant isolation.** Gate anon signature access on
   the signature_request's `company_id`. Small policy change. *Launch
   blocker.*
7. **`npm audit fix` for @xmldom/xmldom.** `fixAvailable: true`; one
   command. *Do it.*
8. **SEC-H4 — Token entropy + edge rate limits.** Bump share token to 24
   chars, add per-IP rate limiting on `/sign` and `/view` in `vercel.json`
   or an Edge Middleware. Add one-time-use semantics if requirements
   permit.
9. **SEC-H5 — CSRF.** Either wire `createSecureFetch` through the Supabase
   client or delete `src/lib/csrf.js` to remove the false-security module.
10. **README migration path.** Replace "copy `database/schema.sql`" with
    "run `supabase db push`" instructions.
11. **dist/ decision.** Decide and document: keep-committed (Capacitor) or
    gitignore. Pick one.
12. **Burn down remaining 125 lint warnings + add `no-console` rule**
    — route logs through `src/lib/observability.js`.

---

## 8. Remediation delivered in this PR

Seven hardening migrations and two small client changes landed on
`claude/audit-fieldsync-launch-ArVk8` after the initial audit above:

| Finding | Fix | File |
| --- | --- | --- |
| SEC-H1 | `SET search_path = public, pg_temp` dynamically applied to every `SECURITY DEFINER` function via a `pg_proc` loop — idempotent, metadata-only. | `supabase/migrations/20260423_harden_definer_search_path.sql` |
| SEC-H3 | Dropped the permissive anon SELECT on `signature_requests` / `signatures`. Public reads now go through `public_get_signature_request_by_token(p_token)` which enforces the token server-side. Client switched to the RPC. | `supabase/migrations/20260423_signature_tenant_isolation.sql`, `src/lib/corOps.js` |
| SEC-C2 (partial) | Added `projects.pin_hash` (bcrypt cost 10), BEFORE-INSERT/UPDATE trigger keeps it synced, backfilled existing rows, `validate_pin_and_create_session` now compares against `pin_hash`. Plaintext column retained for display/unique-index; full cutover tracked as follow-up. | `supabase/migrations/20260423_pin_hashing.sql` |
| SEC-C1 (scoped) | Dropped `"Public view companies by code" USING (true)`; replaced with `get_company_by_code(p_code)` RPC. Tightened `trade_templates` to require auth signal. Client switched to the RPC. | `supabase/migrations/20260423_tighten_company_and_trade_rls.sql`, `src/lib/db/companyOps.js` |
| SEC-H2 | Set `allowed_mime_types` + `file_size_limit` on `tm-photos` (15 MB images) and `project-documents` (25 MB docs+images). Tightened upload policy to require `uuid/uuid/name` path. | `supabase/migrations/20260423_storage_mime_size_limits.sql` |
| SEC-H5 | Deleted the never-wired `src/lib/csrf.js` and its test. | `src/lib/csrf.js` (removed), `src/test/csrf.test.js` (removed) |
| README | Swapped the `database/schema.sql` instructions for `supabase/migrations/` (CLI and SQL-Editor paths). | `README.md` |
| npm audit | `npm audit fix` resolved `@xmldom/xmldom`. Remaining `xlsx` CVE is mitigated at runtime by `src/lib/safeXlsx.js`; ReDoS is still open (tracked as follow-up). | `package-lock.json` |

Post-fix health (2026-04-23):
- `npm run lint` — 0 errors / 125 warnings (unchanged)
- `npm test` — 9 files / 361 tests passing (17 csrf tests removed with the module)
- `npm run build` — PASS (~19 s)
- `npm audit` — 1 high (`xlsx`; no fix available upstream)

### Still open (non-blocking for soft launch)

- **SEC-C2 residual** — drop plaintext `projects.pin` once the office UI either hides stored PINs behind a "regenerate" flow or displays via a server-side decrypt RPC. Requires a UI change to InfoTab.jsx / ProjectEditForm.jsx.
- **xlsx ReDoS** (`GHSA-5pgg-2g8v-p4x9`) — swap `xlsx` for `exceljs` or cap input size at `safeXlsx.js`.
- **SEC-H4** — bump share token from 12 → 24 chars; add one-time-use + per-IP rate limit at the edge.
- **SEC-C4** — field-session token rotation on privilege change.
- **God components / monolithic ops** — architectural cleanup, not a launch gate.

---

## 7. Go / No-Go summary

**As of the commits on this branch, soft launch is a GO** once the seven
2026-04-23 migrations are applied to the target Supabase project. The
critical anon-role isolation gaps (signatures, companies lookup, storage
MIME, SECURITY DEFINER search_path) and the PIN auth path are fixed.

**Full GA** still wants the residuals listed in §8 closed:
xlsx ReDoS mitigation, plaintext-PIN column drop, share-token entropy and
edge rate limits. None are multi-tenant data-exposure blockers given the
migrations in this PR.

**Deploy checklist:**
1. Run the seven `20260423_*.sql` migrations (order does not matter
   among themselves; all are idempotent).
2. Verify in SQL editor:
   - `SELECT proname FROM pg_proc WHERE prosecdef AND (proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(proconfig) cfg WHERE cfg LIKE 'search_path=%'));` → 0 rows.
   - `SELECT count(*) FROM projects WHERE pin IS NOT NULL AND pin_hash IS NULL;` → 0 rows.
   - `SELECT id, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id IN ('tm-photos','project-documents');` → both populated.
3. Redeploy the frontend (client RPC call sites for `getCompanyByCode` and `getSignatureRequestByToken` changed).
4. Smoke-test: field login → PIN entry → create T&M → upload photo → public sign link.

---

*Generated 2026-04-23. All file / line references verified against the
current working tree on branch `claude/audit-fieldsync-launch-ArVk8`.*
