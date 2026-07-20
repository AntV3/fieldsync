import { formatCurrencyCompact } from '../../lib/utils'

const STATUS_META = {
  done: { label: 'Done', className: 'done' },
  working: { label: 'Working', className: 'working' },
  not_started: { label: 'Not started', className: 'not-started' }
}

/**
 * ScheduleOfValues - The SOV / work-area list with per-area field status
 * badges (click to cycle), earned values, and the overall progress footer.
 */
export default function ScheduleOfValues({
  areas,
  areasComplete,
  areasWorking,
  areasNotStarted,
  billable,
  revisedContractValue,
  progress,
  isValueBased,
  onAreaStatusCycle
}) {
  const renderAreaValue = (area) => (
    area.scheduled_value ? formatCurrencyCompact(area.scheduled_value) : `${area.weight || 0}%`
  )

  return (
    <div className="sdx-card sdx-panel sdx-sov" role="region" aria-label="Schedule of values">
      <div className="sdx-panel-header">
        <div>
          <h3 className="sdx-panel-title">{isValueBased ? 'Schedule of Values' : 'Work Areas'}</h3>
          <div className="sdx-panel-sub">
            Field status drives earned value —{' '}
            <span className="sdx-count-done">{areasComplete} done</span> ·{' '}
            <span className="sdx-count-working">{areasWorking} working</span> ·{' '}
            {areasNotStarted} not started
          </div>
        </div>
        <div className="sdx-panel-figure">
          <div className="sdx-panel-figure-value">
            {formatCurrencyCompact(billable)} / {formatCurrencyCompact(revisedContractValue)}
          </div>
          <div className="sdx-panel-figure-label">earned / scheduled</div>
        </div>
      </div>

      <div className="sdx-sov-cols" aria-hidden="true">
        <div>Area / scope</div>
        <div className="right">Value</div>
        <div className="center">Field status</div>
        <div className="right">Earned</div>
      </div>

      <div className="sdx-sov-rows" role="list">
        {(areas || []).length === 0 && (
          <div className="sdx-empty-row">No work areas yet — add areas in Edit to build the SOV.</div>
        )}
        {(areas || []).map(area => {
          const meta = STATUS_META[area.status] || STATUS_META.not_started
          const done = area.status === 'done'
          return (
            <div key={area.id} className="sdx-sov-row" role="listitem">
              <div className="sdx-sov-area">
                <span className={`sdx-dot ${meta.className}`} aria-hidden="true" />
                <div className="sdx-sov-name-wrap">
                  <div className="sdx-sov-name">{area.name}</div>
                  {area.group_name && <div className="sdx-sov-sub">{area.group_name}</div>}
                </div>
              </div>
              <div className="sdx-sov-value">{renderAreaValue(area)}</div>
              <div className="sdx-sov-status">
                <button
                  className={`sdx-pill ${meta.className}`}
                  onClick={() => onAreaStatusCycle?.(area)}
                  title="Click to cycle status"
                  aria-label={`${area.name}: ${meta.label}. Click to cycle status.`}
                >
                  {meta.label}
                </button>
              </div>
              <div className={`sdx-sov-earned ${done ? 'earned' : ''}`}>
                {done ? renderAreaValue(area) : '—'}
              </div>
            </div>
          )
        })}
      </div>

      <div className="sdx-sov-footer">
        <div className="sdx-progress-track" aria-hidden="true">
          <div className="sdx-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="sdx-progress-figure">{progress}% earned</span>
      </div>
    </div>
  )
}
