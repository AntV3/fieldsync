import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2,
  ClipboardList,
  Users,
  Share2,
  ChevronRight,
  ChevronLeft,
  Copy,
  Check,
  Smartphone,
  Monitor,
  ArrowRight,
} from 'lucide-react'
import { completeOnboarding } from './onboardingState'

/**
 * OnboardingWizard — shown to new company owners after their first login
 * when they have 0 projects. Guides them through understanding FieldSync
 * and gets them to create their first project.
 */
export default function OnboardingWizard({ company, user, onShowToast, onCreateProject, onDismiss }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [copiedCode, setCopiedCode] = useState(null)

  const handleCopy = useCallback(async (text, label) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedCode(label)
      onShowToast?.(`${label} copied`, 'success')
      setTimeout(() => setCopiedCode(null), 2000)
    } catch {
      onShowToast?.('Copy failed — please copy manually', 'error')
    }
  }, [onShowToast])

  const handleCreateProject = useCallback(() => {
    completeOnboarding()
    if (onCreateProject) {
      onCreateProject()
    } else {
      navigate('/projects/new')
    }
  }, [navigate, onCreateProject])

  const handleSkip = useCallback(() => {
    completeOnboarding()
    onDismiss?.()
  }, [onDismiss])

  const steps = [
    // Step 0: Welcome
    {
      content: (
        <div className="ob-step ob-welcome">
          <div className="ob-welcome-icon">
            <Building2 size={48} strokeWidth={1.5} />
          </div>
          <h2>Welcome to FieldSync{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</h2>
          <p className="ob-subtitle">
            Your company <strong>{company?.name}</strong> is set up and ready.
            Let&apos;s walk through how FieldSync works so you can hit the ground running.
          </p>
          <div className="ob-time-estimate">Takes about 2 minutes</div>
        </div>
      ),
    },
    // Step 1: How it works
    {
      content: (
        <div className="ob-step ob-how-it-works">
          <h2>How FieldSync Works</h2>
          <p className="ob-subtitle">Two interfaces, one system. Real-time sync between field and office.</p>
          <div className="ob-flow">
            <div className="ob-flow-card">
              <div className="ob-flow-icon ob-flow-field">
                <Smartphone size={28} />
              </div>
              <h3>Field Crews</h3>
              <p>Foremen open FieldSync on their phone, enter the company code + project PIN, and start marking areas complete with one tap. No login required.</p>
            </div>
            <div className="ob-flow-arrow">
              <ArrowRight size={24} />
            </div>
            <div className="ob-flow-card">
              <div className="ob-flow-icon ob-flow-office">
                <Monitor size={28} />
              </div>
              <h3>Office Dashboard</h3>
              <p>You see progress update in real time. Track costs, generate billing, manage change orders, and export reports — all from here.</p>
            </div>
          </div>
        </div>
      ),
    },
    // Step 2: Your codes
    {
      content: (
        <div className="ob-step ob-codes">
          <h2>Your Access Codes</h2>
          <p className="ob-subtitle">Share these with your team to get connected.</p>
          <div className="ob-code-cards">
            <div className="ob-code-card">
              <div className="ob-code-label">
                <Users size={18} />
                Company Code
              </div>
              <p className="ob-code-desc">Share with everyone. Field crews use this + a project PIN to access their project.</p>
              <div className="ob-code-value">
                <code>{company?.code || '------'}</code>
                <button
                  className="ob-copy-btn"
                  onClick={() => handleCopy(company?.code, 'Company Code')}
                  aria-label="Copy company code"
                >
                  {copiedCode === 'Company Code' ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>
            <div className="ob-code-card">
              <div className="ob-code-label">
                <Share2 size={18} />
                Office Code
              </div>
              <p className="ob-code-desc">Share only with office staff who need dashboard access. They&apos;ll need your approval to join.</p>
              <div className="ob-code-value">
                <code>{company?.office_code || '------'}</code>
                <button
                  className="ob-copy-btn"
                  onClick={() => handleCopy(company?.office_code, 'Office Code')}
                  aria-label="Copy office code"
                >
                  {copiedCode === 'Office Code' ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>
          </div>
          <p className="ob-code-note">You can always find these in your company settings later.</p>
        </div>
      ),
    },
    // Step 3: Create first project
    {
      content: (
        <div className="ob-step ob-create">
          <div className="ob-create-icon">
            <ClipboardList size={48} strokeWidth={1.5} />
          </div>
          <h2>Create Your First Project</h2>
          <p className="ob-subtitle">
            Projects are the heart of FieldSync. You&apos;ll define the work areas,
            set a contract value, and generate a PIN for field crews to access it.
          </p>
          <div className="ob-checklist">
            <div className="ob-checklist-item">
              <Check size={16} />
              <span>Account created</span>
            </div>
            <div className="ob-checklist-item">
              <Check size={16} />
              <span>Company codes ready</span>
            </div>
            <div className="ob-checklist-item ob-checklist-next">
              <ChevronRight size={16} />
              <span>Create a project</span>
            </div>
          </div>
        </div>
      ),
    },
  ]

  const isFirst = step === 0
  const isLast = step === steps.length - 1

  return (
    <div className="ob-overlay">
      <div className="ob-wizard">
        {/* Step indicator */}
        <div className="ob-progress">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`ob-progress-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="ob-body">
          {steps[step].content}
        </div>

        {/* Actions */}
        <div className="ob-actions">
          {isFirst ? (
            <button className="ob-btn-skip" onClick={handleSkip}>
              Skip for now
            </button>
          ) : (
            <button className="ob-btn-back" onClick={() => setStep(s => s - 1)}>
              <ChevronLeft size={18} /> Back
            </button>
          )}

          {isLast ? (
            <button className="ob-btn-primary" onClick={handleCreateProject}>
              Create Project <ChevronRight size={18} />
            </button>
          ) : (
            <button className="ob-btn-primary" onClick={() => setStep(s => s + 1)}>
              Continue <ChevronRight size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
