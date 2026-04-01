import { Link } from 'react-router-dom'

export default function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer-brand">
        <span>Field</span>Sync
      </div>
      <p className="lp-footer-tagline">
        Every Update. Every Dollar. Accounted For.
      </p>
      <div className="lp-footer-legal">
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms of Service</Link>
      </div>
      <p className="lp-footer-copy">
        &copy; {new Date().getFullYear()} FieldSync. All rights reserved.
      </p>
    </footer>
  )
}
