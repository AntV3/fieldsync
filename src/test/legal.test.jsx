import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TermsAgreement from '../components/legal/TermsAgreement'
import TermsOfService from '../components/legal/TermsOfService'
import { LEGAL, termsAcceptanceMetadata, recordTermsAcceptance } from '../lib/legal'
import { TERMS_SECTIONS } from '../components/legal/termsContent'

vi.mock('../components/Logo', () => ({ default: () => <span>Logo</span> }))

describe('TermsAgreement', () => {
  it('links to both documents and reports the checkbox', () => {
    const onChange = vi.fn()
    render(<TermsAgreement checked={false} onChange={onChange} />)
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe('terms acceptance record', () => {
  it('stores the versions agreed to and when', () => {
    const meta = termsAcceptanceMetadata()
    expect(meta.terms_version).toBe(LEGAL.TERMS_VERSION)
    expect(meta.privacy_version).toBe(LEGAL.PRIVACY_VERSION)
    expect(Number.isNaN(Date.parse(meta.terms_accepted_at))).toBe(false)
  })

  it('never throws when the account update fails', async () => {
    const supabase = { auth: { updateUser: vi.fn().mockRejectedValue(new Error('offline')) } }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(recordTermsAcceptance(supabase)).resolves.toBeUndefined()
    expect(supabase.auth.updateUser).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('TermsOfService page', () => {
  it('renders every section with its number and the version', () => {
    render(<MemoryRouter><TermsOfService /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`Version ${LEGAL.TERMS_VERSION}`))).toBeInTheDocument()
    TERMS_SECTIONS.forEach((section, i) => {
      expect(screen.getByRole('heading', { level: 2, name: `${i + 1}. ${section.title}` })).toBeInTheDocument()
    })
  })

  it('covers electronic signatures and construction records', () => {
    const ids = TERMS_SECTIONS.map(s => s.id)
    expect(ids).toEqual(expect.arrayContaining(['signatures', 'construction', 'customer-data', 'liability', 'security']))
  })
})
