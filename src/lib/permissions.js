/**
 * Member permissions.
 *
 * A company administrator (or the owner) grants each member what they may
 * do in the ticket-to-change-order pipeline. Administrators always hold
 * every permission. The database enforces the same rules
 * (has_company_permission and the approval guards); this only drives the UI.
 */

export const PERMISSIONS = Object.freeze([
  {
    key: 'canApproveTickets',
    column: 'can_approve_tickets',
    label: 'Approve tickets',
    description: 'Approve or reject T&M tickets the client has signed'
  },
  {
    key: 'canSendCORs',
    column: 'can_send_cors',
    label: 'Send change orders',
    description: 'Submit a change order and send it to the client for signature'
  },
  {
    key: 'canSignForForeman',
    column: 'can_sign_for_foreman',
    label: 'Sign for a foreman',
    description: 'Sign a ticket the office entered on a foreman\'s behalf'
  },
  {
    key: 'canManageClientAccess',
    column: 'can_manage_client_access',
    label: 'Manage client access',
    description: 'Invite and remove client contacts on a project'
  }
])

const all = (value) => Object.fromEntries(PERMISSIONS.map(p => [p.key, value]))

/** Everything allowed. Used for administrators and where no provider is mounted. */
export const ALL_PERMISSIONS = Object.freeze({ ...all(true), enforced: false })

/**
 * @param {Object} options
 * @param {boolean} options.isAdmin - administrator or company owner
 * @param {Object|null|undefined} options.row - the member's user_companies
 *   permission columns; null when the database does not have them yet, in
 *   which case nothing is restricted (the rules are not in force)
 * @returns {{ canApproveTickets, canSendCORs, canSignForForeman,
 *   canManageClientAccess, enforced: boolean }}
 */
export function resolvePermissions({ isAdmin = false, row = null } = {}) {
  if (!row) return ALL_PERMISSIONS
  if (isAdmin) return { ...all(true), enforced: true }
  return {
    ...Object.fromEntries(PERMISSIONS.map(p => [p.key, row[p.column] === true])),
    enforced: true
  }
}

export const PERMISSION_DENIED_HINT = 'Ask a company administrator for this permission.'

/**
 * The database refuses with a plain-language message (SQLSTATE 42501 or
 * P0001). Show that instead of a generic error when there is one.
 */
export function guardMessage(error, fallback) {
  const code = error?.code
  if ((code === '42501' || code === 'P0001') && error?.message) return error.message
  return fallback
}
