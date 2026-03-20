import { ArrowRight, HardHat, Monitor, Zap } from 'lucide-react'

export default function HeroSection({ onGetStarted, onScrollToFeatures, onQuickAccess }) {
  return (
    <section className="lp-hero">
      <div className="lp-badge">
        <Zap size={14} />
        Real-Time Project Intelligence for Construction
      </div>

      <h1 className="lp-hero-title">
        <span className="lp-gradient-text">FieldSync</span><br />
        Every Update. Every Dollar. Accounted For.
      </h1>

      <p className="lp-hero-subtitle">
        Project managers lose hours chasing field updates. Owners approve draws without verified progress. Superintendents document work that never makes it to the office.
        FieldSync connects the entire project lifecycle — from task completion in the field to draw requests on your desk — so nothing falls through the cracks.
        Real-time visibility for owners. Verified progress for project managers. A tool that actually works for superintendents.
        One platform. One source of truth. Every job.
      </p>

      <div className="lp-hero-actions">
        <button className="lp-btn-primary" onClick={onGetStarted}>
          Start Free Today
          <ArrowRight size={18} />
        </button>
        <button className="lp-btn-ghost" onClick={onScrollToFeatures}>
          See How It Works
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
