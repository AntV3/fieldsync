/**
 * ReportsTab: the office's secondary "New daily report" button.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

vi.mock('../lib/TradeConfigContext', () => ({
  useTradeConfig: () => ({ resolvedConfig: {} }),
  TradeConfigProvider: ({ children }) => children
}))

// Lists that fetch on mount; not under test here
vi.mock('../components/DailyReportsList', () => ({ default: () => <div data-testid="daily-reports-list" /> }))
vi.mock('../components/InjuryReportsList', () => ({ default: () => null }))
vi.mock('../components/PhotoTimeline', () => ({ default: () => null }))
vi.mock('../components/FieldObservationsList', () => ({ default: () => null }))

import ReportsTab from '../components/dashboard/tabs/ReportsTab'

const project = { id: 'p1', name: 'Alpha Tower', company_id: 'c1' }

const renderTab = (props = {}) => render(
  <ReportsTab
    selectedProject={project}
    company={{ id: 'c1' }}
    user={{}}
    projectData={{ dailyReportsCount: 3 }}
    areas={[]}
    onShowToast={() => {}}
    {...props}
  />
)

describe('ReportsTab new daily report button', () => {
  it('is not shown without onCreateDailyReport', async () => {
    renderTab()
    expect(await screen.findByTestId('daily-reports-list')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /New daily report/i })).not.toBeInTheDocument()
    expect(screen.getByText('3 total')).toBeInTheDocument()
  })

  it('is shown as a secondary button in the Daily Reports header and calls the handler', async () => {
    const onCreateDailyReport = vi.fn()
    renderTab({ onCreateDailyReport })
    await screen.findByTestId('daily-reports-list')

    const header = screen.getByRole('heading', { name: 'Daily Reports' }).closest('.reports-section-header')
    const button = within(header).getByRole('button', { name: 'New daily report' })
    expect(button).toHaveClass('btn-secondary')
    expect(button).not.toHaveClass('btn-primary')
    expect(within(header).getByText('3 total')).toBeInTheDocument()

    fireEvent.click(button)
    expect(onCreateDailyReport).toHaveBeenCalledTimes(1)
  })
})
