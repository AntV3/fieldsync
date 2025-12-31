# FieldSync Development Log

**Last Updated:** December 30, 2024

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

1. **Photo uploads from field** - May need storage bucket RLS policies
2. **Real-time subscriptions** - Some components may not update live
3. **Offline support** - Service worker caches assets but not data

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
