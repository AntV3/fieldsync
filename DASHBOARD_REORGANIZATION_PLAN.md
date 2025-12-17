# Dashboard Reorganization Plan

## Goal
Reorganize dashboards into:
1. **Overall Office Dashboard** - Company-wide financial metrics with project breakdowns
2. **Project Dashboard** - Project-specific operational metrics

## Current State Analysis

### Existing Functions (in supabase.js):
- `getDashboardMetrics(companyId)` - Currently returns mostly zeros (line 2304)
- `getProjectSummaries(companyId)` - Returns basic project info (line 2345)
- `getNeedsAttention(companyId)` - Returns empty (line 2396)
- `getRecentActivity(companyId)` - Returns empty (line 2408)

### Existing Tables Confirmed:
✅ `projects` - exists
✅ `t_and_m_tickets` - exists (just fixed)
✅ `t_and_m_workers` - exists
✅ `t_and_m_items` - exists
✅ `materials_equipment` - exists
✅ `areas` - exists
✅ `users` - exists
✅ `companies` - exists

## New Metrics Design

### Overall Office Dashboard Metrics:

```javascript
{
  activeProjects: {
    count: 5,
    list: [{ id, name, status }]  // For tooltip/drill-down
  },

  totalContractValue: {
    total: 500000,
    breakdown: [
      { projectId: 'x', projectName: 'Project A', value: 250000 },
      { projectId: 'y', projectName: 'Project B', value: 150000 }
    ]
  },

  tmApproved: {
    total: 15000,
    count: 6,
    breakdown: [
      { projectId: 'x', projectName: 'Project A', value: 8000, ticketCount: 3 },
      { projectId: 'y', projectName: 'Project B', value: 5000, ticketCount: 2 }
    ]
  },

  tmBilled: {
    total: 25000,
    count: 10,
    breakdown: [
      { projectId: 'x', projectName: 'Project A', value: 15000, ticketCount: 6 }
    ]
  },

  materialRequestsPending: {
    total: 8,
    breakdown: [
      { projectId: 'x', projectName: 'Project A', count: 3 },
      { projectId: 'y', projectName: 'Project B', count: 5 }
    ]
  },

  revenueAtRisk: {
    total: 75000,
    breakdown: [
      {
        projectId: 'x',
        projectName: 'Project C',
        contractValue: 150000,
        progress: 15,
        atRisk: 75000,
        reason: 'Low progress (15%)'
      }
    ]
  }
}
```

## Implementation Steps

### Step 1: Create New Database Function (SAFE - doesn't modify existing)
File: `src/lib/supabase.js`
Function: `getDashboardMetricsWithBreakdown(companyId)`

This will:
1. Query all projects for the company
2. Query T&M tickets and calculate totals by status
3. Calculate contract values
4. Identify at-risk projects
5. Return structured data with breakdowns

### Step 2: Update Dashboard Component (SAFE - additive changes)
File: `src/components/Dashboard.jsx`

Changes:
1. Call new function instead of old one
2. Update metric cards to show drill-down on hover/click
3. Keep existing project view untouched
4. Add expandable sections for breakdowns

### Step 3: Add Project-Specific Metrics to Project View
File: `src/components/Dashboard.jsx` (project view section)

Add to project view:
1. Pending T&M for THIS project
2. Crew Today for THIS project
3. Material Requests for THIS project

## Safety Checks

### Before Implementation:
- [ ] Verify all table names are correct
- [ ] Test queries in Supabase SQL editor first
- [ ] Ensure no existing functions are modified (only add new ones)
- [ ] Keep old getDashboardMetrics as fallback

### After Implementation:
- [ ] Test with real data
- [ ] Ensure no errors in console
- [ ] Verify drill-down works
- [ ] Confirm totals are accurate

## Rollback Plan

If anything breaks:
1. Keep old `getDashboardMetrics` function intact
2. New function is `getDashboardMetricsWithBreakdown` (separate)
3. Dashboard component can easily switch back to old function
4. No database changes required

## File Changes Summary

### New Files:
None (all changes in existing files)

### Modified Files:
1. `src/lib/supabase.js` - Add new function (doesn't touch existing)
2. `src/components/Dashboard.jsx` - Update UI (backward compatible)
3. `src/index.css` - Add styles for drill-down tooltips

## Estimated Risk: LOW

Reasons:
- No database schema changes
- New function added alongside old one
- Dashboard component changes are additive
- Easy rollback if needed
- No breaking changes to existing code

## Approval Needed

Before proceeding, confirm:
1. ✅ Show project breakdowns in tooltips/expandable sections?
2. ✅ Keep old getDashboardMetrics as fallback?
3. ✅ Test queries in SQL editor before implementing?
4. ✅ Implement in stages (database function first, then UI)?
