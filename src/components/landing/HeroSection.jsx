import { ArrowRight, HardHat, Monitor, Zap } from 'lucide-react'

export default function HeroSection({ onGetStarted, onScrollToFeatures, onQuickAccess }) {
  return (
    <section className="lp-hero">
      <div className="lp-badge">
        <Zap size={14} />
        The Bridge Between Field and Office
      </div>

      <h1 className="lp-hero-title">
        Stop Managing with <span className="lp-gradient-text">Yesterday's Data</span>.
      </h1>

      <p className="lp-hero-subtitle">
        Most contractors run on lagging data — updates that arrive a day or a week
        after the work is done. FieldSync flips the script. Your field crews report
        progress in real time, giving your office leading indicators to make
        decisions now — not after the window has closed. Faster visibility means
        faster change order approvals, faster payments, and fewer surprises.
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
        <span className="lp-trust-badge">Real-Time Leading Data</span>
        <span className="lp-trust-dot" />
        <span className="lp-trust-badge">Enterprise-Grade Security</span>
      </div>
    </section>
  )
}
