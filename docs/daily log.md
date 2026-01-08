# FieldSync Development Log

**Last Updated:** January 8, 2025

---

## January 8, 2025

### Security Hardening & Code Cleanup (Major)

#### 1. Cryptographically Secure Random Generation
**Problem:** Multiple files used `Math.random()` for generating PINs, codes, tokens, and IDs. `Math.random()` is not cryptographically secure and could be predictable.

**Solution:** Replaced all `Math.random()` with `crypto.getRandomValues()`:

| File | Usage | Fix |
|------|-------|-----|
| `src/components/Setup.jsx` | PIN generation | Secure 4-digit PIN |
| `src/components/BrandingSettings.jsx` | Office code generation | Secure 6-char code |
| `src/lib/supabase.js` | Share tokens, file upload IDs | Secure random strings |
| `src/components/cor/TicketSelector.jsx` | Import IDs | Secure ID suffix |
| `src/components/TMForm.jsx` | Temp photo IDs | Secure ID generation |
| `src/lib/corPdfExport.js` | Document ID | Secure random suffix |
| `src/lib/offlineManager.js` | Temp ticket IDs | Secure ID generation |

#### 2. Dead Code Removal (~11,000 lines)
**Files Deleted:**
- `src/cli/` folder (~8,000 lines) - AI multi-agent system never used by web app
- `src/archived/` folder (~2,600 lines) - Old unused components
- `src/lib/AuthContext.jsx` (472 lines) - Never wired into App.jsx

**Dependencies Removed:**
- `uuid` package (unused after CLI removal)
- CLI npm scripts (`cli`, `cli:plan`, `cli:review`, `cli:test`, `cli:help`)

#### 3. AuthContext.jsx Replacement
**Problem:** `ShareModal.jsx` and `InjuryReportForm.jsx` imported `useAuth()` from `AuthContext.jsx`, but the AuthProvider was never wrapped around the app. This caused `user` to be undefined.

**Solution:**
- Modified `ShareModal.jsx` to accept `user` as a prop
- Modified `InjuryReportForm.jsx` to accept `user` as a prop
- Updated `Dashboard.jsx` to pass `user` to ShareModal and InjuryReportsList
- Updated `InjuryReportsList.jsx` to accept and pass `user` prop
- Deleted `AuthContext.jsx`

#### 4. Console.log Cleanup
**Removed:** 40+ `console.log` statements across 7 files:
- `src/lib/offlineManager.js` - 6 removed
- `src/lib/supabase.js` - 23 removed
- `src/App.jsx` - 6 removed
- `src/components/Dashboard.jsx` - 3 removed
- `src/components/TMForm.jsx` - 1 removed
- `src/lib/imageUtils.js` - 1 removed

**Kept:** 3 `console.log` in `src/lib/observability.js` - controlled by `import.meta.env.DEV` flag (only runs in development)

#### 5. Field Naming Consistency
**Verified:** `t_and_m_workers` and `t_and_m_items` naming is consistent across codebase.

**Fixed:** `TicketSelector.jsx` lines 336 and 350 were missing fallback patterns. Added `ticket.t_and_m_workers || ticket.workers` fallback for backward compatibility.

**Commits:**
- `f133eb8` - Remove unused CLI folder and archived components
- `6565618` - Security hardening and code cleanup

---

## January 7, 2025

### Open Issues Resolution

#### 1. Field User Photo Upload Fix (Storage RLS)
**Problem:** Field users (foremen) authenticate via PIN using the `anon` role, but storage bucket RLS policies only allowed `authenticated` role to upload photos. Foremen could not upload photos.

**Solution:** Created new migration `database/migration_field_photo_uploads.sql` adding `anon` role policies:
- INSERT policy with project validation
- UPDATE policy with project validation
- DELETE policy with project validation

**Files Created:**
- `database/migration_field_photo_uploads.sql`

#### 2. Real-time Subscriptions - Verified Working
**Finding:** Investigated all 11 real-time subscriptions across the codebase. All have proper cleanup, Dashboard uses 150ms debouncing, no memory leaks detected. No changes needed.

