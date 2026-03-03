import { RefreshCw, Smartphone, ToggleRight, DollarSign, WifiOff, Shield } from 'lucide-react'

const FEATURES = [
  {
    icon: RefreshCw,
    title: 'Real-Time Sync',
    desc: 'The second a foreman taps Done, your office knows. Not at end of shift. Not after three missed calls. The moment it happens — it\'s on your screen.',
  },
  {
    icon: Smartphone,
    title: 'One-Tap Updates',
    desc: 'No training. No manual. No IT. Your crew already knows how to use their phone — that\'s the whole qualification. One tap and it\'s logged.',
  },
  {
    icon: ToggleRight,
    title: 'Binary Progress',
    desc: 'Working or Done. That\'s it. No "about 70%" that means nothing when a GC demands proof. Every status is timestamped, geotagged, and airtight.',
  },
  {
    icon: DollarSign,
    title: 'Defensible Billing',
    desc: 'Stop submitting draws on faith. Every line item backed by real field data with a timestamp. Disputes don\'t just lose — they never get started.',
  },
  {
    icon: WifiOff,
    title: 'Offline-First',
    desc: 'No cell signal in the basement or the back forty? Crews keep working. The moment connectivity returns, every update syncs automatically. The gap never opens.',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    desc: 'MFA, role-based access, and session-controlled field entry — built for projects worth protecting. Fort Knox security that your crew will never notice.',
  },
]

export default function FeatureGrid() {
  return (
    <section className="lp-features" id="features">
      <div className="lp-features-label">Why Teams Switch to FieldSync</div>
      <h2 className="lp-features-heading">Everything that breaks between field and office — fixed</h2>
      <p className="lp-features-desc">
        Phone calls get missed. Texts get buried. Spreadsheets go stale before lunch.
        That communication breakdown between your crews and your back office isn't just frustrating — it has a price tag on every single job.
        Every feature in FieldSync exists to eliminate that cost. Permanently.
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
