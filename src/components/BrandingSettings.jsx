import { useState, useRef } from 'react'
import { useBranding } from '../lib/BrandingContext'

export default function BrandingSettings({ company, onShowToast }) {
  const { branding, updateBranding, uploadBrandingImage, loading } = useBranding()
  const [saving, setSaving] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [localBranding, setLocalBranding] = useState(branding)

  const logoInputRef = useRef(null)
  const faviconInputRef = useRef(null)
  const backgroundInputRef = useRef(null)

  // Tier restrictions
  const tier = company?.subscription_tier || 'free'
  const canCustomizeLogo = ['pro', 'business', 'enterprise'].includes(tier)
  const canWhiteLabel = ['business', 'enterprise'].includes(tier)
  const canCustomDomain = tier === 'enterprise'

  const handleInputChange = (field, value) => {
    setLocalBranding(prev => ({ ...prev, [field]: value }))
  }

  const handleImageUpload = async (file, type) => {
    if (!file) return

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      onShowToast?.('Image must be smaller than 5MB', 'error')
      return
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      onShowToast?.('Please upload an image file', 'error')
      return
    }

    try {
      const result = await uploadBrandingImage(file, type)
      if (result.success) {
        handleInputChange(`${type}_url`, result.url)
        onShowToast?.(`${type.charAt(0).toUpperCase() + type.slice(1)} uploaded successfully`, 'success')
      } else {
        onShowToast?.(result.error || 'Failed to upload image', 'error')
      }
    } catch (error) {
      console.error('Upload error:', error)
      onShowToast?.('Failed to upload image', 'error')
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)

      // Validate colors
      const colorRegex = /^#[0-9A-F]{6}$/i
      if (!colorRegex.test(localBranding.primary_color)) {
        onShowToast?.('Primary color must be a valid hex color (e.g., #3B82F6)', 'error')
        return
      }
      if (!colorRegex.test(localBranding.secondary_color)) {
        onShowToast?.('Secondary color must be a valid hex color (e.g., #1E40AF)', 'error')
        return
      }

      const result = await updateBranding(localBranding)

      if (result.success) {
        onShowToast?.('Branding settings saved successfully!', 'success')
      } else {
        onShowToast?.(result.error || 'Failed to save branding settings', 'error')
      }
    } catch (error) {
      console.error('Save error:', error)
      onShowToast?.('Failed to save branding settings', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handlePreview = () => {
    // Apply preview to DOM temporarily
    if (!previewMode) {
      document.documentElement.style.setProperty('--primary-color', localBranding.primary_color)
      document.documentElement.style.setProperty('--secondary-color', localBranding.secondary_color)
      document.title = localBranding.custom_app_name || 'FieldSync'
    } else {
      // Restore current branding
      document.documentElement.style.setProperty('--primary-color', branding.primary_color)
      document.documentElement.style.setProperty('--secondary-color', branding.secondary_color)
      document.title = branding.custom_app_name || 'FieldSync'
    }
    setPreviewMode(!previewMode)
  }

  if (loading) {
    return (
      <div className="settings-loading">
        <div className="spinner"></div>
        <p>Loading branding settings...</p>
      </div>
    )
  }

  return (
    <div className="branding-settings">
      <div className="settings-header">
        <h2>🎨 Branding Settings</h2>
        {tier === 'free' && (
          <div className="tier-badge tier-free">Free Plan - Upgrade for branding options</div>
        )}
        {tier === 'pro' && (
          <div className="tier-badge tier-pro">Pro Plan</div>
        )}
        {tier === 'business' && (
          <div className="tier-badge tier-business">Business Plan</div>
        )}
        {tier === 'enterprise' && (
          <div className="tier-badge tier-enterprise">Enterprise Plan</div>
        )}
      </div>

      <div className="settings-section">
        <h3>Visual Identity</h3>

        {/* Logo Upload */}
        <div className="setting-item">
          <label>Logo</label>
          {!canCustomizeLogo ? (
            <div className="upgrade-notice">
              <p>🔒 Upgrade to Pro, Business, or Enterprise to customize your logo</p>
            </div>
          ) : (
            <>
              {localBranding.logo_url && (
                <div className="logo-preview">
                  <img src={localBranding.logo_url} alt="Logo preview" />
                </div>
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleImageUpload(e.target.files[0], 'logo')}
              />
              <button
                className="btn-secondary"
                onClick={() => logoInputRef.current?.click()}
              >
                {localBranding.logo_url ? 'Change Logo' : 'Upload Logo'}
              </button>
              <p className="help-text">Recommended: 200x60px, PNG with transparent background</p>
            </>
          )}
        </div>

        {/* App Name */}
        <div className="setting-item">
          <label htmlFor="app-name">App Name</label>
          {!canCustomizeLogo ? (
            <div className="upgrade-notice">
              <p>🔒 Upgrade to Pro, Business, or Enterprise to customize your app name</p>
            </div>
          ) : (
            <>
              <input
                id="app-name"
                type="text"
                className="input"
                value={localBranding.custom_app_name || ''}
                onChange={(e) => handleInputChange('custom_app_name', e.target.value)}
                placeholder="FieldSync"
                maxLength={50}
              />
              <p className="help-text">This name appears in the browser tab and throughout the app</p>
            </>
          )}
        </div>

        {/* Primary Color */}
        <div className="setting-item">
          <label htmlFor="primary-color">Primary Color</label>
          {!canCustomizeLogo ? (
            <div className="upgrade-notice">
              <p>🔒 Upgrade to Pro, Business, or Enterprise to customize colors</p>
            </div>
          ) : (
            <div className="color-input-group">
              <input
                id="primary-color"
                type="color"
                value={localBranding.primary_color || '#3B82F6'}
                onChange={(e) => handleInputChange('primary_color', e.target.value)}
                className="color-picker"
              />
              <input
                type="text"
                className="input color-text"
                value={localBranding.primary_color || '#3B82F6'}
                onChange={(e) => handleInputChange('primary_color', e.target.value)}
                placeholder="#3B82F6"
                pattern="^#[0-9A-Fa-f]{6}$"
              />
            </div>
          )}
        </div>

        {/* Secondary Color */}
        <div className="setting-item">
          <label htmlFor="secondary-color">Secondary Color</label>
          {!canCustomizeLogo ? (
            <div className="upgrade-notice">
              <p>🔒 Upgrade to Pro, Business, or Enterprise to customize colors</p>
            </div>
          ) : (
            <div className="color-input-group">
              <input
                id="secondary-color"
                type="color"
                value={localBranding.secondary_color || '#1E40AF'}
                onChange={(e) => handleInputChange('secondary_color', e.target.value)}
                className="color-picker"
              />
              <input
                type="text"
                className="input color-text"
                value={localBranding.secondary_color || '#1E40AF'}
                onChange={(e) => handleInputChange('secondary_color', e.target.value)}
                placeholder="#1E40AF"
                pattern="^#[0-9A-Fa-f]{6}$"
              />
            </div>
          )}
        </div>

        {/* Favicon */}
        <div className="setting-item">
          <label>Favicon</label>
          {!canCustomizeLogo ? (
            <div className="upgrade-notice">
              <p>🔒 Upgrade to Pro, Business, or Enterprise to customize your favicon</p>
            </div>
          ) : (
            <>
              {localBranding.favicon_url && (
                <div className="favicon-preview">
                  <img src={localBranding.favicon_url} alt="Favicon preview" />
                </div>
              )}
              <input
                ref={faviconInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleImageUpload(e.target.files[0], 'favicon')}
              />
              <button
                className="btn-secondary"
                onClick={() => faviconInputRef.current?.click()}
              >
                {localBranding.favicon_url ? 'Change Favicon' : 'Upload Favicon'}
              </button>
              <p className="help-text">Recommended: 32x32px or 64x64px, PNG or ICO format</p>
            </>
          )}
        </div>

        {/* Login Background */}
        <div className="setting-item">
          <label>Login Background</label>
          {!canWhiteLabel ? (
            <div className="upgrade-notice">
              <p>🔒 Upgrade to Business or Enterprise to customize login background</p>
            </div>
          ) : (
            <>
              {localBranding.login_background_url && (
                <div className="background-preview">
                  <img src={localBranding.login_background_url} alt="Background preview" />
                </div>
              )}
              <input
                ref={backgroundInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleImageUpload(e.target.files[0], 'login_background')}
              />
              <button
                className="btn-secondary"
                onClick={() => backgroundInputRef.current?.click()}
              >
                {localBranding.login_background_url ? 'Change Background' : 'Upload Background'}
              </button>
              <p className="help-text">Recommended: 1920x1080px, JPG or PNG</p>
            </>
          )}
        </div>
      </div>

      {/* White-Label Options */}
      <div className="settings-section">
        <h3>White-Label Options</h3>

        <div className="setting-item">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={localBranding.hide_fieldsync_branding || false}
              onChange={(e) => handleInputChange('hide_fieldsync_branding', e.target.checked)}
              disabled={!canWhiteLabel}
            />
            <span>Hide "Powered by FieldSync"</span>
          </label>
          {!canWhiteLabel && (
            <p className="help-text">🔒 Business or Enterprise plan required</p>
          )}
        </div>
      </div>

      {/* Email Settings */}
      <div className="settings-section">
        <h3>Email Branding</h3>

        <div className="setting-item">
          <label htmlFor="email-from-name">From Name</label>
          <input
            id="email-from-name"
            type="text"
            className="input"
            value={localBranding.email_from_name || ''}
            onChange={(e) => handleInputChange('email_from_name', e.target.value)}
            placeholder="Your Company Name"
            disabled={!canWhiteLabel}
          />
          {!canWhiteLabel && (
            <p className="help-text">🔒 Business or Enterprise plan required</p>
          )}
        </div>

        <div className="setting-item">
          <label htmlFor="email-from-address">From Email</label>
          <input
            id="email-from-address"
            type="email"
            className="input"
            value={localBranding.email_from_address || ''}
            onChange={(e) => handleInputChange('email_from_address', e.target.value)}
            placeholder="noreply@yourcompany.com"
            disabled={!canWhiteLabel}
          />
          {!canWhiteLabel && (
            <p className="help-text">🔒 Business or Enterprise plan required</p>
          )}
        </div>
      </div>

      {/* Custom Domain */}
      <div className="settings-section">
        <h3>Custom Domain</h3>

        <div className="setting-item">
          <label htmlFor="custom-domain">Domain</label>
          {!canCustomDomain ? (
            <div className="upgrade-notice">
              <p>🔒 Enterprise plan required for custom domain support</p>
              <p className="help-text">
                Custom domains allow you to host the app at your own URL (e.g., app.yourcompany.com)
              </p>
            </div>
          ) : (
            <>
              <input
                id="custom-domain"
                type="text"
                className="input"
                value={localBranding.custom_domain || ''}
                onChange={(e) => handleInputChange('custom_domain', e.target.value)}
                placeholder="app.yourcompany.com"
              />
              {localBranding.custom_domain && (
                <div className={`domain-status ${localBranding.domain_verified ? 'verified' : 'pending'}`}>
                  {localBranding.domain_verified ? (
                    <>✓ Connected</>
                  ) : (
                    <>⚠ DNS setup required</>
                  )}
                </div>
              )}
              <p className="help-text">
                Contact support to configure DNS and SSL certificate for your custom domain
              </p>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="settings-actions">
        <button
          className="btn-secondary"
          onClick={handlePreview}
        >
          {previewMode ? 'Exit Preview' : 'Preview Changes'}
        </button>
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={saving || !canCustomizeLogo}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {previewMode && (
        <div className="preview-banner">
          Preview Mode Active - Your changes are not yet saved
        </div>
      )}
    </div>
  )
}
