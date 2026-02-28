import { useState, useRef } from 'react'
import { X, Check, RotateCcw, Pen, User, Building, Briefcase, HardHat, Wrench, Camera, FileText, ChevronDown, ChevronUp } from 'lucide-react'
import { db } from '../lib/supabase'

// Helper to format time (HH:MM to 9:00am format)
const formatTime = (timeStr) => {
  if (!timeStr) return ''
  const [hours, minutes] = timeStr.split(':')
  const h = parseInt(hours)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return `${h12}:${minutes}${ampm}`
}

export default function TMClientSignature({
  ticketId,
  ticketSummary, // { workDate, workerCount, totalHours }
  ticketDetails, // { projectName, cePcoNumber, notes, workers, items, photos }
  lang = 'en',
  onSave,
  onClose,
  onShowToast
}) {
  const canvasRef = useRef(null)
  const [signerName, setSignerName] = useState('')
  const [signerTitle, setSignerTitle] = useState('')
  const [signerCompany, setSignerCompany] = useState('')
  const [hasSignature, setHasSignature] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Translations
  const t = {
    en: {
      title: 'Client Signature',
      subtitle: 'Sign to verify the work performed',
      signerName: 'Your Name',
      signerNamePlaceholder: 'Full name',
      signerTitle: 'Title',
      signerTitlePlaceholder: 'e.g. Project Manager',
      signerCompany: 'Company',
      signerCompanyPlaceholder: 'Company name',
      signBelow: 'Sign below',
      signHere: 'Sign here',
      clear: 'Clear',
      cancel: 'Cancel',
      saveSignature: 'Submit Signature',
      saving: 'Saving...',
      workDate: 'Work Date',
      workers: 'Workers',
      hours: 'Total Hours',
      project: 'Project',
      description: 'Description',
      workerDetails: 'Worker Details',
      name: 'Name',
      role: 'Role',
      time: 'Time',
      regHrs: 'Reg Hrs',
      ot: 'OT',
      materialsEquipment: 'Materials & Equipment',
      item: 'Item',
      qty: 'Qty',
      unit: 'Unit',
      photos: 'Photos',
      ticketDetails: 'Ticket Details',
      showDetails: 'Show Full Details',
      hideDetails: 'Hide Details',
      certification: 'By signing, I acknowledge that the work described in this T&M ticket was performed as documented.',
      nameRequired: 'Please enter your name',
      signatureRequired: 'Please sign above',
      signatureSaved: 'Signature saved successfully',
      signatureError: 'Error saving signature'
    },
    es: {
      title: 'Firma del Cliente',
      subtitle: 'Firme para verificar el trabajo realizado',
      signerName: 'Su Nombre',
      signerNamePlaceholder: 'Nombre completo',
      signerTitle: 'Titulo',
      signerTitlePlaceholder: 'ej. Gerente de Proyecto',
      signerCompany: 'Empresa',
      signerCompanyPlaceholder: 'Nombre de la empresa',
      signBelow: 'Firme abajo',
      signHere: 'Firme aqui',
      clear: 'Borrar',
      cancel: 'Cancelar',
      saveSignature: 'Enviar Firma',
      saving: 'Guardando...',
      workDate: 'Fecha',
      workers: 'Trabajadores',
      hours: 'Horas Total',
      project: 'Proyecto',
      description: 'Descripcion',
      workerDetails: 'Detalle de Trabajadores',
      name: 'Nombre',
      role: 'Rol',
      time: 'Hora',
      regHrs: 'Hrs Reg',
      ot: 'HE',
      materialsEquipment: 'Materiales y Equipo',
      item: 'Articulo',
      qty: 'Cant',
      unit: 'Unidad',
      photos: 'Fotos',
      ticketDetails: 'Detalles del Ticket',
      showDetails: 'Mostrar Detalles Completos',
      hideDetails: 'Ocultar Detalles',
      certification: 'Al firmar, reconozco que el trabajo descrito en este ticket T&M fue realizado como se documenta.',
      nameRequired: 'Por favor ingrese su nombre',
      signatureRequired: 'Por favor firme arriba',
      signatureSaved: 'Firma guardada exitosamente',
      signatureError: 'Error al guardar la firma'
    }
  }

  const text = t[lang] || t.en

  // Get canvas context
  const getContext = () => {
    const canvas = canvasRef.current
    if (!canvas) return null
    return canvas.getContext('2d')
  }

  // Get position relative to canvas
  const getPosition = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    const clientX = e.touches?.length ? e.touches[0].clientX : e.clientX
    const clientY = e.touches?.length ? e.touches[0].clientY : e.clientY

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    }
  }

  // Start drawing
  const startDrawing = (e) => {
    e.preventDefault()
    const ctx = getContext()
    if (!ctx) return

    const { x, y } = getPosition(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    setIsDrawing(true)
    setHasSignature(true)
  }

  // Continue drawing
  const draw = (e) => {
    if (!isDrawing) return
    e.preventDefault()

    const ctx = getContext()
    if (!ctx) return

    const { x, y } = getPosition(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  // Stop drawing
  const stopDrawing = () => {
    setIsDrawing(false)
  }

  // Clear signature
  const clearSignature = () => {
    const canvas = canvasRef.current
    const ctx = getContext()
    if (!canvas || !ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  // Initialize canvas
  const initCanvas = (canvas) => {
    if (!canvas) return
    canvasRef.current = canvas

    const ctx = canvas.getContext('2d')
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }

  // Save signature
  const handleSave = async () => {
    if (!signerName.trim()) {
      onShowToast?.(text.nameRequired, 'error')
      return
    }

    if (!hasSignature) {
      onShowToast?.(text.signatureRequired, 'error')
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    setSaving(true)
    try {
      // Get signature as base64 PNG
      const signatureData = canvas.toDataURL('image/png')

      // Save client signature to T&M ticket
      await db.saveTMClientSignature(ticketId, {
        signature: signatureData,
        signerName: signerName.trim(),
        signerTitle: signerTitle.trim() || null,
        signerCompany: signerCompany.trim() || null,
        signedAt: new Date().toISOString()
      })

      onShowToast?.(text.signatureSaved, 'success')
      onSave?.({
        signerName: signerName.trim(),
        signerTitle: signerTitle.trim(),
        signerCompany: signerCompany.trim()
      })
    } catch (error) {
      console.error('Error saving signature:', error)
      onShowToast?.(text.signatureError, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-client-signature-modal" onClick={e => e.stopPropagation()}>
        <div className="tm-sig-header">
          <div>
            <h2>{text.title}</h2>
            <p className="tm-sig-subtitle">{text.subtitle}</p>
          </div>
          <button className="tm-sig-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="tm-sig-body">
          {/* Ticket Summary Header */}
          {ticketSummary && (
            <div className="tm-sig-summary">
              <div className="tm-sig-summary-item">
                <span className="tm-sig-summary-label">{text.workDate}</span>
                <span className="tm-sig-summary-value">
                  {new Date(ticketSummary.workDate).toLocaleDateString()}
                </span>
              </div>
              <div className="tm-sig-summary-item">
                <span className="tm-sig-summary-label">{text.workers}</span>
                <span className="tm-sig-summary-value">{ticketSummary.workerCount}</span>
              </div>
              <div className="tm-sig-summary-item">
                <span className="tm-sig-summary-label">{text.hours}</span>
                <span className="tm-sig-summary-value">{ticketSummary.totalHours}</span>
              </div>
            </div>
          )}

          {/* Full Ticket Details */}
          {ticketDetails && (
            <div className="tm-sig-details">
              {/* Project & CE/PCO */}
              {ticketDetails.projectName && (
                <div className="tm-sig-detail-row">
                  <span className="tm-sig-detail-label">{text.project}</span>
                  <span className="tm-sig-detail-value">{ticketDetails.projectName}</span>
                </div>
              )}
              {ticketDetails.cePcoNumber && (
                <div className="tm-sig-detail-row">
                  <span className="tm-sig-detail-label">CE/PCO</span>
                  <span className="tm-sig-detail-value">{ticketDetails.cePcoNumber}</span>
                </div>
              )}

              {/* Description / Notes */}
              {ticketDetails.notes && (
                <div className="tm-sig-detail-row tm-sig-detail-full">
                  <span className="tm-sig-detail-label"><FileText size={14} /> {text.description}</span>
                  <span className="tm-sig-detail-value tm-sig-notes">{ticketDetails.notes}</span>
                </div>
              )}

              {/* Workers Table */}
              {ticketDetails.workers?.length > 0 && (
                <div className="tm-sig-detail-section">
                  <h4 className="tm-sig-section-title"><HardHat size={15} /> {text.workerDetails}</h4>
                  <table className="tm-sig-table">
                    <thead>
                      <tr>
                        <th>{text.name}</th>
                        <th>{text.role}</th>
                        <th>{text.time}</th>
                        <th>{text.regHrs}</th>
                        <th>{text.ot}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ticketDetails.workers.map((w, idx) => (
                        <tr key={idx}>
                          <td>{w.name}</td>
                          <td>{w.role || '-'}</td>
                          <td>
                            {w.time_started && w.time_ended
                              ? `${formatTime(w.time_started)}-${formatTime(w.time_ended)}`
                              : '-'}
                          </td>
                          <td>{w.hours || 0}</td>
                          <td>{w.overtime_hours || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Materials & Equipment Table */}
              {ticketDetails.items?.length > 0 && (
                <div className="tm-sig-detail-section">
                  <h4 className="tm-sig-section-title"><Wrench size={15} /> {text.materialsEquipment}</h4>
                  <table className="tm-sig-table">
                    <thead>
                      <tr>
                        <th>{text.item}</th>
                        <th>{text.qty}</th>
                        <th>{text.unit}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ticketDetails.items.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.name}</td>
                          <td>{item.quantity}</td>
                          <td>{item.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Photos */}
              {ticketDetails.photos?.length > 0 && (
                <div className="tm-sig-detail-section">
                  <h4 className="tm-sig-section-title"><Camera size={15} /> {text.photos} ({ticketDetails.photos.length})</h4>
                  <div className="tm-sig-photo-grid">
                    {ticketDetails.photos.map((photo, idx) => (
                      <div key={idx} className="tm-sig-photo-thumb">
                        <img
                          src={typeof photo === 'string' ? photo : (photo.previewUrl || photo.url)}
                          alt={`Photo ${idx + 1}`}
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Signer Info */}
          <div className="tm-sig-fields">
            <div className="tm-sig-field">
              <label>
                <User size={14} />
                {text.signerName} *
              </label>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder={text.signerNamePlaceholder}
              />
            </div>

            <div className="tm-sig-field-row">
              <div className="tm-sig-field">
                <label>
                  <Briefcase size={14} />
                  {text.signerTitle}
                </label>
                <input
                  type="text"
                  value={signerTitle}
                  onChange={(e) => setSignerTitle(e.target.value)}
                  placeholder={text.signerTitlePlaceholder}
                />
              </div>

              <div className="tm-sig-field">
                <label>
                  <Building size={14} />
                  {text.signerCompany}
                </label>
                <input
                  type="text"
                  value={signerCompany}
                  onChange={(e) => setSignerCompany(e.target.value)}
                  placeholder={text.signerCompanyPlaceholder}
                />
              </div>
            </div>
          </div>

          {/* Signature Area */}
          <div className="tm-sig-area">
            <div className="tm-sig-label">
              <Pen size={14} />
              <span>{text.signBelow}</span>
            </div>

            <div className="tm-sig-canvas-container">
              <canvas
                ref={initCanvas}
                width={500}
                height={180}
                className="tm-sig-canvas"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />

              {!hasSignature && (
                <div className="tm-sig-placeholder">
                  {text.signHere}
                </div>
              )}
            </div>

            <button
              className="tm-sig-clear"
              onClick={clearSignature}
              disabled={!hasSignature}
            >
              <RotateCcw size={14} /> {text.clear}
            </button>
          </div>

          {/* Certification */}
          <p className="tm-sig-certification">
            {text.certification}
          </p>
        </div>

        <div className="tm-sig-footer">
          <button className="tm-sig-btn secondary" onClick={onClose} disabled={saving}>
            {text.cancel}
          </button>
          <button
            className="tm-sig-btn primary"
            onClick={handleSave}
            disabled={!hasSignature || !signerName.trim() || saving}
          >
            {saving ? (
              text.saving
            ) : (
              <>
                <Check size={16} /> {text.saveSignature}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
