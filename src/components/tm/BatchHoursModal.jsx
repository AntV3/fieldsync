import { Clock } from 'lucide-react'
import { calculateHoursFromTimeRange } from './WorkerRow'

/**
 * BatchHoursModal - Modal for applying the same hours to all named workers.
 *
 * Props:
 *  - batchHours: { timeStarted, timeEnded, hours, overtimeHours }
 *  - setBatchHours: setter
 *  - namedWorkerCount: number of workers with names
 *  - onApply: () => void
 *  - onClose: () => void
 *  - t: translation function
 */
export default function BatchHoursModal({ batchHours, setBatchHours, namedWorkerCount, onApply, onClose, t }) {
  const applyTimePreset = (preset) => {
    let timeStarted, timeEnded, hours, overtimeHours

    switch (preset) {
      case 'full':
        timeStarted = '07:00'
        timeEnded = '15:30'
        hours = '8'
        overtimeHours = ''
        break
      case '10hr':
        timeStarted = '06:00'
        timeEnded = '16:30'
        hours = '8'
        overtimeHours = '2'
        break
      case 'half':
        timeStarted = '07:00'
        timeEnded = '11:00'
        hours = '4'
        overtimeHours = ''
        break
      default:
        return
    }

    setBatchHours({ timeStarted, timeEnded, hours, overtimeHours })
  }

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-batch-modal" onClick={(e) => e.stopPropagation()}>
        <h3><Clock size={18} /> {t('applySameHours')}</h3>
        <p className="tm-batch-description">
          {t('batchDescription')}
        </p>

        {/* Time Presets - Quick Selection */}
        <div className="tm-time-presets">
          <button type="button" className="tm-preset-btn" onClick={() => applyTimePreset('full')}>
            {t('preset8hr')}
          </button>
          <button type="button" className="tm-preset-btn" onClick={() => applyTimePreset('10hr')}>
            {t('preset10hr')}
          </button>
          <button type="button" className="tm-preset-btn" onClick={() => applyTimePreset('half')}>
            {t('preset4hr')}
          </button>
        </div>

        <div className="tm-batch-form">
          <div className="tm-batch-row">
            <div className="tm-batch-field">
              <label>{t('timeStarted')}</label>
              <input
                type="time"
                value={batchHours.timeStarted}
                onChange={(e) => {
                  const newStart = e.target.value
                  const calculated = calculateHoursFromTimeRange(newStart, batchHours.timeEnded)
                  setBatchHours({
                    ...batchHours,
                    timeStarted: newStart,
                    ...(calculated || {})
                  })
                }}
              />
            </div>
            <div className="tm-batch-field">
              <label>{t('timeEnded')}</label>
              <input
                type="time"
                value={batchHours.timeEnded}
                onChange={(e) => {
                  const newEnd = e.target.value
                  const calculated = calculateHoursFromTimeRange(batchHours.timeStarted, newEnd)
                  setBatchHours({
                    ...batchHours,
                    timeEnded: newEnd,
                    ...(calculated || {})
                  })
                }}
              />
            </div>
          </div>
          <div className="tm-batch-row">
            <div className="tm-batch-field">
              <label>{t('regularHours')}</label>
              <input
                type="number"
                placeholder="8"
                value={batchHours.hours}
                onChange={(e) => setBatchHours({ ...batchHours, hours: e.target.value })}
              />
            </div>
            <div className="tm-batch-field">
              <label>{t('overtimeHours')}</label>
              <input
                type="number"
                placeholder="0"
                value={batchHours.overtimeHours}
                onChange={(e) => setBatchHours({ ...batchHours, overtimeHours: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="tm-batch-preview">
          <strong>{t('willApplyTo')}:</strong>
          <span>
            {namedWorkerCount} {t('workers_plural')}
          </span>
        </div>

        <div className="tm-batch-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onApply}
            disabled={!batchHours.hours && !batchHours.overtimeHours}
          >
            {t('applyToAll')}
          </button>
        </div>
      </div>
    </div>
  )
}
