# COR Workflow Diagnostic & Hardening Report

**Date:** January 2, 2025 (Updated from December 29, 2024)
**Scope:** T&M Tickets → COR Association → Office Visibility → Client-Facing Backup
**Severity:** CRITICAL - Revenue/Documentation Workflow

---

## Executive Summary

The T&M Ticket → COR workflow has been **significantly improved** since the initial diagnostic. Core functionality is now implemented, but several reliability and hardening issues remain that could undermine production use.

### Current Status Matrix

| Issue | Status | Notes |
|-------|--------|-------|
| COR Detail displays tickets/photos | ✅ FIXED | Backup Documentation section implemented (lines 533-707) |
| PDF export includes backup | ✅ FIXED | Passes associatedTickets to exportCORToPDF (line 206) |
| getCORById fetches full ticket data | ✅ FIXED | Includes workers, items, photos (lines 4023-4052) |
| Atomic association via RPC | ✅ IMPLEMENTED | Uses assign_ticket_to_cor RPC function |
| Field user RLS policies | ⚠️ NEEDS VERIFICATION | Defined in migration, may not be applied |
| COR import failures block submission | ❌ NOT FIXED | Warns but continues (lines 918-922) |
| Integrity check mechanism | ❌ NOT IMPLEMENTED | No desync detection |
| Photo upload failure handling | ⚠️ PARTIAL | Warns but saves partial |

---

## Phase 1: Research & Diagnostics

### 1.1 Workflow Mapping

#### T&M Ticket Creation (Field Side)

**Component:** `src/components/TMForm.jsx` (2162 lines)

**Flow:**
```
Step 1: Work Date → Step 2: Workers/Hours → Step 3: Materials → Step 4: Summary → Step 5: Success
                                                    ↓
                                          [Optional: Select COR]
```

**Key Functions:**
| Function | Location | Purpose |
|----------|----------|---------|
| `loadAssignableCORs()` | Lines 354-364 | Fetch CORs available for assignment (draft/pending/approved) |
| `handleSubmit()` | Lines 783-941 | Create ticket, workers, items, optionally import to COR |
| Photo upload | Lines 713-726 | Upload photos to Supabase storage |

**COR Selection:**
- Loaded on mount via `getAssignableCORs(projectId)`
- Filters: `status IN ('draft', 'pending_approval', 'approved')`
- Displayed in dropdown at submit step (lines 1189-1215)

#### COR Creation (Office Side)

**Component:** `src/components/cor/CORForm.jsx` (1055 lines)

**Simplified Form (Recently Refactored):**
- Single-screen with expandable sections
- Title required, all else optional
- Sections: Labor, Materials, Equipment, Subcontractors, Markups & Fees
- Import from T&M Tickets via TicketSelector modal

**Key Functions:**
| Function | Location | Purpose |
|----------|----------|---------|
| `buildPayload()` | Lines 365-384 | Construct database payload (excludes relation fields) |
| `handleSave()` | Lines 386-424 | Save as draft |
| `handleSubmit()` | Lines 427-474 | Validate and submit for approval |
| `handleTicketImport()` | Lines 346-360 | Import labor/materials from selected tickets |

#### Association Logic

**Two-Way Association Model:**

1. **Foreign Key:** `t_and_m_tickets.assigned_cor_id` → Direct link
2. **Junction Table:** `change_order_ticket_associations` → Audit trail

**Atomic RPC Functions (supabase.js):**
| Function | Line | Behavior |
|----------|------|----------|
| `assignTicketToCOR(ticketId, corId)` | 4544-4558 | Calls `assign_ticket_to_cor` RPC |
| `unassignTicketFromCOR(ticketId, corId)` | 4560-4572 | Calls `unassign_ticket_from_cor` RPC |
| `checkTicketCORIntegrity()` | 4575-4582 | Detects FK/junction mismatches |
| `fixTicketCORIntegrity()` | 4585-4592 | Syncs FK and junction |

**Data Flow:**
```
Field: createTMTicket(assigned_cor_id) → RPC: assign_ticket_to_cor
                                                    ↓
                                    Updates t_and_m_tickets.assigned_cor_id
                                    Inserts change_order_ticket_associations
                                                    ↓
                         importTicketDataToCOR() → Adds labor/material line items
                                                    ↓
                         Marks data_imported = true in junction table
```

#### Office Visibility

**COR Detail View:** `src/components/cor/CORDetail.jsx` (869 lines)

