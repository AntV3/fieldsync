# FieldSync Migration Log

Single source of truth for every SQL migration in `supabase/migrations/`.

FieldSync historically had **two** migration systems:

1. A legacy `database/` directory of flat, un-ordered SQL files that were
   run by hand in the Supabase SQL Editor.
2. Timestamp-prefixed files in `supabase/migrations/`.

They were consolidated in July 2026: every legacy file was moved into
`supabase/migrations/` with a timestamp prefix and the `database/`
directory was deleted. Nothing in the database itself changed — this was
a repo reorganization only.

## How to read this log

- **Applied** — the migration has been run against the production
  Supabase project. All migrations are applied by pasting the file into
  the Supabase SQL Editor (there is no CLI-tracked history), so this
  column is the record; keep it up to date.
- Migrations prefixed `20241201*` are **legacy** files. Their true
  application dates predate this log and were not recorded; the
  `20241201` prefix was chosen only so they sort before the first
  "real" timestamped migration (`20241228_*`). Their relative order is
  approximate (base schema → features → additive tweaks → fixes →
  utilities), not a replay script — many of them overlap or supersede
  each other, and later security migrations rewrote much of what they
  created.
- **Do not** run old migrations against production. They are history,
  not state. For a fresh environment, prefer a schema dump of prod.

## Adding a new migration

