# FieldSync launch readiness

Audience: the founder (decides, runs the founder checklist, tests) and whoever implements (engineer or agent). Five verified plans are folded into one sequence below; where two plans built the same thing, this document picks one and says so. All paths are relative to the repo root; `file:line` citations were re-read on 2026-11-05.

## What ships

After these five land, FieldSync can honestly promise: a foreman on a phone writes a T&M ticket in two minutes (even with no signal), the office corrects, approves and prices it without deleting anything, rolls it into a COR, and the GC signs it from a link on their own phone with the office notified by email — with no open anon write path and no claim on the landing page that the product does not keep.

## Order of work

| # | Item | Why this order | Depends on | Est. (days) | Founder action |
|---|------|----------------|------------|-------------|----------------|
| 1 | Public GC signing link works for an outside signer | The core promise is broken today for every GC who is not logged in; smallest item; has a pre-deploy gate (storage header forwarding) that can fail and needs founder time early; item 5 builds on its RPCs | — | 3 | Yes |
| 2 | Project setup asks only for what T&M needs | First impression for every new customer; independent of everything else; only founder decisions and a one-line migration | — | 3.5 | Yes |
| 3 | Offline T&M submit: make it work (scoped) or remove the claim | A live data-loss / duplicate-ticket bug in the foreman flow; landing-page claims must change before launch regardless; establishes the atomic `create_tm_ticket_full` RPC that items 4 and 5 assume | 2 (ForemanLanding merge order) | 4.5 | Yes |
| 4 | Office corrects a T&M ticket without deleting it | Daily office pain (delete + re-create loses signatures/approval/COR link); shares the T&M schema pre-check with item 3 | 3 (shared `tmOps.js` / pre-check) | 5 | Yes |
| 5 | Transactional email (Resend) for signature links and approval events | Largest item with the most external prerequisites (DNS verification, Vault, CLI, Edge Function); depends on item 1's signing RPCs; launch can go without it (mailto fallback stays) | 1 (hard), 3 (simplifies) | ~5 (plan said 6; item 1 delivers its signing RPCs) | Yes — start DNS on day 1 |

Total ≈ 21 engineer-days for one person. Items 1+2 and 3+4 touch different surfaces and can run in parallel with two people.

How the plans fit together (decisions already made, engineer does not re-litigate):

- Items 1 and 5 both designed public signing RPCs. **Item 1's design wins**: `public_get_document_for_signing(p_token)`, `public_add_signature(p_token, p_slot, p_signature)`, `signing_token_can_read_photo`, header `x-signing-token`, `src/lib/signingClient.js`. Item 5 drops its own `public_get_document_for_signing` / `public_submit_signature` / `signing_token_ticket_ids` / storage policy / `setSigningToken` work and keeps only the email layer, the recipient columns, the guard trigger, `create_signature_request`, `resend_signature_request`, and the closing of the anon write path.
- `signatures.company_id` (referenced by an applied-but-broken policy in `20260402_security_critical_fixes.sql:45-53`, absent from the repo DDL) is added and populated in **item 1**, so `public_add_signature` cannot fail if production already has that column NOT NULL.
- Item 1 explicitly leaves the field-side "Get signature link" path (ReviewStep.jsx:15, :341) broken; **item 5's `create_signature_request` RPC fixes it**. Item 1's open question about revoking anon INSERT on `signatures` is **answered yes in item 5**.
- Item 3 moves every ticket insert (field and office) into `create_tm_ticket_full`. Item 5's `trg_email_tm_ticket_submitted` fires inside that transaction with workers already present; the worker's "defer while no workers" branch stays for legacy direct inserts.
- `ForemanLanding.jsx` is touched by items 2 (hide areas section), 3 (pending-ticket banner) and 5 (rejection card). Merge in that order.
- Migration filenames below are the plans' names; application order ≠ filename order, and `supabase/MIGRATION_LOG.md` records the applied date (there is no CLI-tracked history, MIGRATION_LOG.md:16-21).

## Founder checklist

Everything is run in the Supabase SQL Editor or dashboard unless a command is given. "Branch" means a Supabase branch (docs/migration-workflow.md:19, Option A) or a staging project.

**Before anything starts**

1. Confirm a Supabase branch or staging project exists and tell the engineer which. Every migration is applied there first, then in production, then its row is marked Applied in `supabase/MIGRATION_LOG.md` (format: last rows of that file).
2. Understand the deploy rule: Vercel auto-deploys `main` and builds a preview for every PR, and **previews use the production database** (docs/DEVELOPMENT_WORKFLOW.md:49, :209). So every migration is applied to production **before** its PR merges and before QA on a preview. All five migrations are written to be backward-compatible with the currently deployed app.
3. Set up test fixtures: a staging company with custom labor classes, a few materials, a field PIN; an office login; a fresh office account (never used); two phones — one logged-in office phone, one that has never opened FieldSync (or a private window); a way to simulate a dead radio (Wi-Fi with no internet, or a router block of `*.supabase.co`).
4. Run once and hand the output to the engineer (shared by items 1, 3, 4, 5):
   ```sql
   select table_name, column_name, data_type, is_nullable from information_schema.columns
    where table_schema='public' and table_name in ('t_and_m_tickets','t_and_m_workers','t_and_m_items','signatures','field_sessions','signature_requests','companies')
    order by 1, ordinal_position;
   select tablename, policyname, cmd, roles, qual, with_check from pg_policies
    where schemaname='public' and tablename in ('t_and_m_tickets','t_and_m_workers','t_and_m_items','signature_requests','signatures') order by 1,2;
   select table_name, grantee, privilege_type from information_schema.role_table_grants
    where table_schema='public' and table_name in ('t_and_m_tickets','t_and_m_workers','t_and_m_items') and grantee in ('anon','authenticated');
   select to_regclass('public.notification_preferences'), to_regclass('public.notification_presets');
   ```
   The base T&M tables are not defined in the repo (only ALTERed), so this output is the only record of the live types, policies and grants.

**Before item 1 (signing link)**

5. Apply `supabase/migrations/20261105_public_signing_rpcs.sql` on the branch, then production; log it.
6. Storage header gate — on the branch, after the migration, create a `signature_requests` row with token `sig_smoketest0001` for a ticket that has a photo, then from a terminal with no session:
   ```
   curl -X POST "https://<branch-ref>.supabase.co/storage/v1/object/sign/tm-photos/<photo path>" \
     -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>" -H "x-signing-token: sig_smoketest0001" \
     -H "Content-Type: application/json" -d '{"expiresIn":60}'
   ```
   Expect a JSON body with `signedURL`; repeat without the `x-signing-token` header and expect 400/403/404. If the first call is denied, stop: the Edge Function fallback (item 1, risk 1) is needed before item 1 can ship.
7. Dashboard → Storage: confirm `tm-photos` is **not** public, and the `public` bucket (company logos; `src/lib/BrandingContext.jsx:238-251` uses `getPublicUrl` on it) **is** public.
8. Dashboard → Database → Publications → `supabase_realtime`: confirm `t_and_m_tickets` and `change_orders` are included (no repo migration adds them; only areas/activity_log/documents are, `20241201000010_schema.sql:61`, `20241201000020_schema_v2.sql:169-170`, `20241201000150_documents.sql:546-548`). If missing, add them or accept manual refresh for launch.
9. QA fixtures: project with a company logo; a foreman-signed T&M ticket with 2+ photos, 2+ workers, 1+ item, no GC/client signature; a `pending_approval` COR containing that ticket.

**Before item 2 (project setup)**

10. Apply `20261104_project_contract_value_optional.sql` on the branch and in production **before the PR merges and before preview QA**; log it.
11. Confirm the defaults: "not set" stored as NULL; Foreman PIN on the Basics step (4-step wizard); schedule dates both-or-neither; blank PIN on the edit form left as today.

**Before item 3 (offline)**

12. From step 4's output, confirm with the engineer: types of `time_started`/`time_ended`, that `foreman_signature_*` columns exist, no CHECK on `status` excludes `foreman_signed`, and that `authenticated` has SELECT+INSERT on the three T&M tables.
13. Apply `20261104_offline_tm_submit.sql` on the branch, run `supabase/tests/create_tm_ticket_full_tests.sql` there (its first assertion checks the live policies), then production; log it. Deploy the client only after.
14. Approve the reduced copy: Hero "Saves Offline"; FeatureGrid "Offline Ticket Capture" + "Photos upload once you're connected"; CapabilityStrip "Offline Ticket Capture"; in-form modal "Saves Offline"; meta "saves offline".
15. Confirm no native Capacitor build is distributed (commit `3135bae` parked them); if one is, it must be rebuilt after item 3 or it keeps creating hollow offline tickets.

**Before item 4 (office edit)**

16. Paste step 4's T&M output into the note of the `MIGRATION_LOG.md` row (it is the first written record of production's T&M policies).
17. Apply `20261105_tm_ticket_office_edit.sql` on the branch, run `supabase/tests/rls_policy_tests.sql` (all PASS), then production; log it.
18. Decide the open questions (defaults below allow work to start immediately).

**Before item 5 (email) — start 19 and 20 on day 1; DNS verification takes time**

19. Resend: create an account; add a sending subdomain (e.g. `mail.<yourdomain>`); publish the DNS records Resend shows (DKIM TXT, SPF/MX for the return path, DMARC TXT recommended); wait for "Verified"; create an API key with "Sending access" only; pick the sender (e.g. `FieldSync <noreply@mail.<yourdomain>>`). Free tier: 3,000/month, 100/day, one domain.
20. Supabase, before running the email migration: Database → Extensions → enable `pg_net` and `pg_cron`; Settings → Vault available; then run:
    ```sql
    select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-email', 'email_worker_url');
    select vault.create_secret('<random 32+ char string>', 'email_worker_secret');
    ```
21. Supabase CLI, once: `npx supabase login`; `npx supabase init` (creates `supabase/config.toml` — commit it with `[functions.send-email] verify_jwt = false`); `npx supabase link --project-ref <ref>`; `npx supabase secrets set RESEND_API_KEY=re_… EMAIL_FROM="FieldSync <noreply@mail.<yourdomain>>" APP_BASE_URL=https://<production app host> EMAIL_WORKER_SECRET=<the same random string>`; `npx supabase functions deploy send-email --no-verify-jwt` (repeat on every change under `supabase/functions/send-email/`).
22. Apply `20261104_signature_public_rpcs.sql` (email columns + anon write-path closure) then `20261104_transactional_email.sql` on the branch; run `supabase/tests/email_outbox_tests.sql` and the QA script; apply both to production; log; confirm `select * from cron.job` lists `email_outbox_sweep`; only then deploy the client.
23. Provide `APP_BASE_URL` and the project ref; decide the sender display name (default `<Company> via FieldSync`, or `<Company>` when `hide_fieldsync_branding`); accept that Branding Settings' "From Email" stays ignored until per-company domains exist.
24. After launch: watch the Resend dashboard for bounces/complaints; weekly `select status, count(*) from email_outbox group by 1` and investigate any `dead` rows.

---

## 1. Public GC signing link works for an outside signer

### Problem

`SignaturePage.jsx` (route `/sign/:token`, `src/App.jsx:387-388`) was written when the Postgres `anon` role could read the base tables; every hardening migration since then closed a door the page still walks through. Of its four data calls only `getSignatureRequestByToken` (`src/lib/corOps.js:1837`, via the SECURITY DEFINER RPC granted at `20260423_signature_tenant_isolation.sql:106`) works for a GC with no session; `getDocumentForSigning` (`corOps.js:1999`, direct select with a `companies` embed — anon SELECT on companies revoked at `20260423_tighten_company_and_trade_rls.sql:83`), `addSignature` (`:1878`, insert whose policy subqueries a table anon cannot read, `20260423:47-55`, `:63`) and `syncSignatureToDocument` (`:1907`, direct UPDATE) all fail, so the GC sees "Unable to load signature request". It only ever worked for a logged-in office user opening their own link. Side bugs: photos render as storage paths (404); the IP lookup to `api.ipify.org` (`SignaturePage.jsx:148`) is blocked by the CSP (`vercel.json:42`); the signed image reads `signature_data` but the column is `signature_image` (`SignaturePage.jsx:1161-1184`); time-expired links are indistinguishable from invalid ones; the page needs one signature (`:290`) while the status trigger needs two.

### Acceptance criteria

Setup: founder checklist 5–9. "Phone B" has never opened FieldSync.

