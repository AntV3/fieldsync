# Claude CLI Prompt: Implement FieldSync COR (Change Order Request) System

## Context

You are implementing a comprehensive Change Order Request (COR) creation and management system for FieldSync, a construction project management application. FieldSync currently has T&M (Time & Materials) tickets that track labor, materials, and equipment used on projects. The COR system will aggregate these tickets into professional change order requests with full cost breakdowns, markup calculations, and digital signature capabilities.

**Reference Documents**:
- `/home/user/fieldsync/COR_SYSTEM_IMPLEMENTATION_PLAN.md` - Complete implementation plan
- Current database schema: `/home/user/fieldsync/database/schema.sql`
- T&M ticket components: `/home/user/fieldsync/src/components/TMForm.jsx`, `TMList.jsx`
- Database operations: `/home/user/fieldsync/src/lib/supabase.js`

## Target Output

The system should produce a professional pricing breakdown like this structure:

**Header Section:**
- Company name and branding
- Project info (name, job number, COR number)
- Scope of work and period

**Labor Section:**
- Labor Class | Wage Type | Hours | Per | Unit $ | Total
- Subtotal for labor

**Materials - Containment/Abatement Section:**
- Description | Quantity | Per | Unit $ | Total
- Subtotal for materials

**Equipment Section:**
- Description | Quantity | Per | Unit $ | Total
- Subtotal for equipment

**Subcontractors Section:**
- Description | Quantity | Per | Unit $ | Total
- Subtotal for subcontractors

**Markup Section:**
- Labor markup (15%) | Amount
- Material markup (15%) | Amount
- Equipment markup (15%) | Amount
- Subcontractor markup (5%) | Amount

**Additional Fees:**
- Liability Insurance (1.44%)
- Bond (1.00%)
- City of LA Business License Fee (0.101%)

**COR Total:** Final calculated amount

---

## Implementation Instructions

### PHASE 1: Database Schema & Migrations (START HERE)

**Task 1.1: Create COR database schema**

Create a new migration file `/home/user/fieldsync/database/migration_change_orders.sql` with the following tables:

1. **change_orders** - Main COR table with:
   - Basic info fields (id, company_id, project_id, cor_number, title, description, scope_of_work, period_start, period_end)
   - Optional area_id for work area association
   - Status workflow (draft, pending_approval, approved, rejected, billed, closed)
   - Cost breakdown fields (all in cents/integers to avoid decimal issues):
     - labor_subtotal, materials_subtotal, equipment_subtotal, subcontractors_subtotal
   - Markup percentages (stored as basis points: 1500 = 15.00%):
     - labor_markup_percent, materials_markup_percent, equipment_markup_percent, subcontractors_markup_percent
   - Markup amounts (calculated):
     - labor_markup_amount, materials_markup_amount, equipment_markup_amount, subcontractors_markup_amount
   - Additional fee percentages and amounts:
     - liability_insurance_percent/amount, bond_percent/amount, license_fee_percent/amount
   - Totals: cor_subtotal, additional_fees_total, cor_total
   - Signature fields: gc_signature_data, gc_signature_name, gc_signature_date
   - Audit fields: created_by, created_at, updated_at, submitted_at, approved_by, approved_at
   - Unique constraint on (company_id, project_id, cor_number)

2. **change_order_labor** - Labor line items with:
   - labor_class, wage_type, regular_hours, overtime_hours
   - regular_rate, overtime_rate (in cents)
   - regular_total, overtime_total, total (in cents)
   - sort_order for display ordering

3. **change_order_materials** - Material line items with:
   - description, quantity, unit, unit_cost, total
   - source_type (backup_sheet, invoice, mobilization, custom)
   - source_reference
   - sort_order

4. **change_order_equipment** - Equipment line items with:
   - description, quantity, unit, unit_cost, total
   - source_type (backup_sheet, invoice, custom)
   - source_reference
   - sort_order

5. **change_order_subcontractors** - Subcontractor line items with:
   - description, quantity, unit, unit_cost, total
   - source_type (invoice, quote, custom)
   - source_reference
   - sort_order

6. **change_order_ticket_associations** - Links T&M tickets to CORs:
   - change_order_id, ticket_id
   - data_imported (boolean), imported_at
   - Unique constraint on (change_order_id, ticket_id)

**Task 1.2: Add COR reference to t_and_m_tickets**

