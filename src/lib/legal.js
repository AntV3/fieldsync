/**
 * Legal settings shown in the Terms of Service, Privacy Policy and the
 * agreement checkbox. Change them here, in one place.
 *
 * OWNER TO CONFIRM before public launch (see docs/LEGAL_REVIEW.md):
 *   - LEGAL_ENTITY: the registered name of the business that runs FieldSync
 *   - GOVERNING_STATE and VENUE: the state whose law applies and where disputes go
 *   - the three contact addresses must be real, monitored inboxes
 *
 * Bump TERMS_VERSION / PRIVACY_VERSION (and the effective dates) whenever the
 * text changes in substance. The version a user agreed to is stored on their
 * account when they sign up.
 */
export const LEGAL = {
  PRODUCT: 'FieldSync',
  LEGAL_ENTITY: 'FieldSync',
  GOVERNING_STATE: 'Delaware',
  VENUE: 'the state or federal courts located in Delaware',
  CONTACT_LEGAL: 'legal@fieldsync.com',
  CONTACT_PRIVACY: 'privacy@fieldsync.com',
  CONTACT_SECURITY: 'security@fieldsync.com',
  TERMS_VERSION: '2026-11-12',
  TERMS_EFFECTIVE: 'November 12, 2026',
  PRIVACY_VERSION: '2026-11-12',
  PRIVACY_EFFECTIVE: 'November 12, 2026'
}

/** Stored on the auth user (user_metadata) when they agree. */
export function termsAcceptanceMetadata() {
  return {
    terms_version: LEGAL.TERMS_VERSION,
    privacy_version: LEGAL.PRIVACY_VERSION,
    terms_accepted_at: new Date().toISOString()
  }
}

/**
 * Record agreement on an account that already exists (the sign-up form fell
 * back to signing in). Never blocks sign-up: a failure is only logged.
 */
export async function recordTermsAcceptance(supabase) {
  try {
    const { error } = await supabase.auth.updateUser({ data: termsAcceptanceMetadata() })
    if (error) console.warn('Could not record terms acceptance:', error.message)
  } catch (err) {
    console.warn('Could not record terms acceptance:', err)
  }
}
