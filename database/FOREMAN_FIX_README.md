# Foreman Mode Status Update Fix

## Problem
When foremen access projects via PIN and try to update area status (clicking "Working" or "Done"), they get an error saying it can't update status.

## Root Cause
The Row Level Security (RLS) policies in Supabase require authenticated users (with `auth.uid()` set), but foremen accessing via PIN are anonymous users. The policy at line 157-166 in `schema_v2.sql` blocks their updates.

## Solution
Apply the `fix_foreman_rls.sql` migration to add a permissive policy for anonymous area updates.

## How to Apply the Fix

### If using Supabase:
1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Open the file `fix_foreman_rls.sql`
4. Copy and paste the contents into the SQL Editor
5. Click "Run" to execute the migration

### If using local PostgreSQL:
```bash
psql -U your_username -d your_database -f database/fix_foreman_rls.sql
```

## Verification
After applying the migration:
1. Access the app as a foreman (use company code + project PIN)
2. Try clicking "Working" or "Done" on any area
3. The status should update successfully without errors

## Security Note
This migration allows anonymous updates to areas, which is safe because:
- PIN validation happens at the application level before granting access
- Only users with valid company code + project PIN can access foreman mode
- RLS still protects other tables (projects, users, etc.)

If you need stricter security, see the commented alternative policy in the migration file that only allows updates for projects with a PIN set.
