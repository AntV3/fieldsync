const CAPABILITIES = [
  'Real-Time Sync',
  'One-Tap Updates',
  'T&M Tickets',
  'Daily Reports',
  'Change Orders',
  'Equipment Tracking',
  'Binary Progress',
  'Offline-First',
  'PWA Install',
  'MFA Security',
  'Crew Check-in',
  'Defensible Billing',
  'Photo Timeline',
  'Punch Lists',
]

export default function CapabilityStrip() {
  return (
    <div className="lp-capability-strip">
      <div className="lp-capability-track" aria-hidden="true">
        {/* Duplicate the list for seamless infinite scroll */}
        {[...CAPABILITIES, ...CAPABILITIES].map((cap, i) => (
          <span className="lp-capability-tag" key={i}>{cap}</span>
        ))}
      </div>
    </div>
  )
}
