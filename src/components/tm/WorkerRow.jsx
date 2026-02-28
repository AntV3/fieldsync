/* eslint-disable react-refresh/only-export-components */
import { Check } from 'lucide-react'

// Helper to determine worker completion state for visual indicators
export const getWorkerState = (worker) => {
  if (!worker) return 'empty'
  const hasName = worker.name && worker.name.trim() !== ''
  const hasHours = parseFloat(worker.hours) > 0 || parseFloat(worker.overtimeHours) > 0
  if (!hasName) return 'empty'
  if (hasHours) return 'complete'
  return 'incomplete'
}

// Calculate hours from time range (auto-split into regular + OT)
export const calculateHoursFromTimeRange = (startTime, endTime) => {
  if (!startTime || !endTime) return null

  const [startHour, startMin] = startTime.split(':').map(Number)
  const [endHour, endMin] = endTime.split(':').map(Number)

  let totalMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin)
  if (totalMinutes < 0) totalMinutes += 24 * 60 // Handle overnight

  const totalHours = totalMinutes / 60
  const regularHours = Math.min(totalHours, 8)
  const overtimeHours = Math.max(0, totalHours - 8)

  return {
    hours: regularHours.toFixed(1),
    overtimeHours: overtimeHours > 0 ? overtimeHours.toFixed(1) : ''
  }
}

/**
 * WorkerRow - Renders a single worker card with name, time, and hours fields.
 * Used across supervision, operators, laborers, and dynamic labor class sections.
 *
 * Props:
 *  - worker: { name, hours, overtimeHours, timeStarted, timeEnded, role? }
 *  - index: number
 *  - onUpdate: (index, field, value) => void
 *  - onRemove: (index) => void
 *  - t: translation function
 *  - roleSelect?: JSX element for supervision role dropdown (optional)
 */
export default function WorkerRow({ worker, index, onUpdate, onRemove, t, roleSelect }) {
  const workerState = getWorkerState(worker)

  return (
    <div className={`tm-worker-card-expanded ${workerState !== 'empty' ? `worker-${workerState}` : ''}`}>
      <div className="tm-worker-row-top">
        {workerState === 'complete' && (
          <span className="tm-worker-check"><Check size={14} /></span>
        )}
        {roleSelect}
        <input
          type="text"
          placeholder={t('firstLastName')}
          value={worker.name}
          onChange={(e) => onUpdate(index, 'name', e.target.value)}
          className="tm-worker-input"
        />
        <button className="tm-remove" onClick={() => onRemove(index)}>×</button>
      </div>
      <div className="tm-worker-row-bottom">
        <div className="tm-time-group">
          <label>{t('start')}</label>
          <input
            type="time"
            value={worker.timeStarted}
            onChange={(e) => onUpdate(index, 'timeStarted', e.target.value)}
          />
        </div>
        <div className="tm-time-group">
          <label>{t('end')}</label>
          <input
            type="time"
            value={worker.timeEnded}
            onChange={(e) => onUpdate(index, 'timeEnded', e.target.value)}
          />
        </div>
        <div className="tm-time-group">
          <label>{t('regHrs')}</label>
          <input
            type="number"
            placeholder="0"
            value={worker.hours}
            onChange={(e) => onUpdate(index, 'hours', e.target.value)}
          />
        </div>
        <div className="tm-time-group">
          <label>{t('otHrs')}</label>
          <input
            type="number"
            placeholder="0"
            value={worker.overtimeHours}
            onChange={(e) => onUpdate(index, 'overtimeHours', e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}
