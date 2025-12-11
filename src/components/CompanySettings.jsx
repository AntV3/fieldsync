import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Company Settings Component
 * Manage company profile, subscription, and limits
 */
export default function CompanySettings({ company, currentUser, onShowToast, onCompanyUpdated }) {
  const [settings, setSettings] = useState({
    name: company?.name || '',
    code: company?.code || '',
    primary_color: company?.primary_color || '#4299e1',
    logo_url: company?.logo_url || ''
  })
  const [limits, setLimits] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (company) {
      loadCompanyLimits()
    }
  }, [company])

  const loadCompanyLimits = async () => {
    try {
      setLoading(true)

      // Call RPC function to check company limits
      const { data, error } = await supabase.rpc('check_company_limits', {
        company_uuid: company.id
      })

      if (error) throw error

      // RPC returns array with one row
      setLimits(data?.[0] || null)
    } catch (error) {
      console.error('Error loading company limits:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSettings = async (e) => {
    e.preventDefault()
    setSaving(true)

    try {
      const { error } = await supabase
        .from('companies')
        .update({
          name: settings.name,
          code: settings.code,
          primary_color: settings.primary_color,
          logo_url: settings.logo_url || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', company.id)

      if (error) throw error

      onShowToast?.('Company settings saved', 'success')
      onCompanyUpdated?.()
    } catch (error) {
      console.error('Error saving settings:', error)
      onShowToast?.('Error saving settings: ' + error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const getSubscriptionStatusBadge = (status) => {
    const badges = {
      trial: { label: 'Trial', class: 'badge-info' },
      active: { label: 'Active', class: 'badge-success' },
      past_due: { label: 'Past Due', class: 'badge-warning' },
      canceled: { label: 'Canceled', class: 'badge-error' },
      inactive: { label: 'Inactive', class: 'badge-muted' }
    }
    return badges[status] || badges.inactive
  }

  const getPlanInfo = (plan) => {
    const plans = {
      trial: { name: 'Trial', price: 'Free for 14 days', features: ['3 projects', '5 users'] },
      starter: { name: 'Starter', price: '$99/month', features: ['10 projects', '10 users', 'Email support'] },
      professional: { name: 'Professional', price: '$299/month', features: ['50 projects', '25 users', 'Priority support', 'QuickBooks integration'] },
      enterprise: { name: 'Enterprise', price: 'Custom', features: ['Unlimited projects', '100 users', 'Dedicated support', 'Custom integrations'] }
    }
    return plans[plan] || plans.trial
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const isTrialExpired = limits?.trial_expired || false
  const canManageSettings = currentUser?.role === 'admin' || currentUser?.role === 'office'

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <div className="company-settings-container">
      <div className="page-header">
        <h1>Company Settings</h1>
        <p className="text-muted">Manage your company profile and subscription</p>
      </div>

      {/* Subscription Overview */}
      <div className="settings-section">
        <h3>Subscription</h3>
        <div className="subscription-card">
          <div className="subscription-header">
            <div>
              <h2>{getPlanInfo(company.subscription_plan).name} Plan</h2>
              <p className="text-muted">{getPlanInfo(company.subscription_plan).price}</p>
            </div>
            <div>
              <span className={`badge ${getSubscriptionStatusBadge(company.subscription_status).class}`}>
                {getSubscriptionStatusBadge(company.subscription_status).label}
              </span>
            </div>
          </div>

          <div className="subscription-details">
            {company.subscription_status === 'trial' && (
              <div className={`trial-notice ${isTrialExpired ? 'trial-expired' : ''}`}>
                {isTrialExpired ? (
                  <>
                    <span className="trial-icon">⚠️</span>
                    <span>Trial expired on {formatDate(company.trial_ends_at)}</span>
                  </>
                ) : (
                  <>
                    <span className="trial-icon">⏳</span>
                    <span>Trial ends on {formatDate(company.trial_ends_at)}</span>
                  </>
                )}
              </div>
            )}

            <div className="plan-features">
              <h4>Plan Features:</h4>
              <ul>
                {getPlanInfo(company.subscription_plan).features.map((feature, index) => (
                  <li key={index}>✓ {feature}</li>
                ))}
              </ul>
            </div>

            <div className="plan-limits">
              <div className="limit-item">
                <span className="limit-label">Projects</span>
                <div className="limit-bar">
                  <div className="limit-progress-bar">
                    <div
                      className="limit-progress-fill"
                      style={{ width: `${(limits?.current_projects / limits?.max_projects) * 100}%` }}
                    />
                  </div>
                  <span className="limit-text">
                    {limits?.current_projects} / {limits?.max_projects}
                  </span>
                </div>
              </div>

              <div className="limit-item">
                <span className="limit-label">Team Members</span>
                <div className="limit-bar">
                  <div className="limit-progress-bar">
                    <div
                      className="limit-progress-fill"
                      style={{ width: `${(limits?.current_users / limits?.max_users) * 100}%` }}
                    />
                  </div>
                  <span className="limit-text">
                    {limits?.current_users} / {limits?.max_users}
                  </span>
                </div>
              </div>
            </div>

            {isTrialExpired && (
              <div className="upgrade-prompt">
                <p>Your trial has expired. Upgrade to continue using FieldSync.</p>
                <button className="btn btn-primary">
                  Upgrade Now
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Company Profile */}
      {canManageSettings && (
        <div className="settings-section">
          <h3>Company Profile</h3>
          <form onSubmit={handleSaveSettings} className="settings-form">
            <div className="form-group">
              <label>Company Name *</label>
              <input
                type="text"
                value={settings.name}
                onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                required
                className="input-full"
              />
            </div>

            <div className="form-group">
              <label>Company Code *</label>
              <input
                type="text"
                value={settings.code}
                onChange={(e) => setSettings({ ...settings, code: e.target.value })}
                required
                className="input-full"
                placeholder="ABC123"
              />
              <p className="form-hint">Used for project PIN codes and identification</p>
            </div>

            <div className="form-group">
              <label>Logo URL (Optional)</label>
              <input
                type="url"
                value={settings.logo_url}
                onChange={(e) => setSettings({ ...settings, logo_url: e.target.value })}
                className="input-full"
                placeholder="https://example.com/logo.png"
              />
              <p className="form-hint">URL to your company logo</p>
            </div>

            <div className="form-group">
              <label>Primary Color</label>
              <div className="color-picker-wrapper">
                <input
                  type="color"
                  value={settings.primary_color}
                  onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })}
                  className="color-picker"
                />
                <input
                  type="text"
                  value={settings.primary_color}
                  onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })}
                  className="color-input"
                  placeholder="#4299e1"
                />
              </div>
              <p className="form-hint">Brand color for your company</p>
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Company Info (Read-only for non-admins) */}
      {!canManageSettings && (
        <div className="settings-section">
          <h3>Company Information</h3>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Company Name:</span>
              <span className="info-value">{company.name}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Company Code:</span>
              <span className="info-value">{company.code}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Member Since:</span>
              <span className="info-value">{formatDate(company.created_at)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
