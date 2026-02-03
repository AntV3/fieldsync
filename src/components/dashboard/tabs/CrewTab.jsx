/**
 * CrewTab - Crew analytics
 *
 * Currently rendered inline within ReportsTab.
 * This component can be used standalone if crew analytics gets its own top-level tab.
 */
import { Users, TrendingUp, TrendingDown } from 'lucide-react'

export default function CrewTab({ projectData }) {
  return (
    <div className="pv-tab-panel crew-tab animate-fade-in">
      <div className="reports-insight-card">
        <div className="reports-insight-header">
          <div className="reports-insight-title">
            <Users size={18} />
            <h3>Crew Analytics</h3>
          </div>
        </div>
        <div className="reports-insight-body">
          <div className="reports-stat-grid">
            <div className="reports-stat">
              <span className="reports-stat-value">{projectData?.uniqueWorkerCount || 0}</span>
              <span className="reports-stat-label">Total Workers</span>
            </div>
            <div className="reports-stat">
              <span className="reports-stat-value">{projectData?.avgCrewSize || 0}</span>
              <span className="reports-stat-label">Avg Crew / Day</span>
            </div>
            <div className="reports-stat">
              <span className="reports-stat-value">{projectData?.peakCrewSize || 0}</span>
              <span className="reports-stat-label">Peak Crew Size</span>
            </div>
            <div className="reports-stat">
              <span className="reports-stat-value">{projectData?.crewDaysTracked || 0}</span>
              <span className="reports-stat-label">Days Tracked</span>
            </div>
          </div>
          {(projectData?.crewTrend || 0) !== 0 && (
            <div className={`reports-trend-badge ${projectData.crewTrend > 0 ? 'up' : 'down'}`}>
              {projectData.crewTrend > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              <span>{Math.abs(Math.round(projectData.crewTrend))}% {projectData.crewTrend > 0 ? 'increase' : 'decrease'} vs prior week</span>
            </div>
          )}
          {projectData?.crewByDate && Object.keys(projectData.crewByDate).length > 0 && (
            <div className="reports-mini-chart">
              <div className="reports-mini-chart-label">Recent Crew Size</div>
              <div className="reports-mini-bars">
                {Object.keys(projectData.crewByDate).sort().slice(-14).map(date => {
                  const count = projectData.crewByDate[date]
                  const max = projectData.peakCrewSize || 1
                  return (
                    <div key={date} className="reports-mini-bar-wrap" title={`${new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${count} workers`}>
                      <div className="reports-mini-bar" style={{ height: `${(count / max) * 100}%` }}></div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
