# Fix for "column reference 'project_id' is ambiguous" Error

## Problem
When trying to validate a PIN for a project, users are seeing:
```
Error: column reference "project_id" is ambiguous
```

## Root Cause
The database has conflicting RLS (Row Level Security) policies that reference `project_id` without proper table qualification. This creates ambiguity when PostgreSQL tries to determine which table's `project_id` column to use.

## Solution
A comprehensive migration has been created that:
1. Drops all conflicting RLS policies
2. Recreates clean, properly qualified policies
3. Ensures field users (PIN-authenticated) and authenticated users have proper access

## How to Apply the Fix

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy the entire contents of: `/home/user/fieldsync/supabase/migrations/20250116_fix_ambiguous_project_id_v2.sql`
5. Paste into the SQL Editor
6. Click **Run** or press `Ctrl+Enter`
7. Check the output for the success message:
   ```
   ✓ FIXED AMBIGUOUS PROJECT_ID ERROR
   ```

### Option 2: Using Supabase CLI

If you have the Supabase CLI installed:

```bash
# Make sure you're in the project directory
cd /home/user/fieldsync

# Link to your Supabase project (if not already linked)
supabase link --project-ref your-project-ref

# Push the migration
supabase db push
```

### Option 3: Using psql directly

If you have direct database access:

```bash
psql "your-database-connection-string" < supabase/migrations/20250116_fix_ambiguous_project_id_v2.sql
```

## Verification

After applying the migration:

1. Try to validate a PIN in the app (e.g., for "GGG Demolition" project)
2. You should be able to enter the PIN successfully without the ambiguous column error
3. Check the Supabase logs for any errors

## What Changed

### Before (Problematic)
```sql
-- Ambiguous reference - which table's project_id?
WHERE project_id = projects.id
```

### After (Fixed)
```sql
-- Properly qualified - clear which table
WHERE project_assignments.project_id = projects.id
-- OR simplified policies that don't require joins:
WHERE p.id = areas.project_id
```

## Files Modified

1. **supabase/migrations/20250116_fix_ambiguous_project_id_v2.sql** - New migration with the fix
2. **database/schema_v2.sql** - Removed outdated policies (now managed in migrations)

## Need Help?

If you continue to see errors after applying this migration:
1. Check Supabase logs for any other errors
2. Verify the migration ran successfully
3. Try clearing your browser cache and reloading the app
4. Check that no other migrations are conflicting

---

**Status**: Ready to apply
**Priority**: HIGH - Blocking PIN validation for field users
**Created**: 2026-01-16