**Backup Documentation Section (Lines 533-707):**
- Displays when `change_order_ticket_associations.length > 0`
- Shows ticket date, CE/PCO number, workers, materials, photos
- Photos displayed in gallery with lightbox
- Client verification signatures shown if present

**Real-time Updates:**
```javascript
// Line 49-60
const subscription = db.subscribeToCorTickets?.(cor.id, () => {
  fetchFullCOR()  // Refetch when associations change
})
```

**PDF Export:**
```javascript
// Line 202-212
const handleExportPDF = async () => {
  await exportCORToPDF(corData, project, company, {}, associatedTickets)
}
```

### 1.2 Identified Failure Points

#### CRITICAL: COR Import Failures Are Non-Blocking

**Location:** `TMForm.jsx` lines 908-923

**Current Behavior:**
```javascript
if (selectedCorId) {
  try {
    await db.importTicketDataToCOR(...)
  } catch (importError) {
    console.error('Error importing to COR:', importError)
    onShowToast('T&M saved, but COR import failed', 'warning')  // ⚠️ Just a warning!
  }
}
```

**Problem:** Ticket is saved with `assigned_cor_id` set, but COR line items weren't created. The ticket appears linked to the COR in the UI, but COR totals don't include the ticket's data.

**Impact:**
- Office sees ticket in backup section
- COR totals are incorrect (missing imported data)
- User may not notice the warning toast
- No retry mechanism

#### HIGH: Field User RLS Policy Deployment Unknown

**Location:** `database/migration_complete_fixes.sql` lines 48-53

**Policy Defined:**
```sql
CREATE POLICY "Field users can view CORs by project"
ON change_orders FOR SELECT
TO anon
USING (true);

GRANT SELECT ON change_orders TO anon;
```

**Risk:** If this migration hasn't been applied in production, foremen will get 406 errors when trying to load assignable CORs. The error would manifest as:
- Empty COR dropdown in TMForm
- Console error: "406 Not Acceptable" on change_orders query
- No clear error message to user

**Verification Needed:** Check Supabase policies table for these RLS rules.

#### MEDIUM: Photo Upload Partial Failure Handling

**Location:** `TMForm.jsx` lines 713-726

**Current Behavior:**
```javascript
} catch (err) {
  console.error(`Photo ${idx + 1} upload failed:`, err)
  onShowToast(`Photo ${idx + 1} failed to upload`, 'error')
  return null  // Continue with other photos
}
```

**Problem:** Ticket is saved with partial photos. User sees error toast for each failed photo but may not track which photos are missing from the final backup.

#### MEDIUM: No Automated Integrity Monitoring

**Current State:**
- `checkTicketCORIntegrity()` function exists
- `fixTicketCORIntegrity()` function exists
- Neither is called automatically

**Risk:** Silent desync between FK and junction table could accumulate over time.

### 1.3 Root Cause Analysis

| Issue | Root Cause | Type |
|-------|------------|------|
| Import failure non-blocking | Defensive coding to avoid blocking ticket submission | Design Decision |
| RLS policies unknown state | Migration may not have been run in production | Deployment Gap |
| Partial photo handling | Fail-soft approach to maximize data saved | Design Decision |
| No integrity monitoring | Feature not prioritized | Missing Feature |

### 1.4 Confirmed Assumptions

1. **Data model is sound** - FK + junction table pattern is correct for audit trail
2. **Atomic RPC functions exist** - `assign_ticket_to_cor` handles both links atomically
3. **Backup section is implemented** - CORDetail shows full ticket data with photos
4. **PDF export includes backup** - associatedTickets passed to export function
5. **getCORById fetches complete data** - Includes workers, items, and nested relations

### 1.5 Open Questions

1. **Are RLS policies applied in production?**
   - Need to verify via Supabase dashboard or SQL query
   - Check if `anon` role has SELECT on `change_orders`

2. **Are RPC functions deployed?**
   - `assign_ticket_to_cor`
   - `unassign_ticket_from_cor`
   - `recalculate_cor_totals`

3. **What is the actual failure rate for COR imports?**
   - No observability currently
   - Need to add error tracking

4. **Are there existing desync records?**
   - Need to run `checkTicketCORIntegrity()` to assess

---

## Phase 2: Workflow Redesign (Conceptual)

### 2.1 Core Rules

