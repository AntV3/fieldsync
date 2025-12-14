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
      const projectsData = await db.getProjects()
      setProjects(projectsData)

      const areasPromises = projectsData.map(p => db.getAreas(p.id))
      const areasArrays = await Promise.all(areasPromises)
      const allAreasFlat = areasArrays.flat()
      setAllAreas(allAreasFlat)

      const tmPromises = projectsData.map(p => db.getTMTickets(p.id))
      const tmArrays = await Promise.all(tmPromises)
      const allTM = tmArrays.flat()
      setTmTickets(allTM)

      const injuryData = await db.getCompanyInjuryReports(company.id)
      setInjuryReports(injuryData)

      const materialPromises = projectsData.map(p => db.getMaterialRequests(p.id))
      const materialArrays = await Promise.all(materialPromises)
      const allMaterials = materialArrays.flat()
      setMaterialRequests(allMaterials)

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

    let totalBillable = 0
    projects.forEach(project => {
      const projectAreas = areas.filter(a => a.project_id === project.id)
      const progress = calculateProgress(projectAreas)
      const billable = (progress / 100) * project.contract_value
      totalBillable += billable
    })

    const totalWeight = areas.length
    const doneWeight = areas.filter(a => a.status === 'done').length
    const overallProgress = totalWeight > 0 ? Math.round((doneWeight / totalWeight) * 100) : 0

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
        Loading overview...
      </div>
    )
  }

  return (
    <div>
      <h1>Company Overview</h1>
      <p className="subtitle">Comprehensive analytics and project metrics</p>

      {/* KPI Cards */}
      <div className="analytics-grid">
        <div className="stat-card">
          <div className="stat-label">Total Contract Value</div>
          <div className="stat-value">{formatCurrency(stats.totalContractValue)}</div>
        </div>

        <div className="stat-card highlight">
          <div className="stat-label">Billable to Date</div>
          <div className="stat-value">{formatCurrency(stats.totalBillable)}</div>
          <div className="stat-sublabel">
            {stats.totalContractValue > 0
              ? `${((stats.totalBillable / stats.totalContractValue) * 100).toFixed(1)}% of total`
              : '0% of total'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Active Projects</div>
          <div className="stat-value">{stats.activeProjects}</div>
          <div className="stat-sublabel">{stats.completedProjects} completed</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Overall Progress</div>
          <div className="stat-value">{stats.overallProgress}%</div>
          <div className="stat-progress-bar">
            <div className="stat-progress-fill" style={{ width: `${stats.overallProgress}%` }}></div>
          </div>
        </div>
      </div>

      {/* Action Items */}
      {(stats.pendingTMTickets > 0 || stats.openInjuryReports > 0 || stats.pendingMaterialRequests > 0) && (
        <div className="card">
          <h3>Action Required</h3>
          <div className="action-grid">
            {stats.pendingTMTickets > 0 && (
              <div className="action-card">
                <div className="action-count">{stats.pendingTMTickets}</div>
                <div className="action-label">T&M Tickets Pending</div>
              </div>
            )}
            {stats.openInjuryReports > 0 && (
              <div className="action-card urgent">
                <div className="action-count">{stats.openInjuryReports}</div>
                <div className="action-label">Open Injury Reports</div>
              </div>
            )}
            {stats.pendingMaterialRequests > 0 && (
              <div className="action-card">
                <div className="action-count">{stats.pendingMaterialRequests}</div>
                <div className="action-label">Material Requests</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Project List */}
      <div className="card">
        <h3>Projects</h3>
        {projects.length === 0 ? (
          <div className="empty-state-compact">
            <p>No projects yet</p>
          </div>
        ) : (
          <div className="project-grid">
            {projects.map(project => {
              const projectAreas = allAreas.filter(a => a.project_id === project.id)
              const progress = calculateProgress(projectAreas)
              const billable = (progress / 100) * project.contract_value
              const projectTM = tmTickets.filter(t => t.project_id === project.id)
              const pendingTM = projectTM.filter(t => t.status === 'pending').length
              const projectMaterials = materialRequests.filter(m => m.project_id === project.id && m.status === 'pending').length

              return (
                <div key={project.id} className="project-card-compact">
                  <div className="project-header-compact">
                    <div className="project-name-compact">{project.name}</div>
                    <div className="project-value-compact">{formatCurrency(project.contract_value)}</div>
                  </div>

                  <div className="project-metrics">
                    <div className="metric">
                      <span className="metric-label">Progress</span>
                      <span className="metric-value">{progress}%</span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">Billable</span>
                      <span className="metric-value">{formatCurrency(billable)}</span>
                    </div>
                  </div>

                  <div className="progress-bar-thin">
                    <div className="progress-fill-thin" style={{ width: `${progress}%` }}></div>
                  </div>

                  {(pendingTM > 0 || projectMaterials > 0) && (
                    <div className="project-alerts">
                      {pendingTM > 0 && <span className="alert-badge">{pendingTM} pending T&M</span>}
                      {projectMaterials > 0 && <span className="alert-badge">{projectMaterials} materials</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <style>{`
        .analytics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .stat-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 1.5rem;
          transition: all 0.2s;
        }

        .stat-card:hover {
          border-color: #d1d5db;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }

        .stat-card.highlight {
          border-color: #2563eb;
          background: linear-gradient(to bottom, #ffffff, #f8fafc);
        }

        .stat-label {
          font-size: 0.875rem;
          font-weight: 500;
          color: #6b7280;
          margin-bottom: 0.5rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .stat-value {
          font-size: 2rem;
          font-weight: 700;
          color: #111827;
          line-height: 1;
        }

        .stat-sublabel {
          font-size: 0.875rem;
          color: #9ca3af;
          margin-top: 0.5rem;
        }

        .stat-progress-bar {
          height: 4px;
          background: #e5e7eb;
          border-radius: 2px;
          overflow: hidden;
          margin-top: 0.75rem;
        }

        .stat-progress-fill {
          height: 100%;
          background: #2563eb;
          border-radius: 2px;
          transition: width 0.3s ease;
        }

        .action-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1rem;
        }

        .action-card {
          padding: 1.25rem;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-left: 3px solid #2563eb;
          border-radius: 6px;
          text-align: center;
        }

        .action-card.urgent {
          border-left-color: #dc2626;
          background: #fef2f2;
        }

        .action-count {
          font-size: 2rem;
          font-weight: 700;
          color: #111827;
          margin-bottom: 0.25rem;
        }

        .action-label {
          font-size: 0.875rem;
          color: #6b7280;
          font-weight: 500;
        }

        .project-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 1rem;
        }

        .project-card-compact {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 1.25rem;
          background: white;
          transition: all 0.2s;
        }

        .project-card-compact:hover {
          border-color: #d1d5db;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .project-header-compact {
          margin-bottom: 1rem;
        }

        .project-name-compact {
          font-size: 1rem;
          font-weight: 600;
          color: #111827;
          margin-bottom: 0.25rem;
        }

        .project-value-compact {
          font-size: 0.875rem;
          color: #6b7280;
        }

        .project-metrics {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          margin-bottom: 0.75rem;
        }

        .metric {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .metric-label {
          font-size: 0.75rem;
          color: #9ca3af;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .metric-value {
          font-size: 1rem;
          font-weight: 600;
          color: #111827;
        }

        .progress-bar-thin {
          height: 6px;
          background: #e5e7eb;
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 0.75rem;
        }

        .progress-fill-thin {
          height: 100%;
          background: #2563eb;
          border-radius: 3px;
          transition: width 0.3s ease;
        }

        .project-alerts {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .alert-badge {
          padding: 0.25rem 0.625rem;
          background: #fef3c7;
          color: #92400e;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .empty-state-compact {
          text-align: center;
          padding: 2rem;
          color: #9ca3af;
        }

        @media (max-width: 768px) {
          .analytics-grid {
            grid-template-columns: 1fr;
          }

          .project-grid {
            grid-template-columns: 1fr;
          }

          .action-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}
