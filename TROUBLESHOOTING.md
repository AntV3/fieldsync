# FieldSync Troubleshooting Guide

## 🚨 "Invalid Code" Error When Entering as Foreman

### Problem
When you try to enter as a foreman, you get an "Invalid company code" error.

### Root Cause
The **company doesn't exist in your Supabase database yet**. The app is looking for a company with the code you entered (e.g., "DEMO"), but it can't find it because the database setup hasn't been run.

---

## ✅ Solution - 3 Options

### Option 1: Quick Fix (Fastest - 2 minutes)

If you just want to test foreman access right now:

1. Go to your **Supabase Dashboard** → **SQL Editor**
2. Copy and paste: `database/quick_fix_demo_company.sql`
3. Click **Run**
4. ✅ Now try foreman access:
   - Company Code: **DEMO**
   - PIN: **1234**

This creates a demo company and test project instantly.

---

### Option 2: Verify First, Then Fix (Recommended - 5 minutes)

Check what's in your database first:

#### Step 1: Check Database Status
1. Go to **Supabase Dashboard** → **SQL Editor**
2. Copy and paste: `database/verify_setup.sql`
3. Click **Run**
4. Look at the results:
   - ✅ If "Companies Table" shows "HAS DATA" → Company exists, check the code
   - ❌ If "Companies Table" shows "EMPTY" → No companies, you need to create one

#### Step 2A: If Database is Empty
Run the quick fix from Option 1, OR run the complete setup:
1. Copy and paste: `database/complete_setup.sql`
2. Click **Run**
3. Then run `database/quick_fix_demo_company.sql` for test data

#### Step 2B: If Company Exists but Different Code
The verify script will show you the actual company codes in your database. Use one of those codes instead of "DEMO".

---

### Option 3: Complete Setup (Best for Production - 10 minutes)

Follow the full setup guide in `DATABASE_SETUP.md`:

1. Run `database/complete_setup.sql` (creates all tables)
2. Create auth users in Supabase (Miller & GGG)
3. Run `database/create_sample_data.sql` (with real user IDs)
4. Test with proper credentials

---

## 🔍 Diagnosing the Issue

### Check 1: Do the tables exist?

Run this in Supabase SQL Editor:
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('companies', 'projects', 'areas');
```

**Expected Result:** You should see 3 rows (companies, projects, areas)

**If you see 0 rows:** The tables don't exist. Run `complete_setup.sql`

---

### Check 2: Does the company exist?

Run this in Supabase SQL Editor:
```sql
SELECT id, name, code
FROM companies;
```

**Expected Result:** At least one company with code "DEMO"

**If you see 0 rows:** No companies exist. Run `quick_fix_demo_company.sql`

**If you see different codes:** Use the code shown in the results

---

### Check 3: Do projects with PINs exist?

Run this in Supabase SQL Editor:
```sql
SELECT p.name, p.pin, c.code as company_code, p.status
FROM projects p
JOIN companies c ON p.company_id = c.id
WHERE p.status = 'active';
```

**Expected Result:** At least one project with a PIN

**If you see 0 rows:** No projects exist. Run `quick_fix_demo_company.sql`

---

## 🎯 Step-by-Step Fix (If Nothing Works)

### 1. Completely Fresh Start

```sql
-- WARNING: This deletes all data! Only use on empty/test databases

