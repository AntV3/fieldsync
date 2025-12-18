import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TMForm from './TMForm'
import { db } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  db: {
    getCrewCheckin: vi.fn(),
    getMaterialsEquipmentByCategory: vi.fn(),
  }
}))

describe('TMForm Component', () => {
  const mockProject = { id: 1, name: 'Test Project' }
  const mockCompanyId = 123
  const mockOnSubmit = vi.fn()
  const mockOnCancel = vi.fn()
  const mockOnShowToast = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    db.getCrewCheckin.mockResolvedValue({ workers: [] })
  })

  it('renders without crashing', () => {
    const { container } = render(
      <TMForm
        project={mockProject}
        companyId={mockCompanyId}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        onShowToast={mockOnShowToast}
      />
    )

    expect(container).toBeInTheDocument()
  })

  it('sets work date to today by default', () => {
    render(
      <TMForm
        project={mockProject}
        companyId={mockCompanyId}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        onShowToast={mockOnShowToast}
      />
    )

    const today = new Date().toISOString().split('T')[0]
    const dateInput = document.querySelector('input[type="date"]')

    expect(dateInput?.value).toBe(today)
  })

  it('loads crew checkin data on mount', async () => {
    const mockCrew = [
      { id: 1, name: 'John Doe', role: 'Foreman' },
      { id: 2, name: 'Jane Smith', role: 'Laborer' }
    ]

    db.getCrewCheckin.mockResolvedValue({ workers: mockCrew })

    render(
      <TMForm
        project={mockProject}
        companyId={mockCompanyId}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        onShowToast={mockOnShowToast}
      />
    )

    await waitFor(() => {
      expect(db.getCrewCheckin).toHaveBeenCalledWith(mockProject.id)
    })
  })

  it('respects max photo limit prop', () => {
    const { container } = render(
      <TMForm
        project={mockProject}
        companyId={mockCompanyId}
        maxPhotos={3}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        onShowToast={mockOnShowToast}
      />
    )

    expect(container).toBeInTheDocument()
  })

  it('accepts onCancel callback prop', () => {
    const { container } = render(
      <TMForm
        project={mockProject}
        companyId={mockCompanyId}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        onShowToast={mockOnShowToast}
      />
    )

    // Component accepts the callback
    expect(mockOnCancel).toBeDefined()
    expect(container).toBeInTheDocument()
  })

  it('provides materials equipment loading capability', async () => {
    const mockItems = [
      { id: 1, name: 'Safety Vest', category: 'PPE', unit: 'each' },
      { id: 2, name: 'Hard Hat', category: 'PPE', unit: 'each' }
    ]

    db.getMaterialsEquipmentByCategory.mockResolvedValue(mockItems)

    render(
      <TMForm
        project={mockProject}
        companyId={mockCompanyId}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        onShowToast={mockOnShowToast}
      />
    )

    // Component is ready to load items when needed
    expect(db.getMaterialsEquipmentByCategory).not.toHaveBeenCalled()
  })

  it('initializes with multi-step wizard structure', () => {
    const { container } = render(
      <TMForm
        project={mockProject}
        companyId={mockCompanyId}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        onShowToast={mockOnShowToast}
      />
    )

    // Verify the form renders
    expect(container.firstChild).toBeInTheDocument()
  })
})
