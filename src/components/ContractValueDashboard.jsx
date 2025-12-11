import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { BarChart, StatCard } from './charts'
import SOVImport from './SOVImport'

/**
 * Contract Value Dashboard
 * Shows project progress, earned value, and SOV breakdown
 */
export default function ContractValueDashboard({ project }) {
  const [sovLines, setSovLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)
  const [stats, setStats] = useState({
    totalContract: 0,
    earnedToDate: 0,
    percentComplete: 0,
    balanceToFinish: 0
  })

  useEffect(() => {
    if (project) {
      loadSOVData()
    }
  }, [project])

  const loadSOVData = async () => {
    try {
      setLoading(true)

      // Load SOV lines
      const { data: sovData, error: sovError } = await db
        .from('schedule_of_values')
        .select('*')
        .eq('project_id', project.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (sovError) throw sovError

      setSovLines(sovData || [])

      // Calculate stats
      const totalContract = sovData?.reduce((sum, line) => sum + parseFloat(line.scheduled_value || 0), 0) || 0
      const earnedToDate = sovData?.reduce((sum, line) => sum + parseFloat(line.work_completed_to_date || 0), 0) || 0
      const percentComplete = totalContract > 0 ? (earnedToDate / totalContract * 100) : 0
      const balanceToFinish = totalContract - earnedToDate

      setStats({
        totalContract,
        earnedToDate,
        percentComplete,
        balanceToFinish
      })
    } catch (err) {
      console.error('Error loading SOV data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleImportComplete = () => {
    setShowImport(false)
    loadSOVData()
  }

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const formatPercent = (value) => {
    return `${Math.round(value)}%`
  }

  const getStatusIcon = (percent) => {
    if (percent >= 100) return '✅'
    if (percent >= 75) return '🟢'
    if (percent >= 50) return '🟡'
    if (percent >= 25) return '🟠'
    if (percent > 0) return '🔵'
    return '⚪'
  }

  const getStatusColor = (percent) => {
    if (percent >= 100) return 'var(--status-completed)'
    if (percent >= 75) return 'var(--accent-green)'
    if (percent >= 50) return 'var(--accent-blue)'
    if (percent >= 25) return 'var(--accent-yellow)'
    return 'var(--text-muted)'
  }

  // Prepare chart data
  const chartData = sovLines.slice(0, 10).map(line => ({
    label: line.line_number,
    value: parseFloat(line.work_completed_to_date || 0),
    color: getStatusColor(line.percent_complete)
  }))

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading-skeleton">
          <div className="skeleton-stat-grid">
            <div className="skeleton skeleton-stat-card"></div>
            <div className="skeleton skeleton-stat-card"></div>
            <div className="skeleton skeleton-stat-card"></div>
            <div className="skeleton skeleton-stat-card"></div>
          </div>
        </div>
      </div>
    )
  }

  // No SOV data yet
  if (sovLines.length === 0) {
    return (
      <div className="dashboard-container">
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <h3>No Pay Application Imported</h3>
          <p>Import your pay application (Schedule of Values) to start tracking contract value and earned revenue.</p>
          <button className="btn btn-primary" onClick={() => setShowImport(true)}>
            Import Pay Application
          </button>
        </div>

        {showImport && (
          <SOVImport
            project={project}
            onImportComplete={handleImportComplete}
            onCancel={() => setShowImport(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h2>Contract Value Dashboard</h2>
          <p className="text-muted">{project.name}</p>
        </div>
        <button className="btn btn-secondary" onClick={() => setShowImport(true)}>
          Update SOV
        </button>
      </div>

      {/* Summary Stats */}
      <div className="stat-card-grid">
        <StatCard
          label="Total Contract Value"
          value={formatCurrency(stats.totalContract)}
          icon="📋"
          color="var(--accent-blue)"
        />
        <StatCard
          label="Earned to Date"
          value={formatCurrency(stats.earnedToDate)}
          icon="💰"
          color="var(--accent-green)"
        />
        <StatCard
          label="Percent Complete"
          value={formatPercent(stats.percentComplete)}
          icon="📈"
          color="var(--accent-blue)"
        />
        <StatCard
          label="Balance to Finish"
          value={formatCurrency(stats.balanceToFinish)}
          icon="⏳"
          color="var(--text-muted)"
        />
      </div>

      {/* Progress Bar */}
      <div className="progress-section">
        <div className="progress-header">
          <span>Overall Progress</span>
          <span className="progress-value">{formatPercent(stats.percentComplete)}</span>
        </div>
        <div className="progress-bar">
          <div
            className="progress-bar-fill"
            style={{
              width: `${Math.min(stats.percentComplete, 100)}%`,
              backgroundColor: getStatusColor(stats.percentComplete)
            }}
          />
        </div>
        <div className="progress-labels">
          <span>{formatCurrency(stats.earnedToDate)} earned</span>
          <span>{formatCurrency(stats.balanceToFinish)} remaining</span>
        </div>
      </div>

      {/* Earned Value Chart */}
      {chartData.length > 0 && (
        <div className="chart-section">
          <BarChart
            data={chartData}
            title="Earned Value by Line Item"
            valueLabel="Dollars Earned"
            maxHeight={250}
          />
        </div>
      )}

      {/* SOV Line Items Table */}
      <div className="sov-table-section">
        <h3>Schedule of Values Breakdown</h3>
        <div className="table-container">
          <table className="sov-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Line #</th>
                <th>Description</th>
                <th className="text-right">Scheduled Value</th>
                <th className="text-right">Earned to Date</th>
                <th className="text-right">% Complete</th>
                <th className="text-right">Balance to Finish</th>
                <th>Method</th>
              </tr>
            </thead>
            <tbody>
              {sovLines.map((line) => (
                <tr key={line.id}>
                  <td className="text-center">
                    <span
                      className="status-icon"
                      title={`${Math.round(line.percent_complete)}% complete`}
                    >
                      {getStatusIcon(line.percent_complete)}
                    </span>
                  </td>
                  <td>{line.line_number}</td>
                  <td>{line.description}</td>
                  <td className="text-right">{formatCurrency(line.scheduled_value)}</td>
                  <td className="text-right">
                    <strong style={{ color: getStatusColor(line.percent_complete) }}>
                      {formatCurrency(line.work_completed_to_date)}
                    </strong>
                  </td>
                  <td className="text-right">
                    <div className="mini-progress-bar">
                      <div
                        className="mini-progress-fill"
                        style={{
                          width: `${Math.min(line.percent_complete, 100)}%`,
                          backgroundColor: getStatusColor(line.percent_complete)
                        }}
                      />
                      <span className="mini-progress-label">
                        {formatPercent(line.percent_complete)}
                      </span>
                    </div>
                  </td>
                  <td className="text-right text-muted">{formatCurrency(line.balance_to_finish)}</td>
                  <td>
                    <span className="badge">
                      {line.calc_method === 'area_distribution' && 'Area'}
                      {line.calc_method === 'tm_actual' && 'T&M'}
                      {line.calc_method === 'manual' && 'Manual'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan="3">TOTAL</th>
                <th className="text-right">{formatCurrency(stats.totalContract)}</th>
                <th className="text-right">{formatCurrency(stats.earnedToDate)}</th>
                <th className="text-right">{formatPercent(stats.percentComplete)}</th>
                <th className="text-right">{formatCurrency(stats.balanceToFinish)}</th>
                <th></th>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Import Modal */}
      {showImport && (
        <SOVImport
          project={project}
          onImportComplete={handleImportComplete}
          onCancel={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
