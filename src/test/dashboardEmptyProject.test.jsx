/**
 * A T&M-only project (no contract value, no schedule dates, no man-days, no
 * areas, no tickets) must render honest empty states on every office
 * dashboard surface — never "NaN", "Infinity" or "undefined".
 *
 * Covers docs/LAUNCH_READINESS.md §2 "dashboard guards and honest empty states":
 *   - useDashboardData: revisedContractValue / billable guards for NULL and
 *     missing contract_value (summary list and opened-project detail paths)
 *   - EnhancedProjectCard (portfolio): "No contract value" + "—" Remaining
 *   - ProjectSummaryBar: "—" Remaining value when there is no contract
 *   - ContractToDate: hint copy instead of a $0 waterfall
 *   - ProjectHealthOverview: Budget N/A + Schedule N/A "No end date set"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, renderHook, waitFor, act, screen } from '@testing-library/react'

vi.mock('../lib/supabase', () => {
  const emptyList = () => Promise.resolve([])
  const nothing = () => Promise.resolve(null)
  const summaryRows = []
  const db = new Proxy({}, {
    get: (_target, prop) => {
      // Realtime subscriptions are optional-chained in the hook; return none
      if (typeof prop === 'string' && prop.startsWith('subscribe')) return undefined
      if (prop === 'unsubscribe') return () => {}
      if (prop === 'getProjectDashboardSummary') return () => Promise.resolve(summaryRows)
      if (prop === 'getChangeOrderTotals' || prop === 'calculateManDayCosts' || prop === 'getCORStats') return nothing
      return emptyList
    }
  })
  return {
    db,
    __summaryRows: summaryRows,
    equipmentOps: { getProjectEquipment: emptyList, calculateProjectEquipmentCost: () => 0 },
    supabase: {},
    isSupabaseConfigured: false
  }
})

import { __summaryRows } from '../lib/supabase'
import useDashboardData from '../hooks/useDashboardData'
import EnhancedProjectCard from '../components/dashboard/EnhancedProjectCard'
import ProjectSummaryBar from '../components/dashboard/ProjectSummaryBar'
import ContractToDate from '../components/dashboard/ContractToDate'
import ProjectHealthOverview from '../components/dashboard/ProjectHealthOverview'
import { generateProjectForecast } from '../lib/forecastCalculations'

const BAD_TEXT = /NaN|Infinity|undefined/

// The exact shape a freshly created T&M-only project has in the DB
const emptyProject = {
  id: 'p-empty',
  company_id: 'c1',
  name: 'Lot 7 cleanup',
  contract_value: null,
  start_date: null,
  end_date: null,
  planned_man_days: null,
  status: 'active'
}

// Walk an object and fail on any non-finite number (NaN / ±Infinity)
function expectAllNumbersFinite(value, path = 'root', seen = new Set()) {
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `${path} is ${value}`).toBe(true)
    return
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  for (const [k, v] of Object.entries(value)) expectAllNumbersFinite(v, `${path}.${k}`, seen)
}

describe('useDashboardData with a project that has no contract value', () => {
  beforeEach(() => {
    __summaryRows.length = 0
  })

  it('keeps revisedContractValue and billable finite for NULL and missing contract_value', async () => {
    // Raw row (NULL) and a row with the key absent entirely (undefined + 0 === NaN without the guard)
    const missingKey = { ...emptyProject, id: 'p-missing' }
    delete missingKey.contract_value
    __summaryRows.push({ ...emptyProject }, missingKey)

    const onShowToast = vi.fn()
    const { result } = renderHook(() => useDashboardData({ company: { id: 'c1' }, onShowToast }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.projectsData).toHaveLength(2)
    for (const card of result.current.projectsData) {
      expect(card.progress).toBe(0)
      expect(card.billable).toBe(0)
      expect(card.revisedContractValue).toBe(0)
      expect(card.hasScheduleData).toBe(false)
      expect(card.hasLaborData).toBe(false)
      expectAllNumbersFinite(card, card.id)
    }

    // Open each project from the list → loadProjectDetails + progressCalculations
    for (const card of result.current.projectsData) {
      await act(async () => {
        await result.current.handleSelectProject(card)
      })
      await waitFor(() => expect(result.current.projectData?._detailsLoaded).toBe(true))

      const detail = result.current.projectData
      expect(detail.id).toBe(card.id)
      expect(detail.revisedContractValue).toBe(0)
      expect(detail.billable).toBe(0)
      expect(detail.profitMargin).toBe(0)
      expect(detail.hasScheduleData).toBe(false)
      expect(detail.hasLaborData).toBe(false)
      expect(detail.laborLabel).toBeNull()
      expect(detail.hasError).toBe(false)
      expectAllNumbersFinite(detail, `${card.id}.detail`)

      const calc = result.current.progressCalculations
      expect(calc.progress).toBe(0)
      expect(calc.billable).toBe(0)
      expect(calc.revisedContractValue).toBe(0)
      expect(calc.changeOrderValue).toBe(0)
      expectAllNumbersFinite(calc, `${card.id}.progressCalculations`)
    }
    expect(onShowToast).not.toHaveBeenCalledWith(expect.stringMatching(/error/i), 'error')
  })
})

describe('EnhancedProjectCard (portfolio) with no contract value', () => {
  const summaryCard = {
    ...emptyProject,
    progress: 0,
    billable: 0,
    areas: [],
    totalTickets: 0,
    pendingTickets: 0,
    approvedTickets: 0,
    hasScheduleData: false,
    hasLaborData: false
  }

  it('shows "No contract value" and a dash for Remaining', () => {
    const { container } = render(<EnhancedProjectCard project={summaryCard} onClick={() => {}} />)
    expect(screen.getByText('No contract value')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('Remaining')).toBeInTheDocument()
    expect(screen.queryByText('Over Budget')).not.toBeInTheDocument()
    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(screen.getByText('$0')).toBeInTheDocument() // Billable
    expect(container.querySelector('.project-card')).not.toHaveClass('at-risk')
    expect(container.textContent).not.toMatch(BAD_TEXT)
  })

  it('never renders NaN when contract_value, billable and progress are all missing', () => {
    const { container } = render(
      <EnhancedProjectCard project={{ id: 'p2', name: 'Bare row', areas: [] }} onClick={() => {}} />
    )
    expect(screen.getByText('No contract value')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(BAD_TEXT)
  })

  it('still shows the contract and Remaining for a priced project', () => {
    const { container } = render(
      <EnhancedProjectCard
        project={{ ...summaryCard, contract_value: 365000, billable: 65000, progress: 20 }}
        onClick={() => {}}
      />
    )
    expect(screen.getByText('$365,000')).toBeInTheDocument()
    expect(screen.getByText('$300,000')).toBeInTheDocument()
    expect(screen.getByText('Remaining')).toBeInTheDocument()
    expect(screen.queryByText('No contract value')).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(BAD_TEXT)
  })
})

describe('ProjectSummaryBar with no contract value', () => {
  it('renders 0% / $0 / — / — before details load', () => {
    const { container } = render(
      <ProjectSummaryBar progress={0} billable={0} revisedContractValue={0} projectData={null} />
    )
    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(screen.getByText('$0')).toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(2) // Remaining value + Profit margin
    expect(container.textContent).not.toMatch(BAD_TEXT)
  })

  it('renders a dash for Remaining value once details are loaded', () => {
    const { container } = render(
      <ProjectSummaryBar
        progress={0}
        billable={0}
        revisedContractValue={0}
        projectData={{ _detailsLoaded: true, profitMargin: 0 }}
      />
    )
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('0.0%')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(BAD_TEXT)
  })

  it('stays finite when the props are undefined', () => {
    const { container } = render(<ProjectSummaryBar />)
    expect(container.textContent).not.toMatch(BAD_TEXT)
  })

  it('shows the remaining value when there is a contract', () => {
    render(
      <ProjectSummaryBar progress={20} billable={65000} revisedContractValue={365000} projectData={null} />
    )
    expect(screen.getByText('$300K')).toBeInTheDocument()
  })
})

describe('ContractToDate with no contract value', () => {
  it('replaces the $0 waterfall with the add-a-contract hint', () => {
    const { container } = render(
      <ContractToDate
        originalContract={0}
        changeOrderValue={0}
        revisedContractValue={0}
        billable={0}
        pendingApprovalValue={0}
      />
    )
    expect(
      screen.getByText('No contract value set — add one in Project Info → Edit Project to track earned vs remaining.')
    ).toBeInTheDocument()
    expect(screen.queryByText('Original contract')).not.toBeInTheDocument()
    expect(screen.queryByText('Remaining to bill')).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(BAD_TEXT)
  })

  it('stays finite and shows the hint when every prop is undefined', () => {
    const { container } = render(<ContractToDate />)
    expect(screen.getByText(/No contract value set/)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(BAD_TEXT)
  })

  it('keeps the waterfall when something has been earned even without a contract', () => {
    const { container } = render(
      <ContractToDate
        originalContract={0}
        changeOrderValue={0}
        revisedContractValue={0}
        billable={1200}
        pendingApprovalValue={0}
      />
    )
    expect(screen.queryByText(/No contract value set/)).not.toBeInTheDocument()
    expect(screen.getByText('Billed / earned')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(BAD_TEXT)
  })

  it('keeps the waterfall for a priced project', () => {
    render(
      <ContractToDate
        originalContract={365000}
        changeOrderValue={0}
        revisedContractValue={365000}
        billable={65000}
        pendingApprovalValue={0}
      />
    )
    expect(screen.queryByText(/No contract value set/)).not.toBeInTheDocument()
    expect(screen.getByText('Original contract')).toBeInTheDocument()
    expect(screen.getByText('$300K')).toBeInTheDocument()
  })
})

describe('ProjectHealthOverview with no contract value and no dates', () => {
  // The real no-dates forecast stub: schedule is an object with projectedEnd null
  const forecast = generateProjectForecast({
    contractValue: 0,
    changeOrderValue: 0,
    progressPercent: 0,
    actualCosts: 0,
    startDate: null,
    endDate: null
  })

  it('reads Budget N/A and Schedule N/A "No end date set" instead of "On track"', () => {
    expect(forecast.schedule).toBeTruthy()
    expect(forecast.schedule.projectedEnd).toBeNull()

    const { container } = render(
      <ProjectHealthOverview
        forecast={forecast}
        cashFlow={null}
        resourceData={null}
        progress={0}
        revisedContractValue={0}
        projectData={{ allCostsTotal: 0, _detailsLoaded: true }}
        changeOrderValue={0}
        selectedProject={emptyProject}
      />
    )
    expect(screen.getAllByText('N/A')).toHaveLength(4)
    expect(screen.getByText('No budget data')).toBeInTheDocument()
    expect(screen.getByText('No end date set')).toBeInTheDocument()
    expect(screen.queryByText('On track')).not.toBeInTheDocument()
    // No signals → no overall score badge and no action items
    expect(container.querySelector('.health-badge-v2')).toBeNull()
    expect(screen.queryByText('Action Items')).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(BAD_TEXT)
  })

  it('still scores the schedule when the forecast has a projected end', () => {
    const dated = {
      ...forecast,
      schedule: { ...forecast.schedule, projectedEnd: '2026-12-01', slippage: 0 }
    }
    render(
      <ProjectHealthOverview
        forecast={dated}
        cashFlow={null}
        resourceData={null}
        progress={40}
        revisedContractValue={0}
        projectData={{ allCostsTotal: 0 }}
        changeOrderValue={0}
        selectedProject={{ ...emptyProject, start_date: '2026-01-01', end_date: '2026-12-01' }}
      />
    )
    expect(screen.getByText('On track')).toBeInTheDocument()
    expect(screen.queryByText('No end date set')).not.toBeInTheDocument()
  })
})
