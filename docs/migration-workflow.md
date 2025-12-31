# Database Migration Workflow

**Last Updated:** December 30, 2024

This document outlines the safe process for testing and deploying database migrations.

---

## Overview

**Never run migrations directly in production without testing first.**

```
Write Migration → Test in Branch → Verify → Apply to Production → Verify Again
```

---

## Option A: Supabase Branching (Recommended)

### Prerequisites
- Supabase Pro plan or higher
- Branching enabled in project settings

### Workflow

#### Step 1: Create a Branch
1. Go to Supabase Dashboard → Your Project
2. Click **Branches** in the left sidebar
3. Click **Create Branch**
4. Name it: `migration-YYYYMMDD-description`
5. Wait for branch to be ready (~2-3 minutes)

#### Step 2: Test Migration in Branch
1. Open the branch's SQL Editor
2. Run your migration SQL
3. Verify:
   - No errors during execution
   - Tables/columns created correctly
   - Existing data not corrupted
   - RLS policies working (run `rls_policy_tests.sql`)

#### Step 3: Test Application Against Branch
1. Copy the branch's connection string
2. Update local `.env` temporarily:
   ```
   VITE_SUPABASE_URL=https://your-branch-ref.supabase.co
   ```
3. Run `npm run dev`
4. Test affected features manually
5. Verify no console errors

#### Step 4: Apply to Production
1. Revert `.env` to production URL
2. Open production SQL Editor
3. Run the migration SQL
4. Run `rls_policy_tests.sql` to verify

#### Step 5: Cleanup
1. Delete the test branch
2. Commit migration file to git
3. Update `daily log.md`

---

## Option B: Manual Testing (No Branching)

If branching isn't available, use this more careful approach:

### Step 1: Backup Critical Data
```sql
-- Create backup of affected tables
CREATE TABLE _backup_YYYYMMDD_tablename AS
SELECT * FROM tablename;
```

### Step 2: Review Migration Carefully
- [ ] Read every line of SQL
- [ ] Identify destructive operations (DROP, DELETE, ALTER)
- [ ] Check for missing `IF EXISTS` / `IF NOT EXISTS`
- [ ] Verify `ON CONFLICT` handling

### Step 3: Test Non-Destructive Parts First
Run SELECT queries to verify assumptions:
```sql
-- Before adding a column, verify table exists
SELECT column_name FROM information_schema.columns
WHERE table_name = 'your_table';

-- Before modifying data, check current state
SELECT COUNT(*) FROM affected_table WHERE condition;
```

### Step 4: Run Migration in Chunks
Don't run the entire file at once. Run section by section:
1. Schema changes (CREATE, ALTER)
2. Data migrations
3. Policy changes
4. Grant statements

### Step 5: Verify After Each Section
- Check for errors
- Verify expected state
- Test application briefly

---

## Migration File Template

```sql
-- ============================================================
-- MIGRATION: [Description]
-- Date: YYYY-MM-DD
-- Author: [Name]
-- ============================================================
--
-- PURPOSE:
-- [Explain what this migration does and why]
--
-- AFFECTED TABLES:
-- - table1: [what changes]
-- - table2: [what changes]
--
-- ROLLBACK AVAILABLE: Yes/No
-- ============================================================

-- ============================================================
-- PRE-FLIGHT CHECKS
-- ============================================================

-- Verify preconditions before running
DO $$
BEGIN
  -- Example: Verify table exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'expected_table') THEN
    RAISE EXCEPTION 'Precondition failed: expected_table does not exist';
  END IF;
END $$;

-- ============================================================
-- MIGRATION
-- ============================================================

-- [Your migration SQL here]

-- ============================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================

-- Verify migration succeeded
DO $$
BEGIN
  -- Example: Verify new column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tablename' AND column_name = 'new_column'
  ) THEN
    RAISE EXCEPTION 'Migration verification failed: new_column not created';
  END IF;

  RAISE NOTICE '✅ Migration completed successfully';
END $$;

-- ============================================================
-- ROLLBACK SCRIPT (Save separately)
-- ============================================================
/*
-- To rollback this migration, run:

-- [Rollback SQL here]

*/
```

---

## Rollback Scripts

**Every migration should have a corresponding rollback script.**

Save rollback scripts in: `supabase/rollbacks/`

### Naming Convention
```
supabase/migrations/20241230_add_feature.sql
supabase/rollbacks/20241230_add_feature_rollback.sql
```

### Rollback Template
```sql
-- ============================================================
-- ROLLBACK: [Original Migration Description]
-- Original Migration: 20241230_add_feature.sql
-- ============================================================
--
-- WARNING: Only run this if you need to undo the migration
-- This may result in data loss if the feature was in use
--
-- ============================================================

-- [Rollback SQL - reverse of migration]

-- Verify rollback
DO $$
BEGIN
  RAISE NOTICE '✅ Rollback completed';
END $$;
```

---

## Pre-Deployment Checklist

Before running any migration in production:

### Code Review
- [ ] Migration reviewed by another developer (if available)
- [ ] Rollback script exists and is tested
- [ ] Migration tested in branch or local environment

### Timing
- [ ] Scheduled during low-traffic period
- [ ] Team notified of potential downtime
- [ ] No other deploys happening simultaneously

### Backup
- [ ] Recent backup exists (Supabase does daily backups)
- [ ] Know how to restore if needed
- [ ] Critical tables backed up manually if nervous

### Verification Ready
- [ ] Know what queries to run to verify success
- [ ] RLS test script ready to run
- [ ] Application test plan ready

---

## Post-Deployment Checklist

After running migration in production:

### Immediate (Within 5 minutes)
- [ ] Migration completed without errors
- [ ] Run `rls_policy_tests.sql` - all passing
- [ ] Basic application smoke test:
  - [ ] Can log in (office)
  - [ ] Can access field view (PIN)
  - [ ] Can load a project
  - [ ] Can create a T&M ticket (if relevant)

### Short-term (Within 1 hour)
- [ ] Check error monitoring for new errors
- [ ] Verify no RLS-related console errors
- [ ] Test specific features affected by migration

### Documentation
- [ ] Update `daily log.md` with migration details
- [ ] Commit migration file to git
- [ ] Note any issues encountered for future reference

---

## Emergency Rollback Procedure

If something goes wrong:

### Step 1: Assess Severity
- **Low:** Feature broken but app works → Can fix forward
- **Medium:** Significant feature broken → Consider rollback
- **Critical:** App unusable or data at risk → Immediate rollback

### Step 2: Communicate
- Notify team/stakeholders
- If user-facing, consider maintenance message

### Step 3: Execute Rollback
1. Open Supabase SQL Editor
2. Run the rollback script
3. Verify rollback succeeded
4. Test application

### Step 4: Post-Mortem
- Document what went wrong
- Update migration to fix issue
- Re-test in branch before retry

---

## Quick Reference

### Create Branch (CLI)
```bash
# If using Supabase CLI
supabase branches create migration-test
supabase branches list
supabase branches delete migration-test
```

### Common Verification Queries
```sql
-- Check if table exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'tablename'
);

-- Check if column exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'tablename' AND column_name = 'columnname'
);

-- Check RLS is enabled
SELECT relrowsecurity FROM pg_class WHERE relname = 'tablename';

-- Count policies on table
SELECT COUNT(*) FROM pg_policies WHERE tablename = 'tablename';

-- Check grants
SELECT * FROM information_schema.role_table_grants
WHERE table_name = 'tablename';
```
