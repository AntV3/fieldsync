import { useCallback, useState } from 'react'
import {
  KeyRound,
  Smartphone,
  Zap,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Copy,
  Check,
  X,
  ClipboardList,
  Users,
  FileText,
} from 'lucide-react'
import { completeProjectTour } from './onboardingState'

/**
 * ProjectOnboardingTour — 4-step guided setup shown right after a project
 * is created (and replayable from Project Info > Settings). Walks the
 * office user through the foreman PIN → field submissions → real-time
 * approvals loop that is the heart of FieldSync.
 */
export default function ProjectOnboardingTour({ pin, projectName, onClose, onShowToast }) {
  const [step, setStep] = useState(0)
  const [copied, setCopied] = useState(false)

  const handleCopyPin = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(String(pin || ''))
      setCopied(true)
      onShowToast?.('PIN copied', 'success')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      onShowToast?.('Copy failed — please copy manually', 'error')
    }
  }, [pin, onShowToast])

  const handleClose = useCallback(() => {
    completeProjectTour()
    onClose?.()
  }, [onClose])

  const steps = [
    {
      icon: <KeyRound size={40} strokeWidth={1.5} />,
      title: 'Your project is ready',
      content: (
        <>
          <p className="ob-subtitle">
            {projectName ? <><strong>{projectName}</strong> is set up. </> : null}
            Here&apos;s your foreman PIN. Share it with your field crew.
          </p>
          <div className="pt-pin-card">
            <span className="pt-pin-label">Foreman PIN</span>
            <div className="pt-pin-value">
              <code>{pin || '----'}</code>
              <button className="ob-copy-btn" onClick={handleCopyPin} aria-label="Copy foreman PIN">
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>
        </>
      ),
    },
    {
      icon: <Smartphone size={40} strokeWidth={1.5} />,
      title: 'The field runs on this PIN',
      content: (
        <>
          <p className="ob-subtitle">
            When your foreman enters this PIN on their phone, they can check in crew,
            submit T&amp;M tickets, and file reports.
          </p>
          <div className="pt-capability-list">
            <div className="pt-capability"><Users size={16} /><span>Check in crew</span></div>
            <div className="pt-capability"><ClipboardList size={16} /><span>Submit T&amp;M tickets</span></div>
            <div className="pt-capability"><FileText size={16} /><span>File daily reports</span></div>
          </div>
        </>
      ),
    },
    {
      icon: <Zap size={40} strokeWidth={1.5} />,
      title: 'Everything lands here, live',
      content: (
        <p className="ob-subtitle">
          Every submission appears here in real time. Approve T&amp;M tickets and CORs
          to move them to billing.
        </p>
      ),
    },
    {
      icon: <CheckCircle2 size={40} strokeWidth={1.5} />,
      title: "That's it",
      content: (
        <p className="ob-subtitle">
          Field does the work, office sees it instantly.
        </p>
      ),
    },
  ]

  const isFirst = step === 0
  const isLast = step === steps.length - 1

  return (
    <div className="ob-overlay" role="dialog" aria-modal="true" aria-label="Project setup guide">
      <div className="ob-wizard pt-tour">
        <button className="ob-close" onClick={handleClose} aria-label="Close guide">
          <X size={18} />
        </button>

        <div className="ob-progress">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`ob-progress-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
            />
          ))}
        </div>

        <div className="ob-body">
          <div className="ob-step pt-step">
            <div className="ob-welcome-icon pt-step-icon">{steps[step].icon}</div>
            <h2>{steps[step].title}</h2>
            {steps[step].content}
          </div>
        </div>

        <div className="ob-actions">
          {isFirst ? (
            <button className="ob-btn-skip" onClick={handleClose}>
              Skip
            </button>
          ) : (
            <button className="ob-btn-back" onClick={() => setStep(s => s - 1)}>
              <ChevronLeft size={18} /> Back
            </button>
          )}

          {isLast ? (
            <button className="ob-btn-primary" onClick={handleClose}>
              Got it <Check size={18} />
            </button>
          ) : (
            <button className="ob-btn-primary" onClick={() => setStep(s => s + 1)}>
              Next <ChevronRight size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
