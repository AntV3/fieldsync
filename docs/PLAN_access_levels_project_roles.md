# Implementation Plan: Access Levels vs Project Roles

> **Status**: Draft for Review
> **Created**: 2025-12-27

---

## 1. Executive Summary

This plan separates security-critical **Access Levels** from informational **Project Roles**.

- **Access Levels**: Control what users CAN DO (enforced by RLS)
- **Project Roles**: Describe what users ARE DOING (display only)

---

## 2. Current State Analysis

### Current `user_companies.role` Values
| Role | Current Usage | Count (estimate) |
|------|---------------|------------------|
| `owner` | Company owner, full access | 1 per company |
| `admin` | Can manage users, settings | Few |
| `office` | Full project access | Multiple |
| `member` | Basic access | Multiple |
| `foreman` | Field access | Multiple |

### Current RLS Patterns
```sql
-- Example: Current admin check
uc.role IN ('admin', 'owner')
```

### Current Frontend Checks
```javascript
// App.jsx line 481
const isAdmin = membershipRole === 'admin' || membershipRole === 'owner'
```

---

## 3. Target State

### 3.1 Access Levels (Security-Critical)

| Access Level | Capabilities |
|--------------|--------------|
| `administrator` | Approve/remove users, manage branding/settings, view all projects, assign project roles |
| `member` | Access assigned projects, perform project work, no admin functions |

**Note**: Company `owner` remains identified by `companies.owner_user_id` (not an access level).

### 3.2 Project Roles (Informational)

| Role Name | Purpose |
|-----------|---------|
| Project Manager | Overall project leadership |
| Superintendent | On-site management |
| Foreman | Crew leadership |
| Office Support | Administrative support |
| Engineer | Technical oversight |
| Inspector | Quality/compliance |
| Viewer | Read-only stakeholder |

**Note**: These are labels for display/reporting. They grant NO permissions.

---

## 4. Database Schema Changes

### 4.1 Modify `user_companies` Table

```sql
-- Rename role to access_level
ALTER TABLE user_companies RENAME COLUMN role TO access_level;

-- Update constraint
ALTER TABLE user_companies DROP CONSTRAINT IF EXISTS user_companies_role_check;
ALTER TABLE user_companies ADD CONSTRAINT user_companies_access_level_check
CHECK (access_level IN ('administrator', 'member'));
```

### 4.2 Migrate Existing Data

```sql
-- Map existing roles to access levels
UPDATE user_companies
SET access_level = CASE
  WHEN role IN ('owner', 'admin') THEN 'administrator'
  ELSE 'member'
END;
```

### 4.3 Create `project_users` Table

```sql
CREATE TABLE project_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_role TEXT NOT NULL DEFAULT 'Viewer',
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  UNIQUE(project_id, user_id)
);

-- Indexes for performance
CREATE INDEX idx_project_users_project ON project_users(project_id);
CREATE INDEX idx_project_users_user ON project_users(user_id);

-- Enable RLS
ALTER TABLE project_users ENABLE ROW LEVEL SECURITY;
```

### 4.4 RLS Policies for `project_users`

```sql
-- Active members can view project team for their company's projects
CREATE POLICY "View project team"
ON project_users FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects p
    JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = project_users.project_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
  )
);

-- Only administrators can manage project team
CREATE POLICY "Administrators manage project team"
ON project_users FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects p
    JOIN user_companies uc ON uc.company_id = p.company_id
    WHERE p.id = project_users.project_id
    AND uc.user_id = auth.uid()
    AND uc.status = 'active'
    AND uc.access_level = 'administrator'
  )
);
```

### 4.5 Update Existing RLS Policies

All policies currently checking `role IN ('admin', 'owner')` must change to `access_level = 'administrator'`.

**Files/Policies to Update:**
- `user_companies` policies
- `companies` policies
- `projects` policies (delete permission)
- `areas` policies (delete permission)
- `company_branding` policies
- Any RPC functions checking role

---

## 5. Frontend Changes

### 5.1 Update `isAdmin` Logic

**File**: `src/App.jsx`

```javascript
// Before
const isAdmin = membershipRole === 'admin' || membershipRole === 'owner'

// After
const isAdmin = currentMembership?.access_level === 'administrator' ||
                company?.owner_user_id === user?.id
```

### 5.2 Update `getUserCompanies` Return

**File**: `src/lib/supabase.js`

```javascript
// Update select and mapping to use access_level instead of role
return data.map(uc => ({
  id: uc.companies.id,
  name: uc.companies.name,
  code: uc.companies.code,
  access_level: uc.access_level  // Changed from role
}))
```

### 5.3 Update `MembershipManager`

**File**: `src/components/MembershipManager.jsx`

- Rename "Role" to "Access Level"
- Simplify options to just: Administrator, Member
- Update approval RPC to use `access_level`

### 5.4 Add Project Team Section

**File**: `src/components/Dashboard.jsx` (or new `ProjectTeam.jsx`)

New component in Project Info tab:

```jsx
<ProjectTeam
  project={selectedProject}
  isAdmin={isAdmin}
  onShowToast={showToast}
/>
```

Features:
- List all users assigned to project
- Show their project role
- Admin can add/remove users
- Admin can change project roles
- Dropdown with role options

### 5.5 Add Supabase Functions

**File**: `src/lib/supabase.js`

```javascript
// Get project team members
async getProjectTeam(projectId) { ... }

// Add user to project with role
async addProjectMember(projectId, userId, projectRole) { ... }

// Update project role
async updateProjectRole(projectId, userId, newRole) { ... }

// Remove user from project
async removeProjectMember(projectId, userId) { ... }
```

---

## 6. Migration Strategy

