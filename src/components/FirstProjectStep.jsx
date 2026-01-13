import { useState } from 'react'
import Setup from './Setup'

export default function FirstProjectStep({ company, user, onComplete, onSkip, onShowToast }) {
  const [showSetup, setShowSetup] = useState(false)

  const handleProjectCreated = () => {
    onShowToast('First project created!', 'success')
    onComplete()
  }

  if (showSetup) {
    return (
      <div className="onboarding-step first-project-step setup-mode">
        <div className="setup-header">
          <button
            className="btn btn-text"
            onClick={() => setShowSetup(false)}
          >
            &larr; Back
          </button>
          <button
            className="btn btn-text skip-link"
            onClick={onSkip}
          >
            Skip for now
          </button>
        </div>
        <Setup
          company={company}
          user={user}
          onProjectCreated={handleProjectCreated}
          onShowToast={onShowToast}
        />
      </div>
    )
  }

  return (
    <div className="onboarding-step first-project-step">
      <h2>Create Your First Project</h2>
      <p className="step-description">
        Set up a project to start tracking work, crew, and progress.
      </p>

      <div className="project-options">
        <div className="project-option" onClick={() => setShowSetup(true)}>
          <div className="option-icon">+</div>
          <h3>Create a Project</h3>
          <p>Set up your first job with areas, crew access, and scheduling.</p>
        </div>
      </div>

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onSkip}
        >
          Skip for Now
        </button>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={() => setShowSetup(true)}
        >
          Create Project
        </button>
      </div>

      <p className="step-note">
        You can always create projects later from the dashboard.
      </p>
    </div>
  )
}
