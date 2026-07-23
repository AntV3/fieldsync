const ONBOARDING_COMPLETE_KEY = 'fieldsync-onboarding-complete'
const PROJECT_TOUR_COMPLETE_KEY = 'fieldsync-project-tour-complete'
const PENDING_PROJECT_TOUR_KEY = 'fieldsync-pending-project-tour'

/**
 * Check if onboarding has been completed.
 */
export function isOnboardingComplete() {
  return localStorage.getItem(ONBOARDING_COMPLETE_KEY) === 'true'
}

/**
 * Mark onboarding as complete.
 */
export function completeOnboarding() {
  localStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true')
}

/**
 * Check if the post-project-creation tour has been completed.
 */
export function isProjectTourComplete() {
  return localStorage.getItem(PROJECT_TOUR_COMPLETE_KEY) === 'true'
}

/**
 * Mark the post-project-creation tour as complete so it only shows once.
 */
export function completeProjectTour() {
  localStorage.setItem(PROJECT_TOUR_COMPLETE_KEY, 'true')
}

/**
 * Queue the guided tour for the project that was just created. The setup
 * wizard writes this right before navigating back to the dashboard, which
 * consumes it on mount. sessionStorage on purpose: the handoff should not
 * outlive the browser session.
 */
export function setPendingProjectTour({ projectId, pin }) {
  try {
    sessionStorage.setItem(PENDING_PROJECT_TOUR_KEY, JSON.stringify({ projectId, pin }))
  } catch (_e) { /* storage full/blocked — tour is skippable */ }
}

/**
 * Read-and-clear the pending tour handoff. Returns null when there is no
 * pending tour or the tour was already completed on this device.
 */
export function consumePendingProjectTour() {
  try {
    const raw = sessionStorage.getItem(PENDING_PROJECT_TOUR_KEY)
    if (!raw) return null
    sessionStorage.removeItem(PENDING_PROJECT_TOUR_KEY)
    if (isProjectTourComplete()) return null
    return JSON.parse(raw)
  } catch (_e) {
    return null
  }
}