- [ ] Phone B opens a valid T&M link cold: within ~3 s it shows company logo/name, project, work date, CE/PCO, notes, workers table (hours/OT), materials table, every photo as an image, foreman certification, and "Sign as GC" / "Sign as Client". No "Unable to Load Document".
- [ ] Long-press a photo → URL contains `/storage/v1/object/sign/tm-photos/`; removing `?token=` gives 400/403, not the image (bucket still private).
- [ ] Sign as GC (name "QA GC", title, company, acknowledgment): success overlay, then the signed state with the signature image, "QA GC — PM — GC Co", today's date, no Sign buttons. "Save a Copy" PDF contains the photos.
- [ ] Reload on Phone B and open on the office phone: identical signed state. The office link modal shows "Fully Signed" with no Revoke button.
- [ ] Office TMList (Pending filter, open during signing) shows the ticket as `client_signed` with the "Authorized by QA GC" badge (`TMTicketCard.jsx:134`) within ~5 s, no reload. If only after reload, record it and check checklist step 8.
- [ ] SQL: latest `signatures` row = QA GC, slot 1, Phone B's user agent, `ip_address` non-null (or NULL if the gateway strips it — record which); `t_and_m_tickets.status = 'client_signed'`, `gc_signature_name = 'QA GC'`; `signature_requests.status = 'completed'`.
- [ ] COR link: Phone B sees header, scope, line items, totals, and a "T&M Backup" section with the ticket and its photos. Sign as GC → `change_orders.status = 'approved'`, `approved_at` set, one `cor_status_history` row with notes "GC signed via signature link"; "Download COR + Backup" PDF includes the backup ticket photos; office CORList shows Approved within ~5 s.
- [ ] Double sign: a stale tab still showing Sign buttons submits → page reloads into the signed state with inline notice "This document has already been signed." (never the full-page error); no new `signatures` row. A second link for the same ticket → same notice; `gc_signature_name` still "QA GC".
- [ ] Revoked link → "This signature link has been revoked."; `expires_at` set in the past → "This signature link has expired."; token edited by one character → "This signature link is invalid or has expired."
- [ ] SQL as anon: `select count(*) from t_and_m_tickets` → 0; `select * from signature_requests limit 1` → permission denied; `select public_get_document_for_signing('sig_nope')` → NULL; `select public_signing_ticket_json('<id>')` → permission denied. As owner, `public_get_document_for_signing('<valid>')::text` contains none of `rejection_reason`, `approved_by`, `photo_locations`, `cost_per_unit`, `signature_ip`.
- [ ] Devtools (cold profile): no request to `api.ipify.org`, no CSP violation during load, sign and export; everything goes to `*.supabase.co`.
- [ ] Leave the signed T&M page open > 60 min (or set the signed-URL TTL to 60 s in a dev build) → "Save a Copy" still contains the photos.
- [ ] A logged-in office user opening the link gets identical behavior.

### Approach

Move the whole public flow server-side behind token-gated SECURITY DEFINER RPCs modeled on `public_get_signature_request_by_token` (`20260423:70-106`): the token is the credential; each function validates token + expiry + status; reads return an explicit key allowlist via a tiny `public_signing_pick(row, keys)` helper (drift-safe in both directions); the write path does signature insert + document write + status advance + audit in one transaction with `FOR UPDATE`, the unique slot constraint and a per-slot document guard. The client becomes thin and never touches base tables. Photos: Supabase signed URLs are minted by the Storage API, so reuse the mechanism the field app already relies on — a custom header checked by a SECURITY DEFINER helper inside a `storage.objects` policy (`has_valid_field_session()` is used that way at `20260310_launch_security.sql:73-85`). A dedicated supabase-js client sends `x-signing-token`; an additive anon SELECT policy allows only photos of the token's own ticket(s). One signature completes the request (matches the page). The token RPC is re-created to return `{status:'expired', document_type}` for a time-expired row so the page's existing branch shows the right copy. IP comes from `request.headers` (`cf-connecting-ip` / first hop of `x-forwarded-for`), ipify is deleted. The page keeps raw photo paths and re-signs them immediately before PDF export. Rejected: anon policies keyed on "an open request exists" (policy subqueries run as the caller), a public bucket, SQL-minted storage JWTs, and an Edge Function (no `supabase/functions` exists — kept only as the fallback if checklist step 6 fails).

### Changes

| File | Change |
|------|--------|
| `supabase/migrations/20261105_public_signing_rpcs.sql` | NEW, idempotent. See Migrations. |
| `supabase/rollbacks/20261105_public_signing_rpcs_rollback.sql` | NEW. Drop the storage policy, `signing_token_can_read_photo`, `public_add_signature`, `public_get_document_for_signing`, `public_signing_ticket_json`, `public_signing_pick`; re-create `public_get_signature_request_by_token` exactly as `20260423:70-106` with its REVOKE/GRANT. Leave `signatures.company_id` in place. |
| `supabase/MIGRATION_LOG.md` | Append a row (same format as the `20261026` row). |
| `src/lib/signingClient.js` | NEW (~40 lines). `getSigningClient(token)`: null if `!isSupabaseConfigured` or no token; one cached client per token; `createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { 'x-signing-token': token } }, auth: { persistSession: false, autoRefreshToken: false, storageKey: 'fieldsync-signing-auth-token' }, realtime: { params: { eventsPerSecond: 0 } } })` — shape of `getFieldClient` (`src/lib/fieldSession.js:165-174`). |
| `src/lib/corOps.js` | `getSignatureRequestByToken` (:1837): delete the `increment_signature_view_count` call (:1844); use `getSigningClient(token) \|\| getClient()`. Replace `getDocumentForSigning(documentType, documentId)` (:1999) with `getDocumentForSigning(token)` → `rpc('public_get_document_for_signing', { p_token })`. Replace `addSignature(requestId, slot, data)` (:1878) with `addSignature(token, slot, data)` → `rpc('public_add_signature', { p_token, p_slot, p_signature: { signature, signerName, signerTitle, signerCompany, signedAt, userAgent } })`. Delete `syncSignatureToDocument` (:1907-1976; only caller is SignaturePage.jsx:174). Keep `_logCORStatusChange` (:2534). |
| `src/lib/db/tmOps.js` | Add `isFreshSignedPhotoUrl(url, minTtlMs = 60000)` (signed-URL path + JWT `exp` > now + ttl; any parse failure → false). `resolvePhotoUrls(urlsOrPaths, client = null)`: use `client \|\| getSupabaseClient()`; fresh signed URLs pass through untouched, stale ones are re-signed as today; null-on-failure semantics unchanged. Same optional client on `resolvePhotoUrl`. |
| `src/components/SignaturePage.jsx` | Import `getSigningClient`; add `notice` state. `loadData`: drop the `status === 'completed'` error branch (completed renders the signed state); keep revoked/expired branches (expired now reachable); call `db.getDocumentForSigning(signatureToken)`; local `resolveTicketPhotos(tickets)` resolves with the signing client, keeps `_photoPaths`, filters nulls; T&M: resolve the document; COR: `setDocument(docData)` and `setBackupTickets(resolve(docData.backup_tickets))` — delete the `db.getCORTickets` block (:92). Delete `getClientIP` (:146-154) and its call. `handleSignatureSubmit`: return early while `submitting`; `db.addSignature(signatureToken, activeSlot, { ...data, userAgent: navigator.userAgent })`; delete the sync call (:174); map `signing_already_signed` → reload + close modal + inline notice; `signing_invalid_payload` → notice; `signing_link_expired` / `_revoked` / `_invalid` → the three error copies. `handleDownload`: delete the `getCORTickets` refetch (:208); re-resolve `backupTickets` and pass them to `exportCORToPDF`. `handleDownloadTMTicket`: export a re-resolved copy of `document`. Render `{notice && <div className="signature-notice" role="status">…}` under the header in both views; guard `photo?.url`; replace `signature_data` with `signature_image` at :1161-1162 and :1183-1184. Add a `.signature-notice` rule next to `.signature-page-error`. |
| `supabase/tests/rls_policy_tests.sql` | TEST 6: remove `'companies'` from `tables_needing_anon_select` (:316-318; its anon grant was revoked, so the suite always reports one FAIL). Append TEST 8 "PUBLIC SIGNING": the four public functions exist, are `prosecdef` and have a `search_path=` proconfig; `has_table_privilege('anon', t, 'SELECT') = false` for `signature_requests`, `signatures`, `companies`; no anon policy with `qual='true'`/`with_check='true'` on `t_and_m_tickets`/`change_orders`/`signatures`/`storage.objects`; both token RPCs return NULL for `sig_doesnotexist`; storage policy exists and `tm-photos` `public = false`; anon lacks EXECUTE on the two helpers. |
| `supabase/tests/public_signing_smoke.sql` | NEW `BEGIN … ROLLBACK` script: insert a request for a `foreman_signed` ticket, `SET LOCAL ROLE anon` + `set_config('request.headers', '{"x-forwarded-for":"203.0.113.9, 10.0.0.1","user-agent":"smoke","x-signing-token":"sig_smoketest0001"}', true)`; assert the document projection has `t_and_m_workers`/`t_and_m_items`/`projects.companies.name` and none of the excluded keys; `signing_token_can_read_photo` true for the ticket's photo, false for a foreign path; `public_add_signature` with a real 1×1 PNG data URL → `document_status 'client_signed'`, `request_status 'completed'`; second call raises `signing_already_signed`; `RESET ROLE` and verify columns incl. `ip_address = '203.0.113.9'` and `signatures.company_id`; expired → token RPC returns `status 'expired'` with no `id`, document RPC NULL, add raises `signing_link_expired`; revoked → `signing_link_revoked`; COR happy path → `approved`, `approved_at`, one history row. |
| `src/test/signaturePage.test.jsx` | NEW (mocks `../lib/supabase`, `../lib/signingClient`, `../lib/corPdfExport`): renders workers/items and one `<img>` per resolved photo; a null photo is dropped without crashing; calls `getDocumentForSigning('sig_test')`; signing calls `addSignature('sig_test', 1, objectContaining({ signerName, signature, userAgent }))` then reloads; `global.fetch` never called; expired/revoked/null-request copies; `completed` renders the signed card with `signature_image` and no Sign buttons; `signing_already_signed` → reload + notice, no error view; COR download passes re-resolved backup tickets to `exportCORToPDF` and never calls `db.getCORTickets`. |
| `src/test/corOpsSigning.test.js` | NEW: exact RPC names and parameter keys; no `increment_signature_view_count` call; `syncSignatureToDocument` undefined. |
| `src/test/resolvePhotoUrls.test.js` | NEW: fresh signed URL passes through, stale one re-signed, optional client used, malformed token → not fresh. |
| `docs/PWA_PHONE_TEST_CHECKLIST.md` | Insert "## 7. GC signing link (two phones)" after "## 6. Updates" (:63) and before "## Known limits…" (:70) with the acceptance checklist above in the Step/Pass? table style. |
| `docs/CODE_MAP.md`, `docs/ARCHITECTURE.md` | SignaturePage dependencies: `corPdfExport`, `SignatureCanvas`, `getSigningClient`, `db`; note `getDocumentForSigning(token)` / `addSignature(token, slot, data)` are RPC-backed and `syncSignatureToDocument` is gone; ARCHITECTURE "Share token" → "Share token (token-gated RPCs, anon role)". |

### Migrations

`supabase/migrations/20261105_public_signing_rpcs.sql` — every function `SECURITY DEFINER SET search_path = public, extensions, pg_temp` (`20260423_harden_definer_search_path.sql` convention), `REVOKE ALL … FROM PUBLIC`, `GRANT EXECUTE … TO anon, authenticated` on the four public entry points only; helpers get no grant. No table-level GRANT/REVOKE.