Add column: `assigned_cor_id UUID REFERENCES change_orders(id) ON DELETE SET NULL`

**Task 1.3: Create database functions**

Create a PostgreSQL function `recalculate_cor_totals(cor_id UUID)` that:
1. Sums all labor, materials, equipment, and subcontractor line items
2. Calculates markups based on percentages
3. Calculates additional fees based on percentages
4. Updates the change_orders table with all calculated values

Create triggers on all line item tables to auto-recalculate when items are added/updated/deleted.

**Task 1.4: Add RLS policies**

Add Row Level Security policies for:
- Users can view CORs from their company
- Office and Admin can create CORs
- Office and Admin can update draft/pending CORs
- Only Admin can delete CORs

**Task 1.5: Apply migration**

Run the migration in Supabase SQL editor and verify all tables are created correctly.

---

### PHASE 2: Core Data Layer

**Task 2.1: Add COR CRUD operations to `/home/user/fieldsync/src/lib/supabase.js`**

Implement the following functions (add to the `export const db = {}` object):

```javascript
// ============================================
// Change Orders
// ============================================

async createCOR(corData) {
  // Create a new COR with default markup and fee percentages
  // Return the created COR with id
}

async updateCOR(corId, updates) {
  // Update COR fields (not line items)
  // Return updated COR
}

async deleteCOR(corId) {
  // Delete COR (cascade deletes line items and associations)
}

async getCORs(projectId, filters = {}) {
  // Get all CORs for a project
  // Optional filters: status, area_id, date_range
  // Include basic stats (line item counts, totals)
  // Order by created_at desc
}

async getCORById(corId) {
  // Get single COR with all line items
  // Include: labor items, material items, equipment items, subcontractor items
  // Include associated ticket info
}

async getCORsByArea(projectId, areaId) {
  // Get all CORs for a specific work area
}

async getNextCORNumber(projectId) {
  // Get next available COR number for project
  // Format: "COR #1", "COR #2", etc.
}

// ============================================
// COR Line Items
// ============================================

async addCORLaborItem(corId, laborItem) {
  // Add a labor line item
  // Auto-recalculate via trigger
}

async updateCORLaborItem(itemId, updates) {
  // Update labor item
}

async deleteCORLaborItem(itemId) {
  // Delete labor item
}

// Similar functions for materials, equipment, and subcontractors:
// addCORMaterialItem, updateCORMaterialItem, deleteCORMaterialItem
// addCOREquipmentItem, updateCOREquipmentItem, deleteCOREquipmentItem
// addCORSubcontractorItem, updateCORSubcontractorItem, deleteCORSubcontractorItem

// ============================================
// Bulk Line Item Operations
// ============================================

async addBulkLaborItems(corId, laborItems) {
  // Add multiple labor items at once
}

async addBulkMaterialItems(corId, materialItems) {
  // Add multiple material items at once
}

// Similar for equipment and subcontractors

// ============================================
// Ticket-COR Associations
// ============================================

async assignTicketToCOR(ticketId, corId) {
  // Create association between ticket and COR
  // Update t_and_m_tickets.assigned_cor_id
}

async unassignTicketFromCOR(ticketId) {
  // Remove ticket from COR
  // Set t_and_m_tickets.assigned_cor_id to null
}

async getTicketsForCOR(corId) {
  // Get all tickets assigned to a COR
  // Include full ticket details with workers and items
}

async importTicketDataToCOR(ticketId, corId) {
  // Import labor, materials, and equipment from ticket into COR
  // 1. Get ticket with workers and items
  // 2. Group workers by role, sum hours
  // 3. Get labor rates from labor_rates table
  // 4. Create labor line items
  // 5. Get materials/equipment from t_and_m_items
  // 6. Get costs from materials_equipment table
  // 7. Create material/equipment line items
  // 8. Mark association as data_imported = true
}

async reimportTicketDataToCOR(ticketId, corId) {
  // Delete existing line items from this ticket
  // Re-import fresh data
}

// ============================================
// COR Calculations
// ============================================

async recalculateCOR(corId) {
  // Manually trigger recalculation
  // Useful after bulk updates
  // Calls the database function recalculate_cor_totals
}

async updateCORMarkupPercentages(corId, percentages) {
  // Update markup percentages
  // percentages = { labor, materials, equipment, subcontractors }
  // Trigger recalculation
}

async updateCORFeePercentages(corId, percentages) {
  // Update fee percentages
  // percentages = { liabilityInsurance, bond, licenseFee }
  // Trigger recalculation
}

// ============================================
// COR Status & Workflow
// ============================================

async submitCORForApproval(corId) {
  // Change status to 'pending_approval'
  // Set submitted_at timestamp
}

async approveCOR(corId, userId) {
  // Change status to 'approved'
  // Set approved_by and approved_at
}

async rejectCOR(corId, reason) {
  // Change status to 'rejected'
  // Optional: store rejection reason
}

async saveCORSignature(corId, signatureData, signerName) {
  // Save GC signature
  // signatureData is base64 image string
  // Set gc_signature_data, gc_signature_name, gc_signature_date
}

// ============================================
// COR Stats & Analytics
// ============================================

async getCORStats(projectId) {
  // Get summary stats for project
  // Return: total_cors, draft_count, pending_count, approved_count
  //         total_approved_value, total_pending_value
}
```

