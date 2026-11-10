# Database Rollout Plan and SQL Hand-off

**Status:** not started. Nothing in this plan has been run against production.
**Written:** 2026-11-10

This is the complete list of database changes for Phases 2 and 3, in the order to run them. Every block marked **COPY** is meant to be pasted into the Supabase SQL editor as it is.

It follows `docs/migration-workflow.md`. The goal: nobody is locked out, nothing in the field breaks, and every step can be undone.

---

## The three changes, in order

| # | File to run | What it turns on | Undo file |
|---|---|---|---|
| 1 | `supabase/migrations/20261110_member_permissions_and_approval_guards.sql` | Per-user permissions; approval rules enforced by the database | `supabase/rollbacks/20261110_member_permissions_and_approval_guards_rollback.sql` |
| 2 | `supabase/migrations/20261111_cor_tracking_and_client_portal.sql` | Sent / returned / voided tracking, client "request changes", client portal | `supabase/rollbacks/20261111_cor_tracking_and_client_portal_rollback.sql` |
| 3 | `supabase/migrations/20261112_tm_onsite_client_signature.sql` | Office is emailed when a client signs on the foreman's phone | `supabase/rollbacks/20261112_tm_onsite_client_signature_rollback.sql` |

- **Order matters for 1 and 2.** File 2 checks that file 1 was applied and stops, changing nothing, if it was not. File 3 is independent.
- **Each file is one transaction.** If any statement in it fails, nothing from that file is applied.
- **Each file is safe to run twice.**
- **To run a file:** open it in the repository, copy the whole file, paste it into the SQL editor, run.

## What the app does before and after

The app in `main` works at every point of this rollout. Deploy the app first.

| Feature | Before its migration | After |
|---|---|---|
| Permissions (file 1) | Nobody is restricted; no switches in Team settings | Switches appear; members see only what they were granted |
| Approval rules (file 1) | Enforced in the app only | Also enforced by the database |
| Void a change order (file 2) | "Not available yet" | Works |
| Client "request changes" (file 2) | Button hidden | Works |
| Client portal and access screen (file 2) | Hidden | Works |
| Sent date on change orders (file 2) | Falls back to the submitted date | Exact |
| Office email on on-site signature (file 3) | No email (as today) | Email sent |

---

## Step 1. Deploy the app

Merge PR #376 and let it deploy. Try it on a real phone for at least a day. Do not start the steps below before that.

## Step 2. Read-only checks on production

These change nothing. Run them in the production SQL editor and send the results back before continuing.

**COPY (check A: the tables and columns the migrations read)**

```sql
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name, column_name) IN (
    ('user_companies', 'user_id'), ('user_companies', 'company_id'),
    ('user_companies', 'status'), ('user_companies', 'access_level'), ('user_companies', 'role'),
    ('companies', 'owner_user_id'), ('companies', 'logo_url'),
    ('projects', 'company_id'), ('projects', 'job_number'),
    ('users', 'name'), ('users', 'email'),
    ('t_and_m_tickets', 'project_id'), ('t_and_m_tickets', 'status'),
    ('t_and_m_tickets', 'client_signature_data'), ('t_and_m_tickets', 'client_signature_name'),
    ('t_and_m_tickets', 'client_signature_title'), ('t_and_m_tickets', 'client_signature_company'),
    ('t_and_m_tickets', 'client_signature_date'), ('t_and_m_tickets', 'gc_signature_data'),
    ('t_and_m_tickets', 'change_order_value'), ('t_and_m_tickets', 'approved_at'),
    ('t_and_m_tickets', 'rejection_reason'),
    ('change_orders', 'company_id'), ('change_orders', 'project_id'), ('change_orders', 'status'),
    ('change_orders', 'cor_number'), ('change_orders', 'title'), ('change_orders', 'cor_total'),
    ('change_orders', 'gc_signature_data'), ('change_orders', 'client_signature_data'),
    ('change_orders', 'rejection_reason'), ('change_orders', 'approved_at'),
    ('change_orders', 'revision_number'),
    ('signature_requests', 'document_type'), ('signature_requests', 'document_id'),
    ('signature_requests', 'company_id'), ('signature_requests', 'project_id'),
    ('signature_requests', 'signature_token'), ('signature_requests', 'status'),
    ('signature_requests', 'expires_at'), ('signature_requests', 'created_by'),
    ('signature_requests', 'created_at'),
    ('signatures', 'signature_request_id'), ('signatures', 'signature_slot'),
    ('signatures', 'signature_image'), ('signatures', 'signer_name'),
    ('signatures', 'signer_title'), ('signatures', 'signer_company'),
    ('signatures', 'signed_at'), ('signatures', 'user_agent'), ('signatures', 'company_id')
  )
ORDER BY 1, 2;
```

