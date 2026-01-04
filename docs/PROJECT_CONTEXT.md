# PROJECT_CONTEXT.md
> Canonical source of truth for FieldSync. Authoritative over ad-hoc instructions.
> Last updated: 2025-01-04 (Scalability & Onboarding Documentation)

---

## Documentation Index

| Document | Purpose | Audience |
|----------|---------|----------|
| **[PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)** | Canonical source of truth, business rules | All |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | System architecture, data flow, tech decisions | Engineers |
| **[DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)** | Onboarding, coding conventions, patterns | New engineers |
| **[CODE_MAP.md](./CODE_MAP.md)** | File reference, component relationships | All engineers |
| **[daily log.md](./daily%20log.md)** | Development history, feature tracking | All |

### Quick Start for New Engineers

1. Read this file (PROJECT_CONTEXT.md) for business context
2. Read [ARCHITECTURE.md](./ARCHITECTURE.md) for technical overview
3. Read [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) for coding patterns
4. Use [CODE_MAP.md](./CODE_MAP.md) as a reference while coding

---

## 1. Purpose

FieldSync exists to **eliminate information lag between construction field crews and office management**. It provides real-time visibility into project progress, enabling defensible billing tied directly to completed work.

The core value proposition: when a foreman marks an area complete, the office sees it within seconds—not hours or days.

## Tech Stack

- **Frontend**: React 18 + Vite 7
- **Backend**: Supabase (PostgreSQL + Realtime + Storage + Auth)
- **Styling**: Custom CSS with CSS variables for theming (light/dark mode)
- **Hosting**: Vercel
- **Icons**: Lucide React

---

## 2. Users

| User Type | Access Method | Primary Function |
|-----------|---------------|------------------|
| **Foreman** | Company code + 4-digit project PIN | Update area status, submit reports, log T&M |
| **Office** | Company code + Office code + Email/password | View dashboards, manage projects, process change orders |
| **Admin** | Same as Office (role-based) | All office capabilities + user management + company settings |
| **Owner** | Same as Office (role-based) | All admin capabilities + billing + company deletion |
| **Public Viewer** | Share link (no auth) | Read-only project progress via time-limited tokens |

### Access Levels & Roles (NEW ARCHITECTURE)

The system now separates **security** from **visibility**:

#### Access Levels (Security - stored in `user_companies.access_level`)

| Level | Capabilities |
|-------|-------------|
| **Administrator** | Full control: approve members, manage team, access branding, assign project teams |
| **Member** | Standard access: view/edit projects, no team management or branding |

#### Company Roles (Job Titles - stored in `user_companies.company_role`)

Purely informational - identifies what the person does at the company:
- Project Manager
- Superintendent
- Job Costing
- Accounting

#### Project Roles (Per-Project - stored in `project_users.project_role`)

Assigned per-project to identify involvement:
- Project Manager
- Superintendent
- Foreman
- Office Support
- Engineer
- Inspector
- Team Member

#### Foreman Access

- **foreman**: Field-only access via Company Code + Project PIN, no dashboard access

---

## 3. Core Capabilities

These must work reliably. Regressions here are critical failures.

1. **Real-time progress sync** — Area status changes propagate to all connected clients within seconds
2. **Dual progress calculation** — Supports both percentage-weight and SOV dollar-value tracking
3. **Offline operation** — Field crews can update status without connectivity; syncs when restored
4. **T&M ticket creation** — Field captures labor, equipment, materials with photo documentation
5. **Change order workflow** — Draft → Pending → Approved → Billed → Closed with cost breakdown, editable COR numbers, multi-select grouping, quick material/equipment selection
6. **Daily/injury reporting** — Structured forms with required fields and status tracking
7. **Project sharing** — Granular permission tokens with expiration for external stakeholders
8. **Company join approval** — Admin-gated membership with pending/active/removed states
9. **Multi-company support** — Users can belong to multiple companies with independent access levels
10. **Project team management** — Assign company members to specific projects with roles
11. **Company role assignment** — Admins assign job titles when approving members