| Rule | Current State | Target State |
|------|---------------|--------------|
| A T&M ticket may belong to zero or one COR | ✅ Enforced by schema | No change |
| CORs may accumulate many tickets over time | ✅ Supported | No change |
| COR value is derived from associated tickets | ⚠️ Only if import succeeds | Make import mandatory or add retry |
| Office-created CORs visible to foremen immediately | ⚠️ Depends on RLS | Verify RLS deployed |
| Foremen may only associate tickets to valid, active CORs | ✅ Filtered by status | No change |

### 2.2 Required UX Improvements

#### 2.2.1 Clear COR Selection UI (Field)

**Current:** Dropdown with COR#, title, status, total
**Improvement:** Add visual feedback when COR is selected:
- Show COR card with key details after selection
- Display current ticket count on COR
- Make it clear what happens on submit ("Will add to COR #X")

#### 2.2.2 Explicit Confirmation When Ticket is Linked

**Current:** Toast message on success
**Improvement:**
- Success screen should clearly state "Added to COR #X"
- Show import status (labor items added, materials added)
- If import failed, show retry button

#### 2.2.3 Immediate Visual Feedback (Office Side)

**Current:** Real-time subscription refreshes COR data
**Verification Needed:**
- Test with multiple browser sessions
- Ensure subscription fires on ticket association

#### 2.2.4 No Ambiguous States

**Current States:**
| State | Meaning | Visible To User? |
|-------|---------|------------------|
| Ticket saved, COR linked, import succeeded | Complete | ✅ Yes |
| Ticket saved, COR linked, import failed | Partial | ⚠️ Warning toast only |
| Ticket saved, no COR selected | Independent | ✅ Yes |

**Target:** Eliminate the "partial" state. Either:
- Make import mandatory (fail submission if import fails)
- Add explicit retry UI for failed imports

### 2.3 Proposed Workflow Changes

#### Option A: Fail-Fast Import (Recommended)

If COR import fails after ticket save:
1. Show clear error: "Could not add data to COR. Ticket saved but not linked."
2. Set `assigned_cor_id = null` (rollback the link)
3. Allow user to retry from TMList later

**Pros:** No inconsistent state
**Cons:** More friction for user if import fails

#### Option B: Queued Import with Retry

If COR import fails:
1. Save ticket with `assigned_cor_id` set
2. Create `pending_imports` record
3. Show: "Ticket saved. COR data sync pending - will retry automatically"
4. Background job retries import
5. Office sees "syncing" indicator

**Pros:** User always gets ticket saved
**Cons:** More complex infrastructure

#### Option C: Manual Retry (Minimal Change)

Keep current behavior but:
1. Add "Retry Import" button in TMList for tickets with failed imports
2. Store `import_failed_at` timestamp in junction table
3. Visual indicator in TMList for tickets needing retry

**Pros:** Minimal code change
**Cons:** Relies on user action

---

## Phase 3: Implementation Plan

### 3.1 Prerequisite: Verify Production State

**Before any code changes:**

```sql
-- Check if RLS policies exist for anon
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('change_orders', 'change_order_ticket_associations', 't_and_m_tickets')
AND 'anon' = ANY(roles);

-- Check if RPC functions exist
SELECT proname, prosrc
FROM pg_proc
WHERE proname IN ('assign_ticket_to_cor', 'unassign_ticket_from_cor', 'check_ticket_cor_integrity');

-- Check for existing desync
SELECT t.id AS ticket_id, t.assigned_cor_id, a.change_order_id
FROM t_and_m_tickets t
LEFT JOIN change_order_ticket_associations a ON a.ticket_id = t.id
WHERE t.assigned_cor_id IS NOT NULL
  AND (a.change_order_id IS NULL OR a.change_order_id != t.assigned_cor_id);
```

### 3.2 Implementation Sequence

#### Step 1: Apply Missing Migrations (If Needed)

**Goal:** Ensure production has all required schema and policies
**Risk:** LOW (additive changes)
**Files:** `database/migration_complete_fixes.sql`

**Go/No-Go:** Run verification queries above. If policies/functions missing, apply migration.

#### Step 2: Add Import Failure Handling (Option C - Manual Retry)

**Goal:** Make import failures recoverable without blocking submission
**Risk:** MEDIUM

**Backend Changes:**

a) Add `import_status` column to junction table:
```sql
ALTER TABLE change_order_ticket_associations
ADD COLUMN IF NOT EXISTS import_status TEXT DEFAULT 'pending'
  CHECK (import_status IN ('pending', 'completed', 'failed'));
```

