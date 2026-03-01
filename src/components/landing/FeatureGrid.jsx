import { RefreshCw, Smartphone, ToggleRight, DollarSign, WifiOff, TrendingUp } from 'lucide-react'

const FEATURES = [
  {
    icon: RefreshCw,
    title: 'Leading, Not Lagging Data',
    desc: 'Traditional tools give you yesterday\'s numbers. FieldSync gives you right-now data — the leading indicators you need to make decisions before problems become costly.',
  },
  {
    icon: Smartphone,
    title: 'One-Tap Updates',
    desc: 'Your crews tap once, and the office sees it live. Simple enough for anyone on the jobsite — powerful enough to drive real-time decisions in the back office.',
  },
  {
    icon: ToggleRight,
    title: 'Binary Progress',
    desc: 'Working or Done. No subjective percentages that mean nothing in a billing dispute. Every status is clear, timestamped, and defensible.',
  },
  {
    icon: DollarSign,
    title: 'Faster Change Order Payments',
    desc: 'Change orders used to take days or weeks to document and approve. With real-time field data and timestamped records, turnaround drops from weeks to hours. Get paid faster.',
  },
  {
    icon: WifiOff,
    title: 'Offline-First',
    desc: 'No signal on the jobsite? No problem. Your crews keep working, and FieldSync syncs everything back the moment connectivity returns.',
  },
  {
    icon: TrendingUp,
    title: 'Real-Time Decision Making',
    desc: 'Stop waiting until the end of the day — or week — to find out what happened on the jobsite. See progress as it happens so you can act on it while it still matters.',
  },
]

export default function FeatureGrid() {
  return (
    <section className="lp-features" id="features">
      <div className="lp-features-label">Why Teams Switch to FieldSync</div>
      <h2 className="lp-features-heading">Real-time data from the field — not last week's news</h2>
      <p className="lp-features-desc">
        Most contractors are making decisions based on data that's already a day
        or a week old. FieldSync gives you leading indicators straight from the
        field so you can act now — not react later.
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
