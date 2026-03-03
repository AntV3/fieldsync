import { ArrowRight } from 'lucide-react'

export default function SignInCTA({ onGetStarted, onSignIn }) {
  return (
    <section className="lp-cta lp-animate">
      <div className="lp-cta-content">
        <h2 className="lp-cta-heading">Your field and your office aren't on the same page. What is that costing you?</h2>
        <p className="lp-cta-desc">
          Count the draws you've fought for. The change orders that died because no one documented them in the field.
          The hours burned chasing updates that should have been automatic.
          That's not bad luck — that's the gap between your field and your office. And it's open on every job you're running right now.
          FieldSync sets up in minutes. It pays for itself on the first draw you don't have to argue about.
          Get on the same page today.
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
