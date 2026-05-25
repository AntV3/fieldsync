import { useRef } from 'react'

export default function AppShowcase({ _onVisible }) {
  const ref = useRef(null)

  return (
    <section className="lp-showcase lp-animate" ref={ref}>
      <span className="lp-showcase-label">Time and Material Tickets — Logged in the Field, Visible Everywhere</span>
      <h2 className="lp-showcase-heading">
        Real-time oversight on every project you're running.
      </h2>
      <p className="lp-showcase-desc">
        Field crews log descriptions, photos, crew hours, and materials used on Time and Material tickets — the office sees them the instant they're submitted.
        The office handles cost estimates and creates Change Orders with all the field data already attached. No lost paperwork. No end-of-week surprises. Complete visibility from field to office.
      </p>

      <div className="lp-showcase-frame">
        <div className="lp-mockup">
          {/* Mock Navigation */}
          <div className="lp-mock-nav">
            <div className="lp-mock-logo">
              Field<span>Sync</span>
            </div>
            <div className="lp-mock-tabs">
              <div className="lp-mock-tab">Overview</div>
              <div className="lp-mock-tab active">Change Orders</div>
              <div className="lp-mock-tab">Time &amp; Material</div>
              <div className="lp-mock-tab">Reports</div>
            </div>
          </div>

          {/* Mock Body */}
          <div className="lp-mock-body">
            {/* Project Header */}
            <div className="lp-mock-project-header">
              <div className="lp-mock-project-name">Riverside Plaza — Phase 2</div>
              <div className="lp-mock-sync">
                <span className="lp-mock-sync-dot" />
                Live
              </div>
            </div>

            {/* Metrics Row */}
            <div className="lp-mock-metrics">
              <div className="lp-mock-metric">
                <div className="lp-mock-metric-label">Open Change Orders</div>
                <div className="lp-mock-metric-value">4</div>
                <div className="lp-mock-metric-trend neutral">$38.2K pending</div>
              </div>
              <div className="lp-mock-metric">
                <div className="lp-mock-metric-label">Time &amp; Material This Week</div>
                <div className="lp-mock-metric-value">12</div>
                <div className="lp-mock-metric-trend positive">All documented</div>
              </div>
              <div className="lp-mock-metric">
                <div className="lp-mock-metric-label">Approved</div>
                <div className="lp-mock-metric-value">$124K</div>
                <div className="lp-mock-metric-trend positive">Ready to bill</div>
              </div>
            </div>

            {/* Activity Feed */}
            <div className="lp-mock-activity">
              <div className="lp-mock-activity-title">Recent Activity</div>
              <div className="lp-mock-activity-item">
                <span className="lp-mock-activity-dot blue" />
                Time and Material #47 logged — 6 hrs, fire stopping, 3rd floor
                <span className="lp-mock-activity-time">Just now</span>
              </div>
              <div className="lp-mock-activity-item">
                <span className="lp-mock-activity-dot green" />
                Change Order #12 created — Added fire stopping scope
                <span className="lp-mock-activity-time">8m ago</span>
              </div>
              <div className="lp-mock-activity-item">
                <span className="lp-mock-activity-dot amber" />
                Time and Material #46 — associated with Change Order #11
                <span className="lp-mock-activity-time">22m ago</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
