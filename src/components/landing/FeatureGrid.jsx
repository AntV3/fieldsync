import { FileText, Clock, Camera, PenTool, WifiOff, Shield } from 'lucide-react'

const FEATURES = [
  {
    icon: FileText,
    title: 'Time and Material Tickets',
    desc: 'Field crews create Time and Material tickets on the spot — logging descriptions, crew hours, materials used, and photos. Everything flows to the office instantly. No paperwork, no delays, no lost documentation.',
  },
  {
    icon: Clock,
    title: 'Real-Time Field Logging',
    desc: 'Descriptions, crew hours, materials, and equipment are logged as work happens. Each entry is timestamped and geotagged so there\'s never a dispute about what work was performed, when, or by whom.',
  },
  {
    icon: Camera,
    title: 'Photo Documentation',
    desc: 'Attach timestamped, geotagged photos directly to Time and Material tickets. Visual proof of conditions, work performed, and materials used — captured in the moment and linked to the right record automatically.',
  },
  {
    icon: PenTool,
    title: 'Digital Signatures',
    desc: 'Capture GC and owner signatures on Time and Material tickets right from the field. Signed approvals are logged with timestamp and location so every authorization is defensible and audit-ready.',
  },
  {
    icon: WifiOff,
    title: 'Offline-First',
    desc: 'No cell service on site? Time and Material tickets are captured locally and sync automatically the moment connectivity returns. Your crews never miss documenting extra work because of jobsite conditions.',
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
      <div className="lp-features-label">Real-Time Oversight on Every Project</div>
      <h2 className="lp-features-heading">Field logs the work. Office sees it instantly.</h2>
      <p className="lp-features-desc">
        Extra work happens on every project. The difference is whether it gets documented.
        FieldSync gives your field crews the tools to log descriptions, photos, crew hours, and materials — while giving your office real-time visibility and the data they need for cost estimates and Change Orders.
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
