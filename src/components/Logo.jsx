import { useBranding } from '../lib/BrandingContext'

export default function Logo({ className = '', showPoweredBy = false }) {
  const { branding } = useBranding()

  return (
    <div className={`app-logo ${className}`}>
      {branding.logo_url ? (
        <img
          src={branding.logo_url}
          alt={branding.custom_app_name || 'Logo'}
          className="custom-logo"
        />
      ) : (
        <div className="logo">
          {branding.custom_app_name || 'Field'}
          <span>Sync</span>
        </div>
      )}

      {showPoweredBy && !branding.hide_fieldsync_branding && (
        <div className="powered-by">
          Powered by FieldSync
        </div>
      )}
    </div>
  )
}
