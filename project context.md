# FieldSync - Project Context

## Overview

FieldSync is a construction progress tracking application that connects field crews to the office with real-time visibility. It enables demolition/abatement contractors to track project progress, manage T&M (Time & Materials) tickets, create Change Order Requests (CORs), and maintain communication between field and office.

## Tech Stack

- **Frontend**: React 18 + Vite 7
- **Backend**: Supabase (PostgreSQL + Realtime + Storage + Auth)
- **Styling**: Custom CSS with CSS variables for theming (light/dark mode)
- **Hosting**: Vercel
- **Icons**: Lucide React

## Authentication Model

### Office Users
- Email + password authentication via Supabase Auth
- Full access to dashboard, project management, COR creation, reporting
- `auth.uid()` is present for all queries

### Field Users (Foremen)
- PIN-based authentication (no Supabase Auth session)
- Enter Company Code → Project PIN → Access ForemanView
- `auth.uid()` is NULL - uses `anon` role with project-based RLS policies
- Can create T&M tickets, link to CORs, check-in crews, log disposal loads

## Key Features

### Office Dashboard
- Project progress overview with billable amounts
- Area/task management with percentage weights
- T&M ticket review and approval
- COR (Change Order Request) creation and management
- Daily reports, injury reports, material requests
- Labor rates and pricing configuration
- PDF export for CORs

### Field App (ForemanView)
- Two-tab interface: **Actions** and **Progress**
- **Actions Tab**: T&M Ticket, Crew Check-in, Disposal Loads, Materials, Messages, Daily Report, Report Injury
- **Progress Tab**: Area status updates (Working/Done)
- Bilingual support (English/Spanish) in T&M form
- Photo capture with compression

## Database Tables

### Core Tables
- `companies` - Multi-tenant company accounts
- `projects` - Construction projects with PINs
- `areas` - Project areas/tasks with progress tracking
- `user_companies` - User-company memberships

### T&M System
- `t_and_m_tickets` - Time & Materials tickets
- `t_and_m_workers` - Worker entries per ticket
- `t_and_m_items` - Materials/equipment per ticket
- `materials_equipment` - Company material catalog
- `labor_rates` - Labor rate configurations

### COR System
- `change_orders` - Change Order Requests (main table)
- `change_order_labor` - Labor line items
- `change_order_materials` - Material line items
- `change_order_equipment` - Equipment line items
- `change_order_subcontractors` - Subcontractor line items
- `change_order_ticket_associations` - Junction table linking tickets to CORs

### Supporting Tables
- `crew_checkins` - Daily crew check-ins
- `disposal_loads` - Disposal/dump load tracking
- `dump_sites` - Dump site management
- `daily_reports` - End-of-day reports
- `injury_reports` - Incident documentation
- `material_requests` - Material order requests
- `messages` - Project messaging

## COR Workflow

1. **Create COR**: Office creates a COR (status: `draft`)
2. **Link Tickets**: Field/Office links T&M tickets to COR via `assigned_cor_id`
3. **Import Data**: T&M data auto-imports to COR (labor, materials, equipment)
4. **Review & Edit**: Office reviews, adjusts rates, adds markups
5. **Submit**: Status changes to `pending_approval`
6. **Approve**: Status changes to `approved`
7. **Bill**: Status changes to `billed` (tickets become read-only)

### COR Statuses
- `draft` - Being created/edited
- `pending_approval` - Submitted for review
- `approved` - Approved by client
- `billed` - Invoiced (locked)
- `archived` - Historical record

## RLS (Row Level Security) Policies

### Authenticated Users (Office)
- Full CRUD on company resources via `user_companies` check
- `auth.uid()` must match a user in `user_companies` for the company

### Anonymous Users (Field)
- SELECT on CORs, labor rates, materials, equipment
- INSERT on T&M tickets, workers, items, ticket-COR associations
- INSERT on COR line items (for T&M import)
- Secured by project PIN validation before access

## Key Files

### Components
- `src/components/ForemanView.jsx` - Main field interface
- `src/components/TMForm.jsx` - T&M ticket creation wizard
- `src/components/TMList.jsx` - Office T&M management
- `src/components/Dashboard.jsx` - Office main dashboard
- `src/components/CrewCheckin.jsx` - Crew check-in form
- `src/components/DisposalLoadInput.jsx` - Disposal logging

### Library
- `src/lib/supabase.js` - All database operations (~4700 lines)
- `src/lib/utils.js` - Utility functions
- `src/lib/imageUtils.js` - Image compression

### Database
- `database/migration_change_orders.sql` - COR table definitions
- `supabase/migrations/` - Incremental migrations

## Recent Changes (December 2024)

### COR-Ticket Linking Fix
- Fixed TMList.jsx calling non-existent functions
- Corrected parameter order for `assignTicketToCOR`
- Added atomic RPC functions for ticket-COR association

### Field COR Access (20241230)
- Added RLS policies for `anon` role to view CORs
- Field users can now see and link to CORs when creating T&M tickets
- Enabled T&M data import to CORs from field

### Foreman UI Refactor
- Converted Crew Check-in and Disposal Loads to action button cards
- Added tab color differentiation (blue=Actions, green=Progress)
- Removed deprecated Haul-Off feature (replaced by Disposal Loads)

### COR Number Conflict Fix
- Fixed `getNextCORNumber` to find actual max instead of most recent
- Added retry logic for 409 conflicts

### Ticket-COR Junction Sync (20241230)
- Added reverse sync trigger: when `assigned_cor_id` is set on a ticket,
  automatically creates entry in `change_order_ticket_associations`
- Fixes issue where linked tickets didn't appear in COR detail view
- Fixes PDF export not including backup documentation
- Also backfills existing tickets missing junction entries

## Environment Variables

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Development

```bash
npm install
npm run dev      # Start dev server (http://localhost:5173)
npm run build    # Production build
```

## Deployment

Deployed via Vercel with GitHub integration. Environment variables configured in Vercel dashboard.
