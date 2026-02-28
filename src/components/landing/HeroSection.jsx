import { ArrowRight, HardHat, Monitor } from 'lucide-react'

export default function HeroSection({ onGetStarted, onScrollToFeatures, onQuickAccess }) {
  return (
    <section className="lp-hero">
      <div className="lp-badge">
        <HardHat size={14} />
        Construction Progress Tracking
      </div>

      <h1 className="lp-hero-title">
        Field to Office.<br />
        Synced in <span className="lp-gradient-text">Real Time</span>.
      </h1>

      <p className="lp-hero-subtitle">
        The construction progress platform that connects your field crews
        to the back office — with zero training, real-time sync, and
        billing tied to actual work.
      </p>

      <div className="lp-hero-actions">
        <button className="lp-btn-primary" onClick={onGetStarted}>
          Get Started
          <ArrowRight size={18} />
        </button>
        <button className="lp-btn-ghost" onClick={onScrollToFeatures}>
          See How It Works
        </button>
      </div>

      <div className="lp-quick-access">
        <button className="lp-quick-link" onClick={() => onQuickAccess('foreman')}>
          <HardHat size={16} />
          Field Crew? Enter Here
        </button>
        <div className="lp-quick-divider" />
        <button className="lp-quick-link" onClick={() => onQuickAccess('office')}>
          <Monitor size={16} />
          Office Sign In
        </button>
      </div>

      <div className="lp-trust-badges">
        <span className="lp-trust-badge">PWA Ready</span>
        <span className="lp-trust-dot" />
        <span className="lp-trust-badge">Offline-First</span>
        <span className="lp-trust-dot" />
        <span className="lp-trust-badge">MFA Secured</span>
      </div>
    </section>
  )
}
