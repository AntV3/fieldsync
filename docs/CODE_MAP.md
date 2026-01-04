# FieldSync Code Map

> Complete file reference with purposes, relationships, and status.
> Last updated: 2025-01-04

---

## Overview

| Category | Files | Total Lines |
|----------|-------|-------------|
| Components | 40+ | ~15,000 |
| Libraries | 12 | ~10,000 |
| Migrations | 24 | ~3,000 |
| Documentation | 10 | ~2,500 |

---

## 1. Entry Points

| File | Lines | Purpose | Status |
|------|-------|---------|--------|
| `src/main.jsx` | ~20 | App entry point, renders App.jsx | Active |
| `src/App.jsx` | ~700 | Root component, routing, auth state | Active |
| `index.html` | ~30 | HTML template | Active |

### App.jsx Key Responsibilities

- View state machine (`entry`, `foreman`, `office`, `public`, `pending`)
- User authentication state
- Company/project context
- Toast notification system
- Global callbacks passed to children

---

## 2. Components

### 2.1 Main Views

| File | Lines | Purpose | Status | Notes |
|------|-------|---------|--------|-------|
| `Dashboard.jsx` | 1,965 | Office main interface | Active | **LARGE - needs refactor** |
| `ForemanView.jsx` | 648 | Field crew interface | Active | |
| `SignaturePage.jsx` | 1,265 | Public signature page | Active | Handles COR + T&M signatures |
| `AppEntry.jsx` | ~400 | Company join flow | Active | |
| `PendingApproval.jsx` | ~100 | Waiting for admin approval | Active | |
| `PublicView.jsx` | ~300 | Public project viewer | Active | Share link access |

### 2.2 T&M (Time & Materials)

| File | Lines | Purpose | Status | Notes |
|------|-------|---------|--------|-------|
| `TMForm.jsx` | 2,353 | T&M ticket creation/edit | Active | **LARGEST - needs split** |
| `TMList.jsx` | 1,543 | T&M ticket list/table | Active | |
| `TMClientSignature.jsx` | ~300 | On-site signature capture | Active | |

#### TMForm.jsx Structure (Should Split Into)

```
TMForm.jsx (orchestrator)
├── TMWorkInfoStep.jsx     (date, description, photos)
├── TMCrewStep.jsx         (workers, hours)
├── TMMaterialsStep.jsx    (materials, equipment)
├── TMReviewStep.jsx       (summary before submit)
└── TMSignatureStep.jsx    (signature options)
```

### 2.3 COR (Change Order Request) - `src/components/cor/`

| File | Lines | Purpose | Status | Notes |
|------|-------|---------|--------|-------|
| `CORForm.jsx` | 1,056 | COR creation/edit | Active | Multi-step form |
| `CORDetail.jsx` | 887 | COR detail view | Active | Uses export pipeline |
| `CORList.jsx` | ~600 | COR list with filters | Active | Multi-select support |
| `CORSummary.jsx` | ~200 | COR totals display | Active | |
| `TicketSelector.jsx` | ~300 | Link tickets to COR | Active | |
| `SignatureCapture.jsx` | ~50 | Simple canvas signature | Active | Used in COR signing |

### 2.4 Pricing - `src/components/pricing/`

| File | Lines | Purpose | Status | Notes |
|------|-------|---------|--------|-------|
| `LaborRatesSection.jsx` | ~400 | Labor rate management | Active | |
| `MaterialsSection.jsx` | ~400 | Materials pricing | Active | |
| `DumpSitesSection.jsx` | ~300 | Dump site rates | Active | |

### 2.5 Reports & Forms

| File | Lines | Purpose | Status | Notes |
|------|-------|---------|--------|-------|
| `DailyReport.jsx` | ~400 | Daily report form | Active | |
| `DailyReportsList.jsx` | ~300 | Daily reports list | Active | |
| `InjuryReportForm.jsx` | ~500 | Injury report form | Active | |
| `InjuryReportsList.jsx` | ~300 | Injury reports list | Active | |
| `CrewCheckin.jsx` | ~400 | Crew check-in form | Active | |

### 2.6 Utility Components

