import { ArrowRight } from 'lucide-react'

export default function SignInCTA({ onGetStarted, onSignIn }) {
  return (
    <section className="lp-cta lp-animate">
      <div className="lp-cta-content">
        <h2 className="lp-cta-heading">How much extra work is going unbilled right now?</h2>
        <p className="lp-cta-desc">
          Every change order that doesn't get documented is revenue left on the table.
          Every T&amp;M ticket that gets lost is work your crew did for free.
          FieldSync deploys in minutes, requires no training for field crews, and captures every COR and T&amp;M ticket the moment extra work happens.
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
