import { Camera, Link, MapPin } from 'lucide-react'
import { createT } from './translations'

/**
 * EvidenceStep - Step 4 evidence section: photo capture/upload and COR linking.
 * This is rendered as part of the Review step (step 4) in the wizard.
 *
 * Props:
 *  - photos, onPhotoAdd, onRemovePhoto
 *  - maxPhotos
 *  - selectedCorId, setSelectedCorId
 *  - assignableCORs
 *  - lang
 */
export default function EvidenceStep({
  photos, onPhotoAdd, onRemovePhoto,
  maxPhotos: _maxPhotos,
  selectedCorId, setSelectedCorId,
  assignableCORs,
  lang
}) {
  const t = createT(lang)

  return (
    <>
      {/* PHOTOS - Prominent Action Card */}
      <div className={`tm-action-card-prominent ${photos.length > 0 ? 'has-content' : 'needs-action'}`}>
        <div className="tm-action-card-header">
          <div className="tm-action-card-icon">
            <Camera size={24} />
          </div>
          <div className="tm-action-card-title">
            <h4>{t('photoEvidence')}</h4>
            <span className="tm-action-card-status">
              {photos.length > 0
                ? `${photos.length} ${t('photosAdded')}`
                : t('recommendedForBilling')
              }
            </span>
          </div>
        </div>
        {photos.length > 0 && (
          <div className="tm-photo-preview-row">
            {photos.map(photo => (
              <div key={photo.id} className="tm-photo-preview-thumb">
                <img src={photo.previewUrl} alt={photo.name} />
                {photo.latitude && <span className="tm-photo-gps-badge" title={`${photo.latitude.toFixed(4)}, ${photo.longitude.toFixed(4)}`}><MapPin size={10} /></span>}
                <button className="tm-photo-remove-x" onClick={() => onRemovePhoto(photo.id)}>{'\u00d7'}</button>
              </div>
            ))}
          </div>
        )}
        <label className={`tm-action-card-btn ${photos.length === 0 ? 'primary' : ''}`}>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={onPhotoAdd}
            style={{ display: 'none' }}
          />
          <Camera size={18} />
          <span>{photos.length > 0 ? t('addMorePhotos') : t('addPhotos')}</span>
        </label>
      </div>

      {/* COR LINKING - Prominent Action Card */}
      <div className={`tm-action-card-prominent ${selectedCorId ? 'has-content' : ''}`}>
        <div className="tm-action-card-header">
          <div className="tm-action-card-icon cor">
            <Link size={24} />
          </div>
          <div className="tm-action-card-title">
            <h4>{t('linkToChangeOrder')}</h4>
            <span className="tm-action-card-status">
              {selectedCorId
                ? `${t('linkedTo')}: ${assignableCORs.find(c => c.id === selectedCorId)?.cor_number || ''}`
                : t('optionalLinkCOR')
              }
            </span>
          </div>
        </div>
        <select
          value={selectedCorId}
          onChange={(e) => setSelectedCorId(e.target.value)}
          className="tm-cor-select-prominent"
        >
          <option value="">{t('selectCOROptional')}</option>
          {assignableCORs.map(cor => (
            <option key={cor.id} value={cor.id}>
              {cor.cor_number}: {cor.title || 'Untitled'} ({cor.status})
            </option>
          ))}
        </select>
        {assignableCORs.length === 0 && (
          <p className="tm-cor-hint">{t('noActiveCORs')}</p>
        )}
      </div>
    </>
  )
}
