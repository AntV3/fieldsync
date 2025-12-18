import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import Toast from './Toast'

describe('Toast Component', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the message', () => {
    const mockOnClose = vi.fn()
    render(<Toast message="Test message" onClose={mockOnClose} />)

    expect(screen.getByText('Test message')).toBeInTheDocument()
  })

  it('applies the correct type class', () => {
    const mockOnClose = vi.fn()
    const { container } = render(
      <Toast message="Error message" type="error" onClose={mockOnClose} />
    )

    const toast = container.querySelector('.toast')
    expect(toast).toHaveClass('error')
  })

  it('calls onClose after 3 seconds', () => {
    const mockOnClose = vi.fn()
    render(<Toast message="Test message" onClose={mockOnClose} />)

    expect(mockOnClose).not.toHaveBeenCalled()

    vi.advanceTimersByTime(3000)

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('cleans up timer on unmount', () => {
    const mockOnClose = vi.fn()
    const { unmount } = render(<Toast message="Test message" onClose={mockOnClose} />)

    unmount()
    vi.advanceTimersByTime(3000)

    expect(mockOnClose).not.toHaveBeenCalled()
  })

  it('handles missing type gracefully', () => {
    const mockOnClose = vi.fn()
    const { container } = render(<Toast message="Test message" onClose={mockOnClose} />)

    const toast = container.querySelector('.toast')
    expect(toast).toBeInTheDocument()
  })
})