---

## 4. Non-Goals

These are explicitly out of scope. Do not implement.

- **Scheduling/calendaring** — Not a project scheduler
- **Bidding/estimation** — Assumes contracts already exist
- **Accounting integration** — No QuickBooks/Sage sync (billing data is informational)
- **GPS/location tracking** — No geofencing or location verification
- **Video streaming** — Photos only; no live video
- **Multi-language support** — English only (no i18n infrastructure)

---

## 5. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Office (Web) │  │ Foreman (Web)│  │ Public Viewer (Web)  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└─────────┼─────────────────┼─────────────────────┼───────────────┘
          │                 │                     │
          ▼                 ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                     REACT SPA (Vite)                            │
│  • App.jsx (routing, auth, company context)                     │
│  • Dashboard.jsx (office metrics, project detail)               │
│  • ForemanView.jsx (field interface)                            │
│  • PublicView.jsx (share link viewer)                           │
│  • MembershipManager.jsx (admin approval UI)                    │
│  • AppEntry.jsx (company join flow)                             │
│  • Service Worker (offline caching)                             │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                       SUPABASE                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  PostgreSQL │  │  Real-time  │  │   Storage   │             │
│  │  (RLS+RPC)  │  │ Subscriptions│ │   (Photos)  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
│  RPC Functions:                                                 │
│  • verify_office_code(company_id, code)                        │
│  • approve_membership_with_role(membership_id, approver, role) │
│  • has_active_company_membership(user_id, company_id)          │
└─────────────────────────────────────────────────────────────────┘
```

**Frozen decisions:**
- No server-side application code (Supabase RPC functions only)
- RLS policies enforce all authorization
- Real-time via Postgres NOTIFY, not polling
- Office codes verified server-side only (never exposed to client)

**Flexible:**
- Component structure within React
- CSS approach (currently inline + index.css)

---

## 6. Core Data Concepts

```
Company (multi-tenant root)
 ├── CompanyBranding (white-label customization)
 ├── User ←→ UserCompany (junction with access_level, company_role, status)
 │
 └── Project
      ├── ProjectUser (team assignment with project_role)
      ├── Area (weight OR scheduled_value, status)
      ├── CrewCheckin (daily labor log)
      ├── DailyReport
      ├── InjuryReport
      ├── TMTicket → ChangeOrder (optional linkage)
      ├── ChangeOrder (labor, materials, equipment, subcontractors)
      ├── MaterialRequest
      ├── Message (crew ↔ office)
      ├── HaulOff (disposal tracking)
      └── ProjectShare (public access token)
```

### Key Tables

| Table | Purpose |
|-------|---------|
| `companies` | Multi-tenant root. Has `code` (public) and `office_code` (secret). |
| `users` | User profiles linked to `auth.users`. Has primary `company_id`. |
| `user_companies` | Junction table for multi-company access. Contains `access_level`, `company_role`, and `status`. |
| `project_users` | Junction table for project team assignments. Contains `project_role`. |
| `projects` | Belongs to company. Has unique 4-digit PIN for foreman access. |
| `areas` | Progress tracking units within projects. |
| `change_orders` | COR workflow with line items across 4 cost categories. |

### user_companies Columns

| Column | Type | Purpose |
|--------|------|---------|
| `access_level` | TEXT | Security: 'administrator' or 'member' |
| `company_role` | TEXT | Job title: 'Project Manager', 'Superintendent', 'Job Costing', 'Accounting' |
| `status` | TEXT | Membership state: 'pending', 'active', 'removed' |
| `role` | TEXT | DEPRECATED - legacy field, use access_level instead |

### project_users Columns

| Column | Type | Purpose |
|--------|------|---------|
| `project_id` | UUID | FK to projects |
| `user_id` | UUID | FK to users |
| `project_role` | TEXT | Role on this project (informational only) |
| `assigned_by` | UUID | Who assigned them |
| `assigned_at` | TIMESTAMP | When assigned |

### Membership States

```
┌─────────┐    Admin     ┌─────────┐    Admin    ┌─────────┐
│ pending │ ──Approve──▶ │ active  │ ──Remove──▶ │ removed │
└─────────┘              └─────────┘             └─────────┘
     │                        │
     │ Admin Reject           │ (soft delete preserves
     ▼ (hard delete)          │  audit trail)
  [deleted]                   │
                              ▼
                    [Full data access via RLS]
