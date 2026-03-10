export default function ContactsStep({ data, onChange }) {
  const update = (field, value) => onChange({ ...data, [field]: value })

  return (
    <div className="wizard-step-content">
      <div className="wizard-step-header">
        <h2>Contacts</h2>
        <p>Add contractor and client contact information.</p>
      </div>

      <div className="card">
        <h3 className="wizard-section-title">Contractor Contact</h3>

        <div className="form-row-2">
          <div className="form-group">
            <label>Contact Name</label>
            <input
              type="text"
              placeholder="e.g., John Smith"
              value={data.contractorContact}
              onChange={(e) => update('contractorContact', e.target.value)}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Position</label>
            <input
              type="text"
              placeholder="e.g., Project Manager"
              value={data.contractorPosition}
              onChange={(e) => update('contractorPosition', e.target.value)}
            />
          </div>
        </div>

        <div className="form-row-2">
          <div className="form-group">
            <label>Phone</label>
            <input
              type="tel"
              placeholder="e.g., (555) 123-4567"
              value={data.contractorPhone}
              onChange={(e) => update('contractorPhone', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              placeholder="e.g., john@contractor.com"
              value={data.contractorEmail}
              onChange={(e) => update('contractorEmail', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="wizard-section-title">Client Contact</h3>

        <div className="form-row-2">
          <div className="form-group">
            <label>Contact Name</label>
            <input
              type="text"
              placeholder="e.g., Jane Doe"
              value={data.clientContact}
              onChange={(e) => update('clientContact', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Position</label>
            <input
              type="text"
              placeholder="e.g., Owner Representative"
              value={data.clientPosition}
              onChange={(e) => update('clientPosition', e.target.value)}
            />
          </div>
        </div>

        <div className="form-row-2">
          <div className="form-group">
            <label>Phone</label>
            <input
              type="tel"
              placeholder="e.g., (555) 987-6543"
              value={data.clientPhone}
              onChange={(e) => update('clientPhone', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              placeholder="e.g., jane@client.com"
              value={data.clientEmail}
              onChange={(e) => update('clientEmail', e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
