-- ============================================================
-- RLS POLICY TEST SUITE
-- ============================================================
-- Run this script in Supabase SQL Editor to verify RLS policies
-- are working correctly and preventing unauthorized access.
--
-- HOW TO USE:
-- 1. Run this entire script in Supabase SQL Editor
-- 2. Check the results - all tests should show 'PASS'
-- 3. If any test shows 'FAIL', investigate immediately
--
-- WHEN TO RUN:
-- - After any RLS policy changes
-- - After adding new tables
-- - Before major releases
-- - Weekly as a health check
-- ============================================================

-- Create a temporary table to store test results
DROP TABLE IF EXISTS _rls_test_results;
CREATE TEMP TABLE _rls_test_results (
  test_id SERIAL,
  test_name TEXT,
  test_category TEXT,
  expected TEXT,
  actual TEXT,
  status TEXT,
  details TEXT
);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Function to run a test and record the result
CREATE OR REPLACE FUNCTION _run_rls_test(
  p_test_name TEXT,
  p_category TEXT,
  p_expected TEXT,
  p_actual TEXT,
  p_details TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO _rls_test_results (test_name, test_category, expected, actual, status, details)
  VALUES (
    p_test_name,
    p_category,
    p_expected,
    p_actual,
    CASE WHEN p_expected = p_actual THEN 'PASS' ELSE 'FAIL' END,
    p_details
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TEST 1: VERIFY RLS IS ENABLED ON ALL CRITICAL TABLES
-- ============================================================

DO $$
DECLARE
  r RECORD;
  tables_to_check TEXT[] := ARRAY[
    'companies',
    'projects',
    'areas',
    'user_companies',
    't_and_m_tickets',
    't_and_m_workers',
    't_and_m_items',
    'change_orders',
    'change_order_labor',
    'change_order_materials',
    'change_order_equipment',
    'change_order_subcontractors',
    'change_order_ticket_associations',
    'crew_checkins',
    'disposal_loads',
    'dump_sites',
    'daily_reports',
    'injury_reports',
    'material_requests',
    'messages',
    'labor_rates',
    'materials_equipment',
    'company_branding'
  ];
  tbl TEXT;
  rls_enabled BOOLEAN;
BEGIN
  FOREACH tbl IN ARRAY tables_to_check
  LOOP
    SELECT relrowsecurity INTO rls_enabled
    FROM pg_class
    WHERE relname = tbl AND relnamespace = 'public'::regnamespace;

    IF rls_enabled IS NULL THEN
      PERFORM _run_rls_test(
        'RLS enabled on ' || tbl,
        'RLS Enabled',
        'true',
        'TABLE NOT FOUND',
        'Table does not exist - may be expected if feature not deployed'
      );
    ELSE
      PERFORM _run_rls_test(
        'RLS enabled on ' || tbl,
        'RLS Enabled',
        'true',
        rls_enabled::TEXT,
        NULL
      );
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- TEST 2: VERIFY POLICIES EXIST ON CRITICAL TABLES
-- ============================================================

DO $$
DECLARE
  tbl TEXT;
  policy_count INT;
  tables_to_check TEXT[] := ARRAY[
    'companies',
    'projects',
    't_and_m_tickets',
    'change_orders',
    'crew_checkins'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_to_check
  LOOP
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE tablename = tbl AND schemaname = 'public';

    PERFORM _run_rls_test(
      'Policies exist on ' || tbl,
      'Policies Exist',
      'true',
      (policy_count > 0)::TEXT,
      policy_count || ' policies found'
    );
  END LOOP;
END $$;

-- ============================================================
-- TEST 3: MULTI-TENANT ISOLATION
-- Verify that data is properly isolated between companies
-- ============================================================

DO $$
DECLARE
  company_count INT;
  project_company_match INT;
  ticket_company_match INT;
  cor_company_match INT;
BEGIN
  -- Check that all projects belong to a valid company
  SELECT COUNT(*) INTO project_company_match
  FROM projects p
  WHERE NOT EXISTS (
    SELECT 1 FROM companies c WHERE c.id = p.company_id
  );

  PERFORM _run_rls_test(
    'All projects have valid company_id',
    'Data Integrity',
    '0',
    project_company_match::TEXT,
    'Orphaned projects found: ' || project_company_match
  );

  -- Check that all T&M tickets belong to a valid project
  SELECT COUNT(*) INTO ticket_company_match
  FROM t_and_m_tickets t
  WHERE NOT EXISTS (
    SELECT 1 FROM projects p WHERE p.id = t.project_id
  );

  PERFORM _run_rls_test(
    'All T&M tickets have valid project_id',
    'Data Integrity',
    '0',
    ticket_company_match::TEXT,
    'Orphaned tickets found: ' || ticket_company_match
  );

  -- Check that all CORs belong to a valid project
  SELECT COUNT(*) INTO cor_company_match
  FROM change_orders co
  WHERE NOT EXISTS (
    SELECT 1 FROM projects p WHERE p.id = co.project_id
  );

  PERFORM _run_rls_test(
    'All CORs have valid project_id',
    'Data Integrity',
    '0',
    cor_company_match::TEXT,
    'Orphaned CORs found: ' || cor_company_match
  );
END $$;

-- ============================================================
-- TEST 4: VERIFY ANON POLICIES EXIST
-- Field users use anon role - verify policies allow access
-- ============================================================

DO $$
DECLARE
  tbl TEXT;
  anon_policy_exists BOOLEAN;
  tables_needing_anon TEXT[] := ARRAY[
    'projects',
    'companies',
    'areas',
    't_and_m_tickets',
    't_and_m_workers',
    't_and_m_items',
    'change_orders',
    'crew_checkins',
    'disposal_loads',
    'messages',
    'daily_reports',
    'injury_reports',
    'material_requests'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_needing_anon
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = tbl
        AND schemaname = 'public'
        AND policyname ILIKE '%field%'
    ) INTO anon_policy_exists;

    PERFORM _run_rls_test(
      'Anon/Field policy exists on ' || tbl,
      'Anon Policies',
      'true',
      anon_policy_exists::TEXT,
      'Field users need access to this table'
    );
  END LOOP;
END $$;

-- ============================================================
-- TEST 5: VERIFY TICKET-COR ASSOCIATION INTEGRITY
-- ============================================================

DO $$
DECLARE
  orphan_associations INT;
  mismatched_assigned_cor INT;
BEGIN
  -- Check for junction entries pointing to non-existent tickets
  SELECT COUNT(*) INTO orphan_associations
  FROM change_order_ticket_associations a
  WHERE NOT EXISTS (
    SELECT 1 FROM t_and_m_tickets t WHERE t.id = a.ticket_id
  );

  PERFORM _run_rls_test(
    'No orphaned ticket associations',
    'Data Integrity',
    '0',
    orphan_associations::TEXT,
    'Associations pointing to deleted tickets'
  );

  -- Check for junction entries pointing to non-existent CORs
  SELECT COUNT(*) INTO orphan_associations
  FROM change_order_ticket_associations a
  WHERE NOT EXISTS (
    SELECT 1 FROM change_orders co WHERE co.id = a.change_order_id
  );

  PERFORM _run_rls_test(
    'No orphaned COR associations',
    'Data Integrity',
    '0',
    orphan_associations::TEXT,
    'Associations pointing to deleted CORs'
  );

  -- Check that assigned_cor_id matches junction table
  SELECT COUNT(*) INTO mismatched_assigned_cor
  FROM t_and_m_tickets t
  WHERE t.assigned_cor_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM change_order_ticket_associations a
      WHERE a.ticket_id = t.id AND a.change_order_id = t.assigned_cor_id
    );

  PERFORM _run_rls_test(
    'assigned_cor_id synced with junction table',
    'Data Integrity',
    '0',
    mismatched_assigned_cor::TEXT,
    'Tickets with assigned_cor_id but no junction entry'
  );
END $$;

-- ============================================================
-- TEST 6: VERIFY GRANTS TO ANON ROLE
-- ============================================================

DO $$
DECLARE
  tbl TEXT;
  has_select BOOLEAN;
  -- 'companies' is intentionally absent: its anon SELECT grant was revoked
  -- by 20260423_tighten_company_and_trade_rls.sql (reads go through RPCs).
  tables_needing_anon_select TEXT[] := ARRAY[
    'projects',
    'areas',
    'change_orders',
    'crew_checkins',
    'disposal_loads',
    'dump_sites',
    'labor_rates',
    'materials_equipment',
    'company_branding'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_needing_anon_select
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
      WHERE table_name = tbl
        AND table_schema = 'public'
        AND grantee = 'anon'
        AND privilege_type = 'SELECT'
    ) INTO has_select;

    PERFORM _run_rls_test(
      'Anon has SELECT on ' || tbl,
      'Grants',
      'true',
      has_select::TEXT,
      'Field users need SELECT access'
    );
  END LOOP;
END $$;

-- ============================================================
-- TEST 7: VERIFY NO OVERLY PERMISSIVE POLICIES
-- Check for dangerous patterns like "USING (true)"
-- ============================================================

DO $$
DECLARE
  r RECORD;
  dangerous_count INT := 0;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual = 'true' OR qual IS NULL)
      AND cmd IN ('SELECT', 'ALL')
  LOOP
    dangerous_count := dangerous_count + 1;
    PERFORM _run_rls_test(
      'Check policy: ' || r.tablename || '.' || r.policyname,
      'Security Review',
      'restricted',
      'UNRESTRICTED',
      'Policy allows access to all rows - verify this is intentional'
    );
  END LOOP;

  IF dangerous_count = 0 THEN
    PERFORM _run_rls_test(
      'No unrestricted SELECT policies found',
      'Security Review',
      'true',
      'true',
      'All policies have proper restrictions'
    );
  END IF;
END $$;

-- ============================================================
-- TEST 8: PUBLIC SIGNING
-- The /sign/:token flow runs as anon with only the token.
-- Verifies 20261105_public_signing_rpcs.sql: the four public
-- functions are SECURITY DEFINER with a pinned search_path, the
-- helpers are not executable by anon, anon has no table-level
-- SELECT on the tables the RPCs read, no blanket anon policy was
-- added, unknown tokens return NULL, and the tm-photos bucket is
-- still private behind the signing-token policy.
-- ============================================================

DO $$
DECLARE
  fn TEXT;
  r RECORD;
  v_found BOOLEAN;
  v_secdef BOOLEAN;
  v_has_path BOOLEAN;
  v_has_priv BOOLEAN;
  tbl TEXT;
  v_count INT;
  v_names TEXT;
  v_public BOOLEAN;
  v_req JSONB;
  v_doc JSONB;
  public_functions TEXT[] := ARRAY[
    'public_get_signature_request_by_token',
    'public_get_document_for_signing',
    'public_add_signature',
    'signing_token_can_read_photo'
  ];
BEGIN
  -- 8a. Public entry points exist, SECURITY DEFINER, search_path pinned
  FOREACH fn IN ARRAY public_functions
  LOOP
    SELECT TRUE,
           p.prosecdef,
           EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::TEXT[])) cfg WHERE cfg LIKE 'search_path=%')
    INTO v_found, v_secdef, v_has_path
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = fn
    LIMIT 1;

    IF v_found IS NULL THEN
      PERFORM _run_rls_test('Function exists: ' || fn, 'Public Signing', 'true', 'FUNCTION NOT FOUND', 'Apply 20261105_public_signing_rpcs.sql');
    ELSE
      PERFORM _run_rls_test('Function exists: ' || fn, 'Public Signing', 'true', 'true', NULL);
      PERFORM _run_rls_test('SECURITY DEFINER: ' || fn, 'Public Signing', 'true', v_secdef::TEXT, NULL);
      PERFORM _run_rls_test('search_path pinned: ' || fn, 'Public Signing', 'true', v_has_path::TEXT, 'proconfig must contain search_path=');
    END IF;
    v_found := NULL;
  END LOOP;

  -- 8b. anon has no table-level SELECT on what the RPCs read
  FOREACH tbl IN ARRAY ARRAY['signature_requests', 'signatures', 'companies']
  LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      PERFORM _run_rls_test('Anon has no SELECT on ' || tbl, 'Public Signing', 'false', 'TABLE NOT FOUND', NULL);
    ELSE
      SELECT has_table_privilege('anon', 'public.' || tbl, 'SELECT') INTO v_has_priv;
      PERFORM _run_rls_test('Anon has no SELECT on ' || tbl, 'Public Signing', 'false', v_has_priv::TEXT, 'Public reads must go through the token RPCs');
    END IF;
  END LOOP;

  -- 8c. No anon (or public) policy with USING (true) / WITH CHECK (true)
  SELECT COUNT(*), string_agg(schemaname || '.' || tablename || '.' || policyname, ', ')
  INTO v_count, v_names
  FROM pg_policies
  WHERE (
      (schemaname = 'public' AND tablename IN ('t_and_m_tickets', 'change_orders', 'signatures'))
      OR (schemaname = 'storage' AND tablename = 'objects')
    )
    AND (roles @> ARRAY['anon'::name] OR roles @> ARRAY['public'::name])
    AND (qual = 'true' OR with_check = 'true');

  PERFORM _run_rls_test(
    'No blanket anon policy on tickets/CORs/signatures/storage.objects',
    'Public Signing',
    '0',
    v_count::TEXT,
    COALESCE(v_names, 'none')
  );

  -- 8d. Unknown token -> NULL from both token RPCs
  BEGIN
    SELECT public_get_signature_request_by_token('sig_doesnotexist') INTO v_req;
    PERFORM _run_rls_test('Token RPC returns NULL for unknown token', 'Public Signing', 'true', (v_req IS NULL)::TEXT, NULL);
  EXCEPTION WHEN undefined_function THEN
    PERFORM _run_rls_test('Token RPC returns NULL for unknown token', 'Public Signing', 'true', 'FUNCTION NOT FOUND', NULL);
  END;

  BEGIN
    SELECT public_get_document_for_signing('sig_doesnotexist') INTO v_doc;
    PERFORM _run_rls_test('Document RPC returns NULL for unknown token', 'Public Signing', 'true', (v_doc IS NULL)::TEXT, NULL);
  EXCEPTION WHEN undefined_function THEN
    PERFORM _run_rls_test('Document RPC returns NULL for unknown token', 'Public Signing', 'true', 'FUNCTION NOT FOUND', NULL);
  END;

  -- 8e. Storage: signing policy exists, tm-photos bucket still private
  IF to_regclass('storage.objects') IS NULL OR to_regclass('storage.buckets') IS NULL THEN
    -- Not evaluated: report it like every other missing object in this file
    PERFORM _run_rls_test('Storage signing policy exists', 'Public Signing', 'true', 'SCHEMA NOT FOUND', 'storage schema not present (non-Supabase database)');
    PERFORM _run_rls_test('tm-photos bucket is private', 'Public Signing', 'false', 'SCHEMA NOT FOUND', 'storage schema not present (non-Supabase database)');
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'Signing link can read document photos'
        AND cmd = 'SELECT'
        AND roles = ARRAY['anon'::name]
    ) INTO v_found;
    PERFORM _run_rls_test('Storage signing policy exists', 'Public Signing', 'true', v_found::TEXT, 'Policy "Signing link can read document photos" FOR SELECT TO anon');

    EXECUTE 'SELECT b.public FROM storage.buckets b WHERE b.id = $1' INTO v_public USING 'tm-photos';
    IF v_public IS NULL THEN
      PERFORM _run_rls_test('tm-photos bucket is private', 'Public Signing', 'false', 'BUCKET NOT FOUND', NULL);
    ELSE
      PERFORM _run_rls_test('tm-photos bucket is private', 'Public Signing', 'false', v_public::TEXT, 'storage.buckets.public must stay false');
    END IF;
  END IF;

  -- 8g. The anon policies on signature_requests are pinned to a field
  --     session (a request row is the signing credential)
  FOR r IN
    SELECT * FROM (VALUES
      ('Anon can create signature requests', 'INSERT'),
      ('Anon can update signature requests', 'UPDATE')
    ) AS pol(name, cmd)
  LOOP
    SELECT COUNT(*) INTO v_count
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'signature_requests'
      AND policyname = r.name AND cmd = r.cmd
      AND roles = ARRAY['anon'::name]
      AND COALESCE(with_check, '') ILIKE '%can_access_project(project_id)%'
      AND COALESCE(with_check, '') ILIKE '%t_and_m_tickets%'
      AND COALESCE(with_check, '') ILIKE '%change_orders%';
    PERFORM _run_rls_test('Pinned anon policy: ' || r.name, 'Public Signing', '1', v_count::TEXT,
      'TO anon, WITH CHECK must require can_access_project(project_id) and a document inside the project');
  END LOOP;

  -- 8f. anon lacks EXECUTE on the two helpers
  FOR r IN
    SELECT * FROM (VALUES
      ('public_signing_pick', 'public.public_signing_pick(jsonb, text[])'),
      ('public_signing_ticket_json', 'public.public_signing_ticket_json(uuid)')
    ) AS h(name, signature)
  LOOP
    BEGIN
      SELECT has_function_privilege('anon', r.signature, 'EXECUTE') INTO v_has_priv;
      PERFORM _run_rls_test('Anon cannot execute helper ' || r.name, 'Public Signing', 'false', v_has_priv::TEXT, 'Helpers are called only from the SECURITY DEFINER entry points');
    EXCEPTION WHEN undefined_function THEN
      PERFORM _run_rls_test('Anon cannot execute helper ' || r.name, 'Public Signing', 'false', 'FUNCTION NOT FOUND', NULL);
    END;
  END LOOP;
