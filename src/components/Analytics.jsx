import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { formatCurrency, calculateProgress } from '../lib/utils'

export default function Analytics({ onShowToast }) {
  const { company } = useAuth()
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState([])
  const [allAreas, setAllAreas] = useState([])
  const [tmTickets, setTmTickets] = useState([])
  const [injuryReports, setInjuryReports] = useState([])
  const [materialRequests, setMaterialRequests] = useState([])
  const [stats, setStats] = useState({
    totalProjects: 0,
    activeProjects: 0,
    completedProjects: 0,
    totalContractValue: 0,
    totalBillable: 0,
    overallProgress: 0,
    pendingTMTickets: 0,
    openInjuryReports: 0,
    pendingMaterialRequests: 0
  })

  useEffect(() => {
    loadAllData()
  }, [])

  const loadAllData = async () => {
    setLoading(true)
    try {
      // Load all projects
      const projectsData = await db.getProjects()
      setProjects(projectsData)

      // Load all areas for all projects
      const areasPromises = projectsData.map(p => db.getAreas(p.id))
      const areasArrays = await Promise.all(areasPromises)
      const allAreasFlat = areasArrays.flat()
      setAllAreas(allAreasFlat)

      // Load T&M tickets
      const tmPromises = projectsData.map(p => db.getTMTickets(p.id))
      const tmArrays = await Promise.all(tmPromises)
      const allTM = tmArrays.flat()
      setTmTickets(allTM)

      // Load injury reports
      const injuryData = await db.getCompanyInjuryReports(company.id)
      setInjuryReports(injuryData)

      // Load material requests
      const materialPromises = projectsData.map(p => db.getMaterialRequests(p.id))
      const materialArrays = await Promise.all(materialPromises)
      const allMaterials = materialArrays.flat()
      setMaterialRequests(allMaterials)

      // Calculate statistics
      calculateStats(projectsData, allAreasFlat, allTM, injuryData, allMaterials)
    } catch (error) {
      console.error('Error loading analytics:', error)
      onShowToast('Error loading analytics', 'error')
    } finally {
      setLoading(false)
    }
  }

  const calculateStats = (projects, areas, tmTickets, injuries, materials) => {
    const totalContractValue = projects.reduce((sum, p) => sum + parseFloat(p.contract_value || 0), 0)

    // Calculate billable per project
    let totalBillable = 0
    projects.forEach(project => {
      const projectAreas = areas.filter(a => a.project_id === project.id)
      const progress = calculateProgress(projectAreas)
      const billable = (progress / 100) * project.contract_value
      totalBillable += billable
    })

    // Calculate overall progress
    const totalWeight = areas.length
    const doneWeight = areas.filter(a => a.status === 'done').length
    const overallProgress = totalWeight > 0 ? Math.round((doneWeight / totalWeight) * 100) : 0

    // Count active vs completed projects
    const projectStatuses = projects.map(project => {
      const projectAreas = areas.filter(a => a.project_id === project.id)
      const progress = calculateProgress(projectAreas)
      return { id: project.id, progress }
    })
    const completedProjects = projectStatuses.filter(p => p.progress === 100).length
    const activeProjects = projects.length - completedProjects

    setStats({
      totalProjects: projects.length,
      activeProjects,
      completedProjects,
      totalContractValue,
      totalBillable,
      overallProgress,
      pendingTMTickets: tmTickets.filter(t => t.status === 'pending').length,
      openInjuryReports: injuries.filter(i => i.status !== 'closed').length,
      pendingMaterialRequests: materials.filter(m => m.status === 'pending').length
    })
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        Loading analytics...
      </div>
    )
  }

  return (
    <div>
      <h1>Executive Dashboard</h1>
      <p className="subtitle">Comprehensive overview of all projects and activities</p>

      {/* KPI Cards */}
      <div className="analytics-grid">
        <div className="analytics-card primary">
          <div className="analytics-card-icon">💰</div>
          <div className="analytics-card-content">
            <div className="analytics-card-label">Total Contract Value</div>
            <div className="analytics-card-value">{formatCurrency(stats.totalContractValue)}</div>
          </div>
        </div>

        <div className="analytics-card success">
          <div className="analytics-card-icon">📊</div>
          <div className="analytics-card-content">
            <div className="analytics-card-label">Billable to Date</div>
            <div className="analytics-card-value">{formatCurrency(stats.totalBillable)}</div>
            <div className="analytics-card-sublabel">
              {((stats.totalBillable / stats.totalContractValue) * 100).toFixed(1)}% of total
            </div>
          </div>
        </div>

        <div className="analytics-card info">
          <div className="analytics-card-icon">🏗️</div>
          <div className="analytics-card-content">
            <div className="analytics-card-label">Active Projects</div>
            <div className="analytics-card-value">{stats.activeProjects}</div>
            <div className="analytics-card-sublabel">
              {stats.completedProjects} completed
            </div>
          </div>
        </div>

        <div className="analytics-card warning">
          <div className="analytics-card-icon">📈</div>
          <div className="analytics-card-content">
            <div className="analytics-card-label">Overall Progress</div>
            <div className="analytics-card-value">{stats.overallProgress}%</div>
            <div className="analytics-card-sublabel">
              Across all projects
            </div>
          </div>
        </div>
      </div>

      {/* Action Items */}
      <div className="card">
        <h3>Pending Action Items</h3>
        <div className="action-items-grid">
          <div className="action-item">
            <div className="action-item-icon pending">📝</div>
            <div className="action-item-content">
              <div className="action-item-count">{stats.pendingTMTickets}</div>
              <div className="action-item-label">T&M Tickets Pending Approval</div>
            </div>
          </div>

          <div className="action-item">
            <div className="action-item-icon danger">🚨</div>
            <div className="action-item-content">
              <div className="action-item-count">{stats.openInjuryReports}</div>
              <div className="action-item-label">Open Injury Reports</div>
            </div>
          </div>

          <div className="action-item">
            <div className="action-item-icon warning">📦</div>
            <div className="action-item-content">
              <div className="action-item-count">{stats.pendingMaterialRequests}</div>
              <div className="action-item-label">Pending Material Requests</div>
            </div>
          </div>
        </div>
      </div>

      {/* Project Health Overview */}
      <div className="card">
        <h3>Project Health Overview</h3>
        <div className="project-health-list">
          {projects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
              No projects yet
            </div>
          ) : (
            projects.map(project => {
              const projectAreas = allAreas.filter(a => a.project_id === project.id)
              const progress = calculateProgress(projectAreas)
              const billable = (progress / 100) * project.contract_value
              const projectTM = tmTickets.filter(t => t.project_id === project.id)
              const pendingTM = projectTM.filter(t => t.status === 'pending').length
              const projectMaterials = materialRequests.filter(m => m.project_id === project.id && m.status === 'pending').length

              return (
                <div key={project.id} className="project-health-item">
                  <div className="project-health-header">
                    <div>
                      <div className="project-health-name">{project.name}</div>
                      <div className="project-health-value">{formatCurrency(project.contract_value)}</div>
                    </div>
                    <div className="project-health-stats">
                      {pendingTM > 0 && (
                        <span className="project-health-badge pending">{pendingTM} T&M pending</span>
                      )}
                      {projectMaterials > 0 && (
                        <span className="project-health-badge warning">{projectMaterials} materials needed</span>
                      )}
                    </div>
                  </div>
                  <div className="project-health-progress">
                    <div className="progress-info">
                      <span className="progress-label">Progress: {progress}%</span>
                      <span className="progress-billable">{formatCurrency(billable)} billable</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <style>{`
        .analytics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .analytics-card {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          display: flex;
          align-items: center;
          gap: 1rem;
          border-left: 4px solid var(--card-border-color);
        }

        .analytics-card.primary {
          --card-border-color: #3b82f6;
          background: linear-gradient(135deg, #ffffff 0%, #eff6ff 100%);
        }

        .analytics-card.success {
          --card-border-color: #10b981;
          background: linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%);
        }

        .analytics-card.info {
          --card-border-color: #8b5cf6;
          background: linear-gradient(135deg, #ffffff 0%, #faf5ff 100%);
        }

        .analytics-card.warning {
          --card-border-color: #f59e0b;
          background: linear-gradient(135deg, #ffffff 0%, #fffbeb 100%);
        }

        .analytics-card-icon {
          font-size: 2.5rem;
          line-height: 1;
        }

        .analytics-card-content {
          flex: 1;
        }

        .analytics-card-label {
          font-size: 0.875rem;
          color: #6b7280;
          margin-bottom: 0.25rem;
        }

        .analytics-card-value {
          font-size: 1.875rem;
          font-weight: 700;
          color: #111827;
          line-height: 1;
        }

        .analytics-card-sublabel {
          font-size: 0.75rem;
          color: #9ca3af;
          margin-top: 0.25rem;
        }

        .action-items-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.5rem;
        }

        .action-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          background: #f9fafb;
          border-radius: 8px;
        }

        .action-item-icon {
          font-size: 2rem;
          width: 3rem;
          height: 3rem;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
        }

        .action-item-icon.pending {
          background: #fef3c7;
        }

        .action-item-icon.danger {
          background: #fee2e2;
        }

        .action-item-icon.warning {
          background: #ffedd5;
        }

        .action-item-content {
          flex: 1;
        }

        .action-item-count {
          font-size: 1.5rem;
          font-weight: 700;
          color: #111827;
        }

        .action-item-label {
          font-size: 0.875rem;
          color: #6b7280;
        }

        .project-health-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .project-health-item {
          padding: 1.25rem;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          background: #ffffff;
        }

        .project-health-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1rem;
        }

        .project-health-name {
          font-size: 1.125rem;
          font-weight: 600;
          color: #111827;
          margin-bottom: 0.25rem;
        }

        .project-health-value {
          font-size: 0.875rem;
          color: #6b7280;
        }

        .project-health-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .project-health-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 500;
          white-space: nowrap;
        }

        .project-health-badge.pending {
          background: #fef3c7;
          color: #92400e;
        }

        .project-health-badge.warning {
          background: #ffedd5;
          color: #9a3412;
        }

        .project-health-progress {
          margin-top: 0.75rem;
        }

        .progress-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
        }

        .progress-label {
          color: #374151;
          font-weight: 500;
        }

        .progress-billable {
          color: #10b981;
          font-weight: 600;
        }

        .progress-bar {
          height: 8px;
          background: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%);
          border-radius: 4px;
          transition: width 0.3s ease;
        }

        @media (max-width: 768px) {
          .analytics-grid {
            grid-template-columns: 1fr;
          }

          .action-items-grid {
            grid-template-columns: 1fr;
          }

          .project-health-header {
            flex-direction: column;
            gap: 0.75rem;
          }
        }
      `}</style>
    </div>
  )
}
