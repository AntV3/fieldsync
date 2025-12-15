-- ============================================
-- MIGRATION: Add project owners to existing projects
-- Run this AFTER running project_permissions_schema.sql
-- ============================================

-- This migration is SAFE and BACKWARD COMPATIBLE
-- It only adds data, doesn't remove or change existing data

-- ============================================
-- 1. ENSURE created_by COLUMN EXISTS
-- Add it if missing (for older schemas)
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE projects ADD COLUMN created_by UUID REFERENCES users(id);
    RAISE NOTICE '✅ Added created_by column to projects table';
  ELSE
    RAISE NOTICE '✅ created_by column already exists';
  END IF;
END $$;

-- ============================================
-- 2. ADD PROJECT OWNERS TO EXISTING PROJECTS
-- Strategy:
-- 1. If project has created_by, make them owner
-- 2. Otherwise, make the first admin/office user the owner
-- ============================================

DO $$
DECLARE
  v_project RECORD;
  v_owner_id UUID;
  v_projects_migrated INT := 0;
  v_projects_assigned_admin INT := 0;
BEGIN
  RAISE NOTICE 'Starting migration of existing projects...';

  -- First pass: Assign owners to projects with created_by
  FOR v_project IN
    SELECT id, created_by, company_id
    FROM projects
    WHERE created_by IS NOT NULL
  LOOP
    -- Add project creator as owner (if not already added by trigger)
    INSERT INTO project_users (project_id, user_id, project_role, invited_by)
    VALUES (v_project.id, v_project.created_by, 'owner', v_project.created_by)
    ON CONFLICT (project_id, user_id) DO NOTHING;

    v_projects_migrated := v_projects_migrated + 1;
  END LOOP;

  RAISE NOTICE '✅ Assigned owners to % projects (from created_by)', v_projects_migrated;

  -- Second pass: Handle projects without created_by or without any owner
  FOR v_project IN
    SELECT p.id, p.company_id
    FROM projects p
    LEFT JOIN project_users pu ON pu.project_id = p.id AND pu.project_role = 'owner'
    WHERE pu.id IS NULL -- No owner yet
  LOOP
    -- Find first admin/office user for this company
    SELECT u.id INTO v_owner_id
    FROM users u
    WHERE u.company_id = v_project.company_id
      AND u.role IN ('admin', 'office')
    ORDER BY u.created_at
    LIMIT 1;

    IF v_owner_id IS NOT NULL THEN
      INSERT INTO project_users (project_id, user_id, project_role)
      VALUES (v_project.id, v_owner_id, 'owner')
      ON CONFLICT (project_id, user_id) DO NOTHING;

      v_projects_assigned_admin := v_projects_assigned_admin + 1;
    ELSE
      -- Last resort: find ANY user in the company
      SELECT u.id INTO v_owner_id
      FROM users u
      WHERE u.company_id = v_project.company_id
      ORDER BY u.created_at
      LIMIT 1;

      IF v_owner_id IS NOT NULL THEN
        INSERT INTO project_users (project_id, user_id, project_role)
        VALUES (v_project.id, v_owner_id, 'owner')
        ON CONFLICT (project_id, user_id) DO NOTHING;

        RAISE NOTICE '⚠️  Project % - assigned first company user as owner', v_project.id;
        v_projects_assigned_admin := v_projects_assigned_admin + 1;
      ELSE
        RAISE WARNING '❌ Project % has no users in company - cannot assign owner!', v_project.id;
      END IF;
    END IF;
  END LOOP;

  IF v_projects_assigned_admin > 0 THEN
    RAISE NOTICE '⚠️  Assigned owners to % projects without created_by (used company admin)', v_projects_assigned_admin;
  END IF;
END $$;


-- ============================================
-- 2. KEEP EXISTING NOTIFICATION ROLES AS COMPANY-WIDE
-- All existing notification_roles stay company-wide (project_id = NULL)
-- New project-specific roles will be created through the UI
-- ============================================

DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM notification_roles WHERE project_id IS NULL;
  RAISE NOTICE '✅ % existing notification roles remain company-wide', v_count;
  RAISE NOTICE '💡 New project-specific notification roles can be created in the UI';
END $$;


-- ============================================
-- 3. VERIFY MIGRATION
-- Check that all projects have at least one owner
-- ============================================

DO $$
DECLARE
  v_total_projects INT;
  v_projects_with_owners INT;
  v_projects_without_owners INT;
BEGIN
  SELECT COUNT(*) INTO v_total_projects FROM projects;

  SELECT COUNT(DISTINCT project_id) INTO v_projects_with_owners
  FROM project_users WHERE project_role = 'owner';

  v_projects_without_owners := v_total_projects - v_projects_with_owners;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'MIGRATION COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total projects: %', v_total_projects;
  RAISE NOTICE 'Projects with owners: %', v_projects_with_owners;

  IF v_projects_without_owners > 0 THEN
    RAISE WARNING '⚠️  Projects without owners: % (manual review needed)', v_projects_without_owners;
  ELSE
    RAISE NOTICE '✅ All projects have owners!';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Project owners can now invite team members via UI';
  RAISE NOTICE '2. Project-specific notification roles can be created';
  RAISE NOTICE '3. Existing company-wide notification roles still work';
  RAISE NOTICE '========================================';
END $$;


-- ============================================
-- ROLLBACK (if needed)
-- Uncomment to undo migration
-- ============================================
-- DELETE FROM project_user_permissions;
-- DELETE FROM project_users;
-- UPDATE notification_roles SET project_id = NULL;
