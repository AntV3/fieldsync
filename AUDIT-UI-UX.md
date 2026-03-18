# FieldSync UI/UX Audit Report

**Date:** 2026-03-18
**Scope:** Full UI/UX audit covering accessibility, performance, and consistency
**Components Reviewed:** 60+ across auth, dashboard, forms, charts, documents, equipment, billing, and field views

---

## Executive Summary

FieldSync is a well-structured React + Vite + Tailwind CSS construction management app with strong architectural foundations (design tokens, reusable UI primitives, code-splitting). However, the audit uncovered **~100+ improvement opportunities** across three categories:

| Category | Critical | Medium | Low | Total |
|----------|----------|--------|-----|-------|
| Accessibility | 8 | 7 | 3 | 18 |
| Performance | 6 | 8 | 3 | 17 |
| UX Consistency | 5 | 6 | 4 | 15 |
| **Total** | **19** | **21** | **10** | **50** |

---

## 1. Accessibility Issues

### 1.1 CRITICAL: Missing aria-labels on icon-only buttons (15+ instances)

Several icon-only buttons lack `aria-label`, making them invisible to screen readers.

| File | Line(s) | Element |
|------|---------|---------|
| `src/components/spx/ProjectTable.jsx` | 60-72 | "More options" button (MoreHorizontal icon) |
| `src/components/spx/NavBar.jsx` | 45 | Settings gear icon button |
| `src/components/spx/MobileTabBar.jsx` | 31-40 | All tab bar items (icon-only navigation) |
| `src/components/CrewCheckin.jsx` | 452, 460 | Sign-in and close buttons |
| `src/components/ProjectTeam.jsx` | 174 | "Remove from project" button |
| `src/components/InjuryReportForm.jsx` | 209 | Close button ("×" character) |
| `src/components/ui/Pagination.jsx` | 36-72 | First/Prev/Next/Last page buttons (have `title` but no `aria-label`) |

**Fix:** Add `aria-label` to all icon-only buttons describing their action.

### 1.2 CRITICAL: Keyboard navigation gaps (8+ instances)

Interactive `<div>` elements with `onClick` handlers missing keyboard support (`role`, `tabIndex`, `onKeyDown`):

| File | Line(s) | Element |
|------|---------|---------|
| `src/components/spx/ProjectTable.jsx` | 39-73 | Project row divs (clickable but not keyboard-focusable) |
| `src/components/PhotoTimeline.jsx` | 372-408, 422-454 | Photo grid items |
| `src/components/spx/ProjectTable.jsx` | 24-77 | Table-like layout using divs — missing `role="table"` semantics |

**Fix:** Convert to semantic `<button>` elements or add `role="button"`, `tabIndex={0}`, and `onKeyDown` handlers.

### 1.3 CRITICAL: Missing skip-to-content link

CSS for `.skip-link` is defined in `src/styles/utilities/accessibility.css` (lines 62-80) but no skip link is rendered in `App.jsx`.

**Fix:** Add `<a href="#main-content" className="skip-link">Skip to main content</a>` at the top of the app and `id="main-content"` on the main content area.

### 1.4 MEDIUM: Color contrast concerns

Potential WCAG 2.1 AA failures (4.5:1 ratio required for normal text):

- `--accent-amber: #F5A623` — amber text on light backgrounds
- `--status-warning: #F5A623` on `--status-warning-bg: #FFF3CD`
- `--text-tertiary: #8A8A8A` — disabled/muted text may fail contrast

**Fix:** Validate all color combinations with a WCAG contrast checker; darken amber/warning colors.

### 1.5 MEDIUM: Missing ARIA on custom components

| File | Element | Missing |
|------|---------|---------|
| `src/components/ui/CollapsibleSection.jsx` | Toggle button | `aria-controls` linking to content panel |
| `src/components/ui/InfoTooltip.jsx` | Info icon | Should be `<button>` with `aria-describedby` |
| `src/components/spx/MobileTabBar.jsx` | Tab links | `aria-current="page"` on active tab |
| `src/components/UniversalSearch.jsx` | Results container | `aria-live="polite"` for dynamic results |

### 1.6 MEDIUM: Touch targets below 44×44px

The `src/components/spx/Button.jsx` base padding (`py-[12px]`) yields ~36px height. While `buttons.css` sets `min-height: 44px` at mobile breakpoints, the SPX Button component doesn't inherit these styles.

**Fix:** Apply `.touch-target` utility class or explicit `min-height: 44px` on mobile.

---

## 2. Performance Issues

### 2.1 CRITICAL: Missing useMemo on expensive computations (15+ locations)