b) Update `importTicketDataToCOR` to set status:
```javascript
// On success:
.update({ data_imported: true, import_status: 'completed', imported_at: ... })

// On failure (new):
.update({ import_status: 'failed', import_failed_at: ... })
```

**Frontend Changes:**

a) In TMForm, after import failure, update junction status:
```javascript
} catch (importError) {
  console.error('Error importing to COR:', importError)
  // Mark as failed in junction table
  await db.markImportFailed(ticket.id, selectedCorId)
  onShowToast('T&M saved. COR data sync failed - retry from office view', 'warning')
}
```

b) In TMList, show "Retry Import" button for failed imports:
```javascript
{ticket.import_status === 'failed' && (
  <button onClick={() => retryImport(ticket.id, ticket.assigned_cor_id)}>
    Retry COR Import
  </button>
)}
```

#### Step 3: Add Observability

**Goal:** Track import success/failure rates
**Risk:** LOW

**Changes:**
```javascript
// In supabase.js importTicketDataToCOR
observe.activity('cor_import_success', { ticket_id, cor_id, labor_count, material_count })

// In TMForm catch block
observe.error('cor_import_failed', { ticket_id, cor_id, error: importError.message })
```

#### Step 4: Add Integrity Check UI

**Goal:** Allow office admins to detect and fix desync
**Risk:** LOW

**Location:** Settings or Admin panel

```javascript
const handleCheckIntegrity = async () => {
  const issues = await db.checkTicketCORIntegrity()
  if (issues.length === 0) {
    onShowToast('All ticket-COR associations are consistent', 'success')
  } else {
    setIntegrityIssues(issues)  // Display in modal
  }
}

const handleFixIntegrity = async () => {
  await db.fixTicketCORIntegrity()
  onShowToast('Associations synchronized', 'success')
  setIntegrityIssues([])
}
```

### 3.3 Rollback Plan

**If Step 2 causes issues:**
1. Revert TMForm changes to original behavior (warn but continue)
2. Junction table column is additive, no removal needed
3. TMList changes can be reverted independently

**If migrations cause issues:**
1. RLS policies can be dropped individually
2. RPC functions can be dropped without affecting core data
3. No destructive changes to data

---

## Phase 4: Verification Checklist

### 4.1 Manual Test Scenarios

#### Scenario 1: Happy Path - New Ticket with COR

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Office creates COR #1 (draft) | COR visible in office |
| 2 | Foreman opens TMForm | COR #1 appears in dropdown |
| 3 | Foreman creates ticket, selects COR #1 | Ticket saved, import runs |
| 4 | Check COR #1 in office | Backup section shows ticket |
| 5 | Export PDF | Backup documentation included |

#### Scenario 2: Import Failure

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Simulate import failure (disconnect during import) | Warning toast shown |
| 2 | Check junction table | `import_status = 'failed'` |
| 3 | Ticket visible in TMList | "Retry Import" button shown |
| 4 | Click Retry Import | Import runs, success toast |
| 5 | Check COR | Data now appears |

#### Scenario 3: COR Not Visible to Foreman

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create COR with status 'billed' | COR saved |
| 2 | Foreman opens TMForm | COR NOT in dropdown |
| 3 | Create COR with status 'draft' | COR saved |
| 4 | Foreman opens TMForm | COR appears in dropdown |

#### Scenario 4: Real-time Office Updates

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Office opens COR #1 detail | Shows current tickets |
| 2 | Foreman submits ticket to COR #1 | - |
| 3 | Watch office COR detail | Ticket appears without refresh |

### 4.2 Regression Checks

- [ ] Existing T&M tickets still load correctly
- [ ] Existing CORs still display with all line items
- [ ] PDF export works for CORs with 0 tickets
- [ ] PDF export works for CORs with 10+ tickets
- [ ] Photos display correctly in backup section
- [ ] COR approval workflow unchanged
- [ ] Ticket locking on approved COR still works

### 4.3 Edge Cases

- [ ] Legacy tickets without `assigned_cor_id` (null)
- [ ] Tickets with `assigned_cor_id` but no junction record (desync)
- [ ] COR deleted while ticket still references it
- [ ] Very large tickets (50+ workers, 100+ materials)
- [ ] Photos that fail to load (broken URLs)
- [ ] User submits two tickets to same COR in quick succession

---

## Phase 5: Post-Deploy Monitoring

### 5.1 Metrics to Track