**Task 2.2: Create `/home/user/fieldsync/src/lib/corCalculations.js`**

Create utility functions for client-side calculations:

```javascript
// Helper to convert cents to dollars
export const centsToDollars = (cents) => (cents / 100).toFixed(2)

// Helper to convert dollars to cents
export const dollarsToCents = (dollars) => Math.round(dollars * 100)

// Helper to convert basis points to percentage
export const basisPointsToPercent = (bp) => (bp / 100).toFixed(2)

// Helper to convert percentage to basis points
export const percentToBasisPoints = (pct) => Math.round(pct * 100)

// Calculate labor item total
export const calculateLaborItemTotal = (regularHours, overtimeHours, regularRate, overtimeRate) => {
  const regularTotal = Math.round(regularHours * regularRate)
  const overtimeTotal = Math.round(overtimeHours * overtimeRate)
  return {
    regularTotal,
    overtimeTotal,
    total: regularTotal + overtimeTotal
  }
}

// Calculate line item total
export const calculateLineItemTotal = (quantity, unitCost) => {
  return Math.round(quantity * unitCost)
}

// Calculate markup amount
export const calculateMarkup = (subtotal, markupBasisPoints) => {
  return Math.round((subtotal * markupBasisPoints) / 10000)
}

// Calculate complete COR totals
export const calculateCORTotals = (cor) => {
  // Extract all line items and calculate totals
  // Return complete breakdown object
}

// Validate COR before submission
export const validateCOR = (cor) => {
  // Check for required fields
  // Check that totals make sense
  // Return { valid: boolean, errors: [] }
}
```

---

### PHASE 3: COR List Component

**Task 3.1: Create `/home/user/fieldsync/src/components/cor/CORList.jsx`**

Create a component that:
1. Displays all CORs for a project in a table/card layout
2. Shows: COR number, title, status, area (if any), period, total amount, created date
3. Includes filters: status dropdown, area dropdown, date range picker
4. Shows quick stats at top: Total CORs, Draft, Pending Approval, Approved, Total $ Approved
5. Has "Create New COR" button (opens CORForm)
6. Each COR row has actions: View, Edit (if draft), Delete (if draft), Export PDF
7. Clicking a row opens COR detail view
8. Use color-coded status badges (gray=draft, yellow=pending, green=approved, red=rejected)
9. Mobile responsive - cards on mobile, table on desktop

**Task 3.2: Add CORs tab to project view**

In the project view component (likely `/home/user/fieldsync/src/components/ProjectView.jsx` or similar):
1. Add a "CORs" tab next to existing tabs (T&M Tickets, Daily Reports, etc.)
2. Render `<CORList>` component in that tab
3. Pass project info as props

---

### PHASE 4: COR Form Wizard (Multi-Step)

**Task 4.1: Create `/home/user/fieldsync/src/components/cor/CORForm.jsx`**

Main wizard container with:
- Step indicator (1 of 9)
- Previous/Next navigation
- Save as Draft button (available on all steps)
- Progress saved to localStorage for draft CORs
- Validation before proceeding to next step

**Task 4.2: Create Step Components**

Create individual step components in `/home/user/fieldsync/src/components/cor/CORFormSteps/`:

**Step1_BasicInfo.jsx**
- Title (text input, required)
- Description (textarea)
- Scope of Work (textarea, required)
- Period Start Date (date picker, required)
- Period End Date (date picker, required)
- Work Area (dropdown, optional - load from areas table)
- COR Number (auto-generated, display only)

