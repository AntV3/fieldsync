-- ============================================================
-- ROLLBACK: 20261110_member_permissions_and_approval_guards.sql
-- ============================================================
-- Removes the three guards and the permission helpers. After this,
-- any active member can again approve tickets and CORs, and a field
-- session can again write any ticket column (the state before the
-- migration).
--
-- The four can_* columns are kept by default so granted permissions
-- are not lost if the migration is re-applied; uncomment the last
-- statement to drop them too.
-- ============================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_guard_cor_status ON change_orders;
DROP TRIGGER IF EXISTS trg_guard_tm_ticket_approval ON t_and_m_tickets;
DROP TRIGGER IF EXISTS trg_guard_member_permissions ON user_companies;

DROP FUNCTION IF EXISTS public.guard_cor_status();
DROP FUNCTION IF EXISTS public.guard_tm_ticket_approval();
DROP FUNCTION IF EXISTS public.guard_member_permission_columns();
DROP FUNCTION IF EXISTS public.has_company_permission(UUID, TEXT);
DROP FUNCTION IF EXISTS public.is_company_admin(UUID);

-- ALTER TABLE user_companies
--   DROP COLUMN IF EXISTS can_approve_tickets,
--   DROP COLUMN IF EXISTS can_send_cors,
--   DROP COLUMN IF EXISTS can_sign_for_foreman,
--   DROP COLUMN IF EXISTS can_manage_client_access;

COMMIT;
