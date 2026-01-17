# FieldSync ID & Variable Naming Reference

Quick reference for consistent ID naming across the codebase.

## Primary Entity IDs

| Entity | Database Column | JS Variable | Table Name |
|--------|-----------------|-------------|-----------|
| User | `id` | `userId` | `users` |
| Company | `id` | `companyId` | `companies` |
| Project | `id` | `projectId` | `projects` |
| Area | `id` | `areaId` | `areas` |
| T&M Ticket | `id` | `ticketId` | `t_and_m_tickets` |
| Change Order | `id` | `corId` | `change_orders` |
| Labor Class | `id` | `laborClassId` | `labor_classes` |
| Labor Category | `id` | `categoryId` | `labor_categories` |
| Daily Report | `id` | `reportId` | `daily_reports` |
| Crew Checkin | `id` | `checkinId` | `crew_checkins` |
| Invoice | `id` | `invoiceId` | `invoices` |
| Material/Equipment | `id` | `itemId` | `materials_equipment` |

## Foreign Key Relationships

```
companies
├── projects (company_id)
│   ├── areas (project_id)
│   ├── t_and_m_tickets (project_id)
│   │   ├── t_and_m_workers (ticket_id)
│   │   └── t_and_m_items (ticket_id)
│   ├── change_orders (project_id)
│   │   ├── change_order_labor (change_order_id)
│   │   ├── change_order_materials (change_order_id)
│   │   └── change_order_equipment (change_order_id)
│   ├── daily_reports (project_id)
│   └── crew_checkins (project_id)
├── user_companies (company_id, user_id)
├── labor_categories (company_id)
└── labor_classes (company_id, category_id)
```

## Naming Convention Rules

### Database Columns (snake_case)
```sql
project_id, company_id, user_id, created_at, work_date
```

### JavaScript Variables (camelCase)
```javascript
const projectId = project.id
const companyId = company.id
const userId = user.id
```

### RPC Parameters (p_ prefix + snake_case)
```javascript
await supabase.rpc('validate_pin', {
  p_pin: pin,
  p_company_code: companyCode,
  p_project_id: projectId
})
```

### React Props (camelCase)
```jsx
<TMForm projectId={projectId} companyId={companyId} />
```

## Common Query Patterns

### Filter by Foreign Key
```javascript
// Always use snake_case column names in queries
.eq('project_id', projectId)
.eq('company_id', companyId)
.eq('user_id', userId)
```

### Real-time Subscription Filters
```javascript
filter: `project_id=eq.${projectId}`
filter: `company_id=eq.${companyId}`
```

## Field Session Context

```javascript
// Session object keys
{
  token: 'session_token',      // Auth token
  projectId: 'uuid',           // Current project
  companyId: 'uuid',           // Current company
  projectName: 'string',
  companyName: 'string',
  createdAt: 'ISO timestamp'
}

// Helper functions
getFieldSession()    // Full session object
getFieldProjectId()  // Just the project ID
getFieldCompanyId()  // Just the company ID
isFieldMode()        // Boolean check
```

## Common Mistakes to Avoid

| Wrong | Right | Why |
|-------|-------|-----|
| `.eq('projectId', projectId)` | `.eq('project_id', projectId)` | DB columns are snake_case |
| `p_projectId: id` | `p_project_id: id` | RPC params are snake_case with p_ prefix |
| `user.project_id` in JS | `user.projectId` in JS | JS uses camelCase (after selecting) |
| `project.userId` in query | `project.user_id` in query | Query filters use DB column names |

## ID Types Reference

| Type | Format | Example | Usage |
|------|--------|---------|-------|
| UUID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | `f47ac10b-58cc-4372-a567-0e02b2c3d479` | Primary/foreign keys |
| PIN | 4-6 digit number | `1234` | Project foreman access |
| Company Code | Alphanumeric | `ACME01` | Company lookup |
| COR Number | Sequential | `COR-001` | Change order identifier |
| Invoice Number | Sequential | `INV-2024-001` | Invoice identifier |

## Quick Reference: "Which ID do I use?"

| Context | ID to Use | How to Get It |
|---------|-----------|---------------|
| Current user | `userId` | `auth.getUser()` |
| User's company | `companyId` | `user_companies` table or session |
| Current project (office) | `projectId` | URL param or state |
| Current project (field) | `projectId` | `getFieldProjectId()` |
| Ticket being edited | `ticketId` | Component prop or state |
| COR being viewed | `corId` | Component prop or state |
| Worker's labor class | `laborClassId` | From labor_classes table |

## Adding New Entities Checklist

1. Define table with `id UUID DEFAULT gen_random_uuid() PRIMARY KEY`
2. Add foreign keys with `_id` suffix: `project_id UUID REFERENCES projects(id)`
3. Add `created_at TIMESTAMPTZ DEFAULT NOW()`
4. Use camelCase in JavaScript: `const newEntity = { projectId, ... }`
5. Use snake_case in database operations: `.eq('project_id', projectId)`
6. Document the relationship in this file
