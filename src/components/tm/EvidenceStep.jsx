import { Camera, Link } from 'lucide-react'

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
  maxPhotos,
  selectedCorId, setSelectedCorId,
  assignableCORs,
  lang
}) {
  return (
    <>
      {/* PHOTOS - Prominent Action Card */}
      <div className={`tm-action-card-prominent ${photos.length > 0 ? 'has-content' : 'needs-action'}`}>
        <div className="tm-action-card-header">
          <div className="tm-action-card-icon">
            <Camera size={24} />
          </div>
          <div className="tm-action-card-title">
            <h4>{lang === 'en' ? 'Photo Evidence' : 'Evidencia Fotogr\u00e1fica'}</h4>
            <span className="tm-action-card-status">
              {photos.length > 0
                ? `${photos.length} ${lang === 'en' ? 'photo(s) added' : 'foto(s) agregada(s)'}`
                : (lang === 'en' ? 'Recommended for billing' : 'Recomendado para facturaci\u00f3n')
              }
            </span>
          </div>
        </div>
        {photos.length > 0 && (
          <div className="tm-photo-preview-row">
            {photos.map(photo => (
              <div key={photo.id} className="tm-photo-preview-thumb">
                <img src={photo.previewUrl} alt={photo.name} />
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
          <span>{photos.length > 0 ? (lang === 'en' ? 'Add More Photos' : 'Agregar M\u00e1s Fotos') : (lang === 'en' ? 'Add Photos' : 'Agregar Fotos')}</span>
        </label>
      </div>

      {/* COR LINKING - Prominent Action Card */}
      <div className={`tm-action-card-prominent ${selectedCorId ? 'has-content' : ''}`}>
        <div className="tm-action-card-header">
          <div className="tm-action-card-icon cor">
            <Link size={24} />
          </div>
          <div className="tm-action-card-title">
            <h4>{lang === 'en' ? 'Link to Change Order' : 'Vincular a Orden de Cambio'}</h4>
            <span className="tm-action-card-status">
              {selectedCorId
                ? `${lang === 'en' ? 'Linked to' : 'Vinculado a'}: ${assignableCORs.find(c => c.id === selectedCorId)?.cor_number || ''}`
                : (lang === 'en' ? 'Optional - Link this T&M to a COR' : 'Opcional - Vincular este T&M a un COR')
              }
            </span>
          </div>
        </div>
        <select
          value={selectedCorId}
          onChange={(e) => setSelectedCorId(e.target.value)}
          className="tm-cor-select-prominent"
        >
          <option value="">{lang === 'en' ? '-- Select a COR (optional) --' : '-- Seleccionar COR (opcional) --'}</option>
          {assignableCORs.map(cor => (
            <option key={cor.id} value={cor.id}>
              {cor.cor_number}: {cor.title || 'Untitled'} ({cor.status})
            </option>
          ))}
        </select>
        {assignableCORs.length === 0 && (
          <p className="tm-cor-hint">{lang === 'en' ? 'No active CORs available for this project' : 'No hay CORs activos para este proyecto'}</p>
        )}
      </div>
    </>
  )
}
