import { useState, useEffect } from 'react'

export default function ProjectOverview({
  project,
  areas,
  tmTickets,
  dailyReports,
  injuryReports,
  progress,
  billableAmount,
  todayReport,
  onRefresh
}) {
  // Calculate metrics
  const completedTasks = areas.filter(a => a.status === 'done').length
  const totalTasks = areas.length

  const pendingTickets = tmTickets.filter(t => t.status === 'pending')
  const approvedTickets = tmTickets.filter(t => t.status === 'approved')

  // Calculate T&M totals
  const calculateTicketTotal = (ticket) => {
    let total = 0

    // Add labor costs (workers)
    if (ticket.workers) {
      ticket.workers.forEach(worker => {
        const regularPay = (worker.hours || 0) * 50 // $50/hr base rate
        const overtimePay = (worker.overtime_hours || 0) * 75 // $75/hr OT
        total += regularPay + overtimePay
      })
    }

    // Add material/equipment costs
    if (ticket.items) {
      ticket.items.forEach(item => {
        // Simplified - would need material pricing lookup in real implementation
        total += (item.quantity || 0) * 50 // Placeholder
      })
    }

    // Apply markup
    total = total * 1.2 // 20% markup

    return total
  }

  const totalTMValue = tmTickets.reduce((sum, ticket) => sum + calculateTicketTotal(ticket), 0)
  const approvedTMValue = approvedTickets.reduce((sum, ticket) => sum + calculateTicketTotal(ticket), 0)
  const pendingTMValue = pendingTickets.reduce((sum, ticket) => sum + calculateTicketTotal(ticket), 0)

  // Get today's crew count
  const crewToday = todayReport?.crew_count || 0

  // Calculate budget breakdown (simplified - would need actual cost tracking)
  const contractValue = project.contract_value || 50000
  const laborBudget = contractValue * 0.6
  const materialsBudget = contractValue * 0.3
  const equipmentBudget = contractValue * 0.1

  // Estimate actual costs based on T&M and progress
  const laborActual = approvedTMValue * 0.65 // 65% of T&M is typically labor
  const materialsActual = approvedTMValue * 0.25 // 25% materials
  const equipmentActual = approvedTMValue * 0.1 // 10% equipment

  const laborPercent = Math.min((laborActual / laborBudget) * 100, 100)
  const materialsPercent = Math.min((materialsActual / materialsBudget) * 100, 100)
  const equipmentPercent = Math.min((equipmentActual / equipmentBudget) * 100, 100)
  const totalBudgetPercent = Math.min((approvedTMValue / contractValue) * 100, 100)

  // Get recent photos from T&M tickets and daily reports
  const recentPhotos = []
  tmTickets.slice(0, 5).forEach(ticket => {
    if (ticket.photos && ticket.photos.length > 0) {
      ticket.photos.forEach(photo => {
        recentPhotos.push({
          url: photo,
          date: ticket.work_date,
          source: 'T&M Ticket'
        })
      })
    }
  })
  const displayPhotos = recentPhotos.slice(0, 5)

  // Today's activity
  const todayActivity = []
  if (todayReport) {
    if (todayReport.status === 'submitted') {
      const submitTime = new Date(todayReport.submitted_at).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
      })
      todayActivity.push({
        icon: '✓',
        text: `Daily report submitted at ${submitTime}`,
        type: 'success'
      })
    }
    if (todayReport.tasks_completed > 0) {
      todayActivity.push({
        icon: '✓',
        text: `${todayReport.tasks_completed} tasks marked complete`,
        type: 'success'
      })
    }
    if (todayReport.crew_count > 0) {
      todayActivity.push({
        icon: '👷',
        text: `Crew: ${todayReport.crew_list ? todayReport.crew_list.join(', ') : `${todayReport.crew_count} workers`}`,
        type: 'info'
      })
    }
  }

  // Check for today's pending tickets
  const today = new Date().toISOString().split('T')[0]
  const todayPendingTickets = pendingTickets.filter(t => t.work_date === today)
  if (todayPendingTickets.length > 0) {
    const totalPending = todayPendingTickets.reduce((sum, t) => sum + calculateTicketTotal(t), 0)
    todayActivity.push({
      icon: '✓',
      text: `${todayPendingTickets.length} T&M ticket${todayPendingTickets.length > 1 ? 's' : ''} submitted ($${Math.round(totalPending).toLocaleString()}) - pending approval`,
      type: 'pending'
    })
  }

  // Needs attention items
  const needsAttention = []
  if (pendingTickets.length > 0) {
    needsAttention.push({
      icon: '⏳',
      text: `${pendingTickets.length} T&M tickets pending approval ($${Math.round(pendingTMValue).toLocaleString()})`,
      action: 'Review T&M Tickets',
      priority: 'medium'
    })
  }
  if (materialsPercent > 85) {
    needsAttention.push({
      icon: '⚠️',
      text: `Materials budget at ${Math.round(materialsPercent)}%`,
      action: 'View Details',
      priority: materialsPercent > 95 ? 'high' : 'medium'
    })
  }
  if (injuryReports.filter(r => r.status !== 'closed').length > 0) {
    const openReports = injuryReports.filter(r => r.status !== 'closed')
    needsAttention.push({
      icon: '🚨',
      text: `${openReports.length} open injury/incident report${openReports.length > 1 ? 's' : ''}`,
      action: 'Review Reports',
      priority: 'high'
    })
  }

  return (
    <div className="project-overview">
      {/* Metric Cards */}
      <div className="metric-cards">
        <div className="metric-card">
          <div className="metric-value">{progress}%</div>
          <div className="metric-label">Complete</div>
          <div className="metric-detail">{completedTasks}/{totalTasks} tasks</div>
        </div>

        <div className="metric-card">
          <div className="metric-value">{tmTickets.length}</div>
          <div className="metric-label">T&M Tickets</div>
          <div className="metric-detail">{pendingTickets.length} pending</div>
        </div>

        <div className="metric-card">
          <div className="metric-value">${Math.round(totalTMValue).toLocaleString()}</div>
          <div className="metric-label">T&M Value</div>
          <div className="metric-detail">${Math.round(approvedTMValue).toLocaleString()} approved</div>
        </div>

        <div className="metric-card">
          <div className="metric-value">{crewToday}</div>
          <div className="metric-label">Crew Today</div>
          <div className="metric-detail">{todayReport ? 'Checked in' : 'Not reported'}</div>
        </div>
      </div>

      {/* Budget Status */}
      <div className="overview-section">
        <h3 className="section-title">💰 Budget Status</h3>
        <div className="budget-breakdown">
          <div className="budget-item">
            <div className="budget-item-header">
              <span className="budget-category">Labor</span>
              <span className="budget-amount">
                ${Math.round(laborActual).toLocaleString()} / ${Math.round(laborBudget).toLocaleString()}
              </span>
              <span className="budget-percent">{Math.round(laborPercent)}%</span>
            </div>
            <div className="budget-bar">
              <div
                className={`budget-fill ${laborPercent > 90 ? 'warning' : ''}`}
                style={{ width: `${laborPercent}%` }}
              />
            </div>
          </div>

          <div className="budget-item">
            <div className="budget-item-header">
              <span className="budget-category">Materials</span>
              <span className="budget-amount">
                ${Math.round(materialsActual).toLocaleString()} / ${Math.round(materialsBudget).toLocaleString()}
              </span>
              <span className="budget-percent">{Math.round(materialsPercent)}%</span>
              {materialsPercent > 85 && <span className="budget-alert">⚠️</span>}
            </div>
            <div className="budget-bar">
              <div
                className={`budget-fill ${materialsPercent > 90 ? 'warning' : ''}`}
                style={{ width: `${materialsPercent}%` }}
              />
            </div>
          </div>

          <div className="budget-item">
            <div className="budget-item-header">
              <span className="budget-category">Equipment</span>
              <span className="budget-amount">
                ${Math.round(equipmentActual).toLocaleString()} / ${Math.round(equipmentBudget).toLocaleString()}
              </span>
              <span className="budget-percent">{Math.round(equipmentPercent)}%</span>
            </div>
            <div className="budget-bar">
              <div
                className="budget-fill"
                style={{ width: `${equipmentPercent}%` }}
              />
            </div>
          </div>

          <div className="budget-item total">
            <div className="budget-item-header">
              <span className="budget-category"><strong>TOTAL</strong></span>
              <span className="budget-amount">
                <strong>${Math.round(approvedTMValue).toLocaleString()} / ${Math.round(contractValue).toLocaleString()}</strong>
              </span>
              <span className="budget-percent"><strong>{Math.round(totalBudgetPercent)}%</strong></span>
            </div>
            <div className="budget-bar">
              <div
                className="budget-fill"
                style={{ width: `${totalBudgetPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Today's Activity */}
      <div className="overview-section">
        <h3 className="section-title">📋 Today's Activity</h3>
        {todayActivity.length > 0 ? (
          <div className="activity-list">
            {todayActivity.map((activity, index) => (
              <div key={index} className={`activity-item ${activity.type}`}>
                <span className="activity-icon">{activity.icon}</span>
                <span className="activity-text">{activity.text}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>No activity reported today</p>
          </div>
        )}
      </div>

      {/* Needs Attention */}
      {needsAttention.length > 0 && (
        <div className="overview-section">
          <h3 className="section-title">⚠️ Needs Attention</h3>
          <div className="attention-list">
            {needsAttention.map((item, index) => (
              <div key={index} className={`attention-item priority-${item.priority}`}>
                <div className="attention-content">
                  <span className="attention-icon">{item.icon}</span>
                  <span className="attention-text">{item.text}</span>
                </div>
                <button className="btn-link">{item.action} →</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Photos */}
      {displayPhotos.length > 0 && (
        <div className="overview-section">
          <h3 className="section-title">📸 Recent Photos</h3>
          <div className="photo-grid">
            {displayPhotos.map((photo, index) => (
              <div key={index} className="photo-item">
                <img src={photo.url} alt={`Photo from ${photo.date}`} />
                <div className="photo-date">
                  {new Date(photo.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric'
                  })}
                </div>
              </div>
            ))}
            {recentPhotos.length > 5 && (
              <button className="btn-link">View All →</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