**Step2_Tickets.jsx**
- Display all available T&M tickets for project
- Filter options: status, date range, CE/PCO number, already assigned
- Checkbox to select multiple tickets
- "Select All" / "Deselect All" buttons
- Preview panel showing:
  - Selected ticket count
  - Date range of selected tickets
  - Quick preview of labor hours, material items, equipment items
- Note: "Ticket data will be imported in the next steps"

**Step3_Labor.jsx**
- Display table of labor line items (auto-populated from selected tickets if any)
- Columns: Labor Class, Wage Type, Regular Hours, OT Hours, Regular Rate, OT Rate, Total
- Group workers by role and sum hours
- Editable cells (inline editing)
- "Add Row" button for custom labor
- "Delete Row" button for each row
- Real-time subtotal calculation displayed at bottom
- Labor rates should default from `labor_rates` table based on project's work_type and job_type

**Step4_Materials.jsx**
- Display table of material line items
- Columns: Description, Quantity, Unit, Unit Cost, Total, Source Type, Source Reference
- Auto-populated from selected tickets' t_and_m_items (filter by category: Containment, PPE, Disposal, etc.)
- Editable cells
- "Add Row" button
- "Delete Row" button
- Category grouping (optional)
- Real-time subtotal calculation

**Step5_Equipment.jsx**
- Similar to materials
- Columns: Description, Quantity, Unit, Unit Cost, Total, Source Type, Source Reference
- Auto-populated from tickets
- Editable
- Real-time subtotal

**Step6_Subcontractors.jsx**
- Table for subcontractor line items
- Columns: Description, Quantity, Unit, Unit Cost, Total, Source Type, Source Reference
- Manual entry (not auto-populated from tickets)
- "Add Row" / "Delete Row"
- Real-time subtotal

**Step7_Markup.jsx**
- Display current subtotals for: Labor, Materials, Equipment, Subcontractors
- Input fields for markup percentages:
  - Labor Markup % (default 15.00%)
  - Materials Markup % (default 15.00%)
  - Equipment Markup % (default 15.00%)
  - Subcontractors Markup % (default 5.00%)
- Real-time calculation showing:
  - Subtotal × Markup % = Markup Amount
- Display new subtotals including markup

**Step8_Fees.jsx**
- Display COR subtotal (with markups)
- Input fields for additional fee percentages:
  - Liability Insurance % (default 1.44%)
  - Bond % (default 1.00%)
  - License Fee % (default 0.101%)
- Real-time calculation showing:
  - COR Subtotal × Fee % = Fee Amount
- Display total additional fees

**Step9_Review.jsx**
- Display complete pricing breakdown (use shared `CORPricingBreakdown` component)
- Show all sections: Labor, Materials, Equipment, Subcontractors, Markups, Fees, Total
- Validation checks:
  - All required fields filled
  - At least one line item in labor or materials or equipment or subcontractors
  - Total > 0
- Action buttons:
  - "Back to Edit" (go to specific step)
  - "Save as Draft" (save with status='draft')
  - "Submit for Approval" (save with status='pending_approval')

**Task 4.3: Form State Management**

Use React state or a form library (like `react-hook-form`) to manage:
- All COR fields
- All line items (arrays)
- Current step
- Validation errors
- Save draft to localStorage on each step change
- Load draft if returning to incomplete COR

---

### PHASE 5: COR Detail & Pricing Breakdown Display

**Task 5.1: Create `/home/user/fieldsync/src/components/cor/CORDetail.jsx`**

Component to view a single COR:
- Header with COR number, title, status badge
- Basic info section (scope, period, area)
- Full pricing breakdown (use shared component)
- Associated tickets list (with links to ticket details)
- Action buttons based on status:
  - Draft: Edit, Delete, Submit for Approval
  - Pending Approval: Approve, Reject, Edit, Request Signature
  - Approved: Export PDF, View Signature (if signed)
- Activity log (who created, submitted, approved, when)

**Task 5.2: Create `/home/user/fieldsync/src/components/cor/CORPricingBreakdown.jsx`**

Reusable component that displays the pricing table matching the reference image format:

Sections:
1. **Header**: Company name, Project info, COR number, Scope, Period
2. **Labor Table**:
   - Columns: Labor Class | Wage Type | Hours | Per | Unit $ | Total
   - Show regular and OT hours combined or separate rows
   - Subtotal row
