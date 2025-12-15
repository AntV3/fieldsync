# Project-Level Permissions System

## Overview

This guide explains how to set up and use the project-level permissions system that enables:
- Project-specific team management
- Custom permissions for each team member
- Role-based access control (Owner, Manager, Member, Viewer)
- Functional role templates (Materials Manager, Accounting, etc.)

## 🎯 What This Solves

**Before:** Company-wide roles meant every "Materials Manager" got notifications for ALL projects across the entire company.

**After:** Each project has its own team. The Materials Manager for Hospital Project doesn't get notified about School Project materials.

## 📋 Setup Instructions

### Step 1: Run Database Migrations

Run these SQL files in order on your Supabase database:

```bash
# 1. Create project permissions tables
psql -d your_database -f database/project_permissions_schema.sql

# 2. Migrate existing projects (assigns owners)
psql -d your_database -f database/migrate_existing_projects.sql
```

**What this does:**
- Creates `project_users` table (team membership)
- Creates `project_permissions` table (permission definitions)
- Creates `project_user_permissions` table (assigned permissions)
- Creates `role_templates` table (smart defaults)
- Adds `project_id` to `notification_roles` (project-specific notifications)
- Automatically makes project creators the owners
- Inserts 27 default permissions across 6 categories
- Inserts 7 role templates with smart defaults

### Step 2: Verify Migration

After running the migrations, verify success:

```sql
-- Check that all projects have owners
SELECT
  p.name as project_name,
  u.name as owner_name,
  pu.project_role
FROM projects p
JOIN project_users pu ON pu.project_id = p.id AND pu.project_role = 'owner'
JOIN users u ON u.id = pu.user_id
ORDER BY p.name;

-- Should show all your projects with their owners
```

### Step 3: Add ProjectTeam to Your App

The UI components are already created. You need to integrate them into your app:

**Option A: Add "Team" tab to project view**

```jsx
// In your project detail component or wherever you show project info
import ProjectTeam from './components/ProjectTeam'

<div className="project-tabs">
  <button onClick={() => setActiveTab('overview')}>Overview</button>
  <button onClick={() => setActiveTab('team')}>Team</button>
  {/* other tabs */}
</div>

{activeTab === 'team' && (
  <ProjectTeam
    project={currentProject}
    user={currentUser}
    onShowToast={showToast}
  />
)}
```

**Option B: Add to Dashboard navigation**

Add a new navigation item to access team management from the main dashboard.

## 🎨 How It Works

### Permission Hierarchy

```
Company Level (System Settings)
├── Admin - Manages company branding, settings
└── Office - Basic company access

Project Level (Where Work Happens)
├── Owner - Full control (project creator)
├── Manager - Can manage team & settings
├── Member - Active participant + custom permissions
└── Viewer - Read-only + custom permissions
```

### Permission Categories

**Financial (7 permissions)**
- View material costs
- View labor costs
- View equipment costs
- View budgets
- View profit margins
- Export financial reports
- Edit budgets

**Materials (5 permissions)**
- View materials
- Edit materials
- Approve materials
- Manage inventory
- Export material reports

**Operations (6 permissions)**
- View daily reports
- Edit daily reports
- View T&M
- Edit T&M
- Approve T&M
- Export T&M reports

**Equipment (3 permissions)**
- View equipment
- Edit equipment
- Manage equipment

**Team (4 permissions)**
- View team
- Invite users
- Remove users
- Edit permissions

**Safety (3 permissions)**
- View safety records
- Edit safety records
- Manage safety program

### Role Templates

Pre-configured permission sets for common roles:

1. **Materials Manager** - Manages materials, inventory, deliveries
2. **Accounting** - Views all financial data (read-only)
3. **Field Supervisor** - Manages daily operations
4. **Safety Director** - Manages all safety activities
5. **Equipment Manager** - Tracks equipment
6. **Project Accountant** - Full financial oversight with editing rights
7. **Viewer** - Basic read-only access

## 📖 User Guide

### For Project Owners/Managers

#### Inviting a User to Your Project

1. Go to your project
2. Click the "Team" tab
3. Click "+ Invite User"
4. Select:
   - **User** from dropdown
   - **Project Role** (Manager, Member, or Viewer)
   - **Functional Role Template** (optional) - Applies smart default permissions
5. Click "Invite User"

#### Customizing User Permissions

1. In the Team tab, find the user
2. Click "Permissions" button
3. Either:
   - **Apply a template** from the dropdown (quick)
   - **Check/uncheck individual permissions** (custom)
   - **Select/deselect entire categories** (bulk)
4. Click "Save Permissions"

#### Permission Examples

