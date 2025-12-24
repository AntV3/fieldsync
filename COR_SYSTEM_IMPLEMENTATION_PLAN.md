# FieldSync COR (Change Order Request) System - Implementation Plan

## Overview
This document outlines the complete implementation plan for a comprehensive Change Order Request (COR) creation and management system for FieldSync. This system will allow office staff to create, manage, and submit professionally formatted CORs based on T&M tickets, with full cost manipulation capabilities.

---

## 1. Database Schema Design

### 1.1 New Tables

#### `change_orders` - Main COR table
```sql
CREATE TABLE change_orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cor_number TEXT NOT NULL, -- e.g., "COR #1", "COR #2"
  area_id UUID REFERENCES areas(id) ON DELETE SET NULL, -- Optional work area association

  -- Metadata
  title TEXT NOT NULL, -- e.g., "Exploratory abatement at exterior glazing"
  description TEXT,
  scope_of_work TEXT,
  period_start DATE,
  period_end DATE,

  -- Status workflow
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'billed', 'closed')),

  -- Cost breakdown (all in cents to avoid decimal issues)
  labor_subtotal INTEGER DEFAULT 0, -- Calculated from labor items
  materials_subtotal INTEGER DEFAULT 0, -- Calculated from material items
  equipment_subtotal INTEGER DEFAULT 0, -- Calculated from equipment items
  subcontractors_subtotal INTEGER DEFAULT 0, -- Calculated from subcontractor items

  -- Markup percentages (stored as basis points: 1500 = 15.00%)
  labor_markup_percent INTEGER DEFAULT 1500, -- 15%
  materials_markup_percent INTEGER DEFAULT 1500, -- 15%
  equipment_markup_percent INTEGER DEFAULT 1500, -- 15%
  subcontractors_markup_percent INTEGER DEFAULT 500, -- 5%

  -- Markup amounts (calculated)
  labor_markup_amount INTEGER DEFAULT 0,
  materials_markup_amount INTEGER DEFAULT 0,
  equipment_markup_amount INTEGER DEFAULT 0,
  subcontractors_markup_amount INTEGER DEFAULT 0,

  -- Additional fees (percentages in basis points)
  liability_insurance_percent INTEGER DEFAULT 144, -- 1.44%
  liability_insurance_amount INTEGER DEFAULT 0,
  bond_percent INTEGER DEFAULT 100, -- 1.00%
  bond_amount INTEGER DEFAULT 0,
  license_fee_percent INTEGER DEFAULT 10, -- 0.10%
  license_fee_amount INTEGER DEFAULT 0,

  -- Totals
  cor_subtotal INTEGER DEFAULT 0, -- Sum of all subtotals + markups
  additional_fees_total INTEGER DEFAULT 0, -- Sum of insurance, bond, license
  cor_total INTEGER DEFAULT 0, -- Final total

  -- Signature & approval
  gc_signature_data TEXT, -- Base64 signature from GC
  gc_signature_name TEXT,
  gc_signature_date TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP WITH TIME ZONE,

  -- Audit
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  submitted_at TIMESTAMP WITH TIME ZONE,

  UNIQUE(company_id, project_id, cor_number)
);

CREATE INDEX idx_change_orders_project_id ON change_orders(project_id);
CREATE INDEX idx_change_orders_status ON change_orders(status);
CREATE INDEX idx_change_orders_area_id ON change_orders(area_id);
```

#### `change_order_labor` - Labor line items
```sql
CREATE TABLE change_order_labor (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,

  -- Labor details
  labor_class TEXT NOT NULL, -- "Abatement Worker", "Demolition Worker", "Operator"
  wage_type TEXT NOT NULL CHECK (wage_type IN ('Foreman', 'Laborer', 'Worker', 'Operator')),
  regular_hours DECIMAL(10, 2) DEFAULT 0,
  overtime_hours DECIMAL(10, 2) DEFAULT 0,

  -- Rates (in cents)
  regular_rate INTEGER NOT NULL,
  overtime_rate INTEGER NOT NULL,

  -- Calculated totals (in cents)
  regular_total INTEGER DEFAULT 0,
  overtime_total INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_change_order_labor_cor_id ON change_order_labor(change_order_id);
```

