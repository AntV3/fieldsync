import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor, render, screen, fireEvent } from '@testing-library/react'

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    getProject: vi.fn(),
    updateProject: vi.fn(),
    isPinAvailable: vi.fn(),
    createArea: vi.fn(),
    updateArea: vi.fn(),
    deleteArea: vi.fn(),
    deleteProject: vi.fn()
  }
}))

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { from: vi.fn() },
  db: mockDb
}))

import useProjectEdit from '../hooks/useProjectEdit'
import ProjectEditForm from '../components/dashboard/ProjectEditForm'

const company = { id: 'company-1' }

// The shape the office sees when it opens a project from the list:
// the dashboard summary RPC COALESCEs contract_value to 0 and the mapper
// hard-codes Number(x) || 0; it carries no planned_man_days column.
const rpcProject = {
  id: 'project-1',
  name: 'T&M Job',
  job_number: '2026-001',
  address: '',
  pin: '1234',
  contract_value: 0,
  start_date: null,
  end_date: null,
  work_type: 'demolition',
  job_type: 'standard',
  general_contractor: ''
}

// A raw projects row (db.getProject) after the NULL migration.
const rawProject = {
  ...rpcProject,
  contract_value: null,
  planned_man_days: null
}

// The contact columns the summary RPC does not return.
const storedContacts = {
  contractor_contact: 'Dana Reyes',
  contractor_position: 'Superintendent',
  contractor_phone: '555-0100',
  contractor_email: 'dana@gc.example',
  client_contact: 'Lee Park',
  client_position: 'Owner rep',
  client_phone: '555-0199',
  client_email: 'lee@owner.example'
}

function setup({ selectedProject = rawProject, areas = [] } = {}) {
  const onShowToast = vi.fn()
  const loadAreas = vi.fn().mockResolvedValue(undefined)
  const setSelectedProject = vi.fn()
  const hook = renderHook(() =>
    useProjectEdit({ selectedProject, areas, company, onShowToast, loadAreas, setSelectedProject })
  )
  return { ...hook, onShowToast, loadAreas, setSelectedProject }
}

async function openEdit(result) {
  await act(async () => {
    await result.current.handleEditClick()
  })
  await waitFor(() => expect(result.current.editMode).toBe(true))
}

async function save(result) {
  await act(async () => {
    await result.current.handleSaveEdit()
  })
}

