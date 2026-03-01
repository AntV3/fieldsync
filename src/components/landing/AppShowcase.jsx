import { useRef } from 'react'
import { Smartphone, Monitor, Clock } from 'lucide-react'

export default function AppShowcase({ onVisible }) {
  const ref = useRef(null)

  return (
    <section className="lp-showcase lp-animate" ref={ref}>
      <span className="lp-showcase-label">See FieldSync in Action</span>
      <h2 className="lp-showcase-heading">
        Real-time data. Real decisions. Real results.
      </h2>
      <p className="lp-showcase-desc">
        Your foremen update progress from the field with a single tap. Your office
        sees it the same second — not at the end of the day, not next week. Leading
        data means you spot issues early, approve change orders faster, and keep
        payments moving.
      </p>

      <div className="lp-showcase-screenshots">
        {/* Screenshot: Field Foreman View */}
        <div className="lp-screenshot-card lp-animate">
          <div className="lp-screenshot-frame mobile">
            <img
              src="/screenshots/foreman-mobile.png"
              alt="FieldSync foreman mobile view — one-tap progress updates from the field"
              className="lp-screenshot-img"
              onError={(e) => {
                e.target.style.display = 'none'
                e.target.nextSibling.style.display = 'flex'
              }}
            />
            <div className="lp-screenshot-placeholder" style={{ display: 'none' }}>
              <Smartphone size={32} />
              <span>Foreman Mobile View</span>
            </div>
          </div>
          <div className="lp-screenshot-caption">
            <h3>Field View</h3>
            <p>One tap to update progress. No forms, no delays.</p>
          </div>
        </div>

        {/* Screenshot: Office Dashboard */}
        <div className="lp-screenshot-card lp-animate" style={{ transitionDelay: '0.1s' }}>
          <div className="lp-screenshot-frame desktop">
            <img
              src="/screenshots/office-dashboard.png"
              alt="FieldSync office dashboard — live project progress, financials, and field activity"
              className="lp-screenshot-img"
              onError={(e) => {
                e.target.style.display = 'none'
                e.target.nextSibling.style.display = 'flex'
              }}
            />
            <div className="lp-screenshot-placeholder" style={{ display: 'none' }}>
              <Monitor size={32} />
              <span>Office Dashboard</span>
            </div>
          </div>
          <div className="lp-screenshot-caption">
            <h3>Office Dashboard</h3>
            <p>Live progress, financials, and field activity — all in one place.</p>
          </div>
        </div>

        {/* Screenshot: Change Order / Real-Time Timeline */}
        <div className="lp-screenshot-card lp-animate" style={{ transitionDelay: '0.2s' }}>
          <div className="lp-screenshot-frame desktop">
            <img
              src="/screenshots/change-orders.png"
              alt="FieldSync change order tracking — faster documentation and approval turnaround"
              className="lp-screenshot-img"
              onError={(e) => {
                e.target.style.display = 'none'
                e.target.nextSibling.style.display = 'flex'
              }}
            />
            <div className="lp-screenshot-placeholder" style={{ display: 'none' }}>
              <Clock size={32} />
              <span>Change Order Tracking</span>
            </div>
          </div>
          <div className="lp-screenshot-caption">
            <h3>Change Orders — Hours, Not Weeks</h3>
            <p>Real-time documentation means faster approvals and faster payments.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
