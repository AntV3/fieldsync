# FieldSync Notification System Setup Guide

This guide explains how to set up and use the new notification system for FieldSync.

## Overview

The notification system provides company-level notification settings that allow administrators to configure who gets notified for different events across all projects.

## Features

- **Company-Level Settings**: Configure notification preferences once for the entire company
- **Role-Based & User-Specific**: Notify by role (owner, admin, manager, etc.) or specific users
- **Real-Time Updates**: Notifications appear instantly using Supabase real-time subscriptions
- **Multiple Event Types**: Material requests, T&M tickets, daily reports, messages, and more
- **In-App Notifications**: Badge count, dropdown with recent notifications, mark as read/unread
- **Future Support**: Email and push notifications (infrastructure ready)

## Database Setup

### Step 1: Run the SQL Migration

Execute the SQL file in your Supabase SQL Editor:

```bash
database/notifications_system.sql
```

This creates:
- `notification_settings` table - Company-level notification presets
- `notifications` table - Individual user notifications
- Helper functions for creating notifications
- Row Level Security (RLS) policies
- Default settings initialization function

### Step 2: Verify Tables

After running the migration, verify these tables exist in your Supabase database:

1. **notification_settings** - Stores company-wide notification rules
   - `company_id` - Which company
   - `event_type` - What event (material_request, tm_submitted, etc.)
   - `notify_user_ids` - Array of specific user IDs to notify
   - `notify_roles` - Array of roles to notify (owner, admin, manager, office, foreman)
   - `in_app_enabled`, `email_enabled`, `push_enabled` - Notification channels

2. **notifications** - Stores individual notifications
   - `user_id` - Who receives this notification
   - `company_id` - Which company
   - `project_id` - Related project (optional)
   - `event_type` - Type of event
   - `title`, `message` - Notification content
   - `link_to` - Where to navigate when clicked
   - `is_read` - Read status
   - `metadata` - JSON with additional context

### Step 3: Initialize Default Settings

For existing companies, run this function in Supabase SQL Editor:

```sql
SELECT create_default_notification_settings('YOUR-COMPANY-ID');
```

Or use the "Initialize Default Settings" button in the notification settings UI.

## Event Types

The system supports these notification events:

| Event Type | When It Fires | Default Recipients |
|------------|---------------|-------------------|
| `material_request` | Field submits material request | Owner, Admin, Manager |
| `tm_submitted` | Field submits T&M ticket | Owner, Admin, Manager |
| `tm_approved` | Office approves T&M ticket | Foreman (who submitted) |
| `tm_rejected` | Office rejects T&M ticket | Foreman (who submitted) |
| `daily_report` | Field submits daily report | Owner, Admin, Manager |
| `message` | Field sends message | Owner, Admin, Manager, Office |
| `material_approved` | Office approves material request | Foreman |
| `material_rejected` | Office rejects material request | Foreman |
| `crew_checkin` | Crew checks in | Owner, Admin, Manager |

## UI Components

### Notification Bell
Located in the top navigation bar, shows:
- Bell icon
- Unread count badge (red circle with number)
- Click to open notification dropdown

### Notification Dropdown
Shows recent notifications with:
- Event icon (📦, 📋, ✅, ❌, etc.)
- Title and message
- Time ago (e.g., "5m ago", "2h ago")
- Unread indicator (blue dot)
- Actions: "Mark all read", "Clear read"
- Click notification to navigate to related item

### Notification Settings Page
Access via "Settings" tab in navigation:
- Toggle notifications on/off per event type
- Select roles to notify (checkbox for each role)
- Select specific users to notify
- Channel toggles (In-App, Email, Push)
- Save button to persist changes

## Usage Examples

### For Administrators

**Configure Notifications:**
1. Log in to FieldSync
2. Click "Settings" in the navigation
3. For each event type:
   - Toggle "Enabled" on/off
   - Check roles that should be notified (Owner, Admin, Manager, Office, Foreman)
   - Check specific users if needed
   - Optionally enable Email/Push (coming soon)
4. Click "Save Settings"

**Example Configuration:**
- Material Requests → Notify: Tony (specific user), Office Manager role
- T&M Submitted → Notify: All Admins and Managers
- Daily Reports → Notify: Project Manager (specific user)

### For Users