| File | Lines | Purpose | Status | Notes |
|------|-------|---------|--------|-------|
| `EnhancedSignatureCapture.jsx` | ~200 | Advanced signature canvas | Active | Preferred for modals |
| `SignatureLinkGenerator.jsx` | ~200 | Generate share links | Active | |
| `DisposalLoadInput.jsx` | ~300 | Log disposal loads | Active | |
| `DisposalSummary.jsx` | ~200 | Disposal summary view | Active | |
| `ManDayCosts.jsx` | ~200 | Man-day cost tracking | Active | |
| `BurnRateCard.jsx` | ~150 | Budget burn rate | Active | |
| `CostContributorsCard.jsx` | ~150 | Cost breakdown | Active | |
| `AddCostModal.jsx` | ~250 | Add additional costs | Active | |
| `ProjectShareModal.jsx` | ~200 | Share project modal | Active | |

### 2.7 Admin Components

| File | Lines | Purpose | Status | Notes |
|------|-------|---------|--------|-------|
| `MembershipManager.jsx` | ~500 | Approve/manage members | Active | Admin only |
| `ProjectTeam.jsx` | ~400 | Project team assignments | Active | Admin only |
| `BrandingSettings.jsx` | ~400 | Company branding | Active | Admin only |

### 2.8 Setup & Onboarding

| File | Lines | Purpose | Status | Notes |
|------|-------|---------|--------|-------|
| `Setup.jsx` | ~300 | Initial company setup | Active | |
| `JoinCompany.jsx` | ~200 | Join existing company | Active | |
| `AreaEditor.jsx` | ~400 | Edit project areas | Active | |

---

## 3. Libraries (`src/lib/`)

### 3.1 Core

| File | Lines | Purpose | Status | Notes |
|------|-------|---------|--------|-------|
| `supabase.js` | 5,926 | Database facade | Active | **VERY LARGE - needs split** |
| `utils.js` | 198 | General utilities | Active | Formatting, calculations |

#### supabase.js Exports

```javascript
export const isSupabaseConfigured  // boolean
export const supabase              // Supabase client (avoid direct use)
export const db                    // Database methods (100+ methods)
export const auth                  // Auth methods (8 methods)
export const observe               // Observability methods
```

### 3.2 COR/PDF Export

| File | Lines | Purpose | Status | Notes |
|------|-------|---------|--------|-------|
| `corExportPipeline.js` | 642 | Export orchestration | Active | Idempotent, snapshot-based |
| `corPdfGenerator.js` | 956 | PDF from snapshots | Active | **Preferred for new code** |
| `corPdfExport.js` | 1,522 | Legacy PDF generation | **DEPRECATED** | Kept for SignaturePage |
| `corCalculations.js` | 305 | COR math utilities | Active | Totals, markups |

#### Export Pipeline Flow

```
corExportPipeline.js  →  corPdfGenerator.js  →  PDF output
     ↓
 (creates snapshot)
     ↓
 (uses corCalculations.js for math)
```

### 3.3 Offline & Utilities

| File | Lines | Purpose | Status | Notes |
|------|-------|---------|--------|-------|
| `offlineManager.js` | 440 | IndexedDB operations | Active | Offline caching |
| `imageUtils.js` | 137 | Image compression | Active | Photo uploads |
| `observability.js` | 265 | Analytics/telemetry | Active | Usage tracking |

### 3.4 Context Providers

| File | Lines | Purpose | Status | Notes |
|------|-------|---------|--------|-------|
| `BrandingContext.jsx` | 282 | Custom branding | Active | Used throughout |
| `ThemeContext.jsx` | ~100 | Light/dark theme | Active | |
| `AuthContext.jsx` | 456 | Auth context | **NOT USED** | Dead code - App.jsx manages auth |

---

## 4. Database Migrations (`database/`)

### Core Schema

| File | Purpose | Dependencies |
|------|---------|--------------|
| `schema.sql` | Initial projects/areas | None |
| `schema_v2.sql` | Profiles, assignments | schema.sql |
| `add_pin.sql` | Foreman PIN access | schema_v2.sql |

### Features

| File | Purpose | Dependencies |
|------|---------|--------------|
| `migration_change_orders.sql` | COR system | schema_v2.sql |
| `migration_signatures.sql` | Signature workflow | migration_change_orders.sql |
| `migration_injury_reports.sql` | Injury reporting | schema_v2.sql |
| `migration_project_shares.sql` | Public tokens | schema_v2.sql |
| `add_company_branding.sql` | White-label | schema_v2.sql |

