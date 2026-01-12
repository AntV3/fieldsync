# Dashboard Redesign Plan

**Created:** January 11, 2025
**Status:** Planning Phase
**Priority:** High

---

## Design Principles

| Principle | Description |
|-----------|-------------|
| **User Centricity** | Design for the actual user's workflow, not data structure |
| **Simplicity & Clarity** | Avoid clutter, present information clearly |
| **Actionable Insights** | Focus on metrics that enable finding trends, patterns, improvements |
| **Data Quality** | Use accurate, reliable data; prioritize critical elements |
| **Visualizations** | Diverse chart types without over-compression; include tabular data when needed |
| **Interactivity & Context** | Adjustable thresholds, comparison/benchmark data |
| **Accessibility** | ADA compliance, especially color contrast |

---

## Current State Analysis

### What Exists Today

**Portfolio Dashboard:**
- Total Earned Revenue
- Total Portfolio Value
- Weighted Completion %
- Remaining Revenue to Bill
- Change Orders Summary
- Pending CORs value/count
- Project Health Pills (Complete/On Track/At Risk/Over Budget)
- Schedule Performance Pills (Ahead/On Track/Behind)
- Labor Status Pills (Under/On Track/Over)

**Project Detail Tabs:**
1. **Overview** - Hero metrics, progress bar, "Needs Attention" card, areas list
2. **Financials** - Charts, burn rate, profitability, cost breakdown
3. **Reports** - Daily reports, injury reports
4. **Info** - Project details, team, settings

### Current Actionable Elements (Good)
- "Needs Attention" card with pending approvals
- Project Health status badges
- Burn Rate status (On Budget/Watch/Over)
- Profitability warnings with threshold-based messaging
- Profit margin color coding (green/amber/red)

### Current Gaps (Not Actionable)
- Financial Trend Chart shows data but no thresholds/warnings
- Cost Donut shows breakdown but no anomaly detection
- Daily Reports count with no cadence analysis
- T&M Tickets count with no aging or risk indication
- Equipment list with no utilization/cost impact
- No predictive analytics or projections
- No comparison against benchmarks
- No customizable thresholds

---

## Redesign Strategy

### Phase 1: Actionable Insights Layer

Transform raw metrics into decision-driving insights.

#### 1.1 Project Risk Score (NEW)

A single composite score (0-100) combining:

| Factor | Weight | Calculation |
|--------|--------|-------------|
| Budget Health | 30% | Cost ratio vs revenue (60% = healthy) |
| Schedule Health | 25% | Progress % vs planned % |
| COR Exposure | 20% | Pending COR value as % of contract |
| Activity Cadence | 15% | Days since last daily report |
| Safety Status | 10% | Injury reports in last 30 days |

**Display:** Single gauge/number with color + drill-down capability

```
Risk Score: 72 (Moderate)
├── Budget: Good (costs at 54% of earned)
├── Schedule: Warning (82% complete, expected 90%)
├── COR Exposure: Low (3% pending)
├── Activity: Good (report filed today)
└── Safety: Good (0 incidents)
```

#### 1.2 Smart Alerts System (NEW)

Replace scattered badges with prioritized alert cards:

| Alert Type | Trigger | Action |
|------------|---------|--------|
| **Critical** | Costs > 80% of revenue | "Review costs immediately" |
| **Critical** | No activity in 3+ days | "Project may be stalled" |
| **Warning** | Behind schedule by 10%+ | "Consider resource adjustment" |
| **Warning** | Burn rate accelerating | "Costs increasing faster than progress" |
| **Info** | Pending approvals | "X items need your attention" |

**Display:** Prioritized list at top of dashboard, dismissable

#### 1.3 Trend Indicators on All Metrics (ENHANCE)

Add directional arrows with percentage change:

```
Earned Revenue: $145,000 ↑ 12% (vs last week)
Total Costs: $87,000 ↑ 8%
Profit Margin: 40% → (stable)
```

#### 1.4 Projection Cards (NEW)

| Projection | Calculation | Display |
|------------|-------------|---------|
| Estimated Completion Date | Current progress rate extrapolated | "Expected: Feb 15" |
| Projected Final Cost | Current burn rate × remaining work | "$234,000 (105% of budget)" |
| Projected Final Margin | Revenue - Projected Cost | "32% (down from 38% planned)" |

---

### Phase 2: Dashboard Layout Restructure

