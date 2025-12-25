import { useState, useRef } from 'react'
import { X, Check, RotateCcw, Pen } from 'lucide-react'

export default function SignatureCapture({ onSave, onClose, signerName: initialName = '' }) {
  const canvasRef = useRef(null)
  const [signerName, setSignerName] = useState(initialName)
  const [hasSignature, setHasSignature] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)

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

    // Handle both mouse and touch events
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
  const handleSave = () => {
    if (!hasSignature) {
      return
    }

    if (!signerName.trim()) {
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    // Get signature as base64 PNG
    const signatureData = canvas.toDataURL('image/png')

    onSave({
      signature: signatureData,
      signerName: signerName.trim(),
      signedAt: new Date().toISOString()
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="signature-title">
      <div className="modal-content signature-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="signature-title">GC Signature</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close signature modal"><X size={20} aria-hidden="true" /></button>
        </div>

        <div className="modal-body signature-body">
          <div className="form-group">
            <label htmlFor="signer-name">Signer Name *</label>
            <input
              id="signer-name"
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Enter full name"
              aria-required="true"
            />
          </div>

          <div className="signature-area">
            <div className="signature-label" id="signature-instructions">
              <Pen size={16} aria-hidden="true" />
              <span>Sign below</span>
            </div>

            <div className="signature-canvas-container">
              <canvas
                ref={initCanvas}
                width={500}
                height={200}
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

          <p className="signature-legal" role="note">
            By signing above, I acknowledge that I have reviewed and approve this Change Order Request.
          </p>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} aria-label="Cancel and close">
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!hasSignature || !signerName.trim()}
            aria-label="Save signature"
          >
            <Check size={16} aria-hidden="true" /> Save Signature
          </button>
        </div>
      </div>
    </div>
  )
}
