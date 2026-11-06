import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

// ForemanLanding reads the trade config and the offline queue; neither has a
// backend in tests.
vi.mock('../lib/TradeConfigContext', () => ({
  useTradeConfig: () => ({ resolvedConfig: null, companyConfig: null }),
  TradeConfigProvider: ({ children }) => children
}))

vi.mock('../lib/offlineManager', () => ({
  getPendingActionCount: () => Promise.resolve(0)
}))

import ForemanLanding from '../components/ForemanLanding'

const project = { id: 'proj-1', name: 'Sunrise Apartments' }
const PIN_KEY = `fm_pinned_${project.id}`

const todayStatus = {
  crewCheckedIn: false,
  crewCount: 0,
  tmTicketsToday: 0,
  dailyReportDone: false,
  disposalLoadsToday: 0,
  trucksUsedToday: 0
}

const oneArea = [{ id: 'area-1', name: 'Level 1', weight: 100, status: 'not_started' }]

function renderLanding(props = {}) {
  return render(
    <ForemanLanding
      project={project}
      foremanName="Sam Rivera"
      todayStatus={todayStatus}
      progress={0}
      areas={[]}
      areasLoading={false}
      areasWorking={0}
      areasRemaining={0}
      punchListOpenCount={0}
      onNavigate={() => {}}
      onShowToast={() => {}}
      {...props}
    />
  )
}

// Pinned cards are the buttons inside the quick-actions grid, in DOM order.
function pinnedLabels() {
  const grid = document.querySelector('.sdx-fld-qa-grid')
  return Array.from(grid.querySelectorAll('.sdx-fld-qa-label')).map(el => el.textContent)
}

function todayStat(label) {
  const sub = screen.getByText(label, { selector: '.sdx-fld-today-sub' })
  return sub.parentElement.querySelector('.sdx-fld-today-value').textContent
}

describe('ForemanLanding with no areas (T&M-only project)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('hides the "Update your areas" section', () => {
    renderLanding({ areas: [] })
    expect(screen.queryByText('Update your areas')).not.toBeInTheDocument()
    expect(screen.queryByText(/Office will add work areas/)).not.toBeInTheDocument()
  })

  it('still shows the section while areas are loading', () => {
    renderLanding({ areas: [], areasLoading: true })
    expect(screen.getByText('Update your areas')).toBeInTheDocument()
    expect(screen.getByText('Loading areas…')).toBeInTheDocument()
  })

  it('shows "—" / "no areas" in the Today card instead of a percentage', () => {
    renderLanding({ areas: [] })
    expect(todayStat('no areas')).toBe('—')
    expect(screen.queryByText('complete', { selector: '.sdx-fld-today-sub' })).not.toBeInTheDocument()
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
  })

  it('displays the T&M Ticket card first without rewriting the stored pin order', () => {
    const stored = ['report', 'observations', 'tm', 'injury']
    localStorage.setItem(PIN_KEY, JSON.stringify(stored))
    renderLanding({ areas: [] })

    expect(pinnedLabels()).toEqual(['T&M Ticket', 'Daily Log', 'Add Photos', 'Report Injury'])
    // The persisted order must stay exactly as the foreman arranged it.
    expect(JSON.parse(localStorage.getItem(PIN_KEY))).toEqual(stored)
  })

  it('reports "No areas yet" on a pinned Update Progress card and does not mark it completed', () => {
    localStorage.setItem(PIN_KEY, JSON.stringify(['tm', 'progress']))
    renderLanding({ areas: [], areasRemaining: 0, progress: 0 })

    const card = screen.getByRole('button', { name: /Update Progress/ })
    expect(within(card).getByText('No areas yet')).toBeInTheDocument()
    expect(card).not.toHaveClass('completed')
    expect(within(card).queryByText(/% complete/)).not.toBeInTheDocument()
  })
})

describe('ForemanLanding with areas', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('restores the areas section, percentage and progress status', () => {
    localStorage.setItem(PIN_KEY, JSON.stringify(['report', 'tm', 'progress']))
    renderLanding({ areas: oneArea, progress: 40, areasRemaining: 1 })

    expect(screen.getByText('Update your areas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Level 1: Not started/ })).toBeInTheDocument()
    expect(todayStat('complete')).toBe('40%')
    expect(screen.queryByText('no areas')).not.toBeInTheDocument()

    // Stored order is honored verbatim when areas exist.
    expect(pinnedLabels()).toEqual(['Daily Log', 'T&M Ticket', 'Update Progress'])

    const card = screen.getByRole('button', { name: /Update Progress/ })
    expect(within(card).getByText('1 left')).toBeInTheDocument()
    expect(screen.queryByText('No areas yet')).not.toBeInTheDocument()
  })

  it('marks Update Progress completed when every area is done', () => {
    localStorage.setItem(PIN_KEY, JSON.stringify(['progress']))
    renderLanding({ areas: [{ ...oneArea[0], status: 'done' }], progress: 100, areasRemaining: 0 })

    const card = screen.getByRole('button', { name: /Update Progress/ })
    expect(card).toHaveClass('completed')
    expect(within(card).getByText('100% complete')).toBeInTheDocument()
  })
})
