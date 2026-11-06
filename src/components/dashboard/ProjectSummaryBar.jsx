import { formatCurrencyCompact } from '../../lib/utils'

/**
 * ProjectSummaryBar - The four headline metric cards shown above the fold:
 * % complete, billed to date, remaining value, and profit margin.
 */
export default function ProjectSummaryBar({ progress, billable, revisedContractValue, projectData }) {
  const contract = Number(revisedContractValue) || 0
  const billed = Number(billable) || 0
  const pct = Number(progress) || 0
  // No contract value (NULL raw row / 0 from the summary RPC): there is no
  // "remaining" to report, so show a dash instead of a misleading $0
  const hasContract = contract > 0
  return (
    <div className="pv-metrics-bar sdx-metrics-bar" role="region" aria-label="Key project metrics">
      <div className="pv-metric">
        <span className="pv-metric-value sdx-metric-navy" aria-label={`${pct} percent complete`}>{pct}%</span>
        <span className="pv-metric-label">Complete</span>
      </div>
      <div className="pv-metric-divider" aria-hidden="true"></div>
      <div className="pv-metric">
        <span className="pv-metric-value">{formatCurrencyCompact(billed)}</span>
        <span className="pv-metric-label">Billed to date</span>
      </div>
      <div className="pv-metric-divider" aria-hidden="true"></div>
      <div className="pv-metric">
        <span className="pv-metric-value sdx-metric-accent" aria-label={hasContract ? undefined : 'Remaining value not available: no contract value'}>
          {hasContract ? formatCurrencyCompact(contract - billed) : '—'}
        </span>
        <span className="pv-metric-label">Remaining value</span>
      </div>
      <div className="pv-metric-divider" aria-hidden="true"></div>
      <div className="pv-metric">
        <span className={`pv-metric-value ${(projectData?.profitMargin || 0) >= 0 ? 'highlight' : 'sdx-metric-danger'}`}>
          {projectData?._detailsLoaded ? `${(projectData.profitMargin || 0).toFixed(1)}%` : '—'}
        </span>
        <span className="pv-metric-label">Profit margin</span>
      </div>
    </div>
  )
}
