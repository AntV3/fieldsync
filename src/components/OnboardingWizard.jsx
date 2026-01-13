import { useState } from 'react'
import { db } from '../lib/supabase'
import Logo from './Logo'
import CompanyBasicsStep from './CompanyBasicsStep'
import SubscriptionStep from './SubscriptionStep'
import FirstProjectStep from './FirstProjectStep'
import InviteTeamStep from './InviteTeamStep'

export default function OnboardingWizard({ user, onComplete, onShowToast, onBack }) {
  const [step, setStep] = useState(1)
  const [company, setCompany] = useState(null)
  const [loading, setLoading] = useState(false)

  // Step 1: Create company with basics
  const handleCompanyCreated = async (companyData) => {
    setLoading(true)
    try {
      // Create the company
      const newCompany = await db.createCompany({
        name: companyData.name,
        industry: companyData.industry,
        timezone: companyData.timezone,
        ownerUserId: user.id
      })

      // Create owner membership
      await db.createInitialMembership(user.id, newCompany.id)

      setCompany(newCompany)
      onShowToast('Company created!', 'success')
      setStep(2)
    } catch (error) {
      console.error('Error creating company:', error)
      onShowToast(error.message || 'Failed to create company', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Update subscription tier
  const handleSubscriptionSelected = async (tier) => {
    setLoading(true)
    try {
      const updated = await db.updateCompanySubscription(company.id, tier)
      setCompany(updated)
      setStep(3)
    } catch (error) {
      console.error('Error updating subscription:', error)
      onShowToast('Failed to update subscription', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Step 3: First project created (or skipped)
  const handleProjectComplete = () => {
    setStep(4)
  }

  // Step 4: Invites sent (or skipped)
  const handleInvitesComplete = () => {
    onComplete(company)
  }

  // Skip handlers
  const handleSkipSubscription = () => setStep(3)
  const handleSkipProject = () => setStep(4)
  const handleSkipInvites = () => onComplete(company)

  return (
    <div className="onboarding-wizard">
      <div className="onboarding-header">
        <Logo className="onboarding-logo" />
        {onBack && step === 1 && (
          <button className="onboarding-back" onClick={onBack}>
            &larr; Back
          </button>
        )}
      </div>

      <div className="onboarding-progress">
        <div className="progress-steps">
          {[1, 2, 3, 4].map(s => (
            <div
              key={s}
              className={`progress-step ${s === step ? 'active' : ''} ${s < step ? 'completed' : ''}`}
            >
              <div className="step-number">{s < step ? '✓' : s}</div>
              <div className="step-label">
                {s === 1 && 'Company'}
                {s === 2 && 'Plan'}
                {s === 3 && 'Project'}
                {s === 4 && 'Team'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="onboarding-content">
        {step === 1 && (
          <CompanyBasicsStep
            onSubmit={handleCompanyCreated}
            loading={loading}
          />
        )}

        {step === 2 && (
          <SubscriptionStep
            company={company}
            onSelect={handleSubscriptionSelected}
            onSkip={handleSkipSubscription}
            loading={loading}
          />
        )}

        {step === 3 && (
          <FirstProjectStep
            company={company}
            user={user}
            onComplete={handleProjectComplete}
            onSkip={handleSkipProject}
            onShowToast={onShowToast}
          />
        )}

        {step === 4 && (
          <InviteTeamStep
            company={company}
            user={user}
            onComplete={handleInvitesComplete}
            onSkip={handleSkipInvites}
            onShowToast={onShowToast}
          />
        )}
      </div>
    </div>
  )
}
