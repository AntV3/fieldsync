/**
 * Field Session Management
 *
 * Field workers authenticate via PIN and receive a session token.
 * This token must be included in all subsequent requests.
 *
 * By default a session lives in sessionStorage (cleared on tab close).
 * If the foreman opts in to "Remember me on this device", the session is
 * written to localStorage with an expiration so they skip company code +
 * PIN entry on the next visit.
 */

import { createClient } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured, supabaseUrl, supabaseAnonKey } from './supabaseClient'

const FIELD_SESSION_KEY = 'fieldsync_field_session'
const REMEMBER_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

// Store field session data in memory
let fieldSessionData = null

const safeGet = (storage) => {
  try { return storage.getItem(FIELD_SESSION_KEY) } catch (_e) { return null }
}
const safeSet = (storage, value) => {
  try { storage.setItem(FIELD_SESSION_KEY, value) } catch (_e) { /* ignore */ }
}
const safeRemove = (storage) => {
  try { storage.removeItem(FIELD_SESSION_KEY) } catch (_e) { /* ignore */ }
}

const isExpired = (session) => {
  if (!session?.expiresAt) return false
  const ts = Date.parse(session.expiresAt)
  if (Number.isNaN(ts)) return false
  return Date.now() > ts
}

const readSession = (storage) => {
  const raw = safeGet(storage)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (isExpired(parsed)) {
      safeRemove(storage)
      return null
    }
    return parsed
  } catch (_e) {
    return null
  }
}

/**
 * Get stored field session from memory, sessionStorage, or localStorage.
 *
 * Lookup order (first match wins):
 *   1. in-memory cache
 *   2. sessionStorage (current-tab session)
 *   3. localStorage (remember-me session, scoped by expiration)
 *
 * @returns {Object|null} Session data with token, projectId, companyId
 */
export const getFieldSession = () => {
  if (fieldSessionData && !isExpired(fieldSessionData)) return fieldSessionData
  if (fieldSessionData && isExpired(fieldSessionData)) fieldSessionData = null

  if (typeof window === 'undefined') return null

  const sessionScoped = readSession(window.sessionStorage)
  if (sessionScoped) {
    fieldSessionData = sessionScoped
    return sessionScoped
  }

  const remembered = readSession(window.localStorage)
  if (remembered) {
    fieldSessionData = remembered
    return remembered
  }

  return null
}

/**
 * Save field session to memory and storage.
 *
 * @param {Object|null} session - Session data to save (null clears all storage)
 * @param {Object} [options]
 * @param {boolean} [options.remember=false] - Persist to localStorage with
 *   an expiration so the foreman doesn't have to re-enter company code + PIN
 *   on subsequent visits. When false (default), behaves like before and
 *   stores the session in sessionStorage only.
 */
export const setFieldSession = (session, options = {}) => {
  if (typeof window === 'undefined') {
    fieldSessionData = session
    return
  }

  // Always start clean to avoid mismatched state across storages.
  safeRemove(window.sessionStorage)
  safeRemove(window.localStorage)

  if (!session) {
    fieldSessionData = null
    return
  }

  const remember = Boolean(options.remember)
  const enriched = remember
    ? {
        ...session,
        remembered: true,
        expiresAt: session.expiresAt
          || new Date(Date.now() + REMEMBER_DURATION_MS).toISOString()
      }
    : session

  fieldSessionData = enriched
  const serialized = JSON.stringify(enriched)
  if (remember) {
    safeSet(window.localStorage, serialized)
  } else {
    safeSet(window.sessionStorage, serialized)
  }
}

/**
 * Whether the current (or persisted) session was opted in to remember-me.
 * @returns {boolean}
 */
export const isRememberedSession = () => {
  const s = getFieldSession()
  return Boolean(s?.remembered)
}

/**
 * Clear field session (logout)
 * Invalidates session on server and clears local storage
 */
export const clearFieldSession = async () => {
  const session = getFieldSession()
  if (session?.token && isSupabaseConfigured) {
    // Invalidate on server
    try {
      await supabase.rpc('invalidate_field_session', { p_session_token: session.token })
    } catch (_e) {
      // Ignore errors during logout
    }
  }
  // Clear cached client to prevent stale token usage after logout
  fieldClient = null
  setFieldSession(null)
}

// Cached field client with session header
let fieldClient = null

/**
 * Get Supabase client with field session header
 * Creates client lazily and caches it
 * @returns {Object} Supabase client
 */
export const getFieldClient = () => {
  const session = getFieldSession()
  if (!session?.token || !isSupabaseConfigured) return supabase

  // Create client with session header if not already created or token changed
  if (!fieldClient || fieldClient._sessionToken !== session.token) {
    fieldClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          'x-field-session': session.token
        }
      },
      realtime: {
        params: { eventsPerSecond: 0 }
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        storageKey: 'fieldsync-field-auth-token'
      }
    })
    fieldClient._sessionToken = session.token
  }

  return fieldClient
}

/**
 * Get the appropriate Supabase client for the current context
 * Returns field client if in field mode, otherwise regular client
 * @returns {Object} Supabase client
 */
export const getSupabaseClient = () => {
  const session = getFieldSession()
  return session?.token ? getFieldClient() : supabase
}

/**
 * Internal function to get client for db methods
 * Returns null if Supabase is not configured (demo mode)
 * @returns {Object|null} Supabase client
 */
export const getClient = () => {
  if (!isSupabaseConfigured) return null
  const session = getFieldSession()
  return session?.token ? getFieldClient() : supabase
}

/**
 * Check if currently in field mode with valid session
 * @returns {boolean}
 */
export const isFieldMode = () => {
  const session = getFieldSession()
  return Boolean(session?.token && session?.projectId)
}

/**
 * Get current field project ID
 * @returns {string|null}
 */
export const getFieldProjectId = () => {
  const session = getFieldSession()
  return session?.projectId || null
}

/**
 * Get current field company ID
 * @returns {string|null}
 */
export const getFieldCompanyId = () => {
  const session = getFieldSession()
  return session?.companyId || null
}

export default {
  getFieldSession,
  setFieldSession,
  clearFieldSession,
  getFieldClient,
  getSupabaseClient,
  getClient,
  isFieldMode,
  isRememberedSession,
  getFieldProjectId,
  getFieldCompanyId
}
