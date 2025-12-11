# Schedule of Values & Pay Application System

## Overview

This system connects your **pay application (Schedule of Values)** with **field work completion** to automatically track earned revenue toward your contract value.

## How It Works

```
┌──────────────────┐
│  Pay Application │  Import your pay app
│  (AIA G702/G703) │  Line items with $ amounts
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│Schedule of Values│  SOV line items stored in database
│   Line Items     │  Example: "Concrete Foundation" = $125,000
└────────┬─────────┘
         │
         │ Link to...
         │
    ┌────┴─────┐
    │          │
    ▼          ▼
┌───────┐  ┌────────┐
│ Areas │  │T&M     │  Field workers complete tasks
│       │  │Tickets │
└───┬───┘  └───┬────┘
    │          │
    └────┬─────┘
         │
         ▼
    ┌────────────┐
    │ Earned $   │  Auto-calculate earned value
    │ Updates    │  Track progress toward contract
    └────────────┘
```

## Database Tables

### 1. `schedule_of_values` (SOV Line Items)

Stores your pay application line items:

| Column | Description | Example |
|--------|-------------|---------|
| `line_number` | Line item number | "1", "2.1", "3A" |
| `description` | Work description | "Concrete Foundation" |
| `scheduled_value` | Original bid amount | $125,000.00 |
| `work_completed_to_date` | Earned so far | $50,000.00 |
| `percent_complete` | % complete | 40% |
| `balance_to_finish` | Remaining | $75,000.00 |
| `calc_method` | How to calc earned value | `area_distribution`, `tm_actual`, `manual` |

### 2. `pay_applications` (Pay App Submissions)

Stores each pay application you submit:

| Column | Description |
|--------|-------------|
| `application_number` | Pay app # (1, 2, 3...) |
| `period_to` | Billing period end date |
| `work_completed_to_date` | Total earned through this period |
| `retainage_percent` | Retainage % (typically 10%) |
| `current_payment_due` | Amount to bill this period |
| `status` | draft, submitted, approved, paid |

### 3. Links to Existing Tables

**Areas:**
- `sov_line_id` → Links area to SOV line
- `earned_value` → How much $ this area is worth

**T&M Tickets:**
- `sov_line_id` → Links ticket to SOV line
- `earned_value` → Auto-calculated from labor + materials

## Earned Value Calculation Methods

### Method 1: Area Distribution (`area_distribution`)

**Use for:** Fixed-scope work divided into areas

**How it works:**
- SOV Line "Concrete Foundation" = $125,000
- 25 areas linked to this line
- Each area worth: $125,000 ÷ 25 = $5,000
- When area marked "done": earned value += $5,000

**Example:**
```sql
-- 10 areas done out of 25
Earned = 10 × ($125,000 ÷ 25) = $50,000
Percent Complete = 40%
```

### Method 2: T&M Actual (`tm_actual`)

**Use for:** Time & Materials work (actual costs)

**How it works:**
- T&M ticket gets approved
- System calculates:
  - Labor cost = (hours × $75/hr) + (overtime_hours × $112.50/hr)
  - Materials cost = quantity × cost_per_unit
  - Total = labor + materials
- Earned value = actual costs

**Example:**
```sql
-- T&M Ticket:
Labor: 8 workers × 8 hours × $75/hr = $4,800
Materials: $1,200
Total Earned = $6,000
```

### Method 3: Manual (`manual`)

**Use for:** Custom earned value per task

**How it works:**
- Office sets `earned_value` manually on each area
- When area marked "done", that amount is earned

**Example:**
```sql
-- Area 1: $5,000
-- Area 2: $8,000 (bigger/harder)
-- Area 3: $3,000 (smaller/easier)
```

## Workflow

### Step 1: Import Pay Application

**Option A: CSV Import**
```csv
Line,Description,Scheduled Value
1,Site Work & Demolition,45000
2,Concrete Foundation,125000
3,Structural Steel,85000
4,Framing,95000
5,Electrical,55000
```

**Option B: Manual Entry**
- Go to Project → "Pay Application"
- Click "Add Line Item"
- Enter line #, description, amount

### Step 2: Link Areas/Tickets to SOV Lines

**For Areas:**
1. Edit an area
2. Select "SOV Line" dropdown
3. Choose line item (e.g., "Concrete Foundation")
4. Save

**Bulk Assignment:**
1. Go to "Schedule of Values"
2. Click line item → "Assign Areas"
3. Select multiple areas
4. Assign all at once

**For T&M Tickets:**
1. When creating T&M ticket
2. Select "SOV Line" dropdown
3. Choose line item

### Step 3: Field Workers Complete Tasks

**Areas:**
- Field worker marks area status: "working" → "done"
- ✅ Trigger fires automatically
- System recalculates earned value for that SOV line
- Updates `work_completed_to_date` and `percent_complete`

**T&M Tickets:**
- Field worker submits T&M ticket
- Office approves ticket
- ✅ Trigger fires automatically
- System calculates labor + materials cost
- Updates earned value for that SOV line

### Step 4: View Contract Progress

**Dashboard shows:**
```
Contract Value: $500,000
Earned to Date: $275,000
Percent Complete: 55%
Balance to Finish: $225,000
```

**By SOV Line:**
```
Line 1: Site Work             $45,000   100%  ✅ Complete
Line 2: Concrete Foundation  $125,000    80%  🟡 In Progress
Line 3: Structural Steel      $85,000    45%  🟡 In Progress
Line 4: Framing               $95,000     0%  ⚪ Not Started
...
```

