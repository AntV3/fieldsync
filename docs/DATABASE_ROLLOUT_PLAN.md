# Database Rollout Plan: permissions and approval rules

**Status:** not started. Nothing in this plan has been run against production.
**Written:** 2026-11-10
**Covers:** `supabase/migrations/20261110_member_permissions_and_approval_guards.sql`

This plan follows `docs/migration-workflow.md` and adds what is specific to this change. The goal is that nobody is locked out, nothing in the field breaks, and every step can be undone.

---

## 1. What the change does

| Part | Effect |
|---|---|
| Four columns on `user_companies` | `can_approve_tickets`, `can_send_cors`, `can_sign_for_foreman`, `can_manage_client_access`. All default to `false`. Adding them changes no behaviour by itself. |
| `trg_guard_member_permissions` | Only a company administrator or the owner can change those four columns. |
| `trg_guard_tm_ticket_approval` | A ticket is approved only by an office user with the approve permission, and only if the client has signed. A field (PIN) session cannot approve, reject, bill or price a ticket. A late field write no longer pulls a signed, approved or rejected ticket back to an earlier status. |
| `trg_guard_cor_status` | A change order becomes `approved` only with a client signature on it. Submitting one needs the send permission. A field session cannot change a COR's status. |

The guards apply to requests made through the app (the `anon` and `authenticated` roles). The SQL editor and the existing server functions (public signing, office ticket edit) are not affected.

## 2. What the app does without it

The app in `main` after PR #376 works whether or not this migration is applied:

- **Not applied:** nobody is restricted by permission. Team settings shows no permission switches.
- **Applied:** Team settings shows the switches, and members see only the actions they hold.

So the app is deployed **first** and the database change **second**. There is no moment where the app needs a column that is not there.

## 3. Risks, and how each is handled

| Risk | Handling |
|---|---|
| Members who are not administrators lose approve and send the moment the triggers go live. | Decide before applying (step 4): grant to everyone first, or grant person by person. |
| Production's schema differs from the migration files (this has happened before, see `MIGRATION_LOG.md`). | Read-only pre-checks (step 2) confirm every table and column the migration reads. The migration reads optional columns through JSON, so a missing one is skipped rather than failing. |
| A field flow that updates tickets is blocked. | The ticket guard only blocks approval, rejection, billing and the approval/value columns for field sessions. Photo attach, foreman signature, client signature and offline replay are allowed and covered by the test file. Confirm on a branch with a real field session (step 3). |
| A phone still running an older cached version of the app. | Old office versions that try to approve a COR without a signature get a clear refusal. Old field versions are unaffected. No action needed. |
| A rejected ticket cannot be moved by a field session. | Intended. Resubmission creates a new ticket (already how the app works), so no field write to the rejected ticket is needed. |
| The migration fails part-way. | It runs in one transaction: if any statement fails, nothing is changed. |

## 4. Steps

### Step 1. Deploy the app

Merge PR #376 and let it deploy. Use it for at least a day. Nothing below should start until the app has been tried on a real phone.

### Step 2. Read-only pre-checks on production

Run these in the production SQL editor. They change nothing.

```sql
-- a. The tables and columns the migration reads
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name, column_name) IN (
    ('user_companies', 'user_id'), ('user_companies', 'company_id'),
    ('user_companies', 'status'), ('user_companies', 'access_level'), ('user_companies', 'role'),
    ('companies', 'owner_user_id'),
    ('projects', 'company_id'),
    ('t_and_m_tickets', 'project_id'), ('t_and_m_tickets', 'status'),
    ('t_and_m_tickets', 'client_signature_data'), ('t_and_m_tickets', 'gc_signature_data'),
    ('t_and_m_tickets', 'change_order_value'), ('t_and_m_tickets', 'approved_at'),
    ('t_and_m_tickets', 'rejection_reason'),
    ('change_orders', 'company_id'), ('change_orders', 'status'), ('change_orders', 'gc_signature_data')
  )
ORDER BY 1, 2;
-- Expected: every pair listed. `companies.owner_user_id` and `user_companies.access_level`
-- may be absent; the migration then falls back to the legacy role. Anything else
-- missing: stop and report it.

-- b. Who would lose approve / send when the guards go live
SELECT c.name AS company,
       count(*) FILTER (WHERE uc.access_level = 'administrator') AS administrators,
       count(*) FILTER (WHERE uc.access_level IS DISTINCT FROM 'administrator') AS members_who_would_need_a_grant
FROM user_companies uc
JOIN companies c ON c.id = uc.company_id
WHERE uc.status = 'active' OR uc.status IS NULL
GROUP BY c.name
ORDER BY 1;
-- Any company with 0 administrators and no owner would have nobody able to
-- grant permissions: fix that first.

-- c. Existing triggers on the three tables (so nothing is a surprise)
SELECT event_object_table AS table_name, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('user_companies', 't_and_m_tickets', 'change_orders')
ORDER BY 1, 2;

-- d. History that would not pass the new rules (informational; existing rows are not touched)
SELECT 'tickets approved without a client signature' AS what, count(*)
FROM t_and_m_tickets
WHERE status IN ('approved', 'billed')
  AND client_signature_data IS NULL AND gc_signature_data IS NULL
UNION ALL
SELECT 'CORs approved without a client signature', count(*)
FROM change_orders
WHERE status = 'approved' AND gc_signature_data IS NULL;
```

