import { ArrowRight } from 'lucide-react'

export default function SignInCTA({ onGetStarted, onSignIn }) {
  return (
    <section className="lp-cta lp-animate">
      <div className="lp-cta-content">
        <h2 className="lp-cta-heading">Ready to sync your field?</h2>
        <p className="lp-cta-desc">
          Start tracking progress in minutes. Set up your first project
          and see your field data flow to the office in real time.
        </p>
        <div className="lp-cta-actions">
          <button className="lp-btn-primary" onClick={onGetStarted}>
            Get Started
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
