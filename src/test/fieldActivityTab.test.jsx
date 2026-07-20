import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock the supabase layer so the tab renders without a backend
vi.mock('../lib/supabase', () => {
  const noopAsync = () => Promise.resolve([])
  return {
    db: new Proxy({}, {
      get: (target, prop) => {
        if (prop === 'getRFISummary') return () => Promise.resolve({ total: 0, open: 0, answered: 0, closed: 0, overdue: 0 })
        if (prop === 'getSubmittalSummary') return () => Promise.resolve({ total: 0, pending: 0, approved: 0, rejected: 0, overdue: 0 })
        if (prop === 'getFieldObservations') return () => Promise.resolve([])
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

import FieldActivityTab from '../components/dashboard/tabs/FieldActivityTab'

const project = { id: 'p1', name: 'Test Project', company_id: 'c1' }
const emptyProjectData = { dailyReportsCount: 0, punchListItems: [] }

describe('FieldActivityTab', () => {
  it('renders all five sub-nav sections', async () => {
    render(
      <FieldActivityTab
        selectedProject={project}
        projectData={emptyProjectData}
        areas={[]}
        company={{ id: 'c1' }}
        user={{}}
        onShowToast={() => {}}
        fieldSection="reports"
        setFieldSection={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: /Reports/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /RFIs/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Submittals/ })).toBeInTheDocument()
    // Sidebar starts collapsed, so items show their short labels
    expect(screen.getByRole('button', { name: /Observ/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Punch/ })).toBeInTheDocument()
  })

  it('shows the onboarding message when every section is empty', async () => {
    render(
      <FieldActivityTab
        selectedProject={project}
        projectData={emptyProjectData}
        areas={[]}
        company={{ id: 'c1' }}
        user={{}}
        onShowToast={() => {}}
        fieldSection="reports"
        setFieldSection={() => {}}
      />
    )
    await waitFor(() => {
      expect(screen.getByText(/Create your first daily report to get started/)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /New Report/ })).toBeInTheDocument()
  })

  it('hides the onboarding message when any section has data', async () => {
    render(
      <FieldActivityTab
        selectedProject={project}
        projectData={{ dailyReportsCount: 4, punchListItems: [] }}
        areas={[]}
        company={{ id: 'c1' }}
        user={{}}
        onShowToast={() => {}}
        fieldSection="reports"
        setFieldSection={() => {}}
      />
    )
    // Wait for counts to load, then confirm no onboarding banner
    await waitFor(() => {
      expect(screen.queryByText(/Create your first daily report/)).not.toBeInTheDocument()
    })
  })
})
