# Branding 403 Error - Debug Checklist

## Issue
Getting 403 error when trying to save branding settings.

## Root Causes
1. **RLS Policy Missing**: The `company_branding` table needs INSERT policy with `WITH CHECK` clause
2. **User Role Check**: User must have role 'admin' or 'office' to modify branding
3. **SQL Script Not Run**: The fix hasn't been applied to Supabase yet

## How to Check Your User Role

Run this in Supabase SQL Editor:
```sql
SELECT id, email, name, role, company_id
FROM users
WHERE id = auth.uid();
```

This will show you your current role. It should be either 'admin' or 'office' to save branding.

## Fix Steps

### Step 1: Run the RLS Policy Fix
Copy and run this in Supabase SQL Editor:

```sql
-- Fix RLS policy for company_branding to allow INSERT operations
-- Safe to run multiple times

-- Drop all existing policies for company_branding (except SELECT policies)
DROP POLICY IF EXISTS "Company admins can update branding" ON company_branding;
DROP POLICY IF EXISTS "Company admins can insert branding" ON company_branding;
DROP POLICY IF EXISTS "Company admins can delete branding" ON company_branding;

-- Create new policies with proper INSERT support

-- Policy for INSERT: Company admins can create branding for their company
CREATE POLICY "Company admins can insert branding" ON company_branding
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.company_id = company_branding.company_id
      AND users.id = auth.uid()
      AND users.role IN ('admin', 'office')
    )
  );

-- Policy for UPDATE: Company admins can update their company's branding
CREATE POLICY "Company admins can update branding" ON company_branding
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.company_id = company_branding.company_id
      AND users.id = auth.uid()
      AND users.role IN ('admin', 'office')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.company_id = company_branding.company_id
      AND users.id = auth.uid()
      AND users.role IN ('admin', 'office')
    )
  );

-- Policy for DELETE: Company admins can delete their company's branding
CREATE POLICY "Company admins can delete branding" ON company_branding
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.company_id = company_branding.company_id
      AND users.id = auth.uid()
      AND users.role IN ('admin', 'office')
    )
  );
```

### Step 2: Verify It Worked
After running the SQL, try saving branding again. It should work now.

### Step 3: If You Need to Change Your Role to Admin
If your role is 'office' and you want to be 'admin', run this:

```sql
UPDATE users
SET role = 'admin'
WHERE id = auth.uid();
```

## Next Steps After This Works
1. Add user management UI to change roles
2. Hide Company/Branding tabs from non-admin users
3. Add ability to promote users to admin