#### 3. Offline Support Enhancement (Major)
**Problem:** Only `UPDATE_AREA_STATUS` was using offline queuing. Other field operations would fail offline.

**Solution:** Extended offline queuing to cover all field operations:

**IndexedDB Updates (`src/lib/offlineManager.js`):**
- Bumped DB_VERSION to 2
- Added new stores: `TM_TICKETS`, `DAILY_REPORTS`, `MESSAGES`
- Added caching functions: `cacheTMTicket`, `getCachedTMTickets`, `cacheDailyReport`, `getCachedDailyReport`, `cacheMessage`, `getCachedMessages`
- Added `generateTempId()` for offline-created records

**Database Functions Updated (`src/lib/supabase.js`):**
- `createTMTicket()` - Now queues offline with temp ID, syncs when online
- `saveCrewCheckin()` - Now queues offline, caches locally
- `saveDailyReport()` - Now caches locally when offline
- `submitDailyReport()` - Now queues offline submission
- `sendMessage()` - Now queues offline with optimistic UI
- `createMaterialRequest()` - Now queues offline

**Pattern Used:**
1. Check `getConnectionStatus()` before network call
2. If offline → cache locally + queue action with temp ID
3. If network error → same as offline
4. If success → update cache with server response

---

### T&M Crew Picker Bug Fix
**Problem:** The "Select from Today's Crew" picker was using case-sensitive role matching. If crew check-in stored roles as `'foreman'` (lowercase), they wouldn't match `'Foreman'` and workers would incorrectly be added to Laborers instead of Supervision.

**Fix:** Changed role matching to case-insensitive using `.toLowerCase()` and `.includes()`:
- `role.includes('foreman')` instead of `role === 'Foreman'`
- `role.includes('supervisor')` or `role.includes('superintendent')` → Supervision
- `role.includes('operator')` → Operators
- All others → Laborers

**Files Modified:**
- `src/components/TMForm.jsx` (lines 1574-1620): Fixed crew picker role matching

---

### Labor Classes Routing (Office → Field)
**Problem:** Labor classes/categories set up in Pricing tab were not available to field users. CrewCheckin.jsx used hardcoded roles (Foreman, Laborer, Supervisor, Operator) instead of loading from database.

**Solution:** Connected labor classes data flow from office to field:

**1. CrewCheckin.jsx - Now loads labor classes from database:**
- Added `companyId` prop
- Loads labor classes via `getLaborClassesWithCategories(companyId)`
- Shows classes grouped by category in dropdown (no rates shown - just names)
- Stores `labor_class_id` with each worker
- Falls back to default roles if no custom classes configured

**2. ForemanView.jsx - Passes companyId to CrewCheckin:**
- Added `companyId={companyId}` prop to CrewCheckin component

**3. TMForm.jsx - Crew picker respects labor_class_id:**
- If worker has `labor_class_id`, adds to dynamic labor class section
- Otherwise falls back to legacy supervision/operators/laborers sections
- Checks both legacy and dynamic sections when detecting duplicates

**Data Flow:**
```
Office: Pricing Tab → labor_categories / labor_classes tables
                                    ↓
Field: CrewCheckin loads classes → Shows dropdown (names only, no rates)
                                    ↓
       Worker saved with labor_class_id
                                    ↓
       TMForm: "Select from Today's Crew" → Adds to correct labor class section
                                    ↓
       Ticket saved with labor_class_id → Rates applied server-side
```

**Security:** Field users only see class names, never rates. Rates are stored in `labor_class_rates` table and applied during billing calculations.

---

### Simplified Labor Rates UI (Scalability)
**Problem:** The rates modal was specific to demolition/abatement with 4 rate combinations (demolition+standard, demolition+pla, abatement+standard, abatement+pla). This doesn't scale for other company types.

**Solution:** Simplified to just 2 rate types:
- **Standard Rate** (Regular + OT)
- **Prevailing Wage** (Regular + OT)