**View Notifications:**
1. Look for the bell icon in top navigation
2. Red badge shows unread count
3. Click bell to open dropdown
4. Click notification to view related item
5. Click "Mark all read" to clear unread count

**Manage Notifications:**
- Click individual notification to mark as read
- Use "Mark all read" to clear all unread
- Use "Clear read" to remove old read notifications

## Code Integration

### Creating Notifications Manually

```javascript
import { db } from './lib/supabase'

// Create notification for specific user
await db.createNotification(
  userId,           // Who receives it
  companyId,        // Company ID
  projectId,        // Project ID (optional)
  'material_request', // Event type
  'New Material Request', // Title
  'Tony requested 50 2x4 lumber', // Message
  '/project/123/materials', // Link to navigate
  { request_id: '456', priority: 'urgent' } // Metadata (optional)
)

// Create notifications based on company settings
await db.createNotificationsForEvent(
  companyId,
  projectId,
  'tm_submitted',
  'T&M Ticket Submitted',
  'New T&M ticket from John',
  '/project/123/tm',
  { ticket_id: '789' }
)
```

### Subscribing to Real-Time Notifications

```javascript
import { db } from './lib/supabase'

const subscription = db.subscribeToNotifications(userId, (newNotification) => {
  console.log('New notification received:', newNotification)
  // Update UI, show toast, etc.
})

// Cleanup on unmount
subscription.unsubscribe()
```

## Architecture

### Database Functions

The system uses PostgreSQL functions for efficient notification creation:

**`create_notifications_for_event()`**
- Takes event details (type, title, message, etc.)
- Looks up company notification settings
- Finds all users matching the roles or user IDs
- Creates individual notification records for each user
- Returns count of notifications created

**`create_default_notification_settings()`**
- Creates sensible default settings for a new company
- Called automatically when company signs up (optional)
- Can be called manually for existing companies

### Real-Time Subscriptions

Uses Supabase Realtime to instantly deliver notifications:
- Subscribe to INSERT events on `notifications` table filtered by user_id
- New notifications appear without page refresh
- Unread count updates automatically

### Row Level Security (RLS)

Strict security policies ensure:
- Users only see their own notifications
- Only company admins can modify notification settings
- Settings are scoped to company

## Troubleshooting

### Notifications Not Appearing

1. **Check Notification Settings**
   - Go to Settings tab
   - Verify the event type is enabled
   - Verify your role or user is selected
   - Click "Save Settings"

2. **Check Database**
   ```sql
   -- Verify notification settings exist
   SELECT * FROM notification_settings WHERE company_id = 'YOUR-COMPANY-ID';

   -- Check if notifications were created
   SELECT * FROM notifications WHERE user_id = 'YOUR-USER-ID' ORDER BY created_at DESC LIMIT 10;
   ```

3. **Check Console for Errors**
   - Open browser DevTools (F12)
   - Look for errors in Console tab
   - Common issues: Supabase connection, RLS policies, missing company_id

### Unread Count Not Updating

1. Refresh the count manually:
   ```javascript
   if (window.notificationBell) {
     window.notificationBell.refreshCount()
   }
   ```

2. Check real-time subscription is active (should auto-reconnect)

3. Verify user_id is set correctly in NotificationBell component

### Settings Not Saving

1. Verify user has admin or owner role
2. Check RLS policies allow UPDATE for your role
3. Look for errors in browser console
4. Verify company_id is being passed correctly

## Performance Considerations

- **Pagination**: Notification list loads 50 most recent by default
- **Indexing**: Database indexes on `user_id`, `company_id`, `is_read` for fast queries
- **Cleanup**: Encourage users to "Clear read" periodically
- **Real-time**: Uses efficient WebSocket subscription, auto-reconnects

## Future Enhancements

- ✅ In-app notifications (DONE)
- ⏳ Email notifications (infrastructure ready)
- ⏳ Push notifications (infrastructure ready)
- ⏳ Notification preferences per user (override company defaults)
- ⏳ Digest mode (daily summary email)
- ⏳ Mobile app integration
- ⏳ Notification history/search

## Support

For issues or questions:
1. Check this documentation
2. Review database logs in Supabase
3. Check browser console for JavaScript errors
4. Verify RLS policies are correctly applied
5. Test with a fresh company account

---

**Version**: 1.0
**Last Updated**: 2025-12-12
**Author**: FieldSync Development Team
