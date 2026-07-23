/**
 * StatusBadge - single source of truth for workflow status pills.
 *
 * Renders a consistent pill (4px 12px padding, 12px text, full round) with
 * the brand status colors:
 *   blue    = in progress (working, open, billed)
 *   green   = positive (done, approved, on track, answered, paid)
 *   amber   = needs attention (pending, submitted, under review)
 *   red     = negative (rejected, behind, overdue)
 *   gray    = inactive (not started, draft, closed, void)
 *
 * Usage:
 *   <StatusBadge status="pending_approval" />
 *   <StatusBadge status="behind" label="3% behind" />
 *   <StatusBadge status={ticket.status} variant="danger" />
 */

const STATUS_VARIANTS = {
  // Area / task progress
  working: 'info',
  in_progress: 'info',
  done: 'success',
  complete: 'success',
  completed: 'success',
  not_started: 'neutral',

  // Approval workflows (COR, T&M tickets, submittals, invoices, reports)
  draft: 'neutral',
  pending: 'warning',
  pending_approval: 'warning',
  submitted: 'warning',
  under_review: 'warning',
  revise_resubmit: 'warning',
  approved: 'success',
  approved_as_noted: 'success',
  rejected: 'danger',
  billed: 'info',
  paid: 'success',
  partial: 'warning',
  void: 'neutral',
  closed: 'neutral',
  reviewed: 'success',

  // RFIs
  open: 'info',
  answered: 'success',

  // Signatures
  foreman_signed: 'info',
  signed: 'success',

  // Schedule health
  on_track: 'success',
  ahead: 'success',
  behind: 'danger',
  overdue: 'danger',
  at_risk: 'warning',

  // Sharing / links
  revoked: 'danger',
  expired: 'neutral',
}

const STATUS_LABELS = {
  not_started: 'Not Started',
  pending_approval: 'Pending Approval',
  under_review: 'Under Review',
  approved_as_noted: 'Approved as Noted',
  revise_resubmit: 'Revise & Resubmit',
  on_track: 'On Track',
  at_risk: 'At Risk',
  in_progress: 'In Progress',
}

function titleCase(key) {
  return key.replace(/_+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function StatusBadge({
  status,
  label,
  variant,
  pulse,
  className = '',
  ...rest
}) {
  const key = String(status ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const resolvedVariant = variant || STATUS_VARIANTS[key] || 'neutral'
  const resolvedLabel = label ?? (STATUS_LABELS[key] || titleCase(key))
  // Pending states pulse softly to draw attention unless explicitly disabled
  const shouldPulse = pulse ?? (key === 'pending' || key === 'pending_approval')

  const classes = [
    'status-badge',
    `status-badge--${resolvedVariant}`,
    shouldPulse ? 'status-badge--pulse' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <span className={classes} {...rest}>
      {resolvedLabel}
    </span>
  )
}
