import { useState, useEffect } from 'react'
import ProjectOverview from './ProjectOverview'
import ProjectTasks from './ProjectTasks'
import ProjectTMTickets from './ProjectTMTickets'
import ProjectDailyReports from './ProjectDailyReports'
import ProjectCrew from './ProjectCrew'
import ProjectMaterials from './ProjectMaterials'
import ProjectMessages from './ProjectMessages'
import ShareModal from './ShareModal'
import { db } from '../lib/supabase'

export default function ProjectDetail({ project, onBack, onUpdate, currentUser }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [projectData, setProjectData] = useState(project)
  const [areas, setAreas] = useState([])
  const [tmTickets, setTMTickets] = useState([])
  const [dailyReports, setDailyReports] = useState([])
  const [injuryReports, setInjuryReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    loadProjectData()
  }, [project.id])

  async function loadProjectData() {
    try {
      setLoading(true)

      // Load all project-related data in parallel
      const [
        areasData,
        tmTicketsData,
        dailyReportsData,
        injuryReportsData
      ] = await Promise.all([
        db.getAreas(project.id),
        db.getTMTickets(project.id),
        db.getDailyReports(project.id, 30), // Last 30 days
        db.getInjuryReports(project.id)
      ])

      setAreas(areasData)
      setTMTickets(tmTicketsData)
      setDailyReports(dailyReportsData)
      setInjuryReports(injuryReportsData)
    } catch (error) {
      console.error('Error loading project data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Calculate project progress
  const progress = areas.length > 0
    ? Math.round((areas.filter(a => a.status === 'done').length / areas.length) * 100)
    : 0

  // Calculate billable amount
  const billableAmount = (progress / 100) * (projectData.contract_value || 0)

  // Calculate T&M stats
  const pendingTickets = tmTickets.filter(t => t.status === 'pending')
  const approvedTickets = tmTickets.filter(t => t.status === 'approved')

  // Get today's daily report
  const today = new Date().toISOString().split('T')[0]
  const todayReport = dailyReports.find(r => r.report_date === today)

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'tasks', label: 'Tasks', icon: '✓' },
    { id: 'tm-tickets', label: 'T&M Tickets', icon: '📝', badge: pendingTickets.length },
    { id: 'daily-reports', label: 'Daily Reports', icon: '📋' },
    { id: 'crew', label: 'Crew', icon: '👷' },
    { id: 'materials', label: 'Materials', icon: '📦' },
    { id: 'messages', label: 'Messages', icon: '💬' }
  ]

  function handleExport() {
    // TODO: Implement export functionality
    alert('Export functionality coming soon!')
  }

  function handleArchive() {
    if (confirm(`Archive project "${projectData.name}"? It can be restored later.`)) {
      db.archiveProject(projectData.id)
        .then(() => {
          alert('Project archived successfully')
          onBack()
        })
        .catch(err => {
          console.error('Error archiving project:', err)
          alert('Failed to archive project')
        })
    }
  }

  if (loading) {
    return (
      <div className="project-detail-loading">
        <div className="spinner"></div>
        <p>Loading project data...</p>
      </div>
    )
  }

  return (
    <div className="project-detail">
      {/* Header */}
      <div className="project-detail-header">
        <div className="project-detail-header-top">
          <button className="btn-back" onClick={onBack}>
            ← Back
          </button>
          <div className="project-detail-header-actions">
            <button className="btn-icon" onClick={() => setShowSettings(true)} title="Settings">
              ⚙️
            </button>
            <button className="btn-icon" onClick={() => setShowShareModal(true)} title="Share">
              📤
            </button>
            <button className="btn-secondary btn-small" onClick={handleExport}>
              Export
            </button>
          </div>
        </div>

        <div className="project-detail-title-section">
          <h1 className="project-detail-name">{projectData.name}</h1>
          {projectData.address && (
            <p className="project-detail-address">{projectData.address}</p>
          )}
          <div className="project-detail-meta">
            {projectData.general_contractor && (
              <span className="project-meta-item">
                <strong>GC:</strong> {projectData.general_contractor}
              </span>
            )}
            {projectData.job_number && (
              <span className="project-meta-item">
                <strong>Job #:</strong> {projectData.job_number}
              </span>
            )}
            {projectData.contract_value && (
              <span className="project-meta-item">
                <strong>Contract:</strong> ${projectData.contract_value.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="project-detail-progress">
          <div className="progress-bar-large">
            <div
              className="progress-fill-large"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="progress-info">
            <span className="progress-percentage">{progress}%</span>
            <div className="progress-dates">
              {projectData.created_at && (
                <span>Started: {new Date(projectData.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}</span>
              )}
              {/* TODO: Add estimated completion date field */}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="project-detail-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`project-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
            {tab.badge > 0 && (
              <span className="tab-badge">{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="project-detail-content">
        {activeTab === 'overview' && (
          <ProjectOverview
            project={projectData}
            areas={areas}
            tmTickets={tmTickets}
            dailyReports={dailyReports}
            injuryReports={injuryReports}
            progress={progress}
            billableAmount={billableAmount}
            todayReport={todayReport}
            onRefresh={loadProjectData}
          />
        )}

        {activeTab === 'tasks' && (
          <ProjectTasks
            project={projectData}
            areas={areas}
            onRefresh={loadProjectData}
          />
        )}

        {activeTab === 'tm-tickets' && (
          <ProjectTMTickets
            project={projectData}
            tickets={tmTickets}
            currentUser={currentUser}
            onRefresh={loadProjectData}
          />
        )}

        {activeTab === 'daily-reports' && (
          <ProjectDailyReports
            project={projectData}
            reports={dailyReports}
            onRefresh={loadProjectData}
          />
        )}

        {activeTab === 'crew' && (
          <ProjectCrew
            project={projectData}
            dailyReports={dailyReports}
            tmTickets={tmTickets}
            onRefresh={loadProjectData}
          />
        )}

        {activeTab === 'materials' && (
          <ProjectMaterials
            project={projectData}
            tmTickets={tmTickets}
            onRefresh={loadProjectData}
          />
        )}

        {activeTab === 'messages' && (
          <ProjectMessages
            project={projectData}
            currentUser={currentUser}
            onRefresh={loadProjectData}
          />
        )}
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <ShareModal
          project={projectData}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* Settings Modal - TODO: Implement */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Project Settings</h2>
            <p>Settings panel coming soon...</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowSettings(false)}>
                Close
              </button>
              <button className="btn-danger" onClick={handleArchive}>
                Archive Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
