const CAPABILITIES = [
  'Real-Time Field Sync',
  'One-Tap COR Creation',
  'T&M Ticket Tracking',
  'Photo & Signature Capture',
  'Live Change Orders',
  'Instant Daily Reports',
  'Dispute-Proof Documentation',
  'Offline-First Architecture',
  'Install as Native App',
  'MFA + Role-Based Security',
  'Automated Crew Check-in',
  'Timestamped Photo Logs',
  'Equipment Tracking',
  'Punch List Management',
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