describe('useProjectEdit — seeding the edit form', () => {
  beforeEach(() => {
    Object.values(mockDb).forEach(fn => fn.mockReset())
    mockDb.getProject.mockResolvedValue(rawProject)
    mockDb.updateProject.mockResolvedValue(rawProject)
    mockDb.isPinAvailable.mockResolvedValue(true)
    mockDb.createArea.mockResolvedValue({})
    mockDb.updateArea.mockResolvedValue({})
    mockDb.deleteArea.mockResolvedValue(undefined)
  })

  it('seeds contract value as blank (not "0") from a summary-RPC row carrying 0', async () => {
    const { result } = setup({ selectedProject: rpcProject })
    await openEdit(result)
    expect(result.current.editData.contract_value).toBe('')
    expect(result.current.editData.start_date).toBe('')
    expect(result.current.editData.end_date).toBe('')
    expect(result.current.editData.planned_man_days).toBe('')
    expect(result.current.editData.pin).toBe('1234')
    expect(result.current.editData.areas).toEqual([])
  })

  it('seeds contract value as blank from a raw row carrying NULL', async () => {
    const { result } = setup({ selectedProject: rawProject })
    await openEdit(result)
    expect(result.current.editData.contract_value).toBe('')
    // The raw row already carries planned_man_days, so no extra fetch.
    expect(mockDb.getProject).not.toHaveBeenCalled()
  })

  it('seeds a positive contract value as its string', async () => {
    const { result } = setup({ selectedProject: { ...rawProject, contract_value: 365000 } })
    await openEdit(result)
    expect(result.current.editData.contract_value).toBe('365000')
  })

  it('backfills planned_man_days from the full row when the summary row lacks it', async () => {
    mockDb.getProject.mockResolvedValue({ ...rawProject, planned_man_days: 120 })
    const { result } = setup({ selectedProject: rpcProject })
    await openEdit(result)
    expect(mockDb.getProject).toHaveBeenCalledWith('project-1')
    expect(result.current.editData.planned_man_days).toBe('120')
  })

  it('seeds the contact fields from the full row when the summary row lacks them', async () => {
    mockDb.getProject.mockResolvedValue({ ...rawProject, ...storedContacts, address: '1 Main St' })
    const { result } = setup({ selectedProject: rpcProject })
    await openEdit(result)
    expect(result.current.editData).toMatchObject(storedContacts)
    // Fields both rows carry come from the projects row too.
    expect(result.current.editData.address).toBe('1 Main St')
    expect(result.current.editData.pin).toBe('1234')
    expect(result.current.editData.contract_value).toBe('')
  })

  it('still opens the form when the full row cannot be fetched', async () => {
    mockDb.getProject.mockRejectedValueOnce(new Error('offline'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = setup({ selectedProject: rpcProject })
    await openEdit(result)
    expect(result.current.editData.name).toBe('T&M Job')
    expect(result.current.editData.contractor_contact).toBe('')
    consoleSpy.mockRestore()
  })

  it('seeds existing dates and man-days as strings', async () => {
    const { result } = setup({
      selectedProject: { ...rawProject, start_date: '2026-01-05', end_date: '2026-03-20', planned_man_days: 42 }
    })
    await openEdit(result)
    expect(result.current.editData.start_date).toBe('2026-01-05')
    expect(result.current.editData.end_date).toBe('2026-03-20')
    expect(result.current.editData.planned_man_days).toBe('42')
  })
})

describe('useProjectEdit — saving', () => {
  let confirmSpy

  beforeEach(() => {
    Object.values(mockDb).forEach(fn => fn.mockReset())
    mockDb.getProject.mockResolvedValue(rawProject)
    mockDb.updateProject.mockResolvedValue(rawProject)
    mockDb.isPinAvailable.mockResolvedValue(true)
    mockDb.createArea.mockResolvedValue({})
    mockDb.updateArea.mockResolvedValue({})
    mockDb.deleteArea.mockResolvedValue(undefined)
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    confirmSpy.mockRestore()
  })

  it('saves a summary-RPC project with no changes: contract NULL, dates NULL, no area calls', async () => {
    const { result, onShowToast } = setup({ selectedProject: rpcProject })
    await openEdit(result)
    await save(result)

    expect(mockDb.updateProject).toHaveBeenCalledTimes(1)
    const [id, payload, companyId] = mockDb.updateProject.mock.calls[0]
    expect(id).toBe('project-1')
    expect(companyId).toBe('company-1')
    expect(payload.contract_value).toBeNull()
    expect(payload.start_date).toBeNull()
    expect(payload.end_date).toBeNull()
    expect(payload.planned_man_days).toBeNull()
    expect(payload.pin).toBe('1234')
    expect(mockDb.isPinAvailable).not.toHaveBeenCalled()
    expect(mockDb.createArea).not.toHaveBeenCalled()
    expect(mockDb.deleteArea).not.toHaveBeenCalled()
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(onShowToast).toHaveBeenCalledWith('Project updated!', 'success')
    expect(result.current.editMode).toBe(false)
  })

  it('a no-change save from the project list keeps the stored contacts', async () => {
    mockDb.getProject.mockResolvedValue({ ...rawProject, ...storedContacts, planned_man_days: 120 })
    const { result, onShowToast } = setup({ selectedProject: rpcProject })
    await openEdit(result)
    await save(result)

    const payload = mockDb.updateProject.mock.calls[0][1]
    expect(payload).toMatchObject(storedContacts)
    expect(payload.planned_man_days).toBe(120)
    expect(payload.pin).toBe('1234')
    expect(mockDb.isPinAvailable).not.toHaveBeenCalled()
    expect(onShowToast).toHaveBeenCalledWith('Project updated!', 'success')
  })

  it('leaves the unknown fields out of the payload when the full row could not be fetched', async () => {
    mockDb.getProject.mockRejectedValueOnce(new Error('offline'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = setup({ selectedProject: rpcProject })
    await openEdit(result)
    expect(result.current.editData.planned_man_days).toBe('')
    // A field the user does type is still sent.
    act(() => result.current.handleEditChange('client_phone', '555-0123'))
    await save(result)
    const payload = mockDb.updateProject.mock.calls[0][1]
    expect('planned_man_days' in payload).toBe(false)
    for (const field of Object.keys(storedContacts)) {
      expect(field in payload).toBe(field === 'client_phone')
    }
    expect(payload.client_phone).toBe('555-0123')
    // Fields the summary row carries are still written.
    expect(payload.name).toBe('T&M Job')
    expect(payload.contract_value).toBeNull()
    consoleSpy.mockRestore()
  })

  it('clears a contact when the stored value was known and the field is blanked', async () => {
    const { result } = setup({ selectedProject: { ...rawProject, ...storedContacts } })
    await openEdit(result)
    expect(mockDb.getProject).not.toHaveBeenCalled()
    act(() => result.current.handleEditChange('client_phone', ''))
    await save(result)
    const payload = mockDb.updateProject.mock.calls[0][1]
    expect(payload.client_phone).toBeNull()
    expect(payload.client_contact).toBe('Lee Park')
  })

  it('sends null when the contract value is cleared', async () => {
    const { result } = setup({ selectedProject: { ...rawProject, contract_value: 365000 } })
    await openEdit(result)
    act(() => result.current.handleEditChange('contract_value', ''))
    await save(result)
    expect(mockDb.updateProject.mock.calls[0][1].contract_value).toBeNull()
  })

  it('rejects a contract value of "0" with the shared error', async () => {
    const { result, onShowToast } = setup()
    await openEdit(result)
    act(() => result.current.handleEditChange('contract_value', '0'))
    await save(result)
    expect(onShowToast).toHaveBeenCalledWith('Please enter a valid contract value', 'error')
    expect(mockDb.updateProject).not.toHaveBeenCalled()
  })

  it('blocks a start date without an end date with the shared error', async () => {
    const { result, onShowToast } = setup()
    await openEdit(result)
    act(() => result.current.handleEditChange('start_date', '2026-01-05'))
    await save(result)
    expect(onShowToast).toHaveBeenCalledWith(
      'Enter both a start date and an end date, or leave both blank',
      'error'
    )
    expect(mockDb.updateProject).not.toHaveBeenCalled()
  })

  it('blocks an end date before the start date', async () => {
    const { result, onShowToast } = setup()
    await openEdit(result)
    act(() => {
      result.current.handleEditChange('start_date', '2026-03-20')
    })
    act(() => {
      result.current.handleEditChange('end_date', '2026-01-05')
    })
    await save(result)
    expect(onShowToast).toHaveBeenCalledWith('End date must be after start date', 'error')
    expect(mockDb.updateProject).not.toHaveBeenCalled()
  })

  it('saves both dates, man-days and a contract value through to updateProject', async () => {
    const { result, onShowToast } = setup()
    await openEdit(result)
    act(() => result.current.handleEditChange('contract_value', '365000'))
    act(() => result.current.handleEditChange('start_date', '2026-01-05'))
    act(() => result.current.handleEditChange('end_date', '2026-03-20'))
    act(() => result.current.handleEditChange('planned_man_days', '120'))
    await save(result)

    const payload = mockDb.updateProject.mock.calls[0][1]
    expect(payload.contract_value).toBe(365000)
    expect(payload.start_date).toBe('2026-01-05')
    expect(payload.end_date).toBe('2026-03-20')
    expect(payload.planned_man_days).toBe(120)
    expect(onShowToast).toHaveBeenCalledWith('Project updated!', 'success')
  })

  it('creates two new areas 60/40 in sort order without a confirm', async () => {
    const { result } = setup()
    await openEdit(result)
    act(() => result.current.handleAddArea())
    act(() => result.current.handleAddArea())
    act(() => result.current.handleAreaEditChange(0, 'name', 'Floor 1'))
    act(() => result.current.handleAreaEditChange(0, 'weight', '60'))
    act(() => result.current.handleAreaEditChange(1, 'name', 'Floor 2'))
    act(() => result.current.handleAreaEditChange(1, 'weight', '40'))
    await save(result)

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(mockDb.createArea).toHaveBeenCalledTimes(2)
    expect(mockDb.createArea.mock.calls[0][0]).toMatchObject({ project_id: 'project-1', name: 'Floor 1', weight: 60, sort_order: 0 })
    expect(mockDb.createArea.mock.calls[1][0]).toMatchObject({ project_id: 'project-1', name: 'Floor 2', weight: 40, sort_order: 1 })
  })

  it('rejects a single area at 60% with "must total 100%"', async () => {
    const { result, onShowToast } = setup()
    await openEdit(result)
    act(() => result.current.handleAddArea())
    act(() => result.current.handleAreaEditChange(0, 'name', 'Floor 1'))
    act(() => result.current.handleAreaEditChange(0, 'weight', '60'))
    await save(result)
    expect(onShowToast).toHaveBeenCalledWith('Area weights must total 100%', 'error')
    expect(mockDb.updateProject).not.toHaveBeenCalled()
  })

  it('rejects a named area with a blank weight', async () => {
    const { result, onShowToast } = setup()
    await openEdit(result)
    act(() => result.current.handleAddArea())
    act(() => result.current.handleAreaEditChange(0, 'name', 'Floor 1'))
    await save(result)
    expect(onShowToast).toHaveBeenCalledWith(expect.stringContaining('needs a weight greater than 0'), 'error')
    expect(mockDb.updateProject).not.toHaveBeenCalled()
  })

  it('ignores an untouched blank area row', async () => {
    const { result, onShowToast } = setup()
    await openEdit(result)
    act(() => result.current.handleAddArea())
    await save(result)
    expect(mockDb.createArea).not.toHaveBeenCalled()
    expect(onShowToast).toHaveBeenCalledWith('Project updated!', 'success')
  })

  describe('removing DB-backed areas', () => {
    const dbAreas = [
      { id: 'area-1', name: 'Floor 1', weight: 60, status: 'not_started' },
      { id: 'area-2', name: 'Floor 2', weight: 40, status: 'working' }
    ]

    it('lets the last area be removed from the form', async () => {
      const { result } = setup({ areas: [dbAreas[0]] })
      await openEdit(result)
      expect(result.current.editData.areas).toHaveLength(1)
      act(() => result.current.handleRemoveArea(0))
      expect(result.current.editData.areas).toHaveLength(0)
    })

    it('asks for confirmation once, naming activity history and punch-list links, then deletes', async () => {
      const { result, onShowToast } = setup({ areas: dbAreas })
      await openEdit(result)
      act(() => result.current.handleRemoveArea(1))
      act(() => result.current.handleRemoveArea(0))
      await save(result)

      expect(confirmSpy).toHaveBeenCalledTimes(1)
      const message = confirmSpy.mock.calls[0][0]
      expect(message).toMatch(/activity history/)
      expect(message).toMatch(/punch-list/)
      expect(mockDb.deleteArea).toHaveBeenCalledTimes(2)
      expect(mockDb.deleteArea).toHaveBeenCalledWith('area-1')
      expect(mockDb.deleteArea).toHaveBeenCalledWith('area-2')
      expect(mockDb.updateArea).not.toHaveBeenCalled()
      expect(onShowToast).toHaveBeenCalledWith('Project updated!', 'success')
    })

    it('aborts the whole save when the confirm is cancelled', async () => {
      confirmSpy.mockReturnValue(false)
      const { result, onShowToast } = setup({ areas: dbAreas })
      await openEdit(result)
      act(() => result.current.handleRemoveArea(0))
      act(() => result.current.handleAreaEditChange(0, 'weight', '100'))
      await save(result)

      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(mockDb.updateProject).not.toHaveBeenCalled()
      expect(mockDb.deleteArea).not.toHaveBeenCalled()
      expect(mockDb.updateArea).not.toHaveBeenCalled()
      expect(onShowToast).not.toHaveBeenCalled()
      // The form stays open with the user's edits intact.
      expect(result.current.editMode).toBe(true)
      expect(result.current.editData.areas).toHaveLength(1)
    })

    it('does not confirm or delete when only new, unsaved rows are removed', async () => {
      const { result } = setup({ areas: dbAreas })
      await openEdit(result)
      act(() => result.current.handleAddArea())
      act(() => result.current.handleRemoveArea(2))
      await save(result)

      expect(confirmSpy).not.toHaveBeenCalled()
      expect(mockDb.deleteArea).not.toHaveBeenCalled()
      expect(mockDb.updateArea).toHaveBeenCalledTimes(2)
    })

    it('runs the confirm after validation so a bad form never prompts', async () => {
      const { result, onShowToast } = setup({ areas: dbAreas })
      await openEdit(result)
      act(() => result.current.handleRemoveArea(0))
      // Remaining area is 40% → blocked before any confirm.
      await save(result)
      expect(onShowToast).toHaveBeenCalledWith('Area weights must total 100%', 'error')
      expect(confirmSpy).not.toHaveBeenCalled()
    })
  })

  describe('PIN handling (unchanged)', () => {
    it('rejects a 3-digit PIN', async () => {
      const { result, onShowToast } = setup()
      await openEdit(result)
      act(() => result.current.handleEditChange('pin', '123'))
      await save(result)
      expect(onShowToast).toHaveBeenCalledWith('PIN must be 4 digits', 'error')
      expect(mockDb.updateProject).not.toHaveBeenCalled()
    })

    it('checks availability for a changed PIN and blocks a collision', async () => {
      mockDb.isPinAvailable.mockResolvedValue(false)
      const { result, onShowToast } = setup()
      await openEdit(result)
      act(() => result.current.handleEditChange('pin', '9999'))
      await save(result)
      expect(mockDb.isPinAvailable).toHaveBeenCalledWith('9999', 'company-1', 'project-1')
      expect(onShowToast).toHaveBeenCalledWith('This PIN is already in use', 'error')
      expect(mockDb.updateProject).not.toHaveBeenCalled()
    })

    it('sends a blank PIN as null, as today', async () => {
      const { result } = setup()
      await openEdit(result)
      act(() => result.current.handleEditChange('pin', ''))
      await save(result)
      expect(mockDb.updateProject.mock.calls[0][1].pin).toBeNull()
    })
  })
})

describe('ProjectEditForm', () => {
  const baseEditData = {
    name: 'T&M Job',
    job_number: '',
    address: '',
    general_contractor: '',
    contractor_contact: '',
    contractor_position: '',
    contractor_phone: '',
    contractor_email: '',
    client_contact: '',
    client_position: '',
    client_phone: '',
    client_email: '',
    contract_value: '',
    start_date: '',
    end_date: '',
    planned_man_days: '',
    work_type: 'demolition',
    job_type: 'standard',
    pin: '1234',
    areas: []
  }

  const renderForm = (editData, overrides = {}) => {
    const props = {
      editData,
      saving: false,
      onCancel: vi.fn(),
      onEditChange: vi.fn(),
      onAreaEditChange: vi.fn(),
      onAddArea: vi.fn(),
      onRemoveArea: vi.fn(),
      onSave: vi.fn(),
      onDelete: vi.fn(),
      ...overrides
    }
    render(<ProjectEditForm {...props} />)
    return props
  }

  it('shows a blank, optional, decimal contract value and the optional schedule card', () => {
    renderForm(baseEditData)
    const contract = screen.getByPlaceholderText('e.g., 250000')
    expect(contract).toHaveValue('')
    expect(contract).toHaveAttribute('type', 'text')
    expect(contract).toHaveAttribute('inputmode', 'decimal')
    expect(screen.getByText('Contract Value ($)', { exact: false })).toHaveTextContent('(optional)')
    expect(screen.getByRole('heading', { name: /Schedule/ })).toHaveTextContent('(optional)')
    expect(screen.getByText('Start Date')).toBeInTheDocument()
    expect(screen.getByText('End Date')).toBeInTheDocument()
    expect(screen.getByText('Planned Man-Days')).toBeInTheDocument()
  })

  it('strips everything but digits and dots from the contract value', () => {
    const props = renderForm(baseEditData)
    const contract = screen.getByPlaceholderText('e.g., 250000')
    fireEvent.change(contract, { target: { value: '$365,000.50' } })
    expect(props.onEditChange).toHaveBeenCalledWith('contract_value', '365000.50')
  })

  it('uses the optional areas copy and hides the totals row when there are no areas', () => {
    renderForm(baseEditData)
    expect(screen.getByText('Optional — used for % complete and earned value. If you add areas, weights must total 100%.')).toBeInTheDocument()
    expect(screen.queryByText('Total Weight:')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove area' })).not.toBeInTheDocument()
  })

  it('shows the totals row and a remove button for every area, including the last one', () => {
    renderForm({ ...baseEditData, areas: [{ id: 'area-1', name: 'Floor 1', weight: 100, isNew: false }] })
    expect(screen.getByText('Total Weight:')).toBeInTheDocument()
    expect(screen.getByText('100%')).toHaveClass('valid')
    expect(screen.getAllByRole('button', { name: 'Remove area' })).toHaveLength(1)
  })

  it('marks a 33.3 / 33.3 / 33.3 total valid, matching the validator', () => {
    renderForm({
      ...baseEditData,
      areas: [
        { id: null, name: 'A', weight: '33.3', isNew: true },
        { id: null, name: 'B', weight: '33.3', isNew: true },
        { id: null, name: 'C', weight: '33.3', isNew: true }
      ]
    })
    expect(screen.getByText('99.9%')).toHaveClass('valid')
  })

  it('marks a 60% total invalid', () => {
    renderForm({ ...baseEditData, areas: [{ id: null, name: 'A', weight: '60', isNew: true }] })
    expect(screen.getByText('60%')).toHaveClass('invalid')
  })

  it('flags an end date before the start date inline', () => {
    renderForm({ ...baseEditData, start_date: '2026-03-20', end_date: '2026-01-05' })
    expect(screen.getByText('End date must be after start date')).toBeInTheDocument()
  })
})
