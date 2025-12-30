# COR Workflow Diagnostic & Hardening Report

**Date:** December 29, 2024
**Scope:** T&M Tickets → COR Association → Office Visibility → Client-Facing Backup
**Severity:** CRITICAL - Revenue/Documentation Workflow

---

## Executive Summary

The T&M Ticket → COR workflow has **significant gaps** that undermine its reliability as a revenue and documentation system. While the foundational data model is sound, several critical issues exist:

| Issue | Severity | Impact |
|-------|----------|--------|
| COR Detail doesn't display tickets/photos | CRITICAL | Office cannot see backup documentation |
| PDF export doesn't include backup | CRITICAL | Client receives incomplete COR packages |
| Dual association can desync | HIGH | Inconsistent ticket counts |
| Non-atomic writes | HIGH | Partial failure states possible |
| Photo upload failures silently continue | MEDIUM | Missing photos not detected |

---

## 1. Data Model Analysis

### 1.1 Schema Overview (SOUND)

The data model is well-designed with proper referential integrity:

```
┌─────────────────────────────────────────────────────────────────┐
│                         change_orders                            │
│  (id, cor_number, status, totals, signatures, ...)              │
└─────────────────────────────────────────────────────────────────┘
        │                    │                    │
        │ 1:N               │ 1:N               │ M:N
        ▼                    ▼                    ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────────────────┐
│ cor_labor    │   │ cor_materials│   │ cor_ticket_associations  │
│ (source_     │   │ (source_     │   │ (change_order_id,        │
│  ticket_id)  │   │  ticket_id)  │   │  ticket_id,              │
└──────────────┘   └──────────────┘   │  data_imported)          │
                                       └──────────────────────────┘
                                                 │
                                                 │ N:1
                                                 ▼
                                       ┌──────────────────────────┐
                                       │    t_and_m_tickets        │
                                       │  (assigned_cor_id,        │◄── Dual FK
                                       │   photos JSONB[],         │
                                       │   work_date, notes)       │
                                       └──────────────────────────┘
                                                 │
                                                 │ 1:N
                                       ┌─────────┴─────────┐
                                       ▼                   ▼
                              ┌──────────────┐   ┌──────────────┐
                              │ t_and_m_     │   │ t_and_m_     │
                              │ workers      │   │ items        │
                              └──────────────┘   └──────────────┘
```

**Strengths:**
- Proper foreign keys with ON DELETE CASCADE
- Line items track `source_ticket_id` for traceability
- Junction table allows M:N flexibility while UNIQUE constraint prevents duplicates
- Trigger-based total recalculation ensures consistency

**Weakness:**
- **Dual association pattern** (`assigned_cor_id` + junction table) creates sync risk

### 1.2 Photo Storage (ADEQUATE)

- **Bucket:** `tm-photos` (public read)
- **Path:** `{companyId}/{projectId}/{ticketId}/{timestamp}-{uuid}.{ext}`
- **DB Reference:** `t_and_m_tickets.photos` (JSONB array of URLs)

**RLS Policies:**
- Authenticated users can upload/update/delete
- Public can read (required for PDF generation, office view)

**Gap:** No ownership check on delete - any authenticated user can delete any photo.

---

## 2. Critical Gaps Identified

### 2.1 GAP: COR Detail Doesn't Display Tickets/Photos

**Location:** `src/components/cor/CORDetail.jsx`

**Problem:** The COR detail view shows line items (labor, materials, equipment, subcontractors) but **does not display**:
- Associated T&M tickets
- Ticket workers/materials details
- Ticket photos

**Evidence:**
```javascript
// CORDetail.jsx only renders these sections:
// - Scope of Work
// - Labor items
// - Materials items
// - Equipment items
// - Subcontractors
// - Signatures
// - NO "Backup Documentation" section
```

**Impact:** Office users cannot see the supporting documentation that justifies the COR charges.

---

### 2.2 GAP: PDF Export Doesn't Include Backup

**Location:** `src/lib/corPdfExport.js` and `src/components/cor/CORDetail.jsx`

**Problem:** The PDF export function **supports** backup documentation (lines 478-677), but it's **never passed** the ticket data.

