import { useRef } from 'react'

export default function AppShowcase({ onVisible }) {
  const ref = useRef(null)

  return (
    <section className="lp-showcase lp-animate" ref={ref}>
      <span className="lp-showcase-label">Built for Construction</span>
      <h2 className="lp-showcase-heading">
        One platform. Two interfaces.
      </h2>
      <p className="lp-showcase-desc">
        Office managers get the full dashboard. Field crews get a
        one-tap mobile view. Both stay perfectly in sync.
      </p>

      <div className="lp-showcase-frame">
        <div className="lp-mockup">
          {/* Mock Navigation */}
          <div className="lp-mock-nav">
            <div className="lp-mock-logo">
              Field<span>Sync</span>
            </div>
            <div className="lp-mock-tabs">
              <div className="lp-mock-tab active">Overview</div>
              <div className="lp-mock-tab">Financials</div>
              <div className="lp-mock-tab">Reports</div>
              <div className="lp-mock-tab">Documents</div>
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

            {/* Progress Bar */}
            <div className="lp-mock-progress-container">
              <div className="lp-mock-progress-label">
                <span>Overall Progress</span>
                <span>68%</span>
              </div>
              <div className="lp-mock-progress-bar">
                <div className="lp-mock-progress-fill" />
              </div>
            </div>

            {/* Metrics Row */}
            <div className="lp-mock-metrics">
              <div className="lp-mock-metric">
                <div className="lp-mock-metric-label">Revenue</div>
                <div className="lp-mock-metric-value">$847K</div>
                <div className="lp-mock-metric-trend positive">+12.3%</div>
              </div>
              <div className="lp-mock-metric">
                <div className="lp-mock-metric-label">Costs</div>
                <div className="lp-mock-metric-value">$512K</div>
                <div className="lp-mock-metric-trend neutral">On track</div>
              </div>
              <div className="lp-mock-metric">
                <div className="lp-mock-metric-label">Profit</div>
                <div className="lp-mock-metric-value">$335K</div>
                <div className="lp-mock-metric-trend positive">39.6%</div>
              </div>
            </div>

            {/* Activity Feed */}
            <div className="lp-mock-activity">
              <div className="lp-mock-activity-title">Recent Activity</div>
              <div className="lp-mock-activity-item">
                <span className="lp-mock-activity-dot blue" />
                Crew check-in: 8 workers on site
                <span className="lp-mock-activity-time">2m ago</span>
              </div>
              <div className="lp-mock-activity-item">
                <span className="lp-mock-activity-dot green" />
                Electrical — marked Done
                <span className="lp-mock-activity-time">15m ago</span>
              </div>
              <div className="lp-mock-activity-item">
                <span className="lp-mock-activity-dot amber" />
                T&M Ticket #47 submitted
                <span className="lp-mock-activity-time">1h ago</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