### Step 5: Generate Pay Application

1. Go to "Pay Applications"
2. Click "New Pay App"
3. System auto-fills:
   - Work completed to date (from SOV lines)
   - Retainage (10% or custom)
   - Current payment due
4. Review and submit

**Generated Pay App:**
```
Application #5
Period: Oct 1 - Oct 31, 2025

Total Contract Value:        $500,000
Work Completed to Date:      $275,000
Retainage (10%):             -$27,500
                             ─────────
Total Earned Less Retainage: $247,500
Previous Payment:            -$200,000
                             ─────────
CURRENT PAYMENT DUE:          $47,500
Balance to Finish:           $225,000
```

## Database Triggers (Automatic Updates)

### ✅ Trigger 1: Area Status Change
```sql
When area.status changes to 'done'
→ Recalculate earned value for sov_line_id
→ Update work_completed_to_date
→ Update percent_complete
```

### ✅ Trigger 2: T&M Ticket Approval
```sql
When tm_ticket.status changes to 'approved'
→ Calculate labor cost (hours × rates)
→ Calculate materials cost (quantity × unit_cost)
→ Update tm_ticket.earned_value
→ Recalculate earned value for sov_line_id
→ Update work_completed_to_date
```

## Example Scenario

### Project: "Main Street Renovation"
**Contract Value: $500,000**

#### SOV Setup:
```
1. Site Work & Demolition    $45,000   (area_distribution)
2. Concrete Foundation      $125,000   (area_distribution)
3. Structural Steel          $85,000   (tm_actual)
4. Framing                   $95,000   (area_distribution)
5. Electrical                $55,000   (tm_actual)
6. Plumbing                  $48,000   (tm_actual)
7. HVAC                      $67,000   (tm_actual)
8. Finishes                  $78,000   (area_distribution)
```

#### Week 1: Site Work
- 15 areas linked to "Site Work"
- Each area = $45,000 ÷ 15 = $3,000
- Crew completes 10 areas
- **Earned: $30,000 (67% of line item)**

#### Week 2: Concrete
- 25 areas linked to "Concrete Foundation"
- Each area = $125,000 ÷ 25 = $5,000
- Crew completes 8 areas
- **Earned: $40,000 (32% of line item)**

#### Week 3: Steel (T&M)
- T&M Ticket: 6 workers × 10 hours × $75/hr = $4,500
- Materials: 2 tons steel × $1,200/ton = $2,400
- Office approves ticket
- **Earned: $6,900 (8% of line item)**

#### End of Month:
```
Total Earned to Date: $30,000 + $40,000 + $6,900 = $76,900
Percent Complete: $76,900 ÷ $500,000 = 15.4%
Generate Pay App #1: $76,900 - 10% retainage = $69,210 due
```

## API Functions

### Calculate Earned Value
```sql
SELECT calculate_sov_earned_value('sov-line-uuid');
-- Returns: total earned value for that SOV line
```

### Get Project Progress
```sql
SELECT
  p.name,
  p.contract_value,
  SUM(s.work_completed_to_date) as earned_to_date,
  SUM(s.work_completed_to_date) / p.contract_value * 100 as percent_complete,
  p.contract_value - SUM(s.work_completed_to_date) as balance_to_finish
FROM projects p
LEFT JOIN schedule_of_values s ON s.project_id = p.id
WHERE p.id = 'project-uuid'
GROUP BY p.id;
```

### Get SOV Breakdown
```sql
SELECT
  line_number,
  description,
  scheduled_value,
  work_completed_to_date,
  percent_complete,
  balance_to_finish,
  (SELECT COUNT(*) FROM areas WHERE sov_line_id = s.id) as total_areas,
  (SELECT COUNT(*) FROM areas WHERE sov_line_id = s.id AND status = 'done') as completed_areas
FROM schedule_of_values s
WHERE project_id = 'project-uuid'
ORDER BY sort_order, line_number;
```

## QuickBooks Integration (Future)

When you're ready to add QuickBooks:

1. **Sync SOV lines** → QuickBooks Line Items
2. **Sync pay apps** → QuickBooks Invoices
3. **Auto-create invoices** when pay app approved
4. **Track payments** when customer pays invoice
5. **Update status** in FieldSync when paid

## Notes

- **Retainage**: Default 10%, configurable per pay app
- **Change Orders**: Add new SOV lines with "CO #1" prefix
- **Closeout**: When 100% complete, retainage typically released
- **AIA Forms**: G702 (Application for Payment), G703 (Continuation Sheet)

## Troubleshooting

**Q: Earned value not updating?**
- Check that area/ticket is linked to SOV line (`sov_line_id` not null)
- Check that area is marked "done" or ticket is "approved"
- Verify triggers are enabled

**Q: Calculation seems wrong?**
- Check `calc_method` on SOV line
- For `area_distribution`: verify all areas are linked
- For `tm_actual`: verify materials have `cost_per_unit` in database
- For `manual`: verify `earned_value` is set on areas

**Q: Can't link area to SOV line?**
- Verify user has office/admin role
- Check that SOV line exists for that project
- Check RLS policies

## Next Steps

1. ✅ Run migration: `schedule_of_values_migration.sql`
2. Import your first pay application
3. Link areas/tickets to SOV lines
4. Complete some work in the field
5. Watch earned value update automatically
6. Generate your first pay app

---

**Questions?** Check the [Implementation Guide](./SOV_IMPLEMENTATION.md) for UI components and code examples.