**Evidence:**
```javascript
// corPdfExport.js line 49 - function signature
export async function exportCORToPDF(cor, project, company, branding = {}, tmTickets = null)

// CORDetail.jsx line 150 - actual call
await exportCORToPDF(corData, project, company)  // tmTickets NOT passed!
```

**Impact:** Client-facing COR PDFs contain no backup documentation - no tickets, no photos, no worker details.

---

### 2.3 GAP: Two Ticket Query Functions Return Different Data

**Location:** `src/lib/supabase.js`

**Problem:** Two functions exist to get tickets for a COR, querying different sources:

| Function | Query Source | Returns |
|----------|--------------|---------|
| `getCORTickets(corId)` (line 1204) | `t_and_m_tickets.assigned_cor_id` | Direct FK match |
| `getTicketsForCOR(corId)` (line 4518) | `change_order_ticket_associations` | Junction table match |

**If dual association becomes out of sync, these return different results.**

**Evidence:**
```javascript
// getCORTickets queries by direct FK
.eq('assigned_cor_id', corId)

// getTicketsForCOR queries junction table
.from('change_order_ticket_associations')
.eq('change_order_id', corId)
```

---

### 2.4 GAP: Non-Atomic Association Operations

**Location:** `src/lib/supabase.js` lines 4473-4516

**Problem:** `assignTicketToCOR()` and `unassignTicketFromCOR()` perform **two separate database operations** without transaction wrapping:

```javascript
async assignTicketToCOR(ticketId, corId) {
  // Operation 1: Insert into junction table
  const { data: assoc, error: assocError } = await supabase
    .from('change_order_ticket_associations')
    .insert({...})
  if (assocError) throw assocError  // If this succeeds...

  // Operation 2: Update ticket's assigned_cor_id
  const { error: ticketError } = await supabase
    .from('t_and_m_tickets')
    .update({ assigned_cor_id: corId })
    .eq('id', ticketId)
  if (ticketError) throw ticketError  // ...but this fails = INCONSISTENT STATE
}
```

**Impact:** Partial failures create inconsistent state where junction table and `assigned_cor_id` disagree.

---

### 2.5 GAP: COR Import Failures Silently Continue

**Location:** `src/components/TMForm.jsx` lines 788-793

**Problem:** When auto-importing ticket data to COR fails, the ticket is still saved with `assigned_cor_id` set:

```javascript
if (selectedCorId) {
  try {
    await db.importTicketDataToCOR(...)
  } catch (importError) {
    console.error('Error importing to COR:', importError)
    onShowToast('T&M saved, but COR import failed', 'warning')  // Just a warning!
  }
}
```

**Impact:** Ticket appears linked to COR, but COR line items weren't created. Office sees the ticket but COR totals don't include its data.

---

### 2.6 GAP: Photo Upload Partial Failure Handling

**Location:** `src/components/TMForm.jsx` lines 713-726

**Problem:** If some photos fail to upload, the ticket is still saved with partial photos:

```javascript
} catch (err) {
  console.error(`Photo ${idx + 1} upload failed:`, err)
  onShowToast(`Photo ${idx + 1} failed to upload`, 'error')
  return null  // Continue with other photos
}
// ...
if (photoUrls.length < photos.length && photoUrls.length > 0) {
  onShowToast(`${photoUrls.length}/${photos.length} photos uploaded`, 'warning')
}
```

**Impact:** Missing photos in backup documentation without clear record of what was lost.

---

### 2.7 GAP: getCORById Doesn't Fetch Full Ticket Data

**Location:** `src/lib/supabase.js` lines 3963-3987

**Problem:** `getCORById()` fetches ticket associations but only includes minimal ticket fields:

```javascript
change_order_ticket_associations (
  *,
  t_and_m_tickets (
    id, work_date, ce_pco_number, status, notes
    // MISSING: photos, t_and_m_workers, t_and_m_items
  )
)
```

**Impact:** Even if CORDetail tried to display backup, it wouldn't have the full data (workers, materials, photos).

---

## 3. Failure Mode Analysis

### Scenario Matrix