| File | Line(s) | Computation |
|------|---------|-------------|
| `src/components/Dashboard.jsx` | 139, 146 | `projects.map(p => p.id).sort().join(',')` on every render |
| `src/components/Dashboard.jsx` | 383, 426 | Crew history mapping and date calculations |
| `src/components/Dashboard.jsx` | 570 | `data.map(project => ({...}))` — full project list transformation |
| `src/components/UniversalSearch.jsx` | 77-84 | `getAllResults()` recalculates on every keystroke |
| `src/components/ForemanView.jsx` | 226-237 | `calculateProgress()` and `groupedAreas` |

**Fix:** Wrap in `useMemo()` with appropriate dependency arrays.

### 2.2 CRITICAL: Excessive useState declarations (state fragmentation)

| File | Count | Impact |
|------|-------|--------|
| `src/components/InjuryReportForm.jsx` | 30+ `useState` calls | 30 independent state updates possible |
| `src/components/TMForm.jsx` | 19 `useState` calls | Similar fragmentation |
| `src/components/Dashboard.jsx` | 15+ `useState` calls | Many related states |

**Fix:** Consolidate related state into `useReducer` or grouped state objects (e.g., `formData`, `uiState`).

### 2.3 CRITICAL: Inline function definitions in render loops (10+ instances)

| File | Line(s) | Pattern |
|------|---------|---------|
| `src/components/Dashboard.jsx` | 1007 | `onClick={() => setActiveProjectTab(tab.id)}` in `.map()` |
| `src/components/Dashboard.jsx` | 1009-1022 | Complex `onKeyDown` handler created per tab |
| `src/components/overview/OverviewCrewMetrics.jsx` | ~290-310 | `onClick={() => setTimeRange(range.id)}` in loop |

**Fix:** Extract to `useCallback` handlers or component-level functions.

### 2.4 MEDIUM: Missing React.memo on leaf components

Components that receive stable props but re-render on parent changes:

- `src/components/dashboard/EnhancedProjectCard.jsx` — renders per project, not memoized
- `src/components/InjuryReportForm.jsx` — complex form, not memoized
- `src/components/Dashboard.jsx` — 1,264-line component, not memoized

**Good examples already in codebase:** `OverviewProgressGauge`, `OverviewFinancialCard`, `Skeleton` — all properly memoized.

### 2.5 MEDIUM: Context provider re-render cascade

`src/lib/BrandingContext.jsx` (line 21-37): Context value is not wrapped in `useMemo()`, causing all consumers to re-render on any branding change.

**Fix:**
```jsx
const value = useMemo(() => ({ branding, updateBranding }), [branding]);
return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
```

### 2.6 MEDIUM: Large lists without virtualization

| File | Issue |
|------|-------|
| `src/components/TMList.jsx` | `MAX_TICKETS_IN_MEMORY = 500` — all in DOM |
| `src/components/InjuryReportsList.jsx` | Nested `.map()` renders all reports per month |
| `src/components/DailyReportsList.jsx` | Full filtered list rendered |
| `src/components/dashboard/PortfolioView.jsx` | All project cards rendered |

**Fix:** Consider `react-window` or `@tanstack/virtual` for lists exceeding ~50 items.

### 2.7 MEDIUM: useEffect dependency issues

| File | Line | Issue |
|------|------|-------|
| `src/App.jsx` | 165 | ESLint disable comment — missing `loadProjects` in deps |
| `src/components/PhotoTimeline.jsx` | 157 | Missing handler functions in deps |
| `src/components/PhotoTimeline.jsx` | 240-244 | Potential infinite update loop from `availableDates` dependency |

### 2.8 LOW: Real-time subscriptions trigger full reloads

`src/components/PunchList.jsx` (line 64-79) and `ForemanView.jsx` call full `loadItems()` on any Supabase change event. Consider targeted updates (insert/update/delete) instead of full reloads.

---

## 3. UX Consistency Issues

### 3.1 CRITICAL: Inconsistent loading states

| Component | Pattern | Issue |
|-----------|---------|-------|
| `CrewCheckin.jsx` | `ListItemSkeleton` | Correct |
| `ManDayCosts.jsx` (line 69-77) | Plain "Loading..." text | No skeleton |
| `PhotoTimeline.jsx` | `loading` state, no visual | No loading UI |
| `MaterialRequestsList.jsx` | `loading` state, no skeleton | No loading UI |
| `DocumentsTab.jsx` | `loading` state, unclear rendering | Inconsistent |

**Fix:** Standardize on skeleton loaders (`ListItemSkeleton`, `CardSkeleton`, `ChartSkeleton`) for all data-loading states.

### 3.2 CRITICAL: Inconsistent error handling

| Component | Pattern | Issue |
|-----------|---------|-------|
| `CrewCheckin.jsx` | `onShowToast?.('Error...', 'error')` | Correct (callback) |
| `DailyReportsList.jsx` | `onShowToast?.('Error...', 'error')` | Correct (callback) |
| `ForemanView.jsx` | `console.error` only | Silent failure |
| `ManDayCosts.jsx` | `console.error` only | Silent failure |
| `PhotoTimeline.jsx` | No error state | Missing entirely |

