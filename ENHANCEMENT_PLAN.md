# FieldSync Professional Enhancement Plan

> Transform FieldSync from a solid MVP into a polished, enterprise-grade construction management platform.

---

## Phase 1: Foundation & Code Quality (First Priority)

These changes make the codebase maintainable, testable, and ready for rapid feature development.

### 1.1 Split Monolithic Components

**Why:** Files over 1,000 lines are hard to maintain, test, and review. Splitting them unlocks parallel development and faster builds.

| File | Lines | Action |
|------|-------|--------|
| `TMForm.jsx` | 2,353 | Already partially split (steps extracted). Extract remaining orchestration logic into `useTMForm` hook. Move utility functions (`calculateHoursFromTimeRange`, `generateRandomId`) to `lib/utils.js`. |
| `Dashboard.jsx` | 1,965 | Extract each tab into its own component: `OverviewTab.jsx`, `FinancialsTab.jsx`, `ReportsTab.jsx`, `AnalyticsTab.jsx`, `DocumentsTab.jsx`, `ProjectInfoTab.jsx`. Dashboard becomes a thin shell with tab routing. |
| `TMList.jsx` | 1,568 | Extract `TMListFilters.jsx`, `TMListTable.jsx`, `TMBulkActions.jsx`. Move sort/filter logic into `useTMListFilters` hook. |
| `SignaturePage.jsx` | 1,320 | Split into `CORSignaturePage.jsx` and `TMSignaturePage.jsx` with shared `SignatureCapture.jsx` component. |
| `corPdfExport.js` | 1,522 | **Delete** - deprecated, replaced by `corPdfGenerator.js`. Audit remaining references and migrate. |

### 1.2 Path Aliases

Add Vite path aliases to eliminate deep relative imports:

```js
// vite.config.js
resolve: {
  alias: {
    '@': '/src',
    '@components': '/src/components',
    '@lib': '/src/lib',
    '@hooks': '/src/hooks',
    '@styles': '/src/styles',
  }
}
```

### 1.3 JSDoc Type Annotations

Add JSDoc types to all database operations, hooks, and utility functions. This provides IDE autocompletion and catches errors without a full TypeScript migration.

```js
/**
 * @typedef {Object} TMTicket
 * @property {string} id
 * @property {string} project_id
 * @property {'draft'|'pending'|'approved'|'billed'} status
 * @property {TMWorker[]} workers
 * @property {TMItem[]} items
 */

/** @param {string} projectId @returns {Promise<TMTicket[]>} */
export async function fetchTMTickets(projectId) { ... }
```

### 1.4 Consistent Error Boundaries

Add React error boundaries around each major section (Dashboard tabs, Foreman views, Forms) with professional fallback UIs instead of white screens.

```jsx
<ErrorBoundary fallback={<ErrorFallback section="Dashboard" />}>
  <DashboardContent />
</ErrorBoundary>
```

### 1.5 Testing Expansion

- Add unit tests for all database operation modules (`db/*.js`)
- Add component tests for form validation logic
- Add integration tests for critical flows: T&M creation, COR export, crew check-in
- Target: 60% code coverage on business logic

---

## Phase 2: UI/UX Design System (Professional Polish)

A consistent, polished UI is what separates professional apps from prototypes.

### 2.1 Design Token System

Create a centralized design token file that enforces consistency:

```css
/* src/styles/tokens.css */
:root {
  /* Spacing scale */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;

  /* Typography scale */
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 2rem;

  /* Border radius */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;

  /* Shadows (elevation system) */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.07);
  --shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
  --shadow-xl: 0 20px 25px rgba(0,0,0,0.1);

  /* Animation */
  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --duration-slow: 350ms;
  --ease-default: cubic-bezier(0.4, 0, 0.2, 1);
}
```

### 2.2 Skeleton Loading States

Replace spinners with content-aware skeleton loaders for every async data load:

- Dashboard cards: Skeleton rectangles matching card layout
- Table rows: Animated placeholder rows
- Forms: Skeleton inputs while data loads
- Charts: Skeleton chart outlines