**Files Modified:**
- `src/components/pricing/LaborRatesSection.jsx`:
  - Replaced `WORK_TYPES` and `JOB_TYPES` with single `RATE_TYPES` array
  - Simplified `openRatesModal`, `updateClassRate`, `saveClassRates` functions
  - Simplified rates modal UI

**Database Compatibility:** Uses `work_type: 'labor'` and `job_type: 'standard'|'prevailing'` to maintain compatibility with existing `labor_class_rates` table structure.

---

## January 4, 2025

### Industrial-Grade COR Export Pipeline (Major Architecture)
**Goal:** Transform COR PDF export from synchronous, fragile operation to an industrial-grade async pipeline with idempotency, snapshots, and failure recovery.

**Core Principles Implemented:**
1. **Idempotency** - Repeat export requests return same result via unique keys
2. **Deterministic Exports** - Same COR state = same output (snapshot-based)
3. **Async by Default** - Heavy operations don't block UI
4. **Fail Loudly** - Failures are detectable and recoverable
5. **Separation of Concerns** - Creation, aggregation, export decoupled

**New Database Schema:**

1. **`cor_export_jobs` table** - State machine for export tracking
   - States: `pending → generating → completed | failed`
   - Idempotency keys prevent duplicate exports
   - Retry support with error tracking
   - Metrics: photo count, ticket count, page count, generation time

2. **`change_orders` new columns:**
   - `version` - Auto-increments on meaningful changes
   - `last_snapshot_version` - Tracks when snapshot was taken
   - Pre-aggregated stats: `total_labor_hours`, `total_overtime_hours`, `ticket_count`, `photo_count`, `verified_ticket_count`

3. **Triggers:**
   - `trg_cor_version_increment` - Auto-increment version on COR changes
   - `trg_update_cor_stats` - Update aggregated stats on ticket/labor changes

4. **RPC Functions:**
   - `request_cor_export(cor_id, idempotency_key, options, requested_by)` - Idempotent export request
   - `update_export_job_status(job_id, status, ...)` - Update job with metrics/errors
   - `update_cor_aggregated_stats(cor_id)` - Recalculate pre-aggregated stats

**New Files Created:**

1. **`src/lib/corExportPipeline.js`** - Main orchestrator
   - `executeExport()` - Full pipeline: request job → create snapshot → generate PDF → update status
   - `requestExport()` - Idempotent job creation
   - `createSnapshot()` - Freeze COR data for deterministic export
   - Generates unique idempotency keys per COR version

2. **`src/lib/corPdfGenerator.js`** - PDF generation from snapshots
   - `generatePDFFromSnapshot()` - Never queries live data
   - `generateTicketPDFFromData()` - For individual T&M exports
   - Works only with frozen snapshot data

3. **`database/migration_cor_export_pipeline.sql`** - Complete migration
   - All tables, triggers, functions, RLS policies
   - Fully documented with comments

**Files Modified:**

1. **`src/lib/supabase.js`** - Added new database operations:
   - `requestCORExport()`, `getExportJob()`, `getExportJobs()`
   - `updateExportJobStatus()`, `getCurrentCORSnapshot()`, `saveCORSnapshot()`
   - `updateCORAggregatedStats()`

2. **`src/components/cor/CORDetail.jsx`** - Uses new pipeline:
   - Import `executeExport` from new pipeline
   - Shows "cached" indicator for instant re-downloads
   - Better error handling

3. **`src/lib/corPdfExport.js`** - Marked DEPRECATED
   - Added deprecation header
   - Still used by SignaturePage.jsx for backward compatibility
   - All new code should use corExportPipeline.js + corPdfGenerator.js

**Architecture Benefits:**
- Re-exporting same COR returns cached result instantly
- Snapshots ensure exports are reproducible
- Failed exports can be retried without data corruption
- Pre-aggregated stats make export summary instant
- Version tracking detects stale snapshots

---

### Client PDF Download After Signing
**Goal:** Allow clients to download a PDF copy of the COR/T&M ticket after signing for their records.