#### `change_order_materials` - Material/containment/abatement items
```sql
CREATE TABLE change_order_materials (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,

  -- Material details
  description TEXT NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL,
  unit TEXT NOT NULL, -- "each", "ton", "load", etc.
  unit_cost INTEGER NOT NULL, -- In cents
  total INTEGER NOT NULL, -- In cents

  -- Source tracking
  source_type TEXT CHECK (source_type IN ('backup_sheet', 'invoice', 'mobilization', 'custom')),
  source_reference TEXT, -- Invoice number or reference

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_change_order_materials_cor_id ON change_order_materials(change_order_id);
```

#### `change_order_equipment` - Equipment line items
```sql
CREATE TABLE change_order_equipment (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,

  -- Equipment details
  description TEXT NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL,
  unit TEXT NOT NULL, -- "day", "week", "each", etc.
  unit_cost INTEGER NOT NULL, -- In cents
  total INTEGER NOT NULL, -- In cents

  -- Source tracking
  source_type TEXT CHECK (source_type IN ('backup_sheet', 'invoice', 'custom')),
  source_reference TEXT,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_change_order_equipment_cor_id ON change_order_equipment(change_order_id);
```

#### `change_order_subcontractors` - Subcontractor line items
```sql
CREATE TABLE change_order_subcontractors (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,

  -- Subcontractor details
  description TEXT NOT NULL, -- "Scaffold - Vertical Access"
  quantity DECIMAL(10, 2) DEFAULT 1,
  unit TEXT DEFAULT 'LS', -- Lump Sum
  unit_cost INTEGER NOT NULL, -- In cents
  total INTEGER NOT NULL, -- In cents

  -- Source tracking
  source_type TEXT CHECK (source_type IN ('invoice', 'quote', 'custom')),
  source_reference TEXT,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_change_order_subcontractors_cor_id ON change_order_subcontractors(change_order_id);
```

#### `change_order_ticket_associations` - Link T&M tickets to CORs
```sql
CREATE TABLE change_order_ticket_associations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES t_and_m_tickets(id) ON DELETE CASCADE,

  -- Track if this ticket's data has been imported into the COR
  data_imported BOOLEAN DEFAULT false,
  imported_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(change_order_id, ticket_id)
);

CREATE INDEX idx_cor_ticket_assoc_cor_id ON change_order_ticket_associations(change_order_id);
CREATE INDEX idx_cor_ticket_assoc_ticket_id ON change_order_ticket_associations(ticket_id);
```

### 1.2 Schema Modifications to Existing Tables

#### `t_and_m_tickets` - Add COR association
```sql
-- Add optional link to which COR this ticket belongs to
ALTER TABLE t_and_m_tickets
ADD COLUMN assigned_cor_id UUID REFERENCES change_orders(id) ON DELETE SET NULL;

CREATE INDEX idx_t_and_m_tickets_assigned_cor ON t_and_m_tickets(assigned_cor_id);
```

#### `areas` - Already has all needed fields
No changes needed. Areas can be linked via `change_orders.area_id`.

---

## 2. System Architecture

### 2.1 Component Structure