**Fix:** All data-loading failures should show user-visible feedback via `onShowToast` callback or `ErrorState` component.

### 3.3 CRITICAL: Missing empty states

| Component | Has EmptyState? |
|-----------|----------------|
| `CrewCheckin.jsx` | Yes (correct) |
| `ManDayCosts.jsx` | Custom HTML (inconsistent) |
| `PhotoTimeline.jsx` | No |
| `PunchList.jsx` | No |
| `CORList.jsx` | No |

**Fix:** Use the standardized `EmptyState` component (`src/components/ui/ErrorState.jsx`) in all list/data components.

### 3.4 MEDIUM: Toast notification fragmentation

Two patterns coexist:
1. **Callback pattern** (`onShowToast` prop) — used by CrewCheckin, DailyReportsList, MaterialRequestsList
2. **Local state pattern** (`const [toast, setToast] = useState(null)`) — used by InjuryReportsList, InjuryReportForm

A centralized `ToastContext` exists at `src/lib/ToastContext.jsx` but isn't universally adopted.

**Fix:** Migrate all components to use the centralized toast system via `useToast()` hook or consistent `onShowToast` callback.

### 3.5 MEDIUM: Button style inconsistency

- Standard: `btn btn-primary`, `btn btn-secondary` (defined in `buttons.css`)
- Custom: `crew-signin-btn`, `crew-remove-btn` in CrewCheckin.jsx
- Text-based toggles: `▶ Details` / `▼ Collapse` in ManDayCosts.jsx instead of icon buttons

**Fix:** Standardize all buttons on the design system classes. Use `ChevronRight`/`ChevronDown` icons for expand/collapse.

### 3.6 MEDIUM: Inline spacing instead of design tokens

Some components use hardcoded spacing values instead of CSS custom properties:

| File | Line | Inline Value | Should Be |
|------|------|-------------|-----------|
| `CrewCheckin.jsx` | 392 | `gap: '0.5rem'` | `var(--space-xs)` |
| `ConfirmDialog.jsx` | 103-104 | Inline style block | CSS class |

**Fix:** Replace all inline spacing with design token references.

### 3.7 LOW: Form validation inconsistency

- `AddCostModal.jsx` — validates at submit, shows inline errors (correct)
- `InjuryReportForm.jsx` — validates per-step, uses toast for errors (different pattern)
- `DailyReport.jsx` — no clear validation

**Fix:** Standardize on inline validation using the `FormField` component's `error` prop.

---

## 4. Recommended Priority Actions

### Phase 1 — Quick Wins (Low effort, high impact)

1. Add `aria-label` to all icon-only buttons (~15 instances)
2. Add skip-to-content link in `App.jsx`
3. Wrap `BrandingContext` value in `useMemo()`
4. Replace "Loading..." text with skeleton components
5. Add `onShowToast` error callbacks to components with silent failures

### Phase 2 — Consistency Pass (Medium effort)

6. Standardize empty states using `EmptyState` component
7. Migrate local toast states to centralized `useToast()` hook
8. Add `useMemo()` to expensive computations in Dashboard, UniversalSearch, ForemanView
9. Convert interactive divs to semantic buttons with keyboard support
10. Standardize button classes (remove custom button CSS)

### Phase 3 — Architecture Improvements (Higher effort)

11. Consolidate `useState` fragmentation in InjuryReportForm (30→5 states) and TMForm (19→5 states)
12. Extract inline render-loop handlers to `useCallback`
13. Add `React.memo()` to leaf components (EnhancedProjectCard, etc.)
14. Validate and fix color contrast issues (amber/warning colors)
15. Consider list virtualization for TMList, InjuryReportsList (500+ items)

### Phase 4 — Polish

16. Add `aria-controls` to CollapsibleSection, `aria-live` to UniversalSearch
17. Convert InfoTooltip icon to semantic `<button>`
18. Add `aria-current="page"` to MobileTabBar active tab
19. Fix useEffect dependency warnings (App.jsx line 165, PhotoTimeline)
20. Replace inline spacing values with design tokens

---

## What's Working Well

- **Design token system** — well-organized CSS custom properties in `variables.css`
- **Code splitting** — Vite manual chunks for React, Supabase, PDF, XLSX, icons
- **Lazy loading** — routes and heavy components properly lazy-loaded
- **Modal accessibility** — `Modal.jsx` has focus trap, escape key, aria-modal
- **Toast component** — premium notification with progress bar and `role="alert"`
- **Skeleton components** — `Skeleton.jsx` provides reusable loading primitives
- **Responsive CSS** — modals, forms, and buttons adapt to mobile breakpoints
- **Portfolio metrics** — `usePortfolioMetrics.js` is an excellent example of single-pass `useMemo()`