**Implementation:**
- Added download button to success overlay after signing (both COR and T&M)
- Created `exportTMTicketToPDF()` function for individual T&M ticket export
- Button appears in the "Signature Recorded Successfully!" overlay
- Uses legacy export functions for backward compatibility with SignaturePage

**Files Modified:**
- `src/components/SignaturePage.jsx` - Download buttons in success overlays
- `src/lib/corPdfExport.js` - Added `exportTMTicketToPDF()` function
- `src/index.css` - `.download-copy-btn` styling

---

### Scalability & Onboarding Documentation (Major)
**Goal:** Ensure new engineering team members can easily navigate the codebase and understand the architecture.

**Codebase Analysis Performed:**
- 40+ components totaling ~15,000 lines
- 12 library files totaling ~10,000 lines
- Identified 8 files over 1,000 lines needing refactor
- Found duplicate functionality (4 signature components)
- Found unused code (AuthContext.jsx not wired up)

**Documentation Created:**

1. **`docs/ARCHITECTURE.md`** - Complete system architecture
   - System overview with diagrams
   - Tech stack details
   - Application views and routing
   - Data flow patterns
   - Database layer with RLS
   - Real-time subscription patterns
   - Offline architecture
   - Authentication & authorization
   - PDF export pipeline
   - Key architectural decisions

2. **`docs/DEVELOPER_GUIDE.md`** - Onboarding guide
   - Getting started instructions
   - Project structure overview
   - Coding conventions (naming, structure, CSS)
   - Common patterns (data loading, forms, modals, toasts)
   - Do's and Don'ts
   - How-to guides for common tasks
   - Debugging tips
   - Known gotchas

3. **`docs/CODE_MAP.md`** - Complete file reference
   - File-by-file purpose and status
   - Component relationships and dependencies
   - Database method index
   - File size analysis with refactor priorities
   - Quick lookup tables

**Dead Code Cleanup:**
- Added deprecation notice to `src/lib/AuthContext.jsx` (not wired up)
- Added `README.md` to `src/archived/` explaining deprecated components
- Updated `corPdfExport.js` deprecation header (previous session)

**PROJECT_CONTEXT.md Updates:**
- Added Documentation Index with links to all docs
- Added Quick Start section for new engineers
- Updated Key Files Reference with status indicators
- Added Technical Debt section with prioritized refactor list
- Updated Risks section

**Files Created:**
- `docs/ARCHITECTURE.md` (~500 lines)
- `docs/DEVELOPER_GUIDE.md` (~600 lines)
- `docs/CODE_MAP.md` (~500 lines)
- `src/archived/README.md`

**Files Modified:**
- `docs/PROJECT_CONTEXT.md` - Documentation index, tech debt, key files
- `src/lib/AuthContext.jsx` - Deprecation notice

---

## January 1, 2025

### COR Creation UX Improvements (Major Enhancement)
**Goal:** Improve COR creation workflow for office staff - faster data entry, better organization, and editable COR numbers.

**Improvements Implemented:**

1. **Editable COR Numbers**
   - Added inline edit button (pencil icon) next to COR number in detail view
   - Click to edit, Enter to save, Escape to cancel
   - Only visible when COR is editable (draft, pending_approval, approved)
   - Auto-increment still works on creation, but numbers can be adjusted after

2. **Multi-Select COR Grouping**
   - Added "Select" button in COR list header to enter select mode
   - Checkboxes appear on each COR card when in select mode
   - Selection bar shows count and "Group Selected" button
   - Modal lets you enter a new group name or click existing group to reuse
   - Bulk update groups multiple CORs at once (no more editing each individually)
   - Added `bulkUpdateCORGroup()` function to database layer

3. **Quick Selection for Materials & Equipment**
   - Added quick select panel in COR form Steps 4 (Materials) and 5 (Equipment)
   - Search bar to filter items from company library
   - Category tabs (All, Containment, PPE, Disposal for materials)
   - Grid of clickable items showing name and cost per unit
   - One tap adds item with default pricing and quantity of 1
   - "Add Custom" button still available for manual entry of items not in library
   - Loads from existing `materials_equipment` table