```
/src/components/
├── cor/
│   ├── CORList.jsx                    # List all CORs for a project
│   ├── CORForm.jsx                    # Create/Edit COR (main wizard)
│   ├── CORFormSteps/
│   │   ├── Step1_BasicInfo.jsx        # Title, scope, period, area
│   │   ├── Step2_Tickets.jsx          # Select T&M tickets to include
│   │   ├── Step3_Labor.jsx            # Labor breakdown with hours/rates
│   │   ├── Step4_Materials.jsx        # Materials/containment/abatement
│   │   ├── Step5_Equipment.jsx        # Equipment items
│   │   ├── Step6_Subcontractors.jsx   # Subcontractor items
│   │   ├── Step7_Markup.jsx           # Adjust markup percentages
│   │   ├── Step8_Fees.jsx             # Liability, bond, license fees
│   │   └── Step9_Review.jsx           # Final review & submit
│   ├── CORDetail.jsx                  # View COR details (read-only or edit)
│   ├── CORPricingBreakdown.jsx        # Display pricing table (like the image)
│   ├── CORSignature.jsx               # GC signature pad component
│   ├── CORExport.jsx                  # Export to PDF functionality
│   └── TicketCORAssignment.jsx        # Assign tickets to existing CORs
├── Dashboard.jsx                      # Add "CORs" tab
└── ProjectView.jsx                    # Add COR management section

/src/lib/
├── supabase.js                        # Add COR CRUD operations
└── corCalculations.js                 # NEW: COR cost calculation utilities
```

### 2.2 User Workflows

#### Workflow 1: Create New COR from Office Dashboard
1. Office user navigates to project → CORs tab
2. Clicks "Create New COR"
3. **Step 1**: Enter basic info (title, scope, period, optional area)
4. **Step 2**: Select T&M tickets to include (filter by date range, status)
5. **Step 3**: Auto-populate labor from tickets → allow manual adjustments
6. **Step 4**: Auto-populate materials from tickets → allow additions/deletions
7. **Step 5**: Auto-populate equipment from tickets → allow adjustments
8. **Step 6**: Add subcontractors (manual entry or from invoices)
9. **Step 7**: Review/adjust markup percentages
10. **Step 8**: Review/adjust additional fees (insurance, bond, license)
11. **Step 9**: Review final pricing breakdown → Submit for approval
12. COR saved as "pending_approval" → GC can review and sign

#### Workflow 2: Field User Associates Ticket with Existing COR
1. Field user creates T&M ticket
2. During creation or after, sees dropdown "Assign to COR"
3. Selects existing COR number from project
4. Ticket linked to COR
5. Office user can see which tickets are linked to which CORs
6. When editing COR, office can choose to re-import updated ticket data