#### 2.1 Portfolio View Redesign

**Current:** Dense cards with all metrics visible
**Proposed:** Progressive disclosure with focus on action

```
┌─────────────────────────────────────────────────────────────┐
│  SMART ALERTS (0-3 critical items)                          │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ ⚠ Project Atlas: Costs at 78% of revenue               ││
│  │ ⚠ Project Beacon: No daily report in 4 days            ││
│  └─────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│  PORTFOLIO SUMMARY (4 key numbers)                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ $2.4M    │ │ $1.8M    │ │ 68%      │ │ 12       │       │
│  │ Portfolio│ │ Earned   │ │ Complete │ │ Active   │       │
│  │ Value    │ │ Revenue  │ │ Weighted │ │ Projects │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
├─────────────────────────────────────────────────────────────┤
│  PROJECT LIST (sortable by risk score)                      │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ [Risk] Project Name     Progress  Budget   Status       ││
│  │ [85]   Atlas Demo       ████░░ 67%  ⚠ 78%   At Risk    ││
│  │ [45]   Beacon Office    ██████ 92%  ✓ 52%   On Track   ││
│  │ [30]   Cedar Heights    ████████ 100% ✓ 48%  Complete   ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

#### 2.2 Project Detail View Redesign

**Current:** 4 tabs with dense information
**Proposed:** Single scrollable view with collapsible sections

```
┌─────────────────────────────────────────────────────────────┐
│  PROJECT HEADER                                              │
│  Atlas Demolition Project          Risk Score: 72 (Moderate) │
│  Contract: $450,000 │ Progress: 67% │ Est. Completion: Feb 15│
├─────────────────────────────────────────────────────────────┤
│  NEEDS ATTENTION (Collapsed if empty)                        │
│  ├── 3 T&M tickets pending approval ($12,400)               │
│  ├── 1 COR awaiting signature ($8,500)                      │
│  └── Daily report not filed today                           │
├─────────────────────────────────────────────────────────────┤
│  FINANCIAL HEALTH                                            │
│  ┌─────────────────┐  ┌─────────────────────────────────────┐│
│  │   EARNED        │  │   COST TREND (sparkline)            ││
│  │   $302,000      │  │   ▁▂▃▄▅▆▇ ← costs accelerating     ││
│  │   67% of $450K  │  │   Last 7 days: +$34,000             ││
│  ├─────────────────┤  ├─────────────────────────────────────┤│
│  │   COSTS         │  │   PROJECTION                        ││
│  │   $235,000      │  │   At current rate:                  ││
│  │   78% of earned │  │   Final cost: $351,000              ││
│  │   ⚠ High        │  │   Final margin: 22% (was 35%)       ││
│  ├─────────────────┤  └─────────────────────────────────────┘│
│  │   MARGIN        │                                         │
│  │   22%           │  [View Full Financial Breakdown →]      │
│  │   ↓ from 35%    │                                         │
│  └─────────────────┘                                         │
├─────────────────────────────────────────────────────────────┤
│  WORK PROGRESS                                               │
│  ████████████████░░░░░░░░░ 67% Complete                      │
│                                                              │
│  By Area:                          [Expand All] [Collapse]   │
│  ├── Building A (100%)  ████████████████████                │
│  ├── Building B (80%)   ████████████████░░░░                │
│  └── Building C (20%)   ████░░░░░░░░░░░░░░░░                │
├─────────────────────────────────────────────────────────────┤
│  COST BREAKDOWN                    [Chart] [Table] toggle    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  [Donut Chart]     │  Category      Amount    % of Cost ││
│  │                    │  Labor         $156,000   66%      ││
│  │     $235K          │  Disposal      $45,000    19%      ││
│  │     Total          │  Materials     $22,000    9%       ││
│  │                    │  Equipment     $12,000    5%       ││
│  └─────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│  ACTIVITY LOG (Last 7 days)                                  │
│  ├── Jan 10: Daily report filed, 8 crew, $4,200 labor       │
│  ├── Jan 9: T&M ticket #47 submitted, $2,100                │
│  ├── Jan 8: COR #12 approved, +$8,500 to contract           │
│  └── [View All Activity →]                                   │
└─────────────────────────────────────────────────────────────┘
```

---

### Phase 3: Interactivity & Configuration

#### 3.1 Threshold Configuration (NEW)

Allow admins to set company-wide thresholds:

```javascript
// Default thresholds (configurable per company)
const THRESHOLDS = {
  costRatio: {
    healthy: 0.60,    // Green if costs < 60% of revenue
    warning: 0.75,    // Yellow if 60-75%
    critical: 0.85    // Red if > 85%
  },
  scheduleVariance: {
    healthy: 0.05,    // Green if within 5% of plan
    warning: 0.15,    // Yellow if 5-15% behind
    critical: 0.25    // Red if > 25% behind
  },
  activityGap: {
    healthy: 1,       // Green if report within 1 day
    warning: 3,       // Yellow if 2-3 days
    critical: 5       // Red if > 5 days
  }
};
```

**UI:** Settings gear icon → Threshold Configuration panel

#### 3.2 Benchmark Comparisons (NEW)

Show project metrics against company averages:

```
Your Project          Company Avg      Benchmark
─────────────────────────────────────────────────
Cost Ratio: 78%       vs 58%           ↑ 20% higher
Labor %: 66%          vs 62%           ↑ 4% higher
Schedule: -8%         vs +2%           ↓ Behind avg
```

#### 3.3 Time Period Selector (ENHANCE)

Current: 7D/30D/90D/All on charts only
Proposed: Global time context affecting all metrics

```
┌─────────────────────────────────────────┐
│ Showing data for: [This Week ▼]         │
│ Options: Today, This Week, This Month,  │
│          This Quarter, Custom Range     │
└─────────────────────────────────────────┘
```

---

### Phase 4: Accessibility & ADA Compliance

#### 4.1 Color System Redesign

Current colors may not meet WCAG 2.1 AA contrast requirements.

**Proposed Accessible Palette:**

| Status | Current | Proposed | Contrast Ratio |
|--------|---------|----------|----------------|
| Success | #10b981 | #047857 | 4.5:1 ✓ |
| Warning | #f59e0b | #b45309 | 4.5:1 ✓ |
| Danger | #ef4444 | #b91c1c | 4.5:1 ✓ |
| Info | #3b82f6 | #1d4ed8 | 4.5:1 ✓ |

#### 4.2 Non-Color Indicators

Never rely on color alone:

```
Status indicators must include:
├── Color (primary)
├── Icon (secondary) - ✓ ⚠ ✕ ℹ
└── Text label (optional but available)

