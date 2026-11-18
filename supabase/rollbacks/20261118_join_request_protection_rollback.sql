-- ============================================================
-- ROLLBACK for 20261118_join_request_protection.sql
-- ============================================================
-- Restores verify_office_code() exactly as read from production on
-- 2026-11-11 (no limit on wrong codes), removes
-- request_company_membership() and office_code_failures(), and puts
-- back the direct join-request policy from
-- 20261113_tenant_isolation_hardening.sql.
-- WARNING: join requests can again skip the office code.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.verify_office_code(company_id uuid, code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$                                                                                                                                                                               
  DECLARE                                                                                                                                                                             
    stored_code TEXT;                                                                                                                                                                 
  BEGIN                                                                                                                                                                               
    SELECT c.office_code INTO stored_code                                                                                                                                             
    FROM companies c                                                                                                                                                                  
    WHERE c.id = company_id;                                                                                                                                                          
                                                                                                                                                                                      
    IF stored_code IS NULL THEN                                                                                                                                                       
      RETURN FALSE;                                                                                                                                                                   
    END IF;                                                                                                                                                                           
                                                                                                                                                                                      
    RETURN UPPER(TRIM(stored_code)) = UPPER(TRIM(code));                                                                                                                              
  END;                                                                                                                                                                                
  $function$;

DROP FUNCTION IF EXISTS public.request_company_membership(UUID, TEXT);
DROP FUNCTION IF EXISTS public.office_code_failures(UUID);

DROP POLICY IF EXISTS "tenant: request to join" ON public.user_companies;
CREATE POLICY "tenant: request to join" ON public.user_companies
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending' AND COALESCE(access_level, 'member') = 'member' AND COALESCE(role, 'member') = 'member' AND NOT (can_approve_tickets OR can_send_cors OR can_sign_for_foreman OR can_manage_client_access));

COMMIT;