### 2.3 Micro-Interactions & Transitions

Add subtle, professional animations:

- **Page transitions:** Fade + slight slide between views
- **Card interactions:** Gentle scale on hover, shadow elevation change
- **Button feedback:** Press state with subtle scale (0.98)
- **Success states:** Animated checkmark with confetti-free celebration
- **Toast notifications:** Slide in from top-right with auto-dismiss
- **List items:** Stagger entrance animation on load

### 2.4 Empty States

Design helpful empty states for every list/table:

- Professional illustration or icon
- Clear description of what will appear
- Primary action button to create first item
- Example: "No T&M tickets yet. When your crew submits tickets, they'll appear here."

### 2.5 Responsive Design Audit

- Ensure all Dashboard tabs work on tablet (1024px breakpoint)
- Fix any overflow/scroll issues on mobile Foreman view
- Add proper touch targets (min 44px) for all interactive elements
- Test and fix landscape orientation on mobile

### 2.6 Accessibility (a11y)

- Add ARIA labels to all interactive elements
- Ensure keyboard navigation works for all flows
- Add focus indicators that match the design system
- Ensure color contrast meets WCAG AA (4.5:1 ratio)
- Add `role` attributes to custom widgets (tabs, dialogs, menus)
- Screen reader announcements for async operations

---

## Phase 3: Performance & Architecture

### 3.1 Route-Based Code Splitting

Implement React.lazy + Suspense for all major views:

```jsx
const Dashboard = lazy(() => import('./components/Dashboard'))
const ForemanView = lazy(() => import('./components/ForemanView'))
const TMForm = lazy(() => import('./components/TMForm'))
const CORForm = lazy(() => import('./components/cor/CORForm'))
```

### 3.2 Virtual Lists

Add list virtualization for:
- T&M ticket list (TMList.jsx) - can have hundreds of tickets
- Area list in ForemanView - large projects have 100+ areas
- Crew member lists

Use `@tanstack/react-virtual` for lightweight virtualization.

### 3.3 Image Optimization

- Lazy load all images with `loading="lazy"` and Intersection Observer
- Generate thumbnails for photo galleries (Supabase image transforms)
- Progressive image loading: blur placeholder → full image

### 3.4 Bundle Analysis & Optimization

