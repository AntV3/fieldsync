# 🚀 NEW CUSTOMER ONBOARDING GUIDE

## Critical for Business Success

This guide ensures **zero errors** when onboarding new paying customers to your FieldSync platform. Follow these steps exactly to prevent any issues that could lose you money.

---

## ⚡ Quick Onboarding (5 Minutes)

### Step 1: Gather Customer Information

Before starting, get from your customer:
- ✅ Company name (e.g., "ABC Construction")
- ✅ Desired company code (2-10 characters, suggest using company initials)
- ✅ First project name
- ✅ Contract value
- ✅ List of project areas/tasks

### Step 2: Run the Onboarding Script

1. Open `database/NEW_COMPANY_TEMPLATE.sql`
2. Find and replace these values:

```sql
-- Line 18: Company code
v_company_code TEXT := '[COMPANY_CODE]';  -- Change to: 'ABC' or customer's initials

-- Line 19: Company name
v_company_name TEXT := '[COMPANY_NAME]';  -- Change to: 'ABC Construction'

-- Line 34: Project name
v_project_name TEXT := '[PROJECT_NAME]';  -- Change to: 'Main Office Building'

-- Line 35: Contract value
v_contract_value DECIMAL(12, 2) := [CONTRACT_VALUE];  -- Change to: 500000.00

-- Line 36: PIN (4 digits)
v_pin TEXT := '[PIN]';  -- Change to: '5678' (must be unique!)
```

3. **Customize the areas** (lines 56-68):
   - Add/remove/modify areas based on customer's project scope
   - Make sure weights roughly total 100%
   - Keep sort_order sequential

4. **Update the verification queries** at the bottom:
   - Replace `'[COMPANY_CODE]'` with the actual code you used

5. Go to **Supabase SQL Editor**
6. Paste the modified script
7. Click **Run**

### Step 3: Verify Success

The script will show:
```
SETUP COMPLETE!
Company Code: ABC
Company Name: ABC Construction
Project PIN: 5678
```

You'll also see tables showing:
- ✅ New company created
- ✅ Project created with PIN
- ✅ All areas created

### Step 4: Test Immediately

**CRITICAL**: Test before giving access to customer!

1. Open FieldSync app
2. Enter company code (e.g., `ABC`)
3. Enter PIN (e.g., `5678`)
4. Verify you can see the project and all areas
5. Try updating an area status
6. ✅ If it works, customer is ready to go!

---

## 🔍 Validation Checklist

Before going live with a new customer, run this validation:

### Run Validation Script

1. Go to **Supabase SQL Editor**
2. Copy and paste: `database/VALIDATE_SETUP.sql`
3. Click **Run**
4. Check results:
   - ✅ All checks should pass
   - ⚠️ Warnings are okay, but review them
   - ❌ Errors must be fixed before going live!

### Manual Checks

- [ ] Company code is unique and easy to remember
- [ ] PIN is exactly 4 digits and unique
- [ ] Project name is correct
- [ ] All areas are listed and weights are reasonable
- [ ] Tested foreman access yourself
- [ ] Customer can log in successfully

---

## ⚠️ Common Issues & Solutions

### Issue: "Company code already exists"

**Solution:** Choose a different code
```sql
-- Check existing codes:
SELECT code FROM companies ORDER BY code;
```

### Issue: "PIN already exists"

**Solution:** Choose a different PIN
```sql
-- Check existing PINs:
SELECT pin FROM projects WHERE pin IS NOT NULL ORDER BY pin;
```

### Issue: "Invalid PIN format"

**Solution:** PIN must be exactly 4 digits (0000-9999)
```sql
-- Examples:
v_pin TEXT := '1234';  -- ✅ Good
v_pin TEXT := '0001';  -- ✅ Good
v_pin TEXT := '123';   -- ❌ Bad (too short)
v_pin TEXT := '12345'; -- ❌ Bad (too long)
v_pin TEXT := 'abcd';  -- ❌ Bad (not digits)
```

### Issue: "Customer can't access project"

**Troubleshooting:**
1. Verify company code is correct (case-sensitive!)
2. Verify PIN is correct
3. Check project status is 'active':
   ```sql
   SELECT status FROM projects WHERE pin = 'THEIR-PIN';
   ```
4. Run validation script to check for issues

---

## 📋 Recommended Company Codes

Suggest these formats to customers:

| Format | Example | Notes |
|--------|---------|-------|
| Initials | ABC | Best for short company names |
| Short name | SMITH | Good for family names |
| Mixed | ACE123 | If initials are taken |
| Industry + Name | CONSMITH | Very descriptive |

**Rules:**
- 2-20 characters
- ALL UPPERCASE
- Letters and numbers only
- No spaces or special characters

---

## 🔒 Security Best Practices

### PIN Management

1. **Generate unique PINs** for each project
2. **Don't reuse PINs** across projects
3. **Rotate PINs** if compromised
4. **Use random numbers** (not 0000, 1111, 1234, etc.)

