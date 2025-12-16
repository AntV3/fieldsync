import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'

export default function CompanySwitcher({ user, currentCompany, onCompanySwitch, onShowToast }) {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (user?.id) {
      loadUserCompanies()
    }
  }, [user])

  const loadUserCompanies = async () => {
    try {
      const userCompanies = await db.getUserCompanies(user.id)
      setCompanies(userCompanies)
    } catch (error) {
      console.error('Error loading companies:', error)
    }
  }

  const handleSwitchCompany = async (companyId) => {
    if (companyId === currentCompany?.id) {
      setIsOpen(false)
      return
    }

    setLoading(true)
    try {
      await db.switchActiveCompany(user.id, companyId)
      
      // Find the new company
      const newCompany = companies.find(c => c.company_id === companyId)
      
      if (onCompanySwitch) {
        onCompanySwitch({
          id: newCompany.company_id,
          name: newCompany.company_name,
          field_code: newCompany.company_field_code
        })
      }

      onShowToast?.(`Switched to ${newCompany.company_name}`, 'success')
      setIsOpen(false)
    } catch (error) {
      console.error('Error switching company:', error)
      onShowToast?.('Failed to switch company', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (companies.length <= 1) {
    // Don't show switcher if user only has access to one company
    return null
  }

  return (
    <div className="company-switcher">
      <button
        className="company-switcher-btn"
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
      >
        <span className="company-switcher-icon">🏢</span>
        <span className="company-switcher-name">{currentCompany?.name || 'Select Company'}</span>
        <span className="company-switcher-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="company-switcher-dropdown">
          {companies.map((company) => (
            <button
              key={company.company_id}
              className={`company-switcher-item ${company.is_active ? 'active' : ''}`}
              onClick={() => handleSwitchCompany(company.company_id)}
              disabled={loading}
            >
              <div className="company-switcher-item-content">
                <span className="company-switcher-item-name">{company.company_name}</span>
                <span className="company-switcher-item-code">{company.company_field_code}</span>
              </div>
              {company.is_active && <span className="company-switcher-checkmark">✓</span>}
            </button>
          ))}
        </div>
      )}

      {isOpen && (
        <div
          className="company-switcher-overlay"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}