Send the results of (a) to (d) back before continuing. If (a) shows anything unexpected, the migration is adjusted first.

### Step 3. Test on a Supabase branch

1. Create a branch named `migration-20261110-permissions` (see `docs/migration-workflow.md`, Option A).
2. Run the migration file in the branch's SQL editor. Expect no errors.
3. Run it a second time. Expect only "already exists, skipping" notices.
4. Run `supabase/tests/member_permissions_tests.sql`. Expect 8 `PASS` lines and "all 8 checks passed (rolled back)".
5. Run `supabase/tests/rls_policy_tests.sql` and `supabase/tests/create_tm_ticket_full_tests.sql`. They must pass as they did before.
6. Point a local copy of the app at the branch and check by hand:
   - Field: create a ticket with a photo, sign as foreman, have the client sign on the device.
   - Field: save a ticket with no signal, reconnect, confirm it syncs with its photos.
   - Office administrator: approve the signed ticket; try to approve an unsigned one (should be refused).
   - Office member with no permission: Approve is not offered; granting the permission in Team settings makes it appear.
   - Office: build a COR, submit it, sign it through the link; confirm it becomes approved.
7. Run the rollback file, then the migration again, to confirm both directions work on real schema.

If the plan is on a tier without branching, use Option B in `docs/migration-workflow.md` with a restored backup as the test copy.

### Step 4. Decide who keeps approve and send

Pick one before applying to production:

- **A. Grant to everyone, then tighten (recommended for day one).** Apply the migration, then run the backfill at the end of the migration file. Nobody notices a change. An administrator then removes the permission from people who should not have it.
- **B. Start strict.** Apply the migration only. Members cannot approve or send until an administrator grants it. Tell the team beforehand.

### Step 5. Apply to production

1. Pick a quiet time (few foremen submitting).
2. Take a backup, or confirm the latest automatic backup is recent.
3. Run the migration file in the production SQL editor.
4. If option A was chosen, run the backfill.
5. Run the checks in step 6 straight away.

### Step 6. Confirm it worked

```sql
-- The three guards exist
SELECT tgrelid::regclass AS table_name, tgname
FROM pg_trigger
WHERE tgname IN ('trg_guard_member_permissions', 'trg_guard_tm_ticket_approval', 'trg_guard_cor_status')
  AND NOT tgisinternal;
-- Expected: 3 rows.

-- Permission counts
SELECT count(*) FILTER (WHERE can_approve_tickets) AS can_approve,
       count(*) FILTER (WHERE can_send_cors) AS can_send,
       count(*) AS active_members
FROM user_companies
WHERE status = 'active' OR status IS NULL;
```

Then in the live app: one administrator approves a signed ticket, one foreman submits a ticket with a photo, and Team settings shows the permission switches. Run `supabase/tests/member_permissions_tests.sql` on production as well; it rolls itself back and leaves no rows.

Record the result in `supabase/MIGRATION_LOG.md`.

### Step 7. If something is wrong

Run `supabase/rollbacks/20261110_member_permissions_and_approval_guards_rollback.sql`. It removes the three guards and the helper functions in one transaction and keeps the four columns, so any permissions already granted are not lost. The app goes back to restricting nobody. Then report what failed before trying again.

---

## 5. Database changes still to come

Each of these will be its own migration with its own rollback, tests and a section in this plan. None is written yet.

| Change | Why |
|---|---|
| Email the office when a client signs on the foreman's device | Today only link signatures send an email. |
| COR sent date, voided status, stored package | Track what is with the client, and keep the package that was sent. |
| Client portal access per project, with expiry and removal | The client sees their change orders: submitted, pending, approved, voided. |
| Client "request changes" with comments | The client can question hours or scope instead of signing. |
| One client signature column on tickets | The app already shows one; the two columns can be merged later. |
