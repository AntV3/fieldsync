import { RefreshCw, Smartphone, ToggleRight, DollarSign, WifiOff, Shield } from 'lucide-react'

const FEATURES = [
  {
    icon: RefreshCw,
    title: 'Real-Time Sync',
    desc: 'The second a foreman taps "Done," your office knows. No calls, no texts, no waiting until end-of-day. You see it live.',
  },
  {
    icon: Smartphone,
    title: 'One-Tap Updates',
    desc: 'Your crews won\'t need training, manuals, or IT support. One tap. That\'s it. If they can use a phone, they can use FieldSync.',
  },
  {
    icon: ToggleRight,
    title: 'Binary Progress',
    desc: 'Working or Done. No subjective percentages that mean nothing in a billing dispute. Every status is clear, timestamped, and defensible.',
  },
  {
    icon: DollarSign,
    title: 'Defensible Billing',
    desc: 'Every draw request backed by real field data, not estimates. Stop leaving money on the table and eliminate payment disputes before they start.',
  },
  {
    icon: WifiOff,
    title: 'Offline-First',
    desc: 'No signal on the jobsite? No problem. FieldSync works without internet and syncs automatically the moment connectivity returns.',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    desc: 'Multi-factor authentication, role-based access, and session-controlled field entry. Your data is locked down — without slowing anyone down.',
  },
]

export default function FeatureGrid() {
  return (
    <section className="lp-features" id="features">
      <div className="lp-features-label">Why Teams Switch to FieldSync</div>
      <h2 className="lp-features-heading">Because spreadsheets and phone calls don't scale</h2>
      <p className="lp-features-desc">
        Every feature exists because we've seen what breaks on real jobsites.
        This isn't a generic tool with a construction skin — it's built from the ground up
        for how your crews actually work.
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
