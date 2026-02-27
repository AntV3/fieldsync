import { lazy, Suspense } from 'react'
import { FileText, HardHat, UserCheck, Wrench, Zap, PenLine, CheckCircle2, Check, AlertCircle, Loader2, RotateCcw } from 'lucide-react'
import EvidenceStep from './EvidenceStep'

const SignatureLinkGenerator = lazy(() => import('../SignatureLinkGenerator'))
const TMClientSignature = lazy(() => import('../TMClientSignature'))

/**
 * ReviewStep - Step 4 (review+evidence+submit) and Step 5 (success/signature).
 *
 * Props:
 *  - step: 4 or 5
 *  - setStep
 *  - project, companyId
 *  - workDate, cePcoNumber, notes
 *  - photos, onPhotoAdd, onRemovePhoto, maxPhotos
 *  - selectedCorId, setSelectedCorId, assignableCORs
 *  - items
 *  - hasCustomLaborClasses
 *  - validDynamicWorkersList, validSupervision, validOperators, validLaborers
 *  - totalWorkers, totalRegHours, totalOTHours
 *  - submittedByName, setSubmittedByName
 *  - submittedTicket
 *  - submitting, submitProgress
 *  - clientSigned, setClientSigned
 *  - showSignatureLinkModal, setShowSignatureLinkModal
 *  - showOnSiteSignature, setShowOnSiteSignature
 *  - onRetryPhotoUpload
 *  - t, lang
 *  - onShowToast
 */
