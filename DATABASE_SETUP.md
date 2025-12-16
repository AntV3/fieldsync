# Database Setup Instructions

## Required SQL Migrations

Run these SQL scripts in your Supabase SQL Editor in this order:

### 1. Multi-Company Support (REQUIRED)
```sql
-- File: database/multi_company_support.sql
-- Run this script to enable multi-company functionality
```
Copy and paste the contents of `database/multi_company_support.sql`

### 2. Company Branding (Fixes the get_branding_by_domain error)
```sql
-- File: database/add_company_branding.sql
-- Run this to fix the 404 error for get_branding_by_domain
```
Copy and paste the contents of `database/add_company_branding.sql`

### 3. Office Dashboard
```sql
-- File: database/migration_office_dashboard.sql
```
Copy and paste the contents of `database/migration_office_dashboard.sql`

### 4. Notification System
```sql
-- File: database/create_notification_system.sql
```
Copy and paste the contents of `database/create_notification_system.sql`

## How to Run SQL Scripts

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Click on "SQL Editor" in the left sidebar
4. Click "New Query"
5. Copy and paste the SQL from each file listed above
6. Click "Run" or press Ctrl+Enter

## Current Errors and Fixes

### Error: `Failed to load resource: .../rpc/get_branding_by_domain: 404`
**Fix:** Run `database/add_company_branding.sql`

### Error: `Failed to load resource: .../auth/v1/token: 400`
**Fix:** This means invalid login credentials. Make sure you're using a registered account.

### Error: `Failed to load resource: .../favicon.ico: 404`
**Fix:** This is just a warning, not critical. The app will work without a favicon.

## Quick Setup Order

1. Run `multi_company_support.sql` first
2. Run `add_company_branding.sql` second
3. Run other migrations as needed
4. Register a new company or log in with existing credentials
