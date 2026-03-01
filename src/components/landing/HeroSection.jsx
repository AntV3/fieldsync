import { ArrowRight, HardHat, Monitor, Zap } from 'lucide-react'

export default function HeroSection({ onGetStarted, onScrollToFeatures, onQuickAccess }) {
  return (
    <section className="lp-hero">
      <div className="lp-badge">
        <Zap size={14} />
        The Bridge Between Field and Office
      </div>

      <h1 className="lp-hero-title">
        Your Field and Office<br />
        Finally <span className="lp-gradient-text">Speak the Same Language</span>.
      </h1>

      <p className="lp-hero-subtitle">
        Right now your crews know things your office won't learn until tomorrow —
        or next week. FieldSync bridges that gap instantly. One tap from the field,
        and your office sees it live. No calls. No chasing. No surprises.
      </p>

      <div className="lp-hero-actions">
        <button className="lp-btn-primary" onClick={onGetStarted}>
          Start Free Today
          <ArrowRight size={18} />
        </button>
        <button className="lp-btn-ghost" onClick={onScrollToFeatures}>
          See What You're Missing
        </button>
      </div>

      <div className="lp-quick-access">
        <button className="lp-quick-link" onClick={() => onQuickAccess('foreman')}>
          <HardHat size={16} />
          I'm a Field Crew Member
        </button>
        <div className="lp-quick-divider" />
        <button className="lp-quick-link" onClick={() => onQuickAccess('office')}>
          <Monitor size={16} />
          I'm Office / Management
        </button>
      </div>

      <div className="lp-trust-badges">
        <span className="lp-trust-badge">Works Offline</span>
        <span className="lp-trust-dot" />
        <span className="lp-trust-badge">Zero Training Required</span>
        <span className="lp-trust-dot" />
        <span className="lp-trust-badge">Enterprise-Grade Security</span>
      </div>
    </section>
  )
}
