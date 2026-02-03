import { FileText } from 'lucide-react'

/**
 * WorkDetailsStep - Step 1: Work description, date, CE/PCO, COR linking.
 *
 * Props:
 *  - project: project object
 *  - workDate, setWorkDate
 *  - cePcoNumber, setCePcoNumber
 *  - notes, setNotes (description of work)
 *  - t: translation function
 *  - lang: 'en' | 'es'
 */
export default function WorkDetailsStep({
  project,
  workDate, setWorkDate,
  cePcoNumber, setCePcoNumber,
  notes, setNotes,
  t, lang
}) {
  return (
    <div className="tm-step-content">
      {/* Project Info Header */}
      <div className="tm-project-info">
        {project.job_number && (
          <div className="tm-project-detail">
            <span className="tm-project-label">Job #</span>
            <span className="tm-project-value">{project.job_number}</span>
          </div>
        )}
        <div className="tm-project-detail">
          <span className="tm-project-label">Project</span>
          <span className="tm-project-value">{project.name}</span>
        </div>
        {project.address && (
          <div className="tm-project-detail">
            <span className="tm-project-label">Address</span>
            <span className="tm-project-value">{project.address}</span>
          </div>
        )}
        {project.general_contractor && (
          <div className="tm-project-detail">
            <span className="tm-project-label">GC</span>
            <span className="tm-project-value">{project.general_contractor}</span>
          </div>
        )}
      </div>

      <div className="tm-field-row">
        <div className="tm-field tm-field-half">
          <label>Date</label>
          <input
            type="date"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
            className="tm-date"
          />
        </div>
        <div className="tm-field tm-field-half">
          <label>CE / PCO #</label>
          <input
            type="text"
            placeholder="Change Event / PCO"
            value={cePcoNumber}
            onChange={(e) => setCePcoNumber(e.target.value)}
            className="tm-input"
          />
        </div>
      </div>

      {/* Description of Work - REQUIRED */}
      <div className="tm-field tm-description-field">
        <label>
          <FileText size={16} className="inline-icon" />
          {t('describeWork')} <span className="tm-required">*</span>
        </label>
        <textarea
          placeholder={t('whatWorkPerformed')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className={`tm-description ${!notes.trim() ? 'tm-field-required' : ''}`}
        />
      </div>
    </div>
  )
}