### 6.1 Order of Operations

1. **Create new table** (`project_users`) - Non-breaking
2. **Add RLS policies** - Non-breaking
3. **Deploy frontend changes** - Must handle both old and new column names temporarily
4. **Run data migration** - Map roles to access_levels
5. **Rename column** - Breaking change, must be last
6. **Clean up** - Remove old constraint, update comments

### 6.2 Rollback Plan

- Keep backup of `user_companies` before migration
- New `project_users` table can be dropped if needed
- Column can be renamed back if issues arise

---

## 7. Files to Modify

| File | Changes |
|------|---------|
| `src/App.jsx` | Update `isAdmin` check, add access_level reference |
| `src/lib/supabase.js` | Update getUserCompanies, add project team functions |
| `src/components/MembershipManager.jsx` | Change role → access_level, simplify options |
| `src/components/Dashboard.jsx` | Add Project Team section |
| `src/components/ProjectTeam.jsx` | NEW - Project team management UI |
| `src/index.css` | Styles for project team component |
| `database/migration_access_levels.sql` | NEW - Complete migration SQL |
| `PROJECT_CONTEXT.md` | Update architecture documentation |

---

## 8. Testing Checklist

### Database
- [ ] Migration runs without errors
- [ ] Existing users retain appropriate access
- [ ] RLS policies work correctly
- [ ] Project users can be added/removed

### Frontend
- [ ] Administrators see Team tab
- [ ] Members do NOT see Team tab
- [ ] Project Team section displays correctly
- [ ] Admins can assign project roles
- [ ] Project roles are purely visual (no permission checks)

### Edge Cases
- [ ] Company owner always has admin access
- [ ] User with member access cannot approve users
- [ ] Project role change doesn't affect access
- [ ] Removing user from project doesn't affect org membership

---

## 9. User Flow (Clarified)

### Join & Approval Flow
```
1. New user enters Company Code + Office Code
2. Creates account → user_companies record with status='pending', access_level='member'
3. Admin sees pending request in TEAM TAB
4. Admin approves → status='active'
5. Admin can optionally PROMOTE to 'administrator' (in Team tab)
```

### Project Assignment Flow
```
1. Admin goes to Project Info tab
2. Admin clicks "Add Team Member"
3. Selects from approved company members
4. Assigns a project role (PM, Foreman, Superintendent, etc.)
5. Team member now appears in Project Team section
```

### Access Level Management
- **Team Tab**: Shows all company members with their ACCESS LEVEL
- Admin can change access_level: member ↔ administrator
- This controls PERMISSIONS (what they can do)

### Project Role Management
- **Project Info Tab**: Shows assigned team for THIS project
- Admin can assign/change PROJECT ROLE
- This is purely INFORMATIONAL (what they're doing)

## 10. Open Questions (Resolved)

1. **Default access level**: `member` (admin must explicitly promote)
2. **Default project role**: Admin selects when assigning
3. **Project visibility**: Members can see all company projects (unchanged)
4. **Auto-assignment**: No - admins explicitly assign members to projects

---

## 11. Multi-Tenant Scalability (SaaS Readiness)

### Current Multi-Tenant Foundation
- ✅ `companies` table as tenant root
- ✅ All tables have `company_id` FK
- ✅ RLS enforces tenant isolation
- ✅ Users can belong to multiple companies

### This Plan Maintains Multi-Tenancy
- ✅ `access_level` is per-company (user can be admin in Company A, member in Company B)
- ✅ `project_users` chains through project → company
- ✅ No global roles - everything scoped to company

### Recommendations for Future Scale

#### 1. RLS Performance Optimization
Current nested EXISTS queries work but may slow at scale. Consider:
```sql
-- Add composite indexes for RLS hot paths
CREATE INDEX idx_user_companies_lookup
ON user_companies(user_id, company_id, status, access_level);

CREATE INDEX idx_project_users_lookup
ON project_users(project_id, user_id);
```

#### 2. Company Onboarding Flow
When new company subscribes:
1. Create `companies` record with `subscription_tier`
2. Creator automatically gets `access_level = 'administrator'`
3. Generate unique `code` and `office_code`
4. Creator can immediately invite team

#### 3. Subscription Tier Enforcement (Future)
```sql
-- Example: Limit users per tier
CREATE OR REPLACE FUNCTION check_user_limit()
RETURNS TRIGGER AS $$
DECLARE
  user_count INT;
  tier TEXT;
  max_users INT;
BEGIN
  SELECT subscription_tier INTO tier FROM companies WHERE id = NEW.company_id;
  SELECT COUNT(*) INTO user_count FROM user_companies WHERE company_id = NEW.company_id AND status = 'active';

  max_users := CASE tier
    WHEN 'free' THEN 5
    WHEN 'pro' THEN 25
    WHEN 'business' THEN 100
    WHEN 'enterprise' THEN 9999
    ELSE 5
  END;

  IF user_count >= max_users THEN
    RAISE EXCEPTION 'User limit reached for subscription tier';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

#### 4. Audit Trail (Compliance)
Consider adding for enterprise customers:
```sql
CREATE TABLE audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 5. Data Isolation Verification
Add periodic checks:
- No cross-company data leakage
- RLS policies tested per company
- Automated security scans

### Summary: Ready for Scale
The proposed architecture is **multi-tenant safe** and follows SaaS best practices:
- Tenant isolation via RLS (not application code)
- Per-company access levels
- Clean data model with proper FK chains
- Ready for subscription enforcement when needed

---

## 12. Approval

- [ ] Architecture reviewed
- [ ] Database changes approved
- [ ] Frontend approach approved
- [ ] Ready to implement

---

*Plan created by Claude Code. Awaiting review before implementation.*