export default function ReviewStep({
  step, setStep,
  project, companyId,
  workDate, cePcoNumber, notes,
  photos, onPhotoAdd, onRemovePhoto, maxPhotos,
  selectedCorId, setSelectedCorId, assignableCORs,
  items,
  hasCustomLaborClasses,
  validDynamicWorkersList, validSupervision, validOperators, validLaborers,
  totalWorkers, totalRegHours, totalOTHours,
  submittedByName, setSubmittedByName,
  submittedTicket,
  submitting, submitProgress,
  clientSigned, setClientSigned,
  showSignatureLinkModal, setShowSignatureLinkModal,
  showOnSiteSignature, setShowOnSiteSignature,
  onRetryPhotoUpload,
  t, lang,
  onShowToast
}) {
  // Step 5: Success & Client Signature
  if (step === 5 && submittedTicket) {
    return (
      <div className="tm-step-content tm-success-step">
        <div className="tm-success-header">
          <div className="tm-success-icon">
            <CheckCircle2 size={48} />
          </div>
          <h2>{t('tmSubmitted')}</h2>
          <p className="tm-success-subtitle">
            {t('ticketSavedReady')}
          </p>
        </div>

        <div className="tm-success-summary">
          <div className="tm-success-stat">
            <span className="tm-success-stat-value">{totalWorkers}</span>
            <span className="tm-success-stat-label">{t('workersLabel')}</span>
          </div>
          <div className="tm-success-stat">
            <span className="tm-success-stat-value">{totalRegHours + totalOTHours}</span>
            <span className="tm-success-stat-label">{t('totalHours')}</span>
          </div>
          <div className="tm-success-stat">
            <span className="tm-success-stat-value">{new Date(workDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            <span className="tm-success-stat-label">{t('workDate')}</span>
          </div>
        </div>

        {/* Failed Photos Retry Section */}
        {photos.some(p => p.status === 'failed') && (
          <div className="tm-failed-photos-section">
            <div className="tm-failed-photos-header">
              <AlertCircle size={18} />
              <span>
                {lang === 'en'
                  ? `${photos.filter(p => p.status === 'failed').length} photo(s) failed to upload`
                  : `${photos.filter(p => p.status === 'failed').length} foto(s) no se subieron`}
              </span>
            </div>
            <div className="tm-failed-photos-grid">
              {photos.filter(p => p.status === 'failed').map(photo => (
                <div key={photo.id} className="tm-failed-photo-item">
                  <img src={photo.previewUrl} alt={photo.name} />
                  <div className="tm-failed-photo-overlay">
                    <button
                      className="tm-retry-photo-btn"
                      onClick={() => onRetryPhotoUpload(photo.id, submittedTicket.id)}
                      disabled={photo.status === 'uploading' || photo.status === 'compressing'}
                    >
                      {photo.status === 'uploading' || photo.status === 'compressing' ? (
                        <Loader2 size={16} className="tm-spinner" />
                      ) : (
                        <>
                          <RotateCcw size={16} />
                          <span>{t('retry')}</span>
                        </>
                      )}
                    </button>
                  </div>
                  {photo.error && (
                    <div className="tm-failed-photo-error" title={photo.error}>
                      {photo.error.substring(0, 20)}{photo.error.length > 20 ? '...' : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button
              className="tm-retry-all-btn"
              onClick={async () => {
                const failedPhotos = photos.filter(p => p.status === 'failed')
                for (const photo of failedPhotos) {
                  await onRetryPhotoUpload(photo.id, submittedTicket.id)
                }
              }}
            >
              <RotateCcw size={16} />
              {t('retryAllPhotos')}
            </button>
          </div>
        )}

        {/* Photo Upload Success Indicator */}
        {photos.length > 0 && photos.every(p => p.status === 'confirmed') && (
          <div className="tm-photos-success">
            <Check size={16} />
            <span>
              {lang === 'en'
                ? `All ${photos.length} photo(s) uploaded successfully`
                : `${photos.length} foto(s) subidas exitosamente`}
            </span>
          </div>
        )}

        <div className="tm-signature-options">
          <h3>{t('getClientSignature')}</h3>
          <p className="tm-signature-description">
            {t('signatureDescription')}
          </p>

          {clientSigned ? (
            <div className="tm-signed-confirmation">
              <CheckCircle2 size={32} className="tm-signed-icon" />
              <span>{t('clientSignatureCollected')}</span>
            </div>
          ) : (
            <div className="tm-signature-buttons">
              <button
                className="tm-signature-option-btn primary"
                onClick={() => setShowOnSiteSignature(true)}
              >
                <div className="tm-signature-option-icon">
                  <PenLine size={24} />
                </div>
                <div className="tm-signature-option-text">
                  <span className="tm-signature-option-title">
                    {t('signNowOnSite')}
                  </span>
                  <span className="tm-signature-option-desc">
                    {t('clientSignsDevice')}
                  </span>
                </div>
              </button>

              <button
                className="tm-signature-option-btn"
                onClick={() => setShowSignatureLinkModal(true)}
              >
                <div className="tm-signature-option-icon">
                  <PenLine size={24} />
                </div>
                <div className="tm-signature-option-text">
                  <span className="tm-signature-option-title">
                    {t('sendSignatureLink')}
                  </span>
                  <span className="tm-signature-option-desc">
                    {t('clientSignsLater')}
                  </span>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Signature Link Generator Modal */}
        {showSignatureLinkModal && (
          <Suspense fallback={<div className="loading">Loading...</div>}>
            <SignatureLinkGenerator
              documentType="tm_ticket"
              documentId={submittedTicket.id}
              companyId={companyId}
              projectId={project.id}
              project={project}
              documentTitle={`T&M - ${new Date(workDate).toLocaleDateString()}`}
              onClose={() => setShowSignatureLinkModal(false)}
              onShowToast={onShowToast}
            />
          </Suspense>
        )}

        {/* On-Site Client Signature Modal */}
        {showOnSiteSignature && (
          <Suspense fallback={<div className="loading">Loading...</div>}>
            <TMClientSignature
              ticketId={submittedTicket.id}
              ticketSummary={{
                workDate: workDate,
                workerCount: totalWorkers,
                totalHours: totalRegHours + totalOTHours
              }}
              lang={lang}
              onSave={() => {
                setShowOnSiteSignature(false)
                setClientSigned(true)
              }}
              onClose={() => setShowOnSiteSignature(false)}
              onShowToast={onShowToast}
            />
          </Suspense>
        )}
      </div>
    )
  }

  // Step 4: Review (includes Evidence + Summary + Certification)
  return (
    <div className="tm-step-content">
      {/* Evidence section (photos + COR linking) */}
      <EvidenceStep
        photos={photos}
        onPhotoAdd={onPhotoAdd}
        onRemovePhoto={onRemovePhoto}
        maxPhotos={maxPhotos}
        selectedCorId={selectedCorId}
        setSelectedCorId={setSelectedCorId}
        assignableCORs={assignableCORs}
        lang={lang}
      />

      <div className="tm-review-divider">
        <span>{t('ticketSummary')}</span>
      </div>

      {/* Work Info Summary */}
      <div className="tm-review-section">
        <div className="tm-review-section-header">
          <h4>{'\ud83d\udcc5'} {t('workDate')}</h4>
          <button className="tm-edit-link" onClick={() => setStep(1)}>{t('edit')}</button>
        </div>
        <div className="tm-review-row">
          <span>{new Date(workDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          {cePcoNumber && <span>CE/PCO: {cePcoNumber}</span>}
        </div>
      </div>

      {/* Description */}
      {notes && (
        <div className="tm-review-section">
          <div className="tm-review-section-header">
            <h4><FileText size={16} className="inline-icon" /> {t('notes')}</h4>
            <button className="tm-edit-link" onClick={() => setStep(1)}>{t('edit')}</button>
          </div>
          <div className="tm-review-notes">{notes}</div>
        </div>
      )}

      {/* Dynamic Workers Review (when company has custom classes) */}
      {hasCustomLaborClasses && validDynamicWorkersList.length > 0 && (
        <div className="tm-review-section">
          <div className="tm-review-section-header">
            <h4><HardHat size={16} className="inline-icon" /> {t('workersLabel')} ({totalRegHours + totalOTHours} hrs)</h4>
            <button className="tm-edit-link" onClick={() => setStep(2)}>{t('edit')}</button>
          </div>
          <div className="tm-review-list">
            {validDynamicWorkersList.map((w, i) => (
              <div key={i} className="tm-review-row-detailed">
                <div className="tm-review-worker-name">
                  <span className="tm-role-badge">{w.role}</span> {w.name}
                </div>
                <div className="tm-review-worker-details">
                  {w.time_started && w.time_ended && (
                    <span className="tm-review-time">{w.time_started} - {w.time_ended}</span>
                  )}
                  <span className="tm-review-hours">{w.hours || 0} reg{w.overtime_hours > 0 ? ` + ${w.overtime_hours} OT` : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hardcoded Workers Review (fallback when no custom classes) */}
      {!hasCustomLaborClasses && validSupervision.length > 0 && (
        <div className="tm-review-section">
          <div className="tm-review-section-header">
            <h4><UserCheck size={16} className="inline-icon" /> Supervision ({validSupervision.reduce((sum, s) => sum + parseFloat(s.hours || 0) + parseFloat(s.overtimeHours || 0), 0)} hrs)</h4>
            <button className="tm-edit-link" onClick={() => setStep(2)}>{t('edit')}</button>
          </div>
          <div className="tm-review-list">
            {validSupervision.map((s, i) => (
              <div key={i} className="tm-review-row-detailed">
                <div className="tm-review-worker-name">
                  <span className="tm-role-badge">{s.role}</span> {s.name}
                </div>
                <div className="tm-review-worker-details">
                  {s.timeStarted && s.timeEnded && (
                    <span className="tm-review-time">{s.timeStarted} - {s.timeEnded}</span>
                  )}
                  <span className="tm-review-hours">{s.hours || 0} reg{parseFloat(s.overtimeHours) > 0 ? ` + ${s.overtimeHours} OT` : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasCustomLaborClasses && validOperators.length > 0 && (
        <div className="tm-review-section">
          <div className="tm-review-section-header">
            <h4>{'\ud83d\ude9c'} Operators ({validOperators.reduce((sum, o) => sum + parseFloat(o.hours || 0) + parseFloat(o.overtimeHours || 0), 0)} hrs)</h4>
            <button className="tm-edit-link" onClick={() => setStep(2)}>{t('edit')}</button>
          </div>
          <div className="tm-review-list">
            {validOperators.map((o, i) => (
              <div key={i} className="tm-review-row-detailed">
                <div className="tm-review-worker-name">{o.name}</div>
                <div className="tm-review-worker-details">
                  {o.timeStarted && o.timeEnded && (
                    <span className="tm-review-time">{o.timeStarted} - {o.timeEnded}</span>
                  )}
                  <span className="tm-review-hours">{o.hours || 0} reg{parseFloat(o.overtimeHours) > 0 ? ` + ${o.overtimeHours} OT` : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasCustomLaborClasses && validLaborers.length > 0 && (
        <div className="tm-review-section">
          <div className="tm-review-section-header">
            <h4><HardHat size={16} className="inline-icon" /> Laborers ({validLaborers.reduce((sum, l) => sum + parseFloat(l.hours || 0) + parseFloat(l.overtimeHours || 0), 0)} hrs)</h4>
            <button className="tm-edit-link" onClick={() => setStep(2)}>{t('edit')}</button>
          </div>
          <div className="tm-review-list">
            {validLaborers.map((l, i) => (
              <div key={i} className="tm-review-row-detailed">
                <div className="tm-review-worker-name">{l.name}</div>
                <div className="tm-review-worker-details">
                  {l.timeStarted && l.timeEnded && (
                    <span className="tm-review-time">{l.timeStarted} - {l.timeEnded}</span>
                  )}
                  <span className="tm-review-hours">{l.hours || 0} reg{parseFloat(l.overtimeHours) > 0 ? ` + ${l.overtimeHours} OT` : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="tm-review-section">
          <div className="tm-review-section-header">
            <h4><Wrench size={16} className="inline-icon" /> Materials & Equipment ({items.length} items)</h4>
            <button className="tm-edit-link" onClick={() => setStep(3)}>{t('edit')}</button>
          </div>
          <div className="tm-review-list">
            {items.map((item, i) => (
              <div key={i} className="tm-review-row">
                <span>{item.isCustom && <><Zap size={14} className="inline-icon" /> </>}{item.name}</span>
                <span>{item.quantity} {item.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submitted By - Certification */}
      <div className="tm-review-section tm-certification">
        <div className="tm-review-header">
          <span><PenLine size={16} className="inline-icon" /> {t('submittedBy')}</span>
        </div>
        <input
          type="text"
          className="tm-certification-input"
          placeholder={t('enterYourName')}
          value={submittedByName}
          onChange={(e) => setSubmittedByName(e.target.value)}
        />
        <p className="tm-certification-note">
          {t('certifyAccurate')}
        </p>
      </div>
    </div>
  )
}