| Scenario | Probability | Blast Radius | Detection | Recovery |
|----------|-------------|--------------|-----------|----------|
| COR import fails | Medium | Single ticket's data missing from COR | Warning toast (easy to miss) | Re-import manually |
| Photo upload partial fail | Low | Some photos missing | Warning toast | Re-upload manually |
| Association desync | Low | Ticket counts incorrect | None | Manual DB fix |
| Orphaned photos | Low | Storage waste | None | Cleanup script |
| Client views incomplete PDF | HIGH | Every COR sent | None | Customer complaints |

### Most Critical Path

```
Foreman creates T&M ticket
    → Selects COR
    → Ticket saved with assigned_cor_id ✓
    → [COR import fails] ⚠️
    → Ticket appears linked
    → Office opens COR
    → NO backup section visible ❌
    → Exports PDF
    → NO backup in PDF ❌
    → Sends to client
    → Client cannot verify charges ❌
```

---

## 4. Remediation Plan

### Phase 1: Critical Fixes (Must Have)

#### 4.1.1 Add Backup Section to CORDetail

**Priority:** P0 (Blocking)

Add a "Backup Documentation" section to `CORDetail.jsx` that displays:
- All associated T&M tickets
- Ticket summary (date, workers, hours)
- Ticket photos in gallery view
- Drill-down to full ticket details

```jsx
{/* Backup Documentation Section */}
{corData.change_order_ticket_associations?.length > 0 && (
  <div className="cor-detail-section backup-section">
    <h3><FileText size={18} /> Backup Documentation</h3>
    <p>{corData.change_order_ticket_associations.length} T&M ticket(s)</p>
    {/* Render each ticket with photos */}
  </div>
)}
```

#### 4.1.2 Connect PDF Export to Ticket Data

**Priority:** P0 (Blocking)

Modify `CORDetail.jsx` to fetch full ticket data and pass to PDF export:

```javascript
const handleExportPDF = async () => {
  try {
    onShowToast?.('Generating PDF...', 'info')

    // Fetch full ticket data with photos
    const tickets = await db.getCORTickets(corData.id)

    await exportCORToPDF(corData, project, company, {}, tickets)
    onShowToast?.('PDF downloaded', 'success')
  } catch (error) {
    console.error('Error exporting PDF:', error)
    onShowToast?.('Error generating PDF', 'error')
  }
}
```

#### 4.1.3 Enhance getCORById to Include Full Ticket Data

**Priority:** P0 (Blocking)

```javascript
async getCORById(corId) {
  const { data, error } = await supabase
    .from('change_orders')
    .select(`
      *,
      areas (id, name),
      change_order_labor (*),
      change_order_materials (*),
      change_order_equipment (*),
      change_order_subcontractors (*),
      change_order_ticket_associations (
        *,
        t_and_m_tickets (
          *,
          photos,
          t_and_m_workers (*),
          t_and_m_items (
            *,
            materials_equipment (name, unit, cost_per_unit, category)
          )
        )
      )
    `)
    .eq('id', corId)
    .single()
  // ...
}
```

### Phase 2: Integrity Hardening

#### 4.2.1 Atomic Association via Database Function

**Priority:** P1 (Important)

Create a PostgreSQL function for atomic ticket-COR association:

```sql
CREATE OR REPLACE FUNCTION assign_ticket_to_cor(
  p_ticket_id UUID,
  p_cor_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert association
  INSERT INTO change_order_ticket_associations (change_order_id, ticket_id)
  VALUES (p_cor_id, p_ticket_id)
  ON CONFLICT DO NOTHING;

  -- Update ticket FK
  UPDATE t_and_m_tickets
  SET assigned_cor_id = p_cor_id
  WHERE id = p_ticket_id;

  -- Both or neither - transaction guarantees atomicity
END;
$$;
```

#### 4.2.2 Consolidate to Single Source of Truth

**Priority:** P1 (Important)

Deprecate `assigned_cor_id` FK and rely solely on junction table, OR:
- Create database trigger to keep them in sync automatically

```sql
CREATE OR REPLACE FUNCTION sync_ticket_cor_assignment()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE t_and_m_tickets
    SET assigned_cor_id = NEW.change_order_id
    WHERE id = NEW.ticket_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE t_and_m_tickets
    SET assigned_cor_id = NULL
    WHERE id = OLD.ticket_id
    AND assigned_cor_id = OLD.change_order_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_ticket_cor
AFTER INSERT OR DELETE ON change_order_ticket_associations
FOR EACH ROW EXECUTE FUNCTION sync_ticket_cor_assignment();
```