- Add `rollup-plugin-visualizer` to analyze bundle composition
- Tree-shake unused Lucide icons (import only what's used)
- Evaluate if Recharts can be lazy-loaded (only used in Analytics tab)
- Target: main bundle under 200KB gzipped

### 3.5 Service Worker Improvements

- Precache critical routes and assets
- Background sync for offline queue (instead of polling)
- Cache API responses with stale-while-revalidate strategy

---

## Phase 4: Feature Enhancements

### 4.1 Universal Search (Cmd+K)

A professional command palette that searches across everything:

- Projects, T&M tickets, CORs, workers, documents
- Keyboard shortcut: `Cmd+K` / `Ctrl+K`
- Recent searches saved locally
- Fuzzy matching with highlighted results
- Quick actions: "Create T&M", "New COR", "Check In Crew"

### 4.2 Smart Action Cards (Foreman Home)

Context-aware cards based on time of day and project state:

- **Morning (6-9am):** "Check In Crew" prominent
- **Midday:** "Log T&M" or "Update Progress"
- **End of Day (3-6pm):** "Submit Daily Report" with pre-filled data
- Cards show completion status with animated checkmarks

### 4.3 Toast Notification System

Replace `alert()` calls and inline messages with a professional toast system:

- Stack from top-right corner
- Auto-dismiss after 5s (configurable)
- Types: success, error, warning, info
- Action buttons on toasts (e.g., "Undo", "View")
- Queue management for multiple notifications

### 4.4 Real-Time Sync Indicators

Visual feedback for connection and sync state:

- Status dot in header: green (live), amber (syncing), red (offline)
- "Last synced 2 min ago" timestamp
- Subtle pulse animation on freshly synced data
- Pending changes counter badge

### 4.5 One-Click Report Generation

Pre-configured report templates:

- Weekly progress summary (PDF)
- Monthly T&M export (Excel)
- COR status report (PDF)
- Custom date range exports
- Schedule recurring reports (stretch goal)

### 4.6 Enhanced Crew Check-In

- One-tap from crew roster (no re-entering names)
- "All present" quick button
- Absent worker tracking with reason
- Check-in timestamp and GPS capture

---

## Phase 5: Production Hardening

### 5.1 Structured Logging

Replace console.log with structured log entries:

```js
logger.info('tm_ticket_created', {
  projectId, ticketId, workerCount,
  offline: !navigator.onLine
})
```

### 5.2 Feature Flags

Simple feature flag system for safe rollouts:

```js
const flags = {
  universalSearch: true,
  smartActionCards: false,
  voiceInput: false,
}
```

### 5.3 Health Monitoring

- Client-side error tracking (integrate Sentry or similar)
- Performance metrics (Core Web Vitals)
- Offline queue depth monitoring
- API latency tracking

### 5.4 Security Hardening

- Content Security Policy headers
- Subresource Integrity for CDN assets
- Rate limiting awareness in UI (show "slow down" messages)
- Session timeout with graceful re-auth

### 5.5 Database Migration Cleanup

- Consolidate 52 migration files into a clean baseline schema
- Add migration numbering/versioning convention
- Document rollback procedures for each migration

---

## Implementation Order

```
Phase 1 (Foundation)     ████████████░░░░░░░░  ~2-3 weeks
  ├─ 1.1 Split components
  ├─ 1.2 Path aliases
  ├─ 1.3 JSDoc types
  ├─ 1.4 Error boundaries
  └─ 1.5 Test expansion

Phase 2 (UI/UX)          ░░░░████████████░░░░  ~2-3 weeks
  ├─ 2.1 Design tokens
  ├─ 2.2 Skeleton loaders
  ├─ 2.3 Micro-interactions
  ├─ 2.4 Empty states
  ├─ 2.5 Responsive audit
  └─ 2.6 Accessibility

Phase 3 (Performance)    ░░░░░░░░████████░░░░  ~1-2 weeks
  ├─ 3.1 Code splitting
  ├─ 3.2 Virtual lists
  ├─ 3.3 Image optimization
  ├─ 3.4 Bundle optimization
  └─ 3.5 Service worker

Phase 4 (Features)       ░░░░░░░░░░░░████████  ~3-4 weeks
  ├─ 4.1 Universal search
  ├─ 4.2 Smart action cards
  ├─ 4.3 Toast system
  ├─ 4.4 Sync indicators
  ├─ 4.5 Report generation
  └─ 4.6 Enhanced crew check-in

Phase 5 (Hardening)      ░░░░░░░░░░░░░░░░████  ~1-2 weeks
  ├─ 5.1 Structured logging
  ├─ 5.2 Feature flags
  ├─ 5.3 Health monitoring
  ├─ 5.4 Security hardening
  └─ 5.5 Migration cleanup
```

---

## Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| Largest component file | 2,353 lines | < 500 lines |
| Test coverage (business logic) | ~20% | > 60% |
| Lighthouse Performance score | Unknown | > 90 |
| Lighthouse Accessibility score | Unknown | > 90 |
| Main bundle size (gzipped) | ~500KB | < 200KB |
| Time to Interactive | Unknown | < 3s |
| a11y violations | Unknown | 0 critical |
| TypeScript/JSDoc coverage | 0% | > 80% key interfaces |

---

## Principles

1. **Ship incrementally** - Each sub-task should be a deployable PR
2. **No regressions** - Every change must pass existing tests
3. **Professional defaults** - Every screen should look polished out of the box
4. **Mobile-first** - Foreman view drives design decisions
5. **Offline-resilient** - Never assume connectivity
6. **Accessibility is not optional** - Built in from the start, not bolted on
