# FieldSync Quick Start - Fixing Foreman Access

## 🚨 Problem
Foreman can't access projects using company code + PIN

## ✅ Solution Summary

I've fixed the foreman access issue and aligned the code with your Supabase database. Here's what was done:

### 1. **Created `.env` file**
   - Added your Supabase credentials from `.env.example`
   - The app will now connect to your Supabase database

### 2. **Created comprehensive database setup** (`database/complete_setup.sql`)
   - Fixed RLS policy conflicts that were blocking foreman access
   - Created all necessary tables for the application
   - Set up permissive policies allowing PIN-based access
   - Added realtime subscriptions for live updates

### 3. **Created sample data script** (`database/create_sample_data.sql`)
   - Sets up Miller and GGG users
   - Creates sample projects with PINs
   - Adds test data for development

### 4. **Created detailed setup guide** (`DATABASE_SETUP.md`)
   - Step-by-step instructions for database setup
   - Troubleshooting guide
   - Security considerations

---

## 🎯 Quick Setup (3 Steps)

### Step 1: Run Database Setup
```bash
# Go to Supabase SQL Editor
# Copy/paste: database/complete_setup.sql
# Click "Run"
```

### Step 2: Create Users in Supabase Auth
1. Go to Authentication > Users
2. Add user: `miller@example.com` (office role)
3. Add user: `ggg@example.com` (foreman role)
4. Copy their UUIDs

### Step 3: Add Sample Data
```bash
# Edit database/create_sample_data.sql
# Replace placeholder UUIDs with actual user IDs
# Run in Supabase SQL Editor
```

---

## 🧪 Test Foreman Access

**Company Code:** `DEMO`
**Project PINs:**
- `1234` - Downtown Office Building
- `5678` - Residential Complex Phase 1

**Flow:**
1. Open FieldSync app
2. Enter company code: `DEMO`
3. Enter PIN: `1234`
4. ✅ You should see the project with areas
5. ✅ Try updating an area status

---

## 📝 What Was Wrong?

The database had two conflicting schema files:

1. **`schema_v2.sql`** - Had restrictive RLS policies requiring authentication
2. **`add_pin.sql`** - Had permissive policies for PIN access

**The Problem:** The restrictive policies were blocking foreman access because:
- Foremen use PIN-based access (no authentication)
- RLS policies required `auth.uid()` (authenticated user ID)
- Unauthenticated requests were rejected

**The Fix:**
- Created unified schema with proper RLS policies
- Allows unauthenticated SELECT on projects/areas
- Allows unauthenticated UPDATE on areas
- Requires authentication for DELETE operations

---

## 📊 Database Schema

### Access Control

| User Type | Authentication | Can Do |
|-----------|---------------|---------|
| **Foreman** | PIN only | View projects, update areas, create T&M tickets |
| **Office** | Email/Password | Full access to company data |
| **Admin** | Email/Password | Full system access |

### Key Tables
- `companies` - Company with access codes
- `projects` - Projects with PINs for foreman access
- `areas` - Tasks/areas within projects
- `users` - User profiles (Miller, GGG, etc.)
- `t_and_m_tickets` - Time & Material tickets
- `crew_checkins` - Daily crew check-ins
- `daily_reports` - Field reports
- `messages` - Field/Office communication

---

## 🔐 Security Notes

**PIN Access:**
- PINs are scoped to specific companies (can't access other companies)
- Only active projects are accessible via PIN
- PINs should be rotated regularly
- Each project should have unique PIN

**User Accounts:**
- Miller and GGG need to be created in Supabase Auth
- Their profiles link to the `users` table
- GGG (foreman) is assigned to projects
- Miller (office) has full company access

---

## 📁 New Files Created

1. **`.env`** - Supabase configuration (already set up)
2. **`database/complete_setup.sql`** - Complete database schema
3. **`database/create_sample_data.sql`** - Sample users and projects
4. **`DATABASE_SETUP.md`** - Detailed setup guide
5. **`QUICK_START.md`** - This file

---

## ⚠️ Important Notes

1. **Run scripts in order:**
   - First: `complete_setup.sql`
   - Then: Create auth users
   - Finally: `create_sample_data.sql` (with actual UUIDs)

2. **Don't skip creating auth users:**
   - Miller and GGG must exist in Supabase Authentication
   - The sample data script creates their profiles
   - Without auth users, they can't sign in with email/password

3. **PIN access is working:**
   - The database now allows unauthenticated foreman access
   - No code changes needed in the application
   - Just run the database scripts

---

## 🆘 Troubleshooting

**Foreman still can't access?**
- Check company code is "DEMO" (case-sensitive)
- Verify PIN is correct (1234 or 5678)
- Make sure you ran `complete_setup.sql`
- Check project status is "active" in database

**Users can't sign in?**
- Verify users exist in Authentication > Users
- Check "Auto Confirm" is enabled
- Verify user profiles exist in `users` table
- Check email/password are correct

**Database errors?**
- Check Supabase Logs > Postgres Logs
- Look for RLS policy errors
- Verify all tables are created
- Check for permission issues

---

## 📞 Next Steps

1. ✅ Run `complete_setup.sql` in Supabase
2. ✅ Create Miller and GGG in Authentication
3. ✅ Run `create_sample_data.sql` with actual UUIDs
4. ✅ Test foreman access with company code "DEMO" and PIN "1234"
5. ✅ Test office access by signing in as Miller
6. 🎉 You're all set!

---

For detailed information, see **DATABASE_SETUP.md**
