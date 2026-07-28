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

  // If pendingCount drops below the dismissed threshold, follow it down so
  // any subsequent uptick re-surfaces the banner. Without this the banner
  // would stay hidden forever after the user worked the queue to zero:
  // dismissed at 5 → approve all 5 (count 0) → a new item lands (count 1) →
  // `1 <= 5` still hides it.
  //
  // We read the stored floor directly from sessionStorage rather than the
  // `dismissedAt` state, so we don't race the project-change effect above
  // and clobber its fresh read with a stale closure from the previous
  // project.
  useEffect(() => {
    if (typeof pendingCount !== 'number') return
    let stored = -1
    try {
      const raw = sessionStorage.getItem(dismissKey(projectId))
      if (raw !== null) stored = parseInt(raw, 10)
    } catch (_e) { /* fall through with -1 */ }
    if (pendingCount < stored) {
      setDismissedAt(pendingCount)
      try {
        sessionStorage.setItem(dismissKey(projectId), String(pendingCount))
      } catch (_e) { /* ignore */ }
    }
  }, [pendingCount, projectId])

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
