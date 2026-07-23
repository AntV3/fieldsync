import { useEffect, useState } from 'react'
import { AlertCircle, ArrowRight, X } from 'lucide-react'

const dismissKey = (projectId) => `fieldsync-approvals-banner-dismissed:${projectId}`

/**
 * PendingApprovalsBanner - Persistent (but dismissable) amber banner shown
 * below the project header whenever T&M tickets or CORs are waiting for
 * approval. Dismissal remembers the count it was dismissed at, so the
 * banner comes back the moment MORE items arrive.
 */
export default function PendingApprovalsBanner({ projectId, pendingCount, onView }) {
  const [dismissedAt, setDismissedAt] = useState(() => {
    try {
      const raw = sessionStorage.getItem(dismissKey(projectId))
      return raw === null ? -1 : parseInt(raw, 10)
    } catch (_e) {
      return -1
    }
  })

  // Re-read dismissal state when switching projects
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(dismissKey(projectId))
      setDismissedAt(raw === null ? -1 : parseInt(raw, 10))
    } catch (_e) {
      setDismissedAt(-1)
    }
  }, [projectId])

  if (!pendingCount || pendingCount <= dismissedAt) return null

  const handleDismiss = () => {
    setDismissedAt(pendingCount)
    try {
      sessionStorage.setItem(dismissKey(projectId), String(pendingCount))
    } catch (_e) { /* ignore */ }
  }

  return (
    <div className="pv-approvals-banner" role="status" aria-live="polite">
      <AlertCircle size={17} className="pv-approvals-banner-icon" aria-hidden="true" />
      <span className="pv-approvals-banner-text">
        You have <strong>{pendingCount}</strong> item{pendingCount !== 1 ? 's' : ''} waiting for approval
      </span>
      <button className="pv-approvals-banner-cta" onClick={onView}>
        View &amp; Approve
        <ArrowRight size={14} aria-hidden="true" />
      </button>
      <button
        className="pv-approvals-banner-dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss approvals banner"
        title="Dismiss"
      >
        <X size={15} />
      </button>
    </div>
  )
}