### Recommended PIN Generation

```sql
-- Generate a random 4-digit PIN
SELECT LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0') as random_pin;
```

Run this in SQL Editor to get a random PIN, then check if it's available:
```sql
SELECT COUNT(*) as pin_exists
FROM projects
WHERE pin = 'YOUR-PIN-HERE';
-- If result is 0, PIN is available!
```

---

## 🎯 Onboarding Workflow (Step-by-Step)

### For Each New Customer:

1. **Initial Contact**
   - [ ] Get company name
   - [ ] Suggest company code
   - [ ] Get first project details

2. **Setup (5 min)**
   - [ ] Clone `NEW_COMPANY_TEMPLATE.sql`
   - [ ] Fill in customer details
   - [ ] Customize areas for their project
   - [ ] Run script in Supabase

3. **Validation (2 min)**
   - [ ] Run `VALIDATE_SETUP.sql`
   - [ ] Check for errors
   - [ ] Fix any issues

4. **Testing (3 min)**
   - [ ] Test foreman access yourself
   - [ ] Verify all areas appear
   - [ ] Test updating area status

5. **Delivery**
   - [ ] Send customer their company code
   - [ ] Send customer their PIN
   - [ ] Provide brief instructions
   - [ ] Offer support contact

**Total Time: 10 minutes per customer**

---

## 📞 Customer Instructions Template

Send this to your customers:

```
Welcome to FieldSync!

Your account is ready. Here's how to access:

FOREMAN ACCESS:
1. Open FieldSync app: [YOUR-APP-URL]
2. Click "Foreman"
3. Enter company code: [THEIR-CODE]
4. Enter PIN: [THEIR-PIN]
5. Start tracking progress!

OFFICE ACCESS (if applicable):
1. Open FieldSync app: [YOUR-APP-URL]
2. Click "Office"
3. Sign in with: [THEIR-EMAIL]
4. Use the password you created

Questions? Contact us at [YOUR-SUPPORT-EMAIL]
```

---

## 🔄 Adding More Projects (Existing Customer)

If a customer needs additional projects:

1. Use the same template
2. **Skip the company creation part**
3. Use the existing `v_company_id` (look it up):
   ```sql
   SELECT id FROM companies WHERE code = 'THEIR-CODE';
   ```
4. Just run the "CREATE PROJECT" section with a new PIN

---

## 📊 Monitoring & Maintenance

### Weekly Checks

Run these queries to monitor your platform:

```sql
-- Check total companies
SELECT COUNT(*) as total_companies FROM companies;

-- Check active projects
SELECT COUNT(*) as active_projects
FROM projects
WHERE status = 'active';

-- Check companies with no projects (may need follow-up)
SELECT c.name, c.code
FROM companies c
LEFT JOIN projects p ON c.id = p.company_id
WHERE p.id IS NULL;

-- Check for duplicate PINs (should be 0)
SELECT pin, COUNT(*) as count
FROM projects
WHERE pin IS NOT NULL
GROUP BY pin
HAVING COUNT(*) > 1;
```

---

## 🆘 Emergency Fixes

### Reset Customer PIN

```sql
-- If customer loses their PIN or you need to reset it
UPDATE projects
SET pin = '9999'  -- Choose a new unique PIN
WHERE id = 'project-id-here';
```

### Deactivate Project

```sql
-- If you need to disable a project
UPDATE projects
SET status = 'archived'
WHERE id = 'project-id-here';
```

### Change Company Code

```sql
-- If you need to change a company code (rare)
UPDATE companies
SET code = 'NEWCODE'
WHERE code = 'OLDCODE';
```

---

## ✅ Success Metrics

Track these to ensure smooth onboarding:

- [ ] **Onboarding time**: Under 10 minutes per customer
- [ ] **Error rate**: 0% (use validation script)
- [ ] **Customer satisfaction**: Immediate access after onboarding
- [ ] **Support tickets**: Minimal issues with access

---

## 💰 Protecting Your Revenue

**Why This Matters:**

1. **Fast onboarding** = Happy customers = More referrals
2. **Zero errors** = Professional image = Customer retention
3. **Validated setup** = No support issues = Lower costs
4. **Tested access** = Immediate value = Faster payments

**Best Practice:**
Never give a customer their access codes until you've:
1. ✅ Run the validation script
2. ✅ Tested access yourself
3. ✅ Verified all features work

---

## 📁 Quick Reference Files

| File | Purpose | When to Use |
|------|---------|-------------|
| `NEW_COMPANY_TEMPLATE.sql` | Onboard new customer | Every new customer |
| `VALIDATE_SETUP.sql` | Check database health | Before going live |
| `complete_setup.sql` | Initial database setup | One-time only |
| `setup_ggg_miller_companies.sql` | Your two companies | Already run |

---

**You're all set to onboard customers successfully! 🚀**

For questions or issues, refer to TROUBLESHOOTING.md
