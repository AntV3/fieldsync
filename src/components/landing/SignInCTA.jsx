import { ArrowRight } from 'lucide-react'

export default function SignInCTA({ onGetStarted, onSignIn }) {
  return (
    <section className="lp-cta lp-animate">
      <div className="lp-cta-content">
        <h2 className="lp-cta-heading">Your field data is slipping through the cracks right now.</h2>
        <p className="lp-cta-desc">
          Every project without FieldSync is leaking unbilled work, missing
          updates, and making decisions on stale data. Set up in minutes —
          see the difference on your next draw request.
        </p>
        <div className="lp-cta-actions">
          <button className="lp-btn-primary" onClick={onGetStarted}>
            Start Free Today
            <ArrowRight size={18} />
          </button>
          <button className="lp-btn-ghost" onClick={onSignIn}>
            Sign In
          </button>
        </div>
      </div>
    </section>
  )
}
