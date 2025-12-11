# FieldSync Database Setup Guide

## Overview

This guide will help you set up the complete FieldSync database schema in Supabase with proper Row Level Security (RLS) policies that allow foreman PIN-based access.

## Problem Summary

The foreman access was blocked because:
1. Conflicting RLS policies between `schema_v2.sql` (restrictive) and `add_pin.sql` (permissive)
2. The restrictive policies required authentication, preventing PIN-based foreman access
3. Missing database tables for complete functionality

## Solution

We've created a comprehensive database setup script that:
- ✅ Creates all required tables
- ✅ Sets up proper RLS policies for PIN-based foreman access
- ✅ Allows unauthenticated foreman to view/update project data via PIN
- ✅ Requires authentication for project/area creation and deletion
- ✅ Enables realtime updates for collaborative features

---

## Step 1: Run Complete Database Setup

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Create a new query
4. Copy and paste the contents of `/database/complete_setup.sql`
5. Click **Run**

This will:
- Create all necessary tables (companies, projects, areas, users, etc.)
- Set up RLS policies that allow foreman PIN access
- Create a demo company with code "DEMO"
- Enable realtime subscriptions

---

## Step 2: Create Auth Users (Miller & GGG)

### Create Miller (Office User)

1. Go to **Authentication** > **Users** in Supabase Dashboard
2. Click **Add User** (email)
3. Enter:
   - **Email**: `miller@example.com`
   - **Password**: (choose a secure password)
   - **Auto Confirm**: ✅ Yes
4. Click **Create User**
5. **Copy the UUID** of the newly created user

### Create GGG (Foreman User)

1. Click **Add User** again
2. Enter:
   - **Email**: `ggg@example.com`
   - **Password**: (choose a secure password)
   - **Auto Confirm**: ✅ Yes
3. Click **Create User**
4. **Copy the UUID** of the newly created user

---

## Step 3: Create User Profiles and Sample Data

1. Open `/database/create_sample_data.sql`
2. **IMPORTANT**: Replace the placeholder UUIDs with the actual user IDs:
   ```sql
   -- Line 23: Replace with Miller's actual UUID
   '10000000-0000-0000-0000-000000000001', -- REPLACE WITH ACTUAL MILLER USER ID

   -- Line 38: Replace with GGG's actual UUID
   '20000000-0000-0000-0000-000000000001', -- REPLACE WITH ACTUAL GGG USER ID
   ```
3. Go to **SQL Editor** in Supabase
4. Paste the **updated** script
5. Click **Run**

This will create:
- User profiles for Miller and GGG
- 2 sample projects with PINs (1234 and 5678)
- Sample areas for each project
- Project assignments for GGG

---

## Step 4: Configure Storage for Photos (Optional)

If you plan to use photo uploads for T&M tickets:

1. Go to **Storage** in Supabase Dashboard
2. Click **New Bucket**
3. Name: `tm-photos`
4. Make it **Public**
5. Click **Create Bucket**
6. Go to **Policies** tab
7. Add policies:
   - **SELECT**: Allow public reads
   - **INSERT**: Allow anyone to upload
   - **DELETE**: Allow authenticated users to delete

---

## Step 5: Test Foreman Access

### Test PIN-Based Access (Foreman)

1. Open your FieldSync app
2. Enter company code: **DEMO**
3. Enter PIN: **1234** (for Downtown Office Building)
4. You should now see the project dashboard with areas
5. Try updating an area status (should work!)

### Test Authenticated Access (Office User)

1. Sign in with:
   - Email: `miller@example.com`
   - Password: (the password you set)
2. You should see all projects in the company
3. Try creating a new project (should work!)

---

## Database Schema Overview

### Main Tables

