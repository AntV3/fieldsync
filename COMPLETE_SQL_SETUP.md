# 📦 COMPLETE SQL SETUP - ALL CODE IN ONE PLACE

## For GGG and Miller (Your Two Companies)

This document contains all the **production-ready SQL code** you need, organized and ready to copy-paste.

---

## 🎯 Quick Start (Copy These in Order)

### STEP 1: Create All Database Tables (One-Time Only)

**File:** `database/complete_setup.sql`

**What it does:**
- Creates all 14 tables (companies, projects, areas, users, tickets, etc.)
- Sets up RLS policies for foreman PIN access
- Enables realtime subscriptions
- Configures indexes for performance

**How to run:**
1. Go to Supabase SQL Editor
2. Copy the entire contents of `database/complete_setup.sql`
3. Paste and click **Run**
4. Wait ~5-10 seconds
5. You should see "SETUP COMPLETE!" at the bottom

⏱️ **Estimated time:** 10 seconds

---

### STEP 2: Create GGG and Miller Companies

**File:** `database/setup_ggg_miller_companies.sql`

**What it does:**
- Creates GGG Construction (code: GGG)
- Creates Miller Construction (code: MILLER)
- Creates 2 projects for each company with PINs
- Creates realistic construction areas for all projects

**How to run:**
1. Go to Supabase SQL Editor
2. Copy the entire contents of `database/setup_ggg_miller_companies.sql`
3. Paste and click **Run**
4. You should see verification tables at the bottom

⏱️ **Estimated time:** 5 seconds

**You'll get:**

| Company | Code | Projects | PINs |
|---------|------|----------|------|
| GGG Construction | `GGG` | 2 projects | `1111`, `2222` |
| Miller Construction | `MILLER` | 2 projects | `3333`, `4444` |

---

### STEP 3: Validate Everything Works

**File:** `database/VALIDATE_SETUP.sql`

**What it does:**
- Checks all tables exist
- Verifies RLS policies are correct
- Validates PINs are unique and valid
- Confirms data is properly set up
- Shows summary of all companies and projects

**How to run:**
1. Go to Supabase SQL Editor
2. Copy the entire contents of `database/VALIDATE_SETUP.sql`
3. Paste and click **Run**
4. Check the output for ✅ or ❌

⏱️ **Estimated time:** 3 seconds

**Expected result:**
```
✅ ALL CHECKS PASSED!
Your database is properly configured for foreman access.
```

---

## 🧪 Test Your Setup

After running all 3 scripts above, test immediately:

### Test GGG Company:
1. Open FieldSync app
2. Click "Foreman"
3. Enter company code: **GGG**
4. Enter PIN: **1111**
5. ✅ You should see "GGG - Downtown Office Complex" with 8 areas

### Test Miller Company:
1. Go back to start
2. Click "Foreman"
3. Enter company code: **MILLER**
4. Enter PIN: **3333**
5. ✅ You should see "Miller - Commercial Warehouse" with 8 areas

---

## 📊 Your Complete Setup

### GGG Construction

**Company Code:** `GGG`

**Projects:**

1. **Downtown Office Complex** (PIN: `1111`)
   - Site Preparation ✅ Done
   - Foundation & Footings ✅ Done
   - Structural Steel 🔄 Working
   - Concrete Deck
   - Rough MEP
   - Exterior Envelope
   - Interior Finishes
   - Final MEP

2. **Residential Development** (PIN: `2222`)
   - Land Grading ✅ Done
   - Utilities Install 🔄 Working
   - Building A - Foundation
   - Building A - Framing
   - Building B - Foundation
   - Building B - Framing
   - Parking & Landscaping

### Miller Construction

**Company Code:** `MILLER`

**Projects:**

1. **Commercial Warehouse** (PIN: `3333`)
   - Excavation ✅ Done
   - Foundation 🔄 Working
   - Slab on Grade
   - Steel Erection
   - Roof Deck
   - Electrical Service
   - HVAC Units
   - Overhead Doors

2. **Medical Center Addition** (PIN: `4444`)
   - Demolition ✅ Done
   - New Foundation ✅ Done
   - Structural Framing 🔄 Working
   - Mechanical Rough-In
   - Electrical Rough-In
   - Plumbing Rough-In
   - Drywall & Paint
   - Medical Equipment
   - Final Inspections

---

## 🚀 For New Customers

When you get a new paying customer:

### Option 1: Use the Template (Recommended)

**File:** `database/NEW_COMPANY_TEMPLATE.sql`

1. Open the file
2. Find and replace:
   - `[COMPANY_CODE]` → Customer's code (e.g., `ACME`)
   - `[COMPANY_NAME]` → Company name (e.g., `ACME Construction`)
   - `[PROJECT_NAME]` → First project name
   - `[CONTRACT_VALUE]` → Contract amount (e.g., `500000.00`)
   - `[PIN]` → Unique 4-digit PIN (e.g., `7890`)
3. Customize the areas list
4. Run in Supabase SQL Editor
5. ✅ Customer is ready!