1. Create `supabase/migrations/YYYYMMDD_short_name.sql` (today's date).
2. Make it idempotent where possible (`IF NOT EXISTS`, `DROP POLICY IF
   EXISTS` + `CREATE`, guards on `to_regclass`).
3. Run it in the Supabase SQL Editor.
4. Add a row to the table below with Applied = date you ran it.

---

## Legacy migrations (consolidated from `database/`, July 2026)

True application dates unknown; all were applied to production before
2026-02-28 (the start of repo history) unless noted. Original file name
shown for traceability.

| File | Original name | What it does | Applied |
|---|---|---|---|
| `20241201000010_schema.sql` | `schema.sql` | Initial schema: `projects` and `areas` tables, indexes | ✅ historical |
| `20241201000020_schema_v2.sql` | `schema_v2.sql` | `profiles`, roles (foreman/office/admin), `activity_log`, project assignments | ✅ historical |
| `20241201000030_access_levels.sql` | `migration_access_levels.sql` | Splits security (`access_level`) from display (`project_role`); creates `_backup_user_companies_roles` snapshot | ✅ historical |
| `20241201000040_area_scheduled_value.sql` | `migration_area_scheduled_value.sql` | Adds `scheduled_value` (SOV dollars) to areas | ✅ historical |
| `20241201000050_billing.sql` | `migration_billing.sql` | Invoice generation for approved CORs / T&M tickets | ✅ historical |
| `20241201000060_change_orders.sql` | `migration_change_orders.sql` | Full COR system: tables, functions, triggers, RLS | ✅ historical |
| `20241201000070_combined_field_auth.sql` | `migration_combined_field_auth.sql` | All-in-one: security hardening + field sessions | ✅ historical |
| `20241201000080_company_join_approval.sql` | `migration_company_join_approval.sql` | Company join approval layer | ✅ historical |
| `20241201000090_complete_fixes.sql` | `migration_complete_fixes.sql` | Idempotent batch of COR workflow fixes | ✅ historical |
| `20241201000100_cor_columns_fix.sql` | `migration_cor_columns_fix.sql` | Missing COR line-item columns (materials/equipment 400s) | ✅ historical |
| `20241201000110_cor_enhancements.sql` | `migration_cor_enhancements.sql` | COR grouping and enhancements | ✅ historical |
| `20241201000120_cor_export_pipeline.sql` | `migration_cor_export_pipeline.sql` | COR export pipeline (jobs, snapshots) | ✅ historical |
| `20241201000130_cor_log.sql` | `migration_cor_log.sql` | `cor_log_entries` for client-communication tracking | ✅ historical |
| `20241201000140_dashboard_optimization.sql` | `migration_dashboard_optimization.sql` | Dashboard query optimization (indexes/views) | ✅ historical |
| `20241201000150_documents.sql` | `migration_documents.sql` | Document management: folders, documents, storage | ✅ historical |
| `20241201000160_draw_requests.sql` | `migration_draw_requests.sql` | Progress billing / draw requests (pay apps) | ✅ historical |
| `20241201000170_equipment.sql` | `migration_equipment.sql` | Equipment catalog + per-project tracking | ✅ historical |
| `20241201000180_field_photo_uploads.sql` | `migration_field_photo_uploads.sql` | Photo upload access for PIN-authenticated field users | ✅ historical |
| `20241201000190_field_sessions.sql` | `migration_field_sessions.sql` | Field session security (superseded by `20260310_field_sessions_security.sql`) | ✅ historical |
| `20241201000200_import_status.sql` | `migration_import_status.sql` | `import_status` tracking on COR↔ticket associations | ✅ historical |
| `20241201000210_injury_reports.sql` | `migration_injury_reports.sql` | `injury_reports` incident tracking | ✅ historical |
| `20241201000220_labor_classes.sql` | `migration_labor_classes.sql` | Custom labor categories/classes/rates | ✅ historical |
| `20241201000230_legacy_user_repair.sql` | `migration_legacy_user_repair.sql` | Repairs users created before the membership system | ✅ historical |
| `20241201000240_membership_approval.sql` | `migration_membership_approval.sql` | `user_companies.status` (pending/active/removed) approval workflow | ✅ historical |
| `20241201000250_performance_indexes.sql` | `migration_performance_indexes.sql` | Missing indexes for scale (superseded by `20250118_performance_indexes.sql`) | ✅ historical |
| `20241201000260_photo_reliability.sql` | `migration_photo_reliability.sql` | `photo_audit_log`, `cor_export_snapshots`, upload reliability | ✅ historical |
| `20241201000270_project_costs.sql` | `migration_project_costs.sql` | `project_costs` custom cost contributors | ✅ historical |
| `20241201000280_project_schedule.sql` | `migration_project_schedule.sql` | `start_date`/`end_date`/`planned_man_days` on projects | ✅ historical |
| `20241201000290_project_shares.sql` | `migration_project_shares.sql` | `project_shares` read-only client portal | ✅ historical |
| `20241201000300_punch_list.sql` | `migration_punch_list.sql` | `punch_list_items` deficiency tracking | ✅ historical |
| `20241201000310_security_hardening.sql` | `migration_security_hardening.sql` | Auth attempts, rate limiting, early RLS hardening | ✅ historical |
| `20241201000320_signatures.sql` | `migration_signatures.sql` | Signature workflow + shareable signing links | ✅ historical |
| `20241201000330_signatures_anon_access.sql` | `migration_signatures_anon_access.sql` | Signature RLS for anon/field users (superseded by `20250101_signature_anon_access.sql`) | ✅ historical |
| `20241201000340_tm_photos_storage.sql` | `migration_tm_photos_storage.sql` | `tm-photos` storage bucket RLS | ✅ historical |
| `20241201000350_add_company_branding.sql` | `add_company_branding.sql` | White-label company branding columns | ✅ historical |
| `20241201000360_add_group_name.sql` | `add_group_name.sql` | `group_name` on areas (group tasks by level/section) | ✅ historical |
| `20241201000370_add_pin.sql` | `add_pin.sql` | Project PIN column (later hashed by `20260423_pin_hashing.sql`) | ✅ historical |
| `20241201000380_fix_document_upload_rls.sql` | `FIX_DOCUMENT_UPLOAD_RLS.sql` | Document upload RLS fix | ✅ historical |
| `20241201000390_fix_document_folders_rls.sql` | `fix_document_folders_rls.sql` | Document folders RLS fix | ✅ historical |
| `20241201000400_fix_documents_rls.sql` | `fix_documents_rls.sql` | Documents table RLS fix | ✅ historical |
| `20241201000410_fix_field_session_validation.sql` | `fix_field_session_validation.sql` | Variable-reference fixes in field session validation | ✅ historical |
| `20241201000420_fix_field_sync_access.sql` | `fix_field_sync_access.sql` | Field access to CORs and documents | ✅ historical |
| `20241201000430_fix_pin_validation_case_sensitivity.sql` | `fix_pin_validation_case_sensitivity.sql` | Case/whitespace-insensitive company code + PIN matching | ✅ historical |
| `20241201000440_fix_punch_list_field_access.sql` | `fix_punch_list_field_access.sql` | Punch list access for field users | ✅ historical |
| `20241201000450_cleanup_field_sessions.sql` | `cleanup_field_sessions.sql` | **Utility, not a migration**: drops field-session policies before re-running the field-sessions migration | ✅ historical |
| `20241201000460_diagnose_field_sessions.sql` | `diagnose_field_sessions.sql` | **Utility, not a migration**: read-only diagnostic listing missing field-session objects | n/a (diagnostic) |

Two legacy files were **deleted** during consolidation because identical
timestamped copies already existed:

- `migration_launch_security.sql` — byte-identical to `20260310_launch_security.sql`
- `migration_audit_hardening.sql` — identical to `20260309_audit_hardening.sql` except one comment line

## Timestamped migrations

| File | Date | What it does | Applied |
|---|---|---|---|
| `20241228_observability_tables.sql` | 2024-12-28 | `error_log`, `query_metrics`, tenant health/storage metrics, `platform_admins` | ✅ |
| `20241229_atomic_ticket_cor_association.sql` | 2024-12-29 | Keeps ticket↔COR dual FK and junction table in sync | ✅ |
| `20241229_disposal_loads.sql` | 2024-12-29 | Disposal load tracking (quantity only) | ✅ |
| `20241230_field_cor_access.sql` | 2024-12-30 | PIN-authenticated field users can view their project's CORs | ✅ |
| `20241230_reverse_ticket_cor_sync.sql` | 2024-12-30 | Reverse sync `assigned_cor_id` → junction table | ✅ |
| `20250101_signature_anon_access.sql` | 2025-01-01 | RLS for anon/field signature requests | ✅ |
| `20250116_fix_ambiguous_project_id.sql` | 2025-01-16 | Fix ambiguous `project_id` error | ✅ |
| `20250116_fix_ambiguous_project_id_v2.sql` | 2025-01-16 | Comprehensive fix of the same error | ✅ |
| `20250118_performance_indexes.sql` | 2025-01-18 | Indexes for N+1 and slow query patterns | ✅ |
| `20260218_fix_draw_requests_fk.sql` | 2026-02-18 | `draw_requests.created_by` FK → `ON DELETE SET NULL` | ✅ |
| `20260218_fix_photo_bucket.sql` | 2026-02-18 | **Security**: restrict `tm-photos` bucket read access | ✅ |
| `20260218_project_shares_company_id.sql` | 2026-02-18 | **Security**: add `company_id` to `project_shares` | ✅ |
| `20260218_secure_field_rls.sql` | 2026-02-18 | **Security**: replace `auth.uid() IS NULL` field policies | ✅ |
| `20260219_fix_foreman_rls.sql` | 2026-02-19 | Clean recreate of `validate_pin_and_create_session` | ✅ |
| `20260227_daily_reports_photos.sql` | 2026-02-27 | `photos` column on `daily_reports` | ✅ |
| `20260227_fix_admin_project_delete.sql` | 2026-02-27 | Project DELETE policy: legacy `role` → `access_level` | ✅ |
| `20260227_fix_foreman_load_error.sql` | 2026-02-27 | Fix "Error adding loads" in foreman view | ✅ |
| `20260227_fix_foreman_project_400_error.sql` | 2026-02-27 | Fix foreman project-view auth errors | ✅ |
| `20260227_fix_project_cascade_delete.sql` | 2026-02-27 | Project deletion cascade fixes | ✅ |
| `20260227_photo_gps_locations.sql` | 2026-02-27 | `photo_locations` JSONB (GPS per photo) on T&M tickets | ✅ |
| `20260228_fix_foreman_auth_errors.sql` | 2026-02-28 | Self-contained idempotent foreman auth fix | ✅ |
| `20260301_security_hardening.sql` | 2026-03-01 | **Security**: PIN rate-limit bypass, permissive RLS fixes | ✅ |
| `20260303_add_contact_fields.sql` | 2026-03-03 | Client/contractor contact fields on projects | ✅ |
| `20260304_equipment_tables.sql` | 2026-03-04 | Ensure equipment tables/columns exist | ✅ |
| `20260304_fix_pin_rpc_ambiguous_column.sql` | 2026-03-04 | Fix ambiguous `project_id` in PIN RPC | ✅ |
| `20260305_fix_stable_violation_redux.sql` | 2026-03-05 | Fix STABLE-function violation in PIN RPC | ✅ |
| `20260306_add_disposal_load_types.sql` | 2026-03-06 | Add `copper`, `asphalt` disposal load types | ✅ |
| `20260306_disposal_truck_counts.sql` | 2026-03-06 | Per-day disposal truck counts | ✅ |
| `20260306_fix_permissions.sql` | 2026-03-06 | Missing GRANTs (truck counts, logging RPCs) | ✅ |
| `20260309_audit_hardening.sql` | 2026-03-09 | **Security**: status CHECK constraints + DB audit findings | ✅ |
| `20260309_auth_flow_fixes.sql` | 2026-03-09 | Login/signup/join audit fixes (ex-`database/migration_auth_flow_fixes.sql`) | ✅ |
| `20260309_company_role_column.sql` | 2026-03-09 | `company_role` column on `user_companies` (ex-`database/`) | ✅ |
| `20260309_foreman_signature.sql` | 2026-03-09 | Foreman signature columns on T&M tickets (ex-`database/`) | ✅ |
| `20260310_field_sessions_security.sql` | 2026-03-10 | **Security**: token-based field sessions, `has_valid_field_session()` | ✅ |
| `20260310_launch_security.sql` | 2026-03-10 | **Security**: pre-launch hardening batch | ✅ |
| `20260312_crew_signatures.sql` | 2026-03-12 | Crew check-in signatures (JSONB, no schema change) | ✅ |
| `20260315_trade_profiles.sql` | 2026-03-15 | Trade profiles: customizable field forms/widgets/roles | ✅ |
| `20260316_fix_punch_list_rls.sql` | 2026-03-16 | Punch list RLS for field users | ✅ |
| `20260325_company_invitations.sql` | 2026-03-25 | Admin-generated invite links (ex-`database/`) | ✅ |
| `20260325_cor_audit_and_revisions.sql` | 2026-03-25 | COR audit trail + revision tracking (ex-`database/`) | ✅ |
| `20260327_pin_unique_per_company.sql` | 2026-03-27 | Project PINs unique per company, not globally | ✅ |
| `20260327_truck_load_tracking.sql` | 2026-03-27 | `enable_truck_load_tracking` trade-config flag (ex-`database/`) | ✅ |
| `20260401_sage_parity.sql` | 2026-04-01 | Cost codes, RFI tracking, submittal tracking (ex-`database/`) | ✅ |
| `20260402_fix_pin_rpc_ambiguous_company_id.sql` | 2026-04-02 | Fix ambiguous `company_id` in PIN RPC | ✅ |
| `20260402_security_critical_fixes.sql` | 2026-04-02 | **Security**: `USING(true)` RLS, signup role injection (ex-`database/`) | ✅ |
| `20260415_fix_disposal_truck_counts_rls.sql` | 2026-04-15 | Truck-counts RLS for field users | ✅ |
| `20260416_add_project_phases.sql` | 2026-04-16 | `project_phases` metadata table (ex-`database/add_project_phases.sql`) | ✅ |
| `20260416_field_observations.sql` | 2026-04-16 | Field observations with photos | ✅ |
| `20260416_fix_disposal_load_error.sql` | 2026-04-16 | Fix disposal "Database configuration error" | ✅ |
| `20260421_fix_foreman_document_visibility.sql` | 2026-04-21 | Foremen see office-uploaded documents | ✅ |
| `20260423_add_observations_to_trade_templates.sql` | 2026-04-23 | Add "observations" to seeded trade templates | ✅ |
| `20260423_fix_field_observations_anon_grants.sql` | 2026-04-23 | Field observations anon grants | ✅ |
| `20260423_harden_definer_search_path.sql` | 2026-04-23 | **Security**: explicit `search_path` on SECURITY DEFINER functions | ✅ |
| `20260423_pin_hashing.sql` | 2026-04-23 | **Security**: bcrypt-hash project PINs | ✅ |
| `20260423_signature_tenant_isolation.sql` | 2026-04-23 | **Security**: signature cross-tenant isolation | ✅ |
| `20260423_storage_mime_size_limits.sql` | 2026-04-23 | **Security**: server-side MIME/size limits on buckets | ✅ |
| `20260423_tighten_company_and_trade_rls.sql` | 2026-04-23 | **Security**: drop `USING(true)` anon reads; `get_company_by_code` RPC | ✅ |
| `20260424_fix_pgcrypto_search_path.sql` | 2026-04-24 | Hotfix: restore pgcrypto for definer functions | ✅ |
| `20260425_field_session_remember_me.sql` | 2026-04-25 | 30-day "remember me" field sessions | ✅ |
| `20260504_fix_daily_reports_update_rls.sql` | 2026-05-04 | Restore missing UPDATE policy on `daily_reports` | ✅ |
| `20260504_fix_tm_photos_upload_path_regex.sql` | 2026-05-04 | Fix photo upload path regex after hardening | ✅ |
| `20260519_fix_areas_update_grant.sql` | 2026-05-19 | Field foremen can update area status | ✅ |
| `20260630_drop_blanket_anon_rls.sql` | 2026-06-30 | **Security**: remove blanket anon `USING(true)` policies | ✅ |
| `20260720_enable_rls_remaining_tables.sql` | 2026-07-20 | **Security**: enable RLS + policies on the 26 remaining unprotected tables; adds `is_platform_admin()`, `user_company_ids()`, `user_admin_company_ids()` helpers | ❌ **not in production** (found 2026-11-06: none of its helpers exist; on a copy of the schema it stops on a missing `platform_admins` table). `user_company_ids()` was created by `20261104_signature_public_rpcs.sql` instead. Superseded by `20261106_enable_rls_remaining_tables_fixed.sql` (applied 2026-11-10) |
| `20261026_dashboard_pending_counts_include_signed.sql` | 2026-10-26 | Dashboard pending counts include `foreman_signed` / `client_signed` tickets and `pending_approval` CORs | ✅ (applied 2026-10-28) |
| `20261104_project_contract_value_optional.sql` | 2026-11-04 | `projects.contract_value` becomes nullable (`DROP NOT NULL`); "no contract value" is stored as NULL so T&M-only projects can be created without one. No backfill, no RLS/RPC change | ✅ (applied 2026-11-06) |
| `20261104_offline_tm_submit.sql` | 2026-11-04 | Offline T&M submit: `t_and_m_tickets.client_submission_id` + partial unique index; idempotent, atomic SECURITY INVOKER RPC `create_tm_ticket_full(p_payload)` (ticket + workers + items in one call, `replayed` on a repeated id, 42501 without project access); re-asserts the field T&M policies CASCADE-dropped by `20260416_fix_disposal_load_error.sql` and the anon/authenticated grants | ✅ (applied 2026-11-06) |
| `20261105_public_signing_rpcs.sql` | 2026-11-05 | Public GC signing link: token-gated RPCs (`public_get_document_for_signing`, `public_add_signature`), token RPC returns `expired`, `signatures.company_id`, `x-signing-token` read policy on `tm-photos`, anon INSERT/UPDATE policies on `signature_requests` pinned to a field session + project | ✅ (applied 2026-11-06) |
| `20261105_tm_ticket_office_edit.sql` | 2026-11-05 | Office edit of a T&M ticket: SECURITY DEFINER RPC `update_tm_ticket_contents(p_ticket_id, p_fields, p_workers, p_items, p_edit_note)` (authenticated only; refuses billed / invoiced / COR-locked tickets; replaces workers + items; on a crew/material change of a COR-linked ticket deletes that ticket's ticket-sourced COR lines and flags the association for re-sync); six server-set audit columns on `t_and_m_tickets` guarded by `trg_protect_tm_edit_audit`; write-only snapshot table `t_and_m_ticket_edits` (RLS, one SELECT policy). Rollback: `supabase/rollbacks/20261105_tm_ticket_office_edit_rollback.sql` | ✅ (applied 2026-11-06; production has no `profiles` table, so the editor name comes from `users`) |
| `20261104_signature_public_rpcs.sql` | 2026-11-04 | Transactional email, part 1 of 2. **Apply order: after `20261105_public_signing_rpcs.sql` and before `20261104_transactional_email.sql`, although its date sorts first** (the file checks for `public_add_signature` and stops with an error, changing nothing, if item 1 is missing). Rebuilds access to `signature_requests` / `signatures`: drops every existing policy on both (incl. "Company users manage signature requests" FOR ALL, item 1's pinned anon policies, "Anon can add signatures", "Authenticated can view/add signatures"; any unknown one is dropped with a NOTICE), revokes ALL from anon, INSERT/DELETE/TRUNCATE on `signature_requests` and INSERT/UPDATE/DELETE/TRUNCATE on `signatures` from authenticated, and creates three `user_company_ids()` (active members) policies: "Company members view signature requests" (SELECT), "Company members update signature requests" (UPDATE), "Company members view signatures" (SELECT); adds `recipient_email`, `recipient_name`, `sent_at`, `last_sent_at`, `send_count`, `resend_requested_at` (+ CHECKs); BEFORE INSERT/UPDATE guard `trg_signature_requests_guard` (recipient immutable; for API roles only status -> 'revoked' (not from completed) and the 5-minute-throttled resend bump are writable); SECURITY DEFINER RPCs `create_signature_request(...)` (office member or field session; company from the project) and `resend_signature_request(id)`; re-creates `public_get_signature_request_by_token` without the recipient/send keys. Rollback: `supabase/rollbacks/20261104_signature_public_rpcs_rollback.sql` (does not restore the anon write path or the blanket policies; gives office members a pinned INSERT policy back for the previous client) | ✅ (applied 2026-11-06; created the missing `user_company_ids()`) |
| `20261104_transactional_email.sql` | 2026-11-04 | Transactional email, part 2 of 2. **Apply order: after `20261104_signature_public_rpcs.sql`** (checked; stops with an error otherwise). Founder checklist 20 first: enable `pg_net` + `pg_cron`, create Vault secrets `email_worker_url` / `email_worker_secret` (without them the file still applies and emails wait as `pending`). Creates `notification_preferences` only if missing; `email_outbox` (RLS: members SELECT own company, no client writes); recipient resolver per type with fallback to all active members; `enqueue_email` (dedupe key, per-company advisory lock, 300/24 h per company, 5/24 h signing-link emails per address per company); pg_net dispatch with header `x-email-worker-secret`; service-role worker RPCs `email_outbox_due`, `claim_email_outbox`, `mark_email_outbox`, `email_context`; triggers `trg_email_signature_request`, `trg_email_document_signed`, `trg_email_tm_ticket_submitted` (field inserts only, +3 min), exceptions become WARNINGs; `email_outbox_sweep()` scheduled as cron job `email_outbox_sweep` every minute. Rollback: `supabase/rollbacks/20261104_transactional_email_rollback.sql` (run before the part 1 rollback; keeps `notification_preferences` and the extensions) | ✅ (applied 2026-11-06; pg_net, pg_cron and the `email_outbox_sweep` job confirmed 2026-11-10; emails wait as `pending` until the Vault secrets are set) |
| `20261106_enable_rls_remaining_tables_fixed.sql` | 2026-11-06 | **Security**: corrected re-run of `20260720_enable_rls_remaining_tables.sql`, which never landed in production. Same change (RLS + policies on the remaining unprotected tables, skipping any that do not exist), with schema-tolerant helpers: `is_platform_admin()` returns false when `platform_admins` is missing; `user_company_ids()` only created when missing; `user_admin_company_ids()` falls back to an owner/admin role when `user_companies.access_level` is missing. One transaction | ✅ (applied 2026-11-10; afterwards no `public` table has RLS off) |
| `20261110_member_permissions_and_approval_guards.sql` | 2026-11-10 | **Security / permissions**: four per-member permissions on `user_companies` (`can_approve_tickets`, `can_send_cors`, `can_sign_for_foreman`, `can_manage_client_access`; administrators and the owner always hold all four; only they can change them, enforced by `trg_guard_member_permissions`); helpers `is_company_admin(company)` and `has_company_permission(company, permission)`; `trg_guard_tm_ticket_approval` (approve needs `can_approve_tickets` and a client signature, reject needs `can_approve_tickets`, a field session can never approve / reject / bill or write the approval and value columns, and a late field write keeps the status of a client-signed / approved / rejected / billed ticket); `trg_guard_cor_status` (a COR becomes `approved` only with a client signature on it, submitting needs `can_send_cors`, a field session cannot change a COR status). Guards apply to the `anon` / `authenticated` API roles only. **Behaviour change**: non-administrator members cannot approve tickets or submit CORs until an administrator grants the permission in Team settings (optional backfill at the end of the file). Tests: `supabase/tests/member_permissions_tests.sql`. Rollback: `supabase/rollbacks/20261110_member_permissions_and_approval_guards_rollback.sql` | ✅ (applied 2026-11-10 by the owner in the Supabase SQL editor; presence of `trg_guard_tm_ticket_approval` confirmed by query the same day. The SQL test file was not reported as run on production, and before this it was tested only on a local Postgres 16 with a minimal stand-in schema) |
| `20261111_cor_tracking_and_client_portal.sql` | 2026-11-11 | **Apply after `20261110_member_permissions_and_approval_guards.sql`** (uses `has_company_permission()`; stops with an error otherwise). COR tracking: `change_orders.sent_to_client_at` / `sent_to_client_by` / `returned_by_client_at` / `voided_at` / `voided_by` / `void_reason` (+ `rejected_at`, `billed_at`, `closed_at` if missing), backfill of the sent date from the first signing link, `trg_stamp_cor_sent_to_client` on `signature_requests`, `void_change_order(cor, reason)` (needs `send_cors`; closes the COR, revokes its pending signing links; the status CHECK is not changed: voided = `voided_at IS NOT NULL` with status `closed`). Client comments: table `cor_client_comments` (RLS, members SELECT, no client writes), `public_request_cor_changes(token, comment, name)` (client returns a COR: status `rejected`, reason = the comment), `public_get_cor_comments(token)`, `add_cor_comment(cor, body)`. Client portal: table `client_portal_access` (RLS, members SELECT), `grant_client_portal_access(project, name, email, expires_at)` and `revoke_client_portal_access(id)` (need `manage_client_access`), `public_client_portal(token)` (project + every non-draft COR), `public_client_portal_open_cor(token, cor)` (returns a signing link for that COR, creating one if needed). No existing policy, constraint or function is replaced. Tests: `supabase/tests/cor_tracking_and_client_portal_tests.sql`. Rollback: `supabase/rollbacks/20261111_cor_tracking_and_client_portal_rollback.sql` | ✅ (applied 2026-11-10 by the owner in the Supabase SQL editor; presence of `void_change_order(uuid,text)` confirmed by query the same day. The SQL test file was not reported as run on production, and before this it was tested only on a local Postgres 16 with a minimal stand-in schema) |
| `20261112_tm_onsite_client_signature.sql` | 2026-11-12 | `record_tm_client_signature(ticket, signature)` (SECURITY DEFINER; field session for the ticket's project or office member, via `can_access_project()`): records a client signature captured on the foreman's device as a completed `signature_requests` row + a `signatures` row (slot 2), so the existing `trg_email_document_signed` emails the office with no change to the email system; writes the ticket's `client_signature_*` with server time and moves the status to `client_signed`. No existing object is changed. The app calls it when it exists and falls back to the previous direct write when it does not. Tests: `supabase/tests/tm_onsite_client_signature_tests.sql`. Rollback: `supabase/rollbacks/20261112_tm_onsite_client_signature_rollback.sql` | ✅ (applied 2026-11-10 by the owner in the Supabase SQL editor; presence of `record_tm_client_signature(uuid,jsonb)` confirmed by query the same day. The SQL test file was not reported as run on production, and before this it was tested only on a local Postgres 16 with a minimal stand-in schema) |
| `20261113_tm_ticket_rejection_columns.sql` | 2026-11-13 | Adds `t_and_m_tickets.rejected_by_user_id`, `rejected_by_name`, `rejected_at`, `rejection_reason` (nullable). The office app writes them when it rejects a ticket and clears them when it approves one; the live table (read 2026-11-11) had none of the four, so both actions failed with "column does not exist". Additive only; independent of everything else. Rollback: `supabase/rollbacks/20261113_tm_ticket_rejection_columns_rollback.sql` | ✅ (applied 2026-11-12 by the owner in the Supabase SQL editor; confirmed by the owner) |
| `20261113_tenant_isolation_hardening.sql` | 2026-11-13 | **Security: tenant isolation.** Generated from the live `pg_policies`, function definitions and table definitions exported on 2026-11-11. **Deploy the app first** (field requests must carry the field session; the share and invitation pages must use the two lookups below). Drops 114 table policies that were open to everyone (`USING (true)`), to any signed-in user, to pending/removed members (no `status = 'active'`), to anyone whose own `users.company_id` names the company, or to rows with no company, and creates 56 scoped replacements (`is_active_member(company)`, `can_access_company(company)` = member or field session of that company, `can_access_project(project)`); enables RLS on `project_assignments` and `photo_upload_queue`; replaces 20 storage policies with 8 scoped ones (`tm-photos` by `<company>/<project>/` path, `project-documents` by company path, branding uploads by that company's administrators); adds a caller check to 27 SECURITY DEFINER functions (the live body with a guard added; `repair_legacy_user()` no longer creates or re-activates memberships; trigger-called functions are guarded only when called directly; the SQL editor, cron and service role are not restricted); revokes API access to internal and unused functions; caps wrong field PINs at 20 per company per 15 minutes; adds `public_get_shared_project(token)` and `public_get_invitation(token)`. Adds missing policies so the punch list and the document access log work (`punch_list_items` and `document_audit_log` had RLS on and no policy). **Behaviour changes**: field devices lose live updates on tickets, areas, crew and daily reports (the realtime socket has no field session); a pending member no longer sees the company name on the waiting screen; removed members stay removed. One transaction with a preflight and a final self-check. Tests: `supabase/tests/tenant_isolation_tests.sql` (15 checks). Rollback: `supabase/rollbacks/20261113_tenant_isolation_hardening_rollback.sql` (restores every policy and function body exactly; re-opens the gaps) | ✅ (applied 2026-11-12 by the owner in the Supabase SQL editor; `supabase/tests/tenant_isolation_tests.sql` then ran on production without error, so all 15 checks passed. Before that: written 2026-11-11; migration, rollback and tests run on a local Postgres 16 rebuilt from the exported live tables, all 325 live policies and the live function bodies; triggers and views were approximated because that export was incomplete) |
| `20261114_data_protection_hardening.sql` | 2026-11-14 | **Security / data protection.** Apply after `20261113_tenant_isolation_hardening.sql` (checked) and after the app build that reads named project columns. (1) Field sessions (`anon`) lose all privileges on `projects` except SELECT on every column but `pin` and `pin_hash`; (2) every PIN gets a bcrypt hash (backfill) and `validate_pin_and_create_session` checks only the hash, refuses archived projects, and exempts devices that signed in to the company in the last 30 days (new table `field_trusted_devices`, RLS on, no API access) from the per-company cap on wrong PINs; (3) share and signing tokens from `gen_random_bytes()` (24 characters; `project_shares.share_token` widened to `VARCHAR(32)`; `secure_random_token(length)`); generators not callable anonymously; (4) `cleanup_old_logs()` plus pg_cron jobs: expired field sessions daily, sign-in attempts after 24 h hourly, error reports after 180 days, slow-query metrics after 90 days, sent/dead/cancelled emails after 180 days, trusted devices unused for 90 days. One transaction with a final self-check. Tests: `supabase/tests/data_protection_tests.sql` (5 checks). Rollback: `supabase/rollbacks/20261114_data_protection_hardening_rollback.sql` (keeps the wider share_token column and the added PIN hashes) | ⏳ not applied (written 2026-11-12; migration, rollback and all SQL test suites run on a local Postgres 16 rebuilt from the exported live schema with the earlier migrations applied) |
