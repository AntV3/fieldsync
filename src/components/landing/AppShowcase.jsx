import { useRef } from 'react'

export default function AppShowcase({ onVisible }) {
  const ref = useRef(null)

  return (
    <section className="lp-showcase lp-animate" ref={ref}>
      <span className="lp-showcase-label">CORs & T&M Tickets — Created in the Field, Visible Everywhere</span>
      <h2 className="lp-showcase-heading">
        Extra work happens. Now you can capture every dollar of it.
      </h2>
      <p className="lp-showcase-desc">
        Field crews create Change Order Requests and T&amp;M tickets on the spot — with photos, crew hours, materials, and digital signatures.
        The office sees them the instant they're submitted. No lost paperwork. No end-of-week surprises. Every piece of extra work is documented, approved, and billable.
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
              <div className="lp-mock-tab active">CORs</div>
              <div className="lp-mock-tab">T&amp;M</div>
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
                <div className="lp-mock-metric-label">Open CORs</div>
                <div className="lp-mock-metric-value">4</div>
                <div className="lp-mock-metric-trend neutral">$38.2K pending</div>
              </div>
              <div className="lp-mock-metric">
                <div className="lp-mock-metric-label">T&amp;M This Week</div>
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
              <div className="lp-mock-activity-title">Recent COR & T&M Activity</div>
              <div className="lp-mock-activity-item">
                <span className="lp-mock-activity-dot blue" />
                COR #12 created — Added fire stopping, 3rd floor
                <span className="lp-mock-activity-time">Just now</span>
              </div>
              <div className="lp-mock-activity-item">
                <span className="lp-mock-activity-dot green" />
                T&M #47 approved — 6 hrs, $2,340 — signed by GC
                <span className="lp-mock-activity-time">8m ago</span>
              </div>
              <div className="lp-mock-activity-item">
                <span className="lp-mock-activity-dot amber" />
                COR #11 — owner signature requested
                <span className="lp-mock-activity-time">22m ago</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
