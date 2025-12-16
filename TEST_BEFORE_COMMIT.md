# Testing Guide - Before Committing Changes

## Summary of Changes

### 1. Branding Fix
- Changed `updateBranding` to use UPSERT instead of UPDATE
- Now handles both creating and updating branding records
- Fixed RLS policies to allow INSERT operations

### 2. User Management
- New "Users" tab (admin-only)
- Ability to view all users in the company
- Ability to change user roles (admin/office/foreman)
- Role-based badge colors

### 3. Tab Restrictions
- "Company", "Branding", and "Users" tabs now only visible to admins
- Office users can only see Dashboard, Setup, and Notifications
- Foremen have field-only access

## Files Changed (Not Yet Committed)

1. **src/lib/BrandingContext.jsx** - Changed UPDATE to UPSERT
2. **src/lib/supabase.js** - Added `getCompanyUsers()` and `updateUserRole()`
3. **src/components/UserManagement.jsx** - NEW file for user management
4. **src/App.jsx** - Added user management tab and admin restrictions
5. **src/index.css** - Added user management styles
6. **database/fix_branding_rls_policy.sql** - RLS policy fix (needs to be run in Supabase)
7. **BRANDING_DEBUG.md** - Debug guide (documentation)
8. **TEST_BEFORE_COMMIT.md** - This file (documentation)

## Pre-Testing: SQL Setup Required

**CRITICAL: You MUST run this SQL in Supabase first, or branding will still fail!**

Open Supabase SQL Editor and run:

```sql
-- Fix RLS policy for company_branding to allow INSERT operations
-- Safe to run multiple times

-- Drop all existing policies for company_branding (except SELECT policies)
DROP POLICY IF EXISTS "Company admins can update branding" ON company_branding;
DROP POLICY IF EXISTS "Company admins can insert branding" ON company_branding;
DROP POLICY IF EXISTS "Company admins can delete branding" ON company_branding;

-- Policy for INSERT
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

-- Policy for UPDATE
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

-- Policy for DELETE
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

## Testing Checklist

### Step 1: Check Your Role
First, verify your user role in Supabase SQL Editor:

```sql
SELECT id, email, name, role, company_id
FROM users
WHERE id = auth.uid();
```

**If your role is NOT 'admin'**, run this to promote yourself:

```sql
UPDATE users
SET role = 'admin'
WHERE id = auth.uid();
```

Then **refresh your browser** to reload your user data.

### Step 2: Build and Test

```bash
# Build the app with new changes
npm run build

# Start the dev server
npm run dev
```

### Step 3: Test Branding (Admin User)

1. **Login as admin user**
2. **Check navigation** - You should see:
   - Dashboard
   - + New Project
   - Company (admin only)
   - Branding (admin only)
   - Users (admin only)
   - Notifications

3. **Test Branding Settings**:
   - Click "Branding" tab
   - Change primary color (e.g., to #FF6B6B)
   - Change app name (e.g., to "MyCompany FieldSync")
   - Click "Save Changes"
   - **Expected**: ✅ Success message "Branding settings saved successfully!"
   - **NOT Expected**: ❌ 403 error or PGRST116 error

4. **Verify branding persists**:
   - Refresh the page
   - Go back to Branding tab
   - Colors and name should still be your changes

### Step 4: Test User Management (Admin User)

1. **Click "Users" tab**
2. **You should see**:
   - Table with all company users
   - Columns: Name, Email, Role, Actions
   - Your user should have "(You)" badge

3. **Test role change**:
   - Try to change your own role → Should show error "You cannot change your own role"
   - If you have other users, try changing their role
   - **Expected**: ✅ Success message and role updates

4. **Create a test office user** (via Supabase or registration) to test further

### Step 5: Test Tab Restrictions (Office User)

1. **Create or login as an office user**

Run this in Supabase SQL Editor to create a test office user:

```sql
-- Get your company_id first
SELECT id, name FROM companies WHERE id = (
  SELECT company_id FROM users WHERE id = auth.uid()
);

-- Create test office user (replace YOUR_COMPANY_ID)
INSERT INTO auth.users (email, encrypted_password)
VALUES ('test-office@example.com', crypt('password123', gen_salt('bf')));

INSERT INTO users (id, email, name, role, company_id)
SELECT
  id,
  'test-office@example.com',
  'Test Office User',
  'office',
  'YOUR_COMPANY_ID'  -- Replace with actual company_id from above
FROM auth.users
WHERE email = 'test-office@example.com';
```

2. **Login as office user**
3. **Check navigation** - You should see:
   - Dashboard
   - + New Project
   - Notifications
   - **NOT** Company, Branding, or Users

4. **Try to access admin tabs directly**:
   - Manually change URL or try to navigate
   - Content should not render (admin check in place)

### Step 6: Test Multi-Company Branding

1. **Login as GGG company admin**
2. Set branding: Primary color = #FF6B6B, App name = "GGG FieldSync"
3. **Logout and login as Miller company admin**
4. Set branding: Primary color = #4ECDC4, App name = "Miller FieldSync"
5. **Verify**: Each company has separate branding
6. **Switch companies** using CompanySwitcher - branding should update

## Expected Results Summary

| Test | Expected Result |
|------|----------------|
| Admin sees Company tab | ✅ Visible |
| Admin sees Branding tab | ✅ Visible |
| Admin sees Users tab | ✅ Visible |
| Office sees Company tab | ❌ Hidden |
| Office sees Branding tab | ❌ Hidden |
| Office sees Users tab | ❌ Hidden |
| Admin can save branding | ✅ Success (no 403/PGRST116) |
| Admin can change user roles | ✅ Success |
| Admin cannot change own role | ❌ Error message |
| Branding persists after refresh | ✅ Saved correctly |
| Each company has separate branding | ✅ Independent |

## If Everything Works

✅ **All tests pass** → Safe to commit!

Run:
```bash
git add -A
git commit -m "Add user management and fix branding RLS policies

- Fixed branding upsert to handle insert/update
- Added RLS policies with WITH CHECK for INSERT
- Created UserManagement component for role changes
- Restricted Company/Branding/Users tabs to admins only
- Added getCompanyUsers and updateUserRole to supabase.js
- Added user management CSS styles"

git push -u origin claude/fix-office-dashboard-9I9S2
```

## If Tests Fail

### Branding still shows 403:
- Did you run the SQL script in Supabase?
- Is your role 'admin' or 'office'?
- Check browser console for specific error

### Tabs still visible to office users:
- Did you rebuild the app? (`npm run build`)
- Check browser cache - try hard refresh (Ctrl+Shift+R)
- Verify user role in database

### User management not working:
- Check RLS policies on users table
- Verify `getCompanyUsers` function works
- Check browser console for errors

## Rollback (If Needed)

If something breaks and you need to undo:

```bash
# Discard all uncommitted changes
git checkout -- .
git clean -fd

# Rebuild with old code
npm run build
```

## Questions to Answer Before Committing

- [ ] Did I run the SQL script in Supabase?
- [ ] Can I save branding without errors?
- [ ] Do admin users see all tabs?
- [ ] Do office users NOT see admin tabs?
- [ ] Can I change other users' roles?
- [ ] Does branding persist after refresh?
- [ ] Is each company's branding separate?

**If all checkboxes are ✅, you're good to commit!**