Example:
✓ On Track (green)    vs just green dot
⚠ At Risk (amber)     vs just amber dot
✕ Over Budget (red)   vs just red dot
```

#### 4.3 Keyboard Navigation

Ensure all interactive elements are keyboard accessible:
- Tab order follows visual flow
- Focus indicators visible
- Escape closes modals
- Arrow keys navigate lists

#### 4.4 Screen Reader Support

```html
<!-- Add ARIA labels -->
<div role="region" aria-label="Project financial summary">
  <span aria-label="Earned revenue: $302,000, 67% of contract">
    $302,000
  </span>
</div>

<!-- Announce dynamic updates -->
<div aria-live="polite" aria-atomic="true">
  Alert: Costs have exceeded 75% of earned revenue
</div>
```

---

## CSS Strategy

### Current State
- Single `index.css` file: **28,224 lines**
- Mixed organization: components, themes, utilities, legacy
- Some dead/unused styles likely present

### Recommended Approach: Modular CSS Architecture

**Option A: Split into domain files (RECOMMENDED)**

```
src/styles/
├── base/
│   ├── reset.css         # CSS reset/normalize
│   ├── variables.css     # CSS custom properties
│   └── typography.css    # Font styles
├── components/
│   ├── buttons.css
│   ├── cards.css
│   ├── forms.css
│   ├── modals.css
│   └── tables.css
├── features/
│   ├── dashboard.css     # Dashboard-specific
│   ├── foreman.css       # Field view
│   ├── cor.css           # Change orders
│   └── tm.css            # T&M tickets
├── utilities/
│   ├── animations.css
│   ├── spacing.css
│   └── accessibility.css # Focus states, sr-only, etc.
├── themes/
│   ├── light.css
│   └── dark.css
└── index.css             # Main entry (imports all)
```

**Migration Safety Protocol:**

1. **Create new structure alongside existing** - don't delete index.css yet
2. **Extract one section at a time** - test after each extraction
3. **Use CSS source maps** - track where styles come from
4. **Run visual regression tests** - screenshot comparison before/after
5. **Keep index.css as fallback** - import it last to catch missed styles

**Option B: Component-scoped CSS (Alternative)**

Move styles into component folders:
```
src/components/Dashboard/
├── Dashboard.jsx
├── Dashboard.css        # Scoped styles
└── Dashboard.test.js
```

Pros: Co-location, easier to find styles
Cons: Requires build changes, potential duplication

### Dead CSS Detection

Before refactoring, identify unused styles:

```bash
# Install PurgeCSS for analysis
npm install -D purgecss

