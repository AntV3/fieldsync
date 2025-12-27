# PROJECT_CONTEXT.md
> Canonical source of truth for FieldSync. Authoritative over ad-hoc instructions.
> Last updated: 2025-12-26

---

## 1. Purpose

FieldSync exists to **eliminate information lag between construction field crews and office management**. It provides real-time visibility into project progress, enabling defensible billing tied directly to completed work.

The core value proposition: when a foreman marks an area complete, the office sees it within seconds—not hours or days.

---

## 2. Users

| User Type | Access Method | Primary Function |
|-----------|---------------|------------------|
| **Foreman** | Company code + 4-digit project PIN | Update area status, submit reports, log T&M |
| **Office** | Email/password auth | View dashboards, manage projects, process change orders |
| **Admin** | Email/password auth | All office capabilities + multi-company + user management |
| **Public Viewer** | Share link (no auth) | Read-only project progress via time-limited tokens |

**Assumption**: Admin role capabilities are inferred from code patterns; no explicit admin documentation exists.

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
│  • Dashboard.jsx (office metrics, project detail)               │
│  • ForemanView.jsx (field interface)                            │
│  • PublicView.jsx (share link viewer)                           │
│  • Service Worker (offline caching)                             │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                       SUPABASE                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  PostgreSQL │  │  Real-time  │  │   Storage   │             │
│  │   (RLS)     │  │ Subscriptions│ │   (Photos)  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

**Frozen decisions:**
- No server-side application code (Supabase functions only)
- RLS policies enforce all authorization
- Real-time via Postgres NOTIFY, not polling

**Flexible:**
- Component structure within React
- CSS approach (currently inline + index.css)

---

## 6. Core Data Concepts

```
Company (multi-tenant root)
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

**Key relationships:**
- Project belongs to Company
- Areas define progress (100% total weight OR sum of scheduled_values)
- T&M Tickets can be associated with Change Orders
- Change Orders have line items across 4 cost categories

**Data integrity rules:**
- PINs unique per project
- COR numbers unique per project (auto-incrementing)
- Cascade deletes on project removal
- Costs stored as integers (cents) to avoid float errors

---

## 7. Constraints

| Type | Constraint |
|------|------------|
| **Technical** | Frontend-only; no Node.js server. All logic in browser or Supabase. |
| **Technical** | Must function offline for field use. IndexedDB + pending queue required. |
| **Technical** | Real-time updates are non-negotiable. Polling is unacceptable. |
| **Operational** | Single-region Supabase deployment (latency acceptable for US use). |
| **Business** | Multi-tenant by company. Data isolation via RLS is mandatory. |
| **Business** | Subscription tiers exist but enforcement logic is minimal. |

**Assumption**: Subscription tier enforcement is future work; current code has tier fields but limited gating.

---

## 8. Engineering Principles

1. **Hooks before returns** — All React hooks must execute before any conditional return (rules of hooks)
2. **Debounce subscriptions** — Real-time callbacks must coalesce (150ms) to prevent cascade refreshes
3. **Fail gracefully** — Individual data fetch failures must not break the entire dashboard (Promise.all with catches)
4. **Comments are required** — Non-obvious logic must have inline comments explaining intent
5. **No credential exposure** — .env is gitignored; .env.example uses placeholders only
6. **Service worker versioning** — Bump `CACHE_NAME` on every deployment affecting cached assets
7. **Memoize expensive computations** — Portfolio metrics and progress calculations use useMemo
8. **Mobile-first for field** — Foreman interface must work on phone screens

---

## 9. Known Risks & Open Questions

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Service worker serves stale JS causing React errors | High | Version bump on every build; documented in deployment process |
| Supabase free tier limits real-time connections | Medium | Monitor usage; upgrade path exists |
| 1700+ line Dashboard.jsx is a maintenance burden | Medium | Accepted tech debt; refactor when adding major features |
| No automated tests | High | Manual QA currently; test infrastructure is future work |

### Open Questions

1. **Subscription enforcement**: How should tier limits be enforced? Currently informational only.
2. **Offline conflict resolution**: What happens if field and office modify same area offline? Currently last-write-wins.
3. **Photo storage limits**: No per-project limits implemented. What's the growth strategy?
4. **Audit logging**: Should changes be logged for compliance? Currently no audit trail.

---

## Document Governance

- **Owner**: Principal engineer or designated maintainer
- **Update frequency**: On any architectural decision or constraint change
- **Conflicts**: This document is authoritative. If code contradicts this document, determine which is correct and update the incorrect source.

---

*This document cannot fully define subscription tier behavior, admin role boundaries, or offline conflict resolution with available information.*
