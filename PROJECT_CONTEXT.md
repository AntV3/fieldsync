# PROJECT_CONTEXT.md
> Canonical source of truth for FieldSync. Authoritative over ad-hoc instructions.
> Last updated: 2025-12-27

---

## 1. Purpose

FieldSync exists to **eliminate information lag between construction field crews and office management**. It provides real-time visibility into project progress, enabling defensible billing tied directly to completed work.

The core value proposition: when a foreman marks an area complete, the office sees it within seconds—not hours or days.

---

## 2. Users

| User Type | Access Method | Primary Function |
|-----------|---------------|------------------|
| **Foreman** | Company code + 4-digit project PIN | Update area status, submit reports, log T&M |
| **Office** | Company code + Office code + Email/password | View dashboards, manage projects, process change orders |
| **Admin** | Same as Office (role-based) | All office capabilities + user management + company settings |
| **Owner** | Same as Office (role-based) | All admin capabilities + billing + company deletion |
| **Public Viewer** | Share link (no auth) | Read-only project progress via time-limited tokens |

### Role Hierarchy

```
owner > admin > office > member > foreman
```

- **owner**: Full control, can delete company, manage billing
- **admin**: Approve/reject memberships, manage users, update company settings
- **office**: Full project management, change orders, reports
- **member**: Basic access to company data
- **foreman**: Field-only access via PIN, no dashboard access

---

## 3. Core Capabilities

These must work reliably. Regressions here are critical failures.

1. **Real-time progress sync** — Area status changes propagate to all connected clients within seconds
2. **Dual progress calculation** — Supports both percentage-weight and SOV dollar-value tracking
3. **Offline operation** — Field crews can update status without connectivity; syncs when restored
4. **T&M ticket creation** — Field captures labor, equipment, materials with photo documentation
5. **Change order workflow** — Draft → Pending → Approved → Billed → Closed with cost breakdown
6. **Daily/injury reporting** — Structured forms with required fields and status tracking
7. **Project sharing** — Granular permission tokens with expiration for external stakeholders
8. **Company join approval** — Admin-gated membership with pending/active/removed states

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
 ├── User ←→ UserCompany (junction with role + status)
 │
 └── Project
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
| `user_companies` | Junction table for multi-company access. Contains `role` and `status`. |
| `projects` | Belongs to company. Has unique 4-digit PIN for foreman access. |
| `areas` | Progress tracking units within projects. |
| `change_orders` | COR workflow with line items across 4 cost categories. |

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
| `users` | Own record + admin view company users |
| `user_companies` | Own memberships + admin manage |
| `projects` | Active members only |
| `areas` | Via project → company |
| `change_orders` | Active members only |
| `signature_requests` | Active members only |
| `injury_reports` | Active members only |
| `company_branding` | Active members + public domain lookup |

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

| File | Purpose |
|------|---------|
| `src/App.jsx` | Main routing, auth state, company context, admin detection |
| `src/components/AppEntry.jsx` | Company join flow (code entry, account creation) |
| `src/components/MembershipManager.jsx` | Admin UI for approving/rejecting members |
| `src/components/BrandingSettings.jsx` | Company branding + office code management |
| `src/lib/supabase.js` | Database functions, membership management |
| `database/migration_company_join_approval.sql` | Complete membership approval migration |
| `database/migration_membership_approval.sql` | Original membership status migration |

---

## 12. Known Risks & Open Questions

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Service worker serves stale JS causing React errors | High | Version bump on every build; documented in deployment process |
| Supabase free tier limits real-time connections | Medium | Monitor usage; upgrade path exists |
| 1700+ line Dashboard.jsx is a maintenance burden | Medium | Accepted tech debt; refactor when adding major features |
| No automated tests | High | Manual QA currently; test infrastructure is future work |
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

*Last significant update: Added Legacy User Repair system for backwards compatibility with pre-membership accounts.*