# Run analysis (don't purge, just report)
npx purgecss --css src/index.css --content "src/**/*.jsx" --output unused-report.css
```

Manual review of likely dead code:
- `.legacy-*` prefixed classes
- Styles for deleted components (CLI, archived)
- Duplicate responsive breakpoints

---

## New Components Needed

### Dashboard Components

| Component | Purpose | Priority |
|-----------|---------|----------|
| `RiskScoreGauge` | Visual risk score display | High |
| `SmartAlertCard` | Prioritized actionable alerts | High |
| `TrendIndicator` | Directional arrows with % change | High |
| `ProjectionCard` | Future estimates display | Medium |
| `ThresholdConfig` | Admin threshold settings | Medium |
| `BenchmarkComparison` | vs company average display | Low |
| `TimeContextSelector` | Global time period filter | Medium |
| `AccessibleStatusBadge` | Color + icon + label status | High |

### Shared UI Components

| Component | Purpose | Priority |
|-----------|---------|----------|
| `MetricCard` | Standardized metric display | High |
| `SparklineChart` | Inline mini trend chart | Medium |
| `CollapsibleSection` | Expandable content area | High |
| `DataTable` | Accessible sortable table | Medium |
| `ProgressRing` | Circular progress indicator | Low |

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Create new CSS architecture (don't delete old yet)
- [ ] Build `AccessibleStatusBadge` component
- [ ] Build `TrendIndicator` component
- [ ] Add ARIA labels to existing Dashboard
- [ ] Fix color contrast issues

### Phase 2: Actionable Insights (Week 2)
- [ ] Implement Risk Score calculation
- [ ] Build `RiskScoreGauge` component
- [ ] Build `SmartAlertCard` component
- [ ] Add alerts to Portfolio view
- [ ] Add projections to Project view

### Phase 3: Layout Restructure (Week 3)
- [ ] Redesign Portfolio view layout
- [ ] Redesign Project detail layout
- [ ] Build `CollapsibleSection` component
- [ ] Implement progressive disclosure
- [ ] Add time context selector

### Phase 4: Configuration & Polish (Week 4)
- [ ] Build threshold configuration UI
- [ ] Add benchmark comparisons
- [ ] Migrate remaining CSS
- [ ] Remove dead CSS
- [ ] Full accessibility audit

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Time to identify at-risk project | ~30 sec | < 5 sec |
| Clicks to see project health | 3-4 | 1 (visible on load) |
| WCAG compliance | Partial | AA compliant |
| CSS file size | 28,224 lines | < 15,000 lines |
| Component test coverage | 0% | 80%+ |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing functionality | Feature flags, gradual rollout |
| CSS migration breaks styles | Keep old CSS as fallback |
| User confusion with new layout | A/B testing, user feedback |
| Performance regression | Monitor bundle size, lazy load |

---

## Appendix: Current Metrics Inventory

### Portfolio Level
- Total Earned Revenue
- Total Portfolio Value (Original + CORs)
- Weighted Completion %
- Remaining Revenue to Bill
- Change Orders Summary
- Pending CORs (value & count)
- Projects by Status (Complete/On Track/At Risk/Over Budget)
- Projects by Schedule (Ahead/On Track/Behind)
- Labor Status (Under/On Track/Over)

### Project Level
- Progress % (area-based or SOV)
- Contract Value (original + approved CORs)
- Earned Revenue
- Total Costs
- Profit (amount & margin %)
- Burn Rate (/day)
- Cost Breakdown (Labor/Disposal/Materials/Equipment/Custom)
- Areas Status (Complete/Working/Not Started)
- Daily Reports (count, last filed)
- Injury Reports (count, safety status)
- T&M Tickets (total, pending, approved)
- Change Orders (total, pending count, pending value)
- Equipment (assigned items)
- Crew Check-ins (daily labor log)

---

*Document will be updated as implementation progresses.*
