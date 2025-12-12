import { useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'

export default function SignaturePad({ onSave, onCancel, signerName: initialName = '' }) {
  const sigPadRef = useRef(null)
  const [signerName, setSignerName] = useState(initialName)
  const [isEmpty, setIsEmpty] = useState(true)

  const handleClear = () => {
    sigPadRef.current?.clear()
    setIsEmpty(true)
  }

  const handleSave = () => {
    if (!signerName.trim()) {
      alert('Please enter your name')
      return
    }

    if (isEmpty || sigPadRef.current?.isEmpty()) {
      alert('Please provide a signature')
      return
    }

    // Get signature as base64 data URL
    const signatureData = sigPadRef.current.toDataURL()

    onSave({
      signatureData,
      signerName: signerName.trim(),
      signatureDate: new Date().toISOString()
    })
  }

  const handleStrokeEnd = () => {
    setIsEmpty(sigPadRef.current?.isEmpty() || false)
  }

  return (
    <div className="signature-pad-modal">
      <div className="signature-pad-overlay" onClick={onCancel}></div>
      <div className="signature-pad-container">
        <div className="signature-pad-header">
          <h3>Sign T&M Ticket</h3>
          <button className="close-btn" onClick={onCancel}>×</button>
        </div>

        <div className="signature-pad-body">
          <div className="form-group">
            <label>Your Name</label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Enter your full name"
              autoFocus
            />
          </div>

          <div className="signature-canvas-wrapper">
            <label>Signature</label>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              Sign in the box below
            </p>
            <div className="signature-canvas-container">
              <SignatureCanvas
                ref={sigPadRef}
                canvasProps={{
                  className: 'signature-canvas',
                  width: 500,
                  height: 200
                }}
                onEnd={handleStrokeEnd}
              />
            </div>
          </div>

          <div className="signature-pad-actions">
            <button className="btn btn-secondary" onClick={handleClear}>
              Clear
            </button>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-secondary" onClick={onCancel}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave}>
                Save Signature
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
