const CAPABILITIES = [
  'Real-Time Leading Data',
  'One-Tap Crew Updates',
  'Defensible Draw Requests',
  'Instant Daily Reports',
  'Faster Change Order Payments',
  'Equipment Tracking',
  'Dispute-Proof Progress',
  'Offline-First Architecture',
  'Install as Native App',
  'MFA + Role-Based Security',
  'Automated Crew Check-in',
  'Live Field-to-Office Sync',
  'Timestamped Photo Logs',
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