END $$;

-- ============================================================
-- GENERATE TEST REPORT
-- ============================================================

-- Summary by category
SELECT
  '=== SUMMARY BY CATEGORY ===' as report;

SELECT
  test_category,
  COUNT(*) FILTER (WHERE status = 'PASS') as passed,
  COUNT(*) FILTER (WHERE status = 'FAIL') as failed,
  COUNT(*) as total
FROM _rls_test_results
GROUP BY test_category
ORDER BY test_category;

-- Overall summary
SELECT
  '=== OVERALL SUMMARY ===' as report;

SELECT
  COUNT(*) FILTER (WHERE status = 'PASS') as total_passed,
  COUNT(*) FILTER (WHERE status = 'FAIL') as total_failed,
  COUNT(*) as total_tests,
  CASE
    WHEN COUNT(*) FILTER (WHERE status = 'FAIL') = 0 THEN '✅ ALL TESTS PASSED'
    ELSE '❌ SOME TESTS FAILED - REVIEW BELOW'
  END as result
FROM _rls_test_results;

-- Failed tests detail
SELECT
  '=== FAILED TESTS ===' as report;

SELECT
  test_id,
  test_category,
  test_name,
  expected,
  actual,
  details
FROM _rls_test_results
WHERE status = 'FAIL'
ORDER BY test_id;

-- All tests detail
SELECT
  '=== ALL TESTS ===' as report;

SELECT
  test_id,
  status,
  test_category,
  test_name,
  COALESCE(details, '') as details
FROM _rls_test_results
ORDER BY test_id;

-- Cleanup
DROP FUNCTION IF EXISTS _run_rls_test(TEXT, TEXT, TEXT, TEXT, TEXT);
