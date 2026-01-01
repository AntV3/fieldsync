import { useState, useRef } from 'react'
import { X, Check, RotateCcw, Pen, User, Building, Briefcase } from 'lucide-react'
import { db } from '../lib/supabase'

export default function TMClientSignature({
  ticketId,
  ticketSummary, // { workDate, workerCount, totalHours }
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

    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY

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
          {/* Ticket Summary */}
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