4. **Subcontractors Display (Verified)**
   - Confirmed subcontractors already display on COR detail with company name, description, source, and amount
   - Already included in `getCORById` query

**Files Modified:**
- `src/components/cor/CORDetail.jsx` - Editable COR number with inline edit
- `src/components/cor/CORList.jsx` - Multi-select mode, checkboxes, group modal
- `src/components/cor/CORForm.jsx` - Quick select panels for materials/equipment
- `src/lib/supabase.js` - Added `bulkUpdateCORGroup()` function
- `src/index.css` - Styles for editable number, selection mode, quick select panel

---

### Dollar Input UX Consistency (Previous Session Carryover)
**Problem:** Dollar inputs across the project were using number inputs with step="0.01" which caused browser spinner issues and made data entry difficult.

**Solution:** Changed all money inputs to text inputs with `inputMode="decimal"` for better mobile experience and easier data entry:
- COR labor rates (regular and overtime)
- COR materials/equipment unit costs
- AddCostModal amount field
- MaterialsManager cost_per_unit
- DumpSiteManager rates
- Pricing section materials and dump sites

---

### Documentation Reorganization (User-Initiated)
User moved documentation files to `docs/` folder:
- `docs/daily log.md` (this file)
- `docs/PROJECT_CONTEXT.md`
- `docs/ONBOARDING_ARCHITECTURE.md`
- `docs/SCALABILITY_DIAGNOSTIC.md`
- `docs/COR_WORKFLOW_DIAGNOSTIC.md`

Deleted duplicate `project_context.md` (lowercase).

---

## December 31, 2024

### T&M Form Workflow Restructure (Major UX Overhaul)
**Goal:** Reorganize the T&M ticket creation workflow for better field efficiency and logical flow.

**New 5-Step Workflow:**
```
Step 1: Work Info → Step 2: Crew & Hours → Step 3: Materials → Step 4: Review → Step 5: Signature
```

**Key Changes:**

1. **Step 1: Work Info (NEW)**
   - Date and CE/PCO number
   - **Description of work (REQUIRED)** - moved to beginning
   - Photos - can be added early while on-site
   - COR assignment (optional)
   - Ensures context is captured first before crew entry

2. **Step 2: Crew & Hours (Dedicated)**
   - Focused solely on worker entry
   - Quick actions: "Same as Yesterday", "Set Crew Hours"
   - Inline time presets (8hr/10hr/4hr)
   - Running total banner with live feedback
   - Visual state indicators for complete/incomplete workers

3. **Step 3: Materials & Equipment**
   - **Quick search feature (NEW)** - search across all categories
   - Browse by category still available
   - Search results show category tags
   - Foremen no longer need to browse each tab

4. **Step 4: Review (Read-Only)**
   - Displays work description (read-only)
   - Shows photos (read-only)
   - COR assignment display
   - Worker summaries with hours
   - Materials list
   - Certification/name entry for submission

5. **Step 5: Success & Signature**
   - Submission confirmation
   - Client signature options (on-site or send link)

**Validation Changes:**
- Step 1: Description is now required (orange border if empty)
- Step 2: At least one worker with hours required

**Files Modified:**
- `src/components/TMForm.jsx` - Complete workflow restructure
- `src/index.css` - Search UI, description field, review display styles

---

### COR (Change Order Request) Fixes & Enhancements
**Goal:** Improve COR usability for office staff - easier data entry, editing flexibility, and organization.

**Fixes Implemented:**

1. **0% Markup Now Shows $0**
   - Fixed bug where 0% markup would default to 15%
   - Changed `||` to `??` operator in calculations
   - Now properly displays $0.00 when markup is set to 0%

2. **Subcontractors Now Saving Correctly**
   - Fixed `addBulkSubcontractorItems` to include `company_name` field
   - Changed from quantity × unit_cost to direct amount field
   - Subcontractor entries now properly saved and displayed

3. **COR Editing Before Billed**
   - Previously: Only draft CORs could be edited
   - Now: Draft, Pending Approval, and Approved CORs can be edited
   - Only billed/closed CORs are locked
   - Applies to both CORList and CORDetail views

