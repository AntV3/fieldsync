# GGG & Miller Companies Setup

## 🎯 Quick Setup

You have **two companies**: GGG and Miller. Here's how to set them up.

---

## ✅ Step 1: Run Database Setup

### Option A: If tables already exist
Go to Supabase SQL Editor and run:
```
database/setup_ggg_miller_companies.sql
```

### Option B: If starting fresh
1. First run: `database/complete_setup.sql` (creates all tables)
2. Then run: `database/setup_ggg_miller_companies.sql` (adds your companies)

---

## 🏢 Your Companies

### GGG Construction
- **Company Code:** `GGG`
- **Projects:**
  - Downtown Office Complex - **PIN: 1111**
  - Residential Development - **PIN: 2222**

### Miller Construction
- **Company Code:** `MILLER`
- **Projects:**
  - Commercial Warehouse - **PIN: 3333**
  - Medical Center Addition - **PIN: 4444**

---

## 🧪 Testing Foreman Access

### Test GGG Company
1. Open your FieldSync app
2. Choose "Foreman"
3. Enter company code: **GGG**
4. Enter PIN: **1111** or **2222**
5. ✅ You should see the project with areas

### Test Miller Company
1. Open your FieldSync app
2. Choose "Foreman"
3. Enter company code: **MILLER**
4. Enter PIN: **3333** or **4444**
5. ✅ You should see the project with areas

---

## 📊 What Gets Created

### GGG - Project 1 (PIN: 1111)
Downtown Office Complex
- Site Preparation (Done)
- Foundation & Footings (Done)
- Structural Steel (Working)
- Concrete Deck
- Rough MEP
- Exterior Envelope
- Interior Finishes
- Final MEP

### GGG - Project 2 (PIN: 2222)
Residential Development
- Land Grading (Done)
- Utilities Install (Working)
- Building A - Foundation
- Building A - Framing
- Building B - Foundation
- Building B - Framing
- Parking & Landscaping

### Miller - Project 1 (PIN: 3333)
Commercial Warehouse
- Excavation (Done)
- Foundation (Working)
- Slab on Grade
- Steel Erection
- Roof Deck
- Electrical Service
- HVAC Units
- Overhead Doors

### Miller - Project 2 (PIN: 4444)
Medical Center Addition
- Demolition (Done)
- New Foundation (Done)
- Structural Framing (Working)
- Mechanical Rough-In
- Electrical Rough-In
- Plumbing Rough-In
- Drywall & Paint
- Medical Equipment
- Final Inspections

---

## 👥 Creating User Accounts (Optional)

If you want office users to manage these companies:

### For GGG Company:

1. Go to Supabase: Authentication > Users
2. Add user with email (e.g., `admin@ggg.com`)
3. Copy the user ID
4. Run this SQL:
```sql
INSERT INTO users (id, email, name, role, company_id)
VALUES (
  'paste-user-id-here',
  'admin@ggg.com',
  'GGG Admin',
  'office',
  '11111111-1111-1111-1111-111111111111'
);
```

### For Miller Company:

1. Go to Supabase: Authentication > Users
2. Add user with email (e.g., `admin@miller.com`)
3. Copy the user ID
4. Run this SQL:
```sql
INSERT INTO users (id, email, name, role, company_id)
VALUES (
  'paste-user-id-here',
  'admin@miller.com',
  'Miller Admin',
  'office',
  '22222222-2222-2222-2222-222222222222'
);
```

---

## 🔐 Access Summary

| Company | Code | Project | PIN | Areas |
|---------|------|---------|-----|-------|
| GGG | `GGG` | Downtown Office Complex | `1111` | 8 |
| GGG | `GGG` | Residential Development | `2222` | 7 |
| Miller | `MILLER` | Commercial Warehouse | `3333` | 8 |
| Miller | `MILLER` | Medical Center Addition | `4444` | 9 |

---

## 🆘 Troubleshooting

### "Invalid company code" error

**If you get this for GGG:**
- Make sure you typed: `GGG` (all caps)
- Run `database/setup_ggg_miller_companies.sql`
- Verify in SQL Editor: `SELECT * FROM companies WHERE code = 'GGG'`

**If you get this for Miller:**
- Make sure you typed: `MILLER` (all caps)
- Run `database/setup_ggg_miller_companies.sql`
- Verify in SQL Editor: `SELECT * FROM companies WHERE code = 'MILLER'`

### "Invalid PIN" error

Check the PIN matches:
- GGG projects: `1111` or `2222`
- Miller projects: `3333` or `4444`

Verify in SQL Editor:
```sql
SELECT c.name, p.name, p.pin
FROM projects p
JOIN companies c ON p.company_id = c.id
WHERE c.code IN ('GGG', 'MILLER');
```

### Tables don't exist

Run `database/complete_setup.sql` first to create all tables, then run the GGG/Miller setup.

---

## ✅ Verification

After running the setup script, you should see this output in Supabase:

**Companies:**
- GGG Construction (code: GGG)
- Miller Construction (code: MILLER)

**Projects:**
- 2 projects for GGG (PINs: 1111, 2222)
- 2 projects for Miller (PINs: 3333, 4444)

**Areas:**
- GGG projects have 8 and 7 areas respectively
- Miller projects have 8 and 9 areas respectively

---

## 🎉 You're All Set!

Both companies are ready to use. Foremen can now access their projects using:

**GGG:** Company code `GGG` → PIN `1111` or `2222`
**Miller:** Company code `MILLER` → PIN `3333` or `4444`