1. `public_signing_pick(p_row JSONB, p_keys TEXT[]) RETURNS JSONB` — `jsonb_object_agg` of the allowlisted keys of `jsonb_each(p_row)`.
2. `public_signing_ticket_json(p_ticket_id UUID)` — ticket keys: `id, project_id, assigned_cor_id, work_date, ce_pco_number, notes, status, photos, created_at, created_by_name, foreman_signature_{data,name,title,date}, gc_signature_{data,name,title,company,date}, client_signature_{data,name,title,company,date}`; worker keys `id, ticket_id, name, role, hours, overtime_hours, time_started, time_ended`; item keys `id, ticket_id, material_equipment_id, custom_name, custom_category, quantity` plus `materials_equipment {id, name, unit, category}` (no `cost_per_unit`). Never: `rejection_reason`, `rejected_*`, `approved_*`, `photo_locations`, `photos_verified_*`, `*_signature_ip`, `cost_code_id`, `import_*`.
3. `CREATE OR REPLACE public_get_signature_request_by_token(p_token)` — same shape as today, but a row that exists and is time-expired returns `jsonb_build_object('status','expired','document_type',…)` instead of NULL; unknown token still NULL.
4. `public_get_document_for_signing(p_token) RETURNS JSONB VOLATILE` — token length ≥ 8; request `status IN ('pending','partially_signed','completed')` and not expired, else NULL; bump `view_count`/`last_viewed_at` for pending/partially_signed (replaces `increment_signature_view_count`); `projects {id, name, job_number, companies {id, name, logo_url}}`; `tm_ticket` → helper 2 pinned to `project_id = request.project_id`; `cor` → allowlisted `change_orders` keys (number/title/scope/period/status/subtotals/markups/fees/totals/signature columns/created_at/submitted_at/approved_at/hours/counts/revision_number; never `company_id, area_id, rejection_reason, created_by, approved_by, submitted_by, version, last_snapshot_version, *_signature_ip`) plus whole `change_order_labor/materials/equipment/subcontractors` rows ordered by `sort_order` and `backup_tickets` (helper 2 for every ticket with `assigned_cor_id = cor.id`, ordered by `work_date`). Key names match today's PostgREST embed shape so `corCalculations.js` and `corPdfExport.js` keep working.
5. `public_add_signature(p_token, p_slot INTEGER, p_signature JSONB)` — `SELECT … FOR UPDATE`; `signing_link_invalid` / `signing_link_revoked` / `signing_already_signed` (status `completed` or any existing signature) / `signing_link_expired`; slot ∈ {1,2}; image must start with `data:image/png;base64,` and be 30–1,500,000 chars; name ≤ 120 non-empty; title/company ≤ 120; UA ≤ 512 (payload or header); IP via guarded `::inet` of `cf-connecting-ip` / first hop of `x-forwarded-for`; per-slot document guard (`gc_signature_data` / `client_signature_data` already set → `signing_already_signed`); `INSERT INTO signatures (…, company_id = request.company_id)` catching `unique_violation`; mirror to `gc_*` (slot 1) / `client_*` (slot 2) columns pinned to `project_id`; COR + slot 1: `status='approved'`, `approved_at = COALESCE(approved_at, signed_at)` where `status='pending_approval'`, and if a row changed insert `cor_status_history (…, changed_by NULL, notes 'GC signed via signature link')`; ticket: `status='client_signed'` where `status IN ('pending','foreman_signed')`; then `UPDATE signature_requests SET status='completed'` (overrides the two-slot trigger `20241201000320:200-226`). Returns `{signature, document_status, request_status}`.
6. `ALTER TABLE signatures ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE`; backfill from `signature_requests`; index. (Makes `20260402_security_critical_fixes.sql:45-53` coherent whether or not production already has the column.)
7. `signing_token_can_read_photo(p_object_name TEXT) RETURNS BOOLEAN STABLE` — reads `x-signing-token` from `request.headers`; loads the open request; true only if `p_object_name` equals (exact string compare, no LIKE) a `photos` entry of the token's ticket or of a ticket assigned to the token's COR, pinned to `project_id`; handles stored paths and legacy public URLs. `GRANT EXECUTE TO anon, authenticated`.
8. `CREATE POLICY "Signing link can read document photos" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'tm-photos' AND signing_token_can_read_photo(name))` — additive to `"Secure read access for tm-photos"` (`20260310_launch_security.sql:73`). Bucket stays private. Helper 7 also requires the object path to start with the request's `company_id/project_id/` so a `photos` entry naming another tenant's object never unlocks it.
9. Re-create the two anon policies on `signature_requests` from `20250101_signature_anon_access.sql` pinned: `FOR INSERT TO anon WITH CHECK (document_type IN ('tm_ticket','cor') AND can_access_project(project_id) AND company_id = project's company AND the document exists in that project)`; `FOR UPDATE TO anon USING (open + unexpired + can_access_project(project_id)) WITH CHECK (same pins)`. Review found that a request row is now the credential and the blanket policies let a session-less anon mint or re-point one (ids leak through any legitimate link). Office users still go through `"Company users manage signature requests"`; the field app creates links with its session, so nothing user-facing changes. Readers (3, 4, 7) also keep a `completed` request readable past `expires_at` (the signed state must keep rendering) and 3 returns only `{status:'revoked', document_type}` for a revoked row.

### Tests

`npm test`: the three new vitest files. SQL on the branch then prod: `rls_policy_tests.sql` (TEST 6 fixed, TEST 8 PASS) and `public_signing_smoke.sql` (all PASS, rolls back). `npm run lint && npm run typecheck && npm run build` clean (remove the imports left unused by deleting `getClientIP` / `syncSignatureToDocument`). Manual: the acceptance checklist, also recorded as PWA checklist §7.

### Risks

- Storage header forwarding is the top risk; checklist step 6 gates it before any client deploys. Fallback: a `sign-photos` Edge Function (service role) — not in this plan.
- Column drift is no longer a security risk (allowlists) but a display column added later must be added to one of two arrays.
- Request status now completes after one signature; the office modal shows "Fully Signed" and hides Revoke with no UI change. In-person flows (`saveCORSignature`, `saveTMClientSignature`) do not touch `signature_requests`.
- The per-slot guard rejects a link signature for a slot already filled on-site — intended, but a behavior change from today's silent overwrite.
- `x-forwarded-for` may be absent behind the gateway; IP falls back to NULL (same as in-person signing). When `cf-connecting-ip` is absent the first hop of `x-forwarded-for` is client-supplied, so the recorded IP is self-reported audit data.
- Office auto-refresh depends on publication membership (checklist step 8); the signature still lands either way.
- Only SignaturePage calls the changed `corOps` functions (grep-verified); `resolvePhotoUrls` keeps one-argument behavior.
- The 1.5M-char cap must stay above what `SignatureCanvas.toDataURL` produces on a 500px canvas; QA uses a dense signature.
- If `signatures.company_id` already exists NOT NULL in production, the `ADD COLUMN IF NOT EXISTS` is a no-op and the RPC still populates it.

### Open questions (proposed defaults)

1. Should a slot-2 "Client" signature also approve a COR? **Default: no** — keep parity with `corOps.js:1952-1963` (slot 1 only); T&M tickets advance on either slot.
2. Should the outside signer see `materials_equipment.cost_per_unit`? **Default: no** — omitted from the projection; that PDF column shows "-" for remote signers.
3. One signature completes the request and any second signature (either slot, or a slot already filled on the document) is rejected? **Default: yes.**
4. Revoke `GRANT INSERT ON signatures TO anon` / drop the anon INSERT policy and fix the field-side link creation here? **Default: no — both are done in item 5.**

---

## 2. Project setup asks only for what T&M needs

### Problem

A new office user cannot create a project without a contract value > 0 (`src/components/Setup.jsx:56-65`), both schedule dates and a 4-digit PIN (`:71-83`), and ≥1 area whose weights total 100% (`:85-103`) — five screens (`STEPS`, `:11-17`), three of them demanding data T&M ticketing never uses, and `projects.contract_value` is `NOT NULL` (`supabase/migrations/20241201000010_schema.sql:11`) so even bypassing the UI fails. "Add it later" is impossible: `useProjectEdit.js` requires a contract value (`:81`) and 100% areas (`:107-108`), refuses to remove the last area (`:67`), and has no date fields (`:128-131`). A subtle trap: the office never sees NULL on first open — the dashboard summary RPC emits `COALESCE(p.contract_value, 0)` (`20261026_dashboard_pending_counts_include_signed.sql:76`) and the mapper hard-codes `Number(p.contract_value) || 0` (`src/lib/db/projectOps.js:203`), so an edit form seeded raw (`useProjectEdit.js:27`) shows "0" and a validator that rejects 0 blocks the very edit this item exists to enable.

### Acceptance criteria

- [ ] Migration applied: `select is_nullable from information_schema.columns where table_name='projects' and column_name='contract_value'` → YES; the current (pre-merge) app still creates a project normally.
- [ ] Dashboard → New Project. Step 1: only a name → Continue → toast asks for PIN; Generate PIN → Continue. Step 2 (Contacts): Continue blank. Step 3 header reads "Progress tracking (optional)" and the primary button reads "Skip for now" → click. Step 4 (Review): Basics card shows the PIN; a "Progress tracking" card says "Not set up — …". Double-tap Create quickly → exactly one "Project created!" and one project; the post-create tour shows the PIN. Stopwatch from "New Project" to the tour: well under 2 minutes.
- [ ] SQL: `contract_value, start_date, end_date, planned_man_days` all NULL, `pin_hash IS NOT NULL`, zero `areas` rows.
- [ ] Office dashboard for that project, **opened from the project list**: summary bar 0% / $0 / — / —; Contract-to-date shows "No contract value set — add one in Project Info → Edit Project…"; Schedule card "No schedule dates set"; Labor "—"; SOV empty-row message; Project Health: Budget N/A, Schedule N/A "No end date set"; Analytics: no Earned Value card. Portfolio card shows "No contract value" and "—" Remaining. Ctrl+F every tab for `NaN`, `Infinity`, `undefined` → none.
- [ ] Field: company code + PIN → landing shows no "Update your areas" block, Today card "—" / "no areas", "T&M Ticket" first; fill a ticket with one worker + one item, sign, submit → appears in the office as pending. Pin "Update Progress" → reads "No areas yet", not marked completed.
- [ ] Office, project opened from the list → Project Info → Edit Project: Contract Value is blank (not "0"), PIN pre-filled → Save with no changes → "Project updated!"; field login with the same PIN still works. Edit again with contract 365000, dates, man-days 120, two areas 60/40 → Save → Overview shows contract, schedule variance, SOV rows; field landing shows both areas.
- [ ] Edit again: clear contract, remove both areas → confirm dialog names activity history / punch-list → OK → DB NULL and 0 areas, dashboard back to empty state; Cancel leaves everything unchanged.
- [ ] Validation (wizard step 3 and edit form): contract "0" → error; only a start date → error; end before start → error; one area at 60% → "must total 100%"; named area with blank weight → error; all blank → passes.
- [ ] Regression: create a project the old way (all fields, 100% areas, Excel import on step 3 — the import-review screen shows a section title, not a second step header); PIN collision returns to step 1; demo mode (no `VITE_SUPABASE_URL`) does not throw. Phone width: stepper shows only the active label; step-3 header shows "(optional)".

### Approach

Store "not set" as NULL (one-line `DROP NOT NULL`; dates are already nullable, `20241201000280_project_schedule.sql`). The display rule everywhere is `Number(contract_value) > 0`, so NULL (raw rows) and 0 (summary RPC / legacy) render identically and the UI never writes 0 (blank → NULL, "0" rejected). Rewriting the ~190-line SECURITY DEFINER summary RPC to carry NULL was rejected: riskier, and every consumer would still need the same guard. Restructure the wizard by moving fields, not rewriting: PIN card moves from `ScheduleAccessStep.jsx` (99 lines: PIN card `:68-96`, schedule card `:23-66`) into `ProjectBasicsStep.jsx`; contract value + schedule move into a new `ProgressTrackingStep.jsx` that wraps `AreasTasksStep` with an `embedded` prop; `ScheduleAccessStep.jsx` is deleted; `STEPS` becomes 4. Validation rules live once in a pure module `src/lib/projectSetupValidation.js` used by both the wizard and `useProjectEdit`. Dashboard: numeric guards only where raw NULL/undefined can arrive, honest empty copy on the three surfaces the office sees first, and Project Health treats the no-dates forecast stub as "no schedule data". Edit form: every area removable, with one `confirm()` when the save would delete DB areas (`activity_log.area_id ON DELETE CASCADE`, `20241201000020_schema_v2.sql:138`). Create button disabled for the whole async submit (today `setCreating(true)` runs only after the awaited PIN check, `Setup.jsx:158-165`).

### Changes

| File | Change |
|------|--------|
| `supabase/migrations/20261104_project_contract_value_optional.sql` | NEW: `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.projects'::regclass AND attname='contract_value' AND attnotnull) THEN ALTER TABLE public.projects ALTER COLUMN contract_value DROP NOT NULL; END IF; END $$;` No CHECK, no RLS/RPC change. |
| `supabase/MIGRATION_LOG.md` | Append row. |
| `src/lib/types/database.ts` | `:19` `contract_value: number \| null` (`npm run verify` runs `tsc --noEmit`, `package.json:19-20`). |
| `src/lib/projectSetupValidation.js` | NEW pure module: `validatePin`, `validateContractValue(raw) → { value: number\|null, error }` (blank → null; ≤ 0 or NaN → error), `contractValueToInput(v) → Number(v) > 0 ? String(v) : ''`, `validateScheduleDates` (both-or-neither, end ≥ start), `validateOptionalAreas` (untouched rows ignored; touched rows need name + weight > 0; named rows total 100 ± 0.1), `validatePhaseNames`, `isProgressTrackingEmpty`. |
| `src/components/Setup.jsx` | `STEPS` → Basics / People / Progress / Review (`:11-17`); `INITIAL_DATA.areas` one blank row; `validateStep`: case 1 = name + `validatePin`; case 2 = true; case 3 = the four validators; `handleSubmit`: loop 1..3, `setCreating(true)` before `isPinAvailable` (`:158`) with `setCreating(false)` in the collision branch, collision → `setStep(1)`, payload `contract_value: validateContractValue(...).value`, `start_date/end_date: … \|\| null` (`:188-189`), areas from `validateOptionalAreas`; `renderStep` 1/2/3/4; primary button on step 3 reads "Skip for now" when `isProgressTrackingEmpty(data)` else "Review". |
| `src/components/setup/ProjectBasicsStep.jsx` | Remove the Contract Value group (`:41-54`); add a "Foreman Access" card with the PIN input + Generate (copied from `ScheduleAccessStep.jsx:68-96`, handlers `:4-14`); header copy "Name the project and set the foreman PIN. Everything else is optional." |
| `src/components/setup/ScheduleAccessStep.jsx` | DELETE. |
| `src/components/setup/ProgressTrackingStep.jsx` | NEW: header `Progress tracking <span className="optional">(optional)</span>` + explanatory copy; card "Contract & schedule" with Contract Value (optional), Start/End (no `required`, keep `min` + inline error), Planned Man-Days; then `<AreasTasksStep … embedded />`. The bare `.optional` class is the existing global rule (`src/styles/features/schedule.css:157`); no stepper class, no CSS change. |
| `src/components/setup/AreasTasksStep.jsx` | `embedded` prop: both `.wizard-step-header` blocks (`:536-539` main, `:440-443` import review) become `h3.wizard-section-title` + muted hint "Add tasks only if you want weighted progress. Weights must total 100% if used." No logic change. |
| `src/components/setup/ReviewStep.jsx` | Basics card: drop Contract Value (`:63-66`), add Foreman PIN (Edit → step 1). Replace "Schedule & Access" (`:123-149`) and "Phases & Tasks" (`:151-210`) with one "Progress tracking" card (Edit → step 3): "Not set up — contract value, schedule and work areas can be added any time from Project Info → Edit Project." when empty, else contract/dates/man-days + the existing phase list and totals row only when `validAreas.length > 0`. |
| `src/hooks/useProjectEdit.js` | Seed `contract_value: contractValueToInput(selectedProject.contract_value)` (`:27`), add `start_date`, `end_date`, `planned_man_days`; drop the `length > 1` guard (`:67`); `handleSaveEdit`: the shared validators, `confirm()` when `removedIds.length > 0`; payload `contract_value: null when blank`, `start_date/end_date/planned_man_days` (`:128-131`); leave `pin: editData.pin \|\| null` as is. |
| `src/components/dashboard/ProjectEditForm.jsx` | Contract Value label "(optional)", input `type="text" inputMode="decimal"` with the wizard's `[^0-9.]` cleaning; new "Schedule (optional)" card with start/end/man-days; Areas copy "Optional — used for % complete and earned value. If you add areas, weights must total 100%."; totals row only when areas exist. |
| `src/hooks/useDashboardData.js` | `:335` and `:751`: `(Number(x.contract_value) \|\| 0) + changeOrderValue`. |
| `src/components/dashboard/EnhancedProjectCard.jsx` | `contractValue = Number(...) \|\| 0`, `hasContract`; profit/at-risk guarded; render "No contract value" and "—" Remaining when `!hasContract`. |
| `src/components/dashboard/ProjectSummaryBar.jsx` | Remaining renders "—" when `revisedContractValue <= 0`. |
| `src/components/dashboard/ContractToDate.jsx` | Hint "No contract value set — add one in Project Info → Edit Project to track earned vs remaining." when `revisedContractValue <= 0 && !(billable > 0)`. |
| `src/components/dashboard/ProjectHealthOverview.jsx` | `getScheduleHealth` guard `!forecast?.schedule \|\| !forecast.schedule.projectedEnd` so the no-dates stub falls into the existing "No end date set" branch. |
| `src/components/ForemanLanding.jsx` | `hasAreas`; render the "Update your areas" section (`:439-448`) only when `areasLoading \|\| hasAreas`; `getActionStatus` 'progress' (`:279`) → `{ done:false, status:'No areas yet' }` when no areas; Today card "—" / "no areas"; display-only pinned order with `'tm'` first when no areas (never written back to `fm_pinned_<projectId>`). |
| `src/components/onboarding/OnboardingWizard.jsx`, `README.md`, `docs/CODE_MAP.md` | Copy no longer promises/requires contract value and areas; CODE_MAP rows for the new step/module, Setup.jsx description corrected. |
| `src/test/projectSetupValidation.test.js`, `src/test/setupWizard.test.jsx`, `src/test/useProjectEdit.test.jsx`, `src/test/foremanLanding.test.jsx`, `src/test/dashboardEmptyProject.test.jsx`, additions to `utils.test.js` / `earnedValueCalculations.test.js` / new `forecastCalculations.test.js` | NEW (see Tests). |