4. **COR Grouping Feature (NEW)**
   - Added optional "Group Name" field to COR creation
   - Examples: "Phase 1", "Building A", "Week 12"
   - Group badge displays on COR cards (purple)
   - Filter dropdown to view CORs by group
   - Helps organize related change orders together

**Files Modified:**
- `src/lib/corCalculations.js` - Fixed 0% markup bug
- `src/lib/supabase.js` - Fixed subcontractor save function
- `src/components/cor/CORForm.jsx` - Added group_name field
- `src/components/cor/CORDetail.jsx` - Allow editing before billed, show group
- `src/components/cor/CORList.jsx` - Allow editing before billed, group filter
- `src/index.css` - Group badge and filter styles

---

### T&M Form UX Acceleration (Phase 2)
**Goal:** Further reduce clicks and improve visual feedback for field foremen entering T&M tickets.

**Implemented Features:**

1. **Inline Time Presets**
   - One-tap buttons for 8hr/10hr/4hr day presets
   - Applies to all named workers instantly
   - Located above worker sections for easy access

2. **Running Total Banner**
   - Live display of worker count and total hours
   - Warning indicator for workers needing hours
   - Green gradient when workers have valid hours

3. **Visual State Indicators**
   - Green border + checkmark for workers with complete hours
   - Orange border for workers with name but missing hours
   - Animated checkmark pop-in effect

4. **Notes/Photos Moved to Review Step**
   - Workers step now focused solely on crew data
   - Description and photos added at review step
   - Reduces cognitive load during data entry

5. **Enhanced Submit Button**
   - Three states: needs-name, ready, submitting
   - Pulsing green glow when ready to submit
   - Shimmer animation during submission
   - Spinner with progress text

**Files:** `src/components/TMForm.jsx`, `src/index.css`

---

### T&M Client Signature Workflow (Major Feature)
**Goal:** Enable field foremen to collect client signatures on T&M tickets before they go to the office.

**Workflow:**
```
Field creates T&M → Gets Client Signature → Ticket goes to Office
```

**Implemented Features:**

1. **Post-Submit Signature Step (Step 4)**
   - Success screen after T&M submission
   - Shows summary: worker count, total hours, work date
   - Two signature options presented

2. **On-Site Signing**
   - Client signs directly on foreman's phone/tablet
   - Captures: signature, name, title, company
   - `TMClientSignature` component with touch-friendly canvas
   - Saves signature data directly to T&M ticket
   - Updates ticket status to `client_signed`

3. **Remote Signing via Link**
   - Uses existing `SignatureLinkGenerator` component
   - Creates shareable signature request link
   - Client can sign later on their own device
   - Supports link expiration options

4. **Database Updates**
   - Added `saveTMClientSignature()` function
   - T&M ticket gets `client_signed` status after signature
   - Signature data stored: `client_signature_data`, `client_signature_name`, etc.

5. **Bilingual Support**
   - All new UI elements available in English and Spanish

**Files:**
- `src/components/TMForm.jsx` - Post-submit flow
- `src/components/TMClientSignature.jsx` - On-site signature capture
- `src/lib/supabase.js` - Database function
- `src/index.css` - Styling

---

## December 30, 2024

### Field User RLS Policies (Major Fix)
**Problem:** Field foremen authenticate via project PIN (not Supabase Auth), so `auth.uid()` is NULL. All existing RLS policies required authenticated users, causing 406 errors and blocking field access to most features.

**Solution:** Added comprehensive RLS policies for the `anon` role across all field-facing tables:
- `company_branding` - SELECT
- `crew_checkins` - SELECT, INSERT, UPDATE
- `projects`, `companies` - SELECT
- `areas` - SELECT, UPDATE
- `messages` - SELECT, INSERT, UPDATE
- `daily_reports`, `injury_reports` - SELECT, INSERT
- `material_requests` - SELECT, INSERT
- `disposal_loads` - SELECT, INSERT, UPDATE, DELETE
- `dump_sites` - SELECT
- `t_and_m_tickets`, `t_and_m_workers`, `t_and_m_items` - SELECT, INSERT
- `change_orders` - SELECT
- `change_order_ticket_associations` - SELECT, INSERT
- `change_order_labor/materials/equipment` - SELECT, INSERT
- `labor_rates`, `materials_equipment` - SELECT

