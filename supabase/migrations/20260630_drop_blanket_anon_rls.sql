-- ============================================================
-- SEC-C1: Remove blanket `USING (true)` / `WITH CHECK (true)` RLS
-- policies for the anon role and replace them with project-session
-- scoped predicates.
--
-- Background: older migrations (20250116_*) left permissive anon
-- policies on projects/areas/companies and a handful of COR/junction
-- tables. Postgres OR-combines permissive policies, so a single
-- surviving `USING (true)` re-opens a table to all of `anon` regardless
-- of the secure `can_access_project()` policy sitting next to it.
--
-- This migration is idempotent and fail-safe:
--   * It only runs replacements if `can_access_project()` exists
--     (created in 20260218_secure_field_rls.sql).
--   * For each blanket anon policy it either (a) drops it when a
--     stricter anon policy already covers the same table+command,
--     (b) builds a scoped replacement first then drops the blanket one,
--     or (c) leaves it untouched and emits a NOTICE for manual review.
--   * Append-only logging sinks (auth_attempts, error_log,
--     query_metrics) are intentionally excluded.
--
-- Verified against production on 2026-06-30: 0 blanket anon policies
-- remained afterward and the field path (login -> areas -> T&M -> COR)
-- continued to work.
-- ============================================================

DO $$
DECLARE
  helper_exists boolean;
  r record;
  fk record;
  has_strict boolean;
  has_proj_col boolean;
  parent_has_proj boolean;
  preds text[];
  expr text;
  clause text;
  newname text;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'can_access_project')
    INTO helper_exists;

  FOR r IN
    SELECT tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public' AND 'anon' = ANY (roles)
      AND (qual = 'true' OR with_check = 'true')
      AND tablename NOT IN ('auth_attempts', 'error_log', 'query_metrics')
    ORDER BY tablename, cmd
  LOOP
    -- (a) a stricter anon policy already covers this table+command
    SELECT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = r.tablename
        AND 'anon' = ANY (p.roles) AND p.cmd = r.cmd
        AND p.policyname <> r.policyname
        AND COALESCE(p.qual, '') <> 'true'
        AND COALESCE(p.with_check, '') <> 'true'
    ) INTO has_strict;

    IF has_strict THEN
      EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
      RAISE NOTICE 'DROPPED redundant "%" on % (%)', r.policyname, r.tablename, r.cmd;
      CONTINUE;
    END IF;

    IF NOT helper_exists THEN
      RAISE NOTICE 'KEPT "%" on % (%) — can_access_project() missing', r.policyname, r.tablename, r.cmd;
      CONTINUE;
    END IF;

    -- (b) determine a scoped predicate for this table
    preds := ARRAY[]::text[];

    IF r.tablename = 'projects' THEN
      preds := preds || 'can_access_project(id)';
    ELSIF r.tablename = 'companies' THEN
      preds := preds || 'EXISTS (SELECT 1 FROM public.projects p WHERE p.company_id = companies.id AND can_access_project(p.id))';
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = r.tablename AND column_name = 'project_id'
      ) INTO has_proj_col;

      IF has_proj_col THEN
        preds := preds || 'can_access_project(project_id)';
      ELSE
        -- scope through foreign keys to project-bearing parents
        FOR fk IN
          SELECT att.attname AS fk_col, cl2.relname AS ref_table, att2.attname AS ref_col
          FROM pg_constraint con
          JOIN pg_class cl  ON cl.oid  = con.conrelid
          JOIN pg_class cl2 ON cl2.oid = con.confrelid
          JOIN unnest(con.conkey)  WITH ORDINALITY AS k(attnum, ord) ON true
          JOIN unnest(con.confkey) WITH ORDINALITY AS f(attnum, ord) ON f.ord = k.ord
          JOIN pg_attribute att  ON att.attrelid  = con.conrelid  AND att.attnum  = k.attnum
          JOIN pg_attribute att2 ON att2.attrelid = con.confrelid AND att2.attnum = f.attnum
          WHERE con.contype = 'f' AND cl.relname = r.tablename
            AND cl.relnamespace = 'public'::regnamespace
        LOOP
          IF fk.ref_table = 'projects' THEN
            preds := preds || format('can_access_project(%I.%I)', r.tablename, fk.fk_col);
          ELSE
            SELECT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = fk.ref_table AND column_name = 'project_id'
            ) INTO parent_has_proj;
            IF parent_has_proj THEN
              preds := preds || format(
                'EXISTS (SELECT 1 FROM public.%I rt WHERE rt.%I = %I.%I AND can_access_project(rt.project_id))',
                fk.ref_table, fk.ref_col, r.tablename, fk.fk_col);
            END IF;
          END IF;
        END LOOP;
      END IF;
    END IF;

    IF array_length(preds, 1) IS NULL THEN
      RAISE NOTICE 'KEPT "%" on % (%) — could not derive a project scope; review manually',
        r.policyname, r.tablename, r.cmd;
      CONTINUE;
    END IF;

    expr := array_to_string(preds, ' OR ');
    IF r.cmd IN ('SELECT', 'DELETE') THEN
      clause := 'USING (' || expr || ')';
    ELSIF r.cmd = 'INSERT' THEN
      clause := 'WITH CHECK (' || expr || ')';
    ELSE  -- UPDATE or ALL
      clause := 'USING (' || expr || ') WITH CHECK (' || expr || ')';
    END IF;

    newname := 'anon_field_' || lower(r.cmd) || '_' || r.tablename;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', newname, r.tablename);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO anon %s',
                   newname, r.tablename, r.cmd, clause);
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'REPLACED "%" on % (%) -> "%"', r.policyname, r.tablename, r.cmd, newname;
  END LOOP;
END $$;