```

**Key relationships:**
- Users can belong to multiple companies via `user_companies`
- Only `status = 'active'` grants data access (enforced by RLS)
- Project belongs to Company via `company_id`
- Areas define progress (100% total weight OR sum of scheduled_values)

**Data integrity rules:**
- PINs unique per project
- COR numbers unique per project (auto-incrementing)
- Cascade deletes on project removal
- Costs stored as integers (cents) to avoid float errors
- `user_companies` has unique constraint on `(user_id, company_id)`

---

## 7. Company Join Flow

### Office User Flow

```
1. User selects "Office" mode
2. Enter Company Code (public, 6-char)
   → Validated against companies.code
3. Enter Office Code (secret, 6-char)
   → Validated server-side via verify_office_code() RPC
   → Code is NEVER returned to client
4. Create account (name, email, password)
   → Creates auth.users entry
   → Creates users entry
   → Creates user_companies entry with status='pending'
5. User sees "Awaiting Approval" screen
6. Admin approves in MembershipManager
   → Sets status='active', assigns role
7. User refreshes → Full access granted
```

### Foreman Flow

```
1. User selects "Foreman" mode
2. Enter Company Code
3. Enter Project PIN (4-digit)
4. Direct access to ForemanView (no account required)
```

### Security Model

- **Company Code**: Public identifier, safe to share
- **Office Code**: Secret, only shared with trusted staff
- **Admin Approval**: Human verification layer prevents unauthorized access
- **RLS Enforcement**: Even with valid codes, `status='active'` required for data access

---

## 8. RLS Policy Architecture

All data access is controlled by Row Level Security policies that check:

1. **Authentication**: `auth.uid()` must be present
2. **Active Membership**: `user_companies.status = 'active'`
3. **Company Match**: User's company_id matches resource's company_id

### Policy Pattern

```sql
-- Standard pattern for company-scoped tables
CREATE POLICY "Active members access [table]"
ON [table] FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = auth.uid()
    AND uc.company_id = [table].company_id
    AND uc.status = 'active'
  )
);
```

### Tables with RLS Enabled

| Table | Policy Type |
|-------|-------------|
| `companies` | Public SELECT, admin UPDATE |
| `users` | Own record + admins see company users |
| `user_companies` | Own memberships + admins manage (uses `has_admin_access()` function to avoid recursion) |
| `project_users` | Active members view, admins manage |
| `projects` | Active members only |
| `areas` | Via project → company |
| `change_orders` | Active members only |
| `signature_requests` | Active members only |
| `injury_reports` | Active members only |
| `company_branding` | Active members view, admins update |

### Key RLS Functions

| Function | Purpose |
|----------|---------|
| `has_admin_access(user_id, company_id)` | SECURITY DEFINER function that checks if user is an active administrator. Used in policies to avoid infinite recursion. |
| `approve_membership_with_role(membership_id, approver, access_level)` | Approves pending member with specified access level. |
| `repair_legacy_user(user_id, company_id, role)` | Creates missing user_companies record for legacy users. |

---

## 9. Constraints

| Type | Constraint |
|------|------------|
| **Technical** | Frontend-only; no Node.js server. All logic in browser or Supabase. |
| **Technical** | Must function offline for field use. IndexedDB + pending queue required. |
| **Technical** | Real-time updates are non-negotiable. Polling is unacceptable. |
| **Technical** | Office codes must never be exposed to client. Server-side RPC only. |
| **Operational** | Single-region Supabase deployment (latency acceptable for US use). |
| **Business** | Multi-tenant by company. Data isolation via RLS is mandatory. |
| **Business** | Subscription tiers exist but enforcement logic is minimal. |
| **Security** | Pending users cannot access any company data. |

---

## 10. Engineering Principles

1. **Hooks before returns** — All React hooks must execute before any conditional return (rules of hooks)
2. **Debounce subscriptions** — Real-time callbacks must coalesce (150ms) to prevent cascade refreshes
3. **Fail gracefully** — Individual data fetch failures must not break the entire dashboard (Promise.all with catches)
4. **Comments are required** — Non-obvious logic must have inline comments explaining intent
5. **No credential exposure** — .env is gitignored; .env.example uses placeholders only
6. **Service worker versioning** — Bump `CACHE_NAME` on every deployment affecting cached assets
7. **Memoize expensive computations** — Portfolio metrics and progress calculations use useMemo
8. **Mobile-first for field** — Foreman interface must work on phone screens
9. **Server-side secrets** — Sensitive validation (office codes) happens in RPC functions, not client

---

## 11. Key Files Reference

> For complete file reference, see [CODE_MAP.md](./CODE_MAP.md)

### Core Application

| File | Purpose |
|------|---------|
| `src/App.jsx` | Main routing, auth state, company context |
| `src/components/Dashboard.jsx` | Office dashboard (1,965 lines - needs refactor) |
| `src/components/ForemanView.jsx` | Field crew interface |
| `src/components/TMForm.jsx` | T&M ticket creation (2,353 lines - needs split) |
| `src/components/SignaturePage.jsx` | Public signature collection |

### COR (Change Order Request)

| File | Purpose |
|------|---------|
| `src/components/cor/CORForm.jsx` | COR creation with quick select |
| `src/components/cor/CORDetail.jsx` | COR detail view, uses export pipeline |
| `src/components/cor/CORList.jsx` | COR list with multi-select grouping |

### Libraries

| File | Purpose | Status |
|------|---------|--------|
| `src/lib/supabase.js` | Database facade (5,926 lines - needs split) | Active |
| `src/lib/corExportPipeline.js` | COR export orchestration | Active |
| `src/lib/corPdfGenerator.js` | PDF generation from snapshots | **Preferred** |
| `src/lib/corPdfExport.js` | Legacy PDF generation | **Deprecated** |
| `src/lib/AuthContext.jsx` | Auth context provider | **Not used** |

### Admin

| File | Purpose |
|------|---------|
| `src/components/MembershipManager.jsx` | Approve/manage team members |
| `src/components/ProjectTeam.jsx` | Project team assignments |
| `src/components/BrandingSettings.jsx` | Company branding settings |

---

## 12. Known Risks & Technical Debt

### Technical Debt (Prioritized)

| Item | Lines | Priority | Suggested Action |
|------|-------|----------|------------------|
| `supabase.js` | 5,926 | **High** | Split by domain (projects, areas, tickets, cors, users) |
| `TMForm.jsx` | 2,353 | **High** | Split into step components (TMWorkInfoStep, TMCrewStep, etc.) |
| `Dashboard.jsx` | 1,965 | **Medium** | Extract tab content to separate components |
| `TMList.jsx` | 1,543 | **Medium** | Extract table/filter logic |
| `SignaturePage.jsx` | 1,265 | **Medium** | Split COR vs T&M handling |
| `CORForm.jsx` | 1,056 | **Medium** | Split into step components |
| `AuthContext.jsx` | 456 | **Low** | Either integrate or delete |
| Signature components | 4 files | **Low** | Consolidate to single reusable component |

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Large files slow new engineer onboarding | High | Documentation created; refactor per debt table above |
| Service worker serves stale JS causing React errors | High | Version bump on every build; documented in deployment process |
| No automated tests | High | Manual QA currently; test infrastructure is future work |
| Supabase free tier limits real-time connections | Medium | Monitor usage; upgrade path exists |
| Office code leakage grants pending access | Low | Admin approval required; codes can be regenerated |

### Open Questions

1. ~~**Admin role boundaries**: How are admin capabilities defined?~~ **RESOLVED**: Defined via `user_companies.role` with RLS enforcement.
2. **Subscription enforcement**: How should tier limits be enforced? Currently informational only.
3. **Offline conflict resolution**: What happens if field and office modify same area offline? Currently last-write-wins.
4. **Photo storage limits**: No per-project limits implemented. What's the growth strategy?
5. **Audit logging**: Should changes be logged for compliance? Partial coverage via `approved_by`/`removed_by`.
6. **Email notifications**: Should admins be notified of pending requests? Not implemented.
7. **Invite links**: Should admins be able to send direct invite links? Not implemented.

---

## 13. Migration History

| Migration | Purpose |
|-----------|---------|
| `schema.sql` | Initial projects/areas structure |
| `schema_v2.sql` | Profiles and project assignments |
| `add_pin.sql` | 4-digit PIN for foreman access |
| `add_company_branding.sql` | White-label support + subscription tiers |
| `migration_change_orders.sql` | COR system with line items |
| `migration_signatures.sql` | Signature request workflow |
| `migration_injury_reports.sql` | Injury reporting |
| `migration_project_shares.sql` | Public share tokens |
| `migration_membership_approval.sql` | Status column + basic RLS |
| `migration_company_join_approval.sql` | Complete approval layer with RPC functions |
| `migration_legacy_user_repair.sql` | **Fixes legacy users** missing membership records |
| `migration_access_levels.sql` | **Access levels + project teams** - separates security from visibility |
| `migration_photo_reliability.sql` | Photo reliability + export snapshots |
| `migration_cor_export_pipeline.sql` | **Industrial-grade COR export** - idempotent async exports with state machine |

---

## 14. Legacy User Compatibility

### Problem

Users created before the membership system have:
- A record in `users` table with `company_id` set
- **NO** corresponding record in `user_companies` table

This causes authentication to succeed but data loading to fail (RLS blocks access).

### Solution: Multi-Layer Repair

**Layer 1: SQL Migration** (`migration_legacy_user_repair.sql`)
- One-time migration creates `user_companies` records for all legacy users
- Sets `status = 'active'` (they were already using the system)
- Preserves role from `users.role` field

**Layer 2: Runtime Repair** (JavaScript fallback)
- `checkAuth()` and `handleOfficeLogin()` detect legacy users
- If `companies.length === 0` but `userData.company_id` exists → repair
- Calls `repair_legacy_user()` RPC function
- Retries company fetch after repair

**Layer 3: Trigger** (Future-proofing)
- Trigger on `users` table auto-creates membership when `company_id` is set
- Handles any legacy code paths that might still set `company_id` directly

### RPC Function

```sql
repair_legacy_user(p_user_id UUID, p_company_id UUID, p_role TEXT)
```

- **Security**: SECURITY DEFINER, but validates `auth.uid() = p_user_id`
- **Validation**: Only works if `users.company_id` matches provided company
- **Idempotent**: Safe to call multiple times

### Detection Flow

```
User logs in
    ↓
