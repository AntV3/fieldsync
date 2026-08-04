import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Spies for the two hook methods that handleAlertAction may call.
// handleSelectProject is the one that lazily loads details AND marks
// the project's unseen-activity badge as seen; setSelectedProject skips
// both. Prior to the fix, handleAlertAction called setSelectedProject
// directly and left the detail view showing the empty lightweight
// project shape (tmTickets: [], corStats: null, laborCost: 0).
const handleSelectProjectSpy = vi.fn()
const setSelectedProjectSpy = vi.fn()

const projectSummary = {
  id: 'p1',
  name: 'Test Project',
  contract_value: 100000,
  _detailsLoaded: false,
}

vi.mock('../hooks/useDashboardData', () => ({
  default: () => ({
    projects: [projectSummary],
    projectsData: [projectSummary],
    selectedProject: null,
    setSelectedProject: setSelectedProjectSpy,
    handleSelectProject: handleSelectProjectSpy,
    areas: [],
    setAreas: vi.fn(),
    loading: false,
    costCodes: [],
    corRefreshKey: 0,
    bumpCORRefresh: vi.fn(),
    debouncedRefresh: vi.fn(),
    loadProjects: vi.fn(),
    loadAreas: vi.fn(),
    invalidateProjectCache: vi.fn(),
    projectData: null,
    progressCalculations: {},
    fieldActivity: {},
    activityPulse: 0,
  }),
}))

vi.mock('../hooks/useProjectViewState', () => ({
  default: () => ({
    setActiveProjectTab: vi.fn(),
    setFieldSection: vi.fn(),
    setFinancialsSection: vi.fn(),
    resetSections: vi.fn(),
    setSavingCost: vi.fn(),
    setShowAddCostModal: vi.fn(),
  }),
}))

vi.mock('../hooks/usePortfolioMetrics', () => ({
  default: () => ({
    portfolioMetrics: {
      totalOriginalContract: 0, totalChangeOrders: 0, totalPortfolioValue: 0,
      totalEarned: 0, weightedCompletion: 0, totalPendingCORValue: 0,
      totalPendingCORCount: 0, backlog: 0, totalProfit: 0, grossMargin: 0,
      hasCostData: false, totalExposure: 0, atRiskExposure: 0, overBudgetExposure: 0,
    },
    projectHealth: {
      projectsComplete: 0, projectsOnTrack: 1, projectsAtRisk: 0,
      projectsOverBudget: 0, projectsWithChangeOrders: 0,
    },
    scheduleMetrics: {
      scheduleAhead: 0, scheduleOnTrack: 1, scheduleBehind: 0,
      laborOver: 0, laborUnder: 0, laborOnTrack: 1,
      hasAnyScheduleData: false, hasAnyLaborData: false, behindScheduleExposure: 0,
    },
    riskAnalysis: {
      projectRisks: [],
      allAlerts: [
        {
          id: 'alert-1',
          type: 'warning',
          title: 'Pending approvals need attention',
          action: 'Review approvals',
          actionTarget: 'financials',
          projectId: 'p1',
          projectName: 'Test Project',
        },
      ],
    },
  }),
}))

vi.mock('../hooks/useProjectEdit', () => ({
  default: () => ({
    handleCancelEdit: vi.fn(),
    handleDeleteProject: vi.fn(),
  }),
}))

// Avoid the onboarding overlay stealing focus from the alert button.
vi.mock('../components/onboarding/onboardingState', () => ({
  isOnboardingComplete: () => true,
  consumePendingProjectTour: () => null,
}))

// Silence UniversalSearch's global keydown listener and any renders.
vi.mock('../components/UniversalSearch', () => ({
  default: () => null,
  useUniversalSearch: () => ({
    isOpen: false,
    setIsOpen: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
  }),
}))

import Dashboard from '../components/Dashboard'

describe('Dashboard alert-driven navigation', () => {
  beforeEach(() => {
    handleSelectProjectSpy.mockReset()
    setSelectedProjectSpy.mockReset()
  })

  it('routes SmartAlerts action through handleSelectProject (not setSelectedProject) so details load and badge clears', () => {
    render(
      <MemoryRouter>
        <Dashboard
          company={{ id: 'c1', name: 'Acme' }}
          user={{ id: 'u1' }}
          isAdmin
          onShowToast={vi.fn()}
        />
      </MemoryRouter>
    )
    const actionBtn = screen.getByRole('button', { name: /Review approvals/i })
    fireEvent.click(actionBtn)

    // The fix: must go through handleSelectProject (lazy-loads details AND
    // calls markProjectActivitySeen internally). If this ever regresses to
    // setSelectedProject(project) the project's Financials tab will render
    // with empty tmTickets/corStats.
    expect(handleSelectProjectSpy).toHaveBeenCalledTimes(1)
    expect(handleSelectProjectSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1' })
    )
    expect(setSelectedProjectSpy).not.toHaveBeenCalled()
  })
})