Expected: 51 rows. These may be missing without harm (the migrations handle it): `companies.owner_user_id`, `companies.logo_url`, `user_companies.access_level`, `change_orders.revision_number`, `signatures.company_id`, `users.name`. Anything else missing: stop.

**COPY (check B: the functions the migrations call)**

```sql
SELECT p.proname AS function_name, pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('can_access_project', 'generate_signature_token', 'user_company_ids')
ORDER BY 1;
```

Expected: `can_access_project` with one `uuid` argument and `generate_signature_token` with none. If either is missing, files 2 and 3 stop without changing anything; report it.

**COPY (check C: who would lose approve and send when file 1 goes live)**

```sql
SELECT c.name AS company,
       count(*) FILTER (WHERE uc.access_level = 'administrator') AS administrators,
       count(*) FILTER (WHERE uc.access_level IS DISTINCT FROM 'administrator') AS members_who_would_need_a_grant
FROM user_companies uc
JOIN companies c ON c.id = uc.company_id
WHERE uc.status = 'active' OR uc.status IS NULL
GROUP BY c.name
ORDER BY 1;
```

A company with 0 administrators and no owner would have nobody able to grant permissions: fix that first.

**COPY (check D: triggers already on the tables these files touch)**

```sql
SELECT event_object_table AS table_name, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('user_companies', 't_and_m_tickets', 'change_orders', 'signature_requests', 'signatures')
ORDER BY 1, 2;
```

**COPY (check E: history that would not pass the new rules; existing rows are not changed)**

```sql
SELECT 'tickets approved without a client signature' AS what, count(*)
FROM t_and_m_tickets
WHERE status IN ('approved', 'billed')
  AND client_signature_data IS NULL AND gc_signature_data IS NULL
UNION ALL
SELECT 'CORs approved without a client signature', count(*)
FROM change_orders
WHERE status = 'approved' AND gc_signature_data IS NULL
UNION ALL
SELECT 'CORs currently with the client', count(*)
FROM change_orders
WHERE status = 'pending_approval';
```

## Step 3. Test on a Supabase branch

1. Create a branch named `migration-20261110-phase2-3` (`docs/migration-workflow.md`, Option A).
2. Run file 1, then file 2, then file 3 in the branch's SQL editor. Expect no errors.
3. Run each a second time. Expect only "already exists, skipping" notices.
4. Run the three test files. Each rolls itself back and leaves no rows.
   - `supabase/tests/member_permissions_tests.sql`: 8 `PASS` lines
   - `supabase/tests/cor_tracking_and_client_portal_tests.sql`: 8 `PASS` lines
   - `supabase/tests/tm_onsite_client_signature_tests.sql`: 2 `PASS` lines
5. Run the existing `supabase/tests/rls_policy_tests.sql`, `create_tm_ticket_full_tests.sql`, `public_signing_smoke.sql` and `email_outbox_tests.sql`. They must pass as before.
6. Point a local copy of the app at the branch and check by hand:
   - Field: create a ticket with a photo, sign as foreman, client signs on the device. The office gets the "document signed" email.
   - Field: save a ticket with no signal, reconnect, confirm it syncs with its photos.
   - Office administrator: approve the signed ticket; an unsigned one cannot be approved.
   - Office member with no permission: Approve is not offered; granting it in Team settings makes it appear.
   - Office: build a COR, submit and send it. The sent date appears. Give a client contact access from Share.
   - Client: open the portal link, open the COR, request changes with a comment. The office sees "Returned by client" and the comment, replies, revises and resends. The client signs. The COR is approved.
   - Office: void a COR with a reason. The client's portal shows it as voided. Remove the client's access; the portal link stops working.
7. Run the three rollback files in reverse order (3, 2, 1), then the three migrations again, to confirm both directions work on the real schema.

If your plan has no branching, use Option B in `docs/migration-workflow.md` with a restored backup as the test copy.

## Step 4. Decide who keeps approve and send

Pick one before applying file 1 to production:

- **A. Grant to everyone, then tighten (recommended for day one).** After file 1, run the block below. Nobody notices a change. An administrator then removes the permission from people who should not have it.
- **B. Start strict.** Run file 1 only. Members cannot approve tickets or send change orders until an administrator grants it. Tell the team first.

**COPY (option A only, after file 1)**

```sql
BEGIN;
ALTER TABLE user_companies DISABLE TRIGGER trg_guard_member_permissions;
UPDATE user_companies
   SET can_approve_tickets = true, can_send_cors = true
 WHERE status = 'active' OR status IS NULL;
ALTER TABLE user_companies ENABLE TRIGGER trg_guard_member_permissions;
COMMIT;
```

