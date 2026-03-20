import { RefreshCw, Smartphone, ToggleRight, DollarSign, WifiOff, Shield } from 'lucide-react'

const FEATURES = [
  {
    icon: RefreshCw,
    title: 'Real-Time Sync',
    desc: 'When a task is completed in the field, your office dashboard reflects it immediately. No waiting for end-of-day calls, no reconciling outdated spreadsheets. Progress is live, verified, and visible to everyone who needs it.',
  },
  {
    icon: Smartphone,
    title: 'One-Tap Updates',
    desc: 'Field crews update task status with a single tap — no training, no learning curve. Superintendents spend less time on documentation and more time managing the work. Every update is automatically logged with a timestamp and location.',
  },
  {
    icon: ToggleRight,
    title: 'Binary Progress',
    desc: 'Tasks are either In Progress or Complete. No ambiguous percentages, no subjective estimates. When a GC or owner asks for proof of progress, every status change is timestamped, geotagged, and documented.',
  },
  {
    icon: DollarSign,
    title: 'Faster, Verified Billing',
    desc: 'Draw requests backed by real-time field data — not estimates. Every line item ties directly to verified task completions with timestamps and documentation. Submit with confidence and reduce the time between work completed and payment received.',
  },
  {
    icon: WifiOff,
    title: 'Offline-First',
    desc: 'No cell service on site? Work continues uninterrupted. Every update is captured locally and syncs automatically the moment connectivity returns. Your data integrity is never compromised by jobsite conditions.',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    desc: 'Multi-factor authentication, role-based access controls, and session management built for projects of any scale. Your project data is protected with enterprise-grade security that requires zero effort from field teams.',
  },
]

export default function FeatureGrid() {
  return (
    <section className="lp-features" id="features">
      <div className="lp-features-label">Built for Construction Teams</div>
      <h2 className="lp-features-heading">The visibility and control your projects demand</h2>
      <p className="lp-features-desc">
        Miscommunication between the field and the office is the most expensive problem in construction.
        Delayed updates lead to inaccurate billing. Unverified progress holds up draw requests. Critical decisions get made on outdated information.
        FieldSync was purpose-built to solve these problems — giving project managers, owners, and superintendents the tools to run projects with full transparency.
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
