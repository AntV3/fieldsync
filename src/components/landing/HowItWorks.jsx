import { HardHat, FileText, CheckCircle, DollarSign } from 'lucide-react'

const STEPS = [
  {
    icon: HardHat,
    number: '01',
    title: 'Extra Work Happens',
    desc: 'A GC directs additional scope, or unforeseen conditions require T&M work. Your superintendent is on site and ready to document it.',
  },
  {
    icon: FileText,
    number: '02',
    title: 'Create a COR or T&M Ticket',
    desc: 'In under a minute, your crew logs the work — description, crew hours, materials, photos, and cost estimate. Everything is timestamped and geotagged.',
  },
  {
    icon: CheckCircle,
    number: '03',
    title: 'Get It Signed & Approved',
    desc: 'Capture a digital signature from the GC or owner right on site. The signed COR or T&M ticket syncs to the office instantly for review.',
  },
  {
    icon: DollarSign,
    number: '04',
    title: 'Bill with Confidence',
    desc: 'Every COR and T&M ticket is fully documented with photos, signatures, timestamps, and location data. No disputes, no lost revenue — just billable work, backed by proof.',
  },
]

export default function HowItWorks() {
  return (
    <section className="lp-how-it-works" id="how-it-works">
      <div className="lp-how-label">Simple by Design</div>
      <h2 className="lp-how-heading">How it works</h2>
      <p className="lp-how-desc">
        From extra work in the field to approved, billable documentation — in four steps.
      </p>

      <div className="lp-how-steps">
        {STEPS.map((step, i) => (
          <div className="lp-how-step lp-animate" key={i} style={{ transitionDelay: `${i * 0.1}s` }}>
            <div className="lp-how-step-number">{step.number}</div>
            <div className="lp-how-step-icon">
              <step.icon size={22} />
            </div>
            <h3 className="lp-how-step-title">{step.title}</h3>
            <p className="lp-how-step-desc">{step.desc}</p>
            {i < STEPS.length - 1 && <div className="lp-how-step-connector" />}
          </div>
        ))}
      </div>
    </section>
  )
}
