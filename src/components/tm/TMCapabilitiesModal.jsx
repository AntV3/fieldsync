import { ListChecks, Camera, Users, PenLine, WifiOff, Globe } from 'lucide-react'
import Modal from '../ui/Modal'

const sections = [
  {
    icon: ListChecks,
    title: 'Step-by-Step Entry',
    desc: 'Guided 4-step wizard walks crews through Work Details, Crew Hours, Materials, and Review — no training needed.'
  },
  {
    icon: Camera,
    title: 'Photo Documentation',
    desc: 'Attach up to 20 job photos per ticket with automatic GPS tagging and image compression.'
  },
  {
    icon: Users,
    title: 'Crew Tracking',
    desc: 'Log supervision, operators, and laborers with regular and overtime hours. Batch-apply hours across the whole crew.'
  },
  {
    icon: PenLine,
    title: 'Signature Capture',
    desc: 'Collect foreman and client signatures on-site for verified, dispute-proof records.'
  },
  {
    icon: WifiOff,
    title: 'Offline Ready',
    desc: 'Create tickets without cell service or Wi-Fi. Everything auto-syncs the moment connectivity returns.'
  },
  {
    icon: Globe,
    title: 'Bilingual Support',
    desc: 'Full English and Spanish toggle so every crew member can work in their preferred language.'
  }
]

export default function TMCapabilitiesModal({ isOpen, onClose }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="T&M Ticket Capabilities" size="medium">
      <p className="capabilities-intro">
        Time & Materials tickets let field crews document work as it happens — hours, materials, and photos — right from their phone.
      </p>
      <div className="capabilities-list">
        {sections.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="capabilities-section">
            <div className="capabilities-icon">
              <Icon size={18} />
            </div>
            <div className="capabilities-text">
              <h4>{title}</h4>
              <p>{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
