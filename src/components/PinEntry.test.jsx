import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PinEntry from './PinEntry'
import { db } from '../lib/supabase'

// Mock the db module
vi.mock('../lib/supabase', () => ({
  db: {
    getCompanyByCode: vi.fn(),
    getProjectByPinAndCompany: vi.fn(),
  }
}))

describe('PinEntry Component', () => {
  const mockOnProjectAccess = vi.fn()
  const mockOnOfficeLogin = vi.fn()
  const mockOnShowToast = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Company Code Entry Step', () => {
    it('renders company code input initially', () => {
      render(
        <PinEntry
          onProjectAccess={mockOnProjectAccess}
          onOfficeLogin={mockOnOfficeLogin}
          onShowToast={mockOnShowToast}
        />
      )

      expect(screen.getByPlaceholderText('Company Code')).toBeInTheDocument()
      expect(screen.getByText('Continue')).toBeInTheDocument()
    })

    it('transforms company code to uppercase and removes invalid characters', async () => {
      const user = userEvent.setup()
      render(
        <PinEntry
          onProjectAccess={mockOnProjectAccess}
          onOfficeLogin={mockOnOfficeLogin}
          onShowToast={mockOnShowToast}
        />
      )

      const input = screen.getByPlaceholderText('Company Code')
      await user.type(input, 'abc123!@#')

      expect(input.value).toBe('ABC123')
    })

    it('limits company code to 20 characters', async () => {
      const user = userEvent.setup()
      render(
        <PinEntry
          onProjectAccess={mockOnProjectAccess}
          onOfficeLogin={mockOnOfficeLogin}
          onShowToast={mockOnShowToast}
        />
      )

      const input = screen.getByPlaceholderText('Company Code')
      await user.type(input, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')

      expect(input.value).toHaveLength(20)
    })

    it('disables submit button when company code is too short', async () => {
      render(
        <PinEntry
          onProjectAccess={mockOnProjectAccess}
          onOfficeLogin={mockOnOfficeLogin}
          onShowToast={mockOnShowToast}
        />
      )

      const input = screen.getByPlaceholderText('Company Code')
      await userEvent.type(input, 'A')

      const button = screen.getByText('Continue')
      expect(button).toBeDisabled()
    })

    it('proceeds to PIN step when valid company code is entered', async () => {
      const mockCompany = { id: 1, name: 'Test Company', code: 'TEST123' }
      db.getCompanyByCode.mockResolvedValue(mockCompany)

      render(
        <PinEntry
          onProjectAccess={mockOnProjectAccess}
          onOfficeLogin={mockOnOfficeLogin}
          onShowToast={mockOnShowToast}
        />
      )

      const input = screen.getByPlaceholderText('Company Code')
      await userEvent.type(input, 'TEST123')

      const button = screen.getByText('Continue')
      await userEvent.click(button)

      await waitFor(() => {
        expect(db.getCompanyByCode).toHaveBeenCalledWith('TEST123')
        expect(screen.getByText('Enter project PIN')).toBeInTheDocument()
      })
    })

    it('shows error for invalid company code', async () => {
      db.getCompanyByCode.mockResolvedValue(null)

      render(
        <PinEntry
          onProjectAccess={mockOnProjectAccess}
          onOfficeLogin={mockOnOfficeLogin}
          onShowToast={mockOnShowToast}
        />
      )

      const input = screen.getByPlaceholderText('Company Code')
      await userEvent.type(input, 'INVALID')

      const button = screen.getByText('Continue')
      await userEvent.click(button)

      await waitFor(() => {
        expect(mockOnShowToast).toHaveBeenCalledWith('Invalid company code', 'error')
      })
    })
  })

  describe('PIN Entry Step', () => {
    beforeEach(async () => {
      const mockCompany = { id: 1, name: 'Test Company', code: 'TEST123' }
      db.getCompanyByCode.mockResolvedValue(mockCompany)

      render(
        <PinEntry
          onProjectAccess={mockOnProjectAccess}
          onOfficeLogin={mockOnOfficeLogin}
          onShowToast={mockOnShowToast}
        />
      )

      const input = screen.getByPlaceholderText('Company Code')
      await userEvent.type(input, 'TEST123')

      const button = screen.getByText('Continue')
      await userEvent.click(button)

      await waitFor(() => {
        expect(screen.getByText('Enter project PIN')).toBeInTheDocument()
      })
    })

    it('renders number pad', () => {
      for (let i = 0; i <= 9; i++) {
        expect(screen.getByText(i.toString())).toBeInTheDocument()
      }
    })

    it('allows entering PIN using number pad', async () => {
      const button1 = screen.getByText('1')
      const button2 = screen.getByText('2')
      const button3 = screen.getByText('3')
      const button4 = screen.getByText('4')

      await userEvent.click(button1)
      await userEvent.click(button2)
      await userEvent.click(button3)
      await userEvent.click(button4)

      // Check that 4 filled dots are displayed
      const filledDots = document.querySelectorAll('.pin-dot.filled')
      expect(filledDots).toHaveLength(4)
    })

    it('auto-submits when 4 digits are entered', async () => {
      const mockProject = { id: 1, name: 'Test Project', pin: '1234' }
      db.getProjectByPinAndCompany.mockResolvedValue(mockProject)

      const button1 = screen.getByText('1')
      const button2 = screen.getByText('2')
      const button3 = screen.getByText('3')
      const button4 = screen.getByText('4')

      await userEvent.click(button1)
      await userEvent.click(button2)
      await userEvent.click(button3)
      await userEvent.click(button4)

      await waitFor(() => {
        expect(db.getProjectByPinAndCompany).toHaveBeenCalledWith('1234', 1)
        expect(mockOnProjectAccess).toHaveBeenCalledWith(mockProject)
      }, { timeout: 1000 })
    })

    it('shows error for invalid PIN', async () => {
      db.getProjectByPinAndCompany.mockResolvedValue(null)

      const button1 = screen.getByText('1')
      const button2 = screen.getByText('2')
      const button3 = screen.getByText('3')
      const button4 = screen.getByText('4')

      await userEvent.click(button1)
      await userEvent.click(button2)
      await userEvent.click(button3)
      await userEvent.click(button4)

      await waitFor(() => {
        expect(mockOnShowToast).toHaveBeenCalledWith('Invalid PIN', 'error')
      }, { timeout: 1000 })
    })

    it('allows backspace to delete digits', async () => {
      const button1 = screen.getByText('1')
      const button2 = screen.getByText('2')

      await userEvent.click(button1)
      await userEvent.click(button2)

      let filledDots = document.querySelectorAll('.pin-dot.filled')
      expect(filledDots).toHaveLength(2)

      // Use class selector to get the backspace button specifically
      const backspaceBtn = document.querySelector('.num-btn.backspace')
      await userEvent.click(backspaceBtn)

      filledDots = document.querySelectorAll('.pin-dot.filled')
      expect(filledDots).toHaveLength(1)
    })

    it('allows going back to company code step', async () => {
      const backButtons = screen.getAllByText('←')
      // First back button is at the top of the PIN entry screen
      await userEvent.click(backButtons[0])

      expect(screen.getByPlaceholderText('Company Code')).toBeInTheDocument()
    })
  })

  describe('Office Login', () => {
    it('calls onOfficeLogin when office login link is clicked', async () => {
      render(
        <PinEntry
          onProjectAccess={mockOnProjectAccess}
          onOfficeLogin={mockOnOfficeLogin}
          onShowToast={mockOnShowToast}
        />
      )

      const officeLink = screen.getByText('Office Login →')
      await userEvent.click(officeLink)

      expect(mockOnOfficeLogin).toHaveBeenCalled()
    })
  })
})
