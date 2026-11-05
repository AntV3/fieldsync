import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

// Mock the data layer: the wizard only touches these four db calls.
const mocks = vi.hoisted(() => ({
  isPinAvailable: vi.fn(),
  createProject: vi.fn(),
  createArea: vi.fn(),
  createPhase: vi.fn()
}))

vi.mock('../lib/supabase', () => ({
  db: {
    isPinAvailable: mocks.isPinAvailable,
    createProject: mocks.createProject,
    createArea: mocks.createArea,
    createPhase: mocks.createPhase
  },
  supabase: {},
  isSupabaseConfigured: false
}))

// ProjectBasicsStep reads the trade config; no provider in tests.
vi.mock('../lib/TradeConfigContext', () => ({
  useTradeConfig: () => ({ resolvedConfig: null, companyConfig: null }),
  TradeConfigProvider: ({ children }) => children
}))

import Setup from '../components/Setup'

const company = { id: 'company-1', name: 'Test Co' }
const user = { id: 'user-1' }

function renderWizard() {
  const onShowToast = vi.fn()
  const onProjectCreated = vi.fn()
  render(
    <Setup
      company={company}
      user={user}
      onProjectCreated={onProjectCreated}
      onShowToast={onShowToast}
    />
  )
  return { onShowToast, onProjectCreated }
}

const primaryButton = (name) => screen.getByRole('button', { name })