### Migrations

`20261104_project_contract_value_optional.sql` — single idempotent `DROP NOT NULL` on `projects.contract_value`. No backfill, no privilege change; the summary RPC already COALESCEs; `check_project_dates` is already NULL-tolerant. Backward-compatible with the deployed front-end, so it can (must) be applied before the PR merges.

### Tests

- Unit: every validator incl. `contractValueToInput(0) === ''`; `calculateScheduleInsights` with null dates → `hasScheduleData false`, no NaN; EV and forecast math with contract 0 / no dates → finite, `projectedEnd null`.
- Component: `setupWizard.test.jsx` (mock `db.isPinAvailable/createProject/createArea/createPhase` and `useTradeConfig`) — skip path creates with the four NULLs and no area/phase calls; 4 stepper buttons; "Skip for now"; Review "Not set up" + PIN; PIN collision → step 1 with Create disabled during the check; "0" rejected. `useProjectEdit.test.jsx` (renderHook) — RPC-shaped row with `contract_value: 0` seeds `''` and saves NULLs; removing a DB area needs `confirm`; start-only date blocks. `foremanLanding.test.jsx` — zero areas hides the section, "—"/"no areas", T&M first, "No areas yet"; one area restores. `dashboardEmptyProject.test.jsx` — the five surfaces render with no `NaN|Infinity|undefined` and the expected copy.
- `npm run verify` green. Manual: the acceptance checklist.

### Risks

- Summary rows carry 0 for NULL; a legacy row with a genuine stored 0 (none can be created through the UI) saves back as NULL — equivalent under the display rule.
- Clearing areas now deletes `activity_log` rows and unlinks CORs/punch items/draw lines (`ON DELETE SET NULL`); mitigated by the confirm.
- Pre-existing, left as is: saving the edit form with a blank PIN sends `pin: null` and the hash trigger (`20260423_pin_hashing.sql`) locks the field crew out; the field is pre-filled so it cannot be cleared by accident.
- Any `contract_value` consumer added after this plan must guard; the DOM sweep and smoke tests catch regressions.
- Pre-existing, out of scope: Project Health cash-flow "critical 0.0x" with zero outflows; wizard vs edit form `work_type`/`job_type` value sets disagree.
- Exports with zero areas (AIA G703, Sage SOV, draw request) produce empty continuation sheets — expected for T&M-only jobs.

### Open questions (proposed defaults)

1. NULL vs 0 for "no contract value"? **Default: NULL** (honest in DB/exports; one-line migration).
2. PIN on the Basics step (4 steps) vs a dedicated Access step (5)? **Default: Basics**; the post-create tour already spotlights the PIN.
3. Dates both-or-neither vs start alone? **Default: both-or-neither.**
4. Refuse a blank PIN on the edit form? **Default: leave as is** (some offices may use it to disable field access).

---

## 3. Offline T&M submit: make it work (scoped) or remove the claim

### Problem

The offline path exists in pieces that were never wired together. `createTMTicket`'s offline branches (`src/lib/db/tmOps.js:233-252`, `:275-291`) queue `ticket._workers`/`ticket._items`, but `TMForm.handleSubmit` (`src/components/TMForm.jsx:997`) never passes them; it then treats the temp id as real, calls `uploadPhoto`/`addTMWorkers` (`:1045`, `:1089`), fails, tries `deleteTMTicket` (`:1133`) and shows "Error submitting Time and Material ticket" (`:1138`) while a hollow ticket is silently queued and the draft invites a resubmit → duplicate. Sync is three non-atomic requests with only local idempotency (`src/lib/offlineManager.js:465-571`), no server dedupe key, no signature, nothing visible in the field UI, and "offline" is detected by `navigator.onLine`, so a dead radio waits 60–75 s with no AbortSignal. Meanwhile the landing page says "Works Offline" / "Offline-First" (`HeroSection.jsx:50`, `FeatureGrid.jsx:26`, `CapabilityStrip.jsx:9`), the in-form modal says "Offline Ready" (`TMCapabilitiesModal.jsx:27`) and `index.html:7` says "works offline".

### Acceptance criteria

Setup: founder checklist 12–15; installed PWA on iOS Safari and Android Chrome; app launched online once after the deploy.

- [ ] Airplane mode, already-logged-in foreman, project with custom labor classes previously loaded online: open the app (no login screen), T&M, labor-class sections still render (cache). Description, 2 workers (8h + 2h OT), 1 material qty 3, optional COR, name, Submit → within 1 s step 5 "Saved on this phone" / "Will sync automatically when you have signal"; no error toast; `localStorage` draft `tm_draft_<projectId>` removed.
- [ ] Dead radio (Wi-Fi without internet or `*.supabase.co` blocked): same submit reaches "Saved on this phone" within ~15 s, not a minute-long spinner.
- [ ] On step 5, "Foreman signature required" → sign → "Signature saved"; Done available; client-signature options hidden with the note "Client signature is available after the ticket syncs".
- [ ] Done → no error toast; home T&M card "1 waiting to sync"; home banner "1 ticket saved on phone"; bottom indicator "Offline · 1 ticket saved on phone".
- [ ] Force-quit and reopen offline → all three still show 1.
- [ ] Second ticket with 2 photos → Submit shows "No signal. Save the ticket without the 2 photo(s)? …"; Keep editing leaves step 4 with photos; Save without photos → step 5 pending; card shows 2.
- [ ] Airplane mode off, app in foreground: within ~15 s "Syncing 2 tickets…" then "Synced 2 tickets"; card 0. Office TMList shows exactly 2 new tickets, each once, status `foreman_signed`, with workers (hours/OT/role/labor class), material, notes, date, name, signature image/name/date, COR link if chosen; ticket 2 has no photos.
- [ ] Exactly-once: IndexedDB `fieldsync-offline > pending_tm_tickets` is empty after sync. Repeat offline, go online and kill the app the instant the banner says Syncing; reopen → the ticket appears once in the office, store empty.
- [ ] Expired session: log in without "remember me"; in SQL set `expires_at = now() - interval '1 minute'` on the `field_sessions` row; offline, create a ticket; go online → toast "Your field session expired. Enter your PIN to sync 1 saved ticket." and the field login screen (no auto-resume); enter the company code and PIN → ticket syncs once.
- [ ] Regression online: 3 photos upload, step 5 shows success, office sees photos. Office dashboard "New T&M Ticket": works; with laptop Wi-Fi off, Submit shows the error toast and stays on step 4 (no "saved on phone"); Wi-Fi on, Submit again → exactly one ticket.
- [ ] Landing page, in-form capabilities modal and the PWA checklist show the reduced copy.
- [ ] `supabase/tests/create_tm_ticket_full_tests.sql` all PASS on the branch.

### Approach

Scope down: ship a "saved locally, will sync" ticket with description, crew with hours (incl. custom labor classes), materials, COR link, trade custom fields and the foreman signature; photos are explicitly excluded offline (an explicit dialog, never silent loss) and all copy is reduced to match. Server: one idempotent, atomic, SECURITY INVOKER RPC `create_tm_ticket_full(p_payload jsonb)` plus a `client_submission_id` column with a partial unique index; the function returns the existing row tagged `replayed: true` for a repeated id and raises `42501` when `can_access_project` fails (the `x-field-session` header is read by `validate_field_session` via `request.headers`, `20260218_secure_field_rls.sql:128`, and `getFieldClient` sets it globally, `fieldSession.js:174`, so it applies to `rpc()`). Because `20260416_fix_disposal_load_error.sql` CASCADE-dropped the T&M field policies and only re-created disposal ones, the migration re-asserts them idempotently. Client: one local record per ticket in a new IDB store `pending_tm_tickets` (keyed by `client_submission_id`) with a state machine `queued → syncing → synced → deleted` (or `needs_auth` / `failed`); server-side dedupe turns at-least-once into exactly-once. Build-then-send in `TMForm`: try the RPC with a 12 s AbortController; on a network-class failure (postgrest wraps fetch failures as `{ message: 'TypeError: Failed to fetch', code: '' }`) and only in field mode, save locally and show step 5 pending; office users keep the error toast. The RPC response is the commit point: draft cleared and step 5 reached regardless of later photo/COR outcomes — no create-then-attach, no orphan cleanup. Signature on a pending ticket is written into the record inside one IDB transaction, or, if the record is already `synced`, sent to the server directly; the sync routine re-reads and applies any signature the server row lacks before deleting. Drains run on startup/online/foreground and after PIN login, with bounded 5 s/15 s/45 s re-tries when the "online" event fires before the radio is routable; on `42501` for the current project the session is cleared and the app navigates to the PIN screen. Labor classes are cached so an offline resume of a custom-class draft renders and submits. Rejected: fixing the legacy action (still non-atomic, no server idempotency, invisible), a DEFINER RPC (adds privilege surface for nothing), bumping `sw.js` `CACHE_NAME` (assets are cached on fetch, `public/sw.js:66-73`; the bump forces a reload that races QA), Background Sync (no iOS).

### Changes