#### Workflow 3: Associate Future Tickets with Existing COR
1. Office user opens existing COR (status: draft or pending_approval)
2. Clicks "Add More Tickets"
3. Sees list of unassigned or newly created tickets
4. Selects tickets to add
5. Option to "Import Data" (adds ticket's labor/materials to COR) or "Link Only"
6. COR recalculates totals

#### Workflow 4: GC Reviews and Signs COR
1. Office user generates COR and marks as "Ready for GC Signature"
2. Shares link or PDF with GC
3. GC reviews pricing breakdown
4. GC draws signature in signature pad
5. COR status → "approved"
6. System timestamps and locks the COR

---

## 3. Feature Breakdown

### 3.1 Core Features

#### ✅ Auto-calculate weights for activities
- When associating COR with an area, show area's weight
- Calculate COR value as percentage of total contract value
- Display in COR summary

#### ✅ Accessibility fixes
- All form fields have proper `<label>` with `htmlFor`
- All inputs have unique `id` and `name` attributes
- ARIA labels for complex inputs
- Keyboard navigation support

#### ✅ Create and manipulate CORs
- Full CRUD operations
- Line-item level editing
- Real-time cost recalculation
- Undo/redo capability for draft CORs

#### ✅ Adjustable markup, fees, and costs
- Markup percentages editable at COR level
- Override individual line item costs
- Add custom line items
- Adjust liability insurance, bond, license fee percentages

#### ✅ Show hours
- Labor section displays regular hours and OT hours
- Breakdown by labor class and wage type
- Total hours calculation

#### ✅ Add subs and equipment
- Manual entry forms
- Import from invoices
- Category-based organization
- Cost tracking

#### ✅ Separate grouped tickets into COR #
- Create multiple CORs from different ticket groups
- Group by date range, area, or CE/PCO number
- Maintain ticket-to-COR associations

#### ✅ Associate future tickets with existing CORs
- Dropdown in T&M form to select COR
- Bulk assignment tool in COR detail view
- Auto-link based on CE/PCO number matching

#### ✅ Associate with work areas
- Link COR to specific area during creation
- Filter CORs by area
- Track area-specific change orders

#### ✅ GC signature capability
- Canvas-based signature pad
- Save signature as base64 image
- Display signed CORs with signature image
- Lock COR after signing

### 3.2 Display & Export Features

#### Professional Pricing Breakdown Display
Based on the reference image, create a component that shows:
- **Header**: Company name, project info, COR number
- **Labor Section**: Class, wage type, hours, per, unit $, total
- **Materials Section**: Description, quantity, per, unit $, total
- **Equipment Section**: Same format as materials
- **Subcontractors Section**: Same format
- **Markup Section**: Percentages and amounts for each category
- **Additional Fees**: Liability insurance, bond, license fee
- **COR Total**: Bold, prominent display

#### PDF Export
- Generate PDF matching the image format
- Include company branding (logo, colors)
- Professional formatting
- Signature embedded in PDF
- Date completed stamp

---

## 4. Calculation Logic

### 4.1 Cost Calculation Flow

```javascript
// Example calculation logic (to be implemented in corCalculations.js)

// 1. Calculate subtotals
laborSubtotal = sum(labor_items.total)
materialsSubtotal = sum(material_items.total)
equipmentSubtotal = sum(equipment_items.total)
subcontractorsSubtotal = sum(subcontractor_items.total)

// 2. Calculate markups
laborMarkup = laborSubtotal * (labor_markup_percent / 10000)
materialsMarkup = materialsSubtotal * (materials_markup_percent / 10000)
equipmentMarkup = equipmentSubtotal * (equipment_markup_percent / 10000)
subcontractorsMarkup = subcontractorsSubtotal * (subcontractors_markup_percent / 10000)

// 3. Calculate COR subtotal
corSubtotal = laborSubtotal + materialsSubtotal + equipmentSubtotal + subcontractorsSubtotal
            + laborMarkup + materialsMarkup + equipmentMarkup + subcontractorsMarkup

// 4. Calculate additional fees (applied to corSubtotal)
liabilityInsurance = corSubtotal * (liability_insurance_percent / 10000)
bond = corSubtotal * (bond_percent / 10000)
licenseFee = corSubtotal * (license_fee_percent / 10000)

// 5. Calculate final total
corTotal = corSubtotal + liabilityInsurance + bond + licenseFee
```

### 4.2 Auto-import from T&M Tickets

When tickets are added to a COR:
1. Extract all workers → create labor line items (group by role, sum hours)
2. Extract all items → create material/equipment line items
3. Match against `labor_rates` table for current rates
4. Match against `materials_equipment` table for current costs
5. Calculate totals
6. Allow office user to review and adjust before finalizing

---

## 5. Implementation Phases

### Phase 1: Database Schema (Priority: CRITICAL)
- [ ] Create migration file with all new tables
- [ ] Add indexes and foreign keys
- [ ] Create database functions for COR calculations
- [ ] Add RLS policies
- [ ] Test schema in Supabase

### Phase 2: Core Data Layer (Priority: CRITICAL)
- [ ] Add COR CRUD functions to `supabase.js`
  - `createCOR()`
  - `updateCOR()`
  - `deleteCOR()`
  - `getCORs(projectId)`
  - `getCORById(id)`
  - `getCORWithDetails(id)` (include all line items)
- [ ] Add line item functions
  - `addLaborItem()`, `updateLaborItem()`, `deleteLaborItem()`
  - Similar for materials, equipment, subcontractors
- [ ] Add ticket association functions
  - `assignTicketToCOR(ticketId, corId)`
  - `unassignTicketFromCOR(ticketId)`
  - `importTicketDataToCOR(ticketId, corId)`
- [ ] Create `corCalculations.js` utility
  - Calculate all subtotals, markups, fees, total
  - Export calculation functions

### Phase 3: COR List & Basic UI (Priority: HIGH)
- [ ] Create `CORList.jsx` component
  - Display all CORs for project
  - Filter by status, area, date range
  - Quick stats (total count, pending approval, approved total $)
  - Create new COR button
- [ ] Add "CORs" tab to project view
- [ ] Create basic routing

### Phase 4: COR Form Wizard (Priority: HIGH)
- [ ] Create `CORForm.jsx` (main wizard container)
- [ ] Implement Step 1: Basic Info
  - Title, description, scope of work
  - Period start/end date pickers
  - Area selection dropdown
- [ ] Implement Step 2: Ticket Selection
  - Checkbox list of available T&M tickets
  - Filter by status, date range, CE/PCO number
  - "Select All" functionality
  - Preview of selected tickets (count, date range)
- [ ] Implement Step 3: Labor
  - Auto-populated from selected tickets
  - Editable table (hours, rates)
  - Add custom labor row
  - Delete rows
  - Real-time subtotal calculation
- [ ] Implement Step 4: Materials
  - Auto-populated from selected tickets
  - Categorize (Containment, PPE, Disposal, etc.)
  - Editable table (quantity, unit, cost)
  - Add custom material row
  - Source tracking (backup sheet, invoice, mobilization)
- [ ] Implement Step 5: Equipment
  - Similar to materials
  - Add from equipment master list or custom
- [ ] Implement Step 6: Subcontractors
  - Manual entry table
  - Add multiple subcontractor rows
  - Lump sum or unit pricing
- [ ] Implement Step 7: Markup
  - Input fields for each category percentage
  - Real-time calculation of markup amounts
  - Display subtotals + markups
- [ ] Implement Step 8: Fees
  - Input fields for liability insurance %, bond %, license fee %
  - Real-time calculation
- [ ] Implement Step 9: Review
  - Display final pricing breakdown (use shared component)
  - "Save as Draft" or "Submit for Approval" buttons
  - Validation checks

### Phase 5: COR Detail & Editing (Priority: HIGH)
- [ ] Create `CORDetail.jsx` component
  - Read-only view for approved CORs
  - Edit mode for draft CORs
  - Status badge
  - Action buttons (Edit, Delete, Export PDF, Request Signature)
- [ ] Create `CORPricingBreakdown.jsx` (reusable display component)
  - Match reference image format
  - Responsive table design
  - Print-friendly styling

### Phase 6: Cost Manipulation & Adjustments (Priority: MEDIUM)
- [ ] Allow inline editing of costs in review step
- [ ] Add "Override Cost" feature for individual line items
- [ ] Implement cost history/audit trail (log changes)
- [ ] Add "Restore Calculated Cost" button

### Phase 7: Ticket-COR Association Features (Priority: MEDIUM)
- [ ] Add "Assign to COR" dropdown in `TMForm.jsx`
- [ ] Create `TicketCORAssignment.jsx` component
  - Bulk assignment interface
  - Drag-and-drop tickets to CORs
  - Visual indicators of assigned tickets
- [ ] Add filter in `TMList.jsx` to show tickets by COR
- [ ] Auto-suggest COR based on CE/PCO number matching

### Phase 8: GC Signature Feature (Priority: MEDIUM)
- [ ] Create `CORSignature.jsx` component
  - Canvas-based signature pad (use `react-signature-canvas`)
  - Clear and save buttons
  - Preview signature
- [ ] Add signature workflow
  - Office marks COR as "Ready for Signature"
  - GC receives notification/link
  - GC draws signature
  - System saves and locks COR
- [ ] Display signature in COR detail view
- [ ] Embed signature in PDF export

### Phase 9: PDF Export (Priority: MEDIUM)
- [ ] Create `CORExport.jsx` utility
- [ ] Use `jsPDF` and `jspdf-autotable` (already in project)
- [ ] Generate PDF matching reference image format
  - Header with company logo and branding
  - Project info section
  - All pricing tables
  - Markup section
  - Fees section
  - Signature section (if signed)
  - Footer with date completed
- [ ] Add "Download PDF" button to COR detail view
- [ ] Add "Email PDF" functionality (optional)

### Phase 10: Accessibility & Polish (Priority: LOW)
- [ ] Accessibility audit
  - All form fields have labels
  - Proper ARIA attributes
  - Keyboard navigation
  - Screen reader testing
- [ ] Mobile responsiveness
- [ ] Loading states and error handling
- [ ] Toast notifications for actions
- [ ] Confirmation dialogs for destructive actions

### Phase 11: Advanced Features (Priority: LOW / FUTURE)
- [ ] Auto-calculate activity weights based on COR value
- [ ] COR templates (save common configurations)
- [ ] COR comparison (compare multiple CORs)
- [ ] COR history and versioning
- [ ] Email notifications for COR status changes
- [ ] Integration with accounting systems
- [ ] Batch COR creation (create multiple CORs at once)
- [ ] COR analytics dashboard (total approved CORs, average markup, etc.)

---

## 6. Database Functions & Queries

### 6.1 Useful Database Functions to Create

```sql
-- Function to recalculate COR totals
CREATE OR REPLACE FUNCTION recalculate_cor_totals(cor_id UUID)
RETURNS void AS $$
DECLARE
  labor_sub INTEGER;
  materials_sub INTEGER;
  equipment_sub INTEGER;
  subs_sub INTEGER;
  labor_markup_pct INTEGER;
  materials_markup_pct INTEGER;
  equipment_markup_pct INTEGER;
  subs_markup_pct INTEGER;
  labor_markup_amt INTEGER;
  materials_markup_amt INTEGER;
  equipment_markup_amt INTEGER;
  subs_markup_amt INTEGER;
  cor_sub INTEGER;
  liability_pct INTEGER;
  bond_pct INTEGER;
  license_pct INTEGER;
  liability_amt INTEGER;
  bond_amt INTEGER;
  license_amt INTEGER;
  cor_tot INTEGER;
BEGIN
  -- Get subtotals
  SELECT COALESCE(SUM(total), 0) INTO labor_sub
    FROM change_order_labor WHERE change_order_id = cor_id;

  SELECT COALESCE(SUM(total), 0) INTO materials_sub
    FROM change_order_materials WHERE change_order_id = cor_id;

  SELECT COALESCE(SUM(total), 0) INTO equipment_sub
    FROM change_order_equipment WHERE change_order_id = cor_id;

  SELECT COALESCE(SUM(total), 0) INTO subs_sub
    FROM change_order_subcontractors WHERE change_order_id = cor_id;

  -- Get markup percentages
  SELECT labor_markup_percent, materials_markup_percent, equipment_markup_percent, subcontractors_markup_percent,
         liability_insurance_percent, bond_percent, license_fee_percent
    INTO labor_markup_pct, materials_markup_pct, equipment_markup_pct, subs_markup_pct,
         liability_pct, bond_pct, license_pct
    FROM change_orders WHERE id = cor_id;

  -- Calculate markups
  labor_markup_amt := ROUND(labor_sub * labor_markup_pct::DECIMAL / 10000);
  materials_markup_amt := ROUND(materials_sub * materials_markup_pct::DECIMAL / 10000);
  equipment_markup_amt := ROUND(equipment_sub * equipment_markup_pct::DECIMAL / 10000);
  subs_markup_amt := ROUND(subs_sub * subs_markup_pct::DECIMAL / 10000);

  -- Calculate COR subtotal
  cor_sub := labor_sub + materials_sub + equipment_sub + subs_sub
           + labor_markup_amt + materials_markup_amt + equipment_markup_amt + subs_markup_amt;

  -- Calculate fees
  liability_amt := ROUND(cor_sub * liability_pct::DECIMAL / 10000);
  bond_amt := ROUND(cor_sub * bond_pct::DECIMAL / 10000);
  license_amt := ROUND(cor_sub * license_pct::DECIMAL / 10000);

  -- Calculate total
  cor_tot := cor_sub + liability_amt + bond_amt + license_amt;

  -- Update change_orders table
  UPDATE change_orders SET
    labor_subtotal = labor_sub,
    materials_subtotal = materials_sub,
    equipment_subtotal = equipment_sub,
    subcontractors_subtotal = subs_sub,
    labor_markup_amount = labor_markup_amt,
    materials_markup_amount = materials_markup_amt,
    equipment_markup_amount = equipment_markup_amt,
    subcontractors_markup_amount = subs_markup_amt,
    cor_subtotal = cor_sub,
    liability_insurance_amount = liability_amt,
    bond_amount = bond_amt,
    license_fee_amount = license_amt,
    additional_fees_total = liability_amt + bond_amt + license_amt,
    cor_total = cor_tot,
    updated_at = NOW()
  WHERE id = cor_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to recalculate when line items change
CREATE OR REPLACE FUNCTION trigger_recalculate_cor()
RETURNS TRIGGER AS $$
BEGIN
  -- Determine which COR to recalculate based on the table
  IF TG_TABLE_NAME = 'change_order_labor' THEN
    PERFORM recalculate_cor_totals(COALESCE(NEW.change_order_id, OLD.change_order_id));
  ELSIF TG_TABLE_NAME = 'change_order_materials' THEN
    PERFORM recalculate_cor_totals(COALESCE(NEW.change_order_id, OLD.change_order_id));
  ELSIF TG_TABLE_NAME = 'change_order_equipment' THEN
    PERFORM recalculate_cor_totals(COALESCE(NEW.change_order_id, OLD.change_order_id));
  ELSIF TG_TABLE_NAME = 'change_order_subcontractors' THEN
    PERFORM recalculate_cor_totals(COALESCE(NEW.change_order_id, OLD.change_order_id));
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Attach triggers to all line item tables
CREATE TRIGGER recalc_cor_labor AFTER INSERT OR UPDATE OR DELETE ON change_order_labor
  FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_cor();

CREATE TRIGGER recalc_cor_materials AFTER INSERT OR UPDATE OR DELETE ON change_order_materials
  FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_cor();

CREATE TRIGGER recalc_cor_equipment AFTER INSERT OR UPDATE OR DELETE ON change_order_equipment
  FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_cor();

CREATE TRIGGER recalc_cor_subs AFTER INSERT OR UPDATE OR DELETE ON change_order_subcontractors
  FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_cor();
```

---

## 7. UI/UX Considerations

### 7.1 Design Principles
- **Clean & Professional**: Match the reference image's clean table layout
- **Real-time Feedback**: Show calculations as user types
- **Mobile-First**: Ensure all features work on tablet/phone
- **Accessible**: WCAG 2.1 AA compliance
- **Fast**: Optimize for quick data entry

### 7.2 Key UI Components
- **Editable Tables**: Use `react-table` or similar for sortable, editable tables
- **Signature Pad**: Use `react-signature-canvas` library
- **Date Pickers**: Use existing date picker component
- **Form Validation**: Real-time validation with clear error messages
- **Loading States**: Skeleton loaders for better UX
- **Toast Notifications**: Success/error feedback

### 7.3 Mobile Considerations
- **Stacked Layout**: Tables become card-based on mobile
- **Touch-Friendly**: Larger tap targets (min 44x44px)
- **Swipe Actions**: Swipe to delete line items
- **Bottom Sheet**: Use for mobile forms instead of modals

---

## 8. Testing Strategy

### 8.1 Unit Tests
- Test calculation functions in `corCalculations.js`
- Test database CRUD operations
- Test form validation logic

### 8.2 Integration Tests
- Test COR creation workflow end-to-end
- Test ticket-to-COR association
- Test PDF generation
- Test signature capture and save

### 8.3 Manual Testing Checklist
- [ ] Create COR from scratch
- [ ] Create COR from T&M tickets
- [ ] Edit existing COR
- [ ] Delete COR
- [ ] Assign tickets to COR
- [ ] Remove tickets from COR
- [ ] Adjust markup percentages
- [ ] Adjust fee percentages
- [ ] Add custom line items
- [ ] Delete line items
- [ ] Verify calculations are correct
- [ ] Generate PDF
- [ ] Capture signature
- [ ] View signed COR
- [ ] Test on mobile device
- [ ] Test accessibility with screen reader

---

## 9. Security & Permissions

### 9.1 Role-Based Access Control
- **Foreman**: Can view CORs, cannot create/edit
- **Office**: Can create, edit draft CORs, approve CORs
- **Admin**: Full access to all COR operations

### 9.2 RLS Policies
```sql
-- CORs are scoped to company
CREATE POLICY "Users can view CORs from their company" ON change_orders
  FOR SELECT USING (company_id = current_user_company_id());

CREATE POLICY "Office and Admin can create CORs" ON change_orders
  FOR INSERT WITH CHECK (
    company_id = current_user_company_id()
    AND current_user_role() IN ('office', 'admin')
  );

CREATE POLICY "Office and Admin can update draft CORs" ON change_orders
  FOR UPDATE USING (
    company_id = current_user_company_id()
    AND current_user_role() IN ('office', 'admin')
    AND status IN ('draft', 'pending_approval')
  );

CREATE POLICY "Only Admin can delete CORs" ON change_orders
  FOR DELETE USING (
    company_id = current_user_company_id()
    AND current_user_role() = 'admin'
  );
```

---

## 10. Future Enhancements

### 10.1 Nice-to-Have Features
- [ ] COR Templates: Save common COR configurations
- [ ] Batch Operations: Create multiple CORs at once
- [ ] COR Comparison: Side-by-side comparison of CORs
- [ ] Version History: Track changes to CORs over time
- [ ] Email Integration: Send CORs directly from app
- [ ] Accounting Integration: Export to QuickBooks, Xero, etc.
- [ ] Mobile App: Native iOS/Android app for field signatures
- [ ] Analytics Dashboard: Visualize COR trends, average markups, etc.
- [ ] Auto-Import from Invoices: OCR to extract data from uploaded invoices
- [ ] Multi-Currency Support: For international projects

### 10.2 Performance Optimizations
- [ ] Lazy load COR list (pagination or virtual scrolling)
- [ ] Cache frequently accessed data
- [ ] Optimize PDF generation (server-side if large)
- [ ] Database query optimization with explain analyze

---

## 11. Success Metrics

### 11.1 Key Performance Indicators
- **COR Creation Time**: Target < 15 minutes from start to submit
- **Calculation Accuracy**: 100% accurate calculations
- **User Adoption**: Office staff using COR system for all change orders
- **Error Rate**: < 1% of CORs require corrections after submission
- **PDF Quality**: Professional-quality output matching reference image

### 11.2 User Feedback
- Conduct user testing with office staff
- Gather feedback on workflow efficiency
- Iterate based on real-world usage

---

## 12. Documentation Needs

- [ ] User Guide: How to create a COR
- [ ] Video Tutorial: Screen recording of COR creation process
- [ ] API Documentation: For future integrations
- [ ] Database Schema Diagram: Visual representation of tables
- [ ] Troubleshooting Guide: Common issues and solutions

---

## 13. Summary

This COR system will be a **game-changer** for FieldSync by:
1. **Streamlining** the change order process from ticket → COR → approval
2. **Professionalizing** the output with formatted pricing breakdowns
3. **Empowering** office staff to manipulate costs and markups before submission
4. **Connecting** field operations (T&M tickets) with office financials (CORs)
5. **Enabling** digital signatures for faster approvals
6. **Providing** clear audit trails for all change order activities

The implementation is ambitious but well-structured. By following the phased approach, we can deliver value incrementally while building toward the complete vision.

**Estimated Timeline**:
- Phase 1-2 (Database): 3-5 days
- Phase 3-5 (Core UI): 7-10 days
- Phase 6-8 (Advanced Features): 5-7 days
- Phase 9-10 (Polish): 3-4 days
- **Total**: ~3-4 weeks for full implementation

**Next Steps**: Create detailed Claude CLI prompt for Phase 1 implementation.
