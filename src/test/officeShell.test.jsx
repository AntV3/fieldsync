/**
 * Office shell pieces around the quick actions: the project header (field
 * entry buttons gone), the portfolio "Needs action" strip, the Overview
 * approvals shortcuts and the Field Activity empty state.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))

vi.mock('../lib/supabase', () => {
  const noopAsync = () => Promise.resolve([])
  return {
    db: new Proxy({}, {
      get: (target, prop) => {
        if (prop === 'getRFISummary' || prop === 'getSubmittalSummary') return () => Promise.resolve({ total: 0 })
        return noopAsync
      }
    }),
    equipmentOps: { getProjectEquipment: noopAsync, calculateProjectEquipmentCost: () => 0 },
    supabase: {},
    isSupabaseConfigured: false
  }
})

vi.mock('../lib/TradeConfigContext', () => ({
  useTradeConfig: () => ({ resolvedConfig: {} }),
  TradeConfigProvider: ({ children }) => children
}))

vi.mock('../lib/BrandingContext', () => ({
  useBranding: () => ({ branding: {} }),
  BrandingProvider: ({ children }) => children
}))

// Overview sections that fetch or chart; not under test here
vi.mock('../components/overview', () => ({ OverviewCrewMetrics: () => null }))
vi.mock('../components/DisposalSummary', () => ({ default: () => null }))
vi.mock('../components/dashboard/ProjectHealthOverview', () => ({ default: () => null }))
vi.mock('../components/dashboard/LiveFieldFeed', () => ({ default: () => null }))
vi.mock('../hooks/useProjectAnalytics', () => ({ default: () => ({ forecast: null, cashFlow: null, resourceData: null }) }))

import ProjectHeader from '../components/dashboard/ProjectHeader'
import PortfolioView from '../components/dashboard/PortfolioView'
import OverviewTab from '../components/dashboard/tabs/OverviewTab'
import FieldActivityTab from '../components/dashboard/tabs/FieldActivityTab'
import { EMPTY_QUEUE_COUNTS } from '../lib/officeActions'

const project = { id: 'p1', name: 'Alpha Tower', company_id: 'c1' }

describe('ProjectHeader', () => {
  const renderHeader = (props = {}) => render(
    <ProjectHeader project={project} projectData={{}} onBack={() => {}} onShare={() => {}} onOpenAlerts={() => {}} onEditClick={() => {}} onCreateCOR={() => {}} {...props} />
  )

  it('keeps New COR and drops the field entry buttons and the old plus menu', () => {
    const onCreateCOR = vi.fn()
    const { container } = renderHeader({ onCreateCOR, onOpenQuickActions: () => {} })
    fireEvent.click(screen.getByRole('button', { name: 'New COR' }))
    expect(onCreateCOR).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /T&M Ticket/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Daily Report/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Create new item/i })).not.toBeInTheDocument()
    expect(container.querySelector('.pv-fab-wrap')).toBeNull()
  })

  it('has a Quick actions button with the badge', () => {
    const onOpenQuickActions = vi.fn()
    const { rerender, container } = renderHeader({ onOpenQuickActions, quickActionsBadge: 4 })
    const button = screen.getByRole('button', { name: 'Quick actions, 4 tickets to review' })
    expect(button).toHaveTextContent('4')
    fireEvent.click(button)
    expect(onOpenQuickActions).toHaveBeenCalledTimes(1)

    rerender(<ProjectHeader project={project} projectData={{}} onOpenQuickActions={onOpenQuickActions} quickActionsBadge="dot" />)
    expect(screen.getByRole('button', { name: 'Quick actions, items waiting' })).toBeInTheDocument()
    expect(container.querySelector('.oqa-header-badge--dot')).toBeInTheDocument()

    rerender(<ProjectHeader project={project} projectData={{}} onOpenQuickActions={onOpenQuickActions} quickActionsBadge={null} />)
    expect(screen.getByRole('button', { name: 'Quick actions' })).toBeInTheDocument()
    expect(container.querySelector('.oqa-header-badge')).toBeNull()
  })
})

describe('PortfolioView "Needs action" strip', () => {
  const baseProps = {
    projects: [project],
    projectsData: [],
    portfolioMetrics: { totalPendingCORCount: 1, totalPendingCORValue: 5000 },
    projectHealth: {},
    scheduleMetrics: {},
    riskAnalysis: { allAlerts: [], projectRisks: [] },
    isSearchOpen: false,
    setSearchOpen: () => {},
    closeSearch: () => {},
    company: { id: 'c1' },
    onSelectProject: () => {}
  }
  const totals = (overrides = {}) => ({ ...EMPTY_QUEUE_COUNTS, ...overrides })

  it('shows the four company-wide tiles and reports the matching action', () => {
    const onQuickAction = vi.fn()
    render(<PortfolioView {...baseProps} queueTotals={totals({ readyToApprove: 5, readyForCOR: 3, draftCORs: 0, withClient: 2 })} onQuickAction={onQuickAction} />)
    const strip = screen.getByRole('region', { name: 'Needs action' })
    const tiles = within(strip).getAllByRole('button')
    expect(tiles.map(t => t.textContent)).toEqual(['5To review', '3Ready for COR', '0To send', '2Waiting on client'])

    const ids = ['review', 'buildCor', 'sendCor', 'waiting']
    tiles.forEach((tile, i) => {
      fireEvent.click(tile)
      expect(onQuickAction).toHaveBeenLastCalledWith(ids[i])
    })
  })

  it('sits under the page header, above the portfolio hero', () => {
    const { container } = render(<PortfolioView {...baseProps} queueTotals={totals({ readyToApprove: 1 })} />)
    const order = Array.from(container.querySelector('.business-overview').children).map(el => el.className.split(' ')[0])
    expect(order.slice(0, 3)).toEqual(['bo-header', 'needs-action', 'bo-financial'])
  })

  it('collapses to one line when nothing is waiting', () => {
    render(<PortfolioView {...baseProps} queueTotals={totals()} />)
    expect(screen.getByText("You're caught up")).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Needs action' })).not.toBeInTheDocument()
  })

  it('does not claim caught up while tickets still need the client signature', () => {
    render(<PortfolioView {...baseProps} queueTotals={totals({ awaitingSignature: 4 })} />)
    expect(screen.queryByText("You're caught up")).not.toBeInTheDocument()
    expect(screen.getByText('4 awaiting client signature')).toBeInTheDocument()
  })

  it('shows neither while the totals are unknown', () => {
    render(<PortfolioView {...baseProps} queueTotals={null} />)
    expect(screen.queryByText("You're caught up")).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Needs action' })).not.toBeInTheDocument()
  })

  it('flags CORs that have been with the client more than a week', () => {
    const old = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString()
    render(<PortfolioView {...baseProps} queueTotals={totals({ withClient: 1, oldestWithClientAt: old })} />)
    expect(screen.getByRole('button', { name: /Waiting on client/ })).toHaveClass('needs-action-tile--warn')
  })

  it('feeds the Pending CORs count from the queue and leaves its dollar value alone', () => {
    const { rerender } = render(<PortfolioView {...baseProps} queueTotals={totals({ withClient: 3 })} />)
    expect(screen.getByText('3 awaiting approval')).toBeInTheDocument()
    expect(screen.getByText('$5,000')).toBeInTheDocument()
    rerender(<PortfolioView {...baseProps} queueTotals={null} />)
    expect(screen.getByText('1 awaiting approval')).toBeInTheDocument()
  })
})

describe('OverviewTab approvals shortcuts', () => {
  const renderOverview = (props = {}) => render(
    <OverviewTab
      selectedProject={project}
      projectData={{ pendingTickets: 2, corPendingCount: 1, changeOrderPending: 1 }}
      progress={0}
      billable={0}
      revisedContractValue={0}
      changeOrderValue={0}
      areas={[]}
      company={{ id: 'c1' }}
      onShowToast={() => {}}
      onSetActiveTab={() => {}}
      onExportFieldDocuments={() => {}}
      {...props}
    />
  )

  it('Open approvals and the ticket attention item open the ticket review queue', () => {
    const onOpenTicketReview = vi.fn()
    const onSetActiveTab = vi.fn()
    renderOverview({ onOpenTicketReview, onSetActiveTab })

    fireEvent.click(screen.getByRole('button', { name: /Open approvals/ }))
    expect(onOpenTicketReview).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /2 Time and Material tickets need approval/ }))
    expect(onOpenTicketReview).toHaveBeenCalledTimes(2)
    expect(onSetActiveTab).not.toHaveBeenCalled()

    // The change order item still goes to Financials
    fireEvent.click(screen.getByRole('button', { name: /1 change order pending/ }))
    expect(onSetActiveTab).toHaveBeenCalledWith('financials')
    expect(onOpenTicketReview).toHaveBeenCalledTimes(2)
  })

  it('falls back to the Financials tab without the new prop', () => {
    const onSetActiveTab = vi.fn()
    renderOverview({ onSetActiveTab })
    fireEvent.click(screen.getByRole('button', { name: /Open approvals/ }))
    expect(onSetActiveTab).toHaveBeenCalledWith('financials')
  })
})

describe('FieldActivityTab empty state', () => {
  const renderTab = (props = {}) => render(
    <FieldActivityTab
      selectedProject={project}
      projectData={{ dailyReportsCount: 0, punchListItems: [] }}
      areas={[]}
      company={{ id: 'c1' }}
      user={{}}
      onShowToast={() => {}}
      fieldSection="rfis"
      setFieldSection={() => {}}
      {...props}
    />
  )

  it('the report link opens the daily report entry when the office can create one', async () => {
    const onCreateDailyReport = vi.fn()
    const setFieldSection = vi.fn()
    renderTab({ onCreateDailyReport, setFieldSection })
    fireEvent.click(await screen.findByRole('button', { name: /Enter a report for the crew/ }))
    expect(onCreateDailyReport).toHaveBeenCalledTimes(1)
    expect(setFieldSection).not.toHaveBeenCalled()
  })

  it('the report link still switches to Reports without the handler', async () => {
    const setFieldSection = vi.fn()
    renderTab({ setFieldSection })
    fireEvent.click(await screen.findByRole('button', { name: /Enter a report for the crew/ }))
    await waitFor(() => expect(setFieldSection).toHaveBeenCalledWith('reports'))
  })
})
