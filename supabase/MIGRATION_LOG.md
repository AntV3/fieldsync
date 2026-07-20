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
| `20260720_enable_rls_remaining_tables.sql` | 2026-07-20 | **Security**: enable RLS + policies on the 26 remaining unprotected tables; adds `is_platform_admin()`, `user_company_ids()`, `user_admin_company_ids()` helpers | ⬜ **NOT YET APPLIED — run in Supabase SQL Editor** |