3. **Materials Table**:
   - Title: "Materials - Containment / Abatement"
   - Columns: Description | Quantity | Per | Unit $ | Total
   - Subtotal row
4. **Equipment Table**:
   - Same format as materials
   - Subtotal row
5. **Subcontractors Table**:
   - Same format
   - Subtotal row
6. **Markup Section**:
   - Rows for each category with percentage and amount
   - Example: "Labor | 15.00% | $1,316.30"
7. **Additional Fees Section**:
   - Liability Insurance, Bond, License Fee (if > 0)
8. **COR Subtotal**: Bold row
9. **COR Total**: Bold, large, prominent

Styling:
- Clean table layout with borders
- Alternating row colors for readability
- Bold subtotals
- Currency formatting ($X,XXX.XX)
- Responsive (stack on mobile)
- Print-friendly CSS

---

### PHASE 6: Ticket-COR Association Features

**Task 6.1: Add COR assignment to T&M form**

In `/home/user/fieldsync/src/components/TMForm.jsx`:
- Add a dropdown field "Assign to COR" (optional)
- Load available CORs for the project (status: draft or pending_approval)
- Display as: "COR #1 - Title" in dropdown
- Save selection to `t_and_m_tickets.assigned_cor_id` when creating ticket
- If CE/PCO number is entered, auto-suggest CORs with matching numbers

**Task 6.2: Create `/home/user/fieldsync/src/components/cor/TicketCORAssignment.jsx`**

Bulk assignment interface:
- Left panel: List of unassigned tickets (or all tickets)
- Right panel: List of CORs
- Drag and drop tickets to CORs
- Or checkbox select + "Assign to COR" dropdown
- Visual indicators: tickets already assigned show badge with COR number
- "Import Data" button for each assigned ticket (imports labor/materials into COR)

**Task 6.3: Update TMList.jsx**

In `/home/user/fieldsync/src/components/TMList.jsx`:
- Add filter: "Filter by COR" dropdown
- Show COR number badge on tickets that are assigned
- Add bulk action: "Assign Selected to COR"

---

### PHASE 7: GC Signature Feature

**Task 7.1: Install signature library**

Add to package.json:
```bash
npm install react-signature-canvas
```

**Task 7.2: Create `/home/user/fieldsync/src/components/cor/CORSignature.jsx`**

Component with:
- Canvas signature pad (using react-signature-canvas)
- "Clear" button to reset signature
- "Save Signature" button
- Input field for signer name
- Preview of signature
- On save: convert canvas to base64 image, call `saveCORSignature()`
- Modal or full-page view

**Task 7.3: Signature workflow**

In CORDetail.jsx:
- If status is 'pending_approval', show "Request Signature" button
- Opens CORSignature modal
- After signature saved, display signature image in detail view
- Lock COR after signature (change status to 'approved')
- Show signature with name and date in pricing breakdown

---

### PHASE 8: PDF Export

**Task 8.1: Create `/home/user/fieldsync/src/components/cor/CORExport.jsx`**

Utility functions for PDF generation (use existing jsPDF and jspdf-autotable):

```javascript
export const generateCORPDF = async (cor, project, company, branding) => {
  // Initialize jsPDF
  // Add company logo and branding colors
  // Add header section with project info
  // Add labor table using autoTable
  // Add materials table
  // Add equipment table
  // Add subcontractors table
  // Add markup section
  // Add fees section
  // Add totals section
  // If signature exists, embed signature image
  // Add footer with date completed
  // Return PDF blob or download directly
}
```

**Task 8.2: Add export button**

In CORDetail.jsx:
- "Export PDF" button
- Click triggers `generateCORPDF()`
- Downloads PDF file named: `{Project Name} - {COR Number}.pdf`

---

### PHASE 9: Accessibility & Polish

**Task 9.1: Accessibility audit**

For all form components:
- Ensure every input has a `<label>` with `htmlFor` matching input `id`
- Add `aria-label` to icon buttons
- Add `aria-describedby` for error messages
- Ensure keyboard navigation works (Tab, Enter, Esc)
- Test with screen reader
- Add skip links
- Ensure color contrast meets WCAG AA standards

**Task 9.2: Form validation**

- Add client-side validation for all required fields
- Display error messages inline
- Prevent submission if validation fails
- Clear, helpful error messages

**Task 9.3: Loading states**

- Show skeleton loaders while fetching CORs
- Disable buttons during save operations
- Show spinner on "Submit for Approval" button

