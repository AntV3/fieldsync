# FieldSync Developer Guide

> Onboarding guide for new engineers. Coding conventions, patterns, and common tasks.
> Last updated: 2025-01-04

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Project Structure](#2-project-structure)
3. [Coding Conventions](#3-coding-conventions)
4. [Common Patterns](#4-common-patterns)
5. [Do's and Don'ts](#5-dos-and-donts)
6. [How To: Common Tasks](#6-how-to-common-tasks)
7. [Debugging Tips](#7-debugging-tips)
8. [Known Gotchas](#8-known-gotchas)

---

## 1. Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- Git
- A code editor (VS Code recommended)

### Setup

```bash
# Clone the repository
git clone <repo-url>
cd fieldsync-source

# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Fill in your Supabase credentials

# Start development server
npm run dev
```

### Environment Variables

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Important:** Never commit `.env` files. They contain secrets.

### Running Without Supabase (Demo Mode)

If you don't set Supabase credentials, the app runs in demo mode using localStorage. This is useful for:
- UI development
- Testing components in isolation
- Demos without backend

---

## 2. Project Structure

```
fieldsync-source/
├── src/
│   ├── App.jsx                 # Root component, routing, auth state
│   ├── main.jsx                # Entry point
│   ├── index.css               # All styles (monolithic)
│   │
│   ├── components/             # React components
│   │   ├── Dashboard.jsx       # Office main view (LARGE - 1,965 lines)
│   │   ├── ForemanView.jsx     # Field crew view
│   │   ├── TMForm.jsx          # T&M ticket form (LARGE - 2,353 lines)
│   │   ├── TMList.jsx          # T&M ticket list
│   │   ├── SignaturePage.jsx   # Public signature collection
│   │   │
│   │   ├── cor/                # Change Order Request components
│   │   │   ├── CORForm.jsx
│   │   │   ├── CORDetail.jsx
│   │   │   ├── CORList.jsx
│   │   │   └── ...
│   │   │
│   │   ├── pricing/            # Pricing management
│   │   │   ├── LaborRatesSection.jsx
│   │   │   └── ...
│   │   │
│   │   └── [other components]
│   │
│   ├── lib/                    # Utilities and services
│   │   ├── supabase.js         # Database facade (LARGE - 5,926 lines)
│   │   ├── corExportPipeline.js    # COR export orchestration
│   │   ├── corPdfGenerator.js      # PDF generation (preferred)
│   │   ├── corPdfExport.js         # PDF generation (DEPRECATED)
│   │   ├── corCalculations.js      # COR math utilities
│   │   ├── offlineManager.js       # IndexedDB operations
│   │   ├── imageUtils.js           # Image compression
│   │   ├── utils.js                # General utilities
│   │   ├── BrandingContext.jsx     # Branding provider
│   │   └── ThemeContext.jsx        # Theme provider
│   │
│   └── archived/               # Deprecated components (DO NOT USE)
│
├── database/                   # SQL migrations
│   ├── schema.sql
│   ├── migration_*.sql
│   └── ...
│
├── docs/                       # Documentation
│   ├── PROJECT_CONTEXT.md      # Canonical source of truth
│   ├── ARCHITECTURE.md         # System architecture
│   ├── DEVELOPER_GUIDE.md      # This file
│   ├── CODE_MAP.md             # File reference
│   └── daily log.md            # Development history
│
└── public/                     # Static assets
```

---

## 3. Coding Conventions

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `TMForm.jsx`, `CORDetail.jsx` |
| Utilities | camelCase | `corCalculations.js`, `imageUtils.js` |
| CSS Classes | kebab-case | `.cor-detail-header`, `.tm-form-step` |
| Database methods | camelCase with verb prefix | `getProjects`, `createTMTicket`, `updateArea` |
| State variables | camelCase | `selectedProject`, `isLoading` |
| Event handlers | `on` prefix + verb | `onSubmit`, `onCancel`, `onShowToast` |
| Boolean states | `is`/`has`/`show` prefix | `isLoading`, `hasErrors`, `showModal` |

### File Naming Patterns

| Pattern | Meaning |
|---------|---------|
| `*Form.jsx` | Form component for creating/editing |
| `*List.jsx` | List/table display component |
| `*Detail.jsx` | Detail view component |
| `*Page.jsx` | Full-page component |
| `*Section.jsx` | Sub-section of a larger component |
| `*Manager.jsx` | Admin management component |
| `*Context.jsx` | React context provider |

### Component Structure

```jsx
// Standard component structure
import React, { useState, useEffect, useMemo } from 'react'
import { SomeIcon } from 'lucide-react'
import { db } from '../lib/supabase'

export default function ComponentName({
  requiredProp,
  optionalProp = 'default',
  onAction
}) {
  // 1. State declarations
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // 2. Computed values
  const computedValue = useMemo(() => {
    return data.filter(item => item.active)
  }, [data])

  // 3. Effects
  useEffect(() => {
    loadData()
  }, [requiredProp])

  // 4. Event handlers
  const handleSubmit = async () => {
    try {
      setLoading(true)
      await db.someOperation(data)
      onAction?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // 5. Render
  if (loading) return <div className="loading">Loading...</div>
  if (error) return <div className="error">{error}</div>

  return (
    <div className="component-name">
      {/* Component content */}
    </div>
  )
}
```

### CSS Conventions

```css
/* Component-scoped classes */
.component-name { }
.component-name-header { }
.component-name-body { }
.component-name-footer { }

/* State modifiers */
.component-name.loading { }
.component-name.error { }
.component-name.active { }

/* Use CSS variables for theming */
.component-name {
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}
```

### Available CSS Variables

```css
/* Backgrounds */
--bg-primary, --bg-secondary, --bg-tertiary, --bg-card

/* Text */
--text-primary, --text-secondary, --text-muted

/* Borders */
--border-color, --border-light

/* Accents */
--accent-blue, --accent-green, --accent-orange, --accent-red

/* Status colors */
--status-complete, --status-in-progress, --status-pending
```

---

## 4. Common Patterns

### Pattern 1: Data Loading

```jsx
const [data, setData] = useState([])
const [loading, setLoading] = useState(true)

useEffect(() => {
  const loadData = async () => {
    try {
      setLoading(true)
      const result = await db.getSomething(id)
      setData(result)
    } catch (error) {
      console.error('Error loading:', error)
      onShowToast?.('Error loading data', 'error')
    } finally {
      setLoading(false)
    }
  }
  loadData()
}, [id])
```

### Pattern 2: Form Submission

```jsx
const [saving, setSaving] = useState(false)

const handleSubmit = async () => {
  try {
    setSaving(true)
    await db.createSomething(formData)
    onShowToast?.('Created successfully', 'success')
    onClose?.()
  } catch (error) {
    console.error('Error creating:', error)
    onShowToast?.('Error creating', 'error')
  } finally {
    setSaving(false)
  }
}

// In render:
<button onClick={handleSubmit} disabled={saving}>
  {saving ? 'Saving...' : 'Save'}
</button>
```

### Pattern 3: Modal/Dialog State

```jsx
const [showModal, setShowModal] = useState(false)
const [editingItem, setEditingItem] = useState(null)

// Open for create
const handleCreate = () => {
  setEditingItem(null)
  setShowModal(true)
}

// Open for edit
const handleEdit = (item) => {
  setEditingItem(item)
  setShowModal(true)
}

// Close
const handleClose = () => {
  setShowModal(false)
  setEditingItem(null)
}
```

### Pattern 4: Toast Notifications

```jsx
// Components receive onShowToast prop from parent
const handleAction = async () => {
  try {
    await db.doSomething()
    onShowToast?.('Action successful', 'success')
  } catch (error) {
    onShowToast?.('Action failed', 'error')
  }
}

// Toast types: 'success', 'error', 'info', 'warning'
```

### Pattern 5: Multi-Step Forms

```jsx
const [step, setStep] = useState(1)
const totalSteps = 5

const nextStep = () => setStep(s => Math.min(s + 1, totalSteps))
const prevStep = () => setStep(s => Math.max(s - 1, 1))

// Render step content
const renderStep = () => {
  switch (step) {
    case 1: return <Step1 />
    case 2: return <Step2 />
    // ...
  }
}
```

### Pattern 6: Debounced Refresh (Real-time)

```jsx
const debouncedRefresh = useMemo(
  () => debounce(() => {
    loadData()
  }, 150),
  []
)

useEffect(() => {
  const subscription = db.subscribeToChanges(id, {
    onChange: debouncedRefresh
  })
  return () => subscription?.unsubscribe()
}, [id])
```

---

## 5. Do's and Don'ts

### DO

- **Use `db.*` methods** for all database operations
- **Handle loading and error states** in every component
- **Use CSS variables** for colors to support theming
- **Add `?.` optional chaining** for callback props (`onShowToast?.()`)
- **Clean up subscriptions** in useEffect return
- **Use existing components** before creating new ones
- **Check archived/ folder** before reimplementing something

### DON'T

- **Don't import Supabase client directly** - use `db` facade
- **Don't use localStorage** for app data (only for demo mode)
- **Don't create new signature components** - use existing ones
- **Don't add to `index.css` without checking for existing styles**
- **Don't use `AuthContext.jsx`** - it's not wired up (use App.jsx state)
- **Don't use components from `src/archived/`** - they're deprecated
- **Don't hardcode colors** - use CSS variables

### AVOID

- **Prop drilling more than 2 levels** - consider context or refactoring
- **Components over 500 lines** - split into sub-components
- **useEffect with many dependencies** - likely a design issue
- **Inline styles** - use CSS classes

---

## 6. How To: Common Tasks

### Add a New Database Query

1. Open `src/lib/supabase.js`
2. Find the relevant section (projects, areas, tickets, etc.)
3. Add your method to the `db` object:

```javascript
// In the db object
async getMyNewData(companyId) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('my_table')
      .select('*')
      .eq('company_id', companyId)
    if (error) throw error
    return data || []
  } else {
    // localStorage fallback for demo mode
    const stored = JSON.parse(localStorage.getItem('demo_my_data') || '[]')
    return stored.filter(d => d.company_id === companyId)
  }
}
```

### Add a New Component

1. Create file in `src/components/` (or subdirectory if feature-specific)
2. Follow the component structure template
3. Import `db` for data access
4. Add styles to `src/index.css` at the bottom

### Add a New Migration

1. Create file in `database/` with naming: `migration_[feature_name].sql`
2. Add comments explaining the migration
3. Run in Supabase SQL Editor
4. Update `docs/PROJECT_CONTEXT.md` migration history

### Add a Toast Message

```jsx
// In your component
onShowToast?.('Your message here', 'success')  // or 'error', 'info', 'warning'
```

### Add PDF Content

1. Open `src/lib/corPdfGenerator.js` (preferred) or `corPdfExport.js`
2. Use jsPDF methods:

```javascript
doc.setFontSize(12)
doc.setFont('helvetica', 'bold')
doc.text('Your text', x, y)
doc.setDrawColor(200, 200, 200)
doc.line(x1, y1, x2, y2)
```

---

## 7. Debugging Tips

### Check Network Requests

1. Open browser DevTools → Network tab
2. Filter by "Fetch/XHR"
3. Look for Supabase requests to `/rest/v1/`

### Check RLS Issues

If data isn't loading:
1. Check browser console for 406 errors
2. Verify user has `status = 'active'` in `user_companies`
3. Check RLS policies in Supabase dashboard

### Check Offline Mode

```javascript
// In browser console
localStorage.getItem('fieldsync_connection_status')
// or
indexedDB.open('fieldsync').onsuccess = (e) => {
  console.log(e.target.result.objectStoreNames)
}
```

### Common Console Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `406 Not Acceptable` | RLS policy blocked | Check user membership status |
| `409 Conflict` | Duplicate unique value | Check for existing records |
| `TypeError: Cannot read property of null` | Missing optional chaining | Add `?.` |
| `React hooks called out of order` | Conditional hook | Move hooks before conditionals |

### Enable Verbose Logging

```javascript
// In supabase.js, uncomment debug lines or add:
console.log('[DB]', 'methodName', params)
```

---

## 8. Known Gotchas

### Gotcha 1: Projects vs ProjectsData

In `Dashboard.jsx`:
- `projects` = list of project objects
- `projectsData` = projects with additional computed fields

When in doubt, use the one passed as props.

### Gotcha 2: COR Status Flow

```
draft → pending_approval → approved → billed → closed
```

Only `draft`, `pending_approval`, and `approved` CORs are editable.

### Gotcha 3: Ticket-COR Association

Tickets link to CORs in two places:
1. `t_and_m_tickets.assigned_cor_id` (direct FK)
2. `change_order_ticket_associations` table (junction)

Both must be in sync. A trigger handles this, but be aware.

### Gotcha 4: Photo Storage

Photos are stored as:
- URLs in the database (pointing to Supabase Storage)
- Base64 data in some legacy cases

Always check for both formats.

### Gotcha 5: Signature Components

There are 4+ signature-related components. Use:
- `EnhancedSignatureCapture` for modal signature capture
- `SignaturePage` is a full page for public links (don't import into other components)

### Gotcha 6: Version Field on CORs

The `change_orders.version` field auto-increments on changes via trigger. Don't manually set it.

### Gotcha 7: Foreman vs Office Access

Foremen access via PIN - no Supabase auth. Their requests go through as `anon` role. RLS policies must allow anon access for field operations.

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────────┐
│ QUICK REFERENCE                                                  │
├─────────────────────────────────────────────────────────────────┤
│ Start dev server:     npm run dev                               │
│ Build:                npm run build                             │
│ Database access:      import { db } from '../lib/supabase'      │
│ Icons:                import { IconName } from 'lucide-react'   │
│ Toast:                onShowToast?.('message', 'success')       │
│ Loading state:        const [loading, setLoading] = useState()  │
├─────────────────────────────────────────────────────────────────┤
│ CSS Variables:        var(--bg-primary), var(--text-primary)    │
│ Component location:   src/components/                           │
│ Utilities location:   src/lib/                                  │
│ Migrations:           database/migration_*.sql                  │
│ Main docs:            docs/PROJECT_CONTEXT.md                   │
└─────────────────────────────────────────────────────────────────┘
```

---

*See also: [ARCHITECTURE.md](./ARCHITECTURE.md) for system design, [CODE_MAP.md](./CODE_MAP.md) for file reference*