## Step 5. Apply to production

1. Pick a quiet time (few foremen submitting).
2. Take a backup, or confirm the latest automatic backup is recent.
3. Run file 1. If you chose option A, run the block in step 4.
4. Run check 1 below. Then run file 2 and check 2. Then run file 3 and check 3.

Stop at the first check that does not match and use step 7.

## Step 6. Confirm each one worked

**COPY (check 1, after file 1)**

```sql
SELECT tgrelid::regclass AS table_name, tgname
FROM pg_trigger
WHERE tgname IN ('trg_guard_member_permissions', 'trg_guard_tm_ticket_approval', 'trg_guard_cor_status')
  AND NOT tgisinternal
ORDER BY 2;
-- Expected: 3 rows.

SELECT count(*) FILTER (WHERE can_approve_tickets) AS can_approve,
       count(*) FILTER (WHERE can_send_cors) AS can_send,
       count(*) AS active_members
FROM user_companies
WHERE status = 'active' OR status IS NULL;
-- Option A: can_approve and can_send equal active_members. Option B: both 0.
```

**COPY (check 2, after file 2)**

```sql
SELECT to_regclass('public.cor_client_comments') IS NOT NULL AS comments_table,
       to_regclass('public.client_portal_access') IS NOT NULL AS portal_table,
       to_regprocedure('public.void_change_order(uuid,text)') IS NOT NULL AS void_function,
       to_regprocedure('public.public_client_portal(text)') IS NOT NULL AS portal_function,
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_stamp_cor_sent_to_client' AND NOT tgisinternal) AS sent_trigger;
-- Expected: five times true.

SELECT count(*) AS cors_with_a_sent_date FROM change_orders WHERE sent_to_client_at IS NOT NULL;
-- Expected: the number of CORs that already had a signing link.
```

**COPY (check 3, after file 3)**

```sql
SELECT to_regprocedure('public.record_tm_client_signature(uuid,jsonb)') IS NOT NULL AS onsite_signature_function;
-- Expected: true.
```

Then in the live app: an administrator approves a signed ticket, a foreman submits a ticket with a photo and has the client sign on the device (the office receives the email), and Team settings shows the permission switches. Record the result in `supabase/MIGRATION_LOG.md`.

## Step 7. If something is wrong

Run the undo file for the change that misbehaves. Undo in reverse order if more than one: 3, then 2, then 1. Each is one transaction.

| Undo file | After it |
|---|---|
| `20261112_tm_onsite_client_signature_rollback.sql` | On-site signatures are written by the app again (no office email). Recorded signatures are kept. |
| `20261111_cor_tracking_and_client_portal_rollback.sql` | No void, no request changes, no portal. The tables and columns are kept, so comments, access grants, sent dates and void reasons are not lost. |
| `20261110_member_permissions_and_approval_guards_rollback.sql` | Nobody is restricted by permission and the database no longer enforces the approval rules. Granted permissions are kept. Run this only after the file 2 rollback, because file 2's functions use the permission check. |

Then report what failed before trying again.

---

## Risks, and how each is handled

| Risk | Handling |
|---|---|
| Members who are not administrators lose approve and send the moment file 1 is live. | Step 4: grant to everyone first, or tell the team. |
| Production's schema differs from the migration files (this has happened before, see `MIGRATION_LOG.md`). | Step 2 checks A and B. The migrations read optional columns through JSON, so a missing one is skipped rather than failing, and each file checks its prerequisites first. |
| A field flow that updates tickets is blocked by the ticket guard. | The guard only blocks approval, rejection, billing and the approval and value columns for field sessions. Photo attach, both signatures and offline replay are allowed. Confirm on the branch with a real field session (step 3.6). |
| A phone still running an older cached version of the app. | Old office versions that try to approve a COR without a client signature get a clear refusal. Old field versions are unaffected. |
| The client portal creates a signing link when a client opens a COR that has none. | It is created without a recipient, so no email is sent. It expires with the client's access. |
| A migration fails part-way. | Each file is one transaction: nothing from it is applied. |
| These were tested only on a local Postgres with a small stand-in schema. | Step 3 is not optional. Row-level security, the email triggers and the real table shapes exist only on a Supabase branch or a copy of production. |

## Not part of this rollout

- Merging the ticket's two outside signature columns (`gc_signature_*`, `client_signature_*`) into one. The app already shows a single client signature; the columns can be merged later.
- A database rule that a ticket must be on a change order before it is billed. The app keeps tickets on a COR out of stand-alone billing.