Fetch user_companies → empty array
    ↓
Check: userData.company_id exists?
    ↓ Yes
Call repair_legacy_user()
    ↓
Retry fetch user_companies → now has data
    ↓
Continue normal flow
```

---

## Document Governance

- **Owner**: Principal engineer or designated maintainer
- **Update frequency**: On any architectural decision or constraint change
- **Conflicts**: This document is authoritative. If code contradicts this document, determine which is correct and update the incorrect source.

---

*Last significant update: Industrial-grade COR Export Pipeline with idempotency, snapshots, and async state machine. Previous: COR UX improvements, Access Levels separation.*

---

## 15. COR Export Pipeline Architecture

### Design Principles

1. **Idempotency** - Repeat requests with same key return same result
2. **Deterministic** - Same COR version always produces identical output
3. **Async by Default** - Heavy operations don't block UI
4. **Fail Loudly** - Failures are detectable and recoverable
5. **Snapshot-Based** - Never query live data during PDF generation

### Pipeline Flow

```
User clicks Export
      ↓
Request Export (idempotency check)
      ↓ (if new request)
Create Snapshot (freeze COR data)
      ↓
Generate PDF (from snapshot only)
      ↓
Update Job Status (completed/failed)
      ↓
Return PDF URL
```

### Database Schema

```
cor_export_jobs (state machine)
├── id, cor_id, snapshot_id
├── idempotency_key (unique)
├── status: pending → generating → completed | failed
├── options (JSONB)
├── retry_count, max_retries, last_error
├── pdf_url, pdf_size_bytes, generation_time_ms
└── metrics: photo_count, ticket_count, page_count