| Table | Purpose | Foreman Access |
|-------|---------|----------------|
| `companies` | Company information | Read via code |
| `projects` | Projects with PINs | Read via PIN |
| `areas` | Project tasks | Read & Update |
| `users` | User profiles | Auth required |
| `project_assignments` | Foreman assignments | Auth required |
| `materials_equipment` | Materials catalog | Read only |
| `t_and_m_tickets` | Time & Material tickets | Create & Read |
| `t_and_m_workers` | Workers on tickets | Create & Read |
| `t_and_m_items` | Materials/equipment used | Create & Read |
| `crew_checkins` | Daily crew check-ins | Full access |
| `daily_reports` | Daily field reports | Full access |
| `messages` | Field/Office communication | Full access |
| `material_requests` | Material requests | Create & Read |
| `activity_log` | Audit trail | Log only |

### RLS Policy Strategy

**Foreman (Unauthenticated) Access:**
- ✅ Can SELECT projects by PIN
- ✅ Can SELECT and UPDATE areas
- ✅ Can INSERT/SELECT T&M tickets, crew check-ins, messages, etc.
- ❌ Cannot DELETE projects or areas
- ❌ Cannot modify company settings

**Authenticated Users:**
- ✅ Full CRUD access to their company's data
- ✅ Can manage projects, areas, users
- ✅ Can approve/reject T&M tickets

---

## Troubleshooting

### Issue: Foreman can't access project

**Check:**
1. Is the PIN correct? (case-sensitive, 4 digits)
2. Is the company code correct? (DEMO)
3. Is the project status "active"?
4. Run this query in SQL Editor:
   ```sql
   SELECT id, name, pin, company_id, status
   FROM projects
   WHERE pin = '1234';
   ```

### Issue: RLS policy blocking access

**Check:**
1. Verify policies are created:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'projects';
   ```
2. Look for "Anyone can view projects by PIN" policy
3. If missing, re-run `complete_setup.sql`

### Issue: Users can't sign in

**Check:**
1. Are the users created in Authentication > Users?
2. Is "Auto Confirm" enabled?
3. Do they have profiles in the `users` table?
4. Run this query:
   ```sql
   SELECT * FROM users WHERE email = 'miller@example.com';
   ```

---

## Migration from Old Schema

If you already have data and used the old schema files:

1. **Backup your data first!**
2. The new `complete_setup.sql` uses `CREATE TABLE IF NOT EXISTS` so it won't overwrite existing tables
3. It will drop and recreate RLS policies to fix conflicts
4. Your existing data will remain intact
5. Test thoroughly before using in production

---

## What Changed

### Fixed Issues:
1. ✅ Resolved RLS policy conflicts between schema_v2.sql and add_pin.sql
2. ✅ Created permissive policies for foreman PIN access
3. ✅ Added all missing tables for complete functionality
4. ✅ Ensured proper indexes for performance
5. ✅ Enabled realtime for collaborative features

### Key Changes:
- **Old**: Restrictive RLS requiring authentication for all access
- **New**: Permissive RLS allowing unauthenticated PIN-based foreman access
- **Old**: Separate schema files causing conflicts
- **New**: Single comprehensive setup script

---

## Security Notes

### Is PIN-based access secure?

The current implementation allows unauthenticated foreman access via PIN. This is a **trade-off** between security and usability:

**Pros:**
- ✅ Foremen don't need to remember passwords
- ✅ Easy to rotate PINs per project
- ✅ PINs are scoped to specific companies (prevent cross-company access)

**Cons:**
- ⚠️ Anyone with the PIN can access the project
- ⚠️ No audit trail of individual foreman actions

**Recommendations:**
1. Use unique PINs per project
2. Rotate PINs regularly
3. Don't reuse PINs across projects
4. For sensitive projects, require authenticated foreman accounts
5. Monitor activity logs for suspicious behavior

---

## Need Help?

If you encounter issues:
1. Check the Supabase logs (Logs > Postgres Logs)
2. Review RLS policies in Database > Policies
3. Test with the SQL Editor directly
4. Contact support with specific error messages

---

**Setup Complete!** 🎉

You should now have a fully functional FieldSync database with proper foreman PIN access.
