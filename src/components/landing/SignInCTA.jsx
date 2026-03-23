import { ArrowRight } from 'lucide-react'

export default function SignInCTA({ onGetStarted, onSignIn }) {
  return (
    <section className="lp-cta lp-animate">
      <div className="lp-cta-content">
        <h2 className="lp-cta-heading">How much extra work is going undocumented right now?</h2>
        <p className="lp-cta-desc">
          Every Time and Material ticket that gets lost is work your crew did for free.
          Every Change Order without field data behind it is a dispute waiting to happen.
          FieldSync deploys in minutes, requires no training for field crews, and gives your office real-time visibility on every project.
          Start today and never lose another dollar of billable work.
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