### Access Control

| File | Purpose | Dependencies |
|------|---------|--------------|
| `migration_membership_approval.sql` | Status column, basic RLS | schema_v2.sql |
| `migration_company_join_approval.sql` | Complete approval layer | migration_membership_approval.sql |
| `migration_access_levels.sql` | Access levels, project teams | migration_company_join_approval.sql |
| `migration_legacy_user_repair.sql` | Fix legacy users | migration_access_levels.sql |

### Export Pipeline

| File | Purpose | Dependencies |
|------|---------|--------------|
| `migration_photo_reliability.sql` | Photo reliability, snapshots | migration_change_orders.sql |
| `migration_cor_export_pipeline.sql` | Async export, state machine | migration_photo_reliability.sql |

---

## 5. Archived Components (`src/archived/`)

**DO NOT USE** - These are deprecated. Listed for reference only.

| File | Was | Replaced By |
|------|-----|-------------|
| `Onboarding.jsx` | Initial onboarding | AppEntry.jsx + Setup.jsx |
| `PinEntry.jsx` | PIN input | Integrated into ForemanView |
| `Login.jsx` | Login form | AppEntry.jsx |
| `MaterialsManager.jsx` | Materials CRUD | pricing/MaterialsSection.jsx |
| `DumpSiteManager.jsx` | Dump site CRUD | pricing/DumpSitesSection.jsx |
| `HaulOffForm.jsx` | Haul-off tracking | DisposalLoadInput.jsx |
| `AuthPage.jsx` | Auth page | AppEntry.jsx |
| `Field.jsx` | Field view | ForemanView.jsx |

---

## 6. Styles (`src/index.css`)

Single monolithic CSS file (~374KB). Organized by sections:

```css
/* ============================================
   TABLE OF CONTENTS
   ============================================
   1. CSS Variables & Theme
   2. Reset & Base Styles
   3. Layout Components
   4. Form Elements
   5. Buttons
   6. Cards
   7. Tables
   8. Modals
   9. Component-Specific Styles
      - Dashboard
      - Foreman View
      - T&M Form
      - COR Components
      - Signature Components
      - Reports
   10. Utilities
   11. Animations
   12. Print Styles
   ============================================ */
```

### Key CSS Variable Categories

```css
/* Light theme (default) */
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f8f9fa;
  --text-primary: #1a1a2e;
  --accent-blue: #3b82f6;
  /* ... */
}

/* Dark theme */
[data-theme="dark"] {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --text-primary: #e8e8e8;
  /* ... */
}
```

---

## 7. Component Relationships

### Dashboard Dependencies

```
Dashboard.jsx
├── imports TMList.jsx
│   └── opens TMForm.jsx (modal)
├── imports CORList.jsx
│   ├── opens CORForm.jsx (modal)
│   └── opens CORDetail.jsx (modal)
├── imports DailyReportsList.jsx
├── imports InjuryReportsList.jsx
├── imports MaterialRequestsList.jsx
├── imports ManDayCosts.jsx
├── imports BurnRateCard.jsx
├── imports CostContributorsCard.jsx
├── imports DisposalSummary.jsx
├── imports MembershipManager.jsx (Team tab)
├── imports ProjectTeam.jsx (Info tab)
└── imports BrandingSettings.jsx (Branding tab)
```

### ForemanView Dependencies

```
ForemanView.jsx
├── imports TMForm.jsx
├── imports CrewCheckin.jsx
├── imports DailyReport.jsx
├── imports InjuryReportForm.jsx
├── imports DisposalLoadInput.jsx
└── uses db from supabase.js
```

### COR Export Dependencies

```
CORDetail.jsx
└── imports { executeExport } from corExportPipeline.js
    ├── uses db from supabase.js (snapshots, jobs)
    ├── uses corPdfGenerator.js (PDF creation)
    └── uses corCalculations.js (totals)
```

### SignaturePage Dependencies

```
SignaturePage.jsx
├── imports { exportCORToPDF } from corPdfExport.js (LEGACY)
├── imports EnhancedSignatureCapture.jsx
└── uses db from supabase.js
```

