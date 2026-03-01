export default function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer-brand">
        <span>Field</span>Sync
      </div>
      <p className="lp-footer-tagline">
        Real work. Real data. Real time.
      </p>
      <p className="lp-footer-copy">
        &copy; {new Date().getFullYear()} FieldSync. All rights reserved.
      </p>
    </footer>
  )
}
