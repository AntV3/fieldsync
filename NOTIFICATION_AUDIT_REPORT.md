# Notification System Audit Report

## Issues Found and Fixes

### 🔴 CRITICAL ISSUES

#### 1. Database Schema Mismatch in SQL Functions
**File:** `database/notifications_system.sql`
**Lines:** 191, 195, 201, 225 (and RLS policies)

**Problem:** The SQL references `user_id` column from `profiles` table, but according to `schema_v2.sql`, the profiles table uses `id` (not `user_id`) as the primary key.

**Current Code (BROKEN):**
```sql
SELECT DISTINCT user_id
FROM profiles
WHERE company_id = p_company_id
  AND role = ANY(v_setting.notify_roles)
  AND user_id != ALL(COALESCE(v_setting.notify_user_ids, '{}'))
```

**Should Be:**
```sql
SELECT DISTINCT id
FROM profiles
WHERE company_id = p_company_id
  AND role = ANY(v_setting.notify_roles)
  AND id != ALL(COALESCE(v_setting.notify_user_ids, '{}'))
```

**Impact:** The `create_notifications_for_event()` function will fail when trying to create notifications for users with matching roles.

**Fix Required:** Update all references from `user_id` to `id` when selecting from profiles table.

---

#### 2. Users vs Profiles Table Inconsistency
**File:** `src/App.jsx`
**Line:** 124

**Problem:** App.jsx queries `users` table, but the database schema only defines `profiles` table.

**Current Code:**
```javascript
const { data, error } = await supabase
  .from('users')
  .select('id, full_name, email')
  .eq('company_id', company.id)
```

**Note:** This is consistent with the rest of the app (all files use 'users'). Either:
- Your actual database has a 'users' table that's not in the SQL files
- OR the app has a bug and should use 'profiles'

**Recommendation:** Verify your actual Supabase database structure. If you have 'users' table, update the SQL. If you have 'profiles' table, update the JavaScript.

---

### ⚠️ MEDIUM ISSUES

#### 3. Window Object Initialization
**Files:** `src/components/NotificationBell.jsx`, `src/components/NotificationDropdown.jsx`

**Problem:** Code assigns to `window.notificationBell.refreshCount` without first ensuring `window.notificationBell` exists.

**Current Code (NotificationBell.jsx line 50-54):**
```javascript
useEffect(() => {
  if (window.notificationBell) {
    window.notificationBell.refreshCount = refreshCount
  }
}, [])
```

**Issue:** `window.notificationBell` will be undefined on first render, so the assignment never happens.

**Fix:**
```javascript
useEffect(() => {
  if (!window.notificationBell) {
    window.notificationBell = {}
  }
  window.notificationBell.refreshCount = refreshCount
}, [refreshCount])
```

**Impact:** When NotificationDropdown calls `window.notificationBell.refreshCount()`, it may fail if the object wasn't initialized.

---

#### 4. Missing Dependency in useEffect
**File:** `src/components/NotificationSettings.jsx`
**Line:** 74-76

**Problem:** `loadSettings` is called in useEffect with `[companyId]` dependency, but `loadSettings` itself has no dependencies listed.

**Current Code:**
```javascript
useEffect(() => {
  loadSettings()
}, [companyId])
```

**Better Approach:**
```javascript
useEffect(() => {
  if (!companyId) return
  loadSettings()
}, [companyId])
```

**Impact:** Minor - loadSettings already checks for companyId, but this is cleaner.

---

### ℹ️ MINOR ISSUES

#### 5. Potential Race Condition in Real-time Subscription
**File:** `src/components/NotificationBell.jsx`
**Line:** 17-21

**Problem:** When a notification arrives via subscription, count is incremented by 1. But if multiple notifications arrive simultaneously or if count is refreshed from server, there could be a mismatch.

**Current Code:**
```javascript
const subscription = db.subscribeToNotifications(userId, (newNotification) => {
  setUnreadCount(prev => prev + 1)
})
```

**Better Approach:** Refresh from server instead of incrementing:
```javascript
const subscription = db.subscribeToNotifications(userId, (newNotification) => {
  loadUnreadCount() // Fetch actual count from server
})
```

**Impact:** Very minor - unlikely to cause issues in normal usage.

---

#### 6. Missing Error Handling for Notification Creation
**Files:** `src/components/MaterialRequest.jsx`, `src/components/TMForm.jsx`, `src/components/TMList.jsx`

**Problem:** If `createNotificationsForEvent()` fails, the error is silently caught but user is still shown success message.

**Example (MaterialRequest.jsx):**
```javascript
await db.createNotificationsForEvent(...) // No try-catch

onShowToast('Request submitted!', 'success') // Shows success even if notifications failed
```

**Recommendation:** Wrap in try-catch or let it fail silently (notifications are non-critical).

**Impact:** Very minor - doesn't affect core functionality.

---

## Summary

| Severity | Count | Must Fix? |
|----------|-------|-----------|
| Critical | 2 | ✅ YES |
| Medium | 2 | ⚠️ Recommended |
| Minor | 2 | ℹ️ Optional |

### Critical Fixes Required:

1. ✅ **Fix SQL column references** - Change `user_id` to `id` in profiles queries
2. ⚠️ **Verify users vs profiles table** - Align code with actual database

### Recommended Fixes:

3. Fix window object initialization in NotificationBell
4. Add companyId check in NotificationSettings useEffect

### Optional Improvements:

5. Use loadUnreadCount() instead of incrementing in subscription
6. Add error handling for notification creation

---

## Testing Checklist

After applying fixes, test:

- [ ] Initialize default notification settings via settings UI
- [ ] Submit material request from field view
- [ ] Verify office users receive notification
- [ ] Check unread count appears on bell icon
- [ ] Click bell to open dropdown
- [ ] Click notification to mark as read
- [ ] Verify count decreases
- [ ] Approve/reject T&M ticket
- [ ] Verify field user receives notification
- [ ] Test "Mark all read" button
- [ ] Test "Clear read" button
- [ ] Update notification settings
- [ ] Verify settings save and load correctly
- [ ] Test real-time notification arrival (submit from another browser)

---

## Files Requiring Changes

### High Priority:
1. `database/notifications_system.sql` - Fix user_id → id
2. `src/App.jsx` - Verify users vs profiles table

### Medium Priority:
3. `src/components/NotificationBell.jsx` - Initialize window object
4. `src/components/NotificationDropdown.jsx` - Initialize window object
5. `src/components/NotificationSettings.jsx` - Add companyId check

### Low Priority:
6. `src/components/MaterialRequest.jsx` - Add error handling (optional)
7. `src/components/TMForm.jsx` - Add error handling (optional)
8. `src/components/TMList.jsx` - Add error handling (optional)