---

## 8. Database Method Index

### Projects

```javascript
db.getProjects(companyId)
db.getProjectByPin(pin)
db.getProjectByPinAndCompany(pin, companyId)
db.getArchivedProjects(companyId)
db.createProject(data)
db.updateProject(id, data)
db.archiveProject(id)
```

### Areas

```javascript
db.getAreas(projectId)
db.createArea(data)
db.updateArea(id, data)
db.deleteArea(id)
```

### T&M Tickets

```javascript
db.getTMTickets(projectId)
db.getTMTicketsByStatus(projectId, status)
db.getTMTicketById(id)
db.createTMTicket(data)
db.updateTMTicket(id, data)
db.getPreviousTicketCrew(projectId, beforeDate)
db.saveTMClientSignature(ticketId, signatureData)
```

### Change Orders

```javascript
db.getChangeOrders(projectId)
db.getCORById(id)
db.getAssignableCORs(projectId)
db.getCORTickets(corId)
db.createChangeOrder(data)
db.updateChangeOrder(id, data)
db.assignTicketToCOR(ticketId, corId)
db.unassignTicketFromCOR(ticketId, corId)
```

### COR Export Pipeline

```javascript
db.requestCORExport(corId, idempotencyKey, options)
db.getExportJob(jobId)
db.getExportJobs(corId, limit)
db.updateExportJobStatus(jobId, status, details)
db.getCurrentCORSnapshot(corId)
db.saveCORSnapshot(snapshot, jobId)
```

### Users & Memberships

```javascript
db.getCompanyMembers(companyId)
db.getCompanyMemberships(userId)
db.getPendingMemberships(companyId)
db.approveMembership(membershipId, approverId, accessLevel, companyRole)
db.rejectMembership(membershipId)
db.updateMemberRole(membershipId, accessLevel, companyRole)
```

### Crew & Reports

```javascript
db.getCrewCheckins(projectId, date)
db.createCrewCheckin(data)
db.getDailyReports(projectId)
db.createDailyReport(data)
db.getInjuryReports(projectId)
db.createInjuryReport(data)
```

---

## 9. File Size Analysis

### Files Needing Refactor (>1000 lines)

| File | Lines | Priority | Suggested Action |
|------|-------|----------|------------------|
| `supabase.js` | 5,926 | **High** | Split by domain (projects, areas, tickets, cors, users) |
| `TMForm.jsx` | 2,353 | **High** | Split into step components |
| `Dashboard.jsx` | 1,965 | **Medium** | Extract tab content to components |
| `corPdfExport.js` | 1,522 | **Low** | Already deprecated, will be removed |
| `TMList.jsx` | 1,543 | **Medium** | Extract table/filter logic |
| `SignaturePage.jsx` | 1,265 | **Medium** | Split COR vs T&M handling |
| `CORForm.jsx` | 1,056 | **Medium** | Split into step components |

---

## 10. Quick Lookup

### "Where do I find...?"

| Looking For | Location |
|-------------|----------|
| Database queries | `src/lib/supabase.js` → `db.*` |
| PDF generation | `src/lib/corPdfGenerator.js` |
| Image compression | `src/lib/imageUtils.js` |
| Date formatting | `src/lib/utils.js` |
| COR math/totals | `src/lib/corCalculations.js` |
| Offline caching | `src/lib/offlineManager.js` |
| CSS variables | `src/index.css` (top of file) |
| RLS policies | `database/migration_*.sql` files |
| Component styles | `src/index.css` (search by component name) |

### "Which component handles...?"

| Feature | Component |
|---------|-----------|
| T&M ticket creation | `TMForm.jsx` |
| COR creation | `cor/CORForm.jsx` |
| COR viewing | `cor/CORDetail.jsx` |
| PDF export | `cor/CORDetail.jsx` → `corExportPipeline.js` |
| Team management | `MembershipManager.jsx` |
| Branding settings | `BrandingSettings.jsx` |
| Public signatures | `SignaturePage.jsx` |
| Field check-in | `CrewCheckin.jsx` |

---

*See also: [ARCHITECTURE.md](./ARCHITECTURE.md) for system design, [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) for conventions*
