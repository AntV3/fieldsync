const ONBOARDING_COMPLETE_KEY = 'fieldsync-onboarding-complete'

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