**Example 1: Materials Manager (Can't See Costs)**
```
✅ View materials
✅ Edit materials
✅ Approve materials
✅ Manage inventory
❌ View material costs    ← Hide from them
❌ View budgets
```

**Example 2: Accounting (Read-Only Financial)**
```
✅ View material costs
✅ View labor costs
✅ View budgets
✅ View profit margins
✅ Export financial reports
❌ Edit budgets           ← Read-only
❌ Edit materials         ← Not their area
```

**Example 3: Field Supervisor (Operations Focus)**
```
✅ View/edit daily reports
✅ View/edit T&M
✅ View materials
✅ View equipment
❌ View labor costs      ← Hide pay rates
❌ View budgets
```

### For Team Members

#### Viewing Your Projects

Your dashboard shows only projects you're a member of.

#### Understanding Your Role

- **Owner** - You have full control of this project
- **Manager** - You can manage the team and invite users
- **Member** - You can work on assigned areas based on your permissions
- **Viewer** - You have read-only access to allowed areas

#### Checking Your Permissions

Go to the Team tab to see:
- Your project role badge
- What you can/can't do
- Who else is on the project

## 🔧 Technical Details

### Database Schema

**project_users** - Who's on which project
```sql
CREATE TABLE project_users (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  user_id UUID REFERENCES users(id),
  project_role TEXT CHECK (project_role IN ('owner', 'manager', 'member', 'viewer')),
  invited_by UUID REFERENCES users(id),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, user_id)
);
```

**project_permissions** - Available permissions
```sql
CREATE TABLE project_permissions (
  id UUID PRIMARY KEY,
  permission_key TEXT UNIQUE,
  permission_name TEXT,
  category TEXT,
  description TEXT
);
```

**project_user_permissions** - User's actual permissions
```sql
CREATE TABLE project_user_permissions (
  id UUID PRIMARY KEY,
  project_user_id UUID REFERENCES project_users(id),
  permission_key TEXT,
  granted_by UUID REFERENCES users(id),
  UNIQUE(project_user_id, permission_key)
);
```

**role_templates** - Pre-defined permission sets
```sql
CREATE TABLE role_templates (
  id UUID PRIMARY KEY,
  role_key TEXT UNIQUE,
  role_name TEXT,
  description TEXT,
  default_permissions JSONB
);
```

### API Functions

All functions are available in `src/lib/supabase.js`:

```javascript
// Team Management
await db.getProjectTeam(projectId)
await db.inviteUserToProject(projectId, userId, projectRole, invitedBy)
await db.removeUserFromProject(projectUserId)
await db.updateUserProjectRole(projectUserId, newRole)

// Permission Management
await db.getUserProjectPermissions(userId, projectId)
await db.userHasProjectPermission(userId, projectId, permissionKey)
await db.setProjectPermissions(projectUserId, permissionKeys, grantedBy)
await db.grantProjectPermissions(projectUserId, permissionKeys, grantedBy)
await db.revokeProjectPermissions(projectUserId, permissionKeys)

// Templates & Definitions
await db.getAllPermissions()
await db.getRoleTemplates()
await db.getRoleTemplate(roleKey)
```

### Permission Checking in Code

```javascript
// Check if user can view material costs
const canViewCosts = await db.userHasProjectPermission(
  userId,
  projectId,
  'view_material_costs'
)

if (canViewCosts) {
  // Show cost column
} else {
  // Hide cost column
}
```

## 🚀 Next Steps

After setup, you can:

1. **Create project-specific notification roles** - Instead of company-wide "Materials Manager", create "Hospital Materials Manager"
2. **Customize permissions per project** - Different rules for different projects
3. **Add more permission definitions** - Extend the system with your own permissions
4. **Create custom role templates** - Save your own permission combinations

## ❓ FAQ

**Q: What happens to existing projects?**
A: The migration automatically assigns the project creator as owner. All existing functionality continues to work.

**Q: What about company-wide notification roles?**
A: They still work! Existing notification roles remain company-wide (`project_id = NULL`). You can create new project-specific roles too.

**Q: Can someone be on multiple projects?**
A: Yes! A user can be on any number of projects with different roles on each.

**Q: Can someone have different permissions on different projects?**
A: Yes! The Materials Manager might have full access on Hospital project but limited access on School project.

**Q: Do I need to assign everyone to projects?**
A: Only if you want project-level permission control. Company admins still have system-wide access.

**Q: Can I remove the project owner?**
A: You can remove them, but every project should have at least one owner. The system warns you.

**Q: How do I make someone admin of the whole company?**
A: Use the SQL script in `database/promote_user_role.sql` to change their company-level role.

## 📝 Summary

This system gives you fine-grained control over who sees what on each project:
- ✅ Scalable to hundreds of projects
- ✅ Prevents notification overload
- ✅ Flexible permission customization
- ✅ Smart defaults with templates
- ✅ Backward compatible with existing data
