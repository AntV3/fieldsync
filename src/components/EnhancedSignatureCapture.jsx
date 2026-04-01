import { useState, useRef, useEffect } from 'react'
import { X, Check, RotateCcw, Pen, Shield } from 'lucide-react'

export default function EnhancedSignatureCapture({
  onSave,
  onClose,
  slot = 1, // 1 = GC, 2 = Client
  documentType = 'cor', // 'cor' or 'tm_ticket'
  documentTitle = '',
  signerName: initialName = '',
  signerTitle: initialTitle = '',
  signerCompany: initialCompany = ''
}) {
  const canvasRef = useRef(null)
  const [signerName, setSignerName] = useState(initialName)
  const [signerTitle, setSignerTitle] = useState(initialTitle)
  const [signerCompany, setSignerCompany] = useState(initialCompany)
  const [hasSignature, setHasSignature] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)

  const slotLabel = slot === 1 ? 'GC Authorization' : 'Client Authorization'
  const docTypeLabel = documentType === 'cor' ? 'Change Order Request' : 'Time & Material Ticket'

  // Lock body scroll when modal is open (prevents background scrolling on mobile)
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    const originalPosition = document.body.style.position
    const originalTop = document.body.style.top
    const scrollY = window.scrollY

    // Lock the body
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'

    return () => {
      // Restore original styles
      document.body.style.overflow = originalOverflow
      document.body.style.position = originalPosition
      document.body.style.top = originalTop
      document.body.style.width = ''
      // Restore scroll position
      window.scrollTo(0, scrollY)
    }
  }, [])

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

    // Handle both mouse and touch events (with bounds checking)
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

  // Check if form is valid
  const isValid = hasSignature && signerName.trim() && acknowledged

  // Save signature
  const handleSave = () => {
    if (!isValid) return

    const canvas = canvasRef.current
    if (!canvas) return

    // Get signature as base64 PNG
    const signatureData = canvas.toDataURL('image/png')

    onSave({
      signature: signatureData,
      signerName: signerName.trim(),
      signerTitle: signerTitle.trim() || null,
      signerCompany: signerCompany.trim() || null,
      signedAt: new Date().toISOString()
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="signature-title">
      <div className="modal-content signature-modal enhanced" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="signature-header-info">
            <h2 id="signature-title">{slotLabel}</h2>
            {documentTitle && (
              <span className="signature-doc-ref">{documentTitle}</span>
            )}
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close signature modal">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body signature-body">
          {/* Slot indicator badge */}
          <div className="signature-slot-badge">
            <Shield size={14} />
            <span>Signature {slot} of 2</span>
          </div>

          {/* Signer info fields */}
          <div className="signature-fields">
            <div className="form-group required">
              <label htmlFor="signer-name">Print Name</label>
              <input
                id="signer-name"
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Enter your full legal name"
                aria-required="true"
                className="input-required"
              />
            </div>

            <div className="signature-fields-row">
              <div className="form-group">
                <label htmlFor="signer-title">Title</label>
                <input
                  id="signer-title"
                  type="text"
                  value={signerTitle}
                  onChange={(e) => setSignerTitle(e.target.value)}
                  placeholder="e.g., Project Manager"
                />
              </div>

              <div className="form-group">
                <label htmlFor="signer-company">Company</label>
                <input
                  id="signer-company"
                  type="text"
                  value={signerCompany}
                  onChange={(e) => setSignerCompany(e.target.value)}
                  placeholder="e.g., ABC Construction"
                />
              </div>
            </div>
          </div>

          {/* Signature canvas */}
          <div className="signature-area">
            <div className="signature-label" id="signature-instructions">
              <Pen size={16} aria-hidden="true" />
              <span>Draw your signature below</span>
            </div>

            <div className="signature-canvas-container">
              <canvas
                ref={initCanvas}
                width={500}
                height={180}
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
                <div className="signature-placeholder">
                  Sign here
                </div>
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
          <div className="signature-acknowledgment">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              <span>
                I acknowledge that this electronic signature is legally binding and that I have
                reviewed and approve this {docTypeLabel}. I understand that my signature, name,
                and IP address will be recorded for verification purposes.
              </span>
            </label>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} aria-label="Cancel and close">
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!isValid}
            aria-label="Submit signature"
          >
            <Check size={16} aria-hidden="true" /> Submit Signature
          </button>
        </div>
      </div>
    </div>
  )
}