**Files:** `supabase/migrations/20241230_field_cor_access.sql`

---

### Ticket-COR Junction Sync (Major Fix)
**Problem:** When T&M tickets were created with `assigned_cor_id`, no entry was created in the `change_order_ticket_associations` junction table. The COR detail view and PDF export query this junction table, so linked tickets never appeared.

**Solution:** Added reverse sync trigger `trg_sync_ticket_to_junction` that:
- Creates junction entry when `assigned_cor_id` is set (INSERT/UPDATE)
- Removes junction entry when `assigned_cor_id` is cleared
- Handles COR reassignment properly
- Cleans up on ticket DELETE
- Backfilled existing tickets missing junction entries

**Files:** `supabase/migrations/20241230_reverse_ticket_cor_sync.sql`

---

### Foreman UI Refactor
**Changes:**
- Converted Crew Check-in from inline component to action button card
- Converted Disposal Loads from inline component to action button card
- Both now open in full-screen views with back button and header
- Relabeled "Today's Crew" to "Crew Check-in"
- Added tab color differentiation: blue for Actions, green for Progress
- Removed deprecated Haul-Off feature (replaced by Disposal Loads)

**Files:** `src/components/ForemanView.jsx`, `src/index.css`

---

### Project Documentation
- Created `project context.md` with comprehensive project documentation
- Created `daily log.md` (this file) for tracking changes

---

### Testing & Deployment Safety (Late Session)

**RLS Policy Test Suite** (`supabase/tests/rls_policy_tests.sql`)
- Verifies RLS enabled on all critical tables
- Checks multi-tenant data isolation
- Validates anon/field policies exist
- Tests ticket-COR association integrity
- Detects overly permissive policies
- Run in Supabase SQL Editor to verify security

**Migration Workflow** (`docs/migration-workflow.md`)
- Supabase branching workflow for safe testing
- Pre/post deployment checklists
- Migration file template with verification
- Emergency rollback procedure

**Rollback Scripts** (`supabase/rollbacks/`)
- Created structure for rollback scripts
- Every migration should have a corresponding rollback

---

### RLS Security Fixes (Test Suite Results)

**Initial Test Run:** 48/52 passing

**Issues Found & Fixed:**
1. `daily_reports` - RLS not enabled → Fixed
2. `material_requests` - RLS not enabled → Fixed
3. `messages` - RLS not enabled → Fixed
4. 2 orphaned projects with NULL company_id → Deleted
5. `projects.company_id` had no NOT NULL constraint → Added

**Final Test Run:** 52/52 passing

**Database Constraints Added:**
- `projects.company_id` now NOT NULL (prevents orphaned projects)

---

### T&M Form UX Acceleration (Field Efficiency)
**Goal:** Reduce clicks per ticket from 50-60+ to ~15-20 for typical 8-worker crew.

**Implemented Features:**
1. **Auto-Calculate Hours from Time Range**
   - When start/end times entered, automatically calculates regular + OT hours
   - ≤8 hours = all regular, >8 hours = 8 regular + remainder as OT
   - Manual override still available

2. **Time Presets (Quick Buttons)**
   - "8hr Day" (7:00 AM - 3:30 PM)
   - "10hr Day" (6:00 AM - 4:30 PM) → 8 reg + 2 OT
   - "4hr Day" (Half Day)

3. **"Same as Yesterday" Crew Copy**
   - One-tap loads previous day's crew with names, roles, and hours
   - Uses `db.getPreviousTicketCrew()` to fetch most recent ticket

4. **Batch Hours Application**
   - "Set Crew Hours" modal applies same time/hours to all workers with names
   - Combines with presets for maximum efficiency

5. **Larger Touch Targets**
   - Remove buttons: 48×48px minimum
   - Time inputs with adequate padding (0.75rem)

