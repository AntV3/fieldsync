import { ArrowRight } from 'lucide-react'

export default function SignInCTA({ onGetStarted, onSignIn }) {
  return (
    <section className="lp-cta lp-animate">
      <div className="lp-cta-content">
        <h2 className="lp-cta-heading">How much revenue is sitting in unsubmitted draw requests right now?</h2>
        <p className="lp-cta-desc">
          Every day without verified field data is another day your billing is based on estimates.
          Another day project managers spend chasing updates instead of managing projects.
          Another day owners lack the visibility to make confident decisions.
          FieldSync deploys in minutes, requires no training for field crews, and connects your entire operation from the first update.
          Start today and submit your next draw with data behind every line item.
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