| Metric | Source | Threshold |
|--------|--------|-----------|
| COR import success rate | observability logs | > 99% |
| Import retry count | junction table query | < 5/day |
| Desync detection | integrity check | 0 |
| PDF export failures | error logs | < 1% |
| Field COR load errors | client error tracking | 0 |

### 5.2 Alert Conditions

- COR import failure rate > 5% in 1 hour
- Any 406 errors on change_orders for anon role
- Integrity check finds > 0 mismatches
- PDF export failure rate > 2% in 1 day

### 5.3 Rollback Triggers

| Condition | Action |
|-----------|--------|
| Import failure rate > 20% | Revert Step 2 changes |
| Field users cannot load CORs | Check RLS policies, drop if needed |
| COR totals incorrect after import | Investigate recalculate trigger |

---

## Summary & Design Guardrails

### Key Architectural Principles

1. **Dual association is intentional** - FK for queries, junction for audit
2. **RPC functions ensure atomicity** - Never update both directly
3. **Import failures must be recoverable** - Not silent, not blocking
4. **Field users (anon) need read access** - RLS policies must be applied
5. **COR totals are trigger-calculated** - Don't compute in application

### What Must Remain True

- T&M tickets are the source of truth for field work documentation
- CORs aggregate and price that work for client billing
- Photos in tickets serve as backup documentation
- PDF export produces client-ready documents with full backup
- Association between tickets and CORs is always consistent

### Open Action Items

1. **IMMEDIATE:** Verify RLS policies in production
2. **IMMEDIATE:** Run integrity check for existing desync
3. ~~**SHORT-TERM:** Implement import failure handling (Option C)~~ ✅ IMPLEMENTED
4. ~~**SHORT-TERM:** Add observability for import operations~~ ✅ IMPLEMENTED
5. **MEDIUM-TERM:** Add integrity check to admin UI
6. **FUTURE:** Consider background retry for failed imports

---

## Implementation Log (January 2, 2025)

### Changes Made

**1. Database Migration (`database/migration_import_status.sql`)**
- Added `import_status` column ('pending', 'completed', 'failed')
- Added `import_failed_at` timestamp
- Added `import_error` text for error messages
- Backfilled existing records: `data_imported=true` → `import_status='completed'`
- Added index for quick failed import queries
- Added RLS policy for field users to see association status

**2. Backend Functions (`src/lib/supabase.js`)**
- Updated `importTicketDataToCOR()` to set `import_status='completed'` on success
- Added observability: `observe.activity('cor_import_success', {...})`
- Added `markImportFailed(ticketId, corId, errorMessage)` function
- Added `getTicketsNeedingImport(projectId)` function
- Added `getTicketImportStatus(ticketId, corId)` function

**3. Field Form (`src/components/TMForm.jsx`)**
- On import failure: calls `markImportFailed()` to track the error
- Updated toast message: "T&M saved. COR data sync failed - retry from ticket list."

**4. Ticket List (`src/components/TMList.jsx`)**
- Added failed import tracking state
- Checks import status when loading tickets with COR assignments
- Shows "Import Failed" badge (red, pulsing) on affected tickets
- Added "Retry Sync" button with loading spinner
- `handleRetryImport()` calls `importTicketDataToCOR()` and refreshes on success

**5. Styles (`src/index.css`)**
- `.tm-import-failed-badge` - Red badge with pulse animation
- `.spin` animation for retry button spinner

### Files Modified
| File | Lines Changed |
|------|---------------|
| `database/migration_import_status.sql` | NEW (50 lines) |
| `src/lib/supabase.js` | +55 lines |
| `src/components/TMForm.jsx` | +8 lines |
| `src/components/TMList.jsx` | +45 lines |
| `src/index.css` | +35 lines |

### Deployment Steps

1. **Apply migration:**
   ```sql
   -- Run in Supabase SQL Editor
   -- Contents of database/migration_import_status.sql
   ```

2. **Deploy code:** Standard Vercel deployment

3. **Verify:**
   - Create T&M ticket with COR selected
   - Check junction table has `import_status='completed'`
   - Simulate failure (network disconnect during import)
   - Verify "Import Failed" badge appears
   - Click "Retry Sync", verify success

### Rollback Plan

If issues occur:
1. Frontend changes can be reverted independently
2. Migration columns are additive - no rollback needed
3. Old code will ignore new columns (backwards compatible)

---

*Document updated: January 2, 2025 - Implementation complete*
*Principal Software Architect diagnostic process*