**Files:** `src/components/TMForm.jsx`, `src/lib/supabase.js`, `src/index.css`

---

### Client PDF Download for COR Signing
**Problem:** Clients accessing the signature page could only download the COR PDF after both signatures were collected. They couldn't save a copy for their records before or during the signing process.

**Solution:**
- Moved PDF download button outside the `isFullySigned` conditional
- Clients can now download COR + T&M backup at any point:
  - Before signing (to review offline)
  - After their signature (before other party signs)
  - After fully signed
- Added "Awaiting Signature" indicator in PDF for unsigned slots
- Dynamic description text based on signature status

**Files:** `src/components/SignaturePage.jsx`, `src/lib/corPdfExport.js`

---

## December 29, 2024

### COR-Ticket Linking Fix (Office Side)
**Problem:** TMList.jsx was calling non-existent database functions, completely breaking office-side ticket-COR linking.

**Fix:**
- `db.getChangeOrders()` → `db.getAssignableCORs()`
- `db.associateTicketWithCOR(corId, ticketId)` → `db.assignTicketToCOR(ticketId, corId)`
- `db.removeTicketFromCOR(corId, ticketId)` → `db.unassignTicketFromCOR(ticketId, corId)`

**Files:** `src/components/TMList.jsx`

---

### COR Number Conflict Fix (409 Error)
**Problem:** `getNextCORNumber` was finding the most recently created COR instead of the highest numbered one, causing duplicate COR numbers and 409 conflicts.

**Fix:** Changed to scan ALL COR numbers and find actual maximum, plus added retry logic for conflict handling.

**Files:** `src/lib/supabase.js`

---

### COR Visibility Fix for Foremen
**Problem:** `getAssignableCORs` was excluding archived CORs but not filtering to only show actionable statuses.

**Fix:** Changed filter to `.in('status', ['draft', 'pending_approval', 'approved'])` - only shows CORs that can receive tickets.

**Files:** `src/lib/supabase.js`

---

### Atomic Ticket-COR Association
**Addition:** Created database functions for atomic ticket-COR operations:
- `assign_ticket_to_cor(ticket_id, cor_id)` - Atomic assignment
- `unassign_ticket_from_cor(ticket_id, cor_id)` - Atomic removal
- `check_ticket_cor_integrity()` - Find inconsistencies
- `fix_ticket_cor_integrity()` - Auto-fix issues
- Trigger `trg_sync_ticket_cor` - Keeps dual FK in sync

**Files:** `supabase/migrations/20241229_atomic_ticket_cor_association.sql`

---

### Disposal Loads Feature
**Addition:** New disposal/dump load tracking system:
- `disposal_loads` table with project, date, dump site, material type, weight, cost
- `dump_sites` table for managing dump locations
- Field UI for logging loads
- Office UI for viewing summaries

**Files:** `supabase/migrations/20241229_disposal_loads.sql`, `src/components/DisposalLoadInput.jsx`, `src/components/DisposalSummary.jsx`

---

## Known Issues / TODO

1. ~~**Photo uploads from field**~~ - ✅ FIXED (Jan 7, 2025) - Added `anon` role storage policies
2. ~~**Real-time subscriptions**~~ - ✅ VERIFIED WORKING (Jan 7, 2025) - All 11 subscriptions have proper cleanup
3. ~~**Offline support**~~ - ✅ ENHANCED (Jan 7, 2025) - Full offline queuing for T&M, crew check-ins, daily reports, messages, material requests

**Remaining:**
- Photo uploads may need testing in production to verify storage policies work correctly
- Consider adding automated tests for offline sync scenarios

---

## Quick Reference

### Running Locally
```bash
npm install
npm run dev
```

### Deploying
Push to GitHub → Vercel auto-deploys

### Database Migrations
Run SQL files in Supabase SQL Editor in order by date

### Key Files
- `src/components/ForemanView.jsx` - Field main interface
- `src/components/TMForm.jsx` - T&M ticket creation
- `src/components/cor/CORDetail.jsx` - COR detail view
- `src/lib/supabase.js` - All database operations