-- Drop all tables (in correct order due to foreign keys)
DROP TABLE IF EXISTS material_requests CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS daily_reports CASCADE;
DROP TABLE IF EXISTS crew_checkins CASCADE;
DROP TABLE IF EXISTS t_and_m_items CASCADE;
DROP TABLE IF EXISTS t_and_m_workers CASCADE;
DROP TABLE IF EXISTS t_and_m_tickets CASCADE;
DROP TABLE IF EXISTS materials_equipment CASCADE;
DROP TABLE IF EXISTS activity_log CASCADE;
DROP TABLE IF EXISTS project_assignments CASCADE;
DROP TABLE IF EXISTS areas CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
```

### 2. Run Complete Setup

Copy and paste `database/complete_setup.sql` and run it.

### 3. Create Demo Data

Copy and paste `database/quick_fix_demo_company.sql` and run it.

### 4. Test

- Company Code: **DEMO**
- PIN: **1234**

---

## 📊 Common Errors and Solutions

### Error: "Invalid company code"

**Cause:** Company doesn't exist or code is wrong

**Solutions:**
1. Check if companies exist: `SELECT * FROM companies`
2. Verify the code is correct (case-sensitive)
3. Run `quick_fix_demo_company.sql` to create demo company

---

### Error: "Invalid PIN"

**Cause:** Project doesn't exist, PIN is wrong, or project is inactive

**Solutions:**
1. Check projects: `SELECT * FROM projects WHERE pin IS NOT NULL`
2. Verify PIN is exactly 4 digits
3. Check project status is 'active'
4. Run `quick_fix_demo_company.sql` to create demo project

---

### Error: "relation 'companies' does not exist"

**Cause:** Tables haven't been created yet

**Solution:** Run `database/complete_setup.sql`

---

### Error: "permission denied for table companies"

**Cause:** RLS policies blocking access

**Solutions:**
1. Make sure you ran `complete_setup.sql` which sets up proper RLS
2. Check RLS policies: `SELECT * FROM pg_policies WHERE tablename = 'companies'`
3. You should see policy "Anyone can view companies by code"

---

## 🔐 Testing Different Scenarios

### Test 1: Foreman PIN Access (Unauthenticated)
- Should work: Company code "DEMO" → PIN "1234"
- Should fail: Wrong company code
- Should fail: Wrong PIN
- Should fail: Inactive project

### Test 2: Office Login (Authenticated)
- Need to create user first in Supabase Authentication
- Then can sign in with email/password

### Test 3: Create Your Own Company

```sql
-- Create your own company
INSERT INTO companies (name, code)
VALUES ('Your Company Name', 'YOURCODE');

-- Get the company ID
SELECT id, name, code FROM companies WHERE code = 'YOURCODE';

-- Create a project (replace <company-id> with actual ID)
INSERT INTO projects (name, contract_value, company_id, pin, status)
VALUES ('My Project', 50000.00, '<company-id>', '9999', 'active');
```

Now test with:
- Company Code: **YOURCODE**
- PIN: **9999**

---

## 📞 Still Not Working?

### 1. Check Browser Console
1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for errors
4. Check Network tab for failed requests

### 2. Check Supabase Logs
1. Go to Supabase Dashboard
2. Click on "Logs" → "Postgres Logs"
3. Look for errors or blocked queries
4. Check for RLS policy violations

### 3. Verify Environment Variables
Check that your `.env` file has correct values:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Restart your dev server after changing `.env`:
```bash
npm run dev
```

### 4. Check Network Connectivity
Make sure your app can reach Supabase:
```javascript
// Open browser console and run:
console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL)
```

---

## ✨ Success Checklist

Once everything works, you should be able to:

- ✅ Enter company code "DEMO"
- ✅ See company name appear
- ✅ Enter PIN "1234"
- ✅ See project "Test Project" load
- ✅ See 4 areas (Foundation, Framing, Electrical, Plumbing)
- ✅ Update area status by clicking on them

---

## 🎯 Quick Reference

### Working Test Credentials

**Foreman PIN Access:**
- Company: `DEMO`
- PIN: `1234`

**What Gets Created by Quick Fix:**
- 1 Company: "Demo Construction Co" (code: DEMO)
- 1 Project: "Test Project" (PIN: 1234)
- 4 Areas: Foundation, Framing, Electrical, Plumbing

---

## 📝 Scripts Summary

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `verify_setup.sql` | Check database status | Always run this first |
| `quick_fix_demo_company.sql` | Create demo data fast | Testing/development |
| `complete_setup.sql` | Full database schema | Production setup |
| `create_sample_data.sql` | Sample users & projects | After creating auth users |

---

## 💡 Pro Tips

1. **Always run verify_setup.sql first** - It tells you exactly what's missing
2. **Use quick_fix for testing** - Get up and running in seconds
3. **Use complete_setup for production** - Proper setup with all tables
4. **Check Supabase logs** - They show exactly what's failing
5. **Test in SQL Editor first** - Verify queries work before using the app

---

Need more help? Check:
- `DATABASE_SETUP.md` - Complete setup guide
- `QUICK_START.md` - Quick reference
- Supabase Documentation - https://supabase.com/docs