function fillBasics({ name = 'Sunrise Apartments', pin = '2847' } = {}) {
  fireEvent.change(screen.getByPlaceholderText('e.g., Sunrise Apartments'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText('Foreman PIN'), { target: { value: pin } })
}

// Basics -> Contacts -> Progress (step 3)
function goToProgressStep() {
  fillBasics()
  fireEvent.click(primaryButton('Continue'))
  expect(screen.getByText('Contacts')).toBeInTheDocument()
  fireEvent.click(primaryButton('Continue'))
  expect(screen.getByText('Step 3 of 4')).toBeInTheDocument()
}

beforeEach(() => {
  mocks.isPinAvailable.mockReset()
  mocks.createProject.mockReset()
  mocks.createArea.mockReset()
  mocks.createPhase.mockReset()
  mocks.isPinAvailable.mockResolvedValue(true)
  mocks.createProject.mockImplementation(async (payload) => ({ id: 'project-1', ...payload }))
  mocks.createArea.mockImplementation(async (payload) => ({ id: `area-${payload.sort_order}`, ...payload }))
  mocks.createPhase.mockImplementation(async (payload) => ({ id: `phase-${payload.sort_order}`, ...payload }))
  sessionStorage.clear()
  localStorage.clear()
})

describe('Setup wizard', () => {
  it('has a 4-step stepper: Basics / People / Progress / Review', () => {
    renderWizard()
    const stepper = document.querySelector('.setup-stepper-bar')
    const buttons = within(stepper).getAllByRole('button')
    expect(buttons).toHaveLength(4)
    expect(buttons.map(b => b.textContent)).toEqual(['1Basics', '2People', '3Progress', '4Review'])
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument()
  })

  it('step 1 needs a name and a 4-digit PIN', () => {
    const { onShowToast } = renderWizard()
    fireEvent.click(primaryButton('Continue'))
    expect(onShowToast).toHaveBeenLastCalledWith('Please enter a project name', 'error')

    fireEvent.change(screen.getByPlaceholderText('e.g., Sunrise Apartments'), { target: { value: 'Job A' } })
    fireEvent.click(primaryButton('Continue'))
    expect(onShowToast).toHaveBeenLastCalledWith('Please enter a 4-digit PIN', 'error')
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
    expect(screen.getByLabelText('Foreman PIN').value).toMatch(/^\d{4}$/)
    fireEvent.click(primaryButton('Continue'))
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument()
  })

  it('step 3 reads "Progress tracking (optional)" and the primary button reads "Skip for now" when empty', () => {
    renderWizard()
    goToProgressStep()

    const header = document.querySelector('.wizard-step-header h2')
    expect(header.textContent).toBe('Progress tracking (optional)')
    expect(header.querySelector('span.optional').textContent).toBe('(optional)')

    expect(primaryButton('Skip for now')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument()

    // Typing anything flips the label to "Review"
    fireEvent.change(screen.getByLabelText('Contract Value'), { target: { value: '365000' } })
    expect(primaryButton('Review')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Contract Value'), { target: { value: '' } })
    expect(primaryButton('Skip for now')).toBeInTheDocument()
  })

  it('embeds the areas step with a section title instead of a second step header', () => {
    renderWizard()
    goToProgressStep()
    expect(document.querySelectorAll('.wizard-step-header')).toHaveLength(1)
    const sectionTitles = Array.from(document.querySelectorAll('h3.wizard-section-title')).map(h => h.textContent)
    expect(sectionTitles).toContain('Phases & Tasks')
    expect(screen.getByText('Add tasks only if you want weighted progress. Weights must total 100% if used.')).toBeInTheDocument()
  })

  it('Review shows "Not set up" for progress tracking and the PIN in Basics', () => {
    renderWizard()
    goToProgressStep()
    fireEvent.click(primaryButton('Skip for now'))

    expect(screen.getByText('Step 4 of 4')).toBeInTheDocument()
    expect(screen.getByText(/^Not set up — contract value, schedule and work areas can be added any time/)).toBeInTheDocument()
    expect(screen.getByText('Foreman PIN')).toBeInTheDocument()
    expect(screen.getByText('2847')).toBeInTheDocument()
    expect(screen.queryByText('Contract Value')).not.toBeInTheDocument()
    expect(screen.queryByText('Schedule & Access')).not.toBeInTheDocument()

    // The PIN row's Edit goes back to step 1
    const basicsCard = screen.getByText('Project Basics').closest('.wizard-review-card')
    fireEvent.click(within(basicsCard).getByRole('button', { name: 'Edit' }))
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument()
    expect(screen.getByLabelText('Foreman PIN').value).toBe('2847')
  })

  it('skip path creates the project with the four NULLs and no area/phase calls', async () => {
    const { onShowToast, onProjectCreated } = renderWizard()
    goToProgressStep()
    fireEvent.click(primaryButton('Skip for now'))
    fireEvent.click(primaryButton('Create Project'))

    await waitFor(() => expect(onProjectCreated).toHaveBeenCalledTimes(1))

    expect(mocks.isPinAvailable).toHaveBeenCalledWith('2847', 'company-1')
    expect(mocks.createProject).toHaveBeenCalledTimes(1)
    const payload = mocks.createProject.mock.calls[0][0]
    expect(payload).toMatchObject({
      name: 'Sunrise Apartments',
      pin: '2847',
      company_id: 'company-1',
      created_by: 'user-1',
      contract_value: null,
      start_date: null,
      end_date: null,
      planned_man_days: null
    })
    expect(mocks.createArea).not.toHaveBeenCalled()
    expect(mocks.createPhase).not.toHaveBeenCalled()
    expect(onShowToast).toHaveBeenCalledWith('Project created!', 'success')
    // The post-create tour gets the PIN
    expect(JSON.parse(sessionStorage.getItem('fieldsync-pending-project-tour') || 'null')).toEqual({ projectId: 'project-1', pin: '2847' })
  })

  it('disables Create for the whole async path and ignores a double-tap', async () => {
    let resolvePin
    mocks.isPinAvailable.mockImplementation(() => new Promise(resolve => { resolvePin = resolve }))
    const { onProjectCreated } = renderWizard()
    goToProgressStep()
    fireEvent.click(primaryButton('Skip for now'))

    const create = primaryButton('Create Project')
    fireEvent.click(create)
    fireEvent.click(create)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled())
    expect(mocks.isPinAvailable).toHaveBeenCalledTimes(1)

    resolvePin(true)
    await waitFor(() => expect(onProjectCreated).toHaveBeenCalledTimes(1))
    expect(mocks.createProject).toHaveBeenCalledTimes(1)
  })

  it('keeps Create locked after a successful create instead of resetting to step 1', async () => {
    const { onShowToast, onProjectCreated } = renderWizard()
    goToProgressStep()
    fireEvent.click(primaryButton('Skip for now'))
    fireEvent.click(primaryButton('Create Project'))
    await waitFor(() => expect(onProjectCreated).toHaveBeenCalledTimes(1))

    // The parent navigates away and unmounts the wizard; until then a late
    // second tap must not land on a blank step 1.
    expect(screen.getByText('Step 4 of 4')).toBeInTheDocument()
    const create = screen.getByRole('button', { name: 'Creating...' })
    expect(create).toBeDisabled()
    fireEvent.click(create)
    await Promise.resolve()
    expect(mocks.createProject).toHaveBeenCalledTimes(1)
    expect(onShowToast).not.toHaveBeenCalledWith('Please enter a project name', 'error')
    expect(onShowToast.mock.calls.filter(([msg]) => msg === 'Project created!')).toHaveLength(1)
  })

  it('re-enables Create when the create call fails', async () => {
    mocks.createProject.mockRejectedValueOnce(new Error('boom'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { onShowToast, onProjectCreated } = renderWizard()
    goToProgressStep()
    fireEvent.click(primaryButton('Skip for now'))
    fireEvent.click(primaryButton('Create Project'))
    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith('Error creating project', 'error'))
    expect(onProjectCreated).not.toHaveBeenCalled()
    expect(primaryButton('Create Project')).not.toBeDisabled()
    consoleSpy.mockRestore()
  })

  it('PIN collision returns to step 1 with Create disabled during the check', async () => {
    let resolvePin
    mocks.isPinAvailable.mockImplementation(() => new Promise(resolve => { resolvePin = resolve }))
    const { onShowToast, onProjectCreated } = renderWizard()
    goToProgressStep()
    fireEvent.click(primaryButton('Skip for now'))

    fireEvent.click(primaryButton('Create Project'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled())

    resolvePin(false)
    await waitFor(() => expect(screen.getByText('Step 1 of 4')).toBeInTheDocument())
    expect(onShowToast).toHaveBeenLastCalledWith('This PIN is already in use. Try another.', 'error')
    expect(mocks.createProject).not.toHaveBeenCalled()
    expect(onProjectCreated).not.toHaveBeenCalled()
    // Back on Basics, the PIN field is there to change
    expect(screen.getByLabelText('Foreman PIN').value).toBe('2847')
    // Not stuck in "creating": the step 1 primary button is usable
    expect(primaryButton('Continue')).not.toBeDisabled()
  })

  it('rejects a "0" contract value with an error toast', () => {
    const { onShowToast } = renderWizard()
    goToProgressStep()
    fireEvent.change(screen.getByLabelText('Contract Value'), { target: { value: '0' } })
    fireEvent.click(primaryButton('Review'))
    expect(onShowToast).toHaveBeenLastCalledWith('Please enter a valid contract value', 'error')
    expect(screen.getByText('Step 3 of 4')).toBeInTheDocument()
    expect(mocks.createProject).not.toHaveBeenCalled()
  })

  it('rejects a start date without an end date and an end before start', () => {
    const { onShowToast } = renderWizard()
    goToProgressStep()
    fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2026-03-01' } })
    fireEvent.click(primaryButton('Review'))
    expect(onShowToast).toHaveBeenLastCalledWith('Enter both a start date and an end date, or leave both blank', 'error')

    fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2026-02-01' } })
    fireEvent.click(primaryButton('Review'))
    expect(onShowToast).toHaveBeenLastCalledWith('End date must be after start date', 'error')
    expect(screen.getByText('Step 3 of 4')).toBeInTheDocument()
  })

  it('rejects a single area at 60% with "must total 100%"', () => {
    const { onShowToast } = renderWizard()
    goToProgressStep()
    fireEvent.change(screen.getByPlaceholderText('Task name'), { target: { value: 'Level 1' } })
    fireEvent.change(screen.getByPlaceholderText('%'), { target: { value: '60' } })
    fireEvent.click(primaryButton('Review'))
    expect(onShowToast).toHaveBeenLastCalledWith('Area weights must total 100%', 'error')
  })

  it('the full old path still creates the project with contract, dates and two areas', async () => {
    const { onProjectCreated } = renderWizard()
    goToProgressStep()

    fireEvent.change(screen.getByLabelText('Contract Value'), { target: { value: '365000' } })
    fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2026-03-01' } })
    fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2026-06-30' } })
    fireEvent.change(screen.getByLabelText('Planned Man-Days'), { target: { value: '120' } })

    // One blank row is there already; add a second
    fireEvent.click(screen.getByRole('button', { name: /Add Task/ }))
    const names = screen.getAllByPlaceholderText('Task name')
    const weights = screen.getAllByPlaceholderText('%')
    expect(names).toHaveLength(2)
    fireEvent.change(names[0], { target: { value: 'Level 1 Demo' } })
    fireEvent.change(weights[0], { target: { value: '60' } })
    fireEvent.change(names[1], { target: { value: 'Level 2 Demo' } })
    fireEvent.change(weights[1], { target: { value: '40' } })

    fireEvent.click(primaryButton('Review'))
    expect(screen.getByText('Step 4 of 4')).toBeInTheDocument()
    expect(screen.queryByText(/^Not set up/)).not.toBeInTheDocument()
    expect(screen.getByText('$365,000')).toBeInTheDocument()
    expect(screen.getByText('Level 1 Demo')).toBeInTheDocument()
    expect(screen.getByText('Total: 100.0%')).toBeInTheDocument()

    fireEvent.click(primaryButton('Create Project'))
    await waitFor(() => expect(onProjectCreated).toHaveBeenCalledTimes(1))

    expect(mocks.createProject.mock.calls[0][0]).toMatchObject({
      contract_value: 365000,
      start_date: '2026-03-01',
      end_date: '2026-06-30',
      planned_man_days: 120
    })
    expect(mocks.createPhase).not.toHaveBeenCalled()
    expect(mocks.createArea).toHaveBeenCalledTimes(2)
    expect(mocks.createArea.mock.calls[0][0]).toMatchObject({ project_id: 'project-1', name: 'Level 1 Demo', weight: 60, sort_order: 0 })
    expect(mocks.createArea.mock.calls[1][0]).toMatchObject({ project_id: 'project-1', name: 'Level 2 Demo', weight: 40, sort_order: 1 })
  })
})
