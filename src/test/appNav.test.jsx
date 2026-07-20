import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../lib/ToastContext'

// Authenticated office user so the nav bar renders
vi.mock('../hooks/useAuthState', () => ({
  default: () => ({
    user: { id: 'u1', name: 'Alex Vega', email: 'alex@acme.test' },
    company: { id: 'c1', name: 'Acme Demolition' },
    userCompanies: [{ id: 'c1', name: 'Acme Demolition', access_level: 'administrator' }],
    authReady: true,
    loading: false,
    mfaPending: false,
    mfaFactorId: null,
    pendingCompanyName: null,
    foremanProject: null,
    foremanName: null,
    checkAuth: vi.fn(),
    handleOfficeLogin: vi.fn(),
    handleSwitchCompany: vi.fn(),
    handleLogout: vi.fn(),
    handleForemanAccess: vi.fn(),
    handleExitForeman: vi.fn(),
    handleMfaVerified: vi.fn(),
    handleMfaCancel: vi.fn(),
  })
}))

import App from '../App'

const renderApp = () => render(
  <MemoryRouter initialEntries={['/dashboard']}>
    <ToastProvider>
      <App />
    </ToastProvider>
  </MemoryRouter>
)

describe('Main nav consolidation', () => {
  it('shows Dashboard, + New Project and a Settings dropdown; Analytics is gone', async () => {
    renderApp()
    const nav = await screen.findByRole('navigation')
    expect(nav).toHaveTextContent('Dashboard')
    expect(nav).toHaveTextContent('+ New Project')
    expect(nav).toHaveTextContent('Settings')
    // Analytics moved into Project Info > Analytics — no top-level nav item
    expect(nav).not.toHaveTextContent('Analytics')
  })

  it('opens the Settings dropdown with Pricing, Branding, Team, Account', async () => {
    renderApp()
    const trigger = await screen.findByRole('button', { name: /Settings/ })
    fireEvent.click(trigger)
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument()
    })
    const menu = screen.getByRole('menu')
    expect(menu).toHaveTextContent('Pricing')
    expect(menu).toHaveTextContent('Branding')
    expect(menu).toHaveTextContent('Team')
    expect(menu).toHaveTextContent('Account')
  })

  it('navigates and closes the dropdown when an item is clicked', async () => {
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: /Settings/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Account/ }))
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })
})
