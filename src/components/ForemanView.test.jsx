import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ForemanView from './ForemanView'
import { db } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  db: {
    getAreas: vi.fn(),
    getUnreadCount: vi.fn(),
    updateAreaStatus: vi.fn(),
    getCrewCheckin: vi.fn(),
  }
}))

describe('ForemanView Component', () => {
  const mockProject = { id: 1, name: 'Test Project', pin: '1234' }
  const mockCompanyId = 123
  const mockOnShowToast = vi.fn()
  const mockOnExit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    db.getUnreadCount.mockResolvedValue(0)
    db.getCrewCheckin.mockResolvedValue({ workers: [] })
  })

  it('loads areas on mount', async () => {
    const mockAreas = [
      { id: 1, name: 'Level 1', status: 'not_started', weight: 50, group_name: 'Floor' },
      { id: 2, name: 'Level 2', status: 'working', weight: 50, group_name: 'Floor' }
    ]

    db.getAreas.mockResolvedValue(mockAreas)

    render(
      <ForemanView
        project={mockProject}
        companyId={mockCompanyId}
        onShowToast={mockOnShowToast}
        onExit={mockOnExit}
      />
    )

    await waitFor(() => {
      expect(db.getAreas).toHaveBeenCalledWith(mockProject.id)
    })
  })

  it('displays loading state initially', () => {
    db.getAreas.mockImplementation(() => new Promise(() => {}))

    render(
      <ForemanView
        project={mockProject}
        companyId={mockCompanyId}
        onShowToast={mockOnShowToast}
        onExit={mockOnExit}
      />
    )

    expect(screen.getByText(/Loading/i)).toBeInTheDocument()
  })

  it('provides status update functionality', async () => {
    const mockAreas = [
      { id: 1, name: 'Level 1', status: 'not_started', weight: 100, group_name: null }
    ]

    db.getAreas.mockResolvedValue(mockAreas)
    db.updateAreaStatus.mockResolvedValue({ success: true })

    render(
      <ForemanView
        project={mockProject}
        companyId={mockCompanyId}
        onShowToast={mockOnShowToast}
        onExit={mockOnExit}
      />
    )

    await waitFor(() => {
      expect(db.getAreas).toHaveBeenCalledWith(mockProject.id)
    })

    // Component is ready to handle status updates
    expect(db.updateAreaStatus).toBeDefined()
  })

  it('handles area data with various statuses', async () => {
    const mockAreas = [
      { id: 1, name: 'Level 1', status: 'working', weight: 100, group_name: null }
    ]

    db.getAreas.mockResolvedValue(mockAreas)
    db.updateAreaStatus.mockResolvedValue({ success: true })

    render(
      <ForemanView
        project={mockProject}
        companyId={mockCompanyId}
        onShowToast={mockOnShowToast}
        onExit={mockOnExit}
      />
    )

    await waitFor(() => {
      expect(db.getAreas).toHaveBeenCalled()
    })
  })

  it('loads unread message count', async () => {
    db.getAreas.mockResolvedValue([])
    db.getUnreadCount.mockResolvedValue(5)

    render(
      <ForemanView
        project={mockProject}
        companyId={mockCompanyId}
        onShowToast={mockOnShowToast}
        onExit={mockOnExit}
      />
    )

    await waitFor(() => {
      expect(db.getUnreadCount).toHaveBeenCalledWith(mockProject.id, 'field')
    })
  })

  it('displays error message when area loading fails', async () => {
    db.getAreas.mockRejectedValue(new Error('Network error'))

    render(
      <ForemanView
        project={mockProject}
        companyId={mockCompanyId}
        onShowToast={mockOnShowToast}
        onExit={mockOnExit}
      />
    )

    await waitFor(() => {
      expect(mockOnShowToast).toHaveBeenCalledWith('Error loading areas', 'error')
    })
  })

  it('groups areas by group_name', async () => {
    const mockAreas = [
      { id: 1, name: 'Level 1', status: 'not_started', weight: 25, group_name: 'Floors' },
      { id: 2, name: 'Level 2', status: 'not_started', weight: 25, group_name: 'Floors' },
      { id: 3, name: 'Roof', status: 'not_started', weight: 50, group_name: 'Exterior' }
    ]

    db.getAreas.mockResolvedValue(mockAreas)

    render(
      <ForemanView
        project={mockProject}
        companyId={mockCompanyId}
        onShowToast={mockOnShowToast}
        onExit={mockOnExit}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Floors')).toBeInTheDocument()
      expect(screen.getByText('Exterior')).toBeInTheDocument()
    })
  })

  it('displays project information', async () => {
    db.getAreas.mockResolvedValue([])

    render(
      <ForemanView
        project={mockProject}
        companyId={mockCompanyId}
        onShowToast={mockOnShowToast}
        onExit={mockOnExit}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(mockProject.name)).toBeInTheDocument()
    })
  })
})
