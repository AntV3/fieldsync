import { useState, useEffect } from 'react'
import { db, supabase } from '../lib/supabase'
import './CompanySwitcher.css'

export default function CompanySwitcher({ user, currentCompany, onCompanyChange, onShowToast }) {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (user?.id) {
      loadUserCompanies()
    }
  }, [user?.id])

  const loadUserCompanies = async () => {
    try {
      const data = await db.getUserCompanies(user.id)
      console.log('Loaded companies:', data)
      setCompanies(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Error loading companies:', error)
      onShowToast?.('Error loading companies', 'error')
      setCompanies([])
    } finally {
      setLoading(false)
    }
  }

  const handleSwitchCompany = (company) => {
    if (company.id === currentCompany?.id) {
      setIsOpen(false)
      return
    }

    // Just update the local state - no database changes needed
    onCompanyChange(company)
    setIsOpen(false)
    onShowToast?.(`Switched to ${company.name}`, 'success')
  }

  // Don't show if user only has one company
  if (loading || companies.length <= 1) {
    return null
  }

  return (
    <div className="company-switcher">
      <button
        className="company-switcher-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="Switch company"
      >
        <span className="company-switcher-name">{currentCompany?.name}</span>
        <span className="company-switcher-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <>
          <div className="company-switcher-overlay" onClick={() => setIsOpen(false)} />
          <div className="company-switcher-dropdown">
            {companies.length === 0 ? (
              <div className="company-switcher-empty">No companies found</div>
            ) : (
              companies.map(company => {
                if (!company?.id) {
                  console.warn('Invalid company object:', company)
                  return null
                }

                const isActive = company.id === currentCompany?.id

                return (
                  <button
                    key={company.id}
                    className={`company-switcher-item ${isActive ? 'active' : ''}`}
                    onClick={() => handleSwitchCompany(company)}
                    disabled={isActive}
                  >
                    <div className="company-switcher-item-info">
                      <span className="company-switcher-item-name">{company.name || 'Unknown'}</span>
                      {company.field_code && (
                        <span className="company-switcher-item-code">{company.field_code}</span>
                      )}
                    </div>
                    {isActive && <span className="company-switcher-check">✓</span>}
                  </button>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}
