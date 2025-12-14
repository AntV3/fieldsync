import { useState } from 'react'
import { db } from '../lib/supabase'

export default function ProjectTasks({ project, areas, onRefresh }) {
  const [expandedGroups, setExpandedGroups] = useState({})
  const [filterStatus, setFilterStatus] = useState('all')

  // Group areas by group_name
  const groupedAreas = areas.reduce((groups, area) => {
    const groupName = area.group_name || 'Ungrouped'
    if (!groups[groupName]) {
      groups[groupName] = []
    }
    groups[groupName].push(area)
    return groups
  }, {})

  // Sort each group by sort_order
  Object.keys(groupedAreas).forEach(groupName => {
    groupedAreas[groupName].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  })

  // Calculate completion for each group
  const groupStats = Object.keys(groupedAreas).map(groupName => {
    const groupAreas = groupedAreas[groupName]
    const completed = groupAreas.filter(a => a.status === 'done').length
    const total = groupAreas.length
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

    return {
      name: groupName,
      completed,
      total,
      percentage,
      areas: groupAreas
    }
  })

  // Sort groups by name
  groupStats.sort((a, b) => a.name.localeCompare(b.name))

  // Calculate overall stats
  const totalTasks = areas.length
  const completedTasks = areas.filter(a => a.status === 'done').length
  const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  // Filter areas based on selected status
  const filteredGroupStats = groupStats.map(group => ({
    ...group,
    areas: filterStatus === 'all'
      ? group.areas
      : group.areas.filter(a => a.status === filterStatus)
  })).filter(group => group.areas.length > 0)

  function toggleGroup(groupName) {
    setExpandedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }))
  }

  function getStatusIcon(status) {
    switch (status) {
      case 'done':
        return '✓'
      case 'working':
        return '○'
      case 'not_started':
      default:
        return '○'
    }
  }

  function getStatusLabel(status) {
    switch (status) {
      case 'done':
        return 'Completed'
      case 'working':
        return 'In Progress'
      case 'not_started':
      default:
        return 'Not Started'
    }
  }

  async function handleStatusChange(areaId, newStatus) {
    try {
      await db.updateAreaStatus(areaId, newStatus)
      onRefresh()
    } catch (error) {
      console.error('Error updating area status:', error)
      alert('Failed to update task status')
    }
  }

  function handleExport() {
    // Create CSV export
    let csv = 'Group,Task,Status,Weight,Completed Date\n'

    groupStats.forEach(group => {
      group.areas.forEach(area => {
        const completedDate = area.completed_at
          ? new Date(area.completed_at).toLocaleDateString()
          : ''
        csv += `"${group.name}","${area.name}","${getStatusLabel(area.status)}",${area.weight || 0}%,"${completedDate}"\n`
      })
    })

    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.name}-tasks-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="project-tasks">
      {/* Header */}
      <div className="tasks-header">
        <div className="tasks-summary">
          <h3>Progress: {completedTasks} of {totalTasks} complete ({overallProgress}%)</h3>
          <div className="progress-bar-large">
            <div
              className="progress-fill-large"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>

        <div className="tasks-controls">
          <div className="filter-group">
            <label>Filter:</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Tasks</option>
              <option value="not_started">Not Started</option>
              <option value="working">In Progress</option>
              <option value="done">Completed</option>
            </select>
          </div>
          <button className="btn-secondary btn-small" onClick={handleExport}>
            Export
          </button>
        </div>
      </div>

      {/* Task Groups */}
      <div className="task-groups">
        {filteredGroupStats.length === 0 ? (
          <div className="empty-state">
            <p>No tasks found matching the selected filter</p>
          </div>
        ) : (
          filteredGroupStats.map(group => (
            <div key={group.name} className="task-group">
              <div
                className="task-group-header"
                onClick={() => toggleGroup(group.name)}
              >
                <div className="task-group-title">
                  <span className="expand-icon">
                    {expandedGroups[group.name] ? '▼' : '▶'}
                  </span>
                  <span className="group-name">{group.name}</span>
                </div>
                <div className="task-group-stats">
                  <span className="group-progress">
                    {group.completed}/{group.total} ({group.percentage}%)
                  </span>
                  <div className="mini-progress-bar">
                    <div
                      className="mini-progress-fill"
                      style={{ width: `${group.percentage}%` }}
                    />
                  </div>
                </div>
              </div>

              {expandedGroups[group.name] && (
                <div className="task-group-content">
                  {group.areas.map(area => (
                    <div
                      key={area.id}
                      className={`task-item status-${area.status}`}
                    >
                      <div className="task-info">
                        <span className={`task-status-icon status-${area.status}`}>
                          {getStatusIcon(area.status)}
                        </span>
                        <div className="task-details">
                          <div className="task-name">{area.name}</div>
                          <div className="task-meta">
                            {area.status === 'done' && area.completed_at && (
                              <span className="task-completed-date">
                                Completed {new Date(area.completed_at).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </span>
                            )}
                            {area.status === 'working' && (
                              <span className="task-in-progress">In Progress</span>
                            )}
                            {area.status === 'not_started' && (
                              <span className="task-not-started">Not Started</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="task-actions">
                        <select
                          value={area.status}
                          onChange={(e) => handleStatusChange(area.id, e.target.value)}
                          className="status-select"
                        >
                          <option value="not_started">Not Started</option>
                          <option value="working">In Progress</option>
                          <option value="done">Completed</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
