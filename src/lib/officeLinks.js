/**
 * Office deep links.
 *
 * A link that opens the office dashboard on one project and, optionally, on
 * a specific place in it:
 *   /dashboard?project=<id>&view=review
 *   /dashboard?project=<id>&view=cors&filter=pending_approval
 *   /dashboard?project=<id>&cor=<id>
 * Used by in-app notices today, and by emails and push later.
 */

export const OFFICE_VIEWS = Object.freeze(['review', 'tickets', 'cors'])
export const COR_LINK_FILTERS = Object.freeze(['draft', 'pending_approval'])

const PENDING_LINK_KEY = 'fieldsync-pending-office-link'
const ID_PATTERN = /^[0-9a-zA-Z-]{1,64}$/
const cleanId = (value) => (typeof value === 'string' && ID_PATTERN.test(value) ? value : null)

/** @returns {string} path + query for the office dashboard */
export function buildOfficeLink({ projectId, view, corId, filter } = {}) {
  const params = new URLSearchParams()
  if (cleanId(projectId)) params.set('project', projectId)
  if (OFFICE_VIEWS.includes(view)) params.set('view', view)
  if (cleanId(corId)) params.set('cor', corId)
  if (COR_LINK_FILTERS.includes(filter)) params.set('filter', filter)
  const query = params.toString()
  return query ? `/dashboard?${query}` : '/dashboard'
}

/**
 * @param {string} search - location.search (with or without the leading ?)
 * @returns {{ projectId: string, view: string|null, corId: string|null, filter: string|null } | null}
 *   null when the query names no project
 */
export function parseOfficeLink(search) {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''))
  const projectId = cleanId(params.get('project'))
  if (!projectId) return null
  const view = params.get('view')
  const filter = params.get('filter')
  return {
    projectId,
    view: OFFICE_VIEWS.includes(view) ? view : null,
    corId: cleanId(params.get('cor')),
    filter: COR_LINK_FILTERS.includes(filter) ? filter : null
  }
}

/** Keep a link across the login / MFA redirect, which drops the query string. */
export function rememberOfficeLink(search) {
  if (!parseOfficeLink(search)) return
  try { sessionStorage.setItem(PENDING_LINK_KEY, String(search)) } catch (_e) { /* ignore */ }
}

/** Read and clear the remembered link (null when there is none). */
export function takeRememberedOfficeLink() {
  try {
    const search = sessionStorage.getItem(PENDING_LINK_KEY)
    if (search !== null) sessionStorage.removeItem(PENDING_LINK_KEY)
    return parseOfficeLink(search)
  } catch (_e) {
    return null
  }
}
