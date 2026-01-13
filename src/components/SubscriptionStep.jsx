import { useState } from 'react'

const PLANS = [
  {
    tier: 'trial',
    name: 'Free Trial',
    price: '$0',
    period: '14 days',
    description: 'Try all features free',
    features: [
      'Up to 3 projects',
      'Up to 5 team members',
      'Basic reporting',
      'Photo documentation',
      'Daily reports'
    ],
    recommended: true
  },
  {
    tier: 'pro',
    name: 'Pro',
    price: '$99',
    period: '/month',
    description: 'For growing teams',
    features: [
      'Unlimited projects',
      'Up to 25 team members',
      'Advanced reporting',
      'T&M ticket management',
      'SOV tracking',
      'Email support'
    ],
    recommended: false
  },
  {
    tier: 'business',
    name: 'Business',
    price: '$249',
    period: '/month',
    description: 'For larger operations',
    features: [
      'Unlimited projects',
      'Unlimited team members',
      'All Pro features',
      'Custom branding',
      'API access',
      'Priority support'
    ],
    recommended: false
  }
]

export default function SubscriptionStep({ company, onSelect, onSkip, loading }) {
  const [selectedTier, setSelectedTier] = useState('trial')

  const handleContinue = () => {
    onSelect(selectedTier)
  }

  return (
    <div className="onboarding-step subscription-step">
      <h2>Choose Your Plan</h2>
      <p className="step-description">
        Start with a free trial and upgrade anytime.
      </p>

      <div className="plan-cards">
        {PLANS.map(plan => (
          <div
            key={plan.tier}
            className={`plan-card ${selectedTier === plan.tier ? 'selected' : ''} ${plan.recommended ? 'recommended' : ''}`}
            onClick={() => setSelectedTier(plan.tier)}
          >
            {plan.recommended && <div className="recommended-badge">Recommended</div>}
            <h3>{plan.name}</h3>
            <div className="plan-price">
              <span className="price">{plan.price}</span>
              <span className="period">{plan.period}</span>
            </div>
            <p className="plan-description">{plan.description}</p>
            <ul className="plan-features">
              {plan.features.map((feature, i) => (
                <li key={i}>{feature}</li>
              ))}
            </ul>
            <div className="plan-select">
              <input
                type="radio"
                name="plan"
                checked={selectedTier === plan.tier}
                onChange={() => setSelectedTier(plan.tier)}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onSkip}
          disabled={loading}
        >
          Skip for Now
        </button>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={handleContinue}
          disabled={loading}
        >
          {loading ? 'Saving...' : 'Continue'}
        </button>
      </div>

      <p className="plan-note">
        You can change your plan anytime from Settings.
        No credit card required for trial.
      </p>
    </div>
  )
}
