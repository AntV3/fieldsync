/**
 * FieldSync CSRF Protection Utility
 *
 * Provides client-side CSRF token management for forms and API requests.
 * Works alongside Supabase's built-in security to provide defense-in-depth.
 *
 * Usage:
 *   import { csrf } from './csrf'
 *
 *   // Generate token for a form
 *   const token = csrf.getToken()
 *
 *   // Include in form
 *   <input type="hidden" name="_csrf" value={token} />
 *
 *   // Include in fetch request
 *   fetch('/api/endpoint', {
 *     headers: csrf.getHeaders()
 *   })
 */

const CSRF_TOKEN_KEY = 'fs_csrf_token'
const CSRF_HEADER_NAME = 'X-CSRF-Token'
const TOKEN_LIFETIME = 30 * 60 * 1000 // 30 minutes

/**
 * Generate a cryptographically secure random token
 */
function generateToken() {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Get the current CSRF token, generating a new one if needed
 */
function getToken() {
  try {
    const stored = sessionStorage.getItem(CSRF_TOKEN_KEY)
    if (stored) {
      const { token, timestamp } = JSON.parse(stored)
      // Check if token is still valid
      if (Date.now() - timestamp < TOKEN_LIFETIME) {
        return token
      }
    }
  } catch {
    // Storage unavailable or corrupted, generate new token
  }

  // Generate and store new token
  const token = generateToken()
  try {
    sessionStorage.setItem(CSRF_TOKEN_KEY, JSON.stringify({
      token,
      timestamp: Date.now()
    }))
  } catch {
    // Storage unavailable, token will work for this session only
  }

  return token
}

/**
 * Get headers object for fetch requests
 */
function getHeaders() {
  return {
    [CSRF_HEADER_NAME]: getToken()
  }
}

/**
 * Validate a token format (client-side check)
 * Server should do real validation
 */
function validateToken(token) {
  if (!token || typeof token !== 'string') return false
  // Token should be 64 hex characters (32 bytes)
  return /^[a-f0-9]{64}$/i.test(token)
}

/**
 * Clear the stored token (e.g., on logout)
 */
function clearToken() {
  try {
    sessionStorage.removeItem(CSRF_TOKEN_KEY)
  } catch {
    // Storage unavailable
  }
}

/**
 * Rotate the token (generate a new one)
 */
function rotateToken() {
  clearToken()
  return getToken()
}

/**
 * Add CSRF token to a form data object
 */
function addToFormData(formData) {
  if (!(formData instanceof FormData)) {
    throw new Error('Expected FormData instance')
  }
  formData.append('_csrf', getToken())
  return formData
}

/**
 * Add CSRF token to a request body object
 */
function addToBody(body) {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Expected object body')
  }
  return {
    ...body,
    _csrf: getToken()
  }
}

/**
 * Create a fetch wrapper that automatically includes CSRF headers
 */
function createSecureFetch(baseFetch = fetch) {
  return (url, options = {}) => {
    const headers = {
      ...(options.headers || {}),
      ...getHeaders()
    }

    return baseFetch(url, {
      ...options,
      headers
    })
  }
}

/**
 * Double-submit cookie pattern helper
 * Sets the CSRF token as a cookie and returns it for header use
 */
function setupDoubleSubmit() {
  const token = getToken()

  // Set as cookie (httpOnly should be false for client-side reads)
  // In production, ensure Secure and SameSite=Strict flags
  document.cookie = `csrf_token=${token}; path=/; SameSite=Strict`

  return token
}

export const csrf = {
  getToken,
  getHeaders,
  validateToken,
  clearToken,
  rotateToken,
  addToFormData,
  addToBody,
  createSecureFetch,
  setupDoubleSubmit,
  HEADER_NAME: CSRF_HEADER_NAME
}

export default csrf