**Benefits:**
- ✅ Built-in validation (checks for duplicate codes/PINs)
- ✅ Automatic error handling
- ✅ Shows success message with details
- ✅ Idempotent (safe to run multiple times)

---

## 🔍 Database Schema Overview

### Core Tables (Foreman Access)

| Table | Purpose | Foreman Can |
|-------|---------|-------------|
| **companies** | Company info | View via code |
| **projects** | Projects with PINs | View via PIN |
| **areas** | Project tasks | View & Update |

### Additional Tables (Full Features)

| Table | Purpose |
|-------|---------|
| **users** | User accounts (office/admin) |
| **project_assignments** | Assign foremen to projects |
| **materials_equipment** | Materials catalog |
| **t_and_m_tickets** | Time & Material tickets |
| **t_and_m_workers** | Workers on tickets |
| **t_and_m_items** | Materials/equipment used |
| **crew_checkins** | Daily crew check-ins |
| **daily_reports** | Daily field reports |
| **messages** | Field/Office communication |
| **material_requests** | Material requests |
| **activity_log** | Audit trail |

---

## 🔐 Security Features

### RLS (Row Level Security) Policies

**For Unauthenticated (Foreman PIN Access):**
- ✅ Can SELECT companies (to validate company code)
- ✅ Can SELECT projects (to validate PIN)
- ✅ Can SELECT areas (to view project tasks)
- ✅ Can UPDATE areas (to update task status)
- ✅ Can INSERT/SELECT tickets, crew check-ins, messages
- ❌ Cannot DELETE anything
- ❌ Cannot modify company/project settings

**For Authenticated (Office Users):**
- ✅ Full CRUD access to their company's data
- ✅ Can manage projects, areas, users
- ✅ Can approve/reject T&M tickets

---

## 🆘 Troubleshooting

### Error: "relation 'companies' does not exist"

**Cause:** Tables not created yet

**Solution:** Run `database/complete_setup.sql` first

---

### Error: "syntax error at or near NOT"

**Cause:** Old version of complete_setup.sql

**Solution:** The file has been fixed. The ALTER PUBLICATION commands now use proper exception handling.

---

### Error: "duplicate key value violates unique constraint"

**Cause:** Trying to create a company/project/PIN that already exists

**Solution:** This is normal when re-running scripts. Scripts use `ON CONFLICT` to handle this safely.

---

### Error: "Company code already exists"

**Cause:** When using the template, the code is already taken

**Solution:**
```sql
-- Check existing codes:
SELECT code FROM companies ORDER BY code;

-- Choose a different code
```

---

### Warning: "Validation failed"

**Cause:** Something wrong with database setup

**Solution:** Run `database/VALIDATE_SETUP.sql` to see specific errors

---

## 📁 File Reference

| File | Size | Purpose |
|------|------|---------|
| `complete_setup.sql` | ~15KB | Create all tables (run once) |
| `setup_ggg_miller_companies.sql` | ~6KB | Your two companies |
| `VALIDATE_SETUP.sql` | ~8KB | Check everything works |
| `NEW_COMPANY_TEMPLATE.sql` | ~7KB | Onboard new customers |
| `SIMPLE_SETUP.sql` | ~3KB | Quick setup without realtime |

---

## ✅ Production Checklist

Before going live:

- [ ] Ran `complete_setup.sql` successfully
- [ ] Ran `setup_ggg_miller_companies.sql` successfully
- [ ] Ran `VALIDATE_SETUP.sql` - all checks passed
- [ ] Tested GGG foreman access (code `GGG`, PIN `1111`)
- [ ] Tested Miller foreman access (code `MILLER`, PIN `3333`)
- [ ] Verified areas can be updated
- [ ] `.env` file has correct Supabase credentials
- [ ] App is running and connected to Supabase

---

## 🎯 Next Steps

1. ✅ **Setup complete** - Your GGG and Miller companies are ready
2. 📱 **Test the app** - Verify foreman access works
3. 👥 **Add office users** (optional) - Create authenticated accounts
4. 🚀 **Onboard new customers** - Use the template

---

## 💡 Pro Tips

1. **Always run VALIDATE_SETUP.sql** before giving access to customers
2. **Keep PINs unique** - Never reuse across projects
3. **Test yourself first** - Before sending credentials to customers
4. **Use meaningful company codes** - Customer initials work best
5. **Backup regularly** - Supabase has automatic backups, but good to verify

---

## 📞 Support

If you encounter any issues:

1. Check `TROUBLESHOOTING.md` for solutions
2. Run `VALIDATE_SETUP.sql` to diagnose
3. Check Supabase Logs > Postgres Logs for errors
4. Review `NEW_CUSTOMER_ONBOARDING.md` for best practices

---

**Everything is production-ready and tested! 🎉**

Your database is configured to handle:
- ✅ Unlimited companies
- ✅ Unlimited projects per company
- ✅ PIN-based foreman access
- ✅ Authenticated office users
- ✅ Real-time collaboration
- ✅ Full audit trails
