export default function ProjectCrew({ project, dailyReports, tmTickets, onRefresh }) {
  // Get today's crew from daily report
  const today = new Date().toISOString().split('T')[0]
  const todayReport = dailyReports.find(r => r.report_date === today)

  // Build crew history from daily reports
  const crewHistory = dailyReports
    .filter(r => r.crew_count > 0)
    .sort((a, b) => new Date(b.report_date) - new Date(a.report_date))
    .map(report => {
      // Extract total hours from T&M tickets for that day
      const dayTickets = tmTickets.filter(t => t.work_date === report.report_date)
      const totalHours = dayTickets.reduce((sum, ticket) => {
        if (ticket.workers) {
          return sum + ticket.workers.reduce((hrs, w) => hrs + (w.hours || 0) + (w.overtime_hours || 0), 0)
        }
        return sum
      }, 0)

      return {
        date: report.report_date,
        crewCount: report.crew_count,
        crewList: report.crew_list || [],
        totalHours: Math.round(totalHours),
        report
      }
    })

  // Calculate overall crew stats
  const totalCrewDays = crewHistory.length
  const avgCrewSize = totalCrewDays > 0
    ? (crewHistory.reduce((sum, day) => sum + day.crewCount, 0) / totalCrewDays).toFixed(1)
    : 0
  const totalHours = crewHistory.reduce((sum, day) => sum + day.totalHours, 0)

  // Get unique crew members and their frequency
  const crewMemberFrequency = {}
  crewHistory.forEach(day => {
    day.crewList.forEach(member => {
      crewMemberFrequency[member] = (crewMemberFrequency[member] || 0) + 1
    })
  })

  const topCrewMembers = Object.entries(crewMemberFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  return (
    <div className="project-crew">
      {/* Today's Crew */}
      <div className="crew-section">
        <h3 className="section-title">
          👷 Today's Crew ({new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })})
        </h3>
        {todayReport && todayReport.crew_list && todayReport.crew_list.length > 0 ? (
          <div className="todays-crew">
            {todayReport.crew_list.map((member, index) => {
              // Try to find role from T&M tickets
              const todayTickets = tmTickets.filter(t => t.work_date === today)
              let role = 'Laborer'
              todayTickets.forEach(ticket => {
                if (ticket.workers) {
                  const worker = ticket.workers.find(w => w.name === member)
                  if (worker && worker.role) {
                    role = worker.role
                  }
                }
              })

              return (
                <div key={index} className="crew-member-card">
                  <div className="crew-member-info">
                    <span className="crew-member-name">{member}</span>
                    <span className="crew-member-role">{role}</span>
                  </div>
                  <div className="crew-member-status">
                    <span className="status-indicator checked-in">Checked in</span>
                    {todayReport.submitted_at && (
                      <span className="check-in-time">
                        {new Date(todayReport.submitted_at).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="empty-state">
            <p>No crew checked in today</p>
          </div>
        )}
      </div>

      {/* Crew Stats */}
      <div className="crew-section">
        <h3 className="section-title">📊 Crew Stats (This Project)</h3>
        <div className="crew-stats-grid">
          <div className="stat-card">
            <div className="stat-value">{totalCrewDays}</div>
            <div className="stat-label">Total crew days</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{avgCrewSize}</div>
            <div className="stat-label">Avg crew size</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{totalHours}</div>
            <div className="stat-label">Total hours</div>
          </div>
        </div>
      </div>

      {/* Top Crew Members */}
      {topCrewMembers.length > 0 && (
        <div className="crew-section">
          <h3 className="section-title">⭐ Most Frequent Crew Members</h3>
          <div className="crew-frequency-list">
            {topCrewMembers.map(([member, days]) => (
              <div key={member} className="crew-frequency-item">
                <span className="member-name">{member}</span>
                <div className="frequency-info">
                  <span className="frequency-count">{days} days</span>
                  <div className="frequency-bar">
                    <div
                      className="frequency-fill"
                      style={{ width: `${(days / totalCrewDays) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Crew History */}
      <div className="crew-section">
        <h3 className="section-title">📅 Crew History</h3>
        <div className="crew-history-table">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Crew Count</th>
                <th>Total Hours</th>
                <th>Names</th>
              </tr>
            </thead>
            <tbody>
              {crewHistory.length === 0 ? (
                <tr>
                  <td colSpan="4" className="empty-row">
                    No crew history available
                  </td>
                </tr>
              ) : (
                crewHistory.slice(0, 30).map((day, index) => (
                  <tr key={index}>
                    <td>
                      {new Date(day.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </td>
                    <td>{day.crewCount}</td>
                    <td>{day.totalHours} hrs</td>
                    <td className="crew-names">
                      {day.crewList.length > 0 ? day.crewList.join(', ') : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