change_orders (enhanced)
├── version (auto-increments on changes)
├── last_snapshot_version
└── Pre-aggregated stats:
    ├── total_labor_hours
    ├── total_overtime_hours
    ├── ticket_count
    ├── photo_count
    └── verified_ticket_count
```

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/corExportPipeline.js` | Orchestrator - `executeExport()`, `requestExport()`, `createSnapshot()` |
| `src/lib/corPdfGenerator.js` | PDF generation from snapshots only - never queries live data |
| `src/lib/corPdfExport.js` | **DEPRECATED** - Legacy export, kept for SignaturePage backward compatibility |
| `database/migration_cor_export_pipeline.sql` | Complete migration with triggers, functions, RLS |

### RPC Functions

| Function | Purpose |
|----------|---------|
| `request_cor_export(cor_id, key, options, user)` | Idempotent job creation - returns existing or creates new |
| `update_export_job_status(job_id, status, ...)` | Update job with metrics/errors |
| `update_cor_aggregated_stats(cor_id)` | Recalculate pre-aggregated statistics |

### Version Tracking

```
COR changes → version++ (via trigger)
      ↓
Export requested
      ↓
version != last_snapshot_version?
      ↓ Yes                    ↓ No
Create new snapshot     Return cached result
      ↓
Update last_snapshot_version
```

