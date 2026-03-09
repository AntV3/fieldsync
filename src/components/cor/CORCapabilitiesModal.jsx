import { DollarSign, Calculator, FileInput, GitPullRequestArrow, FileText } from 'lucide-react'
import Modal from '../ui/Modal'

const sections = [
  {
    icon: DollarSign,
    title: 'Full Cost Breakdown',
    desc: 'Track labor, materials, equipment, and subcontractor costs with per-unit rates, quantities, and automatic totals.'
  },
  {
    icon: Calculator,
    title: 'Markup & Fees',
    desc: 'Apply configurable markup percentages for labor, materials, equipment, subcontractors, liability insurance, bond, and license fees.'
  },
  {
    icon: FileInput,
    title: 'Import from T&M Tickets',
    desc: 'Pull crew hours and materials directly from field T&M tickets to use as backup documentation for your change order.'
  },
  {
    icon: GitPullRequestArrow,
    title: 'Approval Workflow',
    desc: 'Move through Draft, Pending Approval, Approved, Billed, and Closed stages with GC signature capture for formal sign-off.'
  },
  {
    icon: FileText,
    title: 'PDF Export',
    desc: 'Generate professional change order documents with full cost breakdowns, ready for client review and submission.'
  }
]

export default function CORCapabilitiesModal({ isOpen, onClose }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Change Order Capabilities" size="medium">
      <p className="capabilities-intro">
        Change Order Requests (CORs) let your office team build detailed, defensible change orders backed by real field data.
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
