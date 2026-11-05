# FieldSync Architecture Guide

> Complete system architecture for engineering team onboarding.
> Last updated: 2025-01-04

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Tech Stack](#2-tech-stack)
3. [Application Views](#3-application-views)
4. [Data Flow Architecture](#4-data-flow-architecture)
5. [Database Layer](#5-database-layer)
6. [Real-time Subscriptions](#6-real-time-subscriptions)
7. [Offline Architecture](#7-offline-architecture)
8. [Authentication & Authorization](#8-authentication--authorization)
9. [PDF Export Pipeline](#9-pdf-export-pipeline)
10. [Key Architectural Decisions](#10-key-architectural-decisions)

---

## 1. System Overview

FieldSync eliminates information lag between construction field crews and office management. When a foreman marks work complete, the office sees it in seconds.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                     │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────┐ │
│  │  Office (Web)  │  │ Foreman (Web)  │  │    Public Viewer (Web)     │ │
│  │  - Dashboard   │  │ - T&M Tickets  │  │    - Signature Page        │ │
│  │  - COR Mgmt    │  │ - Crew Checkin │  │    - Progress View         │ │
│  │  - Team Mgmt   │  │ - Daily Reports│  │                            │ │
│  └───────┬────────┘  └───────┬────────┘  └─────────────┬──────────────┘ │
└──────────┼───────────────────┼─────────────────────────┼────────────────┘
           │                   │                         │
           ▼                   ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         REACT SPA (Vite)                                 │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ App.jsx - Central Router & Auth State                            │    │
│  │ • View state machine: entry → foreman | office | public          │    │
│  │ • User authentication state                                      │    │
│  │ • Company/project context                                        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│  ┌───────────────────────────┼───────────────────────────────────────┐  │
│  │                           ▼                                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │  │
│  │  │  Dashboard  │  │ ForemanView │  │ SignaturePg │                │  │
│  │  │  (Office)   │  │   (Field)   │  │  (Public)   │                │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                │  │
│  │         │                │                │                        │  │
│  │         ▼                ▼                ▼                        │  │
│  │  ┌──────────────────────────────────────────────────────────────┐ │  │
│  │  │              src/lib/supabase.js (Database Facade)            │ │  │
│  │  │  • db.* namespace (100+ methods)                              │ │  │
│  │  │  • auth.* namespace (8 methods)                               │ │  │
│  │  │  • Built-in offline fallback                                  │ │  │
│  │  └──────────────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             SUPABASE                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │   PostgreSQL    │  │    Realtime     │  │     Storage     │         │
│  │   + RLS + RPC   │  │  Subscriptions  │  │    (Photos)     │         │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React 18 + Vite 7 | Single-page application |
| **Styling** | Custom CSS + CSS Variables | Theme support (light/dark) |
| **Icons** | Lucide React | Consistent icon set |
| **Backend** | Supabase | PostgreSQL + Auth + Realtime + Storage |
| **Hosting** | Vercel | Auto-deploy from GitHub |
| **Offline** | IndexedDB (via offlineManager.js) | Field crew connectivity |

### Key Dependencies

```json
{
  "react": "^18.x",
  "react-dom": "^18.x",
  "@supabase/supabase-js": "^2.x",
  "jspdf": "^2.x",           // PDF generation
  "lucide-react": "^0.x",    // Icons
  "date-fns": "^3.x"         // Date formatting
}
```

---

## 3. Application Views

The app uses a **view state machine** in `App.jsx`:

```
                    ┌──────────────┐
                    │    entry     │ (Company code input)
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
       ┌──────────┐  ┌──────────┐  ┌──────────┐
       │ foreman  │  │  office  │  │  public  │
       │  (PIN)   │  │ (Login)  │  │ (Token)  │
       └──────────┘  └────┬─────┘  └──────────┘
                          │
                          ▼
                    ┌──────────┐
                    │ pending  │ (Awaiting approval)
                    └──────────┘
```

### View Responsibilities

| View | Component | Access Method | Purpose |
|------|-----------|---------------|---------|
| **entry** | `AppEntry.jsx` | None | Company code + mode selection |
| **foreman** | `ForemanView.jsx` | PIN (4-digit) | Field crew operations |
| **office** | `Dashboard.jsx` | Email/password | Project management |
| **public** | `SignaturePage.jsx` | Share token (token-gated RPCs, anon role) | External signature collection |
| **pending** | `PendingApproval.jsx` | After signup | Wait for admin approval |

---

## 4. Data Flow Architecture

### Primary Pattern: Supabase Facade

All database operations go through `src/lib/supabase.js`:

```javascript
// Component
import { db } from '../lib/supabase'

// Usage
const projects = await db.getProjects(companyId)
await db.createTMTicket(ticketData)
await db.updateArea(areaId, updates)
```

### Data Flow Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Component     │────▶│   db.method()   │────▶│    Supabase     │
│   (React)       │     │  (supabase.js)  │     │   (PostgreSQL)  │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
           ┌─────────────────┐      ┌─────────────────┐
           │  Online Mode    │      │  Offline Mode   │
           │ (Supabase API)  │      │  (IndexedDB)    │
           └─────────────────┘      └─────────────────┘
```

### Query Organization in supabase.js

The `db` namespace contains 100+ methods organized by domain:

```javascript
db = {
  // Projects (6 methods)
  getProjects(companyId)
  getProjectByPin(pin)
  createProject(data)
  updateProject(id, data)
  archiveProject(id)
  getArchivedProjects(companyId)

  // Areas (3 methods)
  getAreas(projectId)
  updateArea(id, data)
  createArea(data)

  // T&M Tickets (5 methods)
  getTMTickets(projectId)
  getTMTicketsByStatus(projectId, status)
  createTMTicket(data)
  updateTMTicket(id, data)
  getCORTickets(corId)

  // Change Orders (8 methods)
  getChangeOrders(projectId)
  getCORById(id)
  createChangeOrder(data)
  updateChangeOrder(id, data)
  // ... and more

  // Users & Memberships (10+ methods)
  // Crew & Daily Reports (5+ methods)
  // ... etc
}
```

---

## 5. Database Layer

### Core Tables

```
companies                    # Multi-tenant root
├── company_branding        # White-label customization
├── users                   # User profiles
│   └── user_companies      # Junction (access_level, company_role, status)
│
└── projects                # Construction projects
    ├── project_users       # Team assignments (project_role)
    ├── areas               # Progress tracking units
    ├── t_and_m_tickets     # Time & Materials tickets
    │   ├── t_and_m_workers # Labor entries
    │   └── t_and_m_items   # Materials/equipment
    ├── change_orders       # COR workflow
    │   ├── change_order_labor
    │   ├── change_order_materials
    │   ├── change_order_equipment
    │   └── change_order_subcontractors
    ├── crew_checkins       # Daily labor log
    ├── daily_reports
    ├── injury_reports
    └── project_shares      # Public access tokens
```

### Row Level Security (RLS)

All tables use RLS policies. Pattern:

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

**Key principle:** Pending users (status != 'active') cannot access any company data.

### RPC Functions (Server-side Logic)

| Function | Purpose |
|----------|---------|
| `verify_office_code(company_id, code)` | Validate secret office code (never exposed to client) |
| `approve_membership_with_role(membership_id, approver, access_level)` | Admin approves pending member |
| `request_cor_export(cor_id, key, options, user)` | Idempotent export job creation |
| `update_export_job_status(job_id, status, ...)` | Update export state machine |

---

## 6. Real-time Subscriptions

Real-time updates use Supabase's Postgres NOTIFY system.

### Subscription Pattern (Dashboard.jsx)

```javascript
// Subscribe to multiple tables
const subscription = db.subscribeToCompanyActivity(companyId, projectIds, {
  onMessage: () => debouncedRefresh(),
  onTMTicket: () => debouncedRefresh(),
  onMaterialRequest: () => debouncedRefresh(),
  onInjuryReport: () => debouncedRefresh(),
  onCrewCheckin: () => debouncedRefresh()
})

// Cleanup on unmount
useEffect(() => {
  return () => subscription?.unsubscribe()
}, [])
```

### Debouncing

To prevent cascade refreshes, callbacks are debounced (150ms):

```javascript
const debouncedRefresh = useMemo(
  () => debounce(() => refreshData(), 150),
  [refreshData]
)
```

---

## 7. Offline Architecture

### Three-Layer Approach

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: Supabase (Primary)                                     │
│ • PostgreSQL with Realtime subscriptions                        │
│ • Used when: Online + Supabase configured                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (offline fallback)
┌─────────────────────────────────────────────────────────────────┐
│ Layer 2: IndexedDB (Offline Cache)                              │
│ • Database 'fieldsync-offline', managed by offlineManager.js    │
│ • Used when: Supabase configured but network unavailable        │
│ • pending_tm_tickets: whole T&M tickets saved on the phone      │
│ • pending_actions: legacy per-mutation queue                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (dev/demo fallback)
┌─────────────────────────────────────────────────────────────────┐
│ Layer 3: localStorage (Demo Mode)                               │
│ • Used when: Supabase NOT configured (!isSupabaseConfigured)    │
│ • For local development and demos                               │
└─────────────────────────────────────────────────────────────────┘
```

### Offline T&M tickets (the supported offline path)

Only T&M tickets are guaranteed to save offline, and only in field mode
(foreman PIN session). Photos are **not** saved offline: when there is no
signal the form asks to save the ticket without them.

**Submit.** `TMForm` builds one record per ticket, keyed by a
`client_submission_id` (UUID generated when the form opens and kept in the
draft), and calls `db.submitTMTicketFull(record)` (`src/lib/db/tmOps.js`),
which sends it to the `create_tm_ticket_full(p_payload jsonb)` RPC with a 12 s
`AbortController`. The RPC (`supabase/migrations/20261104_offline_tm_submit.sql`,
SECURITY INVOKER) inserts the ticket, workers, items and optional foreman
signature in one transaction and is idempotent: a repeated
`client_submission_id` (partial unique index on `t_and_m_tickets`) returns the
existing row tagged `replayed: true`. It raises `42501` when
`can_access_project` fails (expired field session) and `22023` on bad input.
If the call fails with a network-class error and the user is in field mode,
the record is written to IndexedDB and step 5 shows "Saved on this phone".
Office users get an error toast instead.

**Local store.** Database `fieldsync-offline` (version 3), object store
`pending_tm_tickets`, keyPath `client_submission_id`, indexes `project_id` and
`state`. Each record moves through
`queued → syncing → synced → deleted`, or to `needs_auth` (session expired) or
`failed` (server rejected it 10 times). A foreman signature captured on a
pending ticket is written into the record in the same IndexedDB transaction.

**Sync.** `syncPendingTMTickets(db, { projectId })` runs from
`drainPendingActions` in `src/lib/supabase.js` on startup, on the `online`
event, when the app returns to the foreground and after PIN login, with
5 s / 15 s / 45 s retries when the radio is not yet routable. It sends one
record at a time to the same RPC (30 s timeout); server-side dedupe makes the
at-least-once client retry exactly-once. After the server row exists it
applies any locally captured signature the row lacks, then deletes the record.
On `42501` for the current project it emits `session_expired` and the app
returns to the PIN screen; `requeueNeedsAuthTickets` re-queues them after login.

**UI.** `getPendingSyncSummary({ projectId })` returns
`{ queued, syncing, needs_auth, failed, total }` (zeros when IndexedDB is
unavailable) and `onSyncStateChange(cb)` emits `summary_changed`,
`sync_start`, `ticket_synced`, `sync_complete` and `session_expired`.
`ForemanView` owns the per-project count and passes it to `ForemanLanding`
(T&M card "N waiting to sync", home banner); `OfflineIndicator` shows the
device-wide state in field mode ("Offline · N ticket(s) saved on phone",
"Sign in to sync N ticket(s)", "N ticket(s) could not sync — tell the office",
"Syncing N ticket(s)…", "Synced N ticket(s)").

Labor classes are cached (`labor_classes_<companyId>`) so a custom-class ticket
renders offline. Assignable CORs and "same as yesterday" crew are not cached.
A cold offline start needs the current build's files cached by an earlier
online launch (`public/sw.js` caches on fetch; there is no precache manifest).

### Offline Manager (offlineManager.js)

```javascript
// T&M tickets (pending_tm_tickets store)
savePendingTMTicket                         // Save a ticket on the phone
getPendingTMTicket / getPendingTMTickets    // Read saved tickets
updatePendingTMTicket / deletePendingTMTicket
attachSignatureToPendingTicket              // One readwrite transaction; no-op + server id when already synced
syncPendingTMTickets(db, { projectId })     // Drain to create_tm_ticket_full
requeueNeedsAuthTickets(projectId)          // After PIN login
getPendingSyncSummary({ projectId })        // Counts for the field UI
onSyncStateChange(callback)                 // Sync event bus

// Legacy per-mutation queue (pending_actions store)
addPendingAction(type, payload, metadata)   // Queue mutation for sync
syncPendingActions(db)                      // Replay when online
getPendingActionCount()

// Connection
getConnectionStatus() / onConnectionChange(callback)   // navigator.onLine based
```

`getConnectionStatus()` follows `navigator.onLine`, which reports "online" on a
dead radio; the T&M path relies on the request timeout instead.

### Conflict Resolution

Currently: **Last-write-wins** for the legacy queue. T&M tickets are
insert-only and deduplicated server-side by `client_submission_id`.

---

## 8. Authentication & Authorization

### Access Levels (Security)

| Level | Stored In | Capabilities |
|-------|-----------|--------------|
| **Administrator** | `user_companies.access_level` | Full control: approve members, manage team, branding |
| **Member** | `user_companies.access_level` | Standard access: view/edit projects |
| **Foreman** | PIN-based (no account) | Field-only via Company Code + Project PIN |

### Company Roles (Job Titles - Informational Only)

- Project Manager
- Superintendent
- Job Costing
- Accounting

### Project Roles (Per-Project)

Stored in `project_users.project_role`:
- Project Manager, Superintendent, Foreman, Office Support, Engineer, Inspector, Team Member

### Admin Detection in Code

```javascript
// App.jsx pattern
const currentMembership = userCompanies.find(uc => uc.id === company?.id)
const accessLevel = currentMembership?.access_level
const isAdmin = accessLevel === 'administrator' || company?.owner_user_id === user?.id
```

---

## 9. PDF Export Pipeline

### Architecture (Snapshot-Based)

```
User clicks Export
      │
      ▼
┌─────────────────────────────────┐
│ corExportPipeline.js            │
│ executeExport()                 │
│ • Generate idempotency key      │
│ • Check for existing job        │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│ Request Export (RPC)            │
│ • Idempotent: returns existing  │
│   job if key matches            │
│ • Creates pending job if new    │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│ Create Snapshot                 │
│ • Freeze COR + tickets + photos │
│ • Store in cor_export_snapshots │
│ • Mark snapshot version         │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│ corPdfGenerator.js              │
│ generatePDFFromSnapshot()       │
│ • NEVER queries live data       │
│ • Works from frozen snapshot    │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│ Update Job Status               │
│ • completed + pdf_url           │
│ • OR failed + error details     │
└─────────────────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `corExportPipeline.js` | Orchestrator - manages jobs, snapshots, status |
| `corPdfGenerator.js` | PDF rendering from snapshots (preferred) |
| `corPdfExport.js` | **DEPRECATED** - Legacy export, kept for SignaturePage |

---

## 10. Key Architectural Decisions

### Frozen Decisions (Do Not Change)

| Decision | Rationale |
|----------|-----------|
| No server-side application code | All logic in browser or Supabase RPC |
| RLS policies enforce all authorization | Security at database level |
| Real-time via Postgres NOTIFY | Not polling |
| Office codes verified server-side only | Never exposed to client |
| Multi-tenant by company | Data isolation mandatory |

### Flexible Decisions

| Decision | Current State | Open To Change |
|----------|---------------|----------------|
| Component structure | Monolithic Dashboard/TMForm | Yes - should split |
| CSS approach | index.css + inline | Yes |
| State management | useState + props | Could add Zustand/Redux |
| Form handling | Manual | Could add React Hook Form |

### Known Technical Debt

1. **supabase.js is 5,926 lines** - Should split by domain
2. **Dashboard.jsx is 1,965 lines** - Should extract sub-components
3. **TMForm.jsx is 2,353 lines** - Should split into step components
4. **AuthContext.jsx exists but is not used** - Dead code or revival candidate
5. **4 different signature implementations** - Should consolidate

---

## Quick Reference

### Adding a New Database Query

1. Open `src/lib/supabase.js`
2. Find the relevant domain section (projects, areas, tickets, etc.)
3. Add method to `db` object following existing patterns
4. Include offline fallback if needed

### Adding a New Component

1. Create in `src/components/`
2. Use subdirectory if part of a feature (e.g., `cor/NewComponent.jsx`)
3. Import `db` from `../lib/supabase` for data access
4. Follow existing patterns for loading/error states

### Testing Offline Mode

1. Set `isSupabaseConfigured = false` in supabase.js (temporary)
2. Or use browser DevTools Network tab to simulate offline
3. Pending actions queue in IndexedDB

---

*See also: [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) for coding conventions, [CODE_MAP.md](./CODE_MAP.md) for file reference*