| File | Change |
|------|--------|
| `supabase/migrations/20261104_offline_tm_submit.sql` | NEW. See Migrations. |
| `supabase/rollbacks/20261104_offline_tm_submit_rollback.sql` | NEW: drop function, index, column; leave the re-asserted policies/grants (say so in the header). |
| `supabase/MIGRATION_LOG.md` | Append row. |
| `supabase/tests/create_tm_ticket_full_tests.sql` | NEW `BEGIN … ROLLBACK` script using the `_run_rls_test` harness; simulates roles (`SET LOCAL ROLE anon` + `set_config('request.headers', '{"x-field-session":"<token>"}', true)`; `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true)`; `RESET ROLE` between cases). Asserts: (0) `pg_policies` has `can_access_project` INSERT/SELECT policies on the three tables; (a) same id + `replayed` false→true, one row, N workers (one with `time_started '08:00'`), M items; (b) no header → 42501; (c) `workers=[]` → 22023; (d) signature → `foreman_signed`, non-PNG → 22023; (e) foreign-company authenticated → 42501; (f) `assigned_cor_id` → exactly one junction row (trigger `trg_sync_ticket_to_junction`, `20241230_reverse_ticket_cor_sync.sql`), none on replay; (g) bogus `material_equipment_id` → zero ticket rows (atomic). |
| `src/lib/offlineManager.js` | `DB_VERSION` 2→3 (`:9`); `STORES.PENDING_TM_TICKETS`; `onupgradeneeded` creates it (keyPath `client_submission_id`, indexes `project_id`, `state`) and clears the never-read `tm_tickets` store. Exports: `cacheData/getCachedData`; `savePendingTMTicket`, `getPendingTMTicket(s)`, `updatePendingTMTicket`, `deletePendingTMTicket`, `attachSignatureToPendingTicket` (one readwrite tx; `{ synced: true, server_ticket_id }` without writing when already synced); `getPendingSyncSummary` (zeros when IDB unavailable — jsdom); `classifySyncError` ('auth' for `42501`/`PGRST301`/jwt; 'network' for offline, empty-code fetch/Load failed/abort/timeout messages, `AbortError`/`TimeoutError`; else 'server'); `syncPendingTMTickets(db, { projectId })` (sequential; `syncing` → RPC with 30 s timeout → `synced` + `server_ticket_id` → emit `ticket_synced` → apply a locally captured signature via `db.saveTMForemanSignature` if the server row lacks it → COR import / custom fields best-effort → delete; network error → back to `queued`, `scheduleRetry()`, break; auth → `needs_auth`, emit `session_expired` for the current project; server → `failed` with attempts/last_error; crash-left `syncing` records are treated as queued); `scheduleRetry` (5 s/15 s/45 s) + `registerTicketDrain(fn)`; `requeueNeedsAuthTickets(projectId)`; `onSyncStateChange` event bus. Legacy `syncPendingActions`/`processAction` untouched. |
| `src/lib/db/tmOps.js` | `submitTMTicketFull(record, { timeoutMs = 12000 })`: builds the payload (sanitized text; raw base64 signature; client-side PNG-prefix / 2,000,000-char mirror check), `client.rpc('create_tm_ticket_full', { p_payload }).abortSignal(controller.signal)`, throws the supabase error object (code preserved). `createTMTicket` (`:230`): delete both offline branches (`:233-252`, `:275-291`); keep the plain insert for the legacy action; drop `cacheTMTicket` import (`:12`). |
| `src/lib/db/laborOps.js` | `getLaborClassesForField`: cache the result under `labor_classes_<companyId>` on success; serve the cache when RPC and fallback both fail. |
| `src/lib/db/client.js`, `src/lib/supabase.js` | Re-export the new helpers; `drainPendingActions` (`supabase.js:222`) also runs `syncPendingTMTickets(db, { projectId: getFieldProjectId() })`; `registerTicketDrain(drainPendingActions)`; keep the three triggers (`:235-244`). |
| `src/hooks/useAuthState.js` | `handleForemanAccess`: `requeueNeedsAuthTickets(project.id)` then drain. New effect on `session_expired`: `clearFieldSession()`, reset foreman state, toast, `navigate('/login/field', { replace: true })` (FieldLogin's auto-resume returns early once the session is gone). |
| `src/components/TMForm.jsx` | `clientSubmissionId` state (`crypto.randomUUID()`, persisted in the draft); `pendingPhotoDialog`; `saveDraft`/`resumeDraft` include `dynamicWorkers`, `activeLaborClassIds`, `customFieldValues`, `clientSubmissionId`; extract `uploadTicketPhotos(ticketId)`; rewrite `handleSubmit` (`:960-1142`): build the record, offline + field mode → photo dialog if needed → `savePendingTMTicket` → `clearDraft()` → step 5 pending; online → `db.submitTMTicketFull(record)`; network-class error + field mode → same local save; office → error toast, stay on step 4, same id on retry; after the RPC: `clearDraft()`, `replayed` → "This ticket was already submitted" + step 5 without re-upload; else custom fields, photos, COR import best-effort → step 5. Delete the `addTMWorkers/addTMItems` block (`:1086-1104`) and the `deleteTMTicket` cleanup (`:1131-1137`). Subscribe to `ticket_synced` to swap `submittedTicket` to the real row. Pass `pendingSync` and `clientSubmissionId` to ReviewStep; hide the skip-client-signature button when pending. |
| `src/components/tm/ReviewStep.jsx` | Static import of `TMForemanSignature` (`:17` is lazy — its chunk is only cached if the modal was opened online before). Pending mode: heading "Saved on this phone", hide client-signature cards/modals, note "Client signature is available after the ticket syncs"; `saveSignature` prop → `attachSignatureToPendingTicket`, or `db.saveTMForemanSignature(server_ticket_id, sig)` when already synced. |
| `src/components/TMForemanSignature.jsx` | Optional `saveSignature` prop; `handleSave` (`:207`) calls it when present, else `db.saveTMForemanSignature(ticketId, sig)`. |
| `src/components/tm/translations.js` | en/es: `savedOnPhone`, `willSyncWhenSignal`, `clientSignatureAfterSync`, `noSignalPhotosTitle/Body`, `saveWithoutPhotos`, `keepEditing`, `couldNotSaveLocally`, `alreadySubmitted`. |
| `src/components/OfflineIndicator.jsx` | Summary-based rendering with precedence offline → needs_auth ("Sign in to sync N ticket(s)") → failed ("N ticket(s) could not sync — tell the office") → syncing → synced (only on a `sync_complete` with `synced > 0`); ticket states only in field mode; every IDB read in try/catch (`appNav.test.jsx` renders the real App without IDB). |
| `src/components/ForemanView.jsx` | `loadPendingTMTickets()` separate from `loadTodayStatus` (which is one `Promise.all` over network reads and never sets state offline), called on mount, `returnHome`, and sync events; skip the "Unable to refresh" toast when offline; pass `pendingTmTickets`. |
| `src/components/ForemanLanding.jsx` | Replace the direct `getPendingActionCount` import (`:9`) with `getPendingSyncSummary` + `onSyncStateChange` via `../lib/supabase`; T&M card badge "N waiting to sync"; banner shows ticket count / "Sign in to sync" / "could not sync" / "Syncing N…". |
| `src/components/tm/TMCapabilitiesModal.jsx`, `index.html`, `src/components/landing/{HeroSection,FeatureGrid,CapabilityStrip}.jsx` | Reduced copy (founder checklist 14). |
| `docs/PWA_PHONE_TEST_CHECKLIST.md` §5, `docs/ARCHITECTURE.md` §7, `docs/DEVELOPER_GUIDE.md` | Checklist matches the criteria above (no photo in the offline step; launch online once after a deploy); ARCHITECTURE describes `pending_tm_tickets` + `create_tm_ticket_full` instead of the fictional `queueAction` API; IDB name `fieldsync-offline`. |
| `package.json` | devDependency `fake-indexeddb ^6.0.0`. |
| `src/test/offlineTMTickets.test.js`, `src/test/tmOpsSubmitFull.test.js`, `src/test/tmFormOfflineSubmit.test.jsx`, `src/test/foremanLandingPending.test.jsx`, `src/test/useAuthState.test.jsx` (extend mock), `src/test/fieldOfficeSyncAudit.test.js` (extend) | NEW / extended (see Tests). |

### Migrations

`20261104_offline_tm_submit.sql`: (1) `ALTER TABLE t_and_m_tickets ADD COLUMN IF NOT EXISTS client_submission_id UUID`; partial unique index where not null. (2) Re-assert `Secure field view/create/update tickets`, `view/create workers`, `view/create items` (DROP IF EXISTS + CREATE, text of `20260228_fix_foreman_auth_errors.sql:362-411`) and `GRANT SELECT, INSERT, UPDATE ON t_and_m_tickets` / `SELECT, INSERT ON t_and_m_workers, t_and_m_items TO anon, authenticated` (permissive policies OR together — cannot narrow production). (3) `create_tm_ticket_full(p_payload JSONB) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, extensions, pg_temp`: required `project_id`/`client_submission_id` (22023); `can_access_project` else 42501; ≥1 worker; signature PNG-prefix + ≤ 2,000,000 chars; existing row by `client_submission_id` → `to_jsonb(row) || {replayed:true}`; insert ticket (status `foreman_signed` when a signature is supplied else `pending`, `photos '[]'`, `left()`-truncated text) catching `unique_violation`; workers/items via `jsonb_populate_recordset(NULL::t_and_m_workers / NULL::t_and_m_items, …)` so Postgres coerces the real column types; returns `{…, replayed:false}`. (4) `REVOKE ALL … FROM PUBLIC; GRANT EXECUTE … TO anon, authenticated`. Pre-deploy checks: founder checklist 12.

### Tests

- `offlineTMTickets.test.js` (`fake-indexeddb/auto`, fake timers): save/list; sync writes `synced` + id, emits, deletes; second run makes no RPC; network error leaves `queued`, schedules 5/15/45 s retries, stops after success; abort/timeout classify as network; 42501 → `needs_auth` + one `session_expired` for the current project only; `requeueNeedsAuthTickets` scope; server error increments attempts, 10 → skipped and counted failed; signature attach before/after `synced`; signature attached mid-RPC is applied before delete; COR import not on replay; summary counts; DB upgrade from v2.
- `tmOpsSubmitFull.test.js`: payload shape incl. raw long signature; AbortSignal + timeout → network; error object propagated; non-PNG rejected before rpc; `createTMTicket` no longer returns a temp id; labor-class cache.
- `tmFormOfflineSubmit.test.jsx`: online field → RPC then uploads then step 5; network error → local save, step 5 "Saved on this phone", draft removed; never-resolving RPC → saved after timeout; photo dialog both branches; office → toast, step 4, no local save, same id on retry; `replayed` → toast, no uploads; photo upload failure after RPC → draft cleared, step 5, warning; draft round-trip incl. custom-class workers from cache; pending step 5 signature paths; `ticket_synced` swap.
- `useAuthState.test.jsx`: requeue + drain after PIN login; `session_expired` clears session, toasts, navigates.
- `foremanLandingPending.test.jsx`: "1 waiting to sync", banner states; ForemanView sets the count with `getCrewCheckin` rejecting.
- SQL: `create_tm_ticket_full_tests.sql` all PASS. `npm run verify` green. Manual: the acceptance checklist.

### Risks

- Non-remembered sessions expire 24 h after PIN login with no local `expiresAt`; a foreman offline overnight gets the PIN screen on reconnect (draft autosave preserves in-progress work). Encourage "remember me".
- Records for another project sit in `needs_auth` ("Sign in to sync N") until someone logs into that project on that device.
- Offline cold start requires the current build's chunks to be cached from a previous online visit (`sw.js` caches on fetch, no precache manifest); first launch after a deploy must be online.
- Assignable CORs and "same as yesterday" crew are not cached; only labor classes are.
- A 12 s client timeout can abort a request the server committed; the replay returns the existing row and the drain applies the locally captured signature — still one ticket.
- `custom_field_data` is authenticated-only; field submissions already lose custom fields silently; unchanged.
- Legacy `pending_actions` `CREATE_TM_TICKET` entries already on devices still sync as hollow tickets; rare, office deletes them.
- `jsonb_populate_recordset` coercion errors surface as `failed` ("could not sync — tell the office"), not loops.
- Estimate grew from 3.5 to 4.5 days for the counters, labor-class cache, session recovery and bounded timeout/backoff — all needed to make the criteria true.

### Open questions (proposed defaults)

1. Ship with or without offline photos? **Default: without** (this plan). Adding the photo stage later ≈ 0.75 day on the same record, no schema change.
2. On an expired session, redirect to the PIN screen automatically or only show a tappable banner? **Default: redirect** — every other save on the device fails too.
3. May an unsigned pending ticket sync as `pending`? **Default: yes** (RPC derives status; UI still requires the signature before Done; an app kill before signing does not lose the ticket).
4. Retry ceiling and failure wording? **Default: 10 attempts, "N ticket(s) could not sync — tell the office".**
5. Final copy wording? **Default: as in founder checklist 14.**

---

## 4. Office corrects a T&M ticket without deleting it

### Problem

There is no edit path for a T&M ticket anywhere in the office UI or data layer: `tmOps.js` exposes only status/photo/signature writes (`updateTMTicketStatus :434`, `approveTMTicket :453`, `rejectTMTicket :490`, `updateTMTicketPhotos :519`) and insert-only workers/items (`addTMWorkers :299`, `addTMItems :322`); `TMTicketCard.jsx`'s action bar (`:268-345`) has Approve/Reject/Signature Link/Mark Billed/Restore/Retry Sync/Delete and no Edit. Fixing a wrong hour count means Delete + re-create, which loses foreman/client/GC signatures, approval, `change_order_value`, the COR association, photos and custom fields. The office creation form cannot be reused (two incompatible crew shapes, a draft key shared with the field, always creates). Lock checks are client-side and fail-open (`isTicketEditable`, `tmOps.js:610-645`, returns editable on any error), and the base T&M tables and their live policies are not in the repo, so any edit must be a server-side transaction that enforces its own rules.

### Acceptance criteria

Setup: two office profiles A and B (active members), a phone PIN session for the same project; Supabase branch with the migration and `rls_policy_tests.sql` green.

- [ ] Field creates a ticket (2 workers: 8h; 8h + 2h OT; 1 catalog material qty 3; CE/PCO "PCO-7"), foreman-signs it. Office A: Financials → T&M → List view → expand → "Foreman" badge, status Foreman Signed, **Edit** first in the action bar.
- [ ] Edit opens prefilled (date, PCO-7, description, both workers with class and hours, qty 3); banner says saving will mark it "Edited after signature".
- [ ] Change worker 2 OT to 0, add "Jane Doe" Laborer 4h, qty → 5, PCO-8, reason "Foreman double-counted OT" → Save → "Ticket updated"; card shows 3 workers, qty 5, PCO-8, amber "Edited after signature" badge, notice "Edited by <A> on <today> — Foreman double-counted OT. Signatures were captured before this edit."; Foreman badge still present. SQL: `edit_count 1`, `edited_after_signature true`, `edited_by_user_id` = A, `edited_by_name` = A's profile name, note stored; `t_and_m_ticket_edits` row with `contents_changed true` and 2 workers in `before_snapshot`.
- [ ] Edit again, description only → "(2 edits)", second edit row `contents_changed false`.
- [ ] Realtime: with the modal open and text typed, the phone submits another ticket → A's list updates without skeletons and the modal keeps the text; Save succeeds.
- [ ] COR re-sync: link the ticket to a draft COR; B opens the COR detail; A edits hours 8→6 and qty 5→2 → B's COR shows 6 h / qty 2 / lower total, no duplicate lines; association `completed/true/null`; latest `cor_status_history` note "T&M ticket … edited by …".
- [ ] Notes-only edit on a COR-linked ticket after B hand-edited a ticket-sourced line's rate → the line and rate unchanged, no new history row.
- [ ] Interrupted re-sync: change hours, Save, close the tab immediately → on reload the card shows "Import Failed" + "Retry Sync"; COR detail shows no lines from this ticket; Retry Sync → lines reappear with new hours, badge clears.
- [ ] Lock: COR approved by B → lock badge, no Edit button; console `supabase.rpc('update_tm_ticket_contents', …)` → "This ticket is locked: linked to COR-xxx which is approved".
- [ ] Approved ticket at its computed value: edit hours → billable block with checkbox **checked** → save → Change Order Value recomputed, status stays Approved, Billing shows the new amount. Approved at a manually typed $1,000: checkbox **unchecked** with the manual-entry note → save without ticking → still $1,000. Description-only edit → no billable block.
- [ ] Billed: Edit disabled with tooltip; console RPC → "This ticket has been billed…". Invoiced-but-still-approved (invoice created, then `UPDATE t_and_m_tickets SET status='approved'`): Edit opens, Save → "This ticket is on invoice INV-… and can no longer be edited".
- [ ] Validation: cleared description / no workers / item qty 0 → Save disabled; Escape closes without changes.
- [ ] Security: field session RPC call → permission error; office user of another company → "Not authorized for this project"; as A `supabase.from('t_and_m_tickets').update({ edited_after_signature: false, edit_count: 0 })` → "Edit audit columns can only be changed through update_tm_ticket_contents()"; `rls_policy_tests.sql` all PASS.
- [ ] Regression: office "New T&M Ticket", approve/reject/restore/delete/Link COR/Retry Sync/Signature Link, exports, the public `/sign/:token` page for an edited ticket shows current workers/items, CORDetail still auto-imports a freshly linked ticket; Dashboard view totals reflect edited hours; B's open list shows the Edited badge without skeletons.

### Approach

A compact office-only modal (`tm/TMTicketEditModal.jsx`, flat state) opened from a new Edit button, orchestrated in `TMList` next to the existing modals, backed by one atomic SECURITY DEFINER RPC `update_tm_ticket_contents` that owns the COR-side consequences. The RPC re-checks `auth.uid()` + `can_access_project`, refuses billed / invoiced (`invoice_items` with `item_type='tm_ticket'`, `src/components/billing/InvoiceModal.jsx:66`) / COR-locked tickets, validates payload and company ownership of class/material ids, replaces workers and items, stamps server-derived audit columns and writes a before/after snapshot row. COR re-sync without a race: only when the worker+item snapshots differ and the ticket is COR-linked, the RPC deletes the ticket-sourced `change_order_labor/materials/equipment` rows (recalc triggers fire immediately, so the COR is never priced on stale hours) and marks the association `import_status='failed'` **with `data_imported = true`**, so the existing Import Failed + Retry Sync UI lights up, `CORDetail`'s auto-import (`src/components/cor/CORDetail.jsx:49-56`, which only imports `!data_imported`) stays out, and `importTicketDataToCOR`'s skip guard lets the re-import run; `TMList` then calls plain `importTicketDataToCOR` exactly like Retry Sync. Audit columns on a table with a column-unrestricted UPDATE policy are forgeable, and column-level REVOKE cannot subtract from a table grant, so a BEFORE UPDATE trigger raises when `current_user IN ('anon','authenticated')` changes any of the six columns (the definer RPC, `service_role` and the SQL editor still can). `edited_by_name` comes from `users` (falling back to the login email) server-side. Realtime: `loadTickets` gains `{ silent }` so events no longer swap the list for skeletons (`TMList.jsx:1207`) and unmount modals; a ref defers the reload during a save. Policy logic (`getTicketEditability`, `hasAnySignature`) lives in `src/lib/tmStatus.js`.

### Changes

| File | Change |
|------|--------|
| `supabase/migrations/20261105_tm_ticket_office_edit.sql` | NEW; template of docs/migration-workflow.md:108-172 (PURPOSE / AFFECTED TABLES / PRE-FLIGHT / body / POST-MIGRATION VERIFICATION). See Migrations. |
| `supabase/rollbacks/20261105_tm_ticket_office_edit_rollback.sql` | NEW: drop function, trigger + function, table, six columns (COR line deletions by edits are data and are not reverted). |
| `supabase/MIGRATION_LOG.md` | Append row; include the pre-check output in the note. |
| `supabase/tests/rls_policy_tests.sql` | Add `t_and_m_ticket_edits` to TEST 1's table list; before the report banner add: anon lacks / authenticated has EXECUTE on `update_tm_ticket_contents(uuid,jsonb,jsonb,jsonb,text)`; `trg_protect_tm_edit_audit` exists on `t_and_m_tickets`; zero non-SELECT policies on `t_and_m_ticket_edits`. |
| `src/lib/tmStatus.js` | Export `hasAnySignature(ticket)`, `TM_COR_STATUSES_ALLOWING_TICKET_EDIT = ['draft','pending_approval']`, `getTicketEditability(ticket, lockInfo) → { editable, reason?, warnings[], flagsAfterSignature }` (locked → reason; billed → "This ticket has been billed and can no longer be edited."; warnings for signed / COR-linked / approved). |
| `src/lib/db/laborOps.js` | `getLaborClasses(companyId, { includeInactive = false })` — omit `.eq('active', true)` when true; default unchanged. |
| `src/lib/db/tmOps.js` | `updateTMTicketContents(ticketId, { fields, workers, items, editNote })` → `rpc('update_tm_ticket_contents', { p_ticket_id, p_fields, p_workers, p_items, p_edit_note })` with sanitized/normalized payload (no `edited_by_name` sent), `observe.error/activity`, returns `{ ticket, contents_changed, cor_resync_required }`. `getTMTicketById(id)` with the same nested select as `getTMTicketsPaginated` (`:82-87`). `isTicketEditable` uses the shared constant (`:630`). |
| `src/components/tm/TMTicketEditModal.jsx` | NEW: date / CE-PCO / description; workers table (name, class select with inactive "(inactive)" and legacy "(current)" options, reg/OT hours, remove, add); items (read-only name, qty, remove; add from active catalog or custom item); "Reason for edit (optional)"; banner from `getTicketEditability`; billable block only for `approved` tickets when crew/materials changed: `calculateTicketValue` on the ticket's own nested `materials_equipment` (as approval did) vs recomputed, checkbox default checked only when the stored value equals the open-time computed value; validation (description, ≥1 worker with hours, no negatives, qty > 0, valid date); Cancel / Save changes disabled while saving. |
| `src/components/tm/TMTicketCard.jsx` | `onEdit` prop; Edit button first in the action bar (`:268`), disabled with tooltip when not editable, absent when locked; header badge "Edited" or amber "Edited after signature"; expanded notice "Edited by {name} on {date} — {note} (N edits). Signatures were captured before this edit."; aria-label suffix. |
| `src/components/TMList.jsx` | `loadTickets(pageNum, reset, { silent })` (`:104`); realtime callback (`:178`) uses the silent reload and defers while `savingEditRef`; `editingTicket`/`savingEdit` state; `handleOpenEdit`; `handleSaveEdit` (RPC → `importTicketDataToCOR` when `cor_resync_required` → `markImportFailed` on failure → `getTMTicketById` → update `tickets` and `failedImports` via `getTicketImportStatus` → toast; `P0001`/`42501` messages shown verbatim; deferred reload in `finally`); render the modal after the COR Association Modal with `key={editingTicket.id}`. |
| `src/styles/features/tm-tickets.css` | `.tm-edited-badge` (+ `.after-signature`), `.tm-edit-notice`, `.tm-edit-banner`, modal grid rows, `.tm-edit-billable`, phone breakpoint. |
| `docs/CODE_MAP.md`, `docs/ID_REFERENCE.md` | New module row; `t_and_m_ticket_edits` in the FK tree. |
| `src/test/tmStatus.test.js`, `src/test/tmOpsEdit.test.js`, `src/test/laborOps.test.js`, `src/test/tmTicketEditModal.test.jsx` | NEW (see Tests). |

### Migrations

`20261105_tm_ticket_office_edit.sql`:

- PRE-FLIGHT `DO` block: required tables (`t_and_m_*`, `change_order_ticket_associations`, `invoice_items`, `users`, `cor_status_history`) and `can_access_project(uuid)` exist; column types match the recordset declarations (adjusted from founder checklist 4 — `hours`/`overtime_hours` numeric, `time_started`/`time_ended` text or time, `quantity` numeric, `change_order_value` numeric, `work_date` date); `RAISE NOTICE` one line per live policy/grant on the three tables.
- Columns: `edited_at TIMESTAMPTZ`, `edited_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL`, `edited_by_name TEXT`, `edit_count INTEGER NOT NULL DEFAULT 0`, `edited_after_signature BOOLEAN NOT NULL DEFAULT false` (sticky), `last_edit_note TEXT`.
- `protect_tm_edit_audit_columns()` BEFORE UPDATE trigger: raise `42501` when `current_user IN ('anon','authenticated')` and any of the six is `IS DISTINCT FROM OLD`.
- `t_and_m_ticket_edits` (id, ticket_id FK CASCADE, edited_by_user_id, edited_by_name, edited_at, note, had_signature, contents_changed, before_snapshot JSONB, after_snapshot JSONB); index; RLS; one SELECT policy `TO authenticated USING (EXISTS (… can_access_project(t.project_id)))`; `REVOKE ALL FROM anon; GRANT SELECT TO authenticated`; no client write policy.
- `update_tm_ticket_contents(p_ticket_id UUID, p_fields JSONB, p_workers JSONB, p_items JSONB, p_edit_note TEXT DEFAULT NULL) RETURNS JSONB SECURITY DEFINER SET search_path = public, extensions, pg_temp`: auth.uid() required (42501); payload shape + ≤ 200 rows; `SELECT … FOR UPDATE`; `can_access_project`; refuse `billed`, invoiced (`invoice_items ii JOIN invoices i … item_type='tm_ticket' AND reference_id = ticket`, message names the invoice), COR not in draft/pending_approval; validate workers (≥1 with hours, none negative, `labor_class_id` in company), items (qty > 0, name or id, `material_equipment_id` in company); `v_had_sig`; name from `profiles` (fallback `auth.users.email`); content-ordered before snapshot; UPDATE fields + audit columns; DELETE/INSERT workers and items via `jsonb_to_recordset`; after snapshot; `v_contents_changed`; if changed and COR-linked: delete ticket-sourced COR lines, `UPDATE change_order_ticket_associations SET data_imported = true, import_status = 'failed', import_failed_at = NOW(), import_error = 'Ticket edited - COR cost lines must be re-synced'`, insert `cor_status_history` note; insert the edits row; return `{ticket, contents_changed, cor_resync_required}`. `REVOKE ALL … FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated`.
- POST-MIGRATION `DO` block: columns, trigger, RLS on the new table, function privileges (anon false / authenticated true), `search_path` proconfig.

### Tests

- `tmStatus.test.js`: lock / billed / approved / signed / COR-linked / pending / rejected cases of `getTicketEditability`; `hasAnySignature`; the constant.
- `tmOpsEdit.test.js` (mock `../lib/db/client`): exact RPC payload keys, no `edited_by_name`, normalization (`''` → null CE/PCO, HTML stripped, `'8'` → 8, role default, qty parse, `change_order_value` only when provided), error propagation + `observe.error`; `getTMTicketById` chain.
- `laborOps.test.js`: `includeInactive` omits the `active` filter; default unchanged.
- `tmTicketEditModal.test.jsx`: prefill; inactive/current class options; Save gating; payload shape on save; signed/COR banners; billable block absent until crew changes, unchecked when negotiated (500 vs computed 430), checked when equal, omitted/included accordingly; description-only edit shows no block; saving disables footer.
- SQL: `rls_policy_tests.sql` additions all PASS. `npm run lint && npm test`. Manual: the acceptance checklist.

### Risks

- Live RLS on the T&M tables is unknown to the repo; if production grants `authenticated` UPDATE/DELETE on workers/items, the RPC's refusals are advisory for hand-written client writes (the office client makes none). The pre-flight prints the live state; restricting direct writes would be a separate migration.
- Wrong column types in `jsonb_to_recordset` fail at first use; the pre-flight assertion fails the migration loudly instead.
- SECURITY DEFINER bypasses RLS: any omission in the function's own checks is a tenant hole; code review must cover the body.
- Under-pricing window between the RPC and the client re-sync is normally milliseconds; if the re-sync never runs the T&M list shows Import Failed, but CORDetail shows the lower total with no label (follow-up).
- Crew/material edits regenerate ticket-sourced COR lines at current rates and discard office adjustments to those lines (modal warns); a `pending_approval` COR with an outstanding GC link can change total before signing.
- Residual race: two office users clicking Retry Sync for the same ticket within a second — pre-existing.
- Edited tickets keep a signature captured for different content; the sticky flag, notice and snapshot are the mitigation; COR PDFs/signing page do not show the flag yet.
- The audit trigger keys on `current_user`; a future definer RPC that writes client-supplied audit columns would bypass it.

### Open questions (proposed defaults)

1. Edit approved tickets with warnings + the billable checkbox? **Default: yes** (alternative: reject → edit → re-approve).
2. Block editing of billed or invoiced tickets entirely? **Default: yes**; corrections after invoicing go through a credit/re-bill.
3. Keep the `t_and_m_ticket_edits` snapshot table (write-only, no UI)? **Default: yes** — it is the only record of what a signer actually signed.
4. Tickets linked to a `pending_approval` COR stay editable with the warning? **Default: yes** (parity with `isTicketEditable`).
5. Trade custom fields and `cost_code_id` editable? **Default: out of scope.**
6. Show "Edited after signature" on CORDetail / COR PDFs / signing page? **Default: follow-up.**
7. Revoke pending signature requests when a signed ticket is edited? **Default: no** — pending links render live data.

---

## 5. Transactional email (Resend) for signature links and approval events

### Problem

There is no outbound email path: no `supabase/functions`, no `config.toml`, no pg_net/pg_cron/Vault usage anywhere; `.env.example:18-19` only names `RESEND_API_KEY` / `EMAIL_FROM`. "Send for signature" is a `mailto:` handoff that toasts "Outlook opened" (`src/components/SignatureLinkGenerator.jsx:134-136`); signing notifies nobody; a field ticket submission notifies nobody (`NotificationSettings.jsx:6-8` stores preferences no code reads); rejections store a reason from `window.prompt` (`TMList.jsx:288`) that accepts "" and that the foreman never sees. Attaching email to `signature_requests` is unsafe until the anonymous write path is closed: `20250101_signature_anon_access.sql:19-31` still lets any anon caller INSERT a request for any tenant or PATCH any pending one (only SELECT was revoked in `20260423`), which would turn FieldSync into an open relay.

### Acceptance criteria

Setup: founder checklist 19–23; item 1 live; both migrations applied before the client deploys.

- [ ] Smoke: `curl -X POST https://<ref>.supabase.co/functions/v1/send-email -H 'x-email-worker-secret: $SECRET' -H 'content-type: application/json' -d '{"test_to":"you@example.com"}'` → 200 and a branded test email; without the header → 401. `select * from cron.job` lists `email_outbox_sweep`.
- [ ] Office: project with GC email set → COR in `pending_approval` → Get Signature Link: recipient prefilled from `projects.contractor_email` / `contractor_contact`; "Generate & Email" → toast; modal shows the new link with "Queued" then (reopen ~10 s later) "Emailed to … · Sent …"; `email_outbox` latest row `sent` with `provider_message_id`; COR Log tab shows today's Date Sent to Client. The mail client never opens automatically; a secondary "Open in email app" link exists next to Copy.
- [ ] GC inbox (outside the company): branded email (logo/colour/subject/expiry); the link opens cold in incognito and signs as in item 1; `signatures.company_id` set; the office modal's view count increments.
- [ ] Every office member (no "signature" preference rows) receives "Signed: COR … by …" within 30 s; COR approved with the history note.
- [ ] Resend: second email; clicking again immediately is disabled ("Wait 5 minutes"); after 5 minutes it sends again. As a company member, a REST PATCH of `recipient_email` on the request → error "Recipient cannot be changed"; PATCH of `resend_requested_at` twice within 5 minutes → "Please wait…".
- [ ] Expiry: set `expires_at` in the past → modal shows Expired with no Resend; link page says expired; a queued outbox row for it ends `cancelled`.
- [ ] T&M ticket link from TMList: same as the COR path; ticket becomes `client_signed`.
- [ ] Field link: phone PIN → submit a ticket → "Email signing link" from ReviewStep → modal shows "Email queued to …"; GC receives it with Reply-To = company owner; after signing the owner receives the Signed email.
- [ ] Field submit (2 workers, 1 photo, notes) → ~3–4 minutes later office members receive "New T&M ticket" listing both workers and 1 photo. Repeat in airplane mode, reconnect, let it sync → exactly one email. Tickets created by an office user → no email.
- [ ] Preferences: tick only user A for "Time & Material" and "Signatures" → only A receives both; untick "Signatures" for everyone but leave "Time & Material" rows → everyone receives the Signed email again (per-type fallback).
- [ ] Rejection: office Reject with an empty reason → blocked; with "Missing hours for J. Smith" → the office card shows the reason; on the foreman's phone, returning Home shows the red "needs attention" card with reason/rejecter; Dismiss survives reload; "Submit corrected ticket" opens the form.
- [ ] Failure/retry: set `RESEND_API_KEY=re_invalid` and redeploy → row `failed` with the Resend error, modal "Email failed — …"; restore the key → within ~1 minute the sweep retries → `sent`, no duplicate. Stuck row (`status='sending', locked_at = now() - 11 min`) → next sweep sends it.
- [ ] Security: a user of another company sees only their `email_outbox` rows; anon REST POST/PATCH on `signature_requests` and INSERT on `signatures` are denied; function URL without the secret → 401.
- [ ] Unconfigured mode: remove the two Vault secrets → "Generate & Email" still creates the request, modal shows "Queued", Copy and "Open in email app" work; restore → the sweep delivers it.
- [ ] `supabase/tests/email_outbox_tests.sql` all PASS; `deno test supabase/functions/send-email` green.

### Approach

Database triggers → `email_outbox` → `pg_net` POST to a Supabase Edge Function `send-email` (Deno, service role) → Resend REST, plus a `pg_cron` sweep every minute for retries and stuck rows. Triggers rather than client `functions.invoke` because events originate from three principals (office JWT, foreman as anon + field session incl. offline replay, GC as plain anon) and a client invoke would have to be unauthenticated for two of them; the business transaction never waits on Resend (the trigger inserts an outbox row and issues an async `net.http_post` wrapped in EXCEPTION → WARNING). The outbox gives idempotency (UNIQUE `dedupe_key` + a Resend `Idempotency-Key` that is constant per row across attempts — `attempts` only drives backoff), retry/backoff, stuck-row recovery (`sending` rows locked > 10 min are reclaimable), an audit trail and a status for the UI. Secrets never reach the browser: `RESEND_API_KEY` lives only in function secrets; the DB keeps the function URL and a shared worker secret in Vault; the function is deployed with `verify_jwt = false` and enforces the secret with a constant-time compare. The anon write path on `signature_requests`/`signatures` is closed in the same migration and every anonymous write goes through `create_signature_request` (authorizes office membership **or** `validate_field_session`, derives `company_id` from the project — never from the caller, verifies the document belongs to the project), `resend_signature_request`, and item 1's `public_add_signature`. Because authenticated members keep FOR ALL on the table, the resend throttle, recipient immutability and read-only `sent_*` columns are enforced in a BEFORE UPDATE trigger for every role, and the email trigger re-verifies tenant consistency before enqueueing. Recipient resolution is per event type: users whose `notification_preferences.notification_types` for the project contain the type; if no row contains it, all active company members; the request's creator (or the company owner for field-created requests) always gets the Signed email. Rejections reach foremen in-app (no email) via a field-readable `getRejectedTMTickets` feeding a card on ForemanLanding, refreshed on return-to-Home. Mailto survives as a secondary "Open in email app" link. The public signing page, photos and submit are **not** changed here — item 1 did that.

### Changes

| File | Change |
|------|--------|
| `supabase/migrations/20261104_signature_public_rpcs.sql` | NEW (reduced from the plan): see Migrations. |
| `supabase/migrations/20261104_transactional_email.sql` | NEW: see Migrations. |
| `supabase/rollbacks/20261104_signature_public_rpcs_rollback.sql`, `…_transactional_email_rollback.sql` | NEW. First: drop the guard trigger, `create_signature_request`, `resend_signature_request`; re-create the token RPC as item 1 left it; **does not** restore the anon write policies/grants; leaves columns. Second: `cron.unschedule('email_outbox_sweep')`, drop the three triggers, all outbox functions, `email_outbox`; leaves `notification_preferences` and the extensions. |
| `supabase/config.toml` | NEW (from `npx supabase init`, trimmed): `project_id`, `[functions.send-email] verify_jwt = false`. |
| `supabase/functions/send-email/index.ts` | NEW Deno handler: POST only; constant-time secret check (401); body `{ outbox_id?, drain?, test_to? }`; service-role client; ids = outbox_id or `email_outbox_due(25)`; per id in try/catch: `claim_email_outbox` (null → skip), `email_context` (null → `cancelled`; `{defer:true}` → `failed` with `awaiting_workers`), `buildEmail`, POST `https://api.resend.com/emails` with `Idempotency-Key: outbox/<id>`, from `"<Company> via <EMAIL_FROM name>"` (or `<Company>` when `hide_fieldsync_branding`), reply_to, tags; 2xx → `sent`; 422 `invalid_idempotent_request` → `sent` with `last_error 'idempotent_replay'`; 409/429/5xx/network → `failed`; other 4xx → `dead`; `test_to` sends the layout without a row; returns `{processed, sent, failed, deferred}`. |
| `supabase/functions/send-email/templates.ts`, `templates_test.ts`, `deno.json` | Pure template functions (`escapeHtml`, `formatMoney` — `cor_total` is integer cents, `formatDate`, `layout`, `buildEmail` for `signature_request` / `document_signed` / `tm_ticket_submitted` / `test`, always with a text alternative); Deno tests; `deno.json` pinning `npm:@supabase/supabase-js@2.86.0`. `supabase/functions/**` is outside `eslint src/` and tsconfig `include`, so CI config is unchanged. |
| `src/lib/corOps.js` | `createSignatureRequest(…, recipient = null)` (`:1802`) → `rpc('create_signature_request', { p_document_type, p_document_id, p_project_id, p_expires_at, p_recipient_email, p_recipient_name })`; NEW `resendSignatureRequest(requestId)`; `getSignatureRequestsForDocument` (`:1855`) selects `*, signatures (*), email_outbox (id, status, attempts, sent_at, last_error, created_at)` with a PGRST200 fallback to the plain select for one release. `getDocumentForSigning`/`addSignature` are already token RPCs (item 1); no `submitPublicSignature`. |
| `src/components/SignatureLinkGenerator.jsx` | Prefill email/name from `project.contractor_email` / `contractor_contact` / `general_contractor`; `validate.email` inline error; call `createSignatureRequest` with `{ email, name }`; delete the mailto block (`:113-139`) and the "Outlook opened" banner; button "Generate & Email" / "Generate Link"; `<EmailStatus>` per request ("Emailed to … · Sent …" / "Queued" / "Email failed — …") with a throttled "Resend email" button; in field mode status/resend only for the just-created request; secondary `Open in email app` mailto link; add `RefreshCw`/`Send` to the **existing** lucide import (`no-duplicate-imports` is an error). |
| `src/components/NotificationSettings.jsx` | Fourth type `{ id: 'signature', label: 'Signatures', … }` (`:6-8`); description explains the per-type fallback to all members. |
| `src/lib/db/tmOps.js` | NEW `getRejectedTMTickets(projectId, limit = 20)` (field-readable select of id, work_date, ce_pco_number, rejection_reason, rejected_at, rejected_by_name, created_by_name, status; `[]` on error). |
| `src/lib/tmStatus.js` | NEW `validateRejectionReason(input)` → `{ ok, reason }` (trimmed, ≤ 500) / `{ ok:false, error }` / `{ ok:false, cancelled:true }` for null. |
| `src/components/TMList.jsx` | `handleReject` (`:283`): validate the prompt result; cancelled → return; invalid → error toast, no DB call. |
| `src/components/tm/TMTicketCard.jsx` | For `rejected` tickets: `Rejected by {name}: {reason}` note next to Restore. |
| `src/components/ForemanView.jsx`, `src/components/ForemanLanding.jsx`, `src/styles/features/spacex-redesign.css` | `rejectedTickets` loaded in `loadTodayStatus` and passed down; red "needs attention" card after the offline banner (reason, rejecter, relative time, "Submit corrected ticket" → `onNavigate('tm')`, per-device Dismiss in `localStorage` `fm_dismissed_rejections_<projectId>` keyed `id:rejected_at`); `.sdx-fld-alert` styles. Realtime delivery not promised. |
| `.env.example` | Replace `:16-19` with the email block (secrets set via `npx supabase secrets set`; Vault SQL for `email_worker_url` / `email_worker_secret`; `APP_BASE_URL`; `EMAIL_WORKER_SECRET`). |
| `supabase/MIGRATION_LOG.md` | Two rows. |
| `supabase/tests/email_outbox_tests.sql` | NEW SQL script (see Tests). |
| `src/test/corOpsSignature.test.js`, `src/test/signatureLinkGenerator.test.jsx`, `src/test/foremanRejections.test.jsx` | NEW (see Tests). |
| `.github/workflows/ci.yml` | OPTIONAL `edge-functions` job with `denoland/setup-deno@v2` running `deno test supabase/functions/send-email`. |

### Migrations

`20261104_signature_public_rpcs.sql` (apply first; all functions `SECURITY DEFINER SET search_path = public, extensions, pg_temp`, REVOKE from PUBLIC, explicit grants):

0. Close the anon write path: `DROP POLICY IF EXISTS "Anon can create signature requests"`, `"Anon can update signature requests"` ON `signature_requests`; `DROP POLICY IF EXISTS "Anon can add signatures"` ON `signatures`; `REVOKE INSERT, UPDATE, DELETE ON signature_requests FROM anon; REVOKE INSERT ON signatures FROM anon`. The legacy `increment_signature_view_count` has no caller after item 1; leave it.
1. Columns on `signature_requests`: `recipient_email`, `recipient_name`, `sent_at`, `last_sent_at`, `send_count INTEGER NOT NULL DEFAULT 0`, `resend_requested_at`; guarded CHECK on the email regex. (`signatures.company_id` already exists from item 1.)
2. `signature_requests_guard()` BEFORE UPDATE: recipient immutable; `sent_at`/`last_sent_at`/`send_count` read-only for `anon`/`authenticated`; a `resend_requested_at` bump must be within ±60 s of now, require a recipient, status pending/partially_signed, not expired, and no send/resend within 5 minutes else "Please wait a few minutes before resending". Status-only and view-count updates pass.
3. `create_signature_request(p_document_type, p_document_id, p_project_id, p_expires_at, p_recipient_email, p_recipient_name) RETURNS JSONB`: type ∈ (cor, tm_ticket); `company_id` from `projects`; authorize active membership or `validate_field_session(p_project_id)`; document must belong to the project and be signable (COR `pending_approval`/`approved`; ticket not `billed`); normalized/validated email; insert with `generate_signature_token()` and `created_by = auth.uid()`; return the row. Grant anon, authenticated.
4. `resend_signature_request(p_request_id) RETURNS JSONB`: authorize as above; readable pre-checks; `UPDATE … SET resend_requested_at = now()` (guard enforces; the email trigger enqueues). Grant anon, authenticated.
5. `CREATE OR REPLACE public_get_signature_request_by_token` — **item 1's body** (expired projection kept) with `- 'recipient_email' - 'recipient_name' - 'created_by' - 'send_count' - 'sent_at' - 'last_sent_at' - 'resend_requested_at'` applied to the row.

`20261104_transactional_email.sql`:

0. `CREATE EXTENSION IF NOT EXISTS pg_net` / `pg_cron` in guarded DO blocks; Vault reads guarded by `to_regclass('vault.decrypted_secrets')`.
1. `CREATE TABLE IF NOT EXISTS notification_preferences` (project_id, user_id, notification_types TEXT[], UNIQUE(project_id, user_id)) matching `financialOps.js`'s upsert, RLS + the `20260720` policies re-applied; never ALTERs an existing table.
2. `email_outbox` (company_id, project_id, signature_request_id, event_type ∈ signature_request/document_signed/tm_ticket_submitted, `dedupe_key UNIQUE`, to_email, to_name, reply_to, payload JSONB of ids only, status ∈ pending/sending/sent/failed/dead/cancelled, attempts, scheduled_for, locked_at, sent_at, provider_message_id, last_error, timestamps); indexes; RLS: `REVOKE ALL FROM anon, authenticated; GRANT SELECT TO authenticated`; one SELECT policy on `company_id IN (SELECT user_company_ids())`.
3. `email_recipients_for_event(p_project_id, p_type)` — active members with an email (`users.email` COALESCE `auth.users.email`), filtered to preference rows containing `p_type` when any row for the project contains it, else all. Internal.
4. `enqueue_email(...)` — email regex, per-company 300/24 h cap, `INSERT … ON CONFLICT (dedupe_key) DO NOTHING`, immediate `email_outbox_dispatch` when no delay. Internal.
5. `email_outbox_dispatch(p_id)` — Vault url+secret (missing → NOTICE, row stays pending); `net.http_post` with `x-email-worker-secret`, 10 s timeout; EXCEPTION → WARNING.
6. Worker RPCs granted to `service_role` only: `email_outbox_due(p_limit)`, `claim_email_outbox(p_id)` (atomic claim; predicate `attempts < 5 AND scheduled_for <= now() AND (status IN ('pending','failed') OR (status = 'sending' AND locked_at < now() - interval '10 minutes'))`), `mark_email_outbox(p_id, p_status, p_provider_message_id, p_error)` (`sent` also stamps `signature_requests.sent_at/last_sent_at/send_count` and `cor_log_entries.date_sent_to_client` for CORs; `failed` → backoff 1 m/5 m/30 m/2 h, `dead` at 5), `email_context(p_id)` (brand from `company_branding` COALESCE `companies`, company, project, recipient, per-event document summary; NULL to cancel when the request is no longer pending or the ticket is gone; `{defer:true}` while a ticket < 30 min old has no workers).
7. Triggers (definer, exceptions → WARNING + RETURN NEW): `trg_email_signature_request` AFTER INSERT and AFTER UPDATE OF `resend_requested_at` WHEN recipient set — tenant check (document belongs to `NEW.project_id`, project to `NEW.company_id`), reply-to = requester or owner, `dedupe 'sigreq:<id>:<epoch of resend or 0>'`; `trg_email_document_signed` AFTER INSERT ON `signatures` (fires from item 1's `public_add_signature`) — recipients per type 'signature' ∪ creator/owner, `dedupe 'signed:<sig id>:<email>'`; `trg_email_tm_ticket_submitted` AFTER INSERT ON `t_and_m_tickets` when `status IN ('pending','foreman_signed') AND auth.uid() IS NULL` (field inserts incl. item 3's RPC and offline replay) — recipients per type 'tm_ticket', 3-minute delay, `dedupe 'tm_submitted:<ticket>:<email>'`. CREATE TRIGGER wrapped in `to_regclass` / `information_schema` guards.
8. `email_outbox_sweep()` + `cron.schedule('email_outbox_sweep', '* * * * *', …)` when pg_cron exists (else NOTICE).

### Tests

- Deno `templates_test.ts`: escaping, CTA to `${appBaseUrl}/sign/${token}`, expiry sentence only when set, the four subjects, brand fallbacks, no "FieldSync" when white-labelled, text alternative contains the URL, workers table order.
- `corOpsSignature.test.js`: `createSignatureRequest` calls the RPC with the six `p_*` params and never `insert`/`generate_signature_token`; null recipient; `resendSignatureRequest`; the `email_outbox (` select string with PGRST200 fallback; `addSignature`/`getDocumentForSigning` remain item 1's token RPCs.
- `signatureLinkGenerator.test.jsx`: prefill; valid email → RPC with recipient, no `mailto:` assignment, toast; invalid → validation, no call; no email → recipient null; status rendering (sent / failed) and Resend; no Resend for completed/revoked; "Open in email app" link exists; field mode shows status only for the new link; lucide import appears once.
- `foremanRejections.test.jsx`: card renders reason/rejecter; navigate; Dismiss persists and a newer `rejected_at` re-shows; empty → no alert; ForemanView wiring; `validateRejectionReason` cases.
- SQL `email_outbox_tests.sql` (staging): RLS on `email_outbox`; anon denied on `email_outbox`, `signature_requests` INSERT/UPDATE, `signatures` INSERT; guard trigger (recipient change, double resend, read-only columns) as authenticated; `create_signature_request` enqueues exactly one row (`sigreq:<id>:0`), cross-tenant document raises; a signature insert enqueues per-recipient `document_signed` rows (fallback, prefs, type-mismatch fallback, creator, owner for field-created); anon field insert of a ticket enqueues with `scheduled_for ≈ +3 min`, office insert enqueues nothing; claim once/null twice; stuck `sending` row reclaimable; backoff/dead; `sent` side effects; `email_context` defer/cancel; token RPC output has no recipient keys; `auth.users.email` fallback.
- Manual: the acceptance checklist.

### Risks

- Closing the anon write path is deliberate and not reversible by the rollback; every anon writer is rerouted in this release (field ReviewStep via `create_signature_request`; the public page via item 1).
- Authenticated members keep FOR ALL on `signature_requests`; the guard trigger and the tenant check bound what they can do; the 300/day cap bounds abuse.
- Schema drift: `t_and_m_tickets`, `notification_preferences`, the rejection columns and `companies.logo_url/owner_user_id` are not in the repo; every trigger/column reference is guarded, and a missing column silently disables only that trigger (hence founder checklist 4 / 22).
- Deliverability of a fresh domain (use a subdomain, DMARC, internal tests first); Resend free tier is 100/day shared by all companies.
- pg_net is best-effort; the 1-minute sweep plus stuck-row recovery bounds delay to minutes; without pg_cron only immediate dispatch works (checklist 20/22). Missing Vault secrets → rows wait as "Queued".
- A 422 `invalid_idempotent_request` (document edited between attempts) is treated as sent; a changed email requires a resend.
- The Edge Function's only protection is the shared secret; the body is an outbox id, so a leaked URL yields at most a no-op claim. Rotate by updating Vault and the function secret together.
- Office emails link to the app root (no deep-link route per COR/ticket); in-person signatures do not email; the field "Existing links" list stays empty (anon has no SELECT); rejection card refresh is on return-to-Home only.
- Orphan tickets from TMForm's failed cleanup are mostly eliminated by item 3's atomic RPC; the worker's defer/cancel covers legacy inserts.

### Open questions (proposed defaults)

1. One platform sending domain with From `<Company> via FieldSync` and Reply-To the requester, vs per-company domains? **Default: platform domain**; per-company deferred.
2. Default audience when no preference row contains the type: all active members vs administrators only? **Default: all active members.**
3. Delay before the "New T&M ticket" email: 3 minutes with defer-while-empty vs immediate? **Default: 3 minutes** (lets photos attach).
4. Keep the mailto "Open in email app" fallback? **Default: keep.**
5. Allow foremen to email signing links from ReviewStep (Reply-To = owner, owner receives the Signed email)? **Default: yes.**
6. Bounce/complaint webhook at launch? **Default: no** — monitor in Resend; `resend-webhook` function in phase 2.
7. Per-company daily cap and Resend plan? **Default: 300/day via `enqueue_email`**; founder picks the plan (free = 100/day total).

---

## Not in this release

Explicitly deferred. Nothing here is required for the promise in "What ships".

**Offline (item 3)**
- Offline photo capture and upload-when-connected (≈ 0.75 day on the same record later). Because of this, the following claims **must** change before launch: `src/components/landing/HeroSection.jsx:50` "Works Offline" → "Saves Offline"; `src/components/landing/FeatureGrid.jsx:26` "Offline-First" → "Offline Ticket Capture" with "Photos upload once you're connected"; `src/components/landing/CapabilityStrip.jsx:9` "Offline-First Architecture" → "Offline Ticket Capture"; `src/components/tm/TMCapabilitiesModal.jsx:27` "Offline Ready … Everything auto-syncs" → "Saves Offline" with the reduced description; `index.html:7` "works offline" → "saves offline"; `docs/PWA_PHONE_TEST_CHECKLIST.md` §5 (no photo in the offline step).
- Caching assignable CORs and "same as yesterday" crew; a Vite precache manifest for cold offline start after a deploy; Background Sync; a field DELETE policy for orphan tickets; removing the legacy `CREATE_TM_TICKET` action path; rebuilding native Capacitor shells.

**Signing (items 1 and 5)**
- Two-signature workflows on one link; `CORDetail` realtime on COR status; deep links per COR/ticket in emails; bounce/complaint webhook (`resend-webhook`, phase 2); per-company sending domains; push/SMS to foremen; emails for in-person signatures; a field-session list RPC for "Existing links"; an Edge Function photo-signing fallback (only if founder checklist 6 fails).

**Office edit (item 4)**
- Editing photos, COR link, status, trade custom fields, cost code; an edit-history UI; the "Edited after signature" flag on `CORDetail`, the COR PDFs and the public signing page; an `import_status` label in `CORDetail`'s ticket list; restrictive direct-write policies on `t_and_m_workers`/`t_and_m_items` if production grants are blanket; the latent `reimportTicketDataToCOR` guard interaction and labor-only partial-recovery check.

**Project setup (item 2)**
- Full repositioning of the foreman landing for T&M-only projects (only minimal conditionals ship); refusing a blank PIN on the edit form; the pre-existing cash-flow "0.0x" signal; reconciling wizard vs edit-form `work_type`/`job_type` value sets; carrying NULL through the dashboard summary RPC.

**Email (item 5)**
- Realtime delivery of rejections to the field (table not in the publication, bare client); administrator-only default audience; the optional Deno CI job.

**If item 5 slips past launch**: ship items 1–4; the signing modal keeps today's "Generate & Open in Outlook" mailto flow, the anon write path remains closed only once item 5's first migration is applied (apply that migration alone if needed — it is independent of the email layer), and no copy may promise email notifications.