-- ============================================
-- PROMOTE USER ROLES
-- Helper script to change user roles
-- ============================================

-- ROLE TYPES:
-- 'foreman' - Field workers (PIN access, limited features)
-- 'office'  - Office staff (full dashboard, can manage notifications)
-- 'admin'   - Office admins (full dashboard, can manage notifications)

-- ============================================
-- EXAMPLES - Uncomment and modify to use:
-- ============================================

-- Make a user an ADMIN
-- UPDATE users
-- SET role = 'admin'
-- WHERE email = 'manager@yourcompany.com';

-- Make a user OFFICE staff
-- UPDATE users
-- SET role = 'office'
-- WHERE email = 'coordinator@yourcompany.com';

-- Make a user a FOREMAN
-- UPDATE users
-- SET role = 'foreman'
-- WHERE email = 'foreman@yourcompany.com';

-- ============================================
-- View all users and their current roles:
-- ============================================

SELECT
  u.email,
  u.name,
  u.role,
  c.name as company,
  CASE u.role
    WHEN 'admin' THEN '✓ Full access + can manage notifications'
    WHEN 'office' THEN '✓ Full access + can manage notifications'
    WHEN 'foreman' THEN '○ Field access only (PIN login)'
    ELSE '? Unknown role'
  END as permissions
FROM users u
LEFT JOIN companies c ON c.id = u.company_id
ORDER BY c.name, u.role, u.email;

-- ============================================
-- NOTIFICATION ROLE PERMISSIONS:
-- ============================================
-- ADMIN and OFFICE users can:
--   - Create notification roles
--   - Assign users to notification roles
--   - Add external email recipients
--   - View and manage all notification settings
--
-- REGULAR users can only:
--   - View their assigned notification roles
--   - Manage their own notification preferences
-- ============================================