### Error Recovery

- Failed jobs increment `retry_count`
- Jobs can be retried up to `max_retries`
- `last_error` and `error_details` preserved for debugging
- UI can show export history with status

---

## 16. Access Levels Architecture

### Design Principles

1. **Security vs Visibility**: Access levels control what you CAN do. Roles identify WHO you are.
2. **No Recursion**: RLS policies use `has_admin_access()` SECURITY DEFINER function to avoid infinite loops.
3. **Multi-Tenant Safe**: Each company has independent access levels. One user can be admin of Company A and member of Company B.

### Admin Detection in Code

```javascript
// In App.jsx
const currentMembership = userCompanies.find(uc => uc.id === company?.id)
const accessLevel = currentMembership?.access_level
const isAdmin = accessLevel === 'administrator' || company?.owner_user_id === user?.id
```

### Admin-Only Features

- Team tab (approve/reject members, change access levels)
- Branding tab (company customization)
- Project Team management (assign members to projects)
- Change company roles for existing members

### Approval Flow

```
1. User joins with Company Code + Office Code
2. Creates pending membership in user_companies
3. Admin sees pending request in Team tab
4. Admin selects:
   - Access Level: Administrator or Member
   - Company Role: PM, Superintendent, Job Costing, Accounting
5. Admin clicks Approve
6. User refreshes → Full access granted
7. Admin can later:
   - Change access level
   - Change company role
   - Assign to projects with project roles
   - Remove from company
```
