/**
 * Regression: the Project Overview → Crews metrics tile saved the selected
 * date, the "is today" badge and the chart's date loop as UTC-day strings.
 * Every evening west of UTC the tile defaulted to **tomorrow** and the chart
 * bars slid one day forward, so the office saw today's crew as empty while a
 * phantom bar appeared under tomorrow's date.
 *
 * check_in_date rows are stamped with the device's local calendar day
 * (fieldOps.js now uses getLocalDateString after the daily health check in
 * PR #390), so the Overview tile has to match that. Pin the fix.
 *
 * This file forces TZ=America/Los_Angeles at module load so the UTC-day
 * drift is actually observable; if the host TZ were UTC the bug would be
 * invisible to any check that compares getLocalDateString() with
 * toISOString().split('T')[0].
 */

// Must be set BEFORE any module reads a Date. vitest evaluates test files
// top-down, so this is the earliest the harness lets us do it. The module
// mocks below are hoisted by vitest but they only touch Date at call time,
// not at import time, so this still beats them.
process.env.TZ = 'America/Los_Angeles'

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { formatChartDate } from '../components/charts/chartConfig'
import { getLocalDateString } from '../lib/utils'
import { OverviewCrewMetrics } from '../components/overview/OverviewCrewMetrics'

// Minimal mock of the db facade: the component calls it on mount; we do not
// care about the data path, only the date-string fields rendered on first
// render (selectedDate default, "Today" label, chartData keys).
vi.mock('../lib/supabase', () => ({
  db: {
    getCrewCheckinHistory: vi.fn(async () => []),
    getTMTickets: vi.fn(async () => [])
  }
}))

// loadBrandLogo reaches for storage; stub to a no-op.
vi.mock('../lib/pdfBranding', () => ({
  resolvePrimaryColor: () => [0, 0, 0],
  loadBrandLogo: vi.fn(async () => null),
  drawDocumentHeader: vi.fn(),
  drawContinuationAccent: vi.fn(),
  applyDocumentFooters: vi.fn()
}))

describe('formatChartDate on a YYYY-MM-DD local day', () => {
  it('reads the date as local, not UTC', () => {
    // In LA, new Date('2026-11-27') lands at 2026-11-26T16:00 PST, so
    // toLocaleDateString would print "Nov 26". With the fix, a bare
    // YYYY-MM-DD is parsed as local midnight, so the label stays Nov 27.
    expect(formatChartDate('2026-11-27')).toBe('Nov 27')
    expect(formatChartDate('2026-01-01')).toBe('Jan 1')
  })

  it('leaves ISO datetime strings alone', () => {
    // A full datetime already carries a UTC offset; the local-parse branch
    // must not intercept it.
    expect(formatChartDate('2026-11-27T20:00:00Z')).toBe('Nov 27')
  })
})

describe('OverviewCrewMetrics late-evening west-of-UTC', () => {
  const project = { id: 'proj-1', name: 'Test Project' }
  const company = { id: 'comp-1', name: 'Test Co' }

  beforeEach(() => {
    // Nov 27 2026, 17:00 PST = Nov 28 01:00 UTC. toISOString() says
    // "2026-11-28"; the device's local day is "2026-11-27". Fake timers are
    // scoped to Date only so the load Promise still resolves.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 27, 17, 0, 0)) // local Nov 27 17:00
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('getLocalDateString still reads "2026-11-27" when toISOString says "2026-11-28"', () => {
    // Sanity check the environment: if the host TZ is UTC this assertion
    // is trivially true and the rest of the file is not exercising the bug.
    expect(new Date().toISOString().split('T')[0]).toBe('2026-11-28')
    expect(getLocalDateString()).toBe('2026-11-27')
  })

  it('renders "Today" instead of yesterday/tomorrow once loaded', async () => {
    const { container } = render(
      <MemoryRouter>
        <OverviewCrewMetrics project={project} company={company} onShowToast={() => {}} />
      </MemoryRouter>
    )
    // The header reads "Today" when selectedDate matches the local day.
    // Before the fix selectedDate was the UTC day (Nov 28), which no longer
    // matched getLocalDateString() (Nov 27 locally), so the badge rendered
    // the formatted date instead and the "Next" arrow was enabled, letting
    // the office step into tomorrow.
    await waitFor(() => {
      const text = container.textContent || ''
      expect(text).toMatch(/Today/)
    })
  })
})
