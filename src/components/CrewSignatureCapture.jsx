import { useState, useRef, useEffect } from 'react'
import { X, Check, RotateCcw, Pen } from 'lucide-react'

export default function CrewSignatureCapture({
  workerName = '',
  onSave,
  onClose
}) {
  const canvasRef = useRef(null)
  const [printedName, setPrintedName] = useState(workerName)
  const [ssnLast4, setSsnLast4] = useState('')
  const [hasSignature, setHasSignature] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [ssnError, setSsnError] = useState('')

  // Lock body scroll when modal is open (prevents background scrolling on mobile)
  useEffect(() => {
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
  }, [])

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

  const handleSsnChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4)
    setSsnLast4(value)
    if (ssnError) setSsnError('')
  }

  const isValid = hasSignature && printedName.trim() && ssnLast4.length === 4

  const handleSave = () => {
    if (ssnLast4.length !== 4) {
      setSsnError('Enter exactly 4 digits')
      return
    }
    if (!isValid) return

    const canvas = canvasRef.current
    if (!canvas) return

    const signatureData = canvas.toDataURL('image/png')

    onSave({
      printed_name: printedName.trim(),
      ssn_last4: ssnLast4,
      signature_data: signatureData,
      signed_at: new Date().toISOString()
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="crew-signature-title">
      <div className="modal-content signature-modal crew-signature" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="crew-signature-title">Crew Sign In</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body signature-body">
          <div className="signature-fields">
            <div className="form-group required">
              <label htmlFor="crew-printed-name">Print Name</label>
              <input
                id="crew-printed-name"
                type="text"
                value={printedName}
                onChange={(e) => setPrintedName(e.target.value)}
                placeholder="Enter your full name"
                aria-required="true"
                className="input-required"
              />
            </div>

            <div className="form-group required">
              <label htmlFor="crew-ssn-last4">Last 4 of SSN</label>
              <input
                id="crew-ssn-last4"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={ssnLast4}
                onChange={handleSsnChange}
                placeholder="••••"
                aria-required="true"
                className={`input-required ssn-input${ssnError ? ' input-error' : ''}`}
                autoComplete="off"
              />
              {ssnError && <span className="field-error">{ssnError}</span>}
            </div>
          </div>

          <div className="signature-area">
            <div className="signature-label" id="crew-signature-instructions">
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
                aria-label="Signature drawing area"
                aria-describedby="crew-signature-instructions"
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
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!isValid}
          >
            <Check size={16} aria-hidden="true" /> Sign In
          </button>
        </div>
      </div>
    </div>
  )
}
