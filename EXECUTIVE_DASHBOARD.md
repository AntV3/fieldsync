# Executive Dashboard

## Overview

The Executive Dashboard provides a comprehensive at-a-glance view of all projects and key metrics for office managers and executives.

## Features

### 1. **Key Metrics Cards**
- **Active Projects**: Total count of active projects
- **Crew Today**: Total number of crew members working across all projects
- **Pending Invoices**: Count and total value of pending T&M tickets awaiting approval
- **Urgent Items**: Count of urgent material requests and pending approvals

### 2. **Time Period Filters**
- Today
- This Week (default)
- This Month

### 3. **Projects Status Section**
Shows all active projects with:
- Progress bars showing completion percentage
- Status indicators (✓ for complete, ⚠️ for over budget or low progress)
- Contract values
- Over-budget badges
- Sorting options:
  - By name (alphabetical)
  - By progress (highest to lowest)
  - By budget status (over budget first)

### 4. **Needs Attention Alerts**
Highlights important items requiring action:
- Over-budget projects (high priority - red)
- T&M tickets pending approval (medium priority - amber)
- Material requests waiting (medium priority - amber)

### 5. **Financial Summary**
Shows financial metrics for the selected time period:
- Labor hours and cost (calculated from T&M tickets)
- Materials cost
- Total T&M submitted

### 6. **Click-Through Navigation**
- Click any project in the list to view detailed project information
- Navigate back to executive dashboard with the "Back to Projects" button

## Database Schema

The executive dashboard requires the following database tables. Run the `database/executive_dashboard_schema.sql` script in your Supabase SQL Editor to set up:

- `companies` - Company information
- `users` - User profiles with roles
- `materials_equipment` - Master list of materials and equipment
- `t_and_m_tickets` - Time & Materials tickets
- `t_and_m_workers` - Labor entries for T&M tickets
- `t_and_m_items` - Material/equipment entries for T&M tickets
- `material_requests` - Material requests from field
- `crew_checkins` - Daily crew check-ins
- `daily_reports` - Daily field reports
- `messages` - Field-office communication

## Usage

1. **Navigate to Dashboard**: Log in as an office user and click the "Dashboard" tab
2. **View Metrics**: See key metrics at the top of the page
3. **Filter Time Period**: Use the dropdown to change the time period (Today/This Week/This Month)
4. **Sort Projects**: Use the sort dropdown to organize projects by name, progress, or budget status
5. **View Alerts**: Check the "Needs Attention" section for urgent items
6. **Review Financials**: See financial summary for the selected time period
7. **Drill Down**: Click any project to view detailed information

## Implementation Details

### Components
- `ExecutiveDashboard.jsx` - Main dashboard component
- Integrates with existing `Dashboard.jsx` for project details

### Styling
All dashboard styles are in `index.css` under the "Executive Dashboard Styles" section

### Data Sources
- Projects progress from `projects` and `areas` tables
- Crew counts from `crew_checkins` table
- Financial data from `t_and_m_tickets`, `t_and_m_workers`, and `t_and_m_items` tables
- Alerts from `material_requests` and pending T&M tickets

### Calculations
- **Labor Costs**: Regular hours @ $50/hr, Overtime @ $75/hr
- **Progress**: Weighted average of area completion
- **Over Budget**: When total spent exceeds billable amount (progress × contract value)

## Future Enhancements

Potential improvements:
- Export dashboard to PDF
- Email notifications for urgent items
- Custom date range selector
- Budget vs. actual charts
- Trend analysis over time
- Project timeline view
- Resource allocation view
- Mobile-optimized responsive design
