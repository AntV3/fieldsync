import { ArrowRight } from 'lucide-react'

export default function SignInCTA({ onGetStarted, onSignIn }) {
  return (
    <section className="lp-cta lp-animate">
      <div className="lp-cta-content">
        <h2 className="lp-cta-heading">How much is lagging data costing you?</h2>
        <p className="lp-cta-desc">
          Decisions made on yesterday's numbers. Change orders stuck in a week-long
          approval loop. Payments delayed because the paperwork hasn't caught up.
          FieldSync gives you real-time field data so you act on what's happening
          now — not what happened last week.
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
