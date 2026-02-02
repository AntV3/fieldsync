import { useState, useRef, useEffect } from 'react'
import { X, Check, RotateCcw, Pen, Shield } from 'lucide-react'

/**
 * Unified Signature Capture Component
 *
 * Consolidates all signature implementations into one reusable component.
 * Supports simple mode (name + signature) and enhanced mode (name, title, company, acknowledgment).
 *
 * Usage:
 *   <SignatureCanvas onSave={handleSave} onClose={handleClose} />
 *   <SignatureCanvas onSave={handleSave} onClose={handleClose} enhanced title="GC Authorization" />
 */
export default function SignatureCanvas({
  onSave,
  onClose,
  // Display options
  title = 'Signature',
  enhanced = false,
  slot = null,
  documentType = null,
  documentTitle = '',
  // Pre-fill values
  signerName: initialName = '',
  signerTitle: initialTitle = '',
  signerCompany: initialCompany = '',
  // Customization
  legalText = null,
  requireAcknowledgment = false,
  canvasWidth = 500,
  canvasHeight = 180,
  lockBodyScroll = false
}) {
  const canvasRef = useRef(null)
  const [signerName, setSignerName] = useState(initialName)
  const [signerTitle, setSignerTitle] = useState(initialTitle)
  const [signerCompany, setSignerCompany] = useState(initialCompany)
  const [hasSignature, setHasSignature] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [acknowledged, setAcknowledged] = useState(!requireAcknowledgment)

  // Derive display strings
  const displayTitle = slot
    ? (slot === 1 ? 'GC Authorization' : 'Client Authorization')
    : title

  const docTypeLabel = documentType === 'cor'
    ? 'Change Order Request'
    : documentType === 'tm_ticket'
      ? 'T&M Work Order'
      : 'document'

  const defaultLegalText = `I acknowledge that this electronic signature is legally binding and that I have reviewed and approve this ${docTypeLabel}. I understand that my signature, name, and IP address will be recorded for verification purposes.`

  // Lock body scroll when modal is open (for mobile)
  useEffect(() => {
    if (!lockBodyScroll) return

    const originalOverflow = document.body.style.overflow
    const originalPosition = document.body.style.position
    const originalTop = document.body.style.top
    const scrollY = window.scrollY

    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'

    return () => {
      document.body.style.overflow = originalOverflow
      document.body.style.position = originalPosition
      document.body.style.top = originalTop
      document.body.style.width = ''
      window.scrollTo(0, scrollY)
    }
  }, [lockBodyScroll])

  const getContext = () => {
    const canvas = canvasRef.current
    if (!canvas) return null
    return canvas.getContext('2d')
  }

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

  const draw = (e) => {
    if (!isDrawing) return
    e.preventDefault()
    const ctx = getContext()
    if (!ctx) return
    const { x, y } = getPosition(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const stopDrawing = () => {
    setIsDrawing(false)
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    const ctx = getContext()
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  const initCanvas = (canvas) => {
    if (!canvas) return
    canvasRef.current = canvas
    const ctx = canvas.getContext('2d')
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }

  const isValid = hasSignature && signerName.trim() && acknowledged

  const handleSave = () => {
    if (!isValid) return
    const canvas = canvasRef.current
    if (!canvas) return

    const signatureData = canvas.toDataURL('image/png')

    const result = {
      signature: signatureData,
      signerName: signerName.trim(),
      signedAt: new Date().toISOString()
    }

    if (enhanced) {
      result.signerTitle = signerTitle.trim() || null
      result.signerCompany = signerCompany.trim() || null
    }

    onSave(result)
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="signature-title">
      <div className={`modal-content signature-modal${enhanced ? ' enhanced' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="signature-header-info">
            <h2 id="signature-title">{displayTitle}</h2>
            {documentTitle && (
              <span className="signature-doc-ref">{documentTitle}</span>
            )}
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close signature modal">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body signature-body">
          {slot && (
            <div className="signature-slot-badge">
              <Shield size={14} />
              <span>Signature {slot} of 2</span>
            </div>
          )}

          {/* Signer info fields */}
          <div className="signature-fields">
            <div className="form-group required">
              <label htmlFor="sig-name">{enhanced ? 'Print Name' : 'Signer Name *'}</label>
              <input
                id="sig-name"
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder={enhanced ? 'Enter your full legal name' : 'Enter full name'}
                aria-required="true"
                className="input-required"
              />
            </div>

            {enhanced && (
              <div className="signature-fields-row">
                <div className="form-group">
                  <label htmlFor="sig-title">Title</label>
                  <input
                    id="sig-title"
                    type="text"
                    value={signerTitle}
                    onChange={(e) => setSignerTitle(e.target.value)}
                    placeholder="e.g., Project Manager"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="sig-company">Company</label>
                  <input
                    id="sig-company"
                    type="text"
                    value={signerCompany}
                    onChange={(e) => setSignerCompany(e.target.value)}
                    placeholder="e.g., ABC Construction"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Signature canvas */}
          <div className="signature-area">
            <div className="signature-label" id="signature-instructions">
              <Pen size={16} aria-hidden="true" />
              <span>{enhanced ? 'Draw your signature below' : 'Sign below'}</span>
            </div>

            <div className="signature-canvas-container">
              <canvas
                ref={initCanvas}
                width={canvasWidth}
                height={canvasHeight}
                className="signature-canvas"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                role="img"
                aria-label="Signature drawing area. Use mouse or touch to draw your signature."
                aria-describedby="signature-instructions"
                tabIndex={0}
              />
              {!hasSignature && (
                <div className="signature-placeholder">Sign here</div>
              )}
            </div>

            <button
              className="btn btn-ghost btn-small"
              onClick={clearSignature}
              disabled={!hasSignature}
              aria-label="Clear signature"
            >
              <RotateCcw size={14} aria-hidden="true" /> Clear
            </button>
          </div>

          {/* Legal acknowledgment */}
          {requireAcknowledgment ? (
            <div className="signature-acknowledgment">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                <span>{legalText || defaultLegalText}</span>
              </label>
            </div>
          ) : (
            <p className="signature-legal" role="note">
              {legalText || `By signing above, I acknowledge that I have reviewed and approve this ${docTypeLabel}.`}
            </p>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} aria-label="Cancel and close">
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!isValid}
            aria-label={enhanced ? 'Submit signature' : 'Save signature'}
          >
            <Check size={16} aria-hidden="true" /> {enhanced ? 'Submit Signature' : 'Save Signature'}
          </button>
        </div>
      </div>
    </div>
  )
}