#### 4.2.3 Fail COR Import Errors Loudly

**Priority:** P1 (Important)

Instead of warning and continuing, block submission if COR import fails:

```javascript
if (selectedCorId) {
  setSubmitProgress('Importing to COR...')
  await db.importTicketDataToCOR(
    ticket.id,
    selectedCorId,
    companyId,
    project.work_type || 'demolition',
    project.job_type || 'standard'
  )
  // No try-catch - let it fail the whole submission
}
```

Or provide retry mechanism with clear failure state.

### Phase 3: Observability

#### 4.3.1 Log Ticket-COR Operations

Add observability for:
- Ticket creation with COR assignment
- Photo upload success/failure per photo
- COR import success/failure
- Association changes

```javascript
observe.activity('ticket_cor_assigned', {
  ticket_id: ticketId,
  cor_id: corId,
  company_id: companyId,
  project_id: projectId
})
```

#### 4.3.2 Integrity Check Job

Weekly background job to detect inconsistencies:

```sql
-- Find tickets where assigned_cor_id doesn't match junction table
SELECT t.id, t.assigned_cor_id, a.change_order_id
FROM t_and_m_tickets t
LEFT JOIN change_order_ticket_associations a ON a.ticket_id = t.id
WHERE t.assigned_cor_id IS NOT NULL
  AND (a.change_order_id IS NULL OR a.change_order_id != t.assigned_cor_id);

-- Find orphaned photos (in storage but not in any ticket.photos array)
-- Requires storage API enumeration + DB comparison
```

---

## 5. Implementation Priority

| Task | Phase | Est. Effort | Files |
|------|-------|-------------|-------|
| Add backup section to CORDetail | P0 | 2-3 hours | CORDetail.jsx |
| Connect PDF export to tickets | P0 | 1 hour | CORDetail.jsx |
| Enhance getCORById query | P0 | 30 min | supabase.js |
| Atomic association function | P1 | 1 hour | SQL migration |
| Sync trigger for dual FK | P1 | 1 hour | SQL migration |
| Fail loudly on import error | P1 | 30 min | TMForm.jsx |
| Add observability calls | P2 | 1 hour | Multiple files |
| Integrity check job | P2 | 2 hours | SQL + backend |

---

## 6. Acceptance Criteria

### COR Detail View
- [ ] Shows "Backup Documentation" section when tickets are associated
- [ ] Lists all associated T&M tickets with date, workers summary, hours
- [ ] Displays ticket photos in gallery format
- [ ] Clicking a ticket shows full details (workers, materials, notes)

### PDF Export
- [ ] Includes "T&M BACKUP DOCUMENTATION" section
- [ ] Lists each ticket with workers table, materials table
- [ ] Renders photos inline (3 per row)
- [ ] Photos render even when fetched from storage URLs

### Data Integrity
- [ ] `assigned_cor_id` and junction table always agree
- [ ] Failed COR imports either retry or block submission
- [ ] Photo upload failures are logged and visible

### Observability
- [ ] Ticket-COR operations logged to metrics
- [ ] Weekly integrity check runs (can be manual initially)

---

## 7. Risk Assessment

| Risk | Mitigation |
|------|------------|
| Large PDF with many photos | Limit photos per ticket, compress more aggressively |
| Slow ticket fetch for COR with many tickets | Add pagination, lazy load photos |
| Migration breaks existing associations | Run sync query before deploying trigger |
| Photo CORS issues in PDF | Verify public read policy, use proxy if needed |

---

## 8. Conclusion

The T&M → COR → Client workflow has critical gaps that must be addressed immediately:

1. **Office cannot see backup documentation** - CORDetail needs a Backup section
2. **Clients receive incomplete PDFs** - Export must include ticket data
3. **Data can become inconsistent** - Need atomic operations and sync triggers

The foundational architecture is sound. These are implementation gaps that can be fixed with targeted changes. Recommend addressing Phase 1 (P0) items immediately before any more CORs are sent to clients.

---

*Document generated by Principal Software Architect diagnostic process*