**Task 9.4: Toast notifications**

- Success toast after creating COR
- Success toast after saving changes
- Error toast if save fails
- Info toast when importing ticket data

**Task 9.5: Confirmation dialogs**

- Confirm before deleting COR
- Confirm before removing line item
- Confirm before submitting for approval (one-way action)

**Task 9.6: Mobile responsiveness**

- Test on mobile device
- Ensure tables become scrollable or card-based on small screens
- Large touch targets (min 44x44px)
- Mobile-friendly date pickers

---

### PHASE 10: Testing & Deployment

**Task 10.1: Manual testing checklist**

Test the following scenarios:
- [ ] Create COR from scratch (no tickets)
- [ ] Create COR by importing T&M tickets
- [ ] Edit COR in draft status
- [ ] Add/remove line items
- [ ] Adjust markup percentages → verify calculations
- [ ] Adjust fee percentages → verify calculations
- [ ] Submit COR for approval
- [ ] Approve COR
- [ ] Reject COR
- [ ] Assign ticket to COR during ticket creation
- [ ] Bulk assign tickets to COR
- [ ] Import ticket data into COR
- [ ] Capture GC signature
- [ ] Export COR to PDF
- [ ] View COR on mobile device
- [ ] Test with screen reader
- [ ] Delete COR (draft only)
- [ ] Verify RLS policies (different user roles)

**Task 10.2: Data validation**

- Verify all calculations match manual calculations
- Check that subtotals, markups, fees, totals are correct
- Test edge cases (zero items, negative values, very large numbers)

**Task 10.3: Performance testing**

- Test with COR containing 50+ labor items
- Test project with 100+ CORs
- Measure PDF generation time
- Optimize if needed

**Task 10.4: Deploy**

- Commit all changes
- Push to development branch
- Test in staging environment
- Get user feedback
- Fix any issues
- Deploy to production

---

## Additional Requirements

### Code Style
- Follow existing FieldSync code patterns
- Use consistent naming conventions (camelCase for JS, snake_case for DB)
- Add comments for complex logic
- Keep functions small and focused

### Error Handling
- Wrap database calls in try-catch
- Display user-friendly error messages
- Log errors to console for debugging
- Don't expose sensitive info in errors

### Performance
- Use indexes for frequently queried columns
- Batch database operations where possible
- Lazy load COR list (pagination if >50 CORs)
- Optimize PDF generation

### Security
- Validate all user input
- Use parameterized queries (Supabase handles this)
- Enforce RLS policies
- Don't allow editing approved CORs
- Sanitize signature data before saving

### User Experience
- Auto-save drafts to prevent data loss
- Show loading indicators
- Provide helpful tooltips
- Make forms easy to fill out
- Display clear validation errors
- Confirm destructive actions

---

## Success Criteria

The implementation is successful if:
1. ✅ All database tables created and accessible
2. ✅ Office users can create a COR from start to finish
3. ✅ COR calculations are 100% accurate
4. ✅ Pricing breakdown displays correctly and matches reference image format
5. ✅ Tickets can be assigned to CORs (during creation and after)
6. ✅ GC signature can be captured and displayed
7. ✅ PDF export generates professional-quality document
8. ✅ All form fields have proper labels and accessibility attributes
9. ✅ System works on desktop and mobile
10. ✅ User feedback is positive - "This is a game changer!"

---

## Questions to Ask Before Starting

If any of the following are unclear, ask the user:

1. Should COR numbers be auto-incremented per project or company-wide?
2. Can a ticket be assigned to multiple CORs, or only one?
3. After a COR is approved, can it be edited at all, or completely locked?
4. Should there be email notifications when COR status changes?
5. Who can capture the GC signature - only GC role, or also office/admin?
6. Should the system support multiple currencies, or always USD?
7. Are there any specific PDF formatting requirements beyond the reference image?
8. Should draft CORs auto-save as user types, or only on manual save?
9. What should happen to associated tickets when a COR is deleted?

---

## Final Notes

This is an ambitious feature that will transform FieldSync's change order process. Take it step by step, starting with the database schema, then building up the UI components. Test frequently and get user feedback early.

The reference image shows a very clean, professional pricing breakdown - match that quality in both the UI and PDF export.

Remember: This is a game-changer feature. Execute it properly and FieldSync will stand out from competitors.

Good luck! 🚀
