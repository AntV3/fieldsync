import { FileText, Clock, Camera, PenTool, WifiOff, Shield } from 'lucide-react'

const FEATURES = [
  {
    icon: FileText,
    title: 'Instant COR Creation',
    desc: 'Field crews create Change Order Requests on the spot — description, scope, cost estimate, and supporting photos. CORs flow to the office instantly for review and approval. No paperwork, no delays, no lost revenue.',
  },
  {
    icon: Clock,
    title: 'T&M Ticket Tracking',
    desc: 'Log crew hours, materials, and equipment for every T&M event as it happens. Each ticket is timestamped and geotagged so there\'s never a dispute about what work was performed, when, or by whom.',
  },
  {
    icon: Camera,
    title: 'Photo Documentation',
    desc: 'Attach timestamped, geotagged photos directly to CORs and T&M tickets. Visual proof of conditions, work performed, and materials used — captured in the moment and linked to the right record automatically.',
  },
  {
    icon: PenTool,
    title: 'Digital Signatures',
    desc: 'Capture GC and owner signatures on CORs and T&M tickets right from the field. Signed approvals are logged with timestamp and location so every authorization is defensible and audit-ready.',
  },
  {
    icon: WifiOff,
    title: 'Offline-First',
    desc: 'No cell service on site? CORs and T&M tickets are captured locally and sync automatically the moment connectivity returns. Your crews never miss documenting extra work because of jobsite conditions.',
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
      <div className="lp-features-label">Built for Change Orders & T&M</div>
      <h2 className="lp-features-heading">Capture every dollar of extra work</h2>
      <p className="lp-features-desc">
        Extra work happens on every project. The difference is whether it gets documented and billed.
        FieldSync gives your field crews the tools to create CORs and T&amp;M tickets in seconds — with the documentation to back up every line item.
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
