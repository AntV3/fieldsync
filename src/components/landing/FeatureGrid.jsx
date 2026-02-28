import { RefreshCw, Smartphone, ToggleRight, DollarSign, WifiOff, Shield } from 'lucide-react'

const FEATURES = [
  {
    icon: RefreshCw,
    title: 'Real-Time Sync',
    desc: 'Field updates hit the office dashboard instantly. No waiting, no chasing down status.',
  },
  {
    icon: Smartphone,
    title: 'One-Tap Updates',
    desc: 'Foremen update progress with a single tap. Zero training required — it just works.',
  },
  {
    icon: ToggleRight,
    title: 'Binary Progress',
    desc: 'Working or Done. No percentages, no ambiguity. Defensible status every stakeholder trusts.',
  },
  {
    icon: DollarSign,
    title: 'Defensible Billing',
    desc: 'Progress tied directly to contract value. Every draw request backed by real data.',
  },
  {
    icon: WifiOff,
    title: 'Offline-First',
    desc: 'Works without signal. Crews keep working, data syncs automatically when connection returns.',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    desc: 'MFA authentication, role-based access control, and session-based field authorization.',
  },
]

export default function FeatureGrid() {
  return (
    <section className="lp-features" id="features">
      <div className="lp-features-label">Why FieldSync</div>
      <h2 className="lp-features-heading">Built for how construction actually works</h2>
      <p className="lp-features-desc">
        Every feature designed around the reality of field work — not a
        generic project tool retrofitted for construction.
      </p>

      <div className="lp-features-grid">
        {FEATURES.map((f, i) => (
          <div className="lp-feature-card lp-animate" key={i} style={{ transitionDelay: `${i * 0.08}s` }}>
            <div className="lp-feature-icon">
              <f.icon size={20} />
            </div>
            <h3 className="lp-feature-title">{f.title}</h3>
            <p className="lp-feature-desc">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
